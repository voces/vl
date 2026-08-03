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

### P1.1 Typed views over Buffer  ✅ SHIPPED, bracket included

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

> Maintainer's note (vl side): **the views ship, and so does the bracket.** The
> views are `std:buffer`, pure VL, zero compiler lines; `x[i]` / `x[i] = v` are
> ROADMAP B14's free INDEX OPERATORS, which are compiler lines and are general —
> they land the bracket for every user type at once, not for views.
> `buffer-design.md` §L, `index-operator-design.md`.
>
> ```vl
> const x = buf.f32view(off, count)     // F32View
> x[i] = v ; const a = x[i] ; x.length  // the spec's spelling
> x.setF32(i, v) ; const b = x.getF32(i)  // the accessor spelling, still there
> const id = buf.i32view(off, count)    // I32View: the same two spellings
> const addr = x.byteAddrF32(i)         // the absolute byte address, unchecked
> ```
>
> Three things to design around, one of them a sequencing correction:
>
> - **P1.1 depended on P1.5, the dependency was not optional, and P1.5 has since
>   SHIPPED and closed it.** VL is structurally typed: `type X = {…}` names a
>   shape, it does not mint an identity. Spelled as the ask has them — both views
>   as `{base, count}` — `F32View` and `I32View` **are the same type**, an
>   `I32View` satisfies every `F32View` parameter, and reading integer bytes as
>   floats type-checks silently. Measured, not feared. The interim put the
>   element width in the field NAME (`f32base` / `i32base`), the only place a
>   structural checker could see it. Both views are now
>   `new { base: i32, length: i32 }`; the mismatch is a checker reject, the
>   emitted bytes are unchanged by the `new`, and collapsing the two shapes back
>   into one took a wasm heap type OUT (−12 bytes per view program). §P1.5.
> - **`x[i]` is purely syntactic, and it is a language feature, not a views
>   feature.** It lowers to exactly the call `x.getF32(i)` already lowers to.
>   `std:buffer` declares four one-line operators
>   (`function "[]"(self: F32View, i: i32): f32 { return getF32(self, i) }`) and
>   the compiler resolves the bracket by the receiver's TYPE, which is what lets
>   the two views — structurally identical, distinguished only by P1.5's brand —
>   carry different operators. Measured, `x[i]` and `getF32(x, i)` build modules
>   that differ in TWO bytes: the `call` immediate, because the bracket goes
>   through the one-line forward. That extra call is what `-O3 --closed-world`
>   removes (§P1.3's flag, same as everything else in this tier).
> - **`x[i] += vx[i]` re-evaluates its receiver and index**, because the parser
>   desugars a compound assignment to `x[i] = x[i] + vx[i]` over one shared target
>   node. Measured: this is already true of a NATIVE array (`a[idx()] += 10` calls
>   `idx()` twice), so the bracket inherits the rule rather than adding one.
>   Harmless for a local and an induction variable; not harmless for
>   `x[f()] += 1`.
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

### P1.2 Flat record layouts (AoS tier — the Lua VM's requirement)  🟡 SHIPPED, minus `rows<T>` and the bracket

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

> Maintainer's note (vl side): **the DECLARATION ships — with its layout readable
> — and it cost the emitter nothing. `rows<T>` and `stack[i].tt` do not.**
> `docs/internals/flat-records-design.md` is the design record.
>
> ```vl
> flat type TValue = { value: i64, tt: i32, pad: i32 }
>
> const row = base + i * TValue.size    // 16
> const tt  = __load_i32__(row + TValue.tt)  // + 8
> ```
>
> `TValue.size` is the record's total byte size and `TValue.<field>` is that
> field's byte offset. Both are `i32` constants folded at check time.
>
> **The layout rule is NO IMPLICIT PADDING**, and your own example is the argument
> for it. Offsets are the running sum of the declared field widths, the compiler
> never inserts a byte, and field order IS layout. Under C's natural-alignment
> rules `{ value: i64, tt: i32 }` is *already* 16 bytes — the trailing pad is
> inserted for you — so the explicit `pad: i32` in your spec is only necessary if
> nothing pads implicitly. It is pinned that `{ value: i64, tt: i32 }` is **12**.
> Two further reasons: unaligned access is legal in wasm (the alignment immediate
> is a hint, not a constraint, so there is no correctness argument for padding —
> only a performance one, and paying it silently is not this tier's bargain); and
> a rule that pads for you **cannot express a packed layout**, while natural
> alignment is always reachable by writing the pad field, as you did.
> `align`/`packed` modifiers are deferred, not rejected — no-implicit-padding is
> the forward-compatible half.
>
> Four things to design around:
>
> - **Fields are `i32`/`i64`/`f32`/`f64`, a newtype over one of those, or another
>   `flat` type** (which inlines — `Outer.k + Inner.a` composes by addition, so
>   there is no second level of member access). Everything else rejects naming the
>   representation fact. **`boolean` rejects deliberately**: it is an i32 in VL, so
>   4 bytes would be consistent — but C's `bool` is 1, and a silent 3-byte drift is
>   the exact failure this tier exists to prevent. Write `i32`. Every ruling here
>   took the reject when in doubt, because widening a reject later is
>   backward-compatible and narrowing an accept is not.
> - **`flat` ADDS validation and constants and SUBTRACTS nothing.** The type is
>   still an ordinary record — struct literal, parameter, return, nested field,
>   array element — and it emits BYTE-IDENTICALLY to the same declaration with
>   `flat` deleted. No `emit_*.vl` or `wasmEmit.vl` file changed.
> - **`buf.rows<T>(off, count)` is NOT here.** It needs `T.size` to answer for a
>   type PARAMETER at each instantiation, which needs generic `flat` types (a type
>   parameter has no width, so they reject today) and a fold that runs after
>   monomorphization. Filed with the design.
> - **`stack[i].tt` is NOT here, but its blocker is gone.** B14's free INDEX
>   OPERATORS now ship (`index-operator-design.md`), so `stack[i]` is writable the
>   moment `Stack` has a `function "[]"(self: Stack, i: i32): Row`. What remains is
>   the SECOND half, and it is the interesting one: `.tt` on that row must be an
>   offset add rather than a materialized value. With `flat` constants that looks
>   natural — have the operator return a row-ADDRESS newtype and give the field
>   accessors offsets off it — and it is now a design question rather than a
>   blocked one.
>
> **What that leaves you with today is the whole Lua accessor set, hand-written
> once per record**, with every address derived from the declaration — pinned as
> `tests/cases/memory/flat-lua-tvalue-accessors.vl`:
>
> ```vl
> function slotAt(s: Stack, i: i32) { return s.base + i * TValue.size }
> function tagOf(s: Stack, i: i32) { return __load_i32__(slotAt(s, i) + TValue.tt) }
> ```
>
> What `rows<T>` and the bracket would delete from that file is the last two
> accessors PER FIELD. That is boilerplate, not expressiveness — which is the
> measurement that decided the phasing. The thing the declaration removes is the
> failure mode: today those `16`s and `8`s are literals hand-computed from a layout
> written down nowhere, and adding a field silently makes every one of them wrong.

### P1.3 Optimization defaults  🟡 PROFILE SHIPPED (`vl build -O3`) — wrappers melt, the READ union box does not

- The sim ships through `wasm-opt` always — but webcraft can own that in its
  build. The real ask: **Heap2Local in the blessed pipeline** and a
  documented "release profile" (`--closed-world -O3 --gufa` per vl's own
  toolchain audit). vl's union boxes and `{backing,len,cap}` wrappers must
  melt in per-tick scratch code, or the alloc-free-steady-state discipline
  becomes "avoid half the language in the sim."
- Branch hinting (ROADMAP B-hint) is a later nicety for the pathing inner
  loops; not gating.

> Maintainer's note (vl side): **the profile is `vl build -O3`, the record/list
> wrappers melt, Heap2Local is not the mechanism — and the UNION box does NOT
> melt once you read it, which is the half of this ask we did not deliver.**
> `docs/internals/opt-profile-design.md` is the design record.
>
> **Read this before planning per-tick code around the table below.** The union-box
> row says 4 → 0, and that is measured on a box that is allocated, tag-tested and
> discarded. Consume the narrowed value — `if e is Unit { … e.hp … }`, which is
> what a sim writes — and all four allocations come back at every rung including
> the full release profile. The union KIND matters too: 4 → 0 is a scalar union;
> a struct union with a tag-only test melts to 2, and to nothing at all once a
> field is read. Details and the four-row grid: `opt-profile-design.md` §3 item 0.
> The `{backing,len,cap}` wrapper half of your ask IS delivered (it melts
> completely); the union half is not.
>
> **UPDATE (#1320): the fix is much cheaper than this note first said, and the rule
> above is incomplete.** Consumption is one of TWO variables and the weaker one. The
> real rule is **allocation SITES**: a union box melts when it is built at ONE site
> whatever you do with it (2 → 0 read or unread), and only at TWO OR MORE sites does
> reading the payload keep it alive. VL emits one site per union ARM — a two-armed
> helper has two `return`s, hence two sites — which is why the grid above reads the
> way it does. So this is an **emitter-shape defect, not a representation defect**:
> the rep, the ABI and the module boundary are all fine, and a return-path box-sink
> measured **2.0–2.2×** on hand-written WAT with no new wasm vocabulary. An unboxed
> rep is REFUSED by that measurement, and A16 remains irrelevant to this row (it
> changes what the box holds, not whether it is allocated).
>
> **There is no source workaround to adopt in the meantime** — an `if`-expression
> and a local-assigned-on-two-branches both still emit two sites and still do not
> melt. Do not restructure sim code hoping to hit the fast shape; wait for the sink.
> `unboxed-union-rep-design.md` is the design record.
>
> ```
> vl build sim.vl -O3     # --closed-world -O3 --gufa -O3, + the GC feature enables
> ```
>
> `-O` is unchanged (one open-world `-O`), `-O3` wins when both are passed, and a
> missing `wasm-opt` stays a soft no-op — a note naming the flag, the unoptimized
> module on disk, exit 0 — exactly as `-O` already behaved.
>
> **The melt, counted rather than asserted.** Six per-tick-scratch fixtures
> (`tests/fixtures/opt-melt/`), each a loop that allocates and consumes scratch
> and stores nothing. The number is allocation SITES (`struct.new*` / `array.new*`)
> surviving in the module, read out of `vl build --wat` and pinned as goldens by
> `tests/selfhost_native_release_test.ts`:
>
> | fixture | (none) | `-O` | `-O3` |
> |---|---|---|---|
> | `{x,y}` record from a helper, read, discarded | 3 | **0** | **0** |
> | `[i, i+1, i+2]` built and read in the loop | 3 | **0** | **0** |
> | same list, built by a helper across a call | 3 | **0** | **0** |
> | **union box** from a helper, `is`-narrowed in the loop, payload NEVER READ | 4 | **4** | **0** |
> | same union box via a `let` written on two paths | 4 | **4** | **2** |
> | scratch list **grown** by `.push` each trip | 6 | 3 | **2** |
> | **the same union box with its payload READ** — the shape a sim writes | 4 | 4 | **4** |
>
> Four things fall out, and the first two change what the flag set should be.
>
> 1. **`--closed-world` is the whole lever; the LEVEL is not.** `-O3` alone leaves
>    all four allocations of the canonical union box; `--closed-world -O` melts all
>    four. `-O`/`-O2`/`-O3` are indistinguishable in both worlds. Reading the WAT
>    says why: open-world `-O3` *does* inline the producer, so the two `struct.new`s
>    sit in the loop provably non-escaping — and Heap2Local still leaves them,
>    because the box reaches its use through an `if`-result of reference type.
>    **The union box melts by closed-world type refinement plus DCE, not by escape
>    analysis.** So "Heap2Local in the blessed pipeline" turns out to be the wrong
>    request for the box you care about most; naming `--heap2local` explicitly
>    changes nothing at any rung, and alone it melts 0 of the 4.
> 2. **`--gufa` is measurably inert on vl output, and the REPEAT is what pays.**
>    `--gufa` removes zero allocations and zero `ref.cast`s — on all six fixtures
>    and on the 1.1 MB `vl-compiler.wasm` (4,503 casts with it and without). It is
>    shipped because P1.3 names it and it costs 2s and −571 B, not because it was
>    observed to do anything. The trailing second `-O3` is the member that earns
>    its place: it is the only thing that moves the grown-list row from 4 sites to
>    2 (`--closed-world -O3` alone is *worse* there than plain `-O`), and it is
>    ~15% of module size by itself.
> 3. **The two non-melts are characterized, and one is a rule for kernel code.**
>    A box reached through a ref-typed local written on two paths does not melt —
>    Heap2Local scalarizes per allocation site, so when two sites merge into one
>    local neither can own it. Rows 4 and 5 are the *same program written both
>    ways*: 0 sites versus 2. So: **build scratch with `const u = <call>`, not by
>    assigning a `let` on two branches.** The other is the backing ARRAY of a grown
>    list — the `{backing,len,cap}` wrapper melts completely, and what survives is
>    the `array.new`/`array.copy` of growth, because binaryen scalarizes structs
>    and only constant-indexed arrays. Size scratch lists once; don't `.push` per
>    tick.
> 4. **`--closed-world` is sound here, and that is now measured** — `buffer-design.md`
>    §O had it open. All **1,338 corpus `@run` cases** produce identical stdout and
>    identical exit status through the shipped profile. The invariant is DECISIONS
>    H6: no GC type reaches an import or export. A host-visible string/struct ABI
>    would require re-auditing this flag, and that sweep is the instrument.
>
> **One cost note, because it is why `-O` survives.** On a 1.1 MB module the
> release profile is 1.4 KB *bigger* than `-O` (914,086 vs 912,719) and 60% slower
> to produce (26s vs 16s): inlining duplicates code and duplicates allocation
> *sites* even as it removes allocations *executed*. `-O` is the edit-loop rung;
> `-O3` is what a shipped artifact gets. On small modules `-O3` wins on size too.

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

> **Second pass — the same answer, now READ OFF THE DISASSEMBLY, on four kernel
> shapes; and one of the three conclusions above is wrong about WHY.**
> (`buffer-design.md` §M; kernels in `bench/buffer-view-bounds/`, pinned by
> `tests/vl_buffer_view_bounds_shape_test.ts`.) The table above was timed, and a
> stopwatch cannot tell a check that was HOISTED from a check the branch
> predictor gets right every time. So this pass counted instructions instead.
>
> **1. The check is there, every access, at every rung — proven.** At
> `vl build -O3` the whole kernel inlines into one loop, and four instructions
> below a loop guard that reads `i < 1048576` the body still tests `i < 0` and
> `i >= 1048576`, each branching to `unreachable`. Binaryen keeps both. Counted
> across all four shapes, the surviving trap count at `-O3` is **exactly two per
> access** — 2 for a read-only element, 4 for a read-modify-write, 6 for
> `y[i] += x[i]*dt`. No rung and no shape reduces it.
>
> **2. But at `-O3` the check is nearly FREE, and the thing that costs is the
> view descriptor's own fields.** ns per element, min-of-5, control subtracted:
>
> | kernel | fenced `v[i]` at `-O3` | hand-hoisted at `-O3` | ratio |
> |---|---|---|---|
> | one f32 column, `v[i] = v[i]*k` | 0.444 | 0.428 | 1.04 |
> | one i32 column, read-only reduce | 0.344 | 0.291 | 1.18 |
> | 1024x1024 i32 grid, inner loop over a row | 0.581 | 0.500 | 1.16 |
> | **two views, `y[i] = y[i] + x[i]*dt`** | **1.713** | **0.493** | **3.5** |
>
> Same two-traps-per-access in every row. What separates the last row is that
> its loop reloads `base` and `length` **from the view struct seven times per
> element**, and the other three reload neither — because with ONE view of a
> width live in the module, GUFA folds both fields to constants, and with two it
> cannot. Binaryen does not hoist those loads out of the loop at any rung, even
> though the fields are immutable. So conclusion 3 above was right that a
> residual survives inlining and right about the mechanism, but it was **1.2
> ns/element, not 0.27**, and `length` is reloaded as often as `base`.
>
> **The part to design around: the fenced spelling's cost is a WHOLE-PROGRAM
> property.** Adding a second column of the same width to a module can turn a
> free check into a 3.5x one without the kernel's source changing a character.
>
> **3. The fast pattern, restated, and the rung it needs: NONE.**
> ```vl
> const a = x.byteAddrF32(0)     // base, once
> const n = x.length             // extent, once
> let i = 0
> while i < n { __store_f32__(a + (i << 2), __load_f32__(a + (i << 2)) * k); i = i + 1 }
> ```
> 0.296-0.500 ns/element on all four shapes at **all three rungs**, never varying
> more than 25% between them. It is the only spelling whose cost is predictable
> without knowing the build profile or the rest of the module.
>
> So, for kernel authors, in decision order: write `v[i]` and ship at
> **`vl build -O3`** (fenced, and within 4-18% of hand-hoisted on a one-view
> loop); **hoist by hand any loop touching two or more views of the same width**
> (the 3.5x, and it is not the check); `-O` buys about a third of `-O3`'s swing
> and is an edit-loop rung only. One footnote for flagless builds: `v[i]` calls
> `"[]"`, which calls `getF32`, so the bracket runs an extra frame per access
> worth 31% on the `scale` kernel — `v.getF32(i)` avoids it. Both wasm-opt rungs
> inline the forward away and the two spellings converge exactly.

### P1.5 Nominal/opaque types (vl A14) — id safety

The kernel traffics in `EntityId`, `PlayerSlot`, `AbilityHandle`, all i32.
Under pure structural typing they interchange silently; a generation-tagged
entity id passed where a player index goes is exactly the bug class the TS
twin catches with branded types. A zero-cost newtype (`type EntityId = new
i32` or similar) closes it. Cheap, high-value for engine code.

> Maintainer's note (vl side): **SHIPPED, both customers, and the views hack is
> deleted.** `docs/internals/newtype-design.md` is the design record.
>
> ```vl
> type EntityId = new i32                       // and PlayerSlot, AbilityHandle
> type F32View  = new { base: i32, length: i32 } // std:buffer, back to `base`
> ```
>
> - **`new` is a CONTEXTUAL keyword**, recognized only after a `type`
>   declaration's `=`. It is still a legal identifier everywhere else, so no
>   existing program can break on the addition.
> - **Distinct in every position** — let, global, param, return, struct field,
>   array element, map value, nullable, union member. A newtype does not flow to
>   its base, from its base, or to a sibling. 72 reject cells, each with an
>   inverted control (the same program with `new` deleted) that checks clean.
> - **A LITERAL is brand-polymorphic** and adopts the destination's brand, so
>   `const e: EntityId = 0`, `e + 1` and `e == 0` all work while `e + someI32`
>   rejects. Same-brand arithmetic keeps the brand.
> - **Construction and unwrap are both `as`** (`x as EntityId` / `e as i32`).
>   The spec's `EntityId(x)` call form was not taken: VL has no call-a-type
>   syntax and adding one would have put newtype knowledge in the EMITTER, which
>   is exactly what the zero-cost design avoids.
> - **Zero-cost is proven, not asserted.** A newtype is erased before the emitter
>   runs — the canon pass already rewrites a one-member alias annotation to its
>   member — so **no emitter file changed**. 46 of 47 positive grid cells emit
>   byte-identically to the same program with `new` deleted; the 47th is a
>   pre-existing f32-map-value gap that fails without any newtype in the program.
>   Across the whole 1,625-file corpus the branch is **byte-identical on every
>   file** to the compiler before it.
> - **The views migration made the module SMALLER.** `f32base`/`i32base` made the
>   two views two shapes needing two wasm heap types; `base`/`base` + `new` makes
>   them one shape (one heap type) and two TYPES. −12 bytes per view program.
>
> Not in this phase, filed with reasoning in the design doc: generic newtypes
> (`type Handle<T> = new …`), `x is EntityId` narrowing (a newtype has no runtime
> tag by construction), and opting a newtype OUT of struct dedup for runtime
> identity. Also worth knowing: a newtype cannot be a MAP KEY — but neither can a
> plain alias, which is a pre-existing map-key-grammar gap, not this feature's.

### P1.6 `vl test` (already designed) — ✅ SHIPPED

The kernel/wc3 port arrives with thousands of table-driven cases (the
corpus-derived suites). The designed runner (`*.test.vl`, host thread pool,
trap isolation) is exactly right — webcraft just needs it to exist by M7.
The differential twin harness itself is host-side (compares TS vs vl hashes)
and needs nothing from vl beyond scalar exports.

> **Shipped.** `vl test [path]` discovers `*.test.vl`, compiles each (module-aware,
> so `std:` and relative imports resolve), and runs them one wasm instance per
> file across a host thread pool. What webcraft can rely on:
>
> - **The surface is jest-shaped**: `describe`/`it`/`itSkip`/`beforeEach`/
>   `afterEach` and `expect(x).toEqual(y)` / `.toBeTrue()` / `.toBeFalse()` /
>   `.not()` / `fail(msg)`, all from `std:test`. A test file writes no protocol
>   boilerplate — the runner appends the re-export line itself.
> - **Trap isolation is real, not aspirational**: a test that traps (a failed
>   expectation, a raw `__trap__()`, an out-of-bounds index) fails ALONE. The host
>   catches the trap and re-instantiates, so the tests after it in the same file
>   still run. Proven by a fixture that traps twice and still passes the test
>   declared after them.
> - **A test file that does not COMPILE is one failing entry** with the compiler's
>   own positioned diagnostics, and the rest of the run is unaffected — which is
>   the behaviour a thousands-of-cases port actually needs while it is in motion.
> - **Failure messages are structural**: the matcher records `expected 7 to equal
>   8` and the host reads it back off the instance after the trap. A failing test's
>   captured output is shown beneath it; a passing test's is hidden.
> - **Parallel**: measured 3.6x on four CPU-bound files (1.11 s serial → 0.31 s at
>   `--jobs 4`). `--jobs N` overrides; the default is one worker per core.
> - **Selection**: `-t <substring>` matches the scope-qualified name
>   (`strings > nested > reports its full path`). `--exclude <glob>` prunes the walk.
> - **Exit codes**: 0 all green, 1 any failure, 2 usage.
>
> Two things to design around, both recorded in
> `docs/internals/vl-test-design.md` §Known gaps: a test body whose last statement
> is an ASSIGNMENT needs a trailing `done()` (VL types a function by its tail, and
> an assignment yields a value — the `() => void` body then does not match), and an
> f64 operand renders as `<f64>` in the message with the real values printed into
> the captured output, until `std:fmt` grows f64→string.

## P2 — wanted, not gating

- ~~**i32-keyed Map/Set** (B6a remaining): rule tables keyed by fourCC. Until
  then webcraft uses sorted arrays/views; string keys would mean formatting
  fourCCs, which is silly. Also `for k in map` iteration.~~ **DONE** for the ask;
  one half deferred and measured.
  > **`for k in map` was already shipped** — measured before anything was built:
  > a bare `for k in m` over a string-keyed map runs today in every receiver ×
  > scope cell (its reservation is pinned by
  > `tests/cases/maps/map-scratch-frame-reservation.vl`, taught in #1249). Only
  > the roadmap row still listed it as remaining. The i32 twin ships at parity.
  >
  > **The i32-keyed half ships for the value types a fourCC rule table needs** —
  > `{[i32]: i32}` / `{[i32]: boolean}` / atom values, and the `{[i32]: boolean}`
  > `Set` — as a binding, parameter, return or `| null`, with the full string-keyed
  > surface (`m[k]` / `m[k] = v` / `.set` / `.get` / `.has` / `.delete` / `.length`
  > / `.keys()` / `.values()` / bare `for k in m`) and the SAME insertion-ordered
  > iteration. A mirror-parity grid of every operation × value type × scope reads
  > PARITY with its string-keyed twin in every cell whose value rides the mono rep.
  >
  > ~~**Deferred, and a loud emit-tier reject until it lands:** a REF or WIDE value
  > (`{[i32]: string}`, struct, list, `f64`/`i64`/`f32`) and the composition
  > positions (a struct/variant FIELD, an array ELEMENT, a map VALUE). Both need a
  > per-value i32-keyed map struct and the mv-slot plumbing around it; neither is
  > silent — `vl build` exits 1 naming the value type or the position.~~
  > **The VALUE half is DONE (B6b).** An mv slot's identity is now the
  > (KEY, VALUE) PAIR, not the value alone — one column (`mvKeyI32`) beside
  > `mvValName`, and every resolver that turns a value type into a slot takes the
  > key beside it. So `{[i32]: V}` mints its OWN map struct for every V the
  > string-keyed rep lowers (`string`, a struct, `i32[]`, `string[]`, `f64`,
  > `i64`, `f32`, `V | null`, a union, a closure, a nested map), and downstream the
  > slot is SELF-DESCRIBING: `mapTypeIdxOf`, the `cm*` emit accessors and the typed
  > per-slot scratch frames needed no second parameter. The **closure-RESULT** and
  > **MAP-VALUE** composition positions came with it. The parity grid — value type ×
  > operation × scope × position, each cell twinned with its `{[string]: V}`
  > spelling — reads **130 PARITY / 15 gap / 11 both-fail** over 156 cells, with all
  > 96 direct-position cells at parity.
  >
  > **Still a loud reject, both FILED with their mechanism:** a struct/variant
  > **FIELD** (13 cells — the field ROW records the map's VALUE name and VALUE type
  > with the key erased, so it needs a key column on both field tables), and an
  > array **ELEMENT** (kept deliberately: the `{[string]: V}` spelling of a
  > list-of-maps store is itself invalid wasm for 12 of 14 value types today, so
  > opening the i32 half would turn a clean reject into that — fix the string half
  > first and the i32 half follows, since the ref-list element row already records
  > the whole `{[i32]: V}` spelling).
- ~~**Contextual f32 literals**: `let x: f32 = 0.5` and `f32-typed` call sites
  accepting bare literals without `as f32` noise. Sim code is f32-saturated;
  today's `.`-literal-defaults-to-f64 + lossy-rejection rules make every
  constant a cast.~~ **DONE.**
  > Measuring the ask first split it in two. The **`.`-literal half was already
  > shipped** — a 32-position grid found bindings, arguments, returns, fields,
  > array elements, stores, pushes, binary ops, negatives, nullables and the
  > `"[]="` operator all already accepting `0.5` on master. The **integer half
  > was missing in 18 of 18 positions** (`let x: f32 = 0`, `f(1)`,
  > `return 2`, `{v: 1}`, `[1]`, `fv + 1`, …), every one of which the f64 twin
  > already compiled.
  >
  > The two halves take DIFFERENT rules, and the split is forced rather than
  > chosen: a `.` literal is **context-typed** (it is f32 from birth and rounds
  > ONCE at 24-bit precision), because an exactness gate there would reject
  > `0.1`, `0.2` and `3.14` and leave nothing to admit. An integer literal is
  > **exactness-gated** (`intLexemeIsExactF32`), because it denotes an exact
  > integer and silently turning `16777217` into `16777216` is the lossy
  > implicit conversion the language forbids. `16777216` and `33554432` are
  > admitted; `16777217` and `9000000000` still reject, with both one-token
  > escape hatches (`16777217.0`, or `as f32`) intact.
  >
  > **`as f32` is not the oracle for what the sugar must lower to**, and this
  > is measured: for `1.00000017881393432617187` the bare literal encodes
  > `0x3F800001` (one rounding) and the cast encodes `0x3F800002` (rounded to
  > f64, then ties-to-even on the demote) — *different numbers*. The cast is
  > also a runtime `f64.const` + `f32.demote_f64`, so it cannot sit in a
  > `const` global initializer at all. The literal is strictly better on both
  > counts.
  >
  > Two PRE-EXISTING defects fell out of widening the grid, both `vl check`
  > clean on master: `const x: f64 = 0x10` printed **7210** (the IEEE encoder
  > folded radix lexemes base-10 over their own prefix), and
  > `const x: f64 | null = 1` emitted **invalid wasm** in the global, local and
  > argument positions (the union value-atom ladder's scalar arm knew the i64
  > promotion its own list arm knew for i64/f64/f32). Both fixed.
  > (`docs/internals/contextual-f32-literals-design.md`,
  > `tests/cases/numerics/f32-contextual-integer-literal.vl` + 4 siblings,
  > `tests/cases/unions/nullable-float-integer-literal.vl`)
- **`match` phase 2** (variant payload binding): command dispatch
  (`match cmd { Move{x,y} => …, Attack{target} => … }`) is the natural shape
  for the order pipeline; if-chains work meanwhile.
- **Literal-union compact representation** (A16 remaining): order/state enums
  stored as i32 tags rather than softened values — mostly a memory nicety
  since authoritative enums live in Buffers anyway.
  **DESIGNED AND FILED, not shipped** (`docs/internals/litunion-compact-rep-design.md`).
  > **Your own framing was right and the "memory nicety" is the part that does not
  > survive measurement.** A standalone literal union — and the four keep positions
  > (array element, struct field, map value, function result) — ALREADY rep as an
  > interned i32 atom. The only place that does not is the member of a MIXED union
  > (`K | f64`), and there the store already costs exactly **one** `struct.new`,
  > because every distinct string literal is interned into an immutable global, so
  > the box's payload is a `global.get` rather than an allocation. No representation
  > can allocate less; the obvious compact encoding (a scalar value box around the
  > atom id) would allocate MORE. **So there is no memory to win here, and the
  > feature should not be scheduled as a memory feature.**
  >
  > What measurement DID find is a correctness population: **81 of 244 grid cells
  > across the mixed-union spellings are broken today, 42 of them silent wrong
  > answers**, all `vl check`-clean. `const k: K = "aa"; const x: K | f64 = k`
  > converts the atom ID to a float; `if x is K { const y: K = x }` is invalid wasm;
  > `K | string` answers `x is K` TRUE for a plain string. If webcraft's order/state
  > enums ever sit in a union beside a non-enum arm, those are the shapes to avoid —
  > and if that is a real pattern for you rather than a hypothetical, say so, because
  > it moves this from "nicety" to a correctness item and changes its priority.
  > Enums that stay standalone, or live in a Buffer, are unaffected: they are already
  > i32 atoms.
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
- **Lua VM in vl**: needs P1.2 flat records — **the layout half of which now
  exists**, so `Table`/`Node`/`TValue` can be declared once and addressed through
  derived constants. What is still hand-written is one accessor pair per field
  (`rows<T>` and `stack[i].tt` are filed); that is boilerplate, so the port is no
  longer blocked, only more verbose than it will be. Until it happens the Lua
  runtime stays TS even if the kernel has ported (the pump doesn't care which side
  of the boundary each module lives on — the state arena format is shared).
- **MP servers**: the vl artifact needs zero additions (same wasm under
  Node/workerd; wasmtime once its WasmGC matures — vl already pins 47, which
  runs the copying collector cleanly).
