# What webcraft needs from vl

A prioritized feature/API spec for vl (`~/vl`), written against vl's actual
state as of 2026-07-25 (self-hosted fixpoint, WasmGC-only heap, scalar-only
export ABI, no Buffer tier yet, no math/RNG std, wasmtime 47). Companion to
`docs/design/performance-topology.md`, which motivates the "authoritative
state ⊆ Buffer" discipline this spec serves.

Framing: the sim (kernel/ + wc3/) is the only vl consumer. It is a pure
`(state, commands) → state'` module: almost no imports, a handful of scalar
exports called at tick/turn cadence, all bulk data through memory. vl's
existing posture — whole-program single wasm, scalar-only exports, structural
types, deterministic insertion-ordered Map, no exceptions — is already a
near-perfect fit. The gaps are concentrated in one place: **linear memory and
the numeric intrinsics to work over it**.

What vl already has that webcraft counts on (no ask, just dependencies):
`i32/i64/f32/f64` with lossless-only implicit widening + `as` casts; full
bitwise op set; structural structs deduped to shared WasmGC types;
insertion-order-deterministic Map/Set (explicitly designed for replay);
`match` with exhaustiveness; `T|null` / `T|E` error model, no exceptions;
entry-module scalar exports with the closure-env dropped; single merged wasm
module; `$VL_GC` host knob (server side).

---

## P0 — gates the M7 port starting (the Buffer tier, spec'd)

vl's roadmap already plans a scoped `Buffer` linear-memory tier (DECISIONS
"one deliberate escape hatch"; ROADMAP B-mem). This section is the concrete
requirements list from webcraft's side — what "done" needs to mean.

### P0.1 `Buffer`: allocation + full-width load/store  ✅ SHIPPED

```vl
const buf = Buffer(byteLength)      // zero-filled; grows the one linear memory
buf.length: i32
// the full width matrix, both directions (today: 4 store widths, 1 load width):
buf.loadU8(off): i32    buf.storeU8(off, v)
buf.loadI8(off): i32    // sign-extending
buf.loadU16(off) / loadI16(off) / store16(off, v)
buf.loadI32(off): i32   buf.storeI32(off, v)
buf.loadI64(off): i64   buf.storeI64(off, v)
buf.loadF32(off): f32   buf.storeF32(off, v)
buf.loadF64(off): f64   buf.storeF64(off, v)
```

> Maintainer's note (vl side): **this section is done — the whole of it.** The
> code block above is the API, spelled `store8`/`store16` rather than
> `storeU8`/`storeI8` (see below), and it lives in `std:buffer`:
>
> ```vl
> import { Buffer, bufferMark, bufferRelease } from "std:buffer"
>
> const buf = Buffer(byteLength)        // zero-filled; grows the one linear memory
> buf.length                            // i32, what you ASKED for
> buf.loadI8/loadU8/loadI16/loadU16/loadI32/loadI64/loadF32/loadF64(off)
> buf.store8/store16/storeI32/storeI64/storeF32/storeF64(off, v)
> buf.fill(off, len, byte)              // memory.fill
> dst.copyFrom(dstOff, src, srcOff, len) // memory.copy — the destination is the receiver
> bufferMark() / bufferRelease(mark)    // LIFO reclamation; no per-object free
> ```
>
> Every one of those bodies is a single wasm instruction plus its address
> arithmetic. Underneath is a raw intrinsic floor a program may use directly —
> eight loads, six stores, the two size ops and the two bulk ops, twenty in all:
>
> ```vl
> __load_i8__(a): i32     // i32.load8_s   — sign-extends
> __load_u8__(a): i32     // i32.load8_u   — zero-extends
> __load_i16__(a): i32    // i32.load16_s
> __load_u16__(a): i32    // i32.load16_u
> __load_i32__(a): i32    // i32.load
> __load_i64__(a): i64    // i64.load
> __load_f32__(a): f32    // f32.load
> __load_f64__(a): f64    // f64.load
> __store_i8__(a, v: i32)     // i32.store8    — truncates
> __store_i16__(a, v: i32)    // i32.store16   — truncates
> __store_i32__(a, v: i32)    // i32.store
> __store_i64__(a, v: i64)    // i64.store
> __store_f32__(a, v: f32)    // f32.store
> __store_f64__(a, v: f64)    // f64.store
> __memory_size__(): i32           // pages currently mapped
> __memory_grow__(pages): i32      // the PREVIOUS page count, or -1 on failure
> __memory_copy__(dst, src, len)   // memory.copy — memmove, overlap-safe both ways
> __memory_fill__(dst, byte, len)  // memory.fill
> ```
>
> `a` is a byte address into the module's linear memory, which is **exported as
> `memory`** (P0.2, below). Four things worth knowing before you build on this:
>
> - **Stores have no signed/unsigned split, and that is deliberate.** There is
>   one instruction per width and it truncates — `i32.store8` cannot tell a
>   signed byte from an unsigned one — so `storeU8` would falsely imply a signed
>   twin. The loads keep their split because there really are two instructions:
>   of the byte `0xFF`, `loadI8` answers -1 and `loadU8` answers 255. Your spec
>   spelled `storeU8` alongside `store16`; the matrix normalizes both.
> - **The bulk pair's `len` is UNSIGNED**, because the instruction's is. A
>   negative length passed to a raw `__memory_fill__` is ~4 GiB and traps. The
>   `std:buffer` wrappers guard it (`len <= 0` writes nothing) — that is policy,
>   and policy is std's.
> - **`memory.copy` is memmove, not memcpy.** It is defined to behave as if the
>   bytes went through a temporary, so an overlapping snapshot/rollback in either
>   direction is correct without your choosing a direction. Pinned by value in
>   both directions.
> - **`memory.grow` detaches every host view**, silently: `byteLength` becomes 0
>   and an indexed read returns `undefined` rather than throwing. Re-read
>   `.buffer` after any call that can grow; never cache a view across a guest
>   call.
>
> The scope limitation this note used to carry — *"top level and plain named
> functions only"*, a `captured variable not found in enclosing frame` failure
> for every memory intrinsic in a module containing any function value — **is
> fixed** and was fixed before the `Buffer` surface shipped, which is why that
> surface exists at all. `buffer-design.md` §I4. Intrinsics work at top level, in
> named functions, as a function's implicit tail statement, and inside lambda
> bodies; all four positions are pinned in the corpus.

- A real allocator (bump is fine — the sim allocates a few large Buffers at
  init and never frees), replacing today's "program picks raw addresses,
  two users collide" scratch page.
  > Done: a bump allocator in `std:buffer`, 8-byte aligned, growing the memory
  > lazily, with a reserved low kilobyte that `std:buffer` promises never to hand
  > out (so a program poking raw addresses has documented room, and `base == 0`
  > can never be a legitimate `Buf`). Reclamation is `bufferMark()` /
  > `bufferRelease(mark)` — LIFO, free, and it CAN DANGLE: a `Buf` held across a
  > release that undoes its allocation silently aliases its successor. Stated at
  > the API surface and pinned as behaviour, not documented in a footnote.
- **Bulk ops are load-bearing, not conveniences**: `Buffer.copy(dst, dstOff,
  src, srcOff, len)` and `buf.fill(off, len, byte)` lowering to
  `memory.copy`/`memory.fill`. Snapshot and rollback are exactly these ops;
  without them a snapshot is a per-word loop.
  > Done, and lowering to exactly those two instructions. One spelling change:
  > `Buffer.copy(dst, …)` is not expressible — VL has no static methods — so it
  > is `dst.copyFrom(dstOff, src, srcOff, len)`, the destination as receiver,
  > matching `dst.fill(...)` and the self-first UFCS shape the rest of `std:` uses.
- Bounds: engine memory trap or explicit check, either is fine — but the
  loop-hoisting ask in P1.4 matters more than the per-access policy.
  > Ruled: the engine trap, with no VL-level check anywhere in the tier. A `Buf`
  > describes an extent and does not fence it — an access past the end of a `Buf`
  > but still inside the memory is NOT caught. `std:buffer` traps only at
  > ALLOCATION time (negative length, i32 overflow, a bad release mark).

Why webcraft needs it (see performance-topology.md): every byte of
authoritative sim state — ECS columns, entity tables, RNG/tick counters,
pathing grids, the Lua VM arena — lives here so that snapshot/rollback/hash
are memcpy-class and byte-comparable with the TS twin's ArrayBuffers.

### P0.2 Exported memory (zero-copy host visibility)  ✅ SHIPPED

The compiled module's linear memory must be exported (`--export-memory` or
automatic when `Buffer` is used). This single change replaces the current
per-scalar host-call ABI for bulk data: the JS host overlays
`Float32Array`/`DataView` on `instance.exports.memory.buffer` and reads
columns in place; commands go in by writing bytes and calling a scalar
export with `(offset, len)`.

> Maintainer's note (vl side): **done, automatic, no flag.** The memory is
> exported under the name `memory`, gated on the module having a linear memory at
> all — which it only does when the program uses one — so nothing changes for a
> program that does not. `instance.exports.memory` is a `WebAssembly.Memory`;
> `DataView` and `Float32Array` overlays read guest bytes in place, and a host
> write through such a view is visible to the guest. Proved from both hosts
> (`tests/vl_exported_memory_test.ts`; a wasmtime 47 embedding reads the same
> module). No host change was needed anywhere.
>
> Two consequences to design around:
>
> - **A user function exported as `memory` is now a compile error** in a program
>   that also uses linear memory, because wasm export names must be unique. It is
>   a mechanical fix (rename the function) and the reject names it.
> - **`memory.grow` detaches every host view.** This is the one sharp edge in the
>   combination of P0.1's growth and P0.2's export: a `Float32Array` taken before
>   a growth reports `byteLength === 0` afterwards and an indexed read of it
>   yields `undefined` — it does not throw. In a render-publish path that is a
>   silent wrong answer, so **re-read `.buffer` after any guest call that can
>   grow**, and never cache a view across one. The test suite asserts this
>   behaviour rather than describing it. (A Rust/wasmtime host gets the same
>   hazard as a borrow-check error, because the byte slice borrows the `Store`
>   that growing needs mutably.)
>
> The `shared` memory option below is untouched and still not P0. Note it would
> require declaring a maximum size, which the emitter does not do today (`min 1`,
> no max).

- The existing scalar-only export contract then needs *nothing else* — C-style
  `ptr/len` embedding falls out. `snapshotPtr(): i32`-style exports let the
  program hand the host well-known offsets.
- Per-frame render publish, per-turn command ingestion, snapshot extraction,
  and the divergence HUD's state reads are all this mechanism.
- Optional later (not P0): allow declaring the memory `shared` (threads
  feature flag, no atomics needed in vl code) so the render thread can view
  sim memory across workers without a copy. Copy-out to a SAB is acceptable
  v1; note shared memories must declare a max size.

### P0.3 Reinterpret casts (bitcasts)

```vl
f32bits(x: f32): i32     // i32.reinterpret_f32
f32fromBits(b: i32): f32 // f32.reinterpret_i32
f64bits(x: f64): i64
f64fromBits(b: i64): f64
```

Hard requirement, tiny to implement (one opcode each). Everything
determinism-critical passes through these: hashing float state, NaN
canonicalization (the WASM NaN-payload nondeterminism mitigation), and
implementing WC3-matched transcendentals (bit-level range reduction,
Q-format tricks). Currently absent entirely.

### P0.4 Float/int opcode intrinsics

The single-opcode, IEEE-deterministic operations, for f32 and f64:
`sqrt`, `abs`, `floor`, `ceil`, `trunc`, `nearest`, `min`, `max`,
`copysign`. For i32/i64: `clz`, `ctz`, `popcnt`, `rotl`, `rotr`, and the
unsigned variants `divU`, `remU`, `ltU/leU/gtU/geU` (`>>>` already exists).

- These are the *entire* math library webcraft needs from the language.
  `sin/cos/atan2/pow/exp` should **not** be provided by vl — webcraft must
  implement its own, extracted from real WC3 via probe maps, and a std
  `sin` would only be a determinism trap to avoid. A future `std:math` can
  exist for other users; the sim won't import it.
- Unsigned ops matter for hashing, the xorshift RNG, fourCC comparisons, and
  Lua's string hash. i64-widening emulation works but poisons hot loops.

## P1 — gates the port being good (perf + core ergonomics)

### P1.1 Typed views over Buffer  🟡 SHIPPED, minus the bracket sugar

```vl
const x  = buf.f32view(offset, count)   // F32View
const id = buf.i32view(offset, count)
x[i]        // f32.load at offset + i*4, index-bounds = count
x[i] = v
x.length
```

The kernel is structure-of-arrays: hot loops are `for i { x[i] += vx[i] }`.
Raw `loadF32(base + (i << 2))` everywhere is the TS twin's DataView
experience — workable, error-prone, and the thing most worth absorbing into
the language. Views are also the natural unit for aliasing the render-publish
ring and for the differential harness to diff columns.

> Maintainer's note (vl side): **the views ship; `x[i]` does not.** In `std:buffer`,
> pure VL, **zero compiler lines** — `refresh-compiler.sh --prove-fixpoint` reports
> the compiler binary byte-identical. `buffer-design.md` §L.
>
> ```vl
> const x = buf.f32view(off, count)     // F32View
> x.setF32(i, v) ; const a = x.getF32(i) ; x.length
> const id = buf.i32view(off, count)    // I32View: getI32 / setI32
> const addr = x.byteAddrF32(i)         // the absolute byte address, unchecked
> ```
>
> Three things to design around, one of them a sequencing correction:
>
> - **P1.1 depends on P1.5, and the dependency is not optional.** VL is
>   structurally typed: `type X = {…}` names a shape, it does not mint an
>   identity. Spelled as the ask has them — both views as `{base, count}` —
>   `F32View` and `I32View` **are the same type**, an `I32View` satisfies every
>   `F32View` parameter, and reading integer bytes as floats type-checks
>   silently. Measured, not feared. So the shipped types spell their address
>   field `f32base` / `i32base`: the element width is put in the field NAME,
>   which is the only place a structural checker can see it. That is the
>   workaround, it is ugly, and **P1.5's zero-cost newtype deletes it** — which
>   makes P1.5 worth pulling forward rather than leaving below P1.2/P1.3.
> - **`x[i]` is purely syntactic, and it is a language feature, not a views
>   feature.** Under every dispatch route VL has or plans, `x[i]` lowers to
>   exactly the call `x.getF32(i)` already lowers to. Four routes were probed;
>   all four are blocked or wrong (§L5), and the right one — ROADMAP B14,
>   free `self`-functions named for an operator — is blocked on the parser
>   (`function "[]"(self: V, i: i32)` does not parse today) and on operator
>   lookup surviving the module merge. Filed with the design. **The kernel
>   ergonomics P1.1 is after are available now**, at the same codegen; what is
>   missing is the bracket.
> - **`x[i] += vx[i]` re-evaluates its receiver and index** under any bracket
>   route, because the parser desugars a compound assignment to
>   `x[i] = x[i] + vx[i]` over one shared target node. Harmless for a local and
>   an induction variable; not harmless for `x[f()] += 1`.
>
> **Bounds, and the price** (this is also P1.4's answer, below): a view IS fenced
> — the only fenced thing in the tier — because its failure mode is the one the
> engine cannot see. One element past a column is *inside* the memory and inside
> the next column, so unfenced it returns a neighbour silently, which is a desync
> in exactly the code whose value is byte-comparability. So: `0 <= i < length`
> per access, trapping on `unreachable`, plus a once-per-view extent check at
> construction. Pinned by three trap fixtures, each with a separate `@run`
> inverted control proving the prevented access would have SUCCEEDED.
>
> **The mark/release hazard reaches views** and is documented, not fixed: a view
> held across a `bufferRelease` that undoes its allocation passes its own bounds
> check AND the engine's, and reads/writes the next owner's bytes silently.
>
> **One size note, with the same punchline as P1.4's speed note.** The module
> merge does not prune unreachable exported functions, so the view surface costs
> **+422 bytes on every program that imports `std:buffer`**, used or not
> (~162 per width family, scaling linearly as i64/f64/narrow widths arrive). At
> `-O3 --closed-world` it is eliminated **completely** — byte-identical to a
> build against the pre-view std. Same flag, second reason: the release profile
> is what makes both the wrapper calls and the unused surface disappear.

### P1.2 Flat record layouts (AoS tier — the Lua VM's requirement)

```vl
flat type TValue = { value: i64, tt: i32, pad: i32 }   // explicit order, fixed size 16
const stack = buf.rows<TValue>(offset, count)
stack[i].tt          // i32.load at offset + i*16 + 8
```

- Declared field order = layout, sizes fixed by scalar widths, no reordering;
  `flat` types contain only scalars and nested flat types. This is the
  C-struct tier WasmGC structurally cannot provide (no layout control, no
  inline aggregates — memory-gc-design.md's permanent-ceiling table).
- The forcing customer is the Lua 5.3 VM: bit-exact `pairs()` order requires
  replicating Lua's `Table`/`Node`/`TValue` layouts and hash behavior, which
  means byte-precise structs in an arena. Second customer: wc3 rule tables
  and any state whose layout must match the TS twin exactly.
- Can ship after P1.1 (views cover SoA, which is most of the kernel); the
  Lua VM port is blocked on this specifically.

### P1.3 Optimization defaults

- The sim ships through `wasm-opt` always — but webcraft can own that in its
  build. The real ask: **Heap2Local in the blessed pipeline** and a
  documented "release profile" (`--closed-world -O3 --gufa` per vl's own
  toolchain audit). vl's union boxes and `{backing,len,cap}` wrappers must
  melt in per-tick scratch code, or the alloc-free-steady-state discipline
  becomes "avoid half the language in the sim."
- Branch hinting (ROADMAP B-hint) is a later nicety for the pathing inner
  loops; not gating.

### P1.4 Bounds-check ergonomics in hot loops  ✅ STATED (with the numbers)

Not asking for unsafe access. Asking that the canonical loop —
`for i in 0..view.length`-shaped iteration over a view — either hoists the
bound or relies on the memory trap, and that this is *stated*, so kernel
code can be written to the fast pattern deliberately. (Cranelift/binaryen
eliminate some checks; "some" isn't a contract.)

> Maintainer's note (vl side): **it does neither — it checks, every time — and
> here is what that costs.** No hoisting: VL has no LICM, and binaryen at
> `-O3 --closed-world --gufa` does not remove the check either (measured, it
> survives). Not the memory trap: §L3 explains why the engine cannot see a
> same-memory neighbour read, which is the failure this tier exists to prevent.
>
> Priced on P1.1's own canonical kernel, `x[i] += vx[i]`, 500M element-updates
> (N=1M × 500 trips), built once and run, each against an R=0 build of the same
> file as the inverted control. ns per element-update, medians of 5:
>
> | spelling | (none) | `-O` | `-O3 --closed-world --gufa` |
> |---|---|---|---|
> | raw intrinsics, hand-computed addresses | 0.426 | 0.452 | 0.434 |
> | **hoisted base** (view for the extent, bare intrinsics inside) | 0.426 | 0.436 | 0.418 |
> | `Buf` accessors (call per access, no check) | 2.436 | 2.504 | 0.700 |
> | **view accessors** (call per access + the check) | 2.734 | 2.530 | 1.044 |
>
> Three conclusions kernel code should be written to:
>
> 1. **The CALL is the cost; the CHECK is not.** The bounds check is 0.30
>    ns/element — 11% of the view's total, ~0.10 ns per access, under a third of
>    a cycle. The wrapper call is 2.01. Do not trade the bounds policy away for
>    speed before trading the call away.
> 2. **The fast pattern is the hoisted base**, and it is FREE — identical to the
>    hand-written raw kernel at every optimization level:
>    ```vl
>    const xb = x.byteAddrF32(0)
>    const n = x.length
>    let i = 0
>    while i < n { __store_f32__(xb + (i << 2), …) ; i = i + 1 }
>    ```
>    So the fenced surface and raw speed are both available in one program.
> 3. **`-O` is not enough; the release profile must be `-O3 --closed-world`.**
>    `-O` does not inline the std wrappers and `-O3 --closed-world` does: a 3.5×
>    swing on one flag. This is the number behind P1.3's ask. A residual 0.27
>    ns/element survives inlining and is attributable to the per-access
>    `struct.get` of the base field not being hoisted out of the loop — vl's own
>    "backing-pointer hoisting (LICM)" backlog item, now with a price tag.
>
> Full method, caveats and the noise floor: `buffer-design.md` §L4.

### P1.5 Nominal/opaque types (vl A14) — id safety

The kernel traffics in `EntityId`, `PlayerSlot`, `AbilityHandle`, all i32.
Under pure structural typing they interchange silently; a generation-tagged
entity id passed where a player index goes is exactly the bug class the TS
twin catches with branded types. A zero-cost newtype (`type EntityId = new
i32` or similar) closes it. Cheap, high-value for engine code.

> Maintainer's note (vl side): **P1.1 already needed this, which argues for
> pulling it above P1.2/P1.3.** The bug class is not hypothetical and it is not
> confined to i32 ids — it bit the typed views on their first day. `F32View` and
> `I32View` over the same `{base, count}` shape are ONE type to a structural
> checker, so an integer column flows into a float accessor with no diagnostic
> (measured; `buffer-design.md` §L2). The shipped workaround puts the element
> width in the field NAME (`f32base` / `i32base`) because that is the only
> discriminator a structural checker can see. A newtype deletes the workaround
> and lets both fields go back to `base`. Every further width the view family
> grows (i64, f64, the narrow widths) multiplies the same hack.

### P1.6 `vl test` (already designed)

The kernel/wc3 port arrives with thousands of table-driven cases (the
corpus-derived suites). The designed runner (`*.test.vl`, host thread pool,
trap isolation) is exactly right — webcraft just needs it to exist by M7.
The differential twin harness itself is host-side (compares TS vs vl hashes)
and needs nothing from vl beyond scalar exports.

## P2 — wanted, not gating

- **i32-keyed Map/Set** (B6a remaining): rule tables keyed by fourCC. Until
  then webcraft uses sorted arrays/views; string keys would mean formatting
  fourCCs, which is silly. Also `for k in map` iteration.
- **Contextual f32 literals**: `let x: f32 = 0.5` and `f32-typed` call sites
  accepting bare literals without `as f32` noise. Sim code is f32-saturated;
  today's `.`-literal-defaults-to-f64 + lossy-rejection rules make every
  constant a cast.
- **`match` phase 2** (variant payload binding): command dispatch
  (`match cmd { Move{x,y} => …, Attack{target} => … }`) is the natural shape
  for the order pipeline; if-chains work meanwhile.
- **Literal-union compact representation** (A16 remaining): order/state enums
  stored as i32 tags rather than softened values — mostly a memory nicety
  since authoritative enums live in Buffers anyway.
- **Readonly fields / A9 variance**: would let kernel expose read-only views
  of component data to wc3 systems, enforcing the "renderer/systems read,
  commands write" direction in the type system.
- **Default/optional params** (B15a): API ergonomics only.
- **SIMD over Buffer**: explicitly unlocked by the P0 tier (v128 only
  addresses linear memory — the WasmGC ceiling). Future pathing/hash kernels;
  not requested now. Same for engine-level threads/atomics: webcraft's
  topology keeps the sim single-threaded on principle.
- **Guest profiling parity in browser**: `VL_PROFILE_GUEST` exists for
  wasmtime; in-browser we'll use DevTools + the names section. Ask is only:
  keep emitting a names section on non-`-O` builds.

## Non-asks (deliberate)

- **Exceptions/async**: the no-exceptions `T|E` + trap model is *preferred*
  for the sim — a desync-class bug should trap loudly, expected failures are
  values. Don't add exceptions on webcraft's account.
- **Separate compilation / wasm linking**: single merged module matches the
  one-sim-artifact deployment exactly.
- **UTF-8 strings (B7)**: sim state contains no vl strings (fourCCs are i32;
  Lua strings live in the arena). Whatever pace strings evolve at is fine.
- **WASI**: the sim imports nothing but (optionally) a debug-log hook.
- **A std math/trig library**: see P0.4 — webcraft needs the opcodes, and
  specifically does not want library transcendentals near the sim.
- **GC knobs in-language**: browser V8 gives none anyway; alloc-free steady
  state + Heap2Local is the strategy on both hosts.

## Sequencing vs webcraft milestones

- **M2–M6 (now)**: nothing gates on vl. The TS sim proves semantics; command
  and snapshot layouts get specified byte-precisely (language-neutral) so the
  vl port is drop-in.
- **M7 port begins**: needs P0 complete (Buffer, exported memory, bitcasts,
  opcode intrinsics). Port order — pathing first (hottest, most
  self-contained, exercises views hard), then kernel stores, then wc3
  systems; each stage behind the per-tick differential hash.
- **Lua VM in vl**: needs P1.2 flat records; until then the Lua runtime stays
  TS even if the kernel has ported (the pump doesn't care which side of the
  boundary each module lives on — the state arena format is shared).
- **MP servers**: the vl artifact needs zero additions (same wasm under
  Node/workerd; wasmtime once its WasmGC matures — vl already pins 47, which
  runs the copying collector cleanly).
