# `extern function` — host imports declared in the program

**Status: RULED (owner, 2026-09-05) and PROTOTYPED.** The owner's words:

> "Externs should be enforced in terms of the invoker HAVING to implement them somehow. But
> I don't think they should have to be restricted to just one file or stated in a config or
> the build tool; they should automatically be picked up via compile/run etc."

The short version:

> **`extern function name(params): ret` may appear in ANY module, carries no body, and needs
> no flag.** The compiler collects every one into the wasm **import section**, and that IS the
> manifest — there is no second file to keep in step. Whoever instantiates the module must
> provide every import or instantiation fails naming what is missing. A `Buf`, a string or a
> list does not cross; scalars and a `(base, length)` pair into the exported `memory` do.

Consumer ask: `~/glean/docs/vl-requirements.md` R2, filed as VL-011 ("no host-function
imports… no way to read the clock, `performance.now()`, or a file from vl in the browser").

Precedent: Zig `extern fn`, Rust `extern "C" { fn … }`, AssemblyScript `declare function`,
C# `[DllImport]`. All four declare a signature with no body and leave the binding to the
loader; VL's loader is the wasm engine and its contract is the import section.

---

## 1. Syntax and placement

```vl
extern function nowMillis(): i64
extern function drawRect(x: i32, y: i32, w: i32, h: i32)
```

Module level, any module, no body, no generics. The declaration mints **no statement and no
AST node** — it is banked in a program-wide manifest (`ast.vl` `externAdd`) — because an
extern has nothing to run and no local index to occupy.

**An extern's name is a LINK name in one flat namespace, not a module-scoped binding.** That
is forced: the name is what the import section carries, so two modules cannot mean different
things by it. It is also the precedent's rule — a C `extern int foo;` in two translation
units names one object, which is why the idiom is to declare it in a header everyone includes.
Three consequences, each with a fixture:

| | |
| --- | --- |
| two modules, same signature | **one import**, no diagnostic (`tests/cases/extern/two-modules/`) |
| two modules, different signature | check error at the second declaration (`…/two-modules-disagree/`) |
| `export extern function …` | **refused**: the name is already visible everywhere, so `export` would read as a visibility rule that is not there (`…/error-export.vl`) |

That last one is the brief's open question answered the other way, and it is the one thing in
this document worth the owner's confirmation. Re-exporting an extern as a wasm *export* (a
host calling back through a shim) is a real and separate feature; refusing the spelling now
keeps it available later, which admitting a no-op keyword would not.

A `function` of a declared extern's name is refused for the reason the fs floor is
(`…/error-redefine.vl`): `emitCall` routes the call to the import before it looks up any
declaration, so the body would be emitted and never reached.

## 2. Types that may cross

**`i32`, `i64`, `f32`, `f64`, `boolean`** as parameters and as the return; **no return
annotation is a void import**, not a missing one. Everything else is a check error naming the
workaround:

```
extern `logLine` takes `string`, which cannot cross a host boundary — an extern carries
i32, i64, f32, f64 and boolean only; pass bytes as a `Buf`'s `base` and `length` (two
i32s) and read them through the module's exported `memory`
```

`boolean` is an i32 at the boundary (0 or 1) and nothing else; that is its whole ABI.

**The brief's premise — "WasmGC references cannot cross a host boundary usefully" — is false
of one host and true of the other, and that asymmetry is the reason for the rule.** Measured:

- **wasmtime CAN.** `__fs_read__` takes and returns a `u8[]`, which is a `{(ref array i8),
  i32, i32}` GC struct, and `scripts/vl-host/src/main.rs` reads and builds it (`read_u8_list`
  / `make_u8_list`) through wasmtime's GC API. Nine fs intrinsics cross that way today.
- **A browser CANNOT.** `tests/support/runWasm.ts` records the measurement against V8
  14.9.207.2: a `(array (mut i8))` handed to a JS import is `typeof "object"` with
  `.length === undefined`, and JS can construct no WasmGC value at all — `null` is the only
  thing V8 accepts for a `(ref null $arr)` result, and VL's results are non-null.

An extern is written by an author targeting *some* host, usually a browser (that is R2's whole
motivation). Admitting `u8[]` would make a declaration that compiles and runs natively fail to
link in the browser it was written for. So the set is the intersection, and it is the set wasm
core types give you anyway.

**`Buf` is NOT a parameter type**, and does not need to be. `Buf` is `{base: i32, length: i32}`
(`std/buffer.vl`) — a GC struct describing an extent of LINEAR memory, and linear memory is
already shared with the host: since P0.2 the module exports it under the name `memory`
(`emit_sections.vl`, gated on `memUsed`). So the byte-payload convention is
`extern function blit(base: i32, len: i32)` called as `blit(b.base, b.length)`, and the host
reads `instance.exports.memory` at that offset. Two i32s, no marshalling, no copy — and it is
how a WebGPU or audio binding wants the data regardless.

## 3. The wasm import namespace

**Std's host floor stays under `imports`; user externs go under `extern`.**

```wat
(import "imports" "__print_i32__" (func $fimport$0 (param i32)))
(import "imports" "__fs_read__"   (func $fimport$6 (param (ref $16)) (result (ref $16))))
(import "extern"  "nowMillis"     (func $fimport$5 (result i64)))
```

A host can then serve the two families from different code with no name convention to police,
and a loader that wants to sandbox user externs can hand over one object. `tests/vl_extern_test.ts`
asserts that no `__`-prefixed name reaches the `extern` namespace.

**The import name is the VL name, unmangled.** It is the contract the author wrote and the
string the host's registry keys on; mangling it would put a compiler-internal spelling in a
user-facing table. (The module merge renames module-private declarations; externs are not
merged, because they were never module-scoped — §1.)

**Every DECLARED extern is imported, whether or not the program calls it.** That is the
manifest reading of the owner's ruling, and it matches what this tree already does: measured,
`import { readFile } from "std:fs"` emits **seven** fs imports, not one, because the use scan
walks the whole module graph's arena rather than a call graph. Externs trail the print family
and the fs block in the import section, so adding one moves no earlier import index.

One cost, stated: a program declaring an extern reserves the four-entry print family even if it
never prints, because the call lowering hardcodes indices 0..3 for that family. Every host
provides those already.

## 4. Who provides them

**(a) A browser loader passes an object under the `extern` key.** The shape, from
`playground/src/runtime.ts` (this repo's loader, now wired):

```js
await WebAssembly.instantiate(wasm, {
  extern: { nowMillis: () => BigInt(Date.now()) },
  imports: { /* the print family, memory, … */ },
});
```

Marshalling is the JS↔wasm default and needs no code: `i32`/`f32`/`f64` are JS numbers, **an
`i64` is a JS `BigInt` in both directions**, and a `boolean` arrives as `0`/`1` (return `1`,
not `true`). A missing name is a `LinkError` naming the module and field — which is the
enforcement, for free.

**(b) The native host keeps a registry.** `register_extern_imports` in
`scripts/vl-host/src/main.rs` walks the module's own import section, defines each known name
with the module's OWN `FuncType` (so a signature drift is a named refusal, never a wrong
answer at runtime), and refuses anything else:

```
extern function `frobnicate` is declared but this host does not provide it (`vl` implements: nowMillis)
```

**Exit code 1**, per `cli-design.md`'s table — "the program or its compilation failed". Not 2
(the command line parsed) and not 70 (nothing in the compiler crashed). The precedent is the
same shape: a `vl` predating #2535 refuses a `std:fs` program with `unknown import:
imports::__fs_read_range__`, exit 1. The refusal fires *before* instantiation so the message
names the function; wasmtime's own would name neither a source position nor a fix.

`nowMillis(): i64` is the first and only entry — milliseconds since the Unix epoch, from
`SystemTime`. It is glean's actual need. **`vl build` does not apply the registry**: a built
module is for whatever host will run it, and this list describes only the one embedded here.

**(c) `vl check` never needs a provider.** Checking a program does not instantiate it, so a
program declaring an extern no host implements checks clean and exits 0 — pinned in
`tests/vl_extern_test.ts`. This is what makes an extern declarable before anyone has written
the host half.

**(d) The LSP should NOT flag an extern the native host cannot provide.** Portable code targets
a browser, so "`vl` does not implement this" is not a defect in a program that will never run
under `vl`. A diagnostic there would fire on every correct WebGPU binding in the tree. The
place that knows is the host that is actually loading the module, and it already says so.

`scripts/wasmtime-host.rs` is the third host named in `concurrency-design.md` §8 and is
deliberately untouched: it is a retired spike in no build and no gate
(`docs/internals/perf-program.md`).

## 5. Could `std:fs` be written as externs?

**Not without changing the ABI, and the ABI is why not.** The nine fs intrinsics are declared
in `compiler/typecheck.vl` (`fsIntrinsicSlot` + `declare`) with `u8[]` in their signatures, and
`u8[]` is exactly the type §2 excludes. Spelled as externs they would have to become
`(base, len)` pairs over linear memory — which would be a *different* std:fs, one that could
not hand back a GC `u8[]` and could not exceed the 4 GiB linear-memory ceiling that
`readFileRange` exists to work around.

So the honest statement is narrower than "one mechanism, std uses it too":

- **The extern mechanism is a strict subset of the fs mechanism.** Both reserve an import
  index in `scanPrintUse`, append a standalone functype outside the rec group, write an import
  entry, and lower a call to `call <importIdx>`. The extern path reuses that shape line for
  line; only the type set and the namespace differ.
- **A scalar-only std floor could migrate today.** `__fs_errno__(): i32`, `__fs_stat__` if its
  path moved to a `Buf`, `__args_count__(): i32` — each is expressible as an extern with no ABI
  change. Nothing forces the move, and the gain is deletion of a slot table, not a capability.
- **Recommendation: do not migrate std in this PR**, and do not adopt "std is just externs" as
  a goal until a `u8[]`-carrying extern is either designed (a second, wasmtime-only type tier)
  or ruled out. The two families sharing an emitter shape is already most of the value.

---

## Residue

- **No `extern` in a browser can read a GC value.** Anything richer than scalars needs either
  the linear-memory convention (§2) or a JS-side type-reflection proposal that does not exist.
- **The registry is one entry.** A second host capability (`randomBytes`, `performanceNow` at
  microsecond resolution) is a one-arm change to `register_extern_imports` plus a line in each
  JS loader. Keep the three lists in step — the two JS loaders and the Rust registry — the way
  `concurrency-design.md` §8 says every import must.
- **No `extern const`, no `extern` globals, no `extern` memory or table imports.** Only
  functions, which is what the import section's other kinds would each need a design for.
