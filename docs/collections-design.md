# VL collections design — VL's one user-facing collection, spelled `T[]` (B6)

> Status: **design / research only.** No compiler code exists for this yet. This
> document is the mental model and the decision record for VL's primary
> collection — the growable sequence written `T[]` — so the follow-up
> implementation PR can be small and uncontested. It deliberately surveys how other
> languages do it, then commits to a concrete shape for VL's WasmGC backend with
> rationale and rejected alternatives.

> **Naming caveat (read first).** The committed *user-facing spelling* is the type
> `T[]` and the literal `[...]` — that is all a program ever writes for now. The
> names **`List`** (the growable representation) and **`Array`** (the fixed
> representation) are used throughout this document as **design vocabulary only and
> are *uncommitted*** — no decision has been made to expose either name to users,
> and there is deliberately **no user-facing way to *force* a representation yet**
> (it is always inferred, §VL.7). Read every "`List<T>`" / "`Array<T>`" below as
> "the growable / fixed *representation* (provisional name)", not as a committed
> surface type. The forcing annotations and their spellings (§VL.7, §OQ.7) are an
> explicitly uncommitted future surface.

## Summary / recommendation

**VL has one user-facing collection, spelled `T[]`** — a growable, ordered,
indexable sequence (provisionally named `List` in this doc), and the substrate for
`map`/`filter`, builders, and the H2 self-hosting collections work (`ROADMAP` A10 +
B6). `[...]` constructs one. The raw fixed-length WasmGC `array` is **not** a
coexisting everyday type the programmer chooses between; it survives in two
non-user-facing roles: (i) the internal **substrate** (the `backing` field,
allocated/copied via the `array.new`/`array.copy` intrinsics), and (ii) an
**inferred representation** — when the compiler can prove a `T[]` value is never
grown, it lowers that value to a header-less fixed array (raw-array speed, no
`{len,cap}` header, no indirection) *without changing the program's mental model*
(§VL.6). The fixed-array MVP is done; this design promotes it into the `T[]`
collection rather than leaving it as the default literal, and reuses it as the
cheap inferred representation underneath.

**Decided this review round** (recorded here; the `DECISIONS.md` entry lands with
implementation, not before): the user-facing collection is **spelled `T[]`** with
**`[...]` its literal** (the scripting-feel default — Python/JS/Ruby/Swift) — the
*name* `List` (and a fixed-form `Array`) is **uncommitted** design vocabulary, not
a decided surface type; the **growth factor is 2×** for v1, **indexing traps on
out-of-bounds** — `a[i]` yields `T` and **traps** on OOB (an unrecoverable-bug
signal — loud, not silent),
with **`.get(i): T | null`** the safe, checked opt-in accessor; and **`Map[k]`
returns `V | null`** (a missing key is a *normal, expected* map result, not a
bug). This is the Rust/Swift convergence: indexing a *sequence* panics/traps and
`.get` is the checked form, while *map/dict* subscript returns an optional.
**Representation is inferred:** `List` is the one *semantic* model the programmer
writes, but the compiler lowers a value to a **header-less fixed array** whenever
it can prove the value (and all its aliases) is never grown — recovering raw-array
speed under the single `[...]` literal, and **degrading to a full `List` whenever
it can't prove it** (so the optimization is never observably wrong). Still open:
value-vs-reference (language-wide), the error model (language-wide), the
**representation-inference analysis** (interprocedural growth-detection + alias
unification, §VL.6/§OQ.4), the remaining indexing-perf knobs — now
*optimizations*, not prerequisites: the **native-indexing flag** drops the B13
indirect call, **backing-pointer hoisting** loads `backing` once per loop, and
**bounds-narrowing** now merely elides the redundant trap-check — and the
capacity/seed surface specifics.

Recommendation in one screen:

1. **Representation.** A WasmGC `struct { backing: (ref (array mut T)); len: i32; cap: i32 }`
   — the same `{ptr, len, cap}` triple Rust, Go, and Swift's buffer use. `len` is
   the logical size the user sees; the backing array's own `array.len` is the
   capacity. We *still* carry an explicit `cap` field (see §VL.1) even though the
   backing array knows its own length, because reading `array.len` is cheap but
   the field makes the growth test branch-predictable and keeps `len`/`cap`
   adjacent and hot.
2. **Growth factor: 2× — DECIDED for v1** (double on `len == cap`, minimum first
   allocation of 4).
   The headline argument *against* 2× — that geometric doubling can never reuse
   the sum of previously freed blocks (the libc++/golden-ratio argument) — is a
   **manual-allocator** concern. Under WasmGC there is no `realloc`, no
   in-place extend, and no manual `free`; the old backing is dropped on the floor
   for the GC to reclaim. The allocator-reuse premise does not hold, so the
   memory argument for 1.5× evaporates and we take the fewer-copies win of 2×.
   (§VL.2)
3. **Generics: monomorphize per element type, no boxing.** VL already
   monomorphizes generic functions per call shape (A10) and already interns a
   distinct WasmGC `array` type per element wasm type (`arrayType()` in
   `toWasm.ts`). `List<T>` is therefore one more monomorphized struct/array type
   pair per concrete `T`: native `array.get`/`array.set`, no `anyref` boxing, no
   unbox-on-read. This matches the soundness contract (no `dynamic`, every value
   pinned to a concrete type) and the existing array performance path. (§VL.3)
4. **Surface API.** The **committed user surface is the `[...]` literal and the
   `T[]` type** (`[0, 1, 2]` seeds a three-element collection — the scripting-feel
   default). Empty construction and pre-sized (capacity) construction are needed
   *capabilities*, but their **spelling is uncommitted** (the doc sketches them as
   `List<T>()` / `List<T>(capacity: n)` using named params, since VL has no variadics
   or overloading, §VL.4 — but those names are provisional, not decided).
   `push`/`pop`/`map`/`filter` are
   `self`-methods (parens — they compute, B14). `l[i]` / `l[i] = v` route through the
   B13 `"[]"`/`"[]="` index traps (assumed to land in parallel) — though a
   **type-level native-indexing flag** (§VL.6) lets `List`'s `[]`/`[]=`/`.length`
   lower straight to `array.get`/`array.set`/`array.len`, bypassing the dispatch.
   `.length` is the O(1) uniform-access property (read-only, per DECISIONS B6);
   `.capacity` is the sibling O(1) property. **Indexing traps on out-of-bounds**:
   `l[i]` yields **`T`** and **traps** when `i` is out of range — an out-of-bounds
   index is an unrecoverable *bug*, surfaced loudly (this is what `a[i]` already
   does today; the design *keeps* it rather than reversing it). The **safe, checked
   accessor is `.get(i): T | null`** — reach for it when an index may legitimately
   be out of range. (`get` conventionally names the *safe* accessor, so we use it
   for the `T | null` form, not the trapping one. §VL.4–6.) The trap is already a
   bare `array.get`, so the *safe default is the fast default*; **bounds-narrowing**
   (§VL.6) is now only an optimization that elides the redundant bounds check inside
   `for i in 0 to a.length` or after `if i < a.length`. Combined with the
   native-indexing flag *and* **backing-pointer hoisting** (§VL.6: load `backing`
   once per loop, not per access), an in-loop `l[i]` lowers to a bare `array.get` of
   `T`, codegen identical to a raw array, while `List` stays a `.vl` std type
   otherwise. (Element *mutation* `l[i] = v` likewise traps on OOB and is the in-place
   write — non-growing, so it does not force the growable representation, §VL.6.)

**Language principle — "results for expected absence, traps for bugs."**
*Expected, recoverable* outcomes return values, not control-flow escapes: absence
is `T | null`, "failed with a reason" is `T | E` (a discriminated union narrowed
with `is`) — leaning on VL's existing union + `is`/`??`/`?.` narrowing rather than
try/catch (VL has no catchable throw). **Traps are reserved for unrecoverable
*bugs*.** The dividing line is whether the condition is a *normal program state* or
a *programmer error*:
- **Normal absence → `T | null`.** A map lookup that misses (`Map[k]: V | null`),
  popping an empty list (`pop(): T | null`), or asking for an element that *might*
  not be there (`list.get(i): T | null`) are ordinary, expected results.
- **Out-of-bounds *indexing* → trap.** `a[i]` / `l[i]` indexing past the end is a
  *bug* — the program computed an index it had no business computing — so it traps
  loudly rather than silently handing back `null` (which would propagate the bug
  downstream). This is exactly the Rust (`Vec[i]` panics vs `Vec::get -> Option`)
  and Swift (`array[i]` traps vs dictionary subscript returns optional) split.

This is the errors-as-values direction (§OQ.3) with the bug/normal-state line drawn
deliberately. Because the trapping `a[i]` is *already* a bare `array.get`, the safe
default is also the fast default; **bounds-narrowing** (§VL.6) is a pure
optimization (eliding the redundant trap-check), not the load-bearing prerequisite
it would be if indexing returned `T | null`.

The rest of this doc is: the cross-language survey and the synthesized
trade-offs, then the VL design with rationale + rejected alternatives, then a
phased implementation outline and the open questions for the owner.

---

## Survey: how mainstream languages implement growable arrays

All of the "vector" types below share one skeleton — a heap buffer plus a logical
length plus a capacity — and differ mainly in **growth factor**, **how generic
elements are stored** (boxed/erased vs monomorphized), and **shrink/ownership
policy**. The differences are driven by each runtime's allocator and type system.

| Language | Header / representation | Growth factor | Element storage | Shrink / notes |
|---|---|---|---|---|
| **Rust `Vec<T>`** | `{ ptr, len, cap }`; allocation owned by `RawVec<T>` | **2×**, amortized O(1) push; "no guaranteed strategy" but current is double | **Monomorphized** per `T`; inline, unboxed, contiguous `T` | **No auto-shrink**; `shrink_to_fit`/`reserve`/`with_capacity` are explicit |
| **C++ `std::vector`** | `{ begin, end, cap_end }` pointers | **libstdc++ 2×**, **libc++ & MSVC 1.5×** | Monomorphized (templates) per `T`; inline, unboxed | No auto-shrink; `shrink_to_fit` is non-binding; move-or-copy on realloc |
| **Go slices** | `slice{ array, len, cap }` header over a backing array | **2× while small (< 256)**, then taper toward **1.25×** | Monomorphized layout per element type (size/align), unboxed | No shrink; **aliasing**: re-slices share backing until a growing append reallocates |
| **Java `ArrayList`** | `Object[] elementData; int size` | **1.5×** — `oldCap + (oldCap >> 1)` | **Erased** to `Object[]`; primitives are **boxed** (`List<Integer>`) | No shrink (explicit `trimToSize`); type erasure → no per-`T` specialization |
| **Python `list`** | `PyObject **ob_item; ob_size; allocated` | **~1.125×** — `newsize + (newsize>>3) + 6`, rounded to mult. of 4 | Array of **pointers** to boxed `PyObject*` (everything is boxed) | Over-alloc only; growth seq `0,4,8,16,24,32,40,52,64,76,…` |
| **Swift `Array`** | value type wrapping a single ref to a class buffer `{ count, capacity, elements }` | Exponential (≈2×) on append | Monomorphized via generic specialization; unboxed for value types | **Copy-on-write** — shallow copy on assign, deep copy on first mutation if buffer not uniquely referenced |
| **JS arrays (V8)** | `JSArray` + a separate backing store (`FixedArray` / `FixedDoubleArray`) | Geometric backing-store reallocation on full `push` | **Elements kinds**: `PACKED_SMI` → `PACKED_DOUBLE` → `PACKED_ELEMENTS` → `HOLEY_*`; transitions are one-way toward general/boxed | Holey once holey, forever; "general" elements are boxed pointers |

### Synthesized trade-offs

**Growth factor — 2× vs 1.5× vs ~1.125×.**
- All geometric factors give **amortized O(1)** push: doubling means `n` pushes do
  `n + n/2 + n/4 + … < 2n` copies, i.e. O(1) amortized per push, for *any* factor
  > 1. The factor is a **constant-factor** knob, not an asymptotic one.
- **Larger factor (2×)** → fewer reallocations and fewer element-copy passes, at
  the cost of up to ~50% transient slack (worst case right after a grow).
- **Smaller factor (1.5×)** → less peak memory and — critically for a *manual*
  allocator — it can **reuse previously freed blocks**. With factor 2, each new
  request is strictly larger than the sum of all prior allocations
  (`1+2+4+…+2^k < 2^{k+1}`), so a bump/best-fit allocator can never satisfy the
  new request from the coalesced holes the vector itself just freed. With factor
  ≤ φ (≈1.618, the golden ratio) the running sum eventually overtakes the next
  request, so the freed region *can* be reused — this is why libc++ and MSVC chose
  1.5×. (libstdc++ kept 2× for fewer reallocations.)
- **Tiny factor (Python's ~1.125×)** → minimizes slack for the *very many small
  lists* a dynamic language allocates, accepting more frequent copies. The
  `>>3` is integer-cheap and the absolute copy cost on small lists is negligible.

**Capacity vs length.** Every implementation separates the **logical length**
(elements the user has) from **capacity** (allocated slots). Append writes into
spare capacity in O(1) and only pays the O(n) copy when `len == cap`. `len` is
what indexing/iteration/`length` see; `cap` is an allocator-amortization detail
the user mostly ignores (Rust/Swift expose `with_capacity`/`reserveCapacity` to
pre-size and skip regrowth).

**Shrink policy.** Essentially nobody auto-shrinks on `pop`/`remove` — it would
break amortization (a pop-after-grow could thrash) and surprise users. Shrinking
is opt-in (`shrink_to_fit`, `trimToSize`). The sane default is **grow-only**.

**Generic element storage — the big axis.**
- **Monomorphized / specialized** (Rust, C++, Swift value types, Go): one
  concrete layout per element type → elements stored *inline and unboxed*,
  contiguous, cache-friendly, no per-access indirection. Cost: code-size /
  compile-time blowup (one copy of the machinery per `T`).
- **Erased / boxed** (Java `Object[]`, Python `PyObject**`, JS general elements):
  one implementation handles all element types by storing **pointers to boxed
  values**. Cost: an allocation per element, pointer-chasing on access, cache
  misses, and for primitives the box/unbox tax (`List<Integer>` vs `int[]`).
  Benefit: a single implementation, no specialization explosion.
- The choice is forced by the type system: Java *must* box because generics are
  erased to a single bytecode; Rust/Swift *can* specialize because they
  monomorphize. V8 dynamically picks the most specific elements kind it can and
  only falls back to boxed "general" elements when the array becomes
  heterogeneous — a runtime approximation of monomorphization.

---

## VL design

### Context: what VL already has

- **The raw fixed array (B6 MVP) — now `List`'s substrate and inferred
  representation, not a user-facing tier.** A raw VL array is a contiguous WasmGC
  `array` (one interned `(array mut T)` heap type **per element wasm type** —
  `arrayType()` in `toWasm.ts`): `array.get` / `array.set` / `array.len` (the last
  an intrinsic, *not* a stored field), length fixed at `array.new_fixed` time. This
  is exactly what `List` is built **over** — it becomes `List`'s `backing` substrate
  (§VL.1) *and* the **inferred representation** the compiler lowers a never-grown
  `List` value to (header-less, §VL.6), **not** a separate everyday collection the
  programmer picks. The MVP gives us the substrate for free, and indexing keeps its
  current behavior: **`a[i]` traps on OOB today and continues to under this design**
  — the user-facing `List` indexes the same way (trap on OOB; `.get(i): T | null`
  is the safe accessor, §VL.6).
- **Monomorphization (A10).** Top-level generic functions monomorphize per call
  shape; inference holes collapse to a single concrete type before codegen (the
  soundness contract — no `dynamic`). Generics already infer *through* collections
  (`first<T>(xs: T[])` pins `T` from the element type).
- **Dispatch hooks (B13/B14).** `"[]"`/`"[]="` index traps and `self`-method
  UFCS are typed-method contracts resolved statically — no runtime proxy.
- **Size members (DECISIONS B6).** `length` is a contract member via property
  syntax dispatched to a native lowering, O(1), read-only. Property syntax (no
  parens) is reserved for O(1) members (`length`/`count`/`capacity`); computing
  ops are methods (parens).

The WasmGC constraint that shapes everything: **`array` heap types have a fixed
length at allocation and cannot be resized in place.** There is no `array.grow`,
no `realloc`, no in-place extend, and no manual `free`. "Grow" therefore means:
allocate a new, larger `array`, `array.copy` the old elements in, and swap the
struct's `backing` reference. The old backing becomes unreferenced and the GC
reclaims it.

### VL.1 — Representation: `{ backing, len, cap }`

**Decision.** A WasmGC struct, monomorphized per element type `T`:

```
List<T>  ≅  (struct
               (field $backing (mut (ref (array mut T))))   ;; the slots
               (field $len     (mut i32))                   ;; logical size
               (field $cap     (mut i32)))                  ;; allocated slots
```

- `len` is the user-visible size: it drives `.length`, bounds checks, and
  iteration. Indices `[len, cap)` are unused spare capacity.
- The backing array's own `array.len` equals `cap`. We keep an **explicit `cap`
  field anyway** for three reasons: (a) the hot path of `push` is the branch
  `len == cap`, and reading two adjacent struct fields is more predictable and
  Heap2Local-friendly than mixing a `struct.get` with an `array.len` on a
  separately-allocated array; (b) it keeps `len` and `cap` co-located and hot;
  (c) it leaves room to let `cap` and the physical backing length diverge later
  (e.g. a future small-list inline-storage optimization) without changing the
  field layout. The redundancy is one `i32` — cheap insurance.
- `backing` is `mut` so `push`-induced regrowth can swap in a larger array.
  `len`/`cap` are `mut` for `push`/`pop`.

**Why a struct, not "an array with a header slot".** We could store `len` in
slot 0 of the backing array (a fat array). Rejected: it fights the raw-array
substrate (which has *no* header and lowers `.length` to `array.len`), it
complicates indexing (every `[i]` becomes `[i+1]`), and it can't hold `cap`
separately from the physical length. A distinct struct wrapping a header-less raw
`array` keeps the substrate clean and the `List` header explicit.

**The header cost — two i32s + one indirection (the owner's sizing).** A `List`
carries a per-list header of two i32s (`len`/`cap`) over the bare backing, and a
read `l[i]` is `list.backing[i]` — a `struct.get` (load `backing`) then an
`array.get` — vs a raw array's single `array.get`. The 8-byte header is genuinely
trivial. **The extra `struct.get` is not — it is a real per-access cost**: an
extra load *plus* a pointer-chase to a second heap object (the `{len,cap,backing}`
header is one allocation, the backing array another). In a tight, load-bound loop,
going from one load to two per element can be **~1.5–2× on that kernel** — *not*
negligible. **But `backing` is loop-invariant**: the fix is to **hoist it out of
the loop** (LICM) — load `backing` once before the loop body, leaving a bare
`array.get` inside, instruction-identical to a raw array. This is exactly how LLVM
makes Rust `Vec` / C++ `std::vector` indexing reach native speed (it hoists the
data pointer). **Catch for VL:** binaryen's LICM over a GC `struct.get` across a
loop is *not* guaranteed — it would have to prove nothing in the loop writes
`backing` (no `push`/grow/reassign) — so VL likely needs to **explicitly hoist**
the backing load for the canonical `for i in 0 to list.length { list[i] }` pattern
rather than relying on binaryen to do it. With the hoist (the **backing-pointer
hoisting** enabler, §VL.6), plus the **native-indexing flag** (§VL.6) +
bounds-narrowing, the access folds back to a bare `array.get`; **without the hoist
the per-access `struct.get` cost remains.** Scattered/random single accesses
outside any loop still pay one extra (cache-hot) load — minor there.

**The cleaner answer for the never-grown case: skip the header entirely.** The
hoist/native-flag combination claws the indirection back for values that *are*
`List`s. But many `List`-typed values are never grown at all — a `[a, b, c, d]` of
fixed corners, a lookup table, a matrix row, a function argument that is only read.
For those the compiler picks the **inferred fixed-array representation** (§VL.6):
no `{len,cap,backing}` header, no `struct.get`, `l[i]` *is* the raw `array.get`
from the start — the indirection never exists rather than being optimized away.
This subsumes the old "constant/read-only-literal" special case (a compile-time
`[1,2,3]` is just one instance of "provably never grown") and generalizes it to any
value the growth analysis clears, literal or not. So the indirection cost has two
backstops: eliminated outright when the value is provably fixed, hoisted out of the
loop when it genuinely is a growable `List`.

### VL.2 — Growth strategy: 2× (DECIDED)

**Decision (locked for v1).** Double on full, with a small floor:
- First push on an empty list (`cap == 0`) → `cap = 4` (small enough not to waste
  on tiny lists, big enough to skip the 1→2→4 reallocation churn; Rust uses 4 for
  small element types, Go effectively starts at small powers of two).
- Otherwise on `len == cap` → `cap = cap * 2`, allocate `(array mut T)` of the new
  cap, `array.copy` the `len` live elements, swap `backing`, update `cap`.
- A bulk `reserve(n)`/`List<T>(capacity: n)` jumps straight to `cap = max(n, …)`
  in one allocation (skips the doubling ladder for known sizes — the
  `with_capacity` win).

**Rationale — why 2× and not libc++'s 1.5×.** The strongest argument for 1.5× is
allocator block-reuse: with 2× the new request always exceeds the sum of all
freed blocks, so a manual allocator can never recycle the vector's own debris;
with a factor below the golden ratio (φ ≈ 1.618) the freed blocks eventually
coalesce into something large enough to reuse. **That argument assumes a manual
allocator the program controls.** VL targets WasmGC:
- There is **no `realloc` / in-place extend** — every grow is a fresh
  `array.new` + `array.copy` regardless of factor, so 1.5× buys *no* cheaper
  grow, only more-frequent ones.
- There is **no manual `free` and no program-visible heap** — the old backing is
  simply dropped and reclaimed by the host GC's allocator, which VL does not
  control and cannot bump-reuse on the vector's behalf. The premise of the
  golden-ratio argument (the *same* allocator handing the freed block back to
  *this* vector) does not hold.

So the memory-reuse advantage of 1.5× evaporates, while its cost — ~1.4× more
reallocations and element-copy passes over a long append sequence — remains. With
that trade gone, we take 2×: fewer `array.copy` passes (each of which is a full
O(len) memory move the GC engine performs), fewer allocations for the GC to
track, and the simplest possible arithmetic (`cap << 1`). Peak transient slack of
up to 2× is acceptable for v1; if profiling later shows it matters for huge
lists, we can taper toward 1.25× past a threshold exactly like Go — that's a
constant-factor tweak behind the same API, not a representation change.

(Note we are explicitly *not* copying Python's ~1.125×. That factor is tuned for
a runtime that allocates a huge number of tiny lists and boxes every element;
VL's lists are unboxed and fewer, so doubling's copy savings dominate.)

**Shrink policy: grow-only.** `pop`/`remove` lower `len`, never shrink `cap` or
reallocate (matches Rust/Java/Go — auto-shrink breaks amortization). An explicit
`shrinkToFit()` method is a future addition, not v1.

### VL.3 — Generics: monomorphize per element type (no boxing)

**Decision.** `List<T>` is **monomorphized per concrete element type**, exactly
like the existing fixed-array path. Each distinct element wasm type gets its own
interned backing `(array mut T)` type and its own `List<T>` struct type, and the
`push`/`pop`/index lowerings operate on native `array.get`/`array.set` of `T` —
**no `anyref` boxing, no unbox-on-read.**

**Rationale.**
- It is the natural extension of what VL already does. `arrayType()` already
  interns one WasmGC array type per element wasm type; A10 already monomorphizes
  generic functions per call shape and collapses holes to concrete types before
  codegen. A monomorphized `List<T>` is "one more struct/array type pair per `T`"
  — it reuses machinery rather than adding a new boxing discipline.
- **Soundness.** VL's contract is "no `dynamic`, every value pinned to a concrete
  type before codegen." A boxed `anyref` backing would reintroduce a runtime
  any-typed slot and require a downcast (`ref.cast`) on every read — exactly the
  defer-to-runtime the contract forbids. Monomorphization keeps every element
  read statically typed.
- **Performance.** Unboxed, contiguous, cache-friendly `T`; no per-element heap
  box (the Java/Python tax); no `ref.cast` per access; Heap2Local can scalarize a
  list that doesn't escape. This is the whole point of choosing WasmGC arrays
  over a uniform pointer array.

**Cost & mitigation — code size.** Monomorphization means one copy of the list
machinery per element type (the classic Rust/C++ template-bloat trade). We bound
it by emitting the per-`T` *operations* (push/pop/grow/index) as **one shared,
generic helper per distinct wasm element type**, lazily, the way `toWasm.ts`
already lazily emits `__string_eq__` etc. — not inlined at every call site. Lists
of `i32`, `f64`, and `(ref $obj)` collapse to a handful of element wasm types in
practice (many VL object types share `(ref struct)`-shaped slots), so the
realistic blowup is small. We lean on binaryen's optimizer for the rest.

**Rejected alternative — boxed `anyref` backing (one impl).** A single
`List` over `(array mut anyref)` would be one implementation total, no
specialization. Rejected: it boxes every primitive element (an allocation per
`i32`!), requires a `ref.cast` on every read, defeats Heap2Local, and breaks the
"no runtime any-typed slot" soundness posture. The code-size saving is not worth
making the common case (lists of numbers/objects) slow and unsound-feeling. This
is the Java mistake (`List<Integer>` boxing) we have the type system to avoid.

### VL.4 — Surface API / spelling

The guiding decision: **`[...]` is the collection literal and `T[]` is the type.**
`[a, b, c]` constructs a three-element collection — the scripting-feel default
(Python/JS/Ruby/Swift). There is no coexisting user-facing fixed-array literal; the
raw fixed array is the substrate and inferred representation (§VL.6/§VL.7), not a
thing `[...]` ever means. (Reminder per the naming caveat: `List`/`Array` below are
*uncommitted* representation names, not surface types.)

- **Construction.** `[0, 1, 2]` (seed via literal) is the everyday, committed form.
  Empty and pre-sized (capacity) construction are needed capabilities whose
  **spelling is uncommitted**; the doc sketches them as `List<T>()` /
  `List<T>(capacity: n)`. Whatever the final spelling, it is a builtin generic shape
  resolved by the checker and lowered by name in `toWasm.ts` (the same pattern string
  methods use — types in defaultScope, lowering in toWasm, *no typecheck
  special-casing of a keyword*).

  **The `List(0)` ambiguity the owner raised — "is `0` an element or a capacity?"**
  VL **has named parameters** (call-site `f(name: value)`; the checker consumes the
  named arguments first, then the positional ones), so **`List<T>(capacity: n)` is
  unambiguous** — `capacity:` is spelled at the call site and can never be read as a
  positional element. The capacity constructor is safe *on its own*.

  We do **not** *also* offer an element-seeding `List(0, 1, 2)`: VL has **no
  variadics** (every function is fixed-arity) and **no ad-hoc overloading** (one
  binding per name per scope — DECISIONS B16), so an element-seeding `List(...)`
  would need both variadic arity *and* a second `List` binding overloading the
  capacity constructor — neither exists. Seeded construction is the **`[...]`
  literal** instead, which is exactly why the literal *is* the collection literal.
  The construction surface is therefore: **`[...]`** (seed), and the empty/capacity
  forms (uncommitted spelling, sketched as **`List<T>()`** / **`List<T>(capacity: n)`**).

  (Clarification: `self` is a **first-position positional convention**, *not* a
  call-site named argument. A function whose first parameter is named `self` is a
  method — `o.f()` rewrites to `f(o)` via UFCS (B14) — so the receiver must be
  *first* and positional; you never pass `self:` by name. Named-vs-positional and
  the `self` receiver are orthogonal mechanisms.)
- **Mutation methods** (compute → parens, B14 `self`-methods):
  `l.push(x)` (append, amortized O(1)), `l.pop()` (remove+return last, `T | null`
  on empty — see §VL.6), `l.clear()` (reset to empty *retaining capacity* — just
  `len = 0`, no reallocation; the one cheap building-block kept from the deferred
  per-frame-reuse story, §VL.6), and the higher-order producers `l.map(f)` /
  `l.filter(f)` (these are the A10 "build a new array of an inferred element type"
  use case that was waiting on this subsystem). Each is a free `self`-first function
  monomorphized per receiver, reachable as `l.push(x)` via UFCS. (Note `push`/`pop`/
  `clear`/`extend`/`+=` are exactly the **growth/mutation operations the
  representation-inference analysis watches for**, §VL.6: a value any of them
  touches is a growable `List`; a value none of them touch can take the fixed-array
  representation. `clear`, despite resetting `len`, *does* mark the value growable —
  a cleared-and-refilled list is the canonical reused buffer.)
- **Bulk combine — `concat` and `extend`** (both ride the bulk `array.copy`
  primitive — see §LS.2 — so neither degrades to a scalar `push` loop):
  - `a + b` (**concat** → a *new* `List<T>`): allocate one backing sized exactly
    `len(a) + len(b)` once, then **two bulk `array.copy`s** — `a`'s `len(a)`
    elements at offset 0 and `b`'s `len(b)` at offset `len(a)`. O(m + n) with **no
    incremental-growth realloc churn**: the result is sized in a single allocation,
    not grown one doubling at a time. (`+` dispatches through the B13 operator hook,
    exactly like string concat.)
  - `a.extend(b)` (**in-place** append-all): **one grow to fit** `len(a) + len(b)`
    (a single `array.new` + `array.copy` of the existing elements if a regrow is
    needed), **one `array.copy`** of `b`'s `len(b)` elements at offset `len(a)`,
    then bump `a.len`. One copy of `b` regardless of its size — never a per-element
    `push` loop.
  - `a += b` (**compound assignment**): comes for free. VL desugars `+=` to
    `a = a + b`, so once `+` on lists means **concat** (above), `a += b` works with
    no extra machinery. The catch is **semantics under reference semantics**: `a += b`
    *rebinds* `a` to the new concatenated list — any other holder of the old `a` keeps
    seeing the old (shorter) list, unchanged. `a.extend(b)` instead *mutates in place*,
    so every alias of `a` observes the appended elements. Put plainly: `+=` is
    **value-style append** (allocate a new list, rebind the name); `extend` is
    **in-place append** (one shared list, grown). Pick by whether aliases should see
    the change. (*Possible future optimization, not a semantic change:* when the
    compiler can prove `a` is unaliased at the `+=`, lower `a += b` to an in-place
    `extend` — same observable result, the new allocation elided.)
- **Indexing — traps on out-of-bounds (`l[i]: T`); `.get(i): T | null` is the safe
  accessor.** `l[i]` and `l[i] = v` route through the **B13 `"[]"`/`"[]="` index
  hooks** (assumed landing in parallel) — or, under the **native-indexing flag**
  (§VL.6), lower directly to `array.get`/`array.set` on `backing`, bypassing B13
  dispatch. A read `l[i]` checks `i` against `len` and yields the element as **`T`**;
  an out-of-bounds `i` **traps** (the unrecoverable-bug signal — §VL.6, the same
  thing `a[i]` already does today). The bound is **`len`, not the backing array's
  physical length** — the spare capacity slots `[len, cap)` are not addressable, so
  indexing into them traps like any other OOB index. The `"[]="` lowering
  bounds-checks the same way (and is an in-place element write — non-growing, so it
  does not force the growable representation). The **safe, checked accessor is a
  method, `l.get(i): T | null`**, for when an index may legitimately be out of
  range. Where the compiler can prove `i` in range, **bounds-narrowing** (§VL.6)
  elides the redundant bounds check, recovering a bare `array.get` — but this is now
  a pure optimization, because the trapping `l[i]` is *already* a bare `array.get`
  on the happy path (no `T | null` to unwrap, no tag).
- **Size members** (O(1), property syntax, read-only — DECISIONS B6):
  - `l.length` → `struct.get $len` (O(1), the logical size; mirrors arrays'
    `.length` but reads the field instead of `array.len`).
  - `l.capacity` → `struct.get $cap` (O(1), the allocated slots; the sibling
    O(1) property DECISIONS B6 explicitly reserved property syntax for).

This ties into every existing feature (B13 index traps, B14 self-methods,
DECISIONS B6 uniform-access size members, A10 monomorphization) without adding a
new dispatch mechanism; `[...]` is now the collection literal (type `T[]`), so there
is no fixed-array literal to fight.

### VL.5 — Interaction with `length` and the index traps

- `length` keeps its DECISIONS-B6 contract: O(1), read-only, property syntax. For
  the growable-`List` representation it lowers to `struct.get $len`; for the
  inferred fixed-array representation (and the raw-array substrate) it lowers to
  `array.len`. Same surface, two native lowerings — the uniform-access principle the
  decision was made to preserve. A user can read `l.length` but not assign it;
  resizing is via `push`/`pop`, never `l.length = n`.
- Indexing sees `len`, not `cap`. `l[i]` for `i in [0, len)` returns the element;
  `i in [len, cap)` (spare capacity) and any other out-of-range `i` **trap** — the
  spare slots are an allocation detail, not addressable state. This is exactly the
  Go/Rust *bound* (you index `len`, capacity is invisible to `[]`) *and* the Rust
  trap-on-OOB behavior (`Vec[i]` panics); the safe `.get(i): T | null` is the form
  that returns the missing case as a value.
- `length`/`count`/`capacity` stay distinct per DECISIONS B6: a dense list uses
  `length` (= live element count = `len`) and `capacity` (= `cap`). A future
  sparse collection would use `count`/`extent`; a list never overloads `length`
  to mean capacity.

### VL.6 — Bounds, iteration, and out-of-scope (v1)

- **Bounds behavior: `l[i]` traps on OOB (`l[i]: T`); `.get(i): T | null` is the
  safe accessor.** Out-of-bounds `l[i]` / `l[i] = v` **traps** — an uncatchable
  abort, the unrecoverable-bug signal. This is the **"results for expected absence,
  traps for bugs"** language principle (Summary; §OQ.3) applied to indexing: an
  index past the end is a *programmer error*, not a normal program state, so it
  fails loudly instead of silently propagating a `null`. The **safe form is a
  method, `l.get(i): T | null`**, for the case where an index may legitimately be
  out of range — named `get` because that is the conventional name for the *safe*
  accessor (Rust `Vec::get`, the inverse of trapping `Vec[i]`). The same rule
  applies uniformly to both representations of a `List` (growable and inferred-fixed)
  and to the raw-array substrate — they all index identically.

  **This keeps today's behavior rather than reversing it.** The raw array `a[i]`
  *already traps* on OOB (the B6 MVP); the user-facing `List` indexes the same way,
  so nothing about the existing fixed-array semantics changes. (An earlier review
  round had proposed flipping indexing to result-by-default `T | null`; this round
  reverses that and lands on trap + `.get`, the Rust/Swift convergence — which also
  *de-risks the perf story*: with the safe default already a bare `array.get`,
  bounds-narrowing drops from a load-bearing prerequisite to a mere optimization,
  and a missed narrowing costs a redundant compare-and-trap, not a per-access
  null-unwrap.) **`Map[k]` is the deliberate exception** — a map lookup returns
  `V | null` because a missing key is a normal, expected result, not a bug (Swift
  dictionaries and `HashMap::get` do the same). Sequence indexing traps; map lookup
  yields an optional.

- **Native-indexing flag — the resolution to the B13 indirect-call cost.** A
  pure-VL `List` whose `l[i]` routes through the B13 `"[]"` method pays a
  **per-access indirect call** — fine for cold code, a real tax in hot loops, and
  the one place a `.vl` std `List` is slower than a raw array. The resolution is a
  **type-level native-indexing flag**: `List`'s `"[]"` / `"[]="` / `.length` lower
  to native `array.get` / `array.set` / `array.len` on the `backing` field,
  **bypassing B13 dispatch entirely**. Precedent: VL already special-cases nominal
  builtins (`string`, `i32`) in codegen by the type's `name`, so codegen
  recognizing one more std type's indexing is in-keeping. Two ways to express the
  flag (a sub-choice for the implementation PR, §OQ.4):
  - **Nominal recognition** (simplest): codegen knows `List` by `name` and inlines
    its indexing, exactly the way `string` is special-cased today.
  - **Declarative annotation** (more general): mark a `"[]"` method as
    native-lowered / intrinsic, so *any* std type can opt into native indexing
    without a hardcoded name in codegen.
  Combined with **backing-pointer hoisting** (next bullet) and **bounds-narrowing**,
  this yields the ideal for a *genuinely growable* `List`: the native flag makes
  `l[i]` a bare `array.get` (no indirect call), the hoist pulls the `backing` load
  out of the loop, and bounds-narrowing elides the redundant trap-check → **codegen
  identical to a raw array**, while `List` stays an ordinary `.vl` std type
  everywhere else. (For values the growth analysis proves never grow, none of this
  is needed: the **inferred fixed-array representation** below has no header to load
  and no dispatch to bypass — `l[i]` is the raw `array.get` outright.)

- **Backing-pointer hoisting (LICM) — the third enabler.** The native flag turns
  `l[i]` into `list.backing[i]`, but that is still a `struct.get` (load `backing`)
  *then* an `array.get` — two loads per element, the second pointer-chasing to a
  separate heap object (§VL.1). In a tight loop that doubling is ~1.5–2× on a
  load-bound kernel. `backing` is **loop-invariant**, so the fix is to **load it
  once before the loop** and leave a bare `array.get` in the body —
  instruction-identical to a raw-array loop. This is how LLVM gets Rust `Vec` /
  C++ `std::vector` indexing to native speed (hoist the data pointer). **VL likely
  has to do this explicitly**: binaryen's LICM over a GC `struct.get` across a loop
  is *not* guaranteed (it must prove no `push`/grow/reassign in the loop touches
  `backing`), so VL should hoist the backing load for the canonical
  `for i in 0 to list.length { list[i] }` pattern rather than rely on binaryen.
  Without the hoist, bounds-narrowing + the native flag still leave the per-access
  `struct.get`; with all three, the list loop is the raw-array loop.

- **Bounds-narrowing — now a pure optimization, not a prerequisite.** Under the
  trap-on-OOB decision, `l[i]` is *already* a bare `array.get` on the happy path:
  there is no `T | null` to handle, no per-access null-unwrap, no tagged
  `i32 | null` for scalars. What remains is the **bounds check that precedes the
  trap**. Bounds-narrowing elides *that*: when the compiler can prove the index is
  in range — inside `for i in 0 to a.length`, in the then-branch of
  `if i < a.length`, or after an explicit guard — it drops the compare-and-trap,
  leaving the bare `array.get`. This reuses the same narrowing engine that refines
  nullness and union members (A5, `docs/narrowing.md`), pointed at the
  index/length relation. The crucial difference from the result-by-default world:
  **a missed narrowing now costs only a redundant compare-and-trap, not a
  per-access null-unwrap** — so the safe default is fast *with or without* the
  optimization, and bounds-narrowing is a "make the hot loop optimal" nicety rather
  than the thing standing between safe and usable. (It is still worth doing, and
  still touches the core narrowing engine, §OQ.4 — just no longer load-bearing.)
- **`pop()` on empty — `pop(): T | null`.** A `pop(): T` has no `T` to return on
  empty, so it could only trap or hand back garbage (unsound); encoding absence in
  the type keeps it **total** and type-safe. This is the *normal-absence* side of
  the principle (not the bug side): an empty list is an ordinary program state, not
  a programmer error, so `pop` returns `T | null` rather than trapping. It composes
  with machinery VL already has — `is`/`??`/`?.` null-narrowing — so the empty case
  needs zero new concepts. It is the typed-language consensus (Rust
  `Vec::pop -> Option<T>`, Swift `popLast() -> Element?`); only the dynamic
  languages throw (Python `IndexError`).

  **VL's failure model (clarification).** VL has **traps** — an uncatchable wasm
  abort, like Rust `panic!` (`a[i]` out-of-bounds traps) — but **no exceptions** (no
  catchable throw). So the real choice for empty `pop` is *trap* vs *total
  `T | null`*, never "throw." We take total `T | null` (normal absence). The
  dividing line is consistent across the API: **bug-class index errors trap**
  (`l[i]` OOB), **normal-absence results return `T | null`** (`pop()` on empty,
  `l.get(i)`, `Map[k]`). A future Swift-style trapping `removeLast()` for the "known
  non-empty" case is a natural addition (the trap/optional dual, mirroring `l[i]`
  vs `l.get(i)`) — not v1.
- **Iteration.** `for x in list` works exactly like `for x in array` (B8),
  iterating `[0, len)` via `array.get` on the backing. (`for x, i in list` index
  form rides on the same B8 destructuring work as arrays.) **Mutating the list
  during iteration** (e.g. `push` inside the loop) is *unspecified* in v1 — the
  loop captures `len` at entry like a C-style index loop; defining
  invalidation/aliasing semantics (Go's "append may realloc, breaking the alias"
  pitfall) is deferred.

**Explicitly out of scope for v1 (xfail / future):**
- `insert(i, x)` / `remove(i)` at arbitrary positions (O(n) shift) — `push`/`pop`
  (ends) only in v1.
- `shrinkToFit()` / any auto-shrink — grow-only.
- **Per-frame pooling / reuse beyond `clear()`** — a heavier "retain this buffer
  across frames" story (`retain`, `mapInto(dst)`, free-list pooling) is **deferred
  past v1**: it is not clearly first-release-critical, and the inferred fixed-array
  representation (§VL.7) already removes the per-frame allocation for the
  fixed-size cases *for free*. The one cheap piece kept in v1 is capacity-retaining
  **`clear()`** (`len = 0`, no realloc) — the building block a manual frame-reuse
  loop needs, at zero implementation cost.
- The **trapping element accessor is the default `l[i]`, so there is nothing to
  defer here** — the v1 surface is `l[i]: T` (traps on OOB) *plus* the safe
  `l.get(i): T | null`. A future Swift-style trapping `removeLast()`-flavored
  "asserting" variant of *other* operations is the only deferred dual.
- Slicing a list into a view that **aliases** the backing (Go-style shared
  backing); v1 `slice` (if any) copies.
- **A *user-facing* low-level array escape** (an advanced `Array<T>` / unsafe
  primitive for header-less contiguous memory exposed deliberately for FFI / SIMD /
  linear-memory — §OQ.7). Note this is now distinct from, and largely *subsumed*
  by, the **inferred fixed-array representation** (§VL.7): the common reason to want
  a fixed array (no header, no indirection, raw `array.get`) is delivered
  automatically by representation inference under the ordinary `[...]`/`List`
  surface, so the remaining "explicit low-level escape" is only for the genuinely
  low-level memory-addressing cases, and stays a future advanced surface, not v1.
- Value-semantics / copy-on-write (Swift-style). VL lists are **reference**
  values in v1; `let b = a` shares the same list — **consistent with VL objects,
  which are reference types today**. There is no sound case for collections being
  value types while objects stay reference (the "then why doesn't object
  assignment copy too?" point): value-vs-reference is a **language-wide** call
  (objects + collections together), not a `List` detail. Default for v1 =
  **reference**; Swift-style value-everywhere-with-COW is a coherent alternative
  *only if adopted uniformly* — see the language-level open question (§OQ.2).
  **Note the representation-inference link (§VL.7):** the alias-unification step
  that the fixed-vs-growable analysis needs exists *only because* lists are
  reference values (aliases must agree on representation); value semantics would
  remove aliasing and make the analysis strictly easier. So this language-wide call
  also moves the difficulty of §VL.7.
- Equality/hashing of lists (structural `==` over elements) — defer until the
  element-comparison story for the value-eq path is settled.

**Deferred operations (specified shape, not v1).** Two sub-range operations are
designed-but-deferred — they are worth pinning now so the surface is coherent:
- **`slice`** — a *non-mutating* sub-range **copy** into a new list. Cheap: a
  single bulk `array.copy` of the `[start, end)` window into a freshly-sized
  backing (the same operation already shipped for **strings** in A7). Deferred only
  because it is additive over the v1 core.
- **`splice`** — an *in-place* remove-range / insert, **returning the removed**
  elements. Heavier: it needs element **shifting** to close the gap (and to open
  room when inserting), i.e. the same O(n) shift as `insert`/`remove`, plus a
  `slice`-style copy for the returned removed range.
- **Naming concern (flag, don't decide).** The JS `slice` (copy) / `splice`
  (mutate) pair is notoriously confusable — one letter apart, opposite
  destructiveness. Prefer clearer verbs that make the copy-vs-mutate split obvious:
  Swift's `removeSubrange` / `insert(contentsOf:)` / sub-range subscript, or Rust's
  `drain` (remove + yield) / `split_off` (cut in two). The verb choice is part of
  the deferred decision, not settled here.

### VL.7 — Representation inference: `T[]` is the model, fixed-array is an inferred lowering

**The decision.** There is **one user-facing collection and one literal** — the type
`T[]`, constructed with `[...]` — and that is the entire mental model the programmer
carries. The compiler then **infers the representation**: a `T[]` value is lowered to
a **header-less fixed WasmGC array** when it can prove the value (and every alias of
it) is *never grown* (the "`Array`" representation), and to the full
`{ backing, len, cap }` struct (§VL.1; the "`List`" representation) otherwise. The
choice is **invisible to semantics** — both representations index the same way (trap
on OOB, `.get(i): T | null`), allow in-place element writes (`a[i] = v`), report
`.length`, and iterate identically — and visible only in speed and footprint.
**For now this inference is the *only* mechanism** — there is no user-facing way to
force a representation (the override below is future/uncommitted), so `T[]` plus
inference is the whole committed surface.

**Why this is the right shape for VL specifically.** It is the same move VL already
makes everywhere else: *the type/representation is hidden and inferred from how the
value is used.* VL infers an un-annotated parameter's type from its body and
monomorphizes per call shape; inferring "fixed vs growable" from whether
growth operations are ever applied is that exact philosophy pointed at
representation. No other mainstream language infers fixed-vs-dynamic from usage —
Rust/Go/C make you *choose* (`[T;N]` vs `Vec`, `[N]T` vs `[]T`), Swift/Python/JS
give you *only* the growable one — precisely because none of them have VL's
"infer everything from usage" stance. This is a place VL's identity buys it
something the others can't have.

**What it buys — three review concerns resolved by one idea:**
1. **The indirection cost (raised earlier in this very review) disappears for the
   fixed case.** A never-grown value has no `{len,cap,backing}` header and no
   `struct.get` indirection — `l[i]` *is* a raw `array.get`, not a header-load
   followed by an array-load (§VL.1). The hoist/native-flag machinery is only needed
   for values that genuinely grow.
2. **The fixed-size-buffer gap closes** without a second user-facing type. The
   `[a, b, c, d]` of four corners, a 16-slot lookup table, a matrix row — the cases
   the systems/game reviewers wanted raw fixed arrays for — get the header-less
   representation automatically, under the ordinary `[...]` literal.
3. **The single `[...]` literal is preserved** — the unification stays intact;
   nobody picks a representation by hand.

**Why it is safe to adopt — it can only ever be a *win*.** Frame it precisely:
**`List` is the semantic model; fixed-array is an optimization the compiler applies
only when it can prove it sound.** If the analysis is uncertain, it falls back to a
`List`. So:
- **Worst case = today's design** (everything is a growable `List` — correct, just
  not as lean).
- **Best case = a header-less raw array** (faster, smaller) — for the values it can
  prove.
- **Never observably wrong**, because the two representations are semantically
  identical. This de-risks the whole idea: ship `List`-as-default first, then layer
  representation inference in as an optimization pass, with no redesign and no
  user-visible behavior change.

**How the analysis works (and where it is hard — stated honestly).**
- **What forces "growable":** the value is the receiver of any *length-changing*
  operation — `push`, `pop`, `extend`, `+=`, `splice`/`insert`/`remove` (when
  added), or `clear()` (a cleared-and-refilled buffer is the canonical reuse case,
  so `clear` marks growable even though it only lowers `len`). In-place element
  writes (`a[i] = v`) and reads do **not** force growable — a fixed array is still
  element-mutable, just not resizable (exactly Rust `[T; N]`).
- **It is interprocedural, not local.** Growth can happen through a callee
  (`f(xs) { xs.push(1) }` ⇒ any `[...]` passed to `f` is growable) or an alias
  (`let b = a; b.push(x)` ⇒ `a` is growable too). So "is this ever grown?" is a
  constraint that **propagates backward from use sites to the literal** — the same
  flavor of constraint propagation as type inference, and a natural fit for VL's
  whole-program monomorphizing compile.
- **Aliases must agree on representation.** Because lists are *reference* values
  (§VL.6 out-of-scope; §OQ.2), all aliases of a value share one representation, so
  the analysis unions aliases (union-find) and asks "does *any* alias ever grow
  it?" This aliasing step is the real cost of the analysis — and it is exactly the
  part that **value semantics would eliminate** (no aliasing to unify). So §VL.7's
  difficulty is downstream of the language-wide value-vs-reference call (§OQ.2).
- **Conservative v1 is shippable.** The analysis degrades gracefully: when in
  doubt, pick `List`. A first version can take the fixed-array representation only
  for the easy, provable cases (a local `[...]` that is read-only and never escapes,
  or escapes only into params the analysis can see are read-only) and leave
  everything else a `List`. Always correct; optimizes opportunistically; tightens
  over time.

**Interaction with variance (A8/A9).** "A read-only parameter accepts either a
fixed array *or* a `List`, but a growing parameter requires a `List`" is exactly a
**readable/writable variance** statement: the fixed-array representation is usable
anywhere a *non-mutating* `List` is wanted. So the function-signature side of the
analysis ("does this param grow its argument?") is the same information the variance
work (A9) needs, and the two should be designed together: a param typed as a
*readable* sequence admits both representations; a param that grows its argument
constrains it to the growable one.

**The escape hatch: annotation overrides inference — UNCOMMITTED / future.** A
natural future extension is to let an explicit annotation *force* a representation
when the programmer knows better than the analysis — e.g. force the growable form to
`reserve` ahead of a fill the analysis can't yet see, or force the fixed form to
*require* the lean one and get a compile error if some code path would grow it. This
would mean **nameable representations** — provisionally `List<T>` (force growable) and
`Array<T>` (force fixed, growth ops become type errors), with `T[]` remaining the
inferred default — making `T[]` in a parameter position read as the readable-sequence
supertype that accepts either (the variance/A9 tie-in). **None of this is committed**:
the forcing forms, the names `List`/`Array`, and whether to expose forcing at all are
deliberately left open. For now the surface is `T[]` + inference, full stop. (Note: a
*safe* fixed-form `Array<T>` here is a different thing from the *unsafe low-level*
memory escape historically also called `Array<T>` in §OQ.7 — if both are ever
pursued, the name clash must be resolved.)

**Status.** The *decision* (one `T[]` model; fixed-array as inferred representation;
never-wrong fallback) is taken this round. The *analysis* — the interprocedural
growth-detection + alias unification — is **new open compiler work** (§OQ.4), gated
in difficulty by the value-vs-reference call (§OQ.2) and best co-designed with
variance (A9). The *user-facing names* (`List`/`Array`) and any *forcing* surface are
**uncommitted** (above). It is explicitly fine for v1 to ship the conservative
inference (or even single-representation-first) and tighten later.

---

## §C2 — Collections as structural interfaces: `{[K]:V}` as interface, `Map`/`List`/`Set` as subtypes

> Status: **design / research only.** This records a decision the owner made this
> round ("C2") about *what an index-signature type means* and *how the concrete
> collections relate to it*. As with the rest of this doc, the `DECISIONS.md` entry
> lands **with implementation, not before** — this section is the mental model and the
> rationale, not the committed decision record. (The provisional names `List`/`Array`
> carry their §VL naming caveat here too; the new interface names **`Mapping`** /
> **`Sequence`** introduced below are *design vocabulary*, uncommitted in exactly the
> same way.)

**The decision (C2).** The index-signature types — `{[K]:V}` (a thing you can index
by `K` to get `V`) and its sequence form `{[i32]:T}`, i.e. `T[]` (a thing you can
index by `i32` to get `T`) — are **structural interfaces**, not concrete collections.
They describe a *capability* ("indexable by K → V"), nothing about representation. The
concrete collections — `Map<K,V>`, `List<T>`, `Set<T>` — are **subtypes** of those
interfaces (structural subtyping), each carrying its own representation: backing
arrays, a hash index, `len`/`cap` fields. The subtype direction is:

- **`Map<K,V> <: {[K]:V}`** — the concrete map is the *subtype*; the index-sig is the
  *supertype*.
- **`List<T> <: {[i32]:T}`** (= `List<T> <: T[]` read as an interface) — the concrete
  growable sequence is the subtype; the bare indexable-by-`i32` interface is the
  supertype.

Read this exactly as Python's `dict <: Mapping` / `typing.Dict`: the *concrete* type
is the subtype, the *interface* is the supertype. A `Map<K,V>` flows into any position
that asks for a `{[K]:V}`; you never go the other way (a bare `{[K]:V}` is not
automatically a `Map` — it lacks the representation).

**What C2 was chosen *over*.** The rejected alternative the owner had on the table was
**"`{[K]:V}` *is* a full `Map`"** — the *index-sig overload*, where writing an
index-signature type gave you the whole `Map` surface. That produced the concrete bug
this decision fixes: **a value "declared as something smaller than a map" behaved as a
full map** (it carried `.set`/`.get`/`.values`/etc. it had no business carrying). C2
draws the line precisely — the index-sig is *only* the indexable-capability interface;
the rich `Map` surface lives on the `Map` subtype.

### C2.1 — Methods are self-functions (UFCS, B14), in two layers

A collection method `o.f(a)` is, per **B14 UFCS**, sugar for a free function `f(o, a)`
whose first parameter is `self` — exactly the §VL.4 framing (`l.push(x)` *is*
`push(l, x)`). So "collection operations" are just self-functions; the only question
C2 answers is **on what type the `self` parameter is typed.** There are **two layers**:

- **Interface-level self-functions** — `self` typed at the bare index-sig
  (`{[K]:V}` / `{[i32]:T}`). These are *generic over representation*: they work on
  **any** mapping or sequence regardless of how it stores its data — a `Map`, a plain
  object index-sig, a `List`, an inferred fixed array. The read/index/iterate surface
  lives here: `get`, `has`, `length`, iteration, and the producers `map`/`filter`. The
  owner's sketched signature shape — `function add<K,T>(self: {[K]:T}): {[K]:T}` —
  is exactly this framing: a collection op *is* a self-function on the index-sig. (One
  precision below on which ops can actually sit at this layer.)
- **Representation-level operations** — `self` typed at the *concrete* subtype
  (`Map<K,V>` / `List<T>` / `Set<T>`). These need the concrete fields — the hash
  index, the `{backing,len,cap}` header — so they cannot be written against the bare
  interface. Construction, `push`/`pop`/grow (§VL.2), `set`/`delete` that mutate the
  hash table, and rehash all live here.

**The precision that decides the layer (state it explicitly).** The dividing line is
**read/index vs. mutate-representation**:

- An op that only **reads or indexes** can live at the **interface level** — it needs
  nothing but the `{[K]:V}` capability, so it works on any representation. (`get`,
  `has`, `length`, iteration, `map`/`filter`.)
- An op that **mutates representation** — grows the backing, rehashes, changes
  `len`/`cap`, touches the hash index — must be defined on the **concrete subtype**,
  because it needs the fields the bare interface does not expose. (`push`/`pop`,
  `set`/`delete`, `reserve`, `clear`.)

So the owner's "`List`/`Map` as self-functions on the index-sig" instinct is **right
for the read/index/iterate surface** and *only* that surface; the
mutating/constructing surface is self-functions on the **concrete** type. This is the
same readable/writable split §VL.7 draws for variance, surfaced here as "which type
the `self` param wears."

### C2.2 — `Set<T>` is its OWN type — *not* `{[T]:boolean}`

**Decision.** `Set<T>` is a **distinct concrete type** with its own surface — it is
**not** spelled, and not structurally equal to, `{[T]:boolean}`. Its surface is:

- `.add(x)` — insert membership.
- `.has(x): boolean` — membership test.
- `.delete(x)` — remove membership.
- `.length` — element count (O(1), property syntax — see C2.3).
- `.values(): T[]` — the elements (or iteration yielding `T`, C2.4).

Conceptually `Set<T>` is a subtype of a **set-membership interface** (C2.5), *not* of
`{[T]:boolean}`.

**Why the old `{[T]:boolean}` spelling was wrong (the bug C2 kills).** Spelling a set
as `{[T]:boolean}` made it **structurally a map from `T` to `bool`** — and under
structural typing that means *every `Map` method type-checks on it*. A "set" written
this way leaks the entire Map surface: `.set(k, v)`, `.get(k): boolean | null`, and
worst of all `.values(): boolean[]` (the booleans! — when a set's values should be its
*elements*, `T[]`). That is the same class of bug as the index-sig overload in the
section opener: a value carries a surface it has no business carrying, because its
*spelling* accidentally made it a richer type. Making `Set<T>` its own nominal-ish
concrete type — subtype of a membership interface, **not** of `{[T]:boolean}` — means
the only methods that type-check on it are the set methods above. The `boolean` was
never a real value a user stored; it was a representation artifact of spelling
membership as a map-to-bool, and it should never have been observable.

### C2.3 — Size unifies on `.length`

**Decision.** Drop `.size` for `Map`/`Set`; use **`.length`** uniformly across
`List`, `Map`, and `Set`. This is the **DECISIONS B6** member: O(1), read-only,
property syntax (no parens), uniform-access. It is precisely the "align the method
names with arrays/lists" the reviewer asked for — and it is *what enables a single
`Iterable`/`Sequence` surface* (C2.5): if `List`/`Map`/`Set` all expose `.length`
identically, an interface-level self-function (C2.1) can ask for `.length` on any of
them.

`.length` **lowers to the field or intrinsic appropriate to each representation** —
same surface, different native lowering, exactly the §VL.5 pattern:

- `List<T>` → `struct.get $len` (the growable header) or `array.len` (the inferred
  fixed representation, §VL.7).
- `Map<K,V>` → `struct.get` of the hash map's stored entry count.
- `Set<T>` → `struct.get` of the set's stored membership count.

One member, three lowerings; the user never sees the difference. (This deliberately
retires `.size`/`.count`-style per-type spellings for the membership/mapping
collections; `count`/`extent` stay reserved for a future *sparse* collection per
§VL.5, not for `Map`/`Set`.)

### C2.4 — Iteration / `for k, v` (B8)

**Decision.** Iteration ties to **B8** and is uniform across all collections — it is
the entries/destructuring surface the reviewer asked about (`for index, value in
foo`), planned via **B8 destructuring**, and it is **not** Map-specific:

- `for v in seq` — a sequence's elements.
- `for v, i in seq` — element **and** index (the sequence + index form, the same B8
  destructuring §VL.6 sketches for lists/arrays).
- `for k, v in map` — a map's entries (key + value).
- `for x in set` — a set's elements.

This is one destructuring mechanism (B8) pointed at each collection's natural
"entries" shape; it applies uniformly because all three concrete collections are
subtypes of the iterable interfaces in C2.5. There is no per-collection iteration
machinery.

### C2.5 — The surface taxonomy (Mapping / Sequence / Set-membership)

The interface hierarchy C2 implies — **provisional names, uncommitted** (flagged in
exactly the same spirit as the §VL "names uncommitted" caveat for `List`/`Array`):

- **`Mapping`** — the read-only interface `{[K]:V}`: `get`, `has`, `length`, iterate
  entries (`for k, v`). **Subtypes:** `Map<K,V>` and the plain **object index-sig**
  (a struct used as an index-sig also satisfies `Mapping`). This is what lets a
  function typed `{[K]:V}` accept any mapping regardless of representation.
- **`Sequence`** — the read-only interface `{[i32]:T}` = `T[]`: index, `length`,
  iterate (`for v` / `for v, i`). **Subtypes:** `List<T>` *and* the **inferred
  fixed-array representation** (§VL.7) — both are sequences; that they differ in
  representation is invisible at this interface (the §VL.7 "both representations index
  identically" point, restated as subtyping).
- **`Set`-membership** — the interface `Set<T>` is the subtype of: `add`/`has`/
  `delete`/`length`/iterate-elements. (Kept distinct from `Mapping` precisely because
  of C2.2 — a set is *not* a map-to-bool.)

Treat **`Mapping`** / **`Sequence`** as design vocabulary only — no decision is taken
to expose those names to users, same as `List`/`Array`. They name the *shape* the
interface-level self-functions (C2.1) are written against.

### C2.6 — Construction is concrete-type creation

**Decision.** You **never construct a bare `{[K]:V}` interface** — there is nothing to
allocate, it is only a capability. You construct a **concrete** `Map<K,V>` /
`List<T>` / `Set<T>`:

- Sequences via the **`[...]` literal** (the committed surface, §VL.4 / §LS.4).
- Maps and sets via the provisional **`Map()` / `Set()`** forms (uncommitted spelling,
  the §VL.4 named-param construction story).

The interface is only ever a **supertype a concrete value flows into** — e.g. a
parameter typed `{[K]:V}` accepts *any* `Map<K,V>` (and any object index-sig), but the
caller always hands it a concrete value. This is the **variance** story (**A9**) again,
identical to §VL.7's:

- A parameter typed at the **read-only interface level** (`{[K]:V}` / `{[i32]:T}`)
  accepts **any representation** — it only reads, so any subtype is admissible
  (readable).
- A parameter that **mutates representation** requires the **concrete subtype**
  (`Map<K,V>` / `List<T>`) — it needs the fields, so the bare interface does not
  satisfy it (writable).

Same readable/writable split as §VL.7's "read-only param accepts either representation;
growing param requires the growable one" — C2 just generalizes it from
fixed-vs-growable `List` to interface-vs-concrete across all three collections, and it
is the same information **A9** needs, so the two should be co-designed.

### C2.7 — Rejected alternatives

- **(A) `{[K]:V}` *is* a full `Map` (index-sig overload).** Rejected. Writing an
  index-signature type would hand you the entire `Map` surface, so a value "smaller
  than a map" behaved as a full map (the opening bug), and `Set`-as-`{[T]:boolean}`
  leaked every Map method (`.set`/`.get`/`.values: boolean[]`, C2.2). It conflates the
  *capability* with the *concrete type*.
- **(B) Nominal-only collections with no structural interface.** Rejected. Make
  `Map`/`List`/`Set` purely nominal and drop `{[K]:V}` as a meaningful type. This
  loses the "works on *any* mapping/sequence" genericity (C2.1's interface-level
  self-functions could no longer be written against a representation-neutral shape) and
  loses **object-index-sig interop** (a plain object used as `{[K]:V}` would no longer
  satisfy a mapping parameter). Too rigid for a scripting-feel language.
- **C2 (chosen) — structural interface + concrete subtypes — is the middle.** The
  index-sig is the structural *capability* interface; the concrete collections are its
  *subtypes* carrying representation. This keeps the "any mapping/sequence" genericity
  and the object-index-sig interop of a structural interface, **without** letting a
  bare index-sig masquerade as a full `Map`/`Set`.

### C2.8 — Where this is hard / honest caveats

- **Method resolution across the two layers (C2.1) needs care.** When `o.f(a)` could
  resolve to an interface-level `f(self: {[K]:V})` *or* a representation-level
  `f(self: Map<K,V>)`, the resolver must prefer the most specific applicable `self`
  type (the concrete subtype when the receiver is concrete) — the standard
  most-specific-overload question, but VL has **no ad-hoc overloading** (one binding
  per name per scope, DECISIONS B16), so two self-functions named `f` on different
  `self` types is *itself* something the binding model has to permit (self-functions
  are dispatched by receiver type, not overloaded by name in a scope) — flag, don't
  decide here.
- **Subtyping + structural typing interaction is unspecified.** "`Map<K,V> <: {[K]:V}`"
  is a structural-subtyping claim; how it composes with VL's existing structural
  matching (does a `Map` *structurally* match `{[K]:V}`, or is the subtyping a
  declared relationship?) is open and ties into the variance work (A9).
- **The `Set` membership interface name and shape are provisional**, like
  `Mapping`/`Sequence` — and whether a set should be expressible as "a `Map<T, unit>`"
  internally (a representation choice) without that leaking to the surface (the C2.2
  lesson) is a representation question deferred to the `Set` implementation.
- This section takes the *decision* (interface-as-supertype, concrete-as-subtype; `Set`
  its own type; `.length` uniform; B8 iteration; construction is concrete). The
  *checker/resolver work* — structural subtyping for the index-sig, the two-layer
  self-function dispatch, the `Mapping`/`Sequence` interface plumbing — is **new open
  compiler work**, co-designed with variance (A9), and lands with implementation. The
  `DECISIONS.md` entry follows the code, not this doc.

---

## Phased implementation outline (for the follow-up PR)

This is what the `List` PR would build, in dependency order. **No code is written
here** — this is the plan the design commits to.

1. **Type & checker.** Introduce `List<T>` as a builtin generic shape (defaultScope
   entry, like the array index-signature shape + string-method types). Inference
   pins `T` from constructor args / `reserve` annotations, reusing the A10
   through-collections unification. `length: i32` (read-only) and `capacity: i32`
   as O(1) property members on the shape's contract; `push`/`pop`/`map`/`filter`
   as method types. Wire `"[]"`/`"[]="` index-trap contract members (depends on
   B13 landing).
2. **WasmGC types.** Add a `listType(element)` interner mirroring `arrayType()`:
   build the `struct { backing: (ref (array mut T)); len; cap }` per element wasm
   type, reusing the existing per-element array interner for the backing.
3. **Codegen — construction & access.** `List<T>()` → `struct.new` with empty
   backing + `len=0,cap=0` (or a shared sentinel empty array); `List<T>(capacity: n)`
   → allocate backing of cap = n, `len=0`; the `[…]` literal → allocate backing of
   cap = element count, fill, `len=cap=n`. `l[i]`/`l[i]=v` → the `len`-bounded
   **trap-on-OOB** `array.get`/`array.set` lowering (the safe `l.get(i): T | null` is
   the method form), via the B13 traps **or** the native-indexing flag (§VL.6) that
   bypasses them. `.length`/`.capacity` → `struct.get`.
4. **Codegen — push/pop/grow.** A lazily-emitted-per-element-wasm-type helper set
   (à la `__string_eq__`): `__list_push_T__` (the `len==cap` grow-and-copy + write
   + `len++`), `__list_pop_T__` (`len--`, read, `T|null` on empty),
   `reserve`/`grow` (`array.new` of new cap + `array.copy` + swap). Growth = 2×,
   floor 4.
5. **Iteration.** Extend B8 `for…in` to recognize the list shape and iterate
   `[0, len)` over `backing` (vs `array.len` for the raw-array substrate).
6. **Higher-order producers.** `map`/`filter` build a new `List<U>` of the
   inferred result element type — the A10 "build an array of an inferred element
   type" capability this subsystem unblocks.
7. **Tests.** A `tests/cases/collections/` corpus: construct/push/pop, growth
   (assert `length` vs `capacity` across the doubling boundary), index get/set,
   **OOB `[i]` → trap** cases (alongside the existing array trap tests) and the
   **safe `l.get(i): T | null`** path (including the OOB → `null` case), the
   **bounds-narrowed** in-range case lowering to a plain `array.get` with the
   trap-check elided, `clear()` (capacity retained), `map`/`filter`, `for…in`,
   empty-`pop` nullable narrowing, plus `xfail-*` files pinning the out-of-scope
   gaps (insert/remove, shrink, per-frame pooling beyond `clear`, COW) per the
   soundness-corpus convention.
8. **Representation inference (optimization, can land after the core).** The
   §VL.7 growth analysis: detect `List` values that are never grown (interprocedural
   + alias-unioned) and lower them to the header-less fixed-array representation;
   conservative default to growable `List` when unproven. Shippable as a later pass
   — the core `List` above is correct without it.
9. **Docs.** Flip `ROADMAP` B6 to a one-line done marker; add a terse
   DECISIONS entry (one user-facing collection **spelled `T[]`** + `[...]` literal,
   the *names* `List`/`Array` **uncommitted** + 2× growth + monomorphized-not-boxed +
   grow-only + **trap-on-OOB indexing with `.get(i): T | null`** (and
   `Map[k]: V | null`) + native-indexing flag + **fixed-array as inferred
   representation**, with the "WasmGC has no realloc/free so the golden-ratio
   argument doesn't apply" rationale). This design doc stays as the mental model.

## Open questions for the owner

1. **Literal & type spelling — DECIDED this review (no longer open).** `[...]` is the
   **collection literal** and **`T[]` the type** (the scripting-feel default —
   Python/JS/Ruby/Swift). The raw fixed array is the substrate + inferred
   representation (§VL.7), not a coexisting `[...]` meaning, so there is no fork left
   to resolve. **Open sub-point (deliberately uncommitted):** the *names* `List` /
   `Array` and any *forcing* annotation surface (§VL.7) — for now `T[]` + inference
   is the whole committed surface. (The live questions are §OQ.2 onward.)
2. **Value vs reference — language-wide (default reference).** Not a
   collections-only question: there is no sound case for `List` being a value
   type while VL objects stay reference. v1 default = **reference everywhere**
   (objects *and* lists — consistent with VL today; matches Python/JS/Java).
   The coherent alternative is **value everywhere via copy-on-write** (Swift) —
   nice predictability (nothing mutated through an alias), cheap via COW — but
   only if applied **uniformly** to structs/objects *and* collections, decided
   once language-wide. Do not bolt COW onto `List` alone.
3. **Error model — language-wide (errors-as-values, with the bug/normal-state
   line).** The direction the owner favors: *expected, recoverable* outcomes encode
   failure **in the return type** via unions — `T | null` for normal absence,
   `T | E` (discriminated with `is`) for "failed with a reason" — rather than
   try/catch, leaning on VL's existing union + `is`/null narrowing; while
   **unrecoverable *bugs* trap** (the Rust panic-vs-`Result` split). The line is
   drawn at *normal program state vs programmer error*. This ties to the
   `// TODO: exceptions` stub in the AST — the broader language-wide decision is
   *not* fully settled here, but the **indexing instance is decided this review**:
   out-of-bounds `a[i]` **traps** (a bug), while `pop(): T | null`, `l.get(i): T |
   null`, and `Map[k]: V | null` return **normal absence** as a value. (An earlier
   round had proposed result-by-default indexing — `a[i]: T | null`; this round
   reverses that to trap + `.get`, matching Rust/Swift, and recategorizes indexing
   OOB as a bug rather than expected absence.)
4. **Indexing & representation — perf knobs + the inference analysis (the headline
   open work).** Trap-on-OOB indexing is **decided** (`a[i]: T`, traps; `l.get(i):
   T | null` safe; §VL.6), which **demotes** the old perf prerequisites to
   optimizations and **adds one new analysis**:
   - **Bounds-narrowing — now optional.** Because the trapping `a[i]` is already a
     bare `array.get` on the happy path, narrowing only elides the redundant
     compare-and-trap; a miss costs a check, not a per-access null-unwrap. Still
     worth doing (touches the core narrowing engine, A5, `docs/narrowing.md`), no
     longer load-bearing.
   - **Native-indexing flag — unchanged.** A pure-VL `List` whose `l[i]` routes
     through the B13 `"[]"` method is a per-access indirect call; resolve with a
     type-level flag that lowers `"[]"`/`"[]="`/`.length` to native `array`
     ops on `backing` (precedent: `string`/`i32` nominal special-casing). Sub-choice:
     **nominal recognition** (codegen knows `List` by name, simplest) vs a
     **declarative native-lowered/intrinsic annotation** (any std type can opt in).
   - **Backing-pointer hoisting (LICM) — unchanged.** For a genuinely growable
     `List`, `l[i]` is `struct.get backing` then `array.get` — two loads; hoist the
     loop-invariant `backing` load out of the loop (binaryen's LICM over a GC
     `struct.get` is not guaranteed). With native flag + hoist + narrowing, an
     in-range `l[i]` in a loop is codegen-identical to a raw `array.get`.
   - **NEW — representation inference (§VL.7).** The headline addition this round:
     infer fixed-array vs growable-`List` from whether growth operations are ever
     applied, and lower never-grown values to a header-less fixed array (which has
     *no* `backing` to load and *no* dispatch to bypass — so for those values the
     three knobs above are moot). The analysis is **interprocedural** (growth via a
     callee or alias propagates back to the literal) and **alias-unioned** (all
     aliases share a representation — the cost item, and the part value-semantics
     would erase, §OQ.2). It is a **safe optimization**: unproven ⇒ growable `List`,
     so it is never wrong and can land after the core (or be shipped conservatively).
     Co-design with **variance (A9)**: "read-only param accepts either representation,
     growing param requires the growable one" is a readable/writable variance
     statement. This is the one spot `List` needs compiler privilege even under
     "std over primitives" — and the new analysis is the bulk of the remaining work.
5. **Growth taper.** 2× is **decided** for v1 (above). Whether to later add a
   Go-style taper to ~1.25× past a size threshold stays deferred — a
   constant-factor tweak behind the same API, not a representation change.
6. **`map`/`filter` result type.** Should producers return a `List<U>` (proposed)
   or a raw array? Returning a `List` keeps the chain growable and composable.
7. **Raw fixed array as a *low-level* escape — now largely subsumed by §VL.7.** The
   raw fixed array is the substrate from day one *and* the inferred representation
   (§VL.7) for never-grown values — so the common reason to reach for a fixed array
   (no header, no indirection, raw `array.get`) is now delivered automatically under
   the ordinary `[...]`/`T[]` surface. What *remains* an open question is only the
   genuinely **low-level memory-addressing escape** — an advanced unsafe primitive
   for **FFI / SIMD / linear-memory** targets if VL ever addresses memory directly —
   a deliberately advanced/future surface, not v1. **Name-clash warning:** this
   low-level escape is sometimes sketched as `Array<T>`, but §VL.7 also provisionally
   uses `Array<T>` for the *safe* fixed representation; both names are uncommitted and
   if both surfaces are ever pursued the clash must be resolved. (The old
   "constant/read-only-literal optimization" is no longer a separate item: a
   compile-time `[1,2,3]` is just one case the §VL.7 growth analysis proves fixed,
   and it is lowered as such — still a `T[]` value to the program.)

---

## Language vs standard library, primitive surface, and syntax

The sections above settle the *representation* of the collection (the `{backing, len,
cap}` struct, 2× growth, monomorphized-not-boxed elements) and the *syntax*
(`[...]` literal, type `T[]`). This section answers a deeper set of questions the
owner raised: **where** the collection should live (baked into the language vs.
written in VL over a small intrinsic surface), **what primitive** the compiler would
have to expose for it to be written in VL at all, and whether `print` belongs in the
same bucket. LS.4 records the now-**decided** `[...]`/`T[]` syntax call and the
reasoning behind it. (Per the naming caveat, `List` below is the uncommitted name for
the std collection/representation.)
These are forward-looking; the lang-vs-std / primitive-surface choices are not yet
in `DECISIONS.md` (they land with implementation).

The throughline is VL's **self-hosting goal** (ROADMAP Track H — H2 "make VL
expressive enough to write a compiler", H3 "port the compiler to VL"). Every
collection type or builtin that lives *inside the compiler as privileged machinery*
is something the VL-in-VL compiler must re-implement and re-harden from scratch.
The cheapest path to H3 keeps the **language core small** and pushes everything that
*can* be ordinary VL into ordinary VL — on top of a thin, well-defined intrinsic
floor.

### LS.1 — Language-built-in vs standard-library: the cross-language pattern

Where does the growable sequence live in mainstream languages — is it part of the
*language* (special syntax, magic compiler functions, privileged types) or part of
a *standard library* (an ordinary type written in the language over lower-level
primitives)?

| Language | Lives in | Built over | Compiler-privileged? |
|---|---|---|---|
| **Rust `Vec<T>`** | std library — the `alloc` crate | `RawVec<T, A>` → the `Allocator` trait (`Global`) | No. Ordinary generic struct; `vec!` is a macro, not a keyword |
| **C++ `std::vector`** | std library (`<vector>`) | `operator new[]` / an `Allocator` | No. A class template; the language knows nothing about it |
| **Java `ArrayList`** | std library (`java.util`) | `Object[]` + `System.arraycopy` | No. Plain class; type-erased generics force boxing |
| **Swift `Array`** | std library (`Swift` module) | a managed class buffer; the `Builtin` module | **Partly** — COW uniqueness (`isKnownUniquelyReferenced` → `Builtin.isUnique`) and buffer intrinsics are compiler-provided, but `Array` itself is `.swift` source |
| **Python `list`** | core runtime builtin | C `PyObject**` over `PyMem` (`Objects/listobject.c`) | **Yes** — a built-in type compiled into the interpreter |
| **Go slices** | **the language itself** | a compiler-known header + magic `make`/`append`/`copy` builtins | **Yes** — `[]T`, `make`, `append`, `copy` are spec-level language features, not a package |
| **JS arrays** | engine builtin | engine-internal backing stores (V8 elements kinds) | **Yes** — `Array` is provided by the runtime, `[...]` is syntax |

**The pattern: stdlib-over-primitives is dominant; Go is the outlier.** The
systems languages that *can* express their own collection (Rust, C++, Swift, and to
a large degree Java) write the growable sequence as an ordinary library type over a
small allocation/raw-buffer primitive — the compiler does not know it is special.
The ones that bake it into the language/runtime (Go, Python, JS) do so for reasons
VL does not share: Go deliberately froze its language tiny and *had no generics* for
a decade, so `make`/`append`/`copy` were the only way to offer a typed growable
sequence; Python and JS ship a single privileged dynamic type because the whole
runtime is the "standard library".

**Recommendation for VL: a `.vl` standard-library `List<T>` over a minimal
intrinsic surface — the Rust/C++/Swift model, not the Go model.** The decisive
argument is self-hosting. A Go-style compiler-privileged `List` (a magic header
type plus magic `push`/`grow` builtins hardcoded in `toWasm.ts`) is machinery the
VL-in-VL compiler (H3) must re-implement and re-harden. A `List<T>` written in
`.vl` is, by construction, just VL code the self-hosted compiler already compiles —
it ports *for free*. It also keeps `List` honest: if `List<T>` can be expressed in
ordinary VL, then VL is demonstrably expressive enough to write its own collections
(an explicit H2 capability bar), and any user can write `RingBuffer`, `Deque`, or
`SmallVec` the same way without compiler changes. The cost — VL `List` cannot reach
*below* what the intrinsic floor exposes — is exactly what §LS.2 sizes, and it turns
out to be a two-primitive floor.

(Note this does **not** contradict §VL.3's "monomorphize per element type". A `.vl`
generic `List<T>` is monomorphized by the *existing* A10 machinery exactly like any
other VL generic — "stdlib type" and "monomorphized" are orthogonal. The struct
layout of §VL.1 is then just the layout the VL source compiles to, not a privileged
compiler-internal type.)

### LS.2 — Primitive surface: can `List` be written in pure VL today?

Take the §VL.1 design — `struct { backing: T[]; len: i32; cap: i32 }` with
grow-by-allocate-a-bigger-array-and-copy — and check each thing it needs against
what VL exposes *today*:

| `List` needs | VL has it? |
|---|---|
| A struct with mutable fields holding `backing`/`len`/`cap` | ✅ objects with mutable fields |
| `backing[i]` read / `backing[i] = v` write on the slots | ✅ `a[i]` → `array.get`, `a[i] = v` → `array.set` |
| The slot count of `backing` | ✅ `.length` → `array.len` |
| Generic over `T`, one concrete layout per element type | ✅ A10 monomorphization + per-element interned array type |
| `self`-methods (`push`/`pop`/`map`/`filter`) and `[]`/`[]=` traps on the wrapper | ✅ B14 self-methods, B13 index traps |
| Copy a run of live elements from old backing into a new bigger backing (and for concat/extend/slice/`map`/`filter` fills) | ❌ **not as a bulk op** — expressible as a scalar VL `for` loop over `[0, len)`, but that is element-at-a-time; the bulk memcpy is not VL-reachable |
| **Allocate a `T[]` of a length known only at runtime** (`new_cap = cap * 2`) | ❌ **missing** |

Everything else is already there. Two primitives are missing — together they are
the **minimal intrinsic set** a pure-VL `List` stands on:

**(1) Dynamic-length array allocation.** Today a raw backing `T[]` can only be born
from a **compile-time-sized literal** (`array.new_fixed`, whose length is the operand
count — the mechanism a `[a, b, c]` `List` literal's backing lowers through). There
is no VL-surface way to say "allocate a `T[]` of runtime length `n`". `List` growth
fundamentally needs that — `cap * 2` is not a compile-time constant. WasmGC already
has the instruction (`array.new <T>` — allocate length `n`, every slot initialized to
a given value; and `array.new_default <T>` — length `n`, slots default/zeroed).

**(2) Bulk `array.copy`.** The grow path, `concat`, `extend`, `slice`, and the
`map`/`filter` backing fills all need to move a *run* of elements from one array to
another in one operation. WasmGC has the **`array.copy`** instruction for exactly
this (a bulk, engine-level move — the array equivalent of `memcpy`). Without it
reachable from VL, every such copy degrades to a **scalar element loop** (`for i in
[0, n) { dst[i] = src[i] }`), which loses the memcpy: a per-element `array.get` /
`array.set` with a re-checked bound each iteration instead of one bulk move. So
`array.copy` is a *core* primitive, not a nice-to-have — it is what keeps grow /
concat / slice / `map` / `filter` off the scalar path.

**The backend already uses both internally.** The compiler emits `array.new` +
`array.copy` for **string concat and slice** (`toWasm.ts`), so both capabilities
exist and are proven — they are simply not reachable from VL source. The fix is to
expose both as **low-level intrinsics in the same class as `__store_i32__` /
`__load_i32__`** — `defaultScope` entries the std `List` calls, lowered by name in
`toWasm.ts`, *not* new language keywords.

Proposed shapes (a sketch for the follow-up PR, not committed signatures):

```
// (1) allocate a backing array of `length` slots, each set to `fill`
__array_new__<T>(length: i32, fill: T): T[]          // → array.new
// (1) allocate `length` zero/default-initialized slots
__array_new_default__<T>(length: i32): T[]           // → array.new_default
// (2) bulk-copy `count` elements from src[srcAt..] into dst[dstAt..]
__array_copy__<T>(dst: T[], dstAt: i32, src: T[], srcAt: i32, count: i32): void  // → array.copy
```

`__array_new__` is the minimum allocator (it covers both: pass a zero/sentinel
`fill`); `__array_new_default__` is a cheap convenience mapping to the dedicated
default-init instruction. `__array_copy__` is the bulk mover. All are generic over
the element type and monomorphize through the existing per-element array interner —
i.e. they are the *runtime-length* / *bulk* siblings of the array literal, lowered to
the WasmGC instructions the backend already uses internally. With these two
primitives, the entire §VL.1–VL.7 `List` is writable as a `.vl` module: the struct,
the 2× grow (`__array_new_default__(cap * 2)` + `__array_copy__` + swap `backing`),
`push`/`pop`/`clear`, `concat`/`extend` (the two-/one-copy bulk combines of §VL.4),
the `[]`/`[]=` index hooks (`len`-bounded, **trap-on-OOB**) plus the safe
`get(i): T | null` accessor, `.length`/`.capacity`, `map`/`filter`.

**Secondary perf knobs that *might* later want intrinsics — but are not required for
v1:**
- **Eliding redundant bounds checks.** Every `backing[i]` inside `List` re-checks
  `i` against `array.len`, even though `push`/`pop` have already proven `i < cap`.
  Mature vector implementations use an *unchecked* index in their internal hot path
  (Rust's `get_unchecked`). VL could later expose an unchecked-index intrinsic for
  std internals — but binaryen may already hoist/fold many of these, so this is a
  profile-driven optimization, not a correctness or v1 need.
- **Zeroed vs. uninitialized backing.** `array.new_default` zeroes the spare
  `[len, cap)` slots; a list never reads them before writing, so the zeroing is
  pure overhead at grow time. WasmGC has no "uninitialized array" instruction (the
  GC requires every slot well-typed), so this knob does not exist at the Wasm level
  today — noted only to record that it is *not* available to chase.

**Conclusion: no compiler-intrinsic `List` is needed.** Expose the two-primitive
floor — dynamic-length array allocation + bulk `array.copy` — as thin intrinsics and
write `List` in VL. This is strictly smaller than baking a privileged `List` into the
compiler, and it directly advances H2/H3.

### LS.3 — `print` (and friends) under the same lens

`print` is instructive because it is the *only* general-purpose builtin VL has
today that is **not** a one-to-one host import. Its `defaultScope` entry accepts any
type, and `toWasm.ts` **dispatches on the argument's wasm/VL type** to a *per-type*
host sink that already exists as a plain intrinsic: `__print_i32__`, `__print_i64__`,
`__print_f32__`, `__print_f64__`, `__print_bool__`, and the string path
(`__print_string__` streaming char codes). So `print` is "a compiler builtin"
**only** because the *type-dispatch* lives in `toWasm.ts` — the actual sinks are
already the thin-intrinsic layer.

That means `print` fits the exact same "thin intrinsics + std VL" pattern as
`List`: the per-type `__print_*__` sinks stay intrinsics (they must — they are the
host boundary), and the *dispatcher* `print(value)` **could** be ordinary VL — a set
of overloaded/`self`-method `print` functions, one per printable type, each calling
its `__print_T__` sink, resolved by the normal type machinery instead of a hardcoded
`if (node.function === "print")` branch in codegen. The same applies to any future
`println`/`debug`/`assert`-style helper.

**Is it worth doing?** Tie it to self-hosting, and treat it as **low priority.**
Moving `print` to std VL removes one special-case from the codegen the H3 port must
reproduce, and it makes "how do I add a printable type" a library change rather than
a compiler change — both nice. But unlike `List`, `print` needs **no new
primitive** (the `__print_*__` sinks already exist), so there is no *blocking*
reason to do it now, and the current single dispatch branch is small. Recommended
posture: migrate `print` to a std VL dispatcher **opportunistically, as part of the
H3 port** (when the std module exists anyway), not as standalone work.

### LS.4 — Syntax: `[...]` is the collection literal, `T[]` the type (DECIDED)

VL inherited the **MVP convention that `[...]` was a *fixed-length* array literal**
(`array.new_fixed`, length = element count). This review **flips it**: `[...]` is the
**growable-collection literal** (type `T[]`). That matches what the *scripting*
languages VL aims its "scripting feel" at all do:

- **`[...]` is the growable list** in Python, JavaScript, Ruby, and Swift; the
  *fixed*-size array is the niche case with a distinct, heavier spelling: Rust
  `[T; N]`, Go `[N]T`, C `T[N]`, Swift's fixed buffers. In those languages the
  common, reach-for-it-by-default literal grows.
- The old VL MVP was the inverse — the ergonomic `[...]` was the *fixed* case. For a
  language whose pitch is "scripting feel with hidden types," the growable list is
  the *common* case, so the common case should get the ergonomic literal.

**The decision: `[...]` constructs the `T[]` collection** (the scripting-feel
default). The raw fixed array is **not** a coexisting `[...]` meaning — it is the
substrate and the *inferred* representation (§VL.6/§VL.7). VL goes one better than
the Rust/Go split: instead of making the programmer *choose* fixed vs growable, the
common literal is growable-by-default and the compiler *infers* the header-less fixed
representation where it can prove it (§VL.7) — so the "reach below to a fixed array"
choice is normally automatic, not a separate spelling.

What the decision entails (the implementation work, not a reopening):
- A compile-time `[1, 2, 3]` lowers to a backing built via `array.new_fixed`; when
  the §VL.7 analysis proves it never grows, the value *is* that fixed array (no
  header). The §LS.2 dynamic-alloc primitive backs the growth path.
- The empty `[]` literal needs its element type from context (annotation /
  unification) exactly like any other inference hole; the explicit empty-construction
  *spelling* is uncommitted (sketched as `List<T>()`).
- If/when a user-facing **forcing** annotation or **low-level escape** is exposed, it
  gets a distinct spelling — uncommitted, never `[...]`, never the default (§VL.7/§OQ.7).

(This supersedes the earlier "ship `List(...)` first, keep `[...]` fixed" posture:
the owner has decided to unify on the `T[]` collection with `[...]` as its literal
from the start. The *name* `List` remains uncommitted — see the naming caveat.)

### LS.5 — Recommendation summary

- **Lang vs std:** write **`List<T>` as a `.vl` standard-library module**, not a
  compiler-privileged type (the Rust/C++/Swift pattern; Go is the outlier). It
  ports for free under self-hosting and proves VL can express its own collections.
- **Primitive surface:** blocking a pure-VL `List` is a **two-primitive floor** —
  **dynamic-length array allocation** *and* **bulk `array.copy`**. Expose both as
  thin intrinsics (`__array_new__` / `__array_new_default__` and `__array_copy__`,
  same class as `__store_i32__`), lowering to the `array.new` / `array.new_default`
  / `array.copy` the backend already uses internally for string concat/slice. Bulk
  `array.copy` is core, not optional: without it grow/concat/slice/`map`/`filter`
  fall back to scalar element loops and lose the memcpy. No compiler-intrinsic
  `List` needed. Unchecked-index and uninitialized-backing are *possible later* perf
  knobs, not v1 needs.
- **`print`:** already thin-intrinsics underneath (`__print_T__` sinks); the
  *dispatcher* could become std VL too, but it needs no new primitive — migrate it
  **opportunistically during the H3 port**, low priority.
- **Syntax (DECIDED):** `[...]` is the **collection literal** and **`T[]`** the type
  (scripting-feel default — Python/JS/Ruby/Swift). The raw fixed array is the
  substrate + inferred representation (§VL.7), never the default `[...]`. The *names*
  `List`/`Array` and any forcing spelling are **uncommitted**.

### LS.6 — Updated sequencing note

This refines the §"Phased implementation outline" ordering with the
language/std/primitive lens. The first *new building block* is the primitive, not
the type:

1. **Expose the two-primitive intrinsic floor** (`__array_new__` /
   `__array_new_default__` *and* `__array_copy__`) — a small, self-contained
   addition to `defaultScope` (signatures) + `toWasm.ts` (lower to `array.new` /
   `array.new_default` / `array.copy`, reusing the existing per-element array
   interner). This is the floor everything else stands on, and it is independently
   testable.
2. **Write `List<T>` as a `.vl` std module** over that intrinsic (the §VL.1–VL.7
   design, now expressed in VL rather than baked into codegen). This is the H2
   capability demonstration. `List` is built and shipped *first* — `Map`/`Set`
   below ride on the same floor but are not gated on each other.
3. **Then `Map<K, V>` and `Set<T>` — the "usable for modding" milestone trio.**
   The modding/scripting milestone ships **`List` + `Map` + `Set`** together (a
   scripting language needs all three to be practical), even though `List` lands
   first in build order. Both `Map` (B6a) and `Set` go over the same intrinsic floor
   (their backing buckets are dynamic-length arrays too) — likewise `.vl` std
   modules. **Specify deterministic iteration order** for both: VL targets
   multiplayer/replay, where map/set iteration feeding into game state must be
   reproducible across runs and machines (insertion-order iteration, à la JS
   `Map`/`Set` and Python `dict`, rather than hash-order). Indexing follows the
   decided split: **`Map[k]: V | null`** (missing key is normal absence, not a
   trap), distinct from sequence `List[i]` which traps on OOB.

This re-frames the prior outline's "type & checker / WasmGC types / codegen" steps:
with `List` living in VL, most of that collapses into "compile an ordinary VL
generic," and the genuinely new compiler work shrinks to **step 1** plus the §VL.7
representation-inference pass (an optimization that can follow) — plus whatever
std-module *loading* mechanism step 2 needs (see open questions).

### LS.7 — Open questions (still open)

(Literal/type syntax is **no longer open** — `[...]` is the collection literal, `T[]`
the type, §LS.4. The *names* `List`/`Array` and forcing spellings remain uncommitted.)

1. **Migrate `print` to std VL?** Move the `print` type-dispatcher out of codegen
   into a std VL dispatcher over the existing `__print_T__` sinks — worth the churn,
   or leave it as the one codegen special-case until the H3 port?
2. **Std-library module layout — where does `.vl` std live, and how is it loaded?**
   Writing `List`/`Map` in `.vl` presupposes a place for std modules and a way for
   user programs to pull them in (an implicit prelude that is always in scope? an
   `import`/module system? a bundled-and-embedded std the compiler links
   automatically?). VL has **no module system today**; the std-`List` direction
   forces this question, and its answer also gates §LS.3's std-`print` and any
   future `.vl` std growth. This is the largest unresolved dependency behind the
   whole "std over intrinsics" recommendation.

## Sources

- Rust `Vec` — growth & no-shrink / `RawVec`:
  [std::vec::Vec docs](https://doc.rust-lang.org/std/vec/struct.Vec.html),
  [RawVec reserve PR #50739](https://github.com/rust-lang/rust/pull/50739),
  [growth-factor forum thread](https://users.rust-lang.org/t/growth-factor-of-rawvec-hence-vec/25629).
- C++ `std::vector` growth factors & the golden-ratio reuse argument:
  [Arthur O'Dwyer, "vector pessimization"](https://quuxplusone.github.io/blog/2022/08/26/vector-pessimization/),
  [libstdc++ 1.5× RFC thread](https://gcc.gnu.org/legacy-ml/libstdc++/2004-02/msg00006.html).
- Go slices — header & growth thresholds:
  [Go blog: Slices](https://go.dev/blog/slices-intro),
  [runtime/slice.go](https://go.dev/src/runtime/slice.go),
  [VictoriaMetrics: Go slice internals](https://victoriametrics.com/blog/go-slice/).
- Java `ArrayList` 1.5× growth & type-erasure boxing:
  [Dev.java: Type Erasure](https://dev.java/learn/generics/type-erasure/),
  [Stackify: generics & type erasure](https://stackify.com/jvm-generics-type-erasure/).
- Python `list` over-allocation:
  [CPython `Objects/listobject.c` (`list_resize`)](https://github.com/python/cpython/blob/main/Objects/listobject.c).
- Swift `Array` COW & growth:
  [swiftlang/swift `Array.swift`](https://github.com/swiftlang/swift/blob/main/stdlib/public/core/Array.swift),
  [Toni Suter: COW value types](https://tonisuter.com/blog/2020/01/understanding-copy-on-write-value-types-swift/).
- V8 elements kinds & backing-store growth:
  [V8 blog: Elements kinds](https://v8.dev/blog/elements-kinds).
- WasmGC arrays (fixed length, `array.copy`, no in-place resize) & GC-backed ports:
  [V8 blog: WasmGC porting](https://v8.dev/blog/wasm-gc-porting),
  [Chrome: WasmGC by default](https://developer.chrome.com/blog/wasmgc),
  [dart2wasm WasmArray discussion](https://github.com/dart-lang/sdk/issues/54961).

Lang-vs-std & primitive surface (§LS.1–LS.4):

- Rust `Vec` is a std-library type over `RawVec` + the `Allocator` trait (not a
  language builtin):
  [`alloc::vec`](https://doc.rust-lang.org/alloc/vec/),
  [`Vec` source](https://github.com/rust-lang/rust/blob/main/library/alloc/src/vec/mod.rs),
  [`RawVec`](https://stdrs.dev/nightly/x86_64-pc-windows-gnu/alloc/raw_vec/struct.RawVec.html).
- Go makes the growable sequence a **language** feature — `make`/`append`/`copy`
  are spec-level builtins, not a package:
  [Go `builtin` package](https://pkg.go.dev/builtin),
  [Go blog: Slices](https://go.dev/blog/slices-intro).
- Swift `Array` is `.swift` stdlib source but COW uniqueness/buffer ops are
  compiler-provided (`Builtin.isUnique`):
  [`swiftlang/swift` `Array.swift`](https://github.com/swiftlang/swift/blob/main/stdlib/public/core/Array.swift),
  [COW internals](https://blog.jacobstechtavern.com/p/copy-on-write-swift-internals).
- Python `list` is a core runtime builtin implemented in C:
  [CPython `Objects/listobject.c`](https://github.com/python/cpython/blob/main/Objects/listobject.c).
- WasmGC array construction instructions (`array.new` runtime-length + fill,
  `array.new_default` default-init, `array.new_fixed` compile-time operands):
  [WebAssembly/gc MVP](https://github.com/WebAssembly/gc/blob/main/proposals/gc/MVP.md).
