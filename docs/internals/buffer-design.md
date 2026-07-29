# `Buffer` and exported memory — the linear-memory tier

The design for **P0.1** (`Buffer`: allocation, the full load/store width matrix, bulk ops) and
**P0.2** (exporting the module's linear memory), the last two items gating webcraft's M7 port.
`docs/webcraft-requirements.md` §P0.1/§P0.2 is the consumer's ask; `ROADMAP.md` B-mem is our item;
`DECISIONS.md` ("no second, self-managed object model — linear memory stays ONE scoped tier") is the
constraint. Sibling docs: `memory-gc-design.md` §1.2 audits what is here, `numeric-intrinsics.md`
records how P0.3/P0.4 shipped and is the closest template.

This is a design pass. **No compiler source is touched by the change that carries this doc** — the
`compiler/*.vl` gate (`refresh-compiler.sh` / `native-fixpoint.sh` / `lint-self.sh`) therefore does
not apply and was deliberately not run; `deno task test` was, and passes (1492/0).

---

## A. What exists today, measured

Every claim below is a command that was run against a seed refreshed from `compiler/*.vl` at
master `5d40f22`. Header comments are not evidence — five have been refuted this arc, two of them
in this exact area.

### A1. Ten declared intrinsics; three lowered, seven dead

`compiler/typecheck.vl:1959-1969` `declare()`s ten memory intrinsics into the checker's global type
scope. Each was run as a standalone top-level program (VL does not auto-invoke `main()`):

| intrinsic | `vl check` | `vl run` | verdict |
| --- | --- | --- | --- |
| `__store_i32__(a, v)` | clean | `42` | **lowered** (`i32.store`) |
| `__load_i32__(a)` | clean | `0` | **lowered** (`i32.load`) |
| `__log__(off, len)` | clean | `7` | **lowered** (call to a synthetic in-module decoder) |
| `__store_i64__(a, v)` | clean | `emitProgram: call to unknown function` | dead |
| `__store_f32__(a, v)` | clean | `emitProgram: call to unknown function` | dead |
| `__store_f64__(a, v)` | clean | `emitProgram: call to unknown function` | dead |
| `__store_string__(a, s)` | clean | `emitProgram: call to unknown function` | dead |
| `__log_string__(a, n)` | clean | `emitProgram: call to unknown function` | dead |
| `__memory_grow__(pages)` | clean | `emitProgram: call to unknown function` | dead |
| `__memory_size__()` | clean | `emitProgram: call to unknown function` | dead |

All ten report `Checked 1 file, no errors.` — the split is invisible to `vl check` and appears only
at build. (`vl check --codegen` does surface it, with the same positionless message.)

**This refutes `docs/webcraft-requirements.md` §P0.1's "today: 4 store widths, 1 load width", and
`ROADMAP.md`'s copy of the same phrase.** There is **one** working store width and one working load
width. The "four" counts *declarations*: `memory-gc-design.md` §1.2 states the declared count and
the lowered count in adjacent bullets, and the requirements doc carried the first number without the
second.

The four-store-width world was real — in the **deleted TS compiler**. `compiler/wasmBuiltins.ts`
(at `f17e204e^`) added seven of them as actual wasm functions in the module: `i32.store`,
`i32.load`, `i64.store`, `f32.store`, `f64.store`, `memory.grow`, `memory.size`. The other three
(`__store_string__`, `__log_string__`, `__log__`) were host imports. Commit `f17e204e` ("kill-TS",
#466) deleted the file; the declarations in `typecheck.vl` are `defaultScope.ts` transcribed for
parity, and seven of them never acquired a native emitter arm. So the requirements doc's number was
accurate — about a compiler that no longer exists.

Worth noting for **O1**: the TS versions were real `call`s, not inlined ("TODO: These don't need to
be actual functions… but I think binaryen does that for us"). A per-access call was the historical
baseline here, not a regression the `Buffer` tier would introduce.

So the P0.1 gap is **12 of the 14 named load/store operations**, not 9 of 14.

### A2. The memory: one page, no max, unexported, usage-gated

`compiler/emit_sections.vl:1869-1882` emits the memory section only when `memUsed`, hardcoded to
`min 1` page and no maximum. `compiler/emit_sections.vl:3331-3378` emits the export section, and
every entry it writes is `wU8(0)` — export kind **function**. Measured on a module that both uses
memory and exports functions:

```
$ vl build mem_export.vl -o mem_export.wasm     # export function poke/peek over __store/__load_i32__
imports: []
exports: [{"name":"poke","kind":"function"},{"name":"peek","kind":"function"}]
memory section: count=1 flag=0x0 min=1 max=null
sections: 1:type(14) 3:function(3) 5:memory(3) 7:export(15) 10:code(23)
```

The memory exists and is **not exported**. The export section is also skipped entirely when the
program exports no functions (`if reExpNm.length == 0 { return 0 }`), which matters for P0.2: a
program whose only export is the memory currently emits no section 7 at all.

Both lowered ops hardcode align-exponent 2 (`fbI32Store`/`fbI32Load`, `compiler/emit_bytes.vl:508-522`).
The alignment immediate is a hint, not a constraint — an unaligned access is still correct:

```
$ cat unaligned.vl
__store_i32__(1, 0x01020304)
print(__load_i32__(1))   → 16909060   (0x01020304, correct at an odd address)
print(__load_i32__(0))   → 33752064   (0x02030400, the expected overlap)
```

A fresh memory is zero-filled with no data segment (`print(__load_i32__(0 | 4096 | 65532))` → `0 0 0`),
so a bump allocator that never reuses addresses gets webcraft's "zero-filled" requirement for free.

### A3. The scratch page, and its ceiling

The "program picks raw addresses, two users collide" phrasing is exact. Two independent helpers each
assuming they own offset 0:

```vl
function counterInit() { __store_i32__(0, 100) }
function counterBump() { __store_i32__(0, __load_i32__(0) + 1); 0 }
function loggerStage(v: i32) { __store_i32__(0, 0); __store_i32__(4, v); __log__(0, 8) }
counterInit(); counterBump(); loggerStage(7); counterBump()
print(__load_i32__(0))      // → 1, not 102
```

The ceiling is the sharper problem. One page is 64 KiB and there is no reachable `memory.grow`, so
**two 32 KiB buffers already trap**:

```
$ vl run two_buffers_64k.vl
memory fault at wasm address 0x1000c in linear memory of size 0x10000
wasm trap: out of bounds memory access
```

webcraft allocates "a few large Buffers at init". None of them fit. `memory.grow` is not an
optimization here — it is a prerequisite, and the requirements doc's "grows the one linear memory"
is precisely the missing half.

### A4. Bounds policy is already settled: the engine traps

webcraft says "engine memory trap or explicit check, either is fine". The engine trap is what
happens today, and it is clean and loud (the `oob.vl` probe above). Nothing needs designing here;
it needs *stating*, which P1.4 asks for.

### A5. `Buffer`'s shape is already expressible in VL — and an allocator already works

A struct holding `{base, length}`, a mutable module-level global as the bump pointer, UFCS methods
over the intrinsics, in an **imported module** (proving the emitter's `memUsed` scan sees calls in
merged modules):

```vl
// buf.vl
type Buf = { base: i32, length: i32 }
let bumpPtr = 16
export function Buffer(byteLength: i32): Buf { … }   // bump the global, zero-fill, return {base, length}
export function storeI32(self: Buf, off: i32, v: i32) {
  __store_i32__(self.base + off, v)
  0
}
export function loadI32(self: Buf, off: i32): i32 { __load_i32__(self.base + off) }
```

```
$ vl run bufmain.vl        # a.storeI32(0, 111) ; b.storeI32(0, 222)
64
111
222
```

Two buffers, no collision, `.length` as a plain field. **The surface is not the hard part.** What is
missing is the widths, the growth, the bulk ops, the export — and one emitter bug (§B3).

### A6. What the hosts do with linear memory today

- **`scripts/vl-host/src/main.rs`** (`run_program_with`) builds a `Linker` of `func_wrap`ped print
  sinks and instantiates. It never touches memory. It *does* already probe for an exported memory
  named **`ioMem`** (`StrIn::probe`, main.rs:405-425) as half of a designed-but-unshipped bulk
  string-staging ABI — the host side is written, "no seed exports these yet".
- **`tests/support/runWasm.ts`** and **`playground/src/runtime.ts`** both create a
  `WebAssembly.Memory` and pass it as `imports.memory`. Measured: VL modules import nothing but the
  print family (`imports: []` on a `__store_i32__` program, four print imports on a `__log__` one).
  **`imports.memory` is dead in both**, and has been since the native emitter started defining its
  own memory.
- **`scripts/wasmtime-host.rs`** also defines `imports.memory`. It is a retired spike
  (`docs/internals/wasmtime-parity.md` §"The host used for the spike"), not in CI and not built by
  anything — it is not a live host for P0.2 purposes.

---

## B. What is already broken here, with reproductions

### B1. Seven builtins pass `vl check` and fail at emit

§A1. The message — `emitProgram: call to unknown function`, no position — reads like a typo'd
identifier rather than "this builtin has no implementation". Fenced by
`tests/cases/run/memory-intrinsic-declared-not-lowered.vl` and
`tests/cases/run/memory-size-declared-not-lowered.vl`.

### B2. The 64 KiB hard ceiling

§A3. Repro: `tests/cases/run/` has none (a trap is a runtime failure, not a compile verdict); the
probe is four lines and reproduces every time.

### B3. Capture analysis rejects `__store_i32__`/`__load_i32__` in a named function — and the fix already exists for their siblings

`numeric-intrinsics.md` §"Known limitation" documents this for the bare-name intrinsics and notes it
is "the whole declared-intrinsic family's pre-existing shape". Measured, it is **not** the whole
family's — it is exactly the two names missing from one list.

| program shape | `__store_i32__` / `__load_i32__` | `__log__` / `__trap__` |
| --- | --- | --- |
| direct call at top level, module uses a lambda | ✅ works | ✅ works |
| wrapped in a named function, no function value anywhere | ✅ works | ✅ works |
| wrapped in a named function, module uses a lambda anywhere | ❌ `captured variable not found in enclosing frame` | ✅ works |
| called from inside a lambda body | ❌ same | ✅ works |

One variable changes between the columns: whether the name is on `isBuiltinFnName`'s exemption list
(`compiler/emit_base.vl:144-157`), which contains `print`, `toString`, `fromCodePoint(s)`, `Map`,
`Set`, `__array_new__`, `__array_new_default__`, `__array_copy__`, `__log__`, `__trap__` — and not
`__store_i32__` or `__load_i32__`.

This is load-bearing for P0.1, not a curiosity: **every `Buffer` method is a named function wrapping
an intrinsic**, so a std-VL `Buffer` is unusable in any program that uses one lambda anywhere.

```
$ vl run bufmethods_plus_fnval.vl     # Buf struct + UFCS methods + one xs.map(...)
emitProgram: captured variable not found in enclosing frame
```

Fenced by `tests/cases/run/memory-intrinsic-in-named-fn.vl`.

`numeric-intrinsics.md` argues the exemption-list fix is the *wrong* fix, because the list is
consulted by name and would swallow a genuine capture of a same-named local. That argument has real
force for `min`/`max`/`abs`; it has much less for `__store_i32__`, and the repo already accepts
exactly that risk for `__log__`, `__trap__` and `__array_copy__`. See **O7**.

### B4. `wasm-opt -O` will hard-fail on `memory.copy` / `memory.fill`

`optimize_in_place` (main.rs:984-1004) runs `wasm-opt -O --enable-reference-types --enable-gc` and
`bail!`s on a non-zero exit. Measured against binaryen 130 (the pinned version) on a module using
both bulk ops:

```
$ wasm-opt bulk.wasm -O --enable-reference-types --enable-gc -o out.wasm
[wasm-validator error in function 0] memory.copy operations require bulk memory operations
  [--enable-bulk-memory-opt]
[wasm-validator error in function 1] memory.fill operations require bulk memory
  [--enable-bulk-memory-opt]
[wasm-opt rc=1]                    # and no output file is written
```

Adding `--enable-bulk-memory` makes it pass. `wasm-dis` (the `--wat` path) tolerates bulk memory
either way (rc=0 both). So **the bulk half of P0.1 requires a one-line host change**, and it will be
a loud `vl build -O` failure the day the emitter starts writing those opcodes. This is the host
change the P0 tier needs — and it belongs to P0.1, not P0.2.

Neither engine needs anything: bulk memory is wasm 2.0 core, on by default in wasmtime 47 and V8.
`vl run` on a hand-built bulk-memory module works today (§A6 host, `-1414812757` from a
`memory.fill(0xAB)` + `memory.copy`).

### B5. A `memory.grow` silently detaches every host view

The P0.2 payoff is a host overlaying `Float32Array`/`DataView` on `instance.exports.memory.buffer`.
Any later growth of that memory detaches the overlay:

```
initial memory.size (pages): 1
host view length (i32 slots): 16384
host view[0] before grow: 11223344
memory.grow(15) returned previous page count: 1
memory.size after grow (pages): 16
host view byteLength AFTER grow: 0 (0 == detached)
host view[0] after grow: undefined         ← silent, not a throw
fresh view length: 262144 value survived grow: 11223344
```

Guest data survives; the *host's view* does not, and an indexed read of a detached typed array
yields `undefined` rather than throwing. In webcraft's render-publish path that is a silent
wrong-answer channel. P0.1 (growth) and P0.2 (export) are individually harmless and jointly a trap,
so the allocator's growth policy is not an allocator-internal detail — it is part of the host
contract. **O5** is where that gets ruled.

### B6. `imports.memory` is dead in all three hosts

§A6. Cosmetic, but it means the JS hosts hold *two* memories, and a host reading the one it provided
instead of `instance.exports.memory` sees all zeros. Worth deleting when P0.2 lands so the trap
cannot be fallen into.

### B7. The intrinsic family is invisible to LSP completion

`compiler/driver.vl`'s `builtinScan` maintains the completion list by hand: 6 type names +
`print`/`toString`/`fromCodePoint`/`fromCodePoints`/`Map`/`Set`. It contains none of the ten memory
dunders and — since #1161 — none of the 24 numeric intrinsics either. Any name P0.1 adds must be
added there too, or it will not complete.

While there: `driver.vl:910`'s "(no enumerable builtin scope)" is **half wrong**. The bare-name
numeric intrinsics are indeed special-cased call arms with no scope entry, but the ten memory
dunders live in `T.scopes[0]`, a real `Map<string,i32>` (`declare`, `typecheck.vl:3356-3360`) that is
trivially enumerable. The comment should say which family it means.

---

## C. The proposed surface

### C1. `Buffer` is a GC struct describing a linear-memory extent

Two heaps, and the boundary must be stated plainly. VL values live in WasmGC; `Buffer` **contents**
live in linear memory. The `Buffer` *value itself* is a GC struct:

```
Buffer  ≡  { base: i32, length: i32 }     — a GC ref, ordinary VL value semantics
buf.length : i32                          — a plain field read (struct.get), no call
```

Why a GC struct and not a bare i32 handle:

- It is what VL already does — measured working in §A5, including `.length` as a field, structural
  dedup, and passing across module boundaries.
- A bare i32 handle would need a side table to answer `.length`, i.e. a second object model, which
  `DECISIONS.md` forbids.
- It keeps the wasm validator as the memory-safety proof for the *descriptor*. Only the bytes are
  unchecked, and those the engine bounds-checks.

What it costs: a `Buffer` is GC-traced and cannot cross an export boundary (the scalar-only export
ABI). That is fine and is in fact what webcraft wants — the host never receives a `Buffer`, it
receives `snapshotPtr(): i32`-style scalars and reads the exported memory itself.

**"Authoritative state ⊆ Buffer" is a discipline, not a language guarantee.** VL cannot enforce that
a program keeps no authoritative state in GC objects, and should not try. What the language owes the
discipline is: (a) every byte of a `Buffer` is host-visible at a known offset (P0.2), (b) snapshot
and rollback are single instructions (C3), (c) nothing the compiler does relocates or reorders those
bytes. All three are satisfiable; none requires a type-system feature.

### C2. The width matrix

14 names, of which 2 exist. The wasm instruction for each is fixed — as with P0.3/P0.4, the VL
signature *is* the instruction's signature:

| VL | wasm | opcode | natural align-exp |
| --- | --- | --- | --- |
| `loadI8(off): i32` | `i32.load8_s` | `0x2c` | 0 |
| `loadU8(off): i32` | `i32.load8_u` | `0x2d` | 0 |
| `loadI16(off): i32` | `i32.load16_s` | `0x2e` | 1 |
| `loadU16(off): i32` | `i32.load16_u` | `0x2f` | 1 |
| `loadI32(off): i32` | `i32.load` | `0x28` | 2 ✅ exists |
| `loadI64(off): i64` | `i64.load` | `0x29` | 3 |
| `loadF32(off): f32` | `f32.load` | `0x2a` | 2 |
| `loadF64(off): f64` | `f64.load` | `0x2b` | 3 |
| `store8(off, v)` | `i32.store8` | `0x3a` | 0 |
| `store16(off, v)` | `i32.store16` | `0x3b` | 1 |
| `storeI32(off, v)` | `i32.store` | `0x36` | 2 ✅ exists |
| `storeI64(off, v)` | `i64.store` | `0x37` | 3 |
| `storeF32(off, v)` | `f32.store` | `0x38` | 2 |
| `storeF64(off, v)` | `f64.store` | `0x39` | 3 |

Stores are sign-agnostic — one instruction truncates, and `i32.store8` cannot tell a signed byte
from an unsigned one. The consumer spells `storeU8` but `store16`; this table normalizes both to
`store8`/`store16` (see **O2**).

Plus the four the tier needs but the ask does not name: `memory.size` (`0x3f 0x00`),
`memory.grow` (`0x40 0x00`), and the two bulk ops below. **18 instruction kinds total, 16 of them
new.** For scale, #1161 shipped 24 names over 44 instructions.

### C3. Bulk ops — the load-bearing pair

```
Buffer.copy(dst, dstOff, src, srcOff, len)   → memory.copy   (0xfc 10 0x00 0x00)
buf.fill(off, len, byte)                     → memory.fill   (0xfc 11 0x00)
```

The emitter has **no `0xfc` prefix machinery at all** (only `0xfb`, the GC prefix) — a small new
byte-writer, plus the host flag from §B4.

`Buffer.copy` is a five-argument free function, because VL has no static methods and the operation
is symmetric in two receivers. `buf.fill` is a natural UFCS method. See **O3**.

Note that snapshot/rollback need `memory.copy` *between offsets of the one memory*, which is exactly
what the instruction does; multi-memory is not required and is not proposed.

### C4. The allocator lives in VL, in `std/`

Argued from what VL can already express: §A5 is a working bump allocator with a mutable module
global, in an imported module, compiled by today's compiler. Nothing about it wants to be in the
emitter. `std/` files are real VL that must compile, and this one does.

The compiler owns exactly what an instruction is: the 18 opcodes and the memory section. The
allocator's *policy* — alignment rounding, the reserved low region, what `Buffer(n)` does when the
memory is too small — is ordinary code and belongs in `std:buffer`. This is `std-design.md` D1's
line ("the floor = host-boundary sinks and things with no VL-reachable construction below them")
applied unchanged.

The one thing the allocator cannot express today is growth: `Buffer(n)` must be able to call
`memory.grow`, which means `__memory_grow__`/`__memory_size__` stop being dead declarations. That is
two instructions and is on the critical path (§B2).

### C5. Exported memory

Emitter-side, P0.2 is two edits to `emitExportSection`: append an entry with export kind `2`
(memory), index 0, and lift the `reExpNm.length == 0` early return so a memory-only module still
emits section 7.

Host-side, **nothing is required**. Measured:

| host | exported-memory module | verdict |
| --- | --- | --- |
| `scripts/vl-host` (wasmtime 47), `vl run <prebuilt.wasm>` | instantiates, runs, prints | no change needed |
| `tests/support/runWasm.ts` import shape (JS) | `instantiate: OK`; `exports.memory instanceof WebAssembly.Memory`; `DataView`/`Float32Array` overlay reads guest bytes `ab ab ab ab …` | no change needed |
| `playground/src/runtime.ts` | same import shape as runWasm.ts | no change needed |
| `wasm-opt -O` (host flags) | exported memory survives `-O` intact | no change needed |
| `wasm-dis --wat` (host flags) | rc=0 | no change needed |

An unexported, unused memory *is* stripped by `-O`; an exported one is not. Since VL only emits the
memory when it is used, and the export pins it, neither case is a hazard.

The one thing P0.2 does need is a **name**, and the name is not free: `export function memory()`
compiles today and produces `{"name":"memory","kind":"function"}`. Wasm export names must be unique,
so an automatic `memory` export plus a user function called `memory` is an invalid module. See
**O4**.

---

## D. Open questions for the owner

Numbered so they can be ruled on one at a time.

**O1 — Where does the method surface live: `std:buffer` VL functions, or compiler-known `Buffer`
methods?** — ✅ **RULED (owner): (c), and `Buffer` lives in `std`. Shipped in S5, §J.**

> The owner's words: *"I don't want buffer built into the compiler; I want it in std."* The compiler
> owns exactly what an instruction is; allocation policy is ordinary code. **Measured cost of the
> ruling: S5 needed ZERO compiler lines.**
>
> (b) is **not** foreclosed at the ABI level — the surface is identical, so it stays a pure codegen
> option — but it is **foreclosed as a matter of taste**. It may be reopened only if a real measured
> kernel after S5 shows the per-access call costs something that matters. "It would be faster in
> principle" is not a reason to reopen it; a benchmark is. And note §G's caveat that the
> `-O3 --closed-world` profile which inlines the wrappers is itself unverified against VL's GC type
> graph — so that measurement must be taken on the profile the consumer will actually ship.

**The three options, stated once:**

- **(a) std VL.** The compiler gains 18 generic `__load_*__` / `__store_*__` / `__memory_*__`
  intrinsics. `std:buffer` — ordinary VL — defines the struct, the allocator, and the UFCS methods
  over those intrinsics. `buf.loadF32(i)` is a normal VL function call.
- **(b) Compiler-known.** `Buffer` becomes a nominal type the compiler knows by name; its member
  calls lower directly to single wasm instructions with no VL function in between.
- **(c) (a) now, (b) later.** Ship (a); revisit (b) as a pure codegen change if measurement
  justifies it. **The user-visible surface is identical either way** — that is what makes (b) a
  later optimization rather than a later migration.

**How they compare:**

| | (a) std VL | (b) compiler-known | (c) (a) then maybe (b) |
| --- | --- | --- | --- |
| compiler change | 18 intrinsics, existing idiom | new nominal-type machinery | 18 intrinsics now |
| codegen, default profile | a real `call` per access | single instruction | a real `call` per access |
| codegen, `-O3 --closed-world` | inlined (measured below) | single instruction | inlined |
| blocked on O7 / §B3 | **yes** | no | **yes** |
| needs machinery that exists | yes — all measured working | **no** — arena has no nominal kinds (`c1-nominal-classifiers`) | yes |
| a program may define its own `Buffer` | yes | **no — forecloses it** | yes |
| first slice | small | large | small |
| reversible | — | hard | **yes, by construction** |

**The decisive fact is that the number which should settle (a)-vs-(b) could not be taken at ruling
time.** Per §G: the real cost of the per-access call under a hot loop was unmeasured, because there
was no kernel to run and a synthetic one would measure binaryen rather than VL. **That measurement
can only be taken after S5 ships — i.e. after (a) exists.** So (b) could not be chosen on evidence;
it could only be chosen on prediction. S5 has now shipped, so the measurement is finally available to
anyone who wants to reopen (b) on evidence.

**Supporting measurement** — the calls do survive `-O` and are inlined at `-O3 --closed-world`. Taken
on the §A5 program. The wrapper calls vanish *while the load/store instruction counts rise*, which is
what distinguishes real inlining from the whole computation being constant-folded away:

| | direct calls | `i32.store` | `i32.load` | output |
| --- | --- | --- | --- | --- |
| unoptimized | 2×`$0`, 2×`$1`, 2×`$2` | 2 | 1 | `64 111 222` |
| `-O` (host flags) | 2×`$0`, 2×`$1`, 2×`$2` | 2 | 1 | `64 111 222` |
| `-O3 --closed-world` | 2×`$0` | **3** | **2** | `64 111 222` |

So (a)'s codegen is acceptable on the release profile P1.3 asks for, and not on today's default.
Note this cuts both ways: it is (a)'s main cost, *and* it is why (b)'s advantage may be worth
nothing once the release profile is adopted — which is itself unsettled (§G: nothing here verified
`--closed-world` is safe for VL's GC type graph).

**The case that was made for (c)**, in order of weight:
1. It is the only option that lets the deciding measurement be taken before the decision is made.
2. It forecloses nothing — the surface is identical, so (b) stays available as pure codegen work
   (see §E).
3. It is what P0.3/P0.4 already did: free functions first, method sugar explicitly not foreclosed.

**The case that was available for (b)**, recorded so the ruling is legible: it needs no O7 ruling and
its codegen is unconditional. The cost is that it would be the first builtin method family on a
non-container receiver, it needs nominal machinery the arena does not have, and it would permanently
take the name `Buffer` from user programs.

**O2 — `store8`/`store16`, or the consumer's `storeU8`/`store16`?**
Stores have no signedness — `i32.store8` truncates and cannot distinguish. The ask spells `storeU8`
but `store16`, which is inconsistent with itself. Proposal: `store8`/`store16`, and say why in the
docs so the asymmetry with `loadU8`/`loadI8` reads as intentional. Cheap to overrule.

> **RULED `store8` / `store16` — shipped in S5, §J.** There is exactly ONE instruction per store
> width and it truncates, so a `storeU8`/`storeI8` pair would falsely imply a signed twin exists.
> The LOADS keep their split (`loadI8`/`loadU8`/`loadI16`/`loadU16`) because there genuinely are two
> instructions there. `tests/cases/std/buffer-narrow-stores.vl` pins both halves — `store8` of -1 and
> of 255 write the same byte, and that byte reads back as -1 or 255 depending on which load asks.

**O3 — `Buffer.copy(dst, dstOff, src, srcOff, len)` — what is the VL spelling?**
VL has no static methods and no namespaced calls. Options: a free function `bufferCopy(...)` exported
from `std:buffer`; a UFCS method `dst.copyFrom(dstOff, src, srcOff, len)`; or admitting
`Buffer.copy` as a new syntactic form. Proposal: **UFCS `dst.copyFrom(...)`**, because it needs no
new syntax and puts the mutated operand in receiver position, matching `dst.fill(...)`. The consumer
wrote `Buffer.copy` illustratively, not as a spelling requirement.

> **RULED UFCS with the DESTINATION as receiver — shipped in S5, §J.**
> `dst.copyFrom(dstOff, src, srcOff, len)`. `std:array` and `std:fmt` already establish self-first
> free functions that read as UFCS methods, and VL has no static methods, so `Buffer.copy` is not
> spellable at all.

**O4 — What is the exported memory called, and is the export automatic or a flag?**
`memory` is what webcraft's host expects (`instance.exports.memory.buffer`), and is the universal
convention. It can collide with a user function of the same name (measured). Options: (i) always
export as `memory`, and make a user export of that name a compile error; (ii) export as `memory`
unless taken, else fail loudly; (iii) export under the already-probed `ioMem` name and let webcraft
use that; (iv) a `--export-memory` build flag, adding the first `vl build` flag beyond `-o`/`-O`/`--wat`
and the first flag that changes the emitted ABI. Proposal: **(i), automatic, gated on the memory
existing at all** — an unused memory is not emitted, so nothing changes for programs that do not
touch it, and a name collision on `memory` is a rare and mechanically fixable reject. Note (iii) is
tempting because the host half is already written, but `ioMem` is the *staging* channel's name, and
overloading one memory export for both roles couples two unrelated ABIs.

**O5 — Does the allocator grow lazily, or reserve up front?**
Growth detaches every host view, silently (§B5). Lazy growth is the natural allocator design and the
wrong one for a zero-copy host contract. Options: (i) lazy `memory.grow` in `Buffer(n)`, and document
"take your views after the last allocation"; (ii) an explicit `reserveMemory(bytes)` a program calls
once at init, with `Buffer(n)` trapping rather than growing afterwards; (iii) a `memoryEpoch(): i32`
export the host compares before every read. Proposal: **(i) plus (iii)** — lazy growth because the
allocator cannot know the total in advance, and a cheap monotonic epoch so a host *can* detect
staleness instead of reading `undefined`. (ii) is attractive for webcraft specifically (it allocates
at init and never frees) but makes the general case worse.

> **RULED (i), lazy growth, and NO epoch export — shipped in S5, §J.** `Buffer(n)` grows the memory
> when it must and exports no growth counter. The host contract, stated in `std/buffer.vl`'s header:
> re-take your typed-array views after any call that may allocate, and detect staleness with
> `byteLength === 0`. That is what Emscripten (`updateMemoryViews()`), wasm-bindgen
> (`byteLength === 0`) and Go (`wasm_exec.js` buffer identity) all do; none of them exports a
> counter, so (iii) would be VL inventing a convention no host expects.

**O6 — Does `Buffer` need `free`?**
The consumer explicitly does not need it ("allocates a few large Buffers at init and never frees").
Proposal: **no free, and say so** — bump only. This is the decision that keeps §C4 out of "a second,
self-managed object model" territory, and it is the one worth being loudest about, because adding
`free` later means adding a free list, which means the DECISIONS.md line gets renegotiated.

> **RULED reclamation YES, via MARK/RELEASE — shipped in S5, §J.** No per-object `free`, and no free
> list: `bufferMark(): i32` reads the one bump pointer and `bufferRelease(mark: i32)` restores it.
> LIFO, no fragmentation, two instructions. The cost is stated at the API surface rather than in a
> footnote, because it is the first way a VL program can hold a DANGLING REFERENCE at all: a `Buf`
> held across a `bufferRelease` still points at live, in-bounds, since-reused linear memory, so
> reads return someone else's bytes and writes corrupt them **silently — no trap**.
> `tests/cases/std/buffer-mark-release.vl` pins that behaviour by value.

**O7 — Fix §B3 narrowly or properly?**
Narrow: add `__store_i32__`/`__load_i32__` (and each new width) to `isBuiltinFnName`. One line per
name, measured to fix both failing shapes, and identical to what `__log__`/`__trap__`/`__array_copy__`
already do. Proper: `numeric-intrinsics.md`'s positional fix in `capScan`'s `Call` arm (skip a
builtin/intrinsic in *callee position* rather than filtering the name everywhere), which also fixes
the bare-name family and the `const toString = 5` capture bug. Proposal: **narrow for the dunder
family now** (it is on P0.1's critical path and the risk it carries — a user local named
`__store_f32__` — is not real), **proper as a separate change** that retires both lists. Ruling this
matters because O1(a) is blocked on it.

**O8 — What happens to the seven dead declarations that P0.1 does not revive?**
`__store_string__` and `__log_string__` are string-to-bytes bridges for a `__log__` path the native
emitter replaced with an in-module decoder; nothing calls them and no host import is reachable.
Options: lower them, or delete the declarations so the name is an honest "unknown identifier".
Proposal: **delete both declarations** as part of P0.1, leaving the memory floor exactly the ops that
have instructions. (`ROADMAP.md` B-mem already says "either lower them or stop declaring them".)

**O9 — Is the memory section's `min` still 1 page once `Buffer` exists?**
With `memory.grow` reachable, `min 1` is merely the starting size and growth covers the rest, at the
cost of a grow (and a view detach) during init. An alternative is a static `min` derived from
constant-sized `Buffer` calls, which is fragile (sizes are usually computed). Proposal: **keep
`min 1`, no max**, and let O5's reserve/epoch handle the host contract. Declaring a maximum only
becomes necessary if the memory is ever `shared` (webcraft's explicitly-later ask).

---

## E. What each decision forecloses

- **`Buffer` as a GC struct (C1)** forecloses a `Buffer` crossing an export boundary as a value, and
  forecloses `Buffer` in a position where a GC ref is illegal. It does *not* foreclose P1.1 views
  (a view is the same shape: `{base, count}` over the same memory) or P1.2 `flat` records (which
  need layout control over *bytes*, not over the descriptor).
- **Bump-only, no `free` (O6)** forecloses reclaiming a `Buffer`, forever, without a design change
  that DECISIONS.md currently rules out. It does not foreclose *arenas* — a program can bump within
  a `Buffer` it owns and reset its own cursor, which is what a Lua VM arena wants anyway.
- **Free functions / UFCS over compiler-known methods (O1c)** forecloses nothing: the surface is
  identical under either lowering, which is the entire reason to prefer it. It *does* mean the first
  shipped version has a real call per access unless built with `-O3 --closed-world`, and that must be
  documented rather than discovered.
- **Automatic `memory` export (O4i)** forecloses a program exporting a function named `memory`. It
  does not foreclose `ioMem` later: measured, one memory may carry **two export names** in a valid
  module (`exports: [… {"name":"memory","kind":"memory"}, {"name":"ioMem","kind":"memory"}]`), so
  the staging ABI can keep its own alias over the same memory.
- **Lazy growth (O5i)** forecloses "host views are valid for the process lifetime" as a contract.
  The epoch export is what keeps that from being silent.
- **Keeping the engine trap as the bounds policy (A4)** forecloses a recoverable out-of-bounds
  result (`T | null`-shaped). Given webcraft's stated preference ("a desync-class bug should trap
  loudly"), that is the right direction, and P1.4 only asks that it be *stated*.
- **Deleting `__store_string__`/`__log_string__` (O8)** forecloses nothing — no emitter path and no
  host import reaches them. It does remove the only declared way to get string bytes into memory,
  which B7 (UTF-8 strings) would need to reintroduce deliberately.

---

## F. Sequencing

Independent, in any order:

- **S0 — host flag.** Add `--enable-bulk-memory` to `optimize_in_place` (and, for symmetry,
  `disassemble_to_wat`). One line each, no emitter dependency, and it must land *before* any
  emitter change that writes `0xfc`, or `vl build -O` breaks loudly (§B4).
- **S1 — capture fix (O7).** `compiler/emit_base.vl`, one list. Blocks O1(a)'s whole surface (§B3).
- **S2 — P0.2, exported memory.** Two edits to `emitExportSection`. Depends on nothing (measured:
  no host needs a change). Deletes the dead `imports.memory` in the two JS hosts as cleanup.

Hard prerequisites, in order:

- **S3 — the width matrix** (12 new load/store intrinsics) requires nothing but itself, but each new
  name must touch six places, and one of them is easy to miss: `emit_sections.vl`'s `scanPrintUse`
  must recognize the *call* for `loadI64`/`loadF32`/`loadF64`, because an intrinsic's result scalar
  appears nowhere as an annotation and the print-import scan would otherwise route to an undeclared
  import. `isNumIntrinsicName` is the existing mechanism and works (measured:
  `print(f64bits(1.5))` → `4609434218613702656` in a program that spells no i64).
- **S4 — `memory.grow`/`memory.size`** must precede any `Buffer` bigger than one page, i.e. it
  precedes anything webcraft can use at all (§B2).
- **S5 — `std:buffer`** (the struct, the bump allocator, the 14 methods) requires S1 + S3 + S4.
- **S6 — bulk ops** require S0 and the new `0xfc` byte-writer. They can land after S5; snapshot and
  rollback are the first things webcraft will reach for, so "after" should mean "next".

### The smallest first slice that gives the consumer something real

**S0 + S2 + S3(loads only) + S4.** That is: the host flag, the memory export, the seven missing load
widths, and grow/size — no allocator, no struct, no bulk ops. With it, a program can address more
than 64 KiB, read every width it wrote, and a JS host can overlay `Float32Array` on
`exports.memory.buffer` and read columns in place. It is the whole P0.2 ask plus the half of P0.1
that unblocks measurement, and it lets webcraft start the pathing port against raw
`__load_f32__(base + (i << 2))` while `std:buffer` is designed — which is exactly the TS-twin
DataView experience they already have, so it is not a regression for them.

Deliberately *not* in that slice: `Buffer` itself. Shipping the type before O1/O5/O6 are ruled means
shipping a name that is hard to change.

### Not foreclosed, not designed here

P1.1 typed views (`buf.f32view(off, count)`) are the same descriptor shape as `Buffer` with an
element stride, over the same memory, with `x[i]` lowering to the same load instruction plus an
index shift — nothing in C1–C5 stands in the way. P1.2 `flat` records need layout control over bytes
inside a `Buffer`, which is orthogonal to everything above. Neither is designed here.

---

## G. What could not be determined

- **`docs/design/performance-topology.md` does not exist in this tree.** It is cited by
  `webcraft-requirements.md` as the companion motivating "authoritative state ⊆ Buffer", and it lives
  in webcraft's repo, not ours. §C1 states what that discipline requires *of VL* as inferred from the
  requirements doc's own summary; if the topology doc names further requirements (view lifetimes,
  hash granularity, the render-publish ring's aliasing rules), they are not reflected here.
- **Whether webcraft's sim uses lambdas at all** — which decides whether §B3 is a blocker or a
  latent one for them specifically. It is a blocker for the general case regardless.
- **The real cost of the per-access call under a hot loop.** Measured: the calls survive `-O` and
  are inlined away at `-O3 --closed-world`. Not measured: what that is worth in ns on a
  `for i { x[i] += vx[i] }` kernel, because there is no such kernel to run yet and a synthetic one
  would measure binaryen, not VL. This is the number that should decide O1(b) vs O1(c), and it can
  only be taken after S5.
- **Whether `--closed-world` is safe for VL output generally.** P1.3 asks for it; the toolchain audit
  recommends it; nothing here verified it does not break the GC type graph, and it should not be
  adopted on this doc's word.

---

## Where the code is

- `compiler/typecheck.vl:1959-1969` — the ten `declare()`d memory intrinsics; `declare`/`lookup` at
  `:3356-3371`; `isNumIntrinsicName` at `:8592` (the P0.3/P0.4 template).
- `compiler/wasmEmit.vl:8274-8308` — the three lowered arms; `:11078-11085` — the `drop` suppression
  list for void intrinsics.
- `compiler/emit_bytes.vl:124-125, 508-522` — `OP_I32_LOAD`/`OP_I32_STORE` and the two byte-writers;
  `:152` — `GC_PREFIX` (there is no `0xfc` sibling).
- `compiler/emit_classify.vl:7319-7331` — statement-vs-tail-value classification for void intrinsics.
- `compiler/emit_sections.vl:1869-1882` — the memory section; `:2020-2046` — the `memUsed`/`memLogUsed`
  usage scan; `:3331-3378` — the export section (function exports only).
- `compiler/emit_base.vl:144-157` — `isBuiltinFnName`, the capture-analysis exemption list (§B3).
- `compiler/emit_state.vl:783-795` — `memUsed`/`memLogUsed`/`gMemLogIdx` and the host-divergence note.
- `compiler/driver.vl:907-949` — `builtinScan`, the hand-maintained LSP completion list (§B7).
- `scripts/vl-host/src/main.rs:395-457` — the `ioMem` staging probe; `:793-840` — `run_program_with`;
  `:984-1028` — `optimize_in_place` / `disassemble_to_wat` and their feature flags (§B4).
- `tests/support/runWasm.ts:88-153`, `playground/src/runtime.ts:19-45` — the JS host import shape and
  its dead `imports.memory`.
- `tests/cases/run/load-roundtrip.vl`, `log-i32.vl` — the two positive corpus tests for the tier;
  `memory-intrinsic-declared-not-lowered.vl`, `memory-size-declared-not-lowered.vl`,
  `memory-intrinsic-in-named-fn.vl` — the fences added with this doc.

---

## H. What shipped: S0 + S2 + S3(loads) + S4

This section is APPENDED to the design above; nothing before it is rewritten. §A–§G record what was
measured **before** any of this landed and stay as the baseline they were. Where a number here
disagrees with one there, this section is the later measurement.

Every claim below was re-measured on the implementing tree, not inherited from §A–§G. The §A–§G
claims that this slice's own critical path depended on were re-verified from scratch and **all
held** — see §H6 for the ones that did not survive contact, which were mine.

### H1. The slice, and what it deliberately excludes

`Buffer` **is not in it**. O1 (std-VL methods vs a compiler-known type), O5 (grow-lazily vs
reserve-up-front) and O6 (does `Buffer` need `free`) are unruled, and the name is hard to change once
shipped. What shipped is the raw intrinsic floor those questions sit above:

| | shipped | not shipped |
| --- | --- | --- |
| **S0** host flag | `--enable-bulk-memory` on `wasm-opt` + `wasm-dis` | — |
| **S2** exported memory | the whole item | — |
| **S3** width matrix | the 7 missing **loads** | the 7 **stores** |
| **S4** grow/size | the whole item | — |
| **S1** capture fix (O7) | — | all of it — the file is owned elsewhere |
| **S5** `std:buffer` | — | all of it — blocked on O1/O5/O6 **and** on S1 |
| **S6** bulk ops | — | all of it — S0 is its prerequisite and is now in place |

### H2. The opcode table, verified by disassembly

Each built as a one-call module and read back with `wasm-tools` — the WAT instruction, the opcode
byte, and the raw immediates. The align-exponent is the **natural** alignment (log2 of the access
width in bytes); it is a hint, not a constraint, and §H4 pins that.

| VL intrinsic | wasm | opcode | raw bytes | result |
| --- | --- | --- | --- | --- |
| `__load_i8__(a)` | `i32.load8_s` | `0x2c` | `2c 00 00` | i32, sign-extended |
| `__load_u8__(a)` | `i32.load8_u` | `0x2d` | `2d 00 00` | i32, zero-extended |
| `__load_i16__(a)` | `i32.load16_s` | `0x2e` | `2e 01 00` | i32, sign-extended |
| `__load_u16__(a)` | `i32.load16_u` | `0x2f` | `2f 01 00` | i32, zero-extended |
| `__load_i64__(a)` | `i64.load` | `0x29` | `29 03 00` | i64 |
| `__load_f32__(a)` | `f32.load` | `0x2a` | `2a 02 00` | f32 |
| `__load_f64__(a)` | `f64.load` | `0x2b` | `2b 03 00` | f64 |
| `__memory_size__()` | `memory.size` | `0x3f` | `3f 00` | i32, pages |
| `__memory_grow__(n)` | `memory.grow` | `0x40` | `40 00` | i32, PREVIOUS pages, or -1 |
| *(control)* `__load_i32__` | `i32.load` | `0x28` | `28 02 00` | unchanged |
| *(control)* `__store_i32__` | `i32.store` | `0x36` | `36 02 00` | unchanged |

The trailing byte of `memory.size`/`memory.grow` is the memory **index** immediate, not a flags byte.
Every module built for this table passes `wasm-tools validate`, and the wide trio's function
signatures come out as `(param i32) (result i64|f32|f64)` — i.e. the checker's declared return types
reach the wasm type section, which is what makes `print(__load_f64__(0))` route to `__print_f64__` in
a program that spells `f64` nowhere.

### H3. Exported memory, and its gate

`memory`, kind 2, index 0, appended LAST so every function export keeps its index:

```
(memory (;0;) 1)
(export "poke" (func 0))
(export "peek" (func 1))
(export "memory" (memory 0))
```

Three measurements that matter more than the entry itself:

- **A memory-only module now emits section 7 at all.** Master returned early whenever there were no
  function exports, which would have dropped the memory export in exactly the program that wants it
  most. Sections before: `types imports functions memories start code`. After: the same plus
  `exports` (10 bytes, count 1).
- **A program that never touches linear memory is BYTE-IDENTICAL to master.** Not "equivalent" —
  `cmp` clean. The export rides `memUsed`, the same flag as the memory section.
- **O4 is ruled (i)**: automatic, always `memory`, and a user `export function memory` in a
  memory-using program is a loud reject. The control — the same function name in a program with no
  linear memory — still compiles and still exports `memory` as a function.

`wasm-opt -O` with the host's flags preserves the exported memory and the module still validates.

### H4. What the corpus now pins

`tests/cases/memory/`, expectations derived from an independent oracle (python `struct`) rather than
by hand:

- every load width read off ONE known byte pattern, so the widths check each other;
- sign vs zero extension at `0xFF`, `0x80`, `0xFFFF`, `0x8000`, **plus `0x7F` as the control** where
  the two spellings must AGREE — without it, "they differ" is not evidence they differ for the right
  reason;
- **unaligned reads at every width**, including f32 at address 33 and f64 at address 51;
- the last legal address of every width (65535/65534/65532/65528) and the trap one byte further;
- `memory.size`/`memory.grow` against the spec's return values, including `grow(0)`, the **-1**
  failure, and that a failed grow leaves the memory and its bytes untouched;
- growth past the old ceiling — addresses 65536 and 262140, both of which trap on one page;
- freshly grown pages are zero;
- the O7 limitation, and its no-lambda control.

### H5. The limitation this slice does not remove (O7)

Censused across **all ten** memory intrinsic names in **four** call positions — not one shape per
name, because a previous bug in this area hid by being silent in only one position:

| position | all 10 memory intrinsics | `__log__` (control) |
| --- | --- | --- |
| top level | ✅ | ✅ |
| named function, no function value in the module | ✅ | ✅ |
| named function, module uses a lambda anywhere | ❌ `captured variable not found in enclosing frame` | ✅ |
| inside a lambda body | ❌ same | ✅ |

Uniform: 10/10 work in the first two positions, 10/10 fail in the last two. The one variable is
`isBuiltinFnName`'s exemption list (`compiler/emit_base.vl`), which this change does not own.

**What that costs:** the raw-address port is unaffected — it writes `__load_f32__(base + (i << 2))`
at top level or in plain named functions. A `Buffer` **method** is a named function wrapping an
intrinsic, so a std-VL `Buffer` remains unusable in any program with one lambda. **S1 is a hard
prerequisite for S5, not a nicety**, and O7 should be ruled before `std:buffer` is attempted.

Two cells of this census were initially UNDECIDABLE and were nearly recorded as passes: the
`__load_i64__` and `__load_f32__` in-lambda probes failed for unrelated reasons (an i64-list
collection gap; an `f32 + i32` type error), which the first harness reported as blank rather than as
"not measured". Re-asked with a shape that isolates capture — the value consumed by `print` inside
the lambda, the lambda still returning i32 — both are the same capture failure, and two controls
(`__log__` in that shape; the shape with no intrinsic at all) confirm the shape itself compiles.

**A measurement that sharpens O7's narrow-vs-proper choice.** O7's objection to the narrow fix
(adding these names to `isBuiltinFnName`) is that the list is consulted by NAME and would swallow a
genuine capture of a same-named local. #1167's reservation was expected to have removed that risk by
rejecting the definition — but censused over `__load_i32__`, `__load_f32__` and `__memory_grow__`,
the reservation covers `function`, top-level `const`/`let` and an inner `const`, and does **not**
cover a **function parameter** or a **lambda parameter**. A parameter is therefore still a way to
create such a local, and the exact hazard shape works correctly today:

```vl
function go(__load_i32__: i32): i32 {
  const f = () => __load_i32__ + 1
  f()
}
print(go(41))          // → 42, measured; an ordinary-parameter control also 42
```

The narrow fix would regress that program to `captured variable not found in enclosing frame`. So
the cost is real but tiny and, more usefully, **removable**: extending #1167's reservation to
parameters first would close the hole before the exemption list opens it, at which point the narrow
fix has no known cost. That pairing is the recommendation; the proper fix (`capScan`'s
callee-position skip) still needs no such pairing.

### H6. Refutations, and things this slice got wrong before it got them right

- **`ROADMAP.md` / `webcraft-requirements.md` / `memory-gc-design.md` "4 store widths, 1 load
  width" — re-confirmed FALSE**, independently of §A1, by running all ten declared intrinsics in
  every call position. One store width, one load width lowered. All three documents are corrected in
  place, each keeping the old sentence visibly as the thing it replaced.
- **A hand-derived i64 expectation was wrong** (`0x5566778811223344` claimed as
  `6152530560731906884`; it is `6153737367135073092`). The compiler was right. Every corpus
  expectation was re-derived from python `struct` afterwards.
- **A second hand-derived expectation was wrong** — byte 3 of `0x3FC00000` is `0x3F` = 63, not 4;
  the test suite caught it. Two for two: no expectation in this slice is hand-computed.
- **A probe's `rc=$?` read the exit code of `head`, not of `wasm-opt`**, through a pipe. The
  conclusion happened to survive (the definitive signal was "no output file written"), but the
  instrument was re-run without the pipe before anything was claimed from it.
- **The `--enable-bulk-memory` flag was verified to REACH the tool**, by an argv-recording shim on
  `$VL_WASM_OPT`/`$VL_WASM_DIS`, not merely to be present in the source.
- **`imports.memory` was censused, not assumed, dead**: 0 of the 1,149 corpus modules that build
  import a memory, and 0 import `__log__`/`__log_string__`. Only then was it deleted from the JS
  host, together with the two sinks that existed to decode bytes out of it.
- **A CI-coverage guard refuted the new test's placement.** `tests/ci_seed_coverage_test.ts` failed
  because a seed-backed test named `exported_memory_test.ts` matches neither `ci-native` glob and so
  would have run NOWHERE in CI while passing locally by self-ignoring. Renamed to
  `vl_exported_memory_test.ts`.
- **THE LOCAL GATE RUNS A DIFFERENT COMMAND THAN CI, and that gap cost a round-trip.**
  `deno task test` is `deno test -A --no-check --parallel tests/`. `ci-native` additionally runs
  **`deno test -A tests/cases_wasm_test.ts` without `--no-check`** — that single step is the repo's
  TypeScript gate, and it type-checks `tests/support/runWasm.ts` transitively. A `TS2339` in the
  host adapter passed every local leg (fixpoint, lint-self, 2,122 tests, corpus A/B, 25,200 fuzz
  programs) and failed CI immediately. **A green local gate is evidence about the local gate.** The
  fix for the next slice is mechanical: run the `ci.yml` commands verbatim, not the task aliases —
  `deno lint`, `deno check compiler/*.ts`, the two `--no-check` suites, and the one that is not.

### H7. Two findings this slice did not go looking for

- **The JS host reported a linear-memory fault as "array index out of bounds".** V8 distinguishes
  them precisely — `memory access out of bounds` vs `array element access out of bounds` — and
  `trapReason`'s first branch matched any "out of bounds" text. The mislabel was near-unreachable
  while the one page was barely addressable; with the load matrix and `memory.grow` it is the
  ordinary way a raw address goes wrong. Fixed, with the memory branch ahead of the array branch;
  array cases are untouched.
- **A VL integer literal with the top bit set is an i64.** `0xC0100000` — an ordinary f32 bit
  pattern — cannot be passed to `__store_i32__`, because an integer literal takes the narrowest type
  that holds it EXACTLY. It must be spelled as the signed i32 (`-1072693248`). This will hit every
  consumer laying down float bit patterns and is worth knowing before `Buffer` ships a store surface.

### H8. The detachment contract (B5), ruled for the hosts

S2 and S4 are individually harmless and jointly a silent-wrong-answer channel: a `memory.grow`
detaches every host view, and a detached typed array yields `undefined` on an indexed read **rather
than throwing**. What the hosts do about it:

- **`tests/support/runWasm.ts`** now returns the instance's `exports`, and its doc comment states the
  contract: re-read `.buffer` after any guest call that can grow; never cache a view across one.
- **The behaviour is asserted by test, not described.** `tests/vl_exported_memory_test.ts` takes a
  view, grows from the guest, and pins `byteLength === 0` and `view[0] === undefined`, then pins that
  a re-derived view sees the surviving data. A failed grow is pinned NOT to detach.
- **`imports.memory` is gone** from the JS host, so there is no longer a second memory to read by
  mistake — the trap §B6 names, which exporting the real memory would otherwise have made easier to
  fall into.
- **A Rust/wasmtime host gets this for free**: `Memory::data` borrows the `Store`, and growing needs
  it mutably, so a stale slice is a borrow-check ERROR rather than a silent `undefined`. Measured
  against a wasmtime 47 embedding reading a VL module.

This does not rule **O5** (lazy growth + an epoch export vs reserve-up-front). It makes the hazard
loud in the two hosts we own and states the contract; the allocator-side answer is still open, and
O5 should be ruled before `Buffer(n)` is allowed to grow the memory implicitly.

### H9. What remains before `Buffer` itself can ship

1. **O1, O5, O6 ruled.** Where the method surface lives, whether the allocator grows lazily, whether
   there is a `free`. Nothing below is worth starting first.
2. **S1 / O7** — the capture fix. Hard prerequisite: every `Buffer` method is a named function
   wrapping an intrinsic (§H5).
3. **The seven store widths.** Mechanically identical to the loads that shipped; the only reason they
   are not here is that the slice was kept to what makes the loads measurable.
4. **S6 bulk ops** — `memory.copy`/`memory.fill`, needing the emitter's first `0xfc` byte-writer.
   Their host prerequisite (S0) is in place and pinned.
5. **Then S5** — the struct, the bump allocator, the methods, in `std:buffer`.

Not needed: any host change for the export itself, and any change to the memory section's `min 1`
(O9's proposal stands — growth covers the rest).

---

## I. What shipped next: the three WIDE store widths (S3's other half)

Appended to §H, which is itself appended to §A–§G; nothing before it is rewritten. Where a number
here disagrees with one above, this section is the later measurement.

### I1. The slice

`__store_i64__` → `i64.store` (0x37), `__store_f32__` → `f32.store` (0x38), `__store_f64__` →
`f64.store` (0x39). Alignment exponents 3 / 2 / 3, the natural width in each case, and the same
memarg encoding the loads use (`fbMemAccess`, renamed from `fbMemLoad` because a store writes the
identical three bytes). Verified by disassembly, not by reading the table:

```
0xe0 | 37 03 00 | i64_store memarg:MemArg { align: 3, max_align: 3, offset: 0, memory: 0 }
0xea | 38 02 00 | f32_store memarg:MemArg { align: 2, max_align: 2, offset: 0, memory: 0 }
0xf8 | 39 03 00 | f64_store memarg:MemArg { align: 3, max_align: 3, offset: 0, memory: 0 }
```

**Not in it:** `store8` / `store16`. §O2's naming question is unruled and no `__store_i8__` /
`__store_i16__` name is declared, so there is nothing to lower. The four bulk/allocator items in
§H9 are likewise untouched, except that item 2 (S1/O7) is now **done** — see §I4.

The ADDRESS of all fourteen load/store ops is an i32 and takes the same context-clearing operand
spine every other memory intrinsic uses. The VALUE is the one memory-intrinsic operand that is not
an i32; it takes its declared width through `emitExprAsI64` / `emitExprAsF32` / `emitExprAsF64` —
the same helpers the binding / argument / return boundaries use, so an integer literal re-encodes at
i64, a float literal at f32/f64, and a narrower variable widens exactly where the checker permits.
`emitMemIntrinArg`'s header, which asserted "EVERY memory-intrinsic operand is an i32 BY
DECLARATION", is corrected in place.

### I2. 14 of 14, by value, against an independent oracle

#1173 built this lowering, measured **13 of 14** round-trip cells correct, and did not ship it. The
14th — a store as a function's implicit TAIL statement — needed one line in
`emit_classify.stmtIsTailValue`, and its report is worth preserving: shipping 13/14 would have
**traded a clean emit REJECT for a NEW silent invalid module in the most natural shape a user would
write**. That is the right call, and the line is now here.

Every expectation is the python `struct` encoding of the value, never hand-derived — the load slice
got two hand-derived expectations wrong (§H6) and the rule since is that none are computed by hand:

| cell | value | read back as | expected |
| --- | --- | --- | --- |
| i64 statement / in-fn / **tail** / var / expr / i32-widen | 5000000077 | i64 | 5000000077 |
| f32 statement / in-fn / **tail** / var / from-load | 1.5, 1.0 | i32 bits | 1069547520, 1065353216 |
| f64 statement / in-fn / **tail** / var / int-lit / f32-widen | 1.5, −2.25, 3.0 | i64 bits | 4609434218613702656, −4611123068473966592, 4613937818241073152 |

Plus: unaligned at every wide width (f32 at 33, f64 at 51 — the alignment immediate is a hint, and
the stores inherit that from the loads); the last legal address (65528) and the trap one byte
further; and three reject controls (arity, binding a void result, a wrong-typed value) whose
diagnostics are now the REAL ones, because the "declared but has no implementation yet" line that
used to precede them is gone.

### I3. Acquiring an arm closes the shadowing escape hatch, deliberately

While these three had no lowering, `function __store_f64__(…)` genuinely shadowed the builtin and
genuinely ran, and `nameIsUnimplementedIntrinsic`'s diagnostic was gated on `fnDeclIx` not holding
the name precisely to preserve that. An emitter arm rewrites the call site before any declaration is
looked up, so the body would never run — which is exactly the condition `nameIsEmitterIntrinsic`
exists to reject at the DEFINITION, where the author can see it. The three names moved from one list
to the other in the same change. `tests/cases/memory/store-width-user-definition-reserved.vl` pins
the new behaviour and says why it changed.

`nameIsUnimplementedIntrinsic` is now `__store_string__` and `__log_string__` — the two that are not
a table entry away (§O8).

### I4. O7 is closed, and the fix was the one already filed in the other file's header

§H5 measured all ten memory intrinsics failing `captured variable not found in enclosing frame` in
two of four call positions, and named `emit_base.isBuiltinFnName` as the one variable. #1172 fixed
the mechanism — the exemption became a POSITION (callee only) rather than a name filter — and added
the then-existing dunder names to that list.

That left a **drift hazard, not a fix**: `isBuiltinFnName` is a PARTIAL COPY of the checker's
`nameIsEmitterIntrinsic`, and its own header says so, says the two "must be kept in step", and files
the repair — *"the one-word fix is `export function nameIsEmitterIntrinsic` in `typecheck.vl`, after
which the whole dunder block here collapses to a single delegation"* — declining it only because
`typecheck.vl` belonged to another partition. Measured: the three new store widths landed on the
wrong side of that copy and failed both lambda positions while every other memory intrinsic worked.

`capScan` now asks `nameIsEmitterIntrinsic` directly, at the single site that consumes either list.
That list is by construction exactly the set of names whose CALL SITE the emitter rewrites before it
looks up a declaration — which is precisely the condition that makes the exemption sound — so a name
reserved in the checker is exempt in the capture scan the same day. `isBuiltinFnName` is still asked
because it also carries `print` / `toString` / `fromCodePoint(s)` / `Map` / `Set`, which are builtins
rather than dunder intrinsics; its dunder block is now redundant and its deletion belongs to that
file's owner.

**§H5's cost analysis does not apply and was re-measured rather than inherited.** It warned that a
name-filter fix would regress `function go(__load_i32__: i32) { const f = () => __load_i32__ + 1; f() }`
from 42 to a capture failure, because #1167's reservation does not cover PARAMETERS. It still prints
42 here, and so does the `__store_f64__` spelling of the same shape: the exemption is positional, so
a parameter read as a VALUE is untouched no matter which list names it.

### I5. Where §H9's list stands now

1. **O1, O5, O6** — still unruled. Nothing below is worth starting first.
2. ~~S1 / O7, the capture fix~~ — **done** (§I4).
3. ~~The seven store widths~~ — the three WIDE ones are **done**; the narrow pair is blocked on §O2's
   naming question, not on any machinery.
4. **S6 bulk ops** — `memory.copy` / `memory.fill`, needing the emitter's first `0xfc` byte-writer.
   Their host prerequisite (S0, `--enable-bulk-memory`) is in place and pinned. Unchanged.
5. ~~**Then S5** — the struct, the bump allocator, the methods, in `std:buffer`. Its two hard
   prerequisites (S1, S3) are now both satisfied, so this is blocked only on the rulings in item 1.~~
   — **done** (§J). O1/O2/O3/O5/O6 were ruled and S5 shipped in the same change; it needed no
   compiler line and did not wait on item 4 (S6 is an optimization of two `std:buffer` bodies, not a
   prerequisite of the module). §J4 corrects what this row and §C4 still claimed was missing.

### I6. A finding this slice did not go looking for: the sabotage harness poisoned its own seed

Not about `Buffer`, but it is about how this tier gets measured, so it is recorded here.

The entombment step applies a named sabotage, rebuilds the seed, sweeps the corpus, then restores.
`refresh-compiler.sh` is a SELF-compile: the restore step therefore compiled clean source **with the
sabotaged compiler**. One sabotage in this slice broke `m = Map()` — a construct the compiler's own
source uses — so the "restored" seed was itself miscompiled, and every later sabotage measured
against it. Two host-only sabotages reported a corpus file reddening that neither could possibly
touch; the on-disk seed then failed to compile the compiler at all.

The tell was **implausibility, not failure**: a change to a Rust float formatter cannot redden a map
test. The fix is that a sabotage harness for a self-hosting compiler must restore a **saved pristine
artifact**, never rebuild one — only the sabotage's own build may recompile. Recovery needed the
bootstrap ladder run by hand (a healthy seed compiling a source tree that carries the emitter fix but
not yet the construct it enables), which is the same ladder any change that the compiler's own source
depends on will need.

---

## J. What shipped: S5 — `std:buffer`, and the five rulings it implements

Appended to §I, which is appended to §H, which is appended to §A–§G; nothing before it is rewritten
except the five `> **RULED**` blocks added inline in §D (which record a ruling, not a measurement)
and §I5's item 5. Where a number here disagrees with one above, this section is the later
measurement.

Measured on a tree rebased onto master `a9e4995`, against a seed FETCHED from the published
`seed-latest` release and then proven a fixpoint — `sha256 e9ab9100…` before and after
`refresh-compiler.sh --prove-fixpoint`, i.e. **this slice's compiler is byte-identical to master's**.
That equality is what makes §J8's zero-grading possible at all.

### J1. The slice: `Buffer` itself, and ZERO compiler lines

`std/buffer.vl`, ~300 lines of ordinary VL. No `compiler/*.vl` file is touched — which is O1(c)'s
whole claim, now measured rather than argued.

| | shipped | not shipped |
| --- | --- | --- |
| the `Buf` descriptor | `export type Buf = { base: i32, length: i32 }` | — |
| the allocator | `Buffer(n)`, lazy growth, alignment, the reserved low region | a free list; a second arena |
| reclamation | `bufferMark()` / `bufferRelease(mark)` | per-object `free` (ruled out, O6) |
| loads | all 8 widths | — |
| stores | 4 native + `store8` / `store16` **emulated** | the `__store_i8__` / `__store_i16__` intrinsics (S3's other half, an emitter change) |
| bulk | `fill` / `copyFrom` as VL **loops** | `memory.fill` / `memory.copy` (S6, an emitter change) |
| `.length` | a plain `struct.get` field read | — |

The API, in the order §C2's table names it:

```
Buffer(byteLength: i32): Buf          bufferMark(): i32      bufferRelease(mark: i32)
buf.length                            buf.base
buf.loadI8/loadU8/loadI16/loadU16/loadI32/loadI64/loadF32/loadF64 (off)
buf.store8/store16/storeI32/storeI64/storeF32/storeF64 (off, v)
buf.fill(off, len, byte)              dst.copyFrom(dstOff, src, srcOff, len)
```

### J2. The five rulings, and where each one lives in the code

- **O1 = (c)** — `std:buffer` is VL. The compiler owns what an instruction is; policy is code. The
  measured consequence is the table above: 0 compiler lines, 11 corpus fixtures, one std file.
- **O2 = `store8` / `store16`** — no `storeU8`/`storeI8` twins. One instruction per store width, and
  it truncates. The loads keep their split because there really are two instructions.
- **O3 = `dst.copyFrom(dstOff, src, srcOff, len)`** — the destination is the receiver.
- **O5 = (i)** — lazy growth, NO epoch export. The host contract is stated in the module header.
- **O6 = MARK/RELEASE** — reclamation yes, per-object `free` no, and the dangling hazard is stated
  at the API surface (§D O6's ruling block, and the module header's third paragraph).

### J3. The policy the ruling put in std's hands, and why each way

These are the decisions O1(c) says are "ordinary code". Each is pinned by value in
`tests/cases/std/buffer-alloc.vl`, so changing one has to redden a test rather than drift.

- **`HEAP_BASE = 1024` — a reserved low region.** Three reasons: address 0 stays outside every
  allocation, so `base == 0` cannot be a legitimate `Buf`; a program may still poke raw addresses
  through the bare intrinsics (§A3's collision hazard) and this leaves it a documented kilobyte
  `std:buffer` promises never to touch; and the host's already-written `ioMem` staging probe wants a
  fixed low window it can own later without moving the heap. **1 KiB and not one page** — reserving
  a whole page would force a `memory.grow`, and therefore a host view detachment, during the init of
  a program that otherwise fits in the default page.
- **`ALIGN = 8` — sizes round up, bases are 8-aligned.** 8 is the widest scalar VL can store
  (i64/f64), so every width's natural alignment is satisfied at offset 0 and every 8-multiple offset.
  This is a PERFORMANCE choice, not a correctness one — the wasm alignment immediate is a hint and
  §H4/§I2 already pin that every width is legal at every address. A second, free consequence: no two
  `Buf`s ever share a 32-bit word, which is what makes `store8`'s read-modify-write unable to reach
  a neighbouring allocation even in principle.
- **`.length` is what the caller ASKED for**, never the rounded reservation. The padding is the
  allocator's business and is invisible.
- **No zero-fill loop.** A wasm memory starts zeroed and freshly grown pages are zeroed (§A2), so
  bytes that have never been handed out are zero for free. **That guarantee ends at the first
  `bufferRelease`** — the reused region carries the previous owner's bytes — and that is pinned, not
  merely documented (`buffer-mark-release.vl` reads 777 out of a freshly allocated `Buf`).
- **Three traps, all at allocation time, none per access.** A negative length (the bump pointer
  would walk backwards and hand out overlapping extents); an i32 overflow (past 2 GiB a byte address
  stops being orderable, so `next > base` silently stops working); and a `bufferRelease` mark outside
  `[HEAP_BASE, bumpPtr]`. §A4's bounds policy is untouched: there is no per-access check, because the
  engine's own trap is the memory-safety proof.

### J4. What was re-measured, and the three claims that were STALE

The §A5 probe — a `{base,length}` struct, a mutable module global, lazy growth 1→2 pages, UFCS
accessors, stores at both ends of a 100 KB extent — was re-run from scratch at master `1863e87` and
again after the rebase onto `a9e4995`. It prints `100000 / 4242 / 777 / 2` at rc=0 with `vl check`
clean. Everything §A5 claims holds.

What did NOT hold is the doc's own account of what S5 was still waiting for:

1. **§C4: "The one thing the allocator cannot express today is growth … `__memory_grow__` /
   `__memory_size__` stop being dead declarations."** Stale since S4 (§H). Both are lowered, and
   `ensureCapacity` calls them directly. Re-measured here: a 200000-byte `Buffer` grows the memory
   from 1 page to 4 and addresses byte 202020.
2. **§B2's 64 KiB hard ceiling.** Gone with the same slice. `buffer-growth.vl` writes three pages
   past where §A3's two-32-KiB-buffer probe used to trap.
3. **§I5 item 5: "blocked only on the rulings in item 1", with S6 listed ahead of it.** The rulings
   came with this change, and S6 is not a prerequisite at all — `fill` and `copyFrom` are VL loops
   with the right semantics, and S6 replaces two bodies with one instruction each without changing a
   signature or an expectation.

Two §A–§G claims that this slice's critical path DID depend on were re-verified and held: §A2's
zero-filled fresh memory (no fill loop is needed, measured through a grow) and §A4's engine trap
(`buffer-store8-past-memory-traps.vl`).

### J5. The two emulations, and the argument that they are admissible

`__store_i8__` / `__store_i16__` are not declared (§I1 — S3's unshipped half), so `store8` is a
READ-MODIFY-WRITE over `__load_i32__` / `__store_i32__`, and `store16` is two of those. Memory is
little-endian, so the byte at `addr` is bits `[8*lane, 8*lane+8)` of the word at `addr - lane`.

Three properties, the third of which is the one that makes this shippable rather than a hack:

- **It traps exactly where `i32.store8` would.** A memory's size is a multiple of 4, so the word
  containing an in-bounds byte is itself wholly in bounds, and the word containing an out-of-bounds
  byte is not. Pinned by `buffer-store8-past-memory-traps.vl`; the sabotage that clamps the word
  address into page 0 is the one that reddens it.
- **It is safe under aliasing and overlap.** The other three bytes are read and written back
  unchanged in one expression, and (§J3) no other `Buf` shares the word anyway. That is why
  `copyFrom` can build an overlapping byte copy on top of it.
- **What it does NOT preserve is the access WIDTH** — 4 bytes touched where the instruction touches
  1. Nothing in VL can observe that today: no threads, no shared memory, no host that reads
  concurrently. When the narrow intrinsics land, `poke8` collapses to one line and every expectation
  in `buffer-narrow-stores.vl` stays exactly as written.

`store16` deliberately does NOT do one word-level read-modify-write: a halfword at an offset
congruent to 3 mod 4 STRADDLES two words. Going byte at a time is correct at every alignment, and
offset 27 in `buffer-narrow-stores.vl` is that case.

`copyFrom` picks its direction from the absolute addresses because `memory.copy` is defined to
behave as if the bytes went through a temporary. Both wrong directions are distinguishable by value,
and both are pinned: a naive forward loop turns `1,2,1,2,3,4,5,6` into `1,2,1,2,1,2,1,2`, and a naive
backward loop turns `3,4,5,6,7,8,7,8` into `7,8,7,8,7,8,7,8`.

### J6. What the corpus pins

`tests/cases/std/`, 11 files — 6 `@run` carrying 108 `@log` lines, 5 `@trap`. Every numeric
expectation is the python `struct` encoding of the value, never hand-derived (§H6's rule).

- **`buffer-alloc.vl`** — the allocator policy BY VALUE: `.length` is the requested length, the first
  base is 1024, 3 bytes advance the pointer to 1032 and 1 byte to 1040, fresh bytes are zero, two
  `Buf`s do not collide, and none of it grows the memory.
- **`buffer-widths.vl`** — the four native store widths and the eight loads, each round-tripped
  against a DIFFERENT width so the store and the load check each other: an i32 read back byte by
  byte, an i64 read back as its two i32 halves, f32/f64 read back as their integer bit patterns, plus
  unaligned f32 at 41 and f64 at 51.
- **`buffer-narrow-stores.vl`** — 28 pins on the emulation: every lane of a word, neighbour survival,
  truncation, `store8(-1) == store8(255)`, sign vs zero extension with the 127 / 32767 CONTROLS where
  the two spellings must AGREE, and `store16` at lanes 0, 1 and 3 (the straddle).
- **`buffer-bulk.vl`** — `fill` (aligned, unaligned, zero length, negative length, truncated byte),
  `copyFrom` between two buffers and at length 0, and both overlap directions.
- **`buffer-growth.vl`** — 1 page → 4, both ends of a 200000-byte extent, freshly grown pages are
  zero, a later allocation that fits does not grow again, and **growth does not move guest data** (a
  `Buf` allocated before the grow still reads back what it wrote).
- **`buffer-mark-release.vl`** — LIFO reuse, nested marks, a no-op release, and the two HAZARDS
  pinned as behaviour: the reused region carries the previous owner's bytes, and a `Buf` held across
  the release silently aliases its successor.
- **the five traps** — a `store8` a megabyte past a one-page memory (`memory access out of bounds`,
  i.e. §A4 through the `Buf` surface), a negative length, an i32-overflowing size, and a release mark
  on each side of the legal range.

### J7. Two findings this slice did not go looking for

- **`Buffer`'s `memory.grow`-returned-`-1` branch is not corpus-testable, and it is not for the
  reason one would guess.** The i32 overflow guard caps a reservation at 2^31, i.e. at most 32768
  pages, while wasm32's own ceiling is 65536 — so the SPEC limit is unreachable from `Buffer` and
  only host resource exhaustion can produce the sentinel. Measured: **both** hosts satisfy a 2 GiB
  request without complaint (`vl run` under wasmtime 47 reports `__memory_size__() == 30518`; a bare
  V8 `WebAssembly.Memory.grow(30517)` succeeds identically). There is therefore no request that fails
  deterministically on every host, and the branch stays defensive and unpinned — said out loud in the
  code beside it, so the next reader does not mistake it for covered. The guard that IS reachable and
  cheap — `Buffer(2147483647)`, which traps BEFORE attempting any growth — is pinned instead.
- **The `std:buffer` fixtures reach the corpus oracle but not the NATIVE alignment suite.**
  `tests/cases_wasm_test.ts` walks `tests/cases/**` and picked all 11 up automatically;
  `tests/selfhost_native_align_test.ts` carries EXPLICIT whitelists (deliberately, so it does not
  regress when a parallel PR grows another list), so new cases are invisible to it until someone adds
  them. All 11 were adjudicated natively by hand for this change — `vl run` stdout equal to the
  `@log` lines and `vl check` clean for the 6 run cases, nonzero exit for the 5 traps — but promoting
  them into that file's `RUN_CASES`/`TRAP_CASES` belongs to its owner and is the obvious follow-up.

### J8. Grading the zeros: which instrument was live, and which was only coverage

The corpus A/B and the fuzz A/B both came back **clean, and neither is evidence of anything about
this slice**. Said plainly:

- the compiler is byte-identical on both sides (`sha256 e9ab9100…`), because no `compiler/*.vl` line
  changed;
- no pre-existing corpus case and no generated fuzz program imports `std:buffer`, so there is no path
  by which a defect in it could reach either sweep.

Those two sweeps therefore prove **the absence of collateral damage** — 1471 pre-existing cases
identical across build status, emitted-wasm sha256, diagnostic text, run status, run stdout and run
stderr; 5 pinned fuzz seeds × 200 programs identical class-for-class — and nothing else. The A/B
delta is exactly 11 added lines and zero changed ones.

The live instrument is the 11 fixtures, and that was proven by **sabotage**: 17 defects applied one
at a time to `std/buffer.vl`, each reverted before the next.

| sabotage | fixtures that redden |
| --- | --- |
| `HEAP_BASE` 1024 → 512 | alloc, growth, mark-release |
| `ALIGN` 8 → 4 | alloc |
| `poke8` drops the lane shift | bulk, narrow-stores |
| `poke8` forgets to clear the old byte | bulk |
| `poke8` wraps the address into page 0 | store8-past-memory-traps |
| `store16` writes only the low byte | narrow-stores |
| `loadI8` zero-extends | narrow-stores |
| `loadI64` reads one byte high | widths |
| `copyFrom` always forward | bulk |
| `copyFrom` always backward | bulk |
| `fill` runs one byte long | bulk |
| `ensureCapacity` drops the page round-up | growth |
| `Buffer` accepts a negative length | negative-length-traps |
| `Buffer` drops the i32 overflow guard | size-overflow-traps |
| `bufferRelease` accepts a mark above the pointer | release-above-pointer-traps |
| `bufferRelease` accepts a mark below the heap base | release-below-base-traps |
| `bufferRelease` does not move the pointer | mark-release |

**17 of 17 sabotages reddened something, and 11 of 11 fixtures were reddened by at least one** — no
fixture is decoration and no pin is asleep. §I6's hazard does not apply here and was checked rather
than assumed: `std/buffer.vl` is not part of `compiler/*.vl` and nothing in the compiler imports it,
so no sabotage could reach the seed, and the seed's sha256 is unchanged across the whole harness.

### J9. Where §I5's list stands now

1. ~~O1, O5, O6~~ — **ruled**, together with O2 and O3 (§J2, and the `> RULED` blocks in §D).
2. ~~S1 / O7, the capture fix~~ — done (§I4).
3. **The two NARROW store widths** — `__store_i8__` / `__store_i16__`. No longer blocked on O2 (which
   is ruled): they are a table entry each, mechanically identical to the three wide ones §I1 shipped.
   `std:buffer` emulates them today, so this is now a pure optimization that deletes `poke8` and must
   leave `buffer-narrow-stores.vl` passing unchanged.
4. **S6 bulk ops** — `memory.copy` / `memory.fill`, the emitter's first `0xfc` byte-writer. Same
   shape: `fill` and `copyFrom` already have the right semantics and the right expectations, so S6
   replaces two bodies and changes no signature.
5. ~~S5 `std:buffer`~~ — **done**, this section.
6. **New, and now measurable for the first time:** §G's open question "the real cost of the
   per-access call under a hot loop", which it said "can only be taken after S5". There is now a
   kernel to write it against, and it is the number that decides O1(b) (compiler-known `Buffer`
   methods) versus leaving O1(c) as the permanent answer.

---

## K. What shipped: S3's narrow half + S6 — and P0.1 closes

Appended to §J, which is appended to §I, §H and §A–§G; nothing before it is rewritten. Where a number
here disagrees with one above, this section is the later measurement.

Measured on a tree at master `e091f4e9`, against a seed FETCHED from the published `seed-latest`
release — `sha256 84657bd0…`, which is byte-identical to master's compiler, so the A/B baseline and
the seed are the same artifact and the bootstrap ladder is proven rather than assumed.

### K1. The slice: four intrinsics, and every `std:buffer` emulation deleted

| | before | after |
| --- | --- | --- |
| `__store_i8__` / `__store_i16__` | undeclared — `undeclared identifier` | `i32.store8` (0x3a) / `i32.store16` (0x3b) |
| `__memory_copy__` / `__memory_fill__` | undeclared | `memory.copy` (fc 0a 00 00) / `memory.fill` (fc 0b 00) |
| `std:buffer` `store8` | read-modify-write over the containing word | one instruction |
| `std:buffer` `store16` | two byte-wide read-modify-writes | one instruction |
| `std:buffer` `fill` | a byte loop | one instruction + a `len > 0` guard |
| `std:buffer` `copyFrom` | a byte loop that CHOSE its direction | one instruction + a `len > 0` guard |

Verified by disassembly, not by reading the table:

```
0xa5 | 3a 00 00    | i32_store8  memarg:MemArg { align: 0, max_align: 0, offset: 0, memory: 0 }
0xa5 | 3b 01 00    | i32_store16 memarg:MemArg { align: 1, max_align: 1, offset: 0, memory: 0 }
0xbe | fc 0a 00 00 | memory_copy dst_mem:0 src_mem:0
0xa6 | fc 0b 00    | memory_fill mem:0
```

`0xfc` is the emitter's FIRST misc-prefix opcode — every prefixed instruction it wrote before this
was `0xfb`, the GC prefix. The trailing zeros are memory INDEX immediates (one for `fill`, two for
`copy`, destination first), not flags. `fbMemBulk` writes them.

**This closes P0.1, and with P0.2 (§H3), P0.3 and P0.4 (#1161, re-measured here: all four bitcasts
and all nineteen opcode intrinsics lower and answer correctly against python's own encodings),
webcraft's entire P0 is shipped.** Nothing in P0 is outstanding on the compiler side.

### K2. The scan-membership question, answered structurally

§I1's discipline was "a width missing from any one list is a silent wrong answer". The census before
touching anything: `__store_i32__` is enumerated in four files — typecheck (declaration +
reservation), wasmEmit (opcode table, align table, emit arm, `drop` suppression), emit_sections
(the memory-forcing scan), emit_classify (the tail-value classifier).

The finding is that **three of those four are already membership-driven, not spelling-driven**. They
ask `nameIsMemStoreIntrinsic`, so the narrow pair joined all three by joining ONE list, and the only
file needing real work was the emitter that must pick different bytes. That is the design §I1 left
behind working as intended, and it is why this slice's narrow half is small.

The bulk pair had no such list, so it got one — `nameIsMemBulkIntrinsic`, added at all four sites in
the same commit. Neither pair spent a day declared-but-unlowered, which is the window that creates a
shadowing hatch (§I3): they are reserved at the definition from their first commit, and
`store-narrow-width-user-definition-reserved.vl` / `bulk-op-user-definition-reserved.vl` say so.

One place the narrow pair is NOT like the wide three: their VALUE operand is an i32, so it takes the
ordinary `emitMemIntrinArg` spine rather than an `emitExprAs{I64,F32,F64}` widening. The wide arm's
dispatch ended in an `else` that meant f64; a narrow name added to the list and forgotten there would
have put an f64 operand under an i32 opcode. `memStoreValueIsI32` makes that a two-way choice over a
total predicate instead. Sabotaging it back is one of §K5's rows, and it reddens six fixtures.

### K3. What is NOT the same as the loops it replaced

Two behaviour deltas, both real, both handled — and the second is the one a "pure optimization"
framing would have missed:

1. **The access WIDTH is now the instruction's.** The `store8` emulation touched 4 bytes where the
   instruction touches 1. §J5 argued that was unobservable from VL (no threads, no shared memory)
   and it was right — but it is observable from the HOST, through the exported memory. That
   assertion now exists (`tests/vl_exported_memory_test.ts`): the host pre-paints sixteen bytes,
   calls a guest function that does three narrow stores, and reads back exactly 1 and 2 changed
   bytes with the neighbours intact. It is the one assertion the emulation would have failed.
2. **`len` is UNSIGNED in both bulk instructions, and the loops it replaced were signed.** A VL
   `while i < len` with `len = -5` writes nothing; `memory.fill(d, v, -5)` is a request for
   4294967291 bytes and TRAPS. `buffer-bulk.vl` pinned the no-op behaviour, so `std:buffer`'s `fill`
   and `copyFrom` guard `len > 0` and the pin holds. **§J9 item 4's claim that S6 "replaces two
   bodies and changes no signature or expectation" is therefore true only WITH that guard** — the
   naive swap reddens a pinned cell, which is exactly what it is there for.

   The layering is deliberate: the intrinsic IS the instruction (`bulk-negative-length-traps.vl`
   pins that `__memory_fill__(1024, 1, -5)` traps), and softening it is POLICY, which is std's under
   O1(c). A guard in the emitter would have made the intrinsic something other than the instruction.

A third, smaller one, recorded because it cost a build: a bare `return` in a void VL function
type-checks and then fails at emit (`emitProgram: bare return is not supported`). The guards are
spelled as positive `if`s. `vl check` was clean on the version that could not emit.

### K4. The grid: 31 probe cells, and the two INVERTED controls that earned their place

Outcome classes, worst to best: C0 silent-wrong · C1 invalid/trap · C2 emit-error · C3 check-reject ·
C4 correct. **Before: 27 cells at C3, 4 at C4. After: 29 at C4, 2 at C0 BY DESIGN — no cell moved
backward.** The 4 that were "C4" before were arity/void REJECT controls passing for the wrong
reason: they read `undeclared identifier`, and they now read `wrong number of arguments: expected 3,
got 2` and `cannot bind the void result` — the real diagnostics, the same correction §I2 recorded.

The two C0 cells are the inverted controls, and they are the reason the other 29 mean anything:

- `ctl-inverted-store8-truncation` expects 511 from `__store_i8__(a, 511)` — what a store that
  failed to truncate would print. It reads 255, i.e. C0. A grid where every cell is graded "the run
  was clean" would have called it C4.
- `ctl-inverted-copy-overlap` expects `1,2,1,2` — what a naive FORWARD loop produces for an
  overlapping copy with the destination above the source. It reads `1,2,3,4`. That single cell is
  the evidence that `memory.copy`'s memmove semantics are the INSTRUCTION's and not something the
  fixture arranged for.

Plus a live control (`ctl-live`, no new intrinsic, C4 on both sides) so a moved cell cannot be
blamed on the harness.

Axes covered: both narrow widths at all four word lanes including the 16-bit STRADDLE at lane 3;
truncation and the sign/zero-extension pair with the 127 / 32767 CONTROLS where both spellings must
AGREE; neighbour survival; the last legal address of each width and the byte past it; four scopes
(top level, named function, a function's implicit TAIL statement, and both lambda positions — the
B3/O7 axis); `memory.copy` overlapping in BOTH directions, at zero length, self-copying, and across
the 64 KiB page boundary; `memory.fill` at zero length, unaligned, truncating its byte, and over a
FULL page.

### K5. Grading the instruments by sabotage: 11 of 11, and the three that are engine coverage

§I6's hazard was honoured rather than assumed: the pristine seed was saved once and restored BY
COPY, never rebuilt, and its `sha256 f1bea9fc…` is identical before the first sabotage and after the
last. The baseline sweep is empty on both ends.

| sabotage | fixtures that redden |
| --- | --- |
| `i32.store8` opcode → `i32.store` (4 bytes) | narrow-round-trip, buffer-narrow-stores, **HOST** |
| `i32.store16` opcode → `i32.store8` (1 byte) | narrow-round-trip, buffer-narrow-stores, buffer-bulk, buffer-widths, **HOST** |
| narrow store VALUE routed as f64 | narrow-round-trip, bulk-copy-and-fill, buffer-narrow-stores, buffer-bulk, buffer-widths, **HOST** |
| `memory.copy` emits ONE memory index | bulk-copy-and-fill, buffer-narrow-stores, buffer-bulk, buffer-widths |
| `memory.copy` / `memory.fill` sub-opcodes swapped | bulk-copy-and-fill, buffer-bulk |
| narrow stores dropped from `nameIsMemStoreIntrinsic` | narrow-round-trip, bulk-copy-and-fill, buffer-narrow-stores, buffer-bulk, buffer-widths, **HOST** |
| `i32.store8` opcode → `i32.store16` | narrow-round-trip |
| std `fill` drops the `len > 0` guard | buffer-bulk |
| std `store8` off by one | buffer-narrow-stores, buffer-bulk |
| std `copyFrom` swaps src and dst | buffer-bulk |
| std `store8` masks the address into page 0 | buffer-store8-past-memory-traps |

**11 of 11 sabotages reddened something; 7 of 10 fixtures were reddened by at least one.** The three
that were not are `store-narrow-past-page-end-traps`, `bulk-copy-past-page-end-traps` and
`bulk-negative-length-traps`, and that is a fact about what they pin rather than a hole: they assert
the ENGINE's bounds check, which no emitter sabotage in this set can silence. What makes each of
them a BOUNDS proof rather than a page-boundary artifact is the paired success cell —
`bulk-copy-and-fill.vl` performs the identical 65534 copy successfully after a `__memory_grow__(1)`.
Said out loud here so the next reader does not mistake unreddened for asleep.

### K6. The zeros, graded

- **Corpus A/B, six channels** (check rc, check message, build rc, build message, emitted bytes, run
  rc + stdout) against master's own compiler, 1610 files: **19 rows differ and 1591 are identical on
  all six**. All 19 are files this change adds or touches — the 7 new fixtures, `std/buffer.vl`, and
  the 11 `tests/cases/std/buffer-*.vl` that import it. **Field 5 (emitted bytes) is `same` for all
  1610**: no pre-existing program's wasm moved by a byte. Two of the 19 move in the REJECT direction
  (`CHECKRC(0/1)`) and both are the user-definition-reserved fixtures — the reservation working, and
  itself the pinned behaviour.
- **Fuzz A/B**, 5 pinned seeds × 200 programs, both compilers: byte-identical output on every seed,
  all findings pre-existing REJECTs on both sides. **This proves absence of collateral damage and
  nothing else** — `fuzzgen.vl` emits no memory intrinsic and no `std:buffer` import, so no defect in
  this slice could reach a generated program. It is a state-reach instrument here, not a live one.
- **`wasm-opt -O` on a bulk-memory module: rc=0, and the optimized module still runs correctly.**
  §B4 predicted a hard `bail!` the day the emitter first wrote these opcodes; the
  `--enable-bulk-memory` flag was pre-landed (S0) and this is the first time that prediction was
  testable against a module VL actually emitted. It holds.
- Seed size 1053279 → 1054554, **+1275 bytes**. Fixpoint proven at both `refresh-compiler.sh
  --prove-fixpoint` and `native-fixpoint.sh`.

### K7. Where §J9's list stands now

1. ~~O1, O5, O6, O2, O3~~ — ruled (§J2).
2. ~~S1 / O7, the capture fix~~ — done (§I4).
3. ~~The two NARROW store widths~~ — **done**, this section. `poke8` is deleted and
   `buffer-narrow-stores.vl` passes unchanged, as §J9 required.
4. ~~S6 bulk ops~~ — **done**, this section. It did change one thing §J9 said it would not: the
   unsigned length (§K3).
5. ~~S5 `std:buffer`~~ — done (§J).
6. **§G's per-access call cost under a hot loop** — still open, still the number that decides O1(b)
   versus leaving O1(c) permanent, and now more interesting than it was: every `std:buffer` body is
   one instruction, so the measurement is cleanly "the call overhead" with nothing else in it.
7. **New, and small:** `driver.vl`'s `builtinScan` LSP completion list (§B7) still has none of the
   memory dunders — now 20 of them. Out of this change's file partition; unchanged in kind, four
   names larger in degree.
8. **New:** `tests/selfhost_native_align_test.ts`'s explicit whitelists still do not carry the
   `std:buffer` fixtures (§J7) or this slice's seven. All were adjudicated natively by hand here —
   `vl run` stdout equal to the `@log` lines, `vl check` clean, nonzero exit for the traps — but
   promoting them belongs to that file's owner.

---

## L. What shipped: typed views (webcraft P1.1) — and the per-access call cost, finally measured

### L1. The slice: `F32View` / `I32View`, and ZERO compiler lines again

`std:buffer` grows a view tier:

```vl
export type F32View = new { base: i32, length: i32 }
export type I32View = new { base: i32, length: i32 }

export function f32view(self: Buf, off: i32, count: i32): F32View
export function i32view(self: Buf, off: i32, count: i32): I32View
export function getF32(self: F32View, i: i32): f32      // and setF32
export function getI32(self: I32View, i: i32): i32      // and setI32
export function byteAddrF32(self: F32View, i: i32): i32 // and byteAddrI32
```

`buf.f32view(off, count)` re-describes a `Buf` byte range in ELEMENTS. `.length` is the element
count and is a plain struct field — no call, no side table, exactly as `Buf.length` is. Every body
is one instruction plus its address arithmetic, plus the bounds check §L3 rules.

**No compiler file was touched, and the seed is byte-identical.** `refresh-compiler.sh
--prove-fixpoint` reports `compile(seed) == seed` and `build/vl-compiler.wasm` stays at 1054554
bytes — the same number §K6 recorded. That is the strongest available form of "zero compiler
lines": not "the diff has none", but "the compiler binary did not move by one byte". S5's lesson
(§J1) held a second time.

What the surface does NOT include is the spec's `x[i]` / `x[i] = v` sugar. §L5 is the measured
reason, and it is not "it was hard".

### L2. The finding that chose the field names: two views are the SAME TYPE

The obvious spelling is `{ base: i32, length: i32 }` for both. It does not work, and the reason is
not a detail:

> VL is STRUCTURALLY typed. `type X = {…}` names a shape; it does not mint an identity. Two
> declarations with the same field names and types **are the same type**.

Measured before the names were chosen, single-file, no std involved:

```vl
type F32View = { base: i32, count: i32 }
type I32View = { base: i32, count: i32 }
function readF(self: F32View, i: i32): f32 { return __load_f32__(self.base + (i << 2)) }
__store_i32__(1024, 1065353216)          // the f32 1.0 bit pattern, written as an INTEGER
const iv: I32View = { base: 1024, count: 1 }
print(readF(iv, 0))                      // → 1
```

`vl check` is clean. An `I32View` satisfies every `F32View` parameter and the integer bytes come
back reinterpreted as a float, silently. Spelled that way the element type is not part of the type
at all — the two views are one type with two names, and the whole point of a *typed* view is gone.

**This was a hidden dependency of P1.1 on P1.5**, and it is the reason P1.5 was pulled forward. The
requirements doc ordered nominal/opaque types after typed views and presented them as unrelated;
P1.1's surface as literally spec'd — two view types over the same `{base, count}` shape — is not
expressible soundly without P1.5.

#### L2a. What it was, for the interim: the width in the FIELD NAME

The tier first shipped with the discriminator put where a structural checker could see it:
`f32base` and `i32base`. That bought exactly one reject, and its message named the STRUCTURE
because `tyToStr`'s `TyObj` arm has no name to print — itself the evidence that no nominal identity
existed to lean on:

```
no field 'getF32' on {i32base: i32, length: i32}
```

#### L2b. What it is now: `new`, and it made the module SMALLER

Both views are declared with a zero-cost nominal newtype (`docs/internals/newtype-design.md`), and
both address fields are plainly `base`:

```vl
export type F32View = new { base: i32, length: i32 }
export type I32View = new { base: i32, length: i32 }
```

The same pin now reads `no field 'getF32' on I32View` — the alias, because a newtype gives the
renderer a name. Three measurements decide whether this was worth doing, all against the same
compiler so the std source is the only variable:

| leg | result |
|---|---|
| the confusion cell | `vl check` rc **1** with `new`, rc **0** with `new` deleted from the two declarations — the reject is the newtype's doing, not an artifact |
| erasure | all **8** correct view programs in `tests/cases/std/` emit **byte-identically** to the same std with `new` deleted |
| size vs the `f32base`/`i32base` std | **−12 bytes on every one of them** |

The size result is the one worth stating plainly: putting the width in the field name made the two
views two DIFFERENT shapes, so they needed two wasm heap types. Restoring `base`/`base` makes them
one shape again — the structural slot dedup collapses them to one heap type — while `new` keeps
them two TYPES. **The safety came back and a heap type went away.** Every further width this family
grows (i64, f64, the narrow widths) is one more `new`, not one more name hack.

The same argument still says `Buf` itself (`{base, length}`) is distinct from the views only by luck
of field naming — `Buf` is not a newtype. That is pre-existing and unchanged; it is worth knowing
that this one corner of the tier's type safety still rests on it, and that the fix is now a
one-word edit whenever it is wanted.

### L3. The bounds policy, ruled and STATED (P1.4's actual ask)

**Ruled: a view is FENCED, and it is the only thing in `std:buffer` that is.**

Everything else in the tier obeys §A4 — no VL-level check anywhere, the engine's own trap is the
memory-safety proof, and a `Buf` describes an extent without fencing it. Views deliberately break
that symmetry, because their failure mode is the one the engine cannot see:

| access | where it lands | engine's opinion | consequence unfenced |
|---|---|---|---|
| `buf.loadF32(1000000)` past the memory | outside linear memory | **traps** | caught, loud |
| `view[length]` — one element past a column | inside the memory, inside the `Buf`, inside the NEXT COLUMN | **fine** | a neighbour's bytes, silently |

The second row is the entire SoA kernel's bug class. `tests/cases/std/buffer-view-bounds-control.vl`
pins it as a measurement rather than an argument: it computes the exact addresses the trap fixtures
reach for, reads them through `Buf`'s unfenced accessors, and every read SUCCEEDS and returns a live
neighbour (99.5 one element past, 4242 one element before). The engine has no objection to any of
them. So the engine's trap is not the mechanism protecting a view, and the VL-level check is not
redundant with it.

The policy, in full, so kernel code can be written to it deliberately:

1. **Per access: `0 <= i < length`, trapping via `__trap__` (`unreachable`).** Loud, deterministic,
   unrecoverable — the same class of stop as the engine's own bounds trap, and the same one
   `Buffer(-1)` already takes. Two signed compares, not one unsigned: VL has no unsigned comparison
   operator, so the single `i u< len` trick the emitter uses for native arrays
   (`wasmEmit.emitListIdxGuard`) is not spellable in std VL.
2. **Per view, once: the extent check.** `f32view(off, count)` traps unless `[off, off + count*4)`
   lies inside the `Buf`. This is what lets (1) be just `0 <= i < length` — an extent validated at
   construction means an in-range index cannot leave the `Buf`. It also moves the diagnosis to the
   line that got the arithmetic wrong instead of to an access arbitrarily later. Same layering as
   `Buffer(n)`, which validates at allocation time and then never again (§J3).
3. **The bound is NOT hoisted out of the canonical loop.** There is no LICM in VL, and binaryen at
   `-O3 --closed-world --gufa` does not remove the check either — measured, §L4, it survives and
   costs 0.34 ns per element-update. P1.4 asks that the loop "either hoists the bound or relies on
   the memory trap, and that this is *stated*". It does neither: it checks, every time, and here is
   the number.
4. **The deliberate fast pattern, for a kernel that has proved its own bounds**, is to take the base
   ONCE and run the bare intrinsics inside:
   ```vl
   const xb = x.byteAddrF32(0)
   const n = x.length
   let i = 0
   while i < n { __store_f32__(xb + (i << 2), …) ; i = i + 1 }
   ```
   Measured identical to the hand-written raw kernel at every optimization level (§L4, the `hoist`
   row). `byteAddrF32` is unchecked on purpose — it computes an address, it does not dereference
   one, and the one-past-the-end address is the useful answer for a range rather than an error.
   `Buf`'s `loadF32`/`storeF32` are also still there, still unfenced, still byte-offset.
5. **A view cannot protect against outliving its bytes.** `bufferRelease` still dangles (O6), and a
   stale view passes both its own check and the engine's — `buffer-view-release-dangles.vl` pins the
   silent corruption. Documented, not fixed.

### L4. The per-access call cost under a hot loop — §G's open question, closed

§G filed this as undeterminable ("there is no such kernel to run yet and a synthetic one would
measure binaryen, not VL") and §K7 item 6 kept it open as "the number that should decide O1(b)
versus leaving O1(c) permanent". It is now takeable, because `std:buffer` exists and every body is
one instruction.

The kernel is P1.1's own canonical loop, `x[i] += vx[i]`, over N=1,000,000 f32 elements × R=500
trips = **500,000,000 element-updates** (three accesses each: two loads and a store). Four spellings
of the *same* loop, built to `.wasm` once and then run — so no compile time is in any timing — each
against an **R=0 build of the identical file as the inverted control** (same module, same 8 MiB of
allocation, zero trips), which is subtracted. Every build's stdout is asserted to equal R, so a loop
that was optimized away is reported as wrong rather than as fast. Medians of 5, wasmtime via the
Rust host, ns per element-update:

| spelling | what it is | (none) | `-O` | `-O3 --closed-world --gufa` |
|---|---|---|---|---|
| `raw`   | bare `__load_f32__`/`__store_f32__`, hand-computed addresses | 0.426 | 0.452 | 0.434 |
| `hoist` | view for the extent, base taken ONCE, bare intrinsics inside | 0.426 | 0.436 | 0.418 |
| `buf`   | `Buf.loadF32`/`storeF32` — a call per access, NO check | 2.436 | 2.504 | 0.700 |
| `view`  | `F32View.getF32`/`setF32` — a call per access AND the check | 2.734 | 2.530 | 1.044 |

Five things fall out, in order of how much they should change behaviour:

- **`-O` does not inline the wrappers; `-O3 --closed-world` does.** `buf` moves 2.44 → 0.70 ns, a
  3.5× swing on one flag choice. §O1 asserted this from binaryen's behaviour on the wrappers; this
  is the first time it has been priced on a kernel. **The release profile is not optional** — a sim
  built at `-O` runs its columns at a quarter speed. P1.3 already asks for `--closed-world` in the
  blessed pipeline; this is the number behind that ask.
- **The CALL is the cost. The CHECK is not.** Unoptimized, the wrapper call is 2.01 ns/element and
  the bounds check is 0.30 — the check is 11% of the view's total and 13% of the wrapper overhead.
  Per access the check is ~0.10 ns, i.e. under a third of a cycle: two well-predicted compares
  costing issue slots and nothing else. **Nobody should trade the bounds policy away for speed
  before trading the call away**, and the call is free to trade (`hoist`).
- **The escape hatch is genuinely free.** `hoist` is `raw` to within noise at all three levels — the
  view's `byteAddrF32` and `.length` cost nothing once out of the loop. So the fenced surface and
  the raw speed are both available in the same program without leaving `std:buffer`, which is what
  makes the strict per-access policy affordable to rule.
- **O1(c) stands.** The std-VL lowering costs 5.7× the raw kernel unoptimized and **1.6× at
  `-O3 --closed-world`**, with a free escape hatch for the loops that care. That is not a case for
  moving `Buffer` into the compiler (O1(b)); it is a case for documenting the release profile, which
  §L3(4) and this section now do. §K7 item 6 is closed.
- **Inlining does not close the gap completely, and the residue is attributable.** At `-O3
  --closed-world` `buf` is still 0.27 ns/element above `raw` with no call left in it. The difference
  between the two spellings at that point is that `buf` does a `struct.get` of `self.base` per
  access where `raw` and `hoist` hold the base in a local — i.e. the loop-invariant load is not
  hoisted. That is ROADMAP B6b's "backing-pointer hoisting (LICM)" showing up with a price tag for
  the first time. Attributed, not proven: the two spellings differ in that one respect and the
  `hoist` row isolates it, but no disassembly was read.

Caveat on the middle column: `-O` and unoptimized differ by up to 8% in both directions across
these rows (`buf` 2.436 → 2.504 but `view` 2.734 → 2.530). That is this harness's noise floor, and
it is why the load-bearing claims above are all drawn from the ~4× and ~6× gaps rather than from
anything inside 10%.

### L5. `x[i]`: four routes, all measured, none taken — and why that is not a punt

P1.1 spells the surface `x[i]` / `x[i] = v`, and calls raw addressing "the thing most worth
absorbing into the language". This slice ships `x.getF32(i)` / `x.setF32(i, v)` instead. The
routes to the bracket form were enumerated and probed first; here is what each is blocked on.

**The framing that decides it: the sugar is PURELY SYNTACTIC.** Under every dispatch route that
exists or is planned, `x[i]` lowers to exactly the call that `x.getF32(i)` already lowers to —
`emitIndex` is not reached at all, the rewriter turns the bracket into a call before the emitter
sees it (`emit_rewrite.vl:312-323`). Only a built-in nominal arm inside `emitIndex` would emit a
bare `f32.load`, and §L4 prices that whole prize at the 0.34 ns/element check plus the 0.27
un-hoisted `struct.get` — both of which the free `hoist` spelling already recovers today. So the
bracket buys spelling, and spelling only.

- **Route 1 — the existing B13 `"[]"` / `"[]="` closure-field trap.** Zero compiler lines: a view
  would carry its accessors as closure fields. **Refuted on three counts, two of them defects
  (§L7).** An f32-returning `"[]"` emits an INVALID MODULE; a `"[]="` closure whose body is a memory
  store writes nothing; and even repaired it is an INDIRECT call through a per-view closure
  allocation — strictly worse than the direct call the UFCS spelling already gets, and pointed the
  wrong way for the hot loop this whole tier exists for.
- **Route 2 — a free `self`-function named `"[]"`.** This is the right long-term answer and it is
  already on the roadmap as B14's remaining item ("route operator dispatch (B13) through
  self-methods"): a DIRECT call, general over any user type, nothing nominal. Three real blockers,
  and the first is the interesting one:
  - `function "[]"(self: V, i: i32)` **does not parse** — `expected an identifier but found "[]"`.
    Which means `drwSelfFnOf(n.binOp, 2)` at `emit_rewrite.vl:281`, the binary-operator arm of
    exactly this mechanism, **is unreachable dead code today**: no function can be *named* an
    operator, so the lookup can never hit.

    > **CORRECTION (B14).** The premise holds and the conclusion does not. `isOpFuncName` has always
    > accepted the operator SYMBOL tokens, so `function +(self: V, b: V)` parses and runs
    > (`tests/cases/objects/operator-self-method.vl` pins it) and the arm was live the whole time.
    > Only the BRACKET operators lacked a spelling, because `[` and `]` open an index expression
    > everywhere else. B14 adds a QUOTED name form, which serves both.
  - `checkIndexNode` (`typecheck.vl:19154-19175`) has no arm for it; its `TyObj` case consults a
    `"[]"` FIELD and nothing else.
  - **Module-merge mangling.** The UFCS path launders the property through `ufcsAliasOf`
    (`emit_rewrite.vl:165`) *precisely because* a merged free `self`-function becomes `shout$m1`.
    The operator arm at :281 uses the RAW name with no such laundering — so a `"[]"` provided by
    **std** would not be found across the merge, which is exactly and only the case P1.1 needs. This
    is why route 2 is a language feature to design, not a views feature to bolt on.

    > **RULED (B14).** The diagnosis is right — a cross-module `+` is measurably broken on master
    > and stays broken — but it does NOT transfer to the bracket, and the reason is structural: a
    > UFCS call site carries a property STRING the merge deliberately leaves plain, which is what
    > creates the plain→mangled gap, whereas **a bracket names nothing**. B14 keys its operator
    > registry off the MERGED program's declarations, so the mangled name is the only name it ever
    > holds and no alias is needed. `index-operator-design.md` §R4.
- **Route 3 — a nominal hook keyed on the type name `F32View`.** It would be the first nominal thing
  in the language, and it does not survive its own first question: `structNameOfTy`
  (`typecheck.vl:6890`) maps ANY declared struct to its name and knows nothing about std, so a
  user's own `type F32View = {…}` is captured by the hook. Namespacing std type names in the arena
  is a much larger change than the sugar it would buy.
- **Route 4 — a structural hook keyed on the `f32base` field.** Rejected on sight: it promotes §L2's
  naming workaround — which exists only because P1.5 has not shipped — into load-bearing compiler
  surface, and any user struct with a field named `f32base` silently acquires view indexing.

**Filed, with the design:** take route 2, as B14, generally — parser support for a string-literal
function name, a `checkIndexNode` arm, a merge-safe operator lookup (`ufcsAliasOf` applied at
`emit_rewrite.vl:281` and at a new Index arm), and the `"[]="` write form. That lands `x[i]` for
every user type at once, makes the dead operator arm reachable, and costs `std:buffer` four more
tiny functions. It is not on P1.1's critical path, because the kernel ergonomics P1.1 is actually
after are available today at `x.getF32(i)` with identical codegen.

> **TAKEN.** B14 shipped route 2, with two of the three "blockers" ruled differently than filed
> above (the arm was never dead; the merge needed no alias). The one thing this plan did not
> anticipate is what actually decided the design: `std:buffer` has TWO view types in ONE module, and
> a second `function "[]"` is a redeclaration — so an index operator's DECLARATION NAME carries its
> receiver (`[]@F32View`) and dispatch is by the receiver's type. `index-operator-design.md`.

One consequence to design in when it is taken: `x[i] += vx[i]` desugars in the PARSER to
`x[i] = x[i] + vx[i]` sharing one target node (`ast.vl:716-735`), so the receiver and index are
evaluated TWICE under any dispatch route. Harmless for a local and an induction variable; not
harmless for `x[f()] += 1`.

> **MEASURED (B14).** This is already the behaviour of a NATIVE array — `a[idx()] += 10` calls
> `idx()` twice — so the bracket inherits an existing rule rather than introducing one, and the
> operator route was shipped consistent with it rather than fixed against it.

### L6. What the corpus pins

Ten fixtures, all under `tests/cases/std/`:

- `buffer-views.vl` — the round-trip and aliasing grid. Address arithmetic is cross-checked against
  `Buf.loadF32`/`loadI32` **rather than against another view**: a view and its own reader agreeing
  proves nothing. Both directions (view write → raw read, raw write → view read), the f32 bit
  pattern (so a view is shown to store no tag and no header), a disjoint i32 view, two views
  aliasing the same bytes, a partially-overlapping offset view, and `byteAddrF32` deltas.
- `buffer-view-index-past-end-traps.vl`, `-negative-index-traps.vl`, `-write-past-end-traps.vl` —
  the three bounds traps. **They carry no `@log`**, deliberately: the harness ignores `@log` when
  `@trap` is set (`cases_wasm_test.ts:453`), so log lines on a trap case are decoration that
  asserts nothing. Their inverted controls are separate `@run` files.
- `buffer-view-bounds-control.vl` — the inverted control for all three, and the §L3 measurement:
  every address those cases reach for is read here through `Buf`'s unfenced accessors and every read
  succeeds against a live neighbour.
- `buffer-view-extent-traps.vl` / `-extent-control.vl` — the construction check, and its three legal
  boundaries (a view exactly filling the `Buf`, an empty view, an empty view at the one-past-the-end
  offset). A check that trapped on everything would satisfy the trap case alone.
- `buffer-view-element-type-mismatch.vl` — §L2's reject, the entire return on the `f32base` naming.
- `buffer-view-release-dangles.vl` — the mark/release hazard reaching views, pinned as behaviour.

Not pinned, and out of this change's file partition: **host visibility through the exported memory**.
A view writes with the same `f32.store` into the same exported memory as every other accessor, and
`byteAddrF32` hands a host the exact byte address, so `tests/vl_exported_memory_test.ts` needs
nothing new to stay true — but that file was not touched and the claim is by construction rather
than by assertion.

### L6a. The size tax on every `std:buffer` importer — and the flag that removes it

The prescribed corpus A/B varies the COMPILER. This change does not move the compiler by a byte, so
that instrument is frozen-identical **by construction** and read 1619/1619 `same` on all six fields
— it proves the absence of compiler drift and nothing at all about the change. The live instrument
for a std-only change varies the STD DIRECTORY with the compiler held fixed. Run that way:

**20 rows differ, 1599 identical on all six.** Nine are this slice's own new fixtures (they do not
compile against the old std, correctly). Eleven are the PRE-EXISTING `tests/cases/std/buffer-*.vl`
fixtures, and they differ on fields 4 and 5 — **their emitted bytes moved**, even though not one of
them mentions a view. Field 6 (run rc + stdout) is `same` for all eleven: no behaviour changed.

Measured, that movement is a flat **+422 bytes on every program that imports `std:buffer`**,
identical across six fixtures of very different sizes — so the module merge brings in every exported
function of an imported std module whether it is reachable or not. Bisected by building a
half-surface std with the i32 view family removed:

| `std:buffer` contains | `buffer-alloc.vl` | delta |
|---|---|---|
| no views (master) | 1076 | — |
| f32 views only (+ the shared extent helper) | 1336 | +260 |
| f32 + i32 views (shipped) | 1498 | +422 |

**Each additional width family costs ~162 bytes on every importer**, used or not, and it scales
linearly — the i64/f64/narrow widths a later slice adds would take that toward a kilobyte for a
program that only wanted `Buffer(n)`.

It does not reach a shipped module:

| `buffer-alloc.vl` | (none) | `-O` | `-O3 --closed-world --gufa` |
|---|---|---|---|
| old std (no views) | 1076 | 530 | **394** |
| new std (views) | 1498 | 610 | **394** |

**Byte-identical at `-O3 --closed-world` — the unused surface is eliminated completely.** Which is
the same flag §L4 shows is required to inline the accessors. Two independent findings converge on
one recommendation: `-O3 --closed-world` is the release profile, it is worth 3.5× on kernel speed
AND it is what keeps std's surface from being a size tax. A build at `-O` gets neither.

The residual question this leaves open, for whoever grows the width family: whether the merge should
prune unreachable exported functions from an imported module itself, rather than leaning on
binaryen. The generics path already does something of this shape (uncalled `<T>` generics are pruned
to no-op stubs); plain exported functions are not pruned at all.

### L7. Two defects this slice did not go looking for

Both are in the B13 index-trap path (route 1 above), both pre-date this slice, and neither is
touched by it — `std:buffer` uses no closure fields.

1. **An f32-returning `"[]"` closure field emits an invalid module.**
   ```vl
   function mkview(base: i32) { { "[]": (i: i32) => __load_f32__(base + (i << 2)) } }
   const v = mkview(1024)
   const a = v[0]
   ```
   → `Invalid input WebAssembly code: type mismatch: expected i32, found f32`. The i32 twin of the
   same program runs. **Inverted control:** the identical closure stored under an ORDINARY field
   name and called directly (`m.get(0)`) returns 1.5 correctly — so the defect is in the trap
   rewrite's result typing, not in f32 closures.

   > **FIXED.** The inverted control was the whole diagnosis, one step further in: `m.get(0)` is a
   > node the CHECKER typed, so the f32 classifier's typed-IR fast path answers for it, while the
   > trap rewrite MINTS its member-call node and the fast path reads -1. Behind the fast path the
   > f32 classifier's `Call` arm knew only an IDENT callee — the FIELD-CLOSURE arm that
   > `exprIsF64` and `exprIsI64` both carry was missing, so the f32 result was bound into an i32
   > local. One arm; `tests/cases/index/f32-closure-field-read.vl` pins it with the i32 twin, the
   > ordinary-name control and f32 arithmetic over two trapped reads. The memory intrinsic is
   > incidental — a `"[]"` returning a captured f32 fails identically.
   >
   > The bracket was HALF the defect. The rewrite mints a member-call node for the `a op b`
   > operator-field route too, so an f32-returning `"+"` closure field emitted the same invalid
   > module and was never filed; the one arm closes both
   > (`tests/cases/objects/operator-field-f32-result.vl`).
   >
   > This also removes the FIRST of route 1's three refutations in §L5. The other two stand: the
   > `v[0] += 3` cast-failure trap below, and the indirect-call-through-a-per-view-allocation cost
   > that made route 2 the answer anyway.
2. **A `"[]="` closure field whose body is a memory-store intrinsic stores nothing.**
   ```vl
   function mkview(base: i32) {
     { "[]": (i: i32) => __load_i32__(base + (i << 2)),
       "[]=": (i: i32, v: i32) => { __store_i32__(base + (i << 2), v) } }
   }
   const v = mkview(1024)
   v[0] = 11
   print(__load_i32__(1024))   // 0 — the raw read, not the trap's
   ```
   Both the raw read and the read back through `"[]"` answer 0. The write dispatches (or does not)
   silently; no diagnostic, no trap.

   > **STALE — does not reproduce (re-measured at B14, master `eb9e05ca`).** That exact program
   > prints **11**, the value it wrote. Whatever this described is either since fixed or was
   > mis-measured; it is kept here as a record of the claim, not of a live defect. Defect 1 above
   > DOES still reproduce, unchanged.
   >
   > A third, seen while re-measuring these two: `v[0] += 3` on the SAME closure-field trap TRAPS
   > (`wasm trap: cast failure`) — on master and unchanged by B14. The free-function route handles
   > the same spelling correctly, so the two index routes now differ on compound assignment.

Neither was narrowed further — they are outside this slice's partition and outside its surface.
They matter to record because route 1 is the obvious "zero compiler lines" way to reach for `x[i]`,
and it is the one route that looks free and is not.

### L8. Where §K7's list stands now

1. ~~O1, O5, O6, O2, O3~~ — ruled (§J2). **O1(c) now has its number** (§L4) and stands.
2. ~~S1 / O7~~, ~~narrow stores~~, ~~S6 bulk ops~~, ~~S5 `std:buffer`~~ — done (§I4, §K, §J).
3. ~~**§G's per-access call cost under a hot loop**~~ — **closed** (§L4): 5.7× raw unoptimized,
   1.6× at `-O3 --closed-world`, with the bounds check only 11% of it and a free hoisted escape
   hatch. The actionable half is that `-O` is not enough and the release profile must be stated.
4. **P1.1's `x[i]` sugar** — not shipped, filed with four measured routes and a design (§L5). Wants
   ROADMAP B14 done generally, not a views hook.
5. **P1.1 depends on P1.5** — new, and the most useful thing here for sequencing (§L2). Two typed
   views are not soundly expressible over one structural shape; the `f32base`/`i32base` naming is a
   workaround that a zero-cost newtype would delete.
6. **`driver.vl`'s `builtinScan` LSP completion list** (§B7) still carries none of the 20 memory
   dunders. Unchanged, still out of partition.
7. **`tests/selfhost_native_align_test.ts`'s whitelists** still do not carry the `std:buffer`
   fixtures (§J7, §K7) or this slice's ten. All ten were adjudicated natively by hand here — `vl run`
   stdout equal to the `@log` lines, `vl check` clean, nonzero exit for the four traps — but
   promoting them belongs to that file's owner.
8. **New, small:** `byteAddrF32`/`byteAddrI32` are the only unchecked things in the view tier. They
   return an address rather than a value, which is why they are safe to leave unchecked, but they
   are also the escape hatch §L3(4) recommends — so they are the one place a kernel can reintroduce
   the unfenced behaviour the rest of the tier now prevents. That is deliberate and stated, not an
   oversight.
