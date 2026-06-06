# VL collections design — the growable list (B6 tier-2)

> Status: **design / research only.** No compiler code exists for this yet. This
> document is the mental model and the decision record for VL's growable list /
> dynamic vector so the follow-up implementation PR can be small and uncontested.
> It deliberately surveys how other languages do it, then commits to a concrete
> shape for VL's WasmGC backend with rationale and rejected alternatives.

## Summary / recommendation

VL needs a growable, ordered, indexable sequence — the substrate for
`map`/`filter`, builders, and the H2 self-hosting collections work
(`ROADMAP` A10 + B6 tier-2). The fixed-length array MVP is done; this is the
tier-2 layer on top of WasmGC's fixed-length `array` heap type.

Recommendation in one screen:

1. **Representation.** A WasmGC `struct { backing: (ref (array mut T)); len: i32; cap: i32 }`
   — the same `{ptr, len, cap}` triple Rust, Go, and Swift's buffer use. `len` is
   the logical size the user sees; the backing array's own `array.len` is the
   capacity. We *still* carry an explicit `cap` field (see §VL.1) even though the
   backing array knows its own length, because reading `array.len` is cheap but
   the field makes the growth test branch-predictable and keeps `len`/`cap`
   adjacent and hot.
2. **Growth factor: 2×** (double on `len == cap`, minimum first allocation of 4).
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
4. **Surface API.** Construct with `List<T>()` (an empty list) and
   `List(a, b, c)` / a future list literal for seeded lists — kept *visually
   distinct* from the fixed `[a, b, c]` array literal so the MVP's fixed arrays
   stay fixed. `push`/`pop`/`map`/`filter` are `self`-methods (parens — they
   compute, B14). `l[i]` / `l[i] = v` route through the B13 `"[]"`/`"[]="` index
   traps (assumed to land in parallel). `.length` is the O(1) uniform-access
   property (read-only, per DECISIONS B6); `.capacity` is the sibling O(1)
   property. Out-of-bounds **traps** in v1 (matches the fixed-array MVP). (§VL.4–6)

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

- **Fixed arrays (B6 MVP).** A VL array is a contiguous WasmGC `array` (one
  interned `(array mut T)` heap type **per element wasm type** — `arrayType()` in
  `toWasm.ts`). `a[i]` → `array.get`, `a[i] = v` → `array.set`, `a.length` →
  `array.len` (an intrinsic, *not* a stored field). Bounds are trap-checked. The
  length is fixed at `array.new_fixed` time.
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
slot 0 of the backing array (a fat array). Rejected: it fights the existing
fixed-array representation (which has *no* header and lowers `.length` to
`array.len`), it complicates indexing (every `[i]` becomes `[i+1]`), and it can't
hold `cap` separately from the physical length. A distinct struct type keeps
fixed arrays and lists as cleanly different shapes.

### VL.2 — Growth strategy: 2×

**Decision.** Double on full, with a small floor:
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

The guiding constraint: **don't make the fixed-array MVP ambiguous.** `[a, b, c]`
must keep meaning a fixed-length array; a list is a distinct shape with its own
construction.

- **Construction.** `List<T>()` for an empty typed list; `List(a, b, c)` for a
  seeded list (element type inferred, monomorphized per call — the same inference
  that pins `T` in `first<T>(xs: T[])`); `List<T>(capacity: n)` (or a
  `reserve`) for pre-sizing. `List` is a builtin generic shape resolved by the
  checker, lowered by name in `toWasm.ts` (the same pattern string methods use —
  types in defaultScope, lowering in toWasm, *no typecheck special-casing of a
  keyword*). A dedicated **list literal** (e.g. a sigil-prefixed form) is left as
  an open question (§OQ) — `List(...)` covers v1 without inventing syntax that
  competes with `[...]`.
- **Mutation methods** (compute → parens, B14 `self`-methods):
  `l.push(x)` (append, amortized O(1)), `l.pop()` (remove+return last, `T | null`
  on empty — see §VL.6), and the higher-order producers `l.map(f)` / `l.filter(f)`
  (these are the A10 "build a new array of an inferred element type" use case that
  was waiting on this subsystem). Each is a free `self`-first function
  monomorphized per receiver, reachable as `l.push(x)` via UFCS.
- **Indexing.** `l[i]` and `l[i] = v` route through the **B13 `"[]"`/`"[]="`
  index traps** (assumed landing in parallel). The `"[]"` lowering is
  `bounds-check i against len, then array.get backing`; `"[]="` is
  `bounds-check, then array.set`. Crucially the bound is **`len`, not the backing
  array's physical length** — the spare capacity slots `[len, cap)` are not
  user-addressable.
- **Size members** (O(1), property syntax, read-only — DECISIONS B6):
  - `l.length` → `struct.get $len` (O(1), the logical size; mirrors arrays'
    `.length` but reads the field instead of `array.len`).
  - `l.capacity` → `struct.get $cap` (O(1), the allocated slots; the sibling
    O(1) property DECISIONS B6 explicitly reserved property syntax for).

This ties into every existing feature (B13 index traps, B14 self-methods,
DECISIONS B6 uniform-access size members, A10 monomorphization) without adding a
new dispatch mechanism or fighting the fixed-array literal.

### VL.5 — Interaction with `length` and the index traps

- `length` keeps its DECISIONS-B6 contract: O(1), read-only, property syntax. For
  a fixed array it lowers to `array.len`; for a list it lowers to
  `struct.get $len`. Same surface, two native lowerings — the uniform-access
  principle the decision was made to preserve. A user can read `l.length` but not
  assign it; resizing is via `push`/`pop`, never `l.length = n`.
- The index traps see `len`, not `cap`. `l[i]` for `i in [0, len)` is valid;
  `i in [len, cap)` (spare capacity) **traps as out-of-bounds** even though the
  physical slot exists — the spare slots are an allocation detail, not addressable
  state. This is the Go/Rust semantics (you index `len`, capacity is invisible to
  `[]`).
- `length`/`count`/`capacity` stay distinct per DECISIONS B6: a dense list uses
  `length` (= live element count = `len`) and `capacity` (= `cap`). A future
  sparse collection would use `count`/`extent`; a list never overloads `length`
  to mean capacity.

### VL.6 — Bounds, iteration, and out-of-scope (v1)

- **Bounds behavior: trap.** Out-of-bounds `l[i]` / `l[i] = v` **traps**, matching
  the fixed-array MVP (which already bounds-traps) and Rust's `[]`. A
  non-trapping `get(i) -> T | null` accessor (Rust's `.get()`) is a natural future
  addition but is **not** v1 — keeping one bounds discipline (trap) consistent
  with arrays for now.
- **`pop()` on empty.** Returns `T | null` (the nullable signals empty), narrowed
  by the existing null-guard flow narrowing. Alternative (trap on empty pop) is
  rejected: empty-pop is an ordinary control-flow condition, not a program bug, so
  a nullable is the soundness-friendly answer the union machinery already handles.
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
- Non-trapping `get`/`getOrNull`.
- Slicing a list into a view that **aliases** the backing (Go-style shared
  backing); v1 `slice` (if any) copies.
- A dedicated list **literal** syntax (use `List(...)` for now).
- Value-semantics / copy-on-write (Swift-style). VL lists are **reference**
  values in v1; `let b = a` shares the same list. (Whether VL eventually wants
  COW value semantics for collections is a language-direction question — §OQ.)
- Equality/hashing of lists (structural `==` over elements) — defer until the
  element-comparison story for the value-eq path is settled.
- `capacity`-aware bulk ops beyond `reserve` (e.g. `extend`/`concat` fast paths).

---

## Phased implementation outline (for the follow-up PR)

This is what a tier-2 PR would build, in dependency order. **No code is written
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
   backing + `len=0,cap=0` (or a shared sentinel empty array); `List(a,b,c)` →
   allocate backing of cap = n, fill, `len=cap=n`. `l[i]`/`l[i]=v` → the
   `len`-bounded `array.get`/`array.set` lowering through the B13 traps.
   `.length`/`.capacity` → `struct.get`.
4. **Codegen — push/pop/grow.** A lazily-emitted-per-element-wasm-type helper set
   (à la `__string_eq__`): `__list_push_T__` (the `len==cap` grow-and-copy + write
   + `len++`), `__list_pop_T__` (`len--`, read, `T|null` on empty),
   `reserve`/`grow` (`array.new` of new cap + `array.copy` + swap). Growth = 2×,
   floor 4.
5. **Iteration.** Extend B8 `for…in` to recognize the list shape and iterate
   `[0, len)` over `backing` (vs `array.len` for fixed arrays).
6. **Higher-order producers.** `map`/`filter` build a new `List<U>` of the
   inferred result element type — the A10 "build an array of an inferred element
   type" capability this subsystem unblocks.
7. **Tests.** A `tests/cases/collections/` corpus: construct/push/pop, growth
   (assert `length` vs `capacity` across the doubling boundary), index get/set,
   bounds-trap cases, `map`/`filter`, `for…in`, empty-`pop` nullable narrowing,
   plus `xfail-*` files pinning the out-of-scope gaps (insert/remove, shrink,
   non-trapping get, COW) per the soundness-corpus convention.
8. **Docs.** Flip `ROADMAP` B6 tier-2 to a one-line done marker; add a terse
   DECISIONS entry (2× growth + monomorphized-not-boxed + grow-only, with the
   "WasmGC has no realloc/free so the golden-ratio argument doesn't apply"
   rationale). This design doc stays as the mental model.

## Open questions for the owner

1. **List literal syntax.** Ship v1 with only `List(...)` / `List<T>()`, or
   introduce a distinct list literal now? (Must not collide with the fixed `[...]`
   array literal — options: a sigil prefix, or a method like `[...].toList()`.)
2. **Reference vs value semantics.** v1 proposes lists as **reference** values
   (`let b = a` aliases). Does VL want collections to eventually be Swift-style
   COW value types for consistency with structural `==` and value-feel? That's a
   language-wide direction call that affects more than lists.
3. **Empty-`pop` policy.** `T | null` (proposed) vs trap vs a separate
   `popOrNull`. The nullable is the soundness-friendly default but adds a narrow
   at every pop site.
4. **Bounds policy parity.** Keep trap-only (proposed, matches arrays) for v1, or
   ship a non-trapping `get(i) -> T | null` from the start?
5. **Growth taper.** Pure 2× for v1 (proposed), or adopt Go-style taper to ~1.25×
   past a size threshold immediately? (Proposed: defer; it's a constant-factor
   tweak behind the same API.)
6. **`map`/`filter` result type.** Should producers return a `List<U>` (proposed)
   or a fixed array? Returning a list keeps the chain growable and composable.

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
