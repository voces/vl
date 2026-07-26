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
second. The four-store-width world was real — in the **deleted TS compiler**: `compiler/defaultScope.ts`
defined all ten with wasm bodies until commit `f17e204e` ("kill-TS", #466) removed the file. The
declarations in `typecheck.vl` are that scope transcribed for parity; seven of them never acquired an
emitter arm.

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
export function Buffer(byteLength: i32): Buf { … }              // bump, zero-fill
export function storeI32(self: Buf, off: i32, v: i32) { __store_i32__(self.base + off, v); 0 }
export function loadI32(self: Buf, off: i32): i32 { __load_i32__(self.base + off) }
```
```
$ vl run bufmain.vl        # a.storeI32(0,111); b.storeI32(0,222)
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
wrong-answer channel. P0.1 (growth) and P0.2 (export) are individually harmless and jointly a trap
— this is the strongest argument for the allocator reserving up front rather than growing lazily.
See **O5**.

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
methods?**
Three options.
*(a) Widen the dunder floor, `Buffer` is std VL.* The compiler gains 18 generic `__load_*__`/
`__store_*__`/`__memory_*__` intrinsics; `std:buffer` defines the struct, the allocator and 14 UFCS
methods over them. Smallest compiler change, entirely in the existing idiom, and every piece is
measured working except §B3. Cost: each `buf.loadF32(i)` is a real wasm `call` — the compiler does
no inlining of its own, and **`wasm-opt -O` (what `vl build -O` runs) does not inline these
wrappers; `-O3 --closed-world` does.** Measured on the §A5 program, where the wrapper calls vanish
while the load/store instruction counts *rise* — which is what distinguishes inlining from the
whole thing being constant-folded away:

| | direct calls | `i32.store` | `i32.load` | output |
| --- | --- | --- | --- | --- |
| unoptimized | 2×`$0`, 2×`$1`, 2×`$2` | 2 | 1 | `64 111 222` |
| `-O` (host flags) | 2×`$0`, 2×`$1`, 2×`$2` | 2 | 1 | `64 111 222` |
| `-O3 --closed-world` | 2×`$0` | **3** | **2** | `64 111 222` |

So (a)'s codegen is acceptable only on the release profile P1.3 asks for, which is not today's
default.
*(b) `Buffer` is a compiler-known nominal type* whose member calls lower to single instructions. Best
codegen unconditionally, no dependency on §B3, but it is the first builtin method family on a
non-container receiver, it needs nominal-type machinery the arena does not have (see
`c1-nominal-classifiers`), and it forecloses a program defining its own `Buffer`.
*(c) (a) now, (b) later as pure optimization* — the surface is identical, so this is a codegen
change, not a language change.
**Recommendation: (c).** It is what P0.3/P0.4 did (free functions first, method sugar explicitly not
foreclosed), and it is the only option whose first slice is small.

**O2 — `store8`/`store16`, or the consumer's `storeU8`/`store16`?**
Stores have no signedness — `i32.store8` truncates and cannot distinguish. The ask spells `storeU8`
but `store16`, which is inconsistent with itself. Proposal: `store8`/`store16`, and say why in the
docs so the asymmetry with `loadU8`/`loadI8` reads as intentional. Cheap to overrule.

**O3 — `Buffer.copy(dst, dstOff, src, srcOff, len)` — what is the VL spelling?**
VL has no static methods and no namespaced calls. Options: a free function `bufferCopy(...)` exported
from `std:buffer`; a UFCS method `dst.copyFrom(dstOff, src, srcOff, len)`; or admitting
`Buffer.copy` as a new syntactic form. Proposal: **UFCS `dst.copyFrom(...)`**, because it needs no
new syntax and puts the mutated operand in receiver position, matching `dst.fill(...)`. The consumer
wrote `Buffer.copy` illustratively, not as a spelling requirement.

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

**O6 — Does `Buffer` need `free`?**
The consumer explicitly does not need it ("allocates a few large Buffers at init and never frees").
Proposal: **no free, and say so** — bump only. This is the decision that keeps §C4 out of "a second,
self-managed object model" territory, and it is the one worth being loudest about, because adding
`free` later means adding a free list, which means the DECISIONS.md line gets renegotiated.

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
