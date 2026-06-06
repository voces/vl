# VL collections design — `List`, VL's one user-facing collection (B6)

> Status: **design / research only.** No compiler code exists for this yet. This
> document is the mental model and the decision record for VL's primary
> collection — the growable `List` — so the follow-up implementation PR can be
> small and uncontested. It deliberately surveys how other languages do it, then
> commits to a concrete shape for VL's WasmGC backend with rationale and rejected
> alternatives.

## Summary / recommendation

**`List` is VL's one user-facing collection** — a growable, ordered, indexable
sequence, and the substrate for `map`/`filter`, builders, and the H2 self-hosting
collections work (`ROADMAP` A10 + B6). `[...]` constructs a `List`. The raw
fixed-length WasmGC `array` is **not** a coexisting everyday type: it is demoted to
(i) `List`'s internal **substrate** (the `backing` field, allocated/copied via the
`array.new`/`array.copy` intrinsics) and (ii) an **optional low-level escape** (an
advanced `Array<T>` / unsafe primitive) for the rare contiguous-memory case. The
fixed-array MVP is done; this design promotes it into `List` rather than leaving it
as the default literal.

**Decided this review round** (recorded here; the `DECISIONS.md` entry lands with
implementation, not before): the type is named **`List`**, **`[...]` is a `List`
literal** (the scripting-feel default — Python/JS/Ruby/Swift), the **growth
factor is 2×** for v1, and **indexing is result-by-default — `a[i]: T | null`**
(safe / OOB → `null`) for `List` (and any raw-array escape), with a trapping
*asserting* accessor as the discouraged opt-in. Still open: value-vs-reference
(language-wide), the error model (language-wide), indexing perf (the **three**
enablers of §VL.6 that together make a list loop instruction-identical to a
raw-array loop — **bounds-narrowing** (drops the `null` + check, §OQ.4), the
**native-indexing flag** (drops the B13 indirect call), and **backing-pointer
hoisting** (loads `backing` once per loop, not per access); missing the hoist
leaves the per-access `struct.get` cost), and the capacity/seed surface specifics.

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
4. **Surface API.** The **`[...]` literal constructs a `List`** (`[0, 1, 2]` seeds
   a three-element list — the scripting-feel default). `List<T>()` makes an empty
   typed list and `List<T>(capacity: n)` a pre-sized one (named-param, unambiguous
   vs a positional element — VL has no variadics or overloading, §VL.4, so the seed
   path is the literal, not a variadic `List(...)`). `push`/`pop`/`map`/`filter` are
   `self`-methods (parens — they compute, B14). `l[i]` / `l[i] = v` route through the
   B13 `"[]"`/`"[]="` index traps (assumed to land in parallel) — though a
   **type-level native-indexing flag** (§VL.6) lets `List`'s `[]`/`[]=`/`.length`
   lower straight to `array.get`/`array.set`/`array.len`, bypassing the dispatch.
   `.length` is the O(1) uniform-access property (read-only, per DECISIONS B6);
   `.capacity` is the sibling O(1) property. **Indexing is result-by-default**:
   `l[i]` returns **`T | null`** — out-of-bounds yields `null`, not a trap. A trapping
   *asserting* accessor (e.g. `a[i]!` / `getUnchecked(i): T`) is the explicit,
   discouraged opt-in for "I know it's in bounds." (§VL.4–6) **This changes
   today's fixed-array behavior** (`a[i]` currently traps on OOB → becomes
   `T | null`); the indexing rule is one rule across `List` and any raw-array escape.
   The cost — a null-handle on every access — is paid down by **bounds-narrowing**
   (§VL.6): inside `for i in 0 to a.length` or after `if i < a.length`, `a[i]`
   narrows from `T | null` to `T`. Combined with the native-indexing flag *and*
   **backing-pointer hoisting** (§VL.6: load `backing` once per loop, not per
   access), this reaches the ideal — `a[i]` lowers to a bare `array.get` of `T`,
   codegen identical to a raw array, while `List` stays a `.vl` std type otherwise.

**Language principle — "result by default."** Fallible operations return values,
not control-flow escapes: absence is `T | null`, "failed with a reason" is
`T | E` (a discriminated union narrowed with `is`) — leaning on VL's existing
union + `is`/`??`/`?.` narrowing rather than try/catch (VL has no catchable
throw). **Traps are reserved for unrecoverable bugs and are an explicit,
discouraged opt-in**, not the default for ordinary fallibility. This generalizes
the errors-as-values direction already noted for the language (§OQ.3); indexing
(`a[i]: T | null`), `pop(): T | null`, and the asserting/trapping accessors are
instances of it. The cost of result-by-default in hot code is mitigated by
**bounds-narrowing** (§VL.6) — proving an index in range erases the `null` arm at
compile time.

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

- **The raw fixed array (B6 MVP) — now `List`'s substrate, not a user-facing tier.**
  A raw VL array is a contiguous WasmGC `array` (one interned `(array mut T)` heap
  type **per element wasm type** — `arrayType()` in `toWasm.ts`): `array.get` /
  `array.set` / `array.len` (the last an intrinsic, *not* a stored field), length
  fixed at `array.new_fixed` time. This is exactly what `List` is built **over** —
  it becomes `List`'s `backing` substrate (§VL.1) plus an optional low-level escape
  (an advanced `Array<T>` primitive, §VL.6/§OQ.7), **not** the everyday collection.
  The MVP gives us the substrate for free. (`a[i]` traps on OOB **today**; under
  this design the user-facing `List` indexes result-by-default `T | null`, §VL.6.)
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
outside any loop still pay one extra (cache-hot) load — minor there. The
constant/read-only-literal optimization (§VL.6) avoids even the header for
compile-time-known literals.

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

The guiding decision: **`[...]` is a `List` literal.** `[a, b, c]` constructs a
three-element `List` — the scripting-feel default (Python/JS/Ruby/Swift). There is
no coexisting user-facing fixed-array literal; the raw fixed array is `List`'s
substrate and a low-level escape (§VL.6/§OQ.7), not a thing `[...]` ever means.

- **Construction.** `[0, 1, 2]` (seed via literal) is the everyday form. `List<T>()`
  makes an empty typed list and `List<T>(capacity: n)` a pre-sized one. `List` is a
  builtin generic shape resolved by the checker, lowered by name in `toWasm.ts` (the
  same pattern string methods use — types in defaultScope, lowering in toWasm, *no
  typecheck special-casing of a keyword*).

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
  literal** instead, which is exactly why the literal *is* the `List` literal. The
  construction surface is therefore: **`[...]`** (seed), **`List<T>()`** (empty),
  **`List<T>(capacity: n)`** (named).

  (Clarification: `self` is a **first-position positional convention**, *not* a
  call-site named argument. A function whose first parameter is named `self` is a
  method — `o.f()` rewrites to `f(o)` via UFCS (B14) — so the receiver must be
  *first* and positional; you never pass `self:` by name. Named-vs-positional and
  the `self` receiver are orthogonal mechanisms.)
- **Mutation methods** (compute → parens, B14 `self`-methods):
  `l.push(x)` (append, amortized O(1)), `l.pop()` (remove+return last, `T | null`
  on empty — see §VL.6), and the higher-order producers `l.map(f)` / `l.filter(f)`
  (these are the A10 "build a new array of an inferred element type" use case that
  was waiting on this subsystem). Each is a free `self`-first function
  monomorphized per receiver, reachable as `l.push(x)` via UFCS.
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
- **Indexing — result by default (`l[i]: T | null`).** `l[i]` and `l[i] = v`
  route through the **B13 `"[]"`/`"[]="` index hooks** (assumed landing in
  parallel) — or, under the **native-indexing flag** (§VL.6), lower directly to
  `array.get`/`array.set` on `backing`, bypassing B13 dispatch. Reads are
  **result-oriented**: `l[i]` checks `i` against `len` and yields the element as
  **`T | null`** — out-of-bounds is `null`, not a trap (§VL.6). The bound is
  **`len`, not the backing array's physical length** — the spare capacity slots
  `[len, cap)` read as `null` just like any other OOB index. The `"[]="` lowering
  bounds-checks the same way. The trapping form is the explicit *asserting*
  accessor (§VL.6), not `[i]`. Where the compiler can prove `i` in range,
  **bounds-narrowing** (§VL.6) drops the `null` and the check, recovering a bare
  `array.get`.
- **Size members** (O(1), property syntax, read-only — DECISIONS B6):
  - `l.length` → `struct.get $len` (O(1), the logical size; mirrors arrays'
    `.length` but reads the field instead of `array.len`).
  - `l.capacity` → `struct.get $cap` (O(1), the allocated slots; the sibling
    O(1) property DECISIONS B6 explicitly reserved property syntax for).

This ties into every existing feature (B13 index traps, B14 self-methods,
DECISIONS B6 uniform-access size members, A10 monomorphization) without adding a
new dispatch mechanism; `[...]` is now the `List` literal, so there is no
fixed-array literal to fight.

### VL.5 — Interaction with `length` and the index traps

- `length` keeps its DECISIONS-B6 contract: O(1), read-only, property syntax. For
  a `List` it lowers to `struct.get $len`; for the raw-array substrate/escape it
  lowers to `array.len`. Same surface, two native lowerings — the uniform-access
  principle the decision was made to preserve. A user can read `l.length` but not
  assign it; resizing is via `push`/`pop`, never `l.length = n`.
- Indexing sees `len`, not `cap`. `l[i]` for `i in [0, len)` returns the element;
  `i in [len, cap)` (spare capacity) and any other out-of-range `i` read as
  **`null`** even though the physical slot may exist — the spare slots are an
  allocation detail, not addressable state. This is the Go/Rust *bound* (you index
  `len`, capacity is invisible to `[]`); VL differs only in returning `null`
  rather than trapping on the OOB case.
- `length`/`count`/`capacity` stay distinct per DECISIONS B6: a dense list uses
  `length` (= live element count = `len`) and `capacity` (= `cap`). A future
  sparse collection would use `count`/`extent`; a list never overloads `length`
  to mean capacity.

### VL.6 — Bounds, iteration, and out-of-scope (v1)

- **Bounds behavior: `l[i]` is result-by-default (`T | null`).** Out-of-bounds
  `l[i]` / `l[i] = v` yields **`null`**, *not* a trap — and **the same rule
  applies to the raw-array escape** (one shared indexing rule; see the implication
  note below). This is the **"result by default"** language principle (Summary;
  §OQ.3) applied to indexing: absence is a value, not a control-flow abort. The
  trapping form is an **opt-in *asserting* accessor** for "I know it's in bounds" —
  named to signal it is unchecked/asserting (e.g. `getUnchecked(i): T` or an `a[i]!`
  postfix form), **not** plain `get` (which conventionally names the *safe*
  accessor, so reserving `get` for trapping would invert every reader's
  expectation). Trapping is the **explicit, discouraged escape hatch**; the safe
  `T | null` form is the default.

  **Implication — this changes today's raw-array behavior.** The raw array `a[i]`
  *currently traps* on OOB (the B6 MVP). Under result-by-default it becomes
  `T | null`, matching `List`. Arrays are early enough that changing this is cheap,
  and a single rule is the cohesive choice — the alternative (the `List` default
  null-by-default while the raw-array escape keeps trapping) would be a gratuitous
  inconsistency between two things that index identically.

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
  Combined with **bounds-narrowing** *and* **backing-pointer hoisting** (next
  bullet), this yields the ideal: a provably-in-range `a[i]` narrows to `T` (no
  `null`), the native flag makes it a bare `array.get` (no indirect call), and the
  hoist pulls the `backing` load out of the loop → **codegen identical to a raw
  array**, while `List` stays an ordinary `.vl` std type everywhere else. **All
  three are needed**: drop the hoist and the per-access `struct.get` (load
  `backing`) survives — see §VL.1.

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

- **Constant / read-only literal optimization.** A compile-time `[1, 2, 3]` (all
  elements known, never mutated) can emit a **constant backing** — a fixed-size
  `List` whose `backing` is a `const` array — skipping even the header allocation.
  This is an **optimization, not a separate user type**: the value is still a
  `List` to the program; the compiler just proves it constant and lowers it
  leaner. (See §OQ.7 / ROADMAP.)
- **Bounds-narrowing — the enabler that makes this practical (key).** The cost of
  `T | null` indexing is real: *every* access forces a null-handle, and for scalar
  elements `i32 | null` is a niche/tagged value, so each read pays a per-access
  unwrap — noisy in source and slower in hot loops. Left unaddressed, the *safe*
  default would be slower and noisier than trapping — a safety-vs-speed inversion.
  The fix is to **extend VL's existing flow-narrowing to array bounds**: when the
  compiler can prove the index is in range — inside `for i in 0 to a.length`, or
  in the then-branch of `if i < a.length`, or after an explicit bounds guard —
  **narrow `a[i]` from `T | null` to `T`**: no `null` arm, no unwrap, no tag, no
  trap, just a bare `array.get`. This is the same narrowing engine that already
  refines nullness and union members (A5, `docs/narrowing.md`), pointed at the
  index/length relation. With it, result-by-default indexing is **safe AND
  ergonomic AND native-speed in the common case** (the loop/guarded access), and
  the `T | null` only survives where the compiler genuinely can't prove the bound
  — exactly where a check is warranted. Bounds-narrowing is therefore the enabler
  that makes the result-by-default decision practical rather than a tax; it is the
  headline open work (§OQ.4) because it touches the **core narrowing engine**, not
  just `List`.
- **`pop()` on empty — recommend `pop(): T | null`.** A `pop(): T` has no `T` to
  return on empty, so it could only trap or hand back garbage (unsound); encoding
  absence in the type keeps it **total** and type-safe. This composes with
  machinery VL already has — `is`/`??`/`?.` null-narrowing — so the empty case is
  handled with zero new concepts. It is the typed-language consensus (Rust
  `Vec::pop -> Option<T>`, Swift `popLast() -> Element?`); only the dynamic
  languages throw (Python `IndexError`).

  **VL's failure model (clarification).** VL has **traps** — an uncatchable wasm
  abort, like Rust `panic!` (`a[i]` out-of-bounds already traps today) — but **no
  exceptions** (no catchable throw). So the real choice for empty `pop` is *trap*
  vs *total `T | null`*, never "throw." We take total `T | null`: empty-pop is an
  ordinary control-flow condition, not a program bug — the same **result by
  default** discipline as indexing. A future Swift-style trapping `removeLast()`
  for the "known non-empty" case is a natural addition (the same dual as the
  safe `a[i]: T | null` vs the asserting/trapping accessor for indexing) — not v1.
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
- The asserting/trapping accessor (`getUnchecked(i): T` / `a[i]!`) — the
  discouraged opt-in escape hatch; the safe `a[i]: T | null` is the v1 default.
- Slicing a list into a view that **aliases** the backing (Go-style shared
  backing); v1 `slice` (if any) copies.
- The **raw-array low-level escape** (an advanced `Array<T>` / unsafe primitive for
  header-less contiguous memory — §OQ.7). The raw fixed array exists as `List`'s
  substrate from day one, but exposing it as a *user-facing* low-level type is a
  future, deliberately-advanced surface, not v1.
- Value-semantics / copy-on-write (Swift-style). VL lists are **reference**
  values in v1; `let b = a` shares the same list — **consistent with VL objects,
  which are reference types today**. There is no sound case for collections being
  value types while objects stay reference (the "then why doesn't object
  assignment copy too?" point): value-vs-reference is a **language-wide** call
  (objects + collections together), not a `List` detail. Default for v1 =
  **reference**; Swift-style value-everywhere-with-COW is a coherent alternative
  *only if adopted uniformly* — see the language-level open question (§OQ.2).
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
   cap = element count, fill, `len=cap=n` (a compile-time-constant `[…]` may emit a
   `const` backing — the §VL.6 literal optimization). `l[i]`/`l[i]=v` → the
   `len`-bounded `array.get`/`array.set` lowering, via the B13 traps **or** the
   native-indexing flag (§VL.6) that bypasses them. `.length`/`.capacity` →
   `struct.get`.
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
   **OOB `[i]` → `null`** cases (and the **bounds-narrowed** in-range case lowering
   to a plain `array.get` with no `null`), `map`/`filter`, `for…in`, empty-`pop`
   nullable narrowing, plus `xfail-*` files pinning the out-of-scope gaps
   (insert/remove, shrink, the asserting/trapping accessor, COW) per the
   soundness-corpus convention.
8. **Docs.** Flip `ROADMAP` B6 to a one-line done marker; add a terse
   DECISIONS entry (`List` is the one user-facing collection + `[...]`=`List` +
   2× growth + monomorphized-not-boxed + grow-only + native-indexing flag, with the
   "WasmGC has no realloc/free so the golden-ratio argument doesn't apply"
   rationale). This design doc stays as the mental model.

## Open questions for the owner

1. **List literal syntax — DECIDED this review (no longer open).** `[...]` is the
   **`List` literal** (the scripting-feel default — Python/JS/Ruby/Swift). The raw
   fixed array is `List`'s substrate + an optional low-level escape (§OQ.7), not a
   coexisting `[...]` meaning, so there is no fork left to resolve. (Kept here as a
   numbered marker; the live questions are §OQ.2 onward.)
2. **Value vs reference — language-wide (default reference).** Not a
   collections-only question: there is no sound case for `List` being a value
   type while VL objects stay reference. v1 default = **reference everywhere**
   (objects *and* lists — consistent with VL today; matches Python/JS/Java).
   The coherent alternative is **value everywhere via copy-on-write** (Swift) —
   nice predictability (nothing mutated through an alias), cheap via COW — but
   only if applied **uniformly** to structs/objects *and* collections, decided
   once language-wide. Do not bolt COW onto `List` alone.
3. **Error model — language-wide (errors-as-values / "result by default").** The
   direction the owner favors, now adopted as the indexing default: fallible ops
   encode failure **in the return type** via unions — `T | null` for absence,
   `T | E` (discriminated with `is`) for "failed with a reason" — rather than
   try/catch, leaning on VL's existing union + `is`/null narrowing; **traps stay
   reserved for unrecoverable** programmer errors and are an explicit, discouraged
   opt-in (the Rust panic-vs-`Result` split). This ties to the `// TODO: exceptions`
   stub in the AST — the broader language-wide decision is *not* fully settled
   here, but **result-by-default indexing is decided this review** (see Summary /
   §VL.6). `a[i]: T | null`, `pop(): T | null`, and the asserting/trapping
   accessor (§OQ.4) are the instances of this model.
4. **Indexing — perf, via bounds-narrowing (the headline open work).** Result-by-
   default is **decided**: `a[i]: T | null` for arrays and lists, with an
   asserting/trapping accessor as the opt-in (§VL.6). The remaining open work is
   **perf**, and it now centers on **bounds-narrowing**: `T | null` per access
   means a null-handle on every read (and a tagged `i32 | null` for scalars), so
   to keep indexing native-speed the compiler must **extend flow-narrowing to
   array bounds** — when `i` is provably in range (`for i in 0 to a.length`, after
   `if i < a.length`, an explicit guard), narrow `a[i]` to `T` and emit a bare
   `array.get` with no null/unwrap/check. This is the enabler that makes safe-by-
   default indexing as fast as trapping; without it the safe default is *slower*
   than the unsafe one (a safety-vs-speed inversion). It touches the **core
   narrowing engine** (A5, `docs/narrowing.md`), not just `List`. The secondary
   dispatch question — a pure-VL `List` whose `l[i]` routes through the B13 `"[]"`
   method is a per-access indirect call — is **resolved by the type-level
   native-indexing flag** (§VL.6): `List`'s `"[]"`/`"[]="`/`.length` lower to native
   `array.get`/`array.set`/`array.len` on `backing`, bypassing dispatch (precedent:
   the `string`/`i32` nominal special-casing in codegen). The remaining sub-choice
   is **how to express the flag**: **nominal recognition** (codegen knows `List` by
   name, simplest) vs a **declarative native-lowered/intrinsic annotation** on the
   `"[]"` method (more general — any std type can opt in). A **third** enabler is
   needed for a *loop*: **backing-pointer hoisting (LICM)** — `l[i]` is still a
   `struct.get` (load `backing`) then an `array.get`, two loads per element, and in
   a tight loop that is ~1.5–2× over a raw array (§VL.1). `backing` is
   loop-invariant, so hoist its load out of the loop; binaryen's LICM over a GC
   `struct.get` is not guaranteed (it must prove no `push`/grow/reassign in the
   loop), so VL likely hoists it explicitly for the canonical `for`-over-index
   pattern. With all three — bounds-narrowing + native flag + hoist — an in-range
   `a[i]` in a loop is codegen-identical to a raw `array.get`; missing the hoist
   leaves the per-access `struct.get`. This is the one spot `List` needs compiler
   privilege even under "std over primitives."
5. **Growth taper.** 2× is **decided** for v1 (above). Whether to later add a
   Go-style taper to ~1.25× past a size threshold stays deferred — a
   constant-factor tweak behind the same API, not a representation change.
6. **`map`/`filter` result type.** Should producers return a `List<U>` (proposed)
   or a raw array? Returning a `List` keeps the chain growable and composable.
7. **Raw fixed array as a low-level escape — surface & timing.** The raw fixed
   array is `List`'s substrate from day one; the open question is whether/when to
   *also* expose it as a user-facing **low-level escape** — an advanced `Array<T>` /
   unsafe primitive for **header-less contiguous memory**, which matters for future
   **FFI / SIMD / linear-memory** targets if VL ever addresses memory directly.
   Plus the related **constant/read-only-literal optimization** (§VL.6): a
   compile-time `[1,2,3]` emitting a `const` backing is an optimization (still a
   `List` to the program), not a separate user type. Both are deliberately
   advanced/future surfaces, not v1 — but worth naming so the raw array's continued
   existence (beyond substrate) is on record.

---

## Language vs standard library, primitive surface, and syntax

The sections above settle the *representation* of the list (the `{backing, len,
cap}` struct, 2× growth, monomorphized-not-boxed elements) and the *syntax*
(`[...]` = `List`). This section answers a deeper set of questions the owner raised:
**where** `List` should live (baked into the language vs. written in VL over a small
intrinsic surface), **what primitive** the compiler would have to expose for `List`
to be written in VL at all, and whether `print` belongs in the same bucket. LS.4
records the now-**decided** `[...]`=`List` syntax call and the reasoning behind it.
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
primitives, the entire §VL.1–VL.6 `List` is writable as a `.vl` module: the struct,
the 2× grow (`__array_new_default__(cap * 2)` + `__array_copy__` + swap `backing`),
`push`/`pop`, `concat`/`extend` (the two-/one-copy bulk combines of §VL.4),
the `[]`/`[]=` index hooks (`len`-bounded, result-by-default `T | null`),
`.length`/`.capacity`, `map`/`filter`.

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

### LS.4 — Syntax: `[...]` is the `List` literal (DECIDED)

VL inherited the **MVP convention that `[...]` was a *fixed-length* array literal**
(`array.new_fixed`, length = element count). This review **flips it**: `[...]` is the
**`List` literal**. That matches what the *scripting* languages VL aims its
"scripting feel" at all do:

- **`[...]` is the growable list** in Python, JavaScript, Ruby, and Swift; the
  *fixed*-size array is the niche case with a distinct, heavier spelling: Rust
  `[T; N]`, Go `[N]T`, C `T[N]`, Swift's fixed buffers. In those languages the
  common, reach-for-it-by-default literal grows.
- The old VL MVP was the inverse — the ergonomic `[...]` was the *fixed* case. For a
  language whose pitch is "scripting feel with hidden types," the growable list is
  the *common* case, so the common case should get the ergonomic literal.

**The decision: `[...]` constructs a `List`** (the scripting-feel default). The raw
fixed array is **not** a coexisting `[...]` meaning — it is `List`'s substrate and an
optional low-level escape (§VL.6/§OQ.7). This is the right default-vs-opt-in split
for a high-level language: the everyday literal grows; reaching *below* `List` to a
header-less contiguous array is the deliberate, advanced choice (as `[T; N]` /
`[N]T` are in Rust/Go).

What the decision entails (the implementation work, not a reopening):
- A compile-time `[1, 2, 3]` lowers to a `List` whose backing is built via
  `array.new_fixed` (and, when provably constant/read-only, a `const` backing — the
  §VL.6 optimization). The §LS.2 dynamic-alloc primitive backs the growth path.
- The empty `[]` literal needs its element type from context (annotation /
  unification) exactly like any other inference hole — `List<T>()` is the explicit
  empty form when there is nothing to infer from.
- If/when a user-facing **low-level escape** is exposed, it gets a distinct,
  deliberately-heavier spelling (e.g. `[T; N]`-style or `Array<T>`) — not `[...]`
  (§OQ.7). It is never the default.

(This supersedes the earlier "ship `List(...)` first, keep `[...]` fixed" posture:
the owner has decided to unify on `List` with `[...]` as its literal from the start.)

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
- **Syntax (DECIDED):** `[...]` is the **`List` literal** (scripting-feel default —
  Python/JS/Ruby/Swift). The raw fixed array is `List`'s substrate + an optional
  low-level escape (a deliberately-heavier spelling), never the default `[...]`.

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
2. **Write `List<T>` as a `.vl` std module** over that intrinsic (the §VL.1–VL.6
   design, now expressed in VL rather than baked into codegen). This is the H2
   capability demonstration.
3. **Then `Map<K, V>`** (B6a) over the same intrinsic floor (its backing buckets
   are dynamic-length arrays too) — likewise a `.vl` std module.

This re-frames the prior outline's "type & checker / WasmGC types / codegen" steps:
with `List` living in VL, most of that collapses into "compile an ordinary VL
generic," and the genuinely new compiler work shrinks to **step 1** (plus whatever
std-module *loading* mechanism step 2 needs — see open questions).

### LS.7 — Open questions (still open)

(Literal syntax is **no longer open** — `[...]` is the `List` literal, §LS.4.)

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
