# Collections — surface types and representation independence

**Status: DRAFT, revision 2, 2026-09-25.** Written at the owner's request so that agents with
different perspectives could argue over it. Revision 1 recommended "E1". Five critics (a
language user, a type-system reader, a performance reader, a compiler implementer and the
external consumers) reviewed it. All five returned **agree with changes**. This revision
corrects what they refuted, records where they disagree, rewrites the recommendation as an
ordered build plan (**E1′**, §7), and ends with the questions only the owner can answer (§11).
Nothing in `compiler/` or `std/` changes with this document.

Every fact marked **(RUN)** was measured on `dist/vl` at `a277bf7b0`, with the probe programs
reproduced inline or named by path. A path under `critic-*/` is a critic's probe file in the
session scratchpad; §10 lists the ones that witness defects. Anything marked *judgement* is an
opinion and is open to argument. Sibling documents are `docs/guide/collections-design.md`
(the B6/C2 decision record), `docs/identity-design.md` §0 (A15),
`docs/internals/memory-gc-design.md` §2 (what WasmGC cannot do),
`docs/internals/list-kind-audit-2026-09.md` (what a list rep costs the emitter) and
`docs/internals/perf-landscape.md` §5 (the P-items).

---

## 1. The question

The owner, 2026-09-25, in substance:

> Should `V[]` and `{[K]: V}` be backed by different implementations at some point, where the
> consumer would not care about the implementation? We should not be bound by what exists
> today, even if it would need a large refactor.

Two earlier turns in the same discussion frame it:

1. `Map<K, V>` should perhaps be a different type from `{[K]: V}`. The index signature implies
   a generic get/set, while `Map` implies extra methods.
2. Then the reverse question: `T[]` implies array methods, so why should `{[K]: V}` not imply
   map methods?

The orchestrator's interim answer was that both shorthands name the concrete built-in
collection, that `Map<K, V>` is only a long spelling, and that interfaces are written as
constraint bounds (`<M: { get(K): V | null }>`). The owner's question goes one level down: if
the surface type is one thing, may the machine underneath be several?

This document separates three questions that the discussion ran together:

* **Surface.** Which names and methods does a program see?
* **Contract.** What may a consumer rely on (aliasing, order, identity, cost)?
* **Representation.** How many machine layouts may sit behind one surface type, and who picks
  among them: the compiler, the consumer, or the runtime?

The critics added a fourth, which revision 1 did not separate: **what is broken today on the
surface we already have.** §10 lists it. Several items are clause-1 defects, and they come first
in the build plan because no representation question matters while `Set` prints the wrong
values.

---

## 2. What exists today, measured

### 2.1 The layouts (RUN)

Built with `dist/vl build` and disassembled with `node_modules/.bin/wasm-dis`. The first probe
declares one list of each element kind:

```vl
type P = { x: i32 }
const a = [1, 2, 3]
const b: u8[] = [1, 2]
const c = [1.5]
const d = ["s"]
const e: P[] = [{ x: 1 }]
const f: (i32 | null)[] = [null]
```

| surface | heap type emitted |
| --- | --- |
| `i32[]` | `struct { mut (ref (array (mut i32))), mut i32 len, mut i32 cap }` |
| `u8[]` | the same header over `(array (mut i8))`, packed at one byte per element |
| `f64[]` | the same header over `(array (mut f64))` |
| `string[]` | the same header over `(array (mut (ref null $string)))` |
| `P[]` | the same header over `(array (mut (ref null $P)))` |
| `(i32 \| null)[]` | the same header over an array of `(ref null $box)`, where `$box = struct { i32 tag, anyref }` |
| `string` | `struct { (ref (array (mut i8))), i32, i32, mut i32 }`, UTF-8 bytes |

Every list literal, including a `const` that is never grown, is emitted as `struct.new` over
`array.new_fixed`. **The header-less fixed-array representation of `collections-design.md`
§VL.7 is not built**, and `ROADMAP.md` still lists it as remaining work (line ~2390). Under
`-O`, a `for x in xs` sum over an `i32[]` loads `backing` once before the loop and unrolls
by four, so the header indirection is paid once per loop and not once per element. The perf
critic went further: at `-O`, Heap2Local leaves **zero `struct.*` operations** in the list
kernels, and the header costs about 2% on V8. §7 step 6 draws the consequence for §VL.7.

Maps, from two probes: one uses both key types without a `.delete`, the other adds one
`m.delete(3)`.

| surface | module without `.delete` | module with a `.delete` anywhere |
| --- | --- | --- |
| `{[i32]: i32}` | 7-field struct `{ keys, vals, live, index, count, size, hashes }`. `index` holds `(key, entry)` pairs, `hashes` stays empty, and `live` is never grown or read | 9 fields: the 7 above plus `seqs: (array i64)` and an `i64` `next` |
| `{[string]: i32}` | the same 7 fields, with an entry-number `index` and cached `hashes` | 9 fields, as above |

Two facts in this table matter for the question:

* **The key type already selects a representation.** An i32-keyed map probes a `(key, entry)`
  pair index with Fibonacci placement, and a string-keyed map probes an entry-number index with
  cached FNV hashes (#3134, D2370). The pair layout was measured for string keys as well and
  lost, 440 → 542 ms on `bench/collections/map-string`, so the choice between the two was made
  by measurement and not by taste.
* **A whole-program fact already selects a representation.** `gMapDeletes` is a module-wide
  scan. A program that never deletes gets maps with no `live` array, no `seqs`, and no
  tombstone tests. This is option (B) below, already shipped in its simplest form: a
  representation chosen by whole-program analysis, invisible to the consumer, and correct
  because the fact holds for every map in the program.

Code size under `-O` **(RUN)**:

| program | bytes |
| --- | --- |
| one `{[i32]: i32}`, insert and read | 1,222 |
| one `{[string]: i32}` | 1,841 |
| both key types | 2,877 |
| one `{[i32]: i32}` in a module with a `.delete` | 1,973 (+61%) |
| both key types, with a `.delete` | 4,337 |
| one `i32[]` with a push | 258 |
| `i32[]`, `f64[]` and `string[]`, each pushed | 664 |

In bytes, a map representation costs 0.75–1.6 KB of helpers and a list element
representation about 200 B. §2.5 shows that the emitter pays far more than that.

### 2.2 Representations that already exist, by axis

| axis | variants today | chosen by |
| --- | --- | --- |
| list element storage | 7 element reps (`i32`, `u8` packed, `i64`, `f32`, `f64`, `string`, ref), each with a nullable twin: 14 `VKind` members | the element type |
| list header | one: `{backing, len, cap}` | fixed |
| map key probe | i32 pair index, string entry index | the key type |
| map tombstone machinery | present or absent | whole program (`gMapDeletes`) |
| set | the map layout, typed `{[K]: boolean}` (below) | fixed |
| linear memory | `std:buffer` `Buf`, `flat type` records | **a different type**, not a rep of `T[]` |

The linear-memory tier (`buffer-design.md`, `flat-records-design.md`) is deliberately a
separate type. `DECISIONS.md` rules "no second, self-managed object model — linear memory
stays ONE scoped tier", and `memory-gc-design.md` §5 gives the reason: a second object model
doubles the validation surface.

### 2.3 What a consumer can observe (RUN)

```vl
const a = [1, 2]
const b = a
b.push(3)
b[0] = 9
print(a.length)            // 3    — aliases share growth
print(a[0])                // 9    — and element writes
print([1, 2] == [1, 2])    // true — list == is structural
const m: {[string]: i32} = Map()
const n = m
n["x"] = 1
print(m["x"] ?? -1)        // 1    — maps alias the same way
```

```vl
m["b"] = 2; m["a"] = 1; m["c"] = 3
for k, v in m { print(k) }                                   // b a c: insertion order
for k in m { if k == "b" { m.delete("c"); m["d"] = 4 } }     // D2315: JS Map semantics
for k, v in m { … }                                          // b=2 a=1 d=4
const xs = [1, 2, 3]
for x in xs { if x == 1 { xs.push(4) } n = n + 1 }           // 4 trips: a list walk is live
```

| observable | today |
| --- | --- |
| aliasing | lists and maps are shared references. A write through one name, including growth, is seen through every other name |
| capture | closures capture the variable by reference (D2339). `let xs = [1]; const f = () => xs.length; xs = [1, 2, 3]; f()` prints 3 |
| map iteration order | insertion order, and it is observable |
| mutation during a walk | defined. A map walk has JS `Map` semantics (D2315). A list walk checks the length on every step |
| `==` on a list | structural |
| `==` on a map | **refused**: "a map has no defined value equality: its entries are insertion-ORDERED" |
| `===` | ruled (A15), **not built**. `a === b` is a parse error today |
| `.length` / `.size` on a map | **both** answer. C2.3 ruled `.size` dropped, and the refusal text above still says `m.size` |
| key types | `string` and `i32` only. `{[i64]: V}` and struct keys are refused with a "not supported yet" sentence (PL-018/PL-029 and A15 item 2) |
| `readonly` | lists only. `readonly {[K]: V}` is a parse error that points at lists |

### 2.4 How the two shorthands relate today (RUN)

The design record (`collections-design.md` C2) says `T[]` *is* `{[i32]: T}` read as an
interface. **The checker does not implement that relation in either direction.**

```vl
function total(m: {[i32]: i32}): i32 { … }
total([1, 2, 3])
// argument 1: expected {[i32]: i32}, got i32[]

const xs: {[i32]: i32} = [1, 2, 3]
// cannot assign i32[] to 'xs' of type {[i32]: i32}

function first(c) { c[0] }
first(m)
// parameter is indexed with an i32, which is ambiguous between an array and an i32-keyed map
```

The last line is the inference engine stating that the two types are distinct, and it refuses
to guess which one a hole means.

**The interface-by-bound route does not work for built-in methods today.**

```vl
function look<M: { get(i32): i32 | null }>(c: M, k: i32): i32 { c.get(k) ?? -1 }
look(m, 1)
// {[i32]: i32} does not satisfy `{get(i32):i32|null}`: no `get(): i32 | null` — the bound
// needs a field of that type or a `get(self: {[i32]: i32}, …)` function in scope
```

Bound satisfaction asks for a field or a UFCS function in scope (`constraints-design.md`
§7.1). The built-in `get`, `has`, `set` and `push` are neither: the compiler lowers them
directly. A user-written `function at(self: {[i32]: i32}, k: i32)` does satisfy the same bound
(RUN, prints 7). A second `at(self: i32[], …)` in the same scope is `redeclared` (B16, one
binding per name), so **a user cannot write one bound that both a list and a map satisfy**.
`std:array`'s `includes`/`indexOf` are UFCS functions and would satisfy a bound. Built-in
methods and std methods are therefore two tiers that bounds treat differently. Moving the
built-ins into `std` as UFCS functions does not unify them: under B16 the UFCS witness
collapses to whichever `at` is in scope, so a list and a map still cannot both witness one
bound (`critic-types/p15.vl`, `p17.vl`). §7 step 4 takes the other route.

**`Set` is the map spelled `{[K]: boolean}`.** `const s: {[string]: boolean} = Set()`,
`s.add("a")`, `s["b"] = true` and `for x in s` all run (RUN). C2.2's own `Set<T>` type, the
one that avoids leaking map methods, is unbuilt (A15 item 3), and `Set<T>` is not an
annotation name. The critics found the shared spelling is worse than a leak: a `Set()` value
and a `Map()` value print as the same type and accept different methods, and a set's
`.values()` is wrong once the set is passed as a parameter (§10, F1–F2).

**There is no `in` operator.** `"a" in m` is a parse error. Presence is tested with `m.has(k)`
(which returns `true` for a stored `0`), and absence with `m[k] ?? d`, `m.get(k)` or
`xs.get(i)`. List value membership is `std:array`'s `xs.includes(v)`, and the checker
already maps `contains` to `includes` as a spelling suggestion.

### 2.5 What a representation costs, measured in this repo

The byte counts in §2.1 are small. The real price of a representation is in the emitter, and
this repo has measured it:

* **`u8[]` is one extra element representation, and 28 inventory rows carry `u8[]` in their
  title** (65 mention it at all, out of 1,148 rows). The list-kind audit gives the mechanism:
  the representation question is answered by **154 functions in 8 files**, 44 of which name
  between 4 and 13 of the 14 list kinds. A `-` in that table is a kind silently skipped, and
  that is where the `u8` and `f32` rows came from.
* The emitter answers "what representation is this value?" in **519 places**
  (`rep-descriptor-campaign.md` §1). Its phase 3 (one producer per question) is the refactor
  that would make a new representation cheap. It is not done.
* **Maps have a bug family too.** Revision 1 said map variation "lives in helpers" and "only
  the kinds turned into a bug family". The implementer critic refuted that: the map has one
  `VKind`, but its layout already varies by **value** type, and the map-value ladder (`mv`) has
  **109 uses in 43 functions**. **129 inventory rows** concern maps. Map variation is not
  confined to the six `__map_*__` helpers either: the index reads and writes of `set` and
  `delete` are emitted inline, at the **8 `pushMapIndex` call sites** in `compiler/wasmEmit.vl`.

The corrected contrast is not "kinds against helpers". **A variation that changes a heap type
produces a bug family, wherever it is decided.** List element kinds change the backing
array's type. Map value types change the `vals` array's type. Both have a family. A variation
that changes only *state* inside one fixed heap type (whether `index` is allocated, how it is
probed) has produced none so far: the i32/string probe split (#3134) and `gMapDeletes` did not
add a row family. That is the claim B-dynamic rests on, and §3.2 restates B-dynamic to match it.

### 2.6 What consumers asked for

* **plumb PL-037** (VL against Rust, `~/plumb/docs/vl-issues.md`). Revision 1 quoted the
  2026-09-24 table (array 2.02×, map 2.90× then 1.06–1.28×). **Those numbers are stale.** The
  standing scoreboard `bench/vs-rust/baseline.json` (commit `acf11e7a5`, 2026-09-25) reads
  **array 1.46× and map 1.13×**. Revision 1 attributed the array gap to the engine bounds check
  on `array.get`. The perf critic found **no VL-side guard left** in the `-O` kernel, so the
  remaining 1.46× is **unattributed**, not a known lever. plumb reports that "hot paths have
  dropped maps for arrays wherever keys are dense". The consumer critic counted **19 hand
  tables** in plumb, keyed by one **shared, sparse COM id space**, with deletes written as a
  store of `null`.
* **plumb PL-018 and PL-029**: i64-keyed maps, filed twice, with 3 workaround sites.
* **glean VL-033**: `Map<K, V>` as a struct field type. Today it is refused, and the refusal
  cascades into unrelated `array index must be i32, got string` errors (§10, F6). The consumer
  critic rates this P0.
* **plumb PL-003/PL-039**: separate compilation onto a shared linear memory. §3.2 corrects what
  revision 1 said about it.
* **veldt** (`/mnt/d/projects/veldt/docs/vl-notes.md`): sub-byte widths in `flat` records (ask
  #3, a linear-memory layout ask, already ruled as `flat` Phase 2), and `i8`/`i16`/`u16` element
  types for GC lists.
* **glean VL-010**: no bulk copy between `u8[]` and linear memory (WasmGC ceiling #10,
  `memory-gc-design.md` §2).
* **Cross-tier naming.** `std:bytes` spells a little-endian read `i32le` and `std:buffer` spells
  it `loadI32`. plumb carries 5 hand-rolled `le32` copies.
* **Consumers write concrete types.** Across 44k lines of consumer code the consumer critic found
  1 generic function and 0 bounds; plumb and glean hold 175 map annotations and 164 `Map()`
  sites, and 39 sites spell a set `{[K]: boolean}`. `__array_new__` is still called directly
  (glean 36, plumb 7), so it must stay canonical under any representation.

---

## 3. The design space

Every option is judged on the same axes. **Code size** is monomorphization and runtime
helpers. **Dispatch** is `call_ref`/`call_indirect`, `br_on_cast` chains and type tests.
**Aliasing/identity** asks what a change of representation does to a shared value.
**WasmGC** asks what the target forbids. **Interop** covers linear memory for plumb and veldt.
**Predictability** of performance and **diagnostics** complete the list. The perf critic added
two axes, adopted here: **engine spread** (the same layout can cost 2% on V8 and 241% on
wasmtime, so one engine's number is not a verdict) and **inlining budget** (a mode branch in a
helper is inlined at every call site, and the measured inlining cliff is 3×).

One WasmGC fact decides more than any other: **heap types are static and there are no
interfaces.** A function parameter has one heap type. So if two layouts can reach the same
parameter, the compiler must do one of three things:

1. **Specialize.** Compile the function once per layout. This is monomorphization, and VL
   already does it per type.
2. **Unify.** Declare a common supertype and test for the layout at each use (`br_on_cast`).
3. **Indirect.** Store function references in the value (a vtable) and call them.

A fourth route avoids the problem: keep **one heap type** and vary the layout *inside it* at
run time. Call this **dynamic representation**. It is how CPython's compact dict, V8's
elements kinds and Swift's small strings work.

### 3.1 (A) Concrete: one representation per surface type (today's model, completed)

**Surface.** `T[]` is the growable list and `{[K]: V}` is the insertion-ordered hash map, both
with their full method sets. `Map<K, V>` and `Set<T>` become annotation-legal names (A15
item 3). `IdentityMap`/`IdentitySet` are further concrete types, as already ruled.

**Contract.** Everything in §2.3, plus stated complexity: amortized O(1) push, O(1) expected
map operations, O(1) `.length`.

**Freedom left to the compiler.** What the type already selects (element packing, the key
probe) and whole-program facts that are true of every value of the type (`gMapDeletes`).
The perf critic's point is that the first kind is under-used: `boolean[]` is stored as `i32`
today, four bytes per flag, and `(i32 | null)[]` boxes every element and runs about 6× slower
than `i32[]`. Those are representations the *type* can select with no cliff (§7, step 3).

**Costs.** Code size is minimal. There is no dispatch. Aliasing and identity are trivially
kept. There are no WasmGC issues. Interop goes through `Buf` and `flat`, and is explicit.
Performance is predictable and the diagnostics are today's.

**What it gives up.** The dense-int map, the tiny map and the plumb pattern are left to the
consumer to hand-roll.

### 3.2 (B) One surface type, several representations chosen automatically

This has two variants, and they behave very differently.

**(B-static) The compiler picks a heap type per value, by whole-program analysis.**

Candidate representations:

| representation | when | soundness condition |
| --- | --- | --- |
| header-less fixed array (§VL.7) | no alias of the value is ever grown | alias-unioned, interprocedural growth analysis |
| dense int-keyed map as an array | i32 keys in a small, known range | the keys are always in range, **and iteration order equals insertion order** |
| packed element list, e.g. `i32[]` stored as `u8` | every stored value fits | every store is provably in range; `==`, hashing and serialization agree across layouts |
| persistent/immutable form | the value is never written after construction | **no mutable alias exists anywhere.** `readonly` is not enough: it is a view (§2.3) |

The costs are larger than they look.

* **Every representation must be uniform across a join.** A list element, a struct field, a
  union arm, a map value, a captured cell (D2339) and an `if` arm are all places where values
  from different origins meet. So the analysis is per equivalence class of "can flow to the
  same place", and a single slow-path member forces the whole class to the general
  representation.
* **The dense-int map breaks insertion order** unless the analysis proves ascending insertion
  or no iteration.
* **Code size.** Every function that can receive two representations is either specialized or
  unified with casts. The mono grid and `plumb-shape-cost.py` would both move.
* **Separate compilation — corrected.** Revision 1 said a whole-program representation "cannot
  cross a compilation unit", and scored A and E1 as "the ABI is the type". The implementer
  critic refuted the premise: **VL has no GC-type ABI.** A program's heap types are emitted
  as one recursion group, and plumb's separate compilation (PL-003/PL-039) shares *linear*
  memory, not GC values. So separate compilation does not tell the options apart today. It
  would the day a GC ABI exists, and then `gMapDeletes` itself (7 fields in one unit, 9 in
  another) is the first break. That is a latent cost of what is already shipped, not of B.
* **Predictability.** A one-line change (a `push` in a callee, a `for k in m` in a debug print)
  can silently switch a whole equivalence class to the slow representation. *Judgement*: this is
  the biggest cost.
* **Validation surface.** Each representation in the table changes a heap type, so each is a
  new bug family (§2.5) unless the descriptor campaign lands first.

**(B-dynamic) One heap type per surface type, with state varying inside it at run time.**

The value keeps one outer header, so identity, aliasing and every function signature are
unchanged. **The rule, from the implementer critic: a mode may change the index and allocation
state, and must leave the entry arrays (`keys`, `vals`, and `live` where present) with the same
heap types.** Anything else is a heap-type variation with a bug family, and is forbidden in
B-dynamic by name.

* **Small map as linear scan.** Below a threshold (8–16 entries, to be measured), leave
  `index`/`hashes` unallocated and scan `keys` directly. One branch, on whether `index` is
  null. `identity-design.md` already plans the same layout for `IdentityMap`.
* **Dense int-keyed map — respecified.** Revision 1 specified a mode entered while keys are
  "dense and ascending" and left on the first out-of-pattern insert. The consumer critic showed
  that it **saves plumb nothing**: plumb's 19 tables are keyed by a sparse id space, and
  deletes are frequent. The respecified mode is **holey-ascending**, in the style of V8's
  HOLEY elements kinds. The map stays in the mode while each *new* key is above the current
  maximum. Holes and deletes are allowed. It exits on an insert below the maximum, or when
  density falls below a threshold. Iteration stays insertion-ordered by construction, because
  every insert was ascending. A hole needs a presence mark that is not a value (V may be
  `i32`), so the mode needs the `live` column or an equivalent. That column exists today only
  under `gMapDeletes`, so a holey mode either forces the 9-field layout on every program or is
  itself a heap-type variation, which the rule above forbids. **Whether this ships as a hidden mode at all is contested** (§7 step 2d,
  §11 Q4).
* **Packed small integers inside `T[]`.** Changes the backing array's type. Forbidden by the
  rule above. The type-selected alternative is §7 step 3.

**Where the variation is decided — corrected.** Revision 1 said B-dynamic "lives entirely in
the six `__map_*__` helpers". It does not yet: `set` and `delete` write the index inline at 8
`pushMapIndex` sites (§2.5). Moving those into the helpers is a prerequisite, and it is §7 step
2a.

**The costs of B-dynamic.** A branch per operation, often hoistable. Larger helpers, and a mode
branch in a helper is **inlined at every call site**, so the cost lands on the inlining budget
(perf critic: a measured 3× cliff) and on `plumb-shape-cost`'s fuel. A data-dependent mode is
also a **performance cliff the source does not show**, which is B-static's predictability cost
in a smaller form. No analysis, no ABI change.

**An alternative the implementer critic wants measured first.** A map read today goes map →
list wrapper → backing array, because `keys` and `vals` are list values with their own
headers. Holding raw arrays in the map struct removes one indirection on every operation, and
it may beat a small-map mode outright. It changes no surface and no contract.

### 3.3 (C) One surface; the consumer picks the representation with a hint or constructor

**Surface.** `Map.sorted()`, `Map.dense(0, 4096)`, `List.flat<u8>()`, `List.fixed(n)`, all
typed at the same `{[K]: V}` / `T[]`.

**The problem.** The hint picks a heap type, so it has the same flow problem as B-static,
now driven by the consumer. Either the hint becomes part of the *static* type, which makes it
option (D) under another name, or the compiler unifies with casts. There is no third way under
WasmGC.

**Contract honesty.** `Map.sorted()` changes the iteration order, which is observable. A sorted
map has the same *methods* and a different *contract*. *Judgement*: a hint must never change
what a program prints, so a sorted map is its own type, and hints are limited to
capacity-like, behaviour-free arguments (`Map(capacity: 1024)`, a future `reserve`).

**Where (C) is legitimate.** A hint that selects a B-dynamic mode's *starting* state, such as
pre-sizing, has no flow problem.

### 3.4 (D) An interface type plus several named concrete types (Rust/Java/C#)

**Surface.** `{[K]: V}` is a structural interface (C2's `Mapping`). `HashMap<K, V>`,
`SortedMap<K, V>`, `IdentityMap<K, V>`, `DenseMap<V>` and `Vec<T>` are concrete types that
satisfy it. A parameter typed at the interface accepts any of them.

**There are two ways to lower an interface-typed parameter, with opposite costs.**

* **D-mono.** Treat `{[K]: V}` in a parameter as an implicit bound and specialize per concrete
  type. Zero dispatch. It fails wherever a value of *interface* type must be stored (a
  `{[K]: V}[]` holding a hash map and a sorted map, a struct field, a map value). Those
  positions need an existential, and an existential needs D-dyn.
* **D-dyn.** An existential value is a reference to a common supertype, dispatched by a
  `br_on_cast` chain (closed world) or a vtable (open world). Either way, Heap2Local and
  inlining stop seeing through the call.

**Costs beyond dispatch.** Two-layer method resolution against B16's no-overloading rule
(C2.8). Variance becomes load-bearing. Diagnostics grow a class of errors. And the owner's
first question returns: if `{[K]: V}` is the interface, what does `Map()` construct?

**What D gets right.** Types whose *contracts* differ belong under different names. The type
critic adds the historical argument: Java retrofitted `SequencedMap` in JDK 21, 25 years after
`LinkedHashMap` had made encounter order observable without a type saying so. Put observable
behaviour in the type from the start.

### 3.5 (E) Hybrids

**(E1) Concrete surface + B-dynamic + contract-distinct named types.** Revision 1's
recommendation. §7 replaces it with **E1′**, which keeps E1's shape and changes its content:
it starts with the defects, adds type-selected representations, drops §VL.7, makes the dense
map a choice between a named type and a gated mode, and changes the route by which built-ins
satisfy bounds.

**(E2) Concrete surface + B-static everywhere.** Maximal in power and in cost; attractive
only after descriptor phase 3. **(E3) C2 as written** (interface `{[K]: V}`, concrete
`Map`/`List`/`Set`) is D with the shorthand as the interface, and needs D-dyn (§2.4).

### 3.6 Summary matrix

| | A | B-static | B-dynamic | C | D-mono | D-dyn | E1′ |
| --- | --- | --- | --- | --- | --- | --- | --- |
| consumer sees one type per collection | yes | yes | yes | yes | no | no | yes (plus contract types) |
| dispatch per operation | none | none, or casts at joins | one branch, inlined per site | casts at joins | none | `br_on_cast` / `call_ref` | none, or one branch if a mode ships |
| code size | minimal | × reps per parameter | helpers, inlined | × reps | × concretes | shared bodies plus vtables | helpers |
| needs whole-program analysis | no | **yes** | no | no | no | no (closed world helps) | no |
| separate compilation (no GC ABI today, §3.2) | not distinguishing | not distinguishing | not distinguishing | not distinguishing | not distinguishing | not distinguishing | not distinguishing |
| performance cliffs invisible in source | none | **yes** | yes, smaller (mode exit) | none | none | inlining loss | none, unless a hidden mode ships behind an observable |
| new heap-type variations | 0 | per rep | 0 by rule | per rep | per concrete | per concrete plus supertype | type-selected only (step 3) |
| dense-int map | by hand | if order is proven | holey mode | by hint | `DenseMap` | `DenseMap` | named type, or gated holey mode |

---

## 4. Invariants any option must keep

Each row is something a VL program can already observe (§2.3) or has been ruled. ✓ means the
option keeps the invariant for free. ✓* means it keeps it at the stated cost. ✗ means it cannot
keep it without restriction.

| invariant | A | B-static | B-dynamic | C | D | E1′ |
| --- | --- | --- | --- | --- | --- | --- |
| **Aliasing**: two names for one list or map see each other's writes and growth | ✓ | ✓* all aliases share one rep (union-find over flows) | ✓ one header | ✓* as B-static | ✓ | ✓ |
| **D2315**: a map walk during insert/delete has JS `Map` semantics | ✓ | ✓* each map rep re-implements the cursor rules | ✓* each mode obeys the same cursor; a mode switch mid-walk must preserve it | ✓* | ✓* per concrete | ✓* |
| **List walk is live** (length re-read per step) | ✓ | ✓ (a fixed array cannot grow) | ✓ | ✓ | ✓ | ✓ |
| **D2339**: capture by reference | ✓ | ✓* a captured cell is a join; its rep is the class's | ✓ | ✓* | ✓ | ✓ |
| **Insertion-ordered iteration** | ✓ | ✗ dense-array rep unless order is proven | ✓ dense mode only while order holds | ✗ for `sorted()`, so it must be a type | ✓ per contract type | ✓ |
| **`===` identity** (A15: a list's identity is its header's) | ✓ | ✓* rep fixed at allocation; a rep may never be *swapped* under a live reference | ✓ header is stable; inner arrays swap freely | ✓* | ✓ | ✓ |
| **`==` and hashing agree across reps** (D1017: one lowering) | ✓ | ✓* per rep pair; a packed list must hash like its wide twin | ✓ one type | ✓* | ✓* per concrete; cross-concrete `==` must be defined or refused | ✓ |
| **Determinism** (same program, same output on every host) | ✓ | ✓ provided the choice is a pure function of the program | ✓* thresholds are constants and never timing-based | ✓ | ✓ | ✓ |
| **No implicit widening** (owner 2026-09-23: a copy made behind your back breaks sharing) | ✓ | ✓* a rep conversion at a join IS such a copy, so it is forbidden and the rep must be chosen at allocation | ✓ | ✓* same | ✓ | ✓ |
| **`readonly` is a shallow view, not immutability** | ✓ | ✗ for the persistent rep: `readonly` does not license it | ✓ | ✓ | ✓ | ✓ |

Two rows decide most of the argument:

* **Identity plus no implicit widening together forbid converting a value's representation
  after allocation**, unless the outer reference stays the same. B-static and C must therefore
  pick the representation *at allocation* for the whole flow class. B-dynamic changes only
  what sits behind a stable header. That is the whole reason B-dynamic is cheap, and it is
  cheap only while the heap types behind the header stay fixed (§3.2's rule).
* **Insertion order is contract, not accident.** VL chose it (C2.4, D2315) and `==` on maps is
  refused *because of it* (§2.3). No automatic representation may reorder iteration. The
  consumer critic confirms consumers depend on it: webcraft's replays and plumb's reports.

---

## 5. The method-surface question, per option

**(i) Does `{[K]: V}` carry map methods?**

* A, B, C and E1′: **yes.** The shorthand *is* the map, and `get`/`has`/`set`/`delete`/
  `keys`/`values`/`length` are its methods, exactly as `T[]` carries `push`/`pop`/`slice`.
  This answers the owner's second question in the owner's direction. The C2 bug that
  motivated splitting them ("a value declared as something smaller than a map behaved as a
  full map") came from `Set` being spelled `{[T]: boolean}`, and the critics showed it is
  worse than a spelling problem: a `Set()` value and a `Map()` value print as the same type
  and accept different methods (§10, F1–F2). `Set<T>` as its own type removes it.
* D and E3: **no.** `{[K]: V}` carries only the read core, and the methods live on the
  concretes.

**(ii) `has` or `in`?**

Keep `m.has(k)`. It exists, and it can satisfy a bound once built-ins do. The language-user
critic tested what a newcomer types: `"a" in m` is a parse error today with no suggestion, while
`xs.contains(2)` already gets a spelling hint towards `includes`. The recommendation is to
**parse `in` only to refuse it**, with a sentence per receiver: on a map or set, "write
`m.has(k)`"; on a list, "`2 in xs` is index presence in JS and value membership in Python —
write `xs.includes(2)` or `2 < xs.length`". Python/Kotlin `in` on a list is membership and JS
`in` on an array is index presence, so two large populations of readers expect opposite
answers. *Judgement*: `in` as a working operator is not worth adding until `has` is shown to
be real friction.

The same critic asks for **redirects** on the other common misspellings: `.size`, `.count` and
`len(xs)` → `.length`; `Array<T>` and `Record<K, V>` → the VL spelling. And for **removing
`m.size`** (C2.3 already ruled it dropped; it still answers today, §2.3) rather than keeping a
silent alias.

**(iii) Should `T[]` stay a subtype of `{[i32]: T}`?**

Today it is not one, in either direction (§2.4, RUN). **Recommendation: keep them disjoint and
retire C2's `T[] = {[i32]: T}` sentence.** The type critic supplies the decisive argument,
which is about contracts rather than iteration: **the index contracts differ.** `xs[i]` out
of bounds traps and has type `T`; `m[k]` on a miss yields `V | null`; `xs[i] = v` out of bounds
traps, while `m[k] = v` inserts. A subtype that changes what indexing returns and what a write
does is not a subtype. The iteration rule (element-first for lists, key-first for maps, C2.4)
is a second, independent reason. `Set<T>` is related to neither.

**(iv) Key equality and variance (type critic).** Key equality and hashing are a function of
`K` alone, and there is no user-defined `==` on keys, ever: a map whose keys hash by a user
function is a different contract, and `IdentityMap` is the precedent for spelling that as a
type. A read-only view `readonly {[K]: V}` (a parse error today, §2.3) is the map analogue of
`readonly T[]`. Covariance of such a view holds only where the element representations
coincide, the same limit `readonly T[]` already has.

| | `{[K]: V}` methods | `T[]` vs `{[i32]: T}` | `has` / `in` |
| --- | --- | --- | --- |
| A | full map methods | disjoint | `has`; `in` refused with a sentence |
| B (either) | as A | disjoint | as A |
| C | as A, plus hint constructors | disjoint | as A |
| D | read core only; methods on `HashMap`/… | `Vec<T> <: {[i32]: T}` is natural here, and inherits both mismatches | `has` on the interface |
| E1′ | full map methods; bounds for "any mapping" | disjoint | as A |

---

## 6. Migration cost from today

Counts from the tree at `a277bf7b0` (`.vl` files; `scripts/` is dominated by the generated
census corpus, so its counts measure churn in regenerated cells, not hand edits):

| pattern | compiler (31 files) | std (17) | tests (3,630) | scripts (8,067) |
| --- | --- | --- | --- | --- |
| `Map()` | 324 in 15 | 1 | 1,552 in 515 | 3,935 in 2,158 |
| `{[string\|i32]: …}` type | 335 in 18 | 0 | 2,449 in 507 | 5,674 in 2,070 |
| `Set()` | 34 in 5 | 0 | 79 in 41 | 108 |
| `.has(` | 37 | 2 | 120 in 61 | 61 |
| `T[]` type spellings | 5,320 in 30 | 139 | 7,700 in 1,214 | 4,542 |

External consumers (§2.6): **under E1′ their churn is zero**, because every surface change is
additive and `{[K]: boolean}` stays legal as a map of booleans.

The compiler is itself the heaviest map consumer (324 `Map()` sites), so any map
representation change is priced by the self-compile. **It is its own map benchmark**, and
`plumb-shape-cost.py`'s fuel reading grades it without timing noise.

| option | surface churn | compiler work | risk |
| --- | --- | --- | --- |
| **A (complete)** | none; additive names | `Set<T>` as a type, annotation names, the §10 defects | low |
| **B-dynamic** | none | index ops moved into helpers first (8 inline sites), then the mode in the helpers and the walk cursor (D2315 fixtures re-graded) | low for the small-map scan; medium for a dense mode (needs a presence column and an observable) |
| **B-static, §VL.7 only** | none | interprocedural growth analysis; a new list rep, a heap-type variation across the 154-function ladder | high, for a measured payoff near zero (§7) |
| **B-static, full table** | none | the above per rep, plus order proofs and join-class analysis | very high |
| **C** | additive constructors | as B-static per hinted rep | high |
| **D / E3** | **every one** of the ~2,800 hand-written `{[K]: V}` and `Map()` sites must decide interface vs concrete | interface subtyping, two-layer method resolution against B16, existentials | very high; it reopens settled surface |
| **E1′** | none | §7's steps | low per step; each step is graded alone |

---

## 7. The recommendation: E1′, an ordered build plan

E1′ keeps E1's shape: **concrete surface types with full methods; a representation may differ
only in what a program cannot print; anything a program can print is a different type;
"any mapping" is a bound.** What changes is the content and the order. Each step is
independently shippable and is graded by the rule in step 7.

**Step 0 — fix the surface we have.** Before any representation work, because these are
wrong answers and refusals on programs people write now:

* **a. `Set<T>` as a real type.** Its own methods (`add`, `has`, `delete`, `length`,
  iteration over elements), no map methods, related to neither `T[]` nor `{[K]: V}`. Additive:
  `{[K]: boolean}` stays legal and means a map of booleans. This closes F1 and F2.
* **b. `Map<K, V>` and `Set<T>` as annotation names**, legal in every type position including a
  struct field (glean VL-033), and **without the cascade**: a refused annotation must not
  produce follow-on `array index must be i32` errors (F6).
* **c. The built-in method effect bug (F4).** A built-in mutating method (`delete`, `set`,
  `push`, `pop`) called on a free binding inside a top-level function counts as effect-free in
  `weScanFree`/`callFreeEffects` (`compiler/typecheck.vl`), so a narrowing survives a call that
  invalidates it. The fix is an effect column in a built-in method table, the same table as
  step 4.
* **d. Silent shadowing (F5).** A user `function get(self: {[i32]: i32}, …)` is silently
  ignored in favour of the built-in `get`. Make it an error (§11 Q6).
* **e. The miss-read wrong value (F3)**, and the redirects of §5(ii): `.size`/`.count`/`len`
  → `.length`, `Array<T>`/`Record` → the VL spelling, `in` refused per receiver, `m.size`
  removed.

**Step 1 — key representations: i64 keys.** `{[i64]: V}`. Filed twice by plumb (PL-018,
PL-029), 3 workaround sites. It is a new key probe selected by the key type, the same kind of
variation as the i32/string split of #3134, and it adds no `VKind`. It comes before any dense
mode because it is asked for, has no contract question, and has no cliff.

**Step 2 — map internals.** In this order, each measured before the next:

* **a. Move the index operations into the helpers.** The 8 inline `pushMapIndex` sites for
  `set` and `delete`. Byte-identical behaviour; the prerequisite for any mode.
* **b. Measure raw arrays for `keys`/`vals`.** Drop the list wrappers inside the map struct.
  If this closes most of the small-map gap, the small-map mode is not needed.
* **c. The small-map linear scan**, if 2b leaves a gap worth closing. Index state only, so it
  obeys the B-dynamic rule.
* **d. The dense int-keyed map. Critics disagree on the form:**
  * *Perf critic*: ship a **named, consumer-chosen type** first (a sparse id table). An array
    beats the map by 8–50× on dense ids. A hidden mode only with a V8 benchmark and an
    observable.
  * *Consumer critic*: a **hidden holey-ascending mode** (§3.2), because it gives existing
    `{[i32]: V}` code the win with zero churn.
  * **Recommendation: the named type first.** Three reasons. (1) plumb's 19 tables are
    already hand-written arrays, not maps, so a hidden mode on `{[i32]: V}` speeds up none of
    them; a named type replaces them, and a hidden mode would require plumb to convert them
    back to maps first. (2) A slot table can legitimately iterate in **key** order and keep
    holes, which is a different contract, and by E1′'s own rule a different contract is a
    different type. (3) It adds no branch to every map operation's inlined helper, and no cliff.
    The hidden mode stays possible later, behind the benchmark and an observable such as a
    `vl run --stats` mode-exit count (§11 Q3, Q4).

**Step 3 — type-selected packing, after `rep-descriptor-campaign.md` phase 3.** These change
a heap type, so they wait for the refactor that makes a heap-type variation one producer. The
type selects them, so there is no cliff and no analysis:

* `boolean[]` stored as `i8` (today `i32`, 4 bytes per flag);
* `i8`, `i16` and `u16` element types (veldt), beside today's `u8`;
* a niche for nullable scalar elements, so `(i32 | null)[]` stops boxing each element (about
  6× slower than `i32[]` today).

**Step 4 — bound machinery.** Built-ins satisfy bounds as **type-attached members** (the Go
model), not as `std` UFCS functions. Revision 1 recommended the UFCS route; the type critic
refuted it: under B16 one scope holds one `at`, and the UFCS witness collapses to whichever is
in scope, so a list-`at` and a map-`at` cannot both witness one bound (`critic-types/p15.vl`,
`p17.vl`). Prerequisites, from the implementer critic:

* one `builtinMethodTy` table, the single producer for `checkMemberCallNode` and `witnessOf`,
  carrying the effect column of step 0c;
* `{[K]: V}` over type parameters (`critic-impl/p3.vl`, `p9.vl`: "unknown type" today);
* monomorphizer arms for index signatures (F7: `tot<T>(m: {[i32]: T})` checks, then emit
  refuses);
* a hole-inference exemption for bounded type variables (`critic-impl/p10.vl`);
* built-in *properties* satisfying colon bounds, e.g. `<C: { length: i32 }>` (`critic-impl/p2.vl`).

Then **the iteration protocol (B8)**. "Any mapping" as a bound is not writable until a bound
can say "iterable", so B8 is part of this step and not a later nicety.

**Step 5 — the linear tier is the numeric and SIMD plane.** SIMD cannot reach GC arrays: there
is no vector load from a WasmGC array. Linear memory (`Buf`, `flat`, a future `Rows<T>`) is
therefore where vectorisable numeric code lives, and it gets the investment:

* **cross-tier naming**: one set of names for little-endian reads and writes across `std:bytes`
  and `std:buffer` (`i32le` against `loadI32` today; plumb has 5 hand-rolled `le32`). A std
  change, so it goes through `std-api-reviewer`;
* **a priced GC↔linear bulk copy** (glean VL-010), with its cost stated;
* **retire P13 by name** (`perf-landscape.md` §5: linear-memory backing store for scalar
  arrays). WasmGC has no finalizers, so a GC-owned list cannot free a memory block, and the
  Cranelift `array.get` lowering P13 worked around is an engine defect, not a VL layout
  question.

**Step 6 — remove §VL.7 (header-less fixed arrays) until measured.** Revision 1 called it "the
one B-static representation worth pursuing". The perf critic measured the payoff: at `-O`,
Heap2Local already leaves **zero `struct.*` operations** in the list kernels, and the header
costs about 2% on V8. A whole-program growth analysis and a new heap-type variation for 2% is
not worth building. `collections-design.md` §VL.7 and the ROADMAP row should say "deferred
until a benchmark shows the header", not "remaining work".

**Step 7 — the grading rule for any representation change.** Every step above that changes
generated code is graded on:

* **V8 and wasmtime both**, V8 as the primary target. The perf critic measured one layout at
  2% on V8 and 241% on wasmtime; a change graded on one engine is not graded;
* **`plumb-shape-cost.py`** (fuel and peak RSS), which prices helper growth and inlining
  without timing noise, and the self-compile, since the compiler is its own map benchmark;
* the D2370 randomized differential fixtures for anything in the map helpers, and the D2315
  walk-cursor fixtures for anything that touches iteration.

**What E1′ does not do.** No interface type. No B-static representation. No consumer hints
beyond capacity. No transparent linear backing. No `in` operator that answers.

---

## 8. Where the critics disagree

* **Rendered spelling.** The type critic wants hover and diagnostics to render `Map<K, V>`, so
  the concrete type reads as a named type. The language-user critic wants the shorthand
  everywhere, as Swift renders `[String: Int]`. Revision 2 recommends the shorthand for
  `{[K]: V}` and `T[]` (§11 Q7), and notes that `Set<T>` has no shorthand and renders as
  `Set<T>` either way.
* **The dense map.** Named type (perf) against hidden holey mode (consumer); §7 step 2d.
* **Reversing C2.** The type critic recommends reversing it outright. The consumer critic is
  indifferent: consumers write concrete types and never met the interface reading. No critic
  defends C2's interface sentence.
* **How much to gate on observability.** The language-user and perf critics want an
  observable (a mode-exit count, a user-facing cost page in `docs/guide`) before *any*
  automatic representation. The consumer critic would accept a hidden mode with no observable
  if it is benchmarked. This is §11 Q3.

---

## 9. Critique record

**Language user** (`critic-learn/`). *Agree with changes.* Set is broken today and must be
fixed first: a `Set()` and a `Map()` print as `{[string]: boolean}` and accept different
methods; `s.values()` returns the elements at the construction site but `true`s once the set is
passed as a parameter (`r1.vl`, re-run for this revision: prints `true`); and
`Set() + add + values()` passes check and fails at emit (`v2.vl`). Wants redirects for `.size`,
`.count`, `len`, `Array<T>`, `Record` and `in`, `m.size` removed, the shorthand rendered
everywhere, and a cost page plus an observable before any automatic representation. Found the
miss-read wrong value (`t1.vl`).

**Type system** (`critic-types/`). *Agree with changes; reverse C2.* Found a live clause-1 bug:
built-in mutating methods on a free binding inside a top-level function count as effect-free,
so narrowing survives the call (`p12.vl`, re-run: `wasm trap: cast failure`; also `p13`, `p7`,
`p18`). Showed the std-UFCS route cannot let a list and a map satisfy one bound under B16
(`p15`, `p17`), so built-ins must be type-attached members. Argued `T[]` cannot be a subtype of
`{[i32]: T}` because the index contracts differ, that key equality is a function of `K` alone,
and that observable behaviour belongs in the type from day one (Java's `SequencedMap`). Wants
`Map<K, V>` rendered in diagnostics.

**Performance** (`critic-perf/`). *Agree with changes; drop §VL.7.* Showed revision 1's PL-037
figures stale (now array 1.46×, map 1.13×, `bench/vs-rust/baseline.json`) and the bounds-check
lever gone, leaving the array gap unattributed. Measured that Heap2Local leaves zero `struct.*`
at `-O` (the header costs about 2% on V8), that a dense int table is 8–50× faster as an array,
that `(i32 | null)[]` is about 6× slower than `i32[]`, and that one layout can cost 2% on V8 and
241% on wasmtime. Wants type-selected packing, a named dense type before any hidden mode, the
linear tier as the SIMD plane, P13 retired, and every change graded on both engines plus
`plumb-shape-cost`.

**Compiler implementer** (`critic-impl/`). *Agree with changes; restrict B-dynamic.* Refuted
§2.5's "helpers against kinds": maps vary by value type (the `mv` ladder, 109 uses in 43
functions; 129 map rows), and the bug family follows heap-type variation, so a mode may change
only index and allocation state. Refuted "only helpers": 8 inline `pushMapIndex` sites. Refuted
the separate-compilation row: there is no GC ABI, and `gMapDeletes` is the latent break if one
comes. Listed the prerequisites for built-ins satisfying bounds (one `builtinMethodTy` table,
`{[K]: V}` over type parameters, mono arms, hole-inference, properties), found the silent
shadowing of a user `get` (`p7.vl`, re-run: prints the built-in's `7`, not the user's `42`),
and asked for raw-array keys/vals to be measured before a small-map mode.

**External consumers** (`critic-consumer/`). *Agree with changes; zero churn.* Consumers write
concrete types (1 generic, 0 bounds in 44k lines), so E1′ costs them nothing. Showed the
revision 1 dense mode saves plumb nothing (19 sparse, null-deleting tables) and respecified it
as holey-ascending. Put i64 keys (PL-018, PL-029) ahead of any dense mode, `Map<K, V>` as a
struct field at P0 (glean VL-033, `p1.vl`, re-run: refused, then two cascade errors), kept
`{[K]: boolean}` legal (39 sites), and asked for cross-tier naming (`i32le` against `loadI32`).
Insertion order is contract for webcraft's replays and plumb's reports, and `__array_new__`
must stay canonical (glean 36, plumb 7 call sites).

---

## 10. Defects found by the critics — to be filed

**None of these is filed yet.** Each gets an inventory row from `TEMPLATE.md` with the witness
below as its `Repro:`. "Re-run" means this revision re-ran the witness on `dist/vl` at
`a277bf7b0`; the others are as the critic reported them. Witness paths are in the session
scratchpad (`/tmp/claude-1000/-home-verit-vl/1bb408dd-ba41-473d-9afc-8693498295af/scratchpad/`)
and must be copied into the row, not linked.

| id | defect | clause | witness | status |
| --- | --- | --- | --- | --- |
| F1 | `.values()` of a `Set()` passed as a `{[string]: boolean}` parameter returns `true`s instead of the elements | 1, wrong value | `critic-learn/r1.vl` (prints `true`, want `a`) | re-run |
| F2 | `Set()` + `add` + `.values()` passes `vl check`, then emit refuses: `.keys() scratch frame not reserved` | 2, live emit site | `critic-learn/v2.vl`, `s1.vl` | re-run |
| F3 | `print(m["zz"])` and `print(m.get("zz"))` on a miss print `0`; `const v = m["zz"]; print(v)` prints `null` | 1, wrong value | `critic-learn/t1.vl` (prints `0`, `0`, `null`) | re-run |
| F4 | a built-in mutating method on a free binding inside a top-level function is effect-free to `weScanFree`/`callFreeEffects`, so a narrowing survives the call | 1, trap / wrong value | `critic-types/p12.vl` (`wasm trap: cast failure`); also `p13.vl`, `p7.vl`, `p18.vl` | p12 re-run |
| F5 | a user `function get(self: {[i32]: i32}, …)` is silently shadowed by the built-in `get` | 1, wrong function called | `critic-impl/p7.vl` (prints `7`, the user's `get` returns `42`); `p4.vl` | re-run |
| F6 | `Map<K, V>` as a struct field type is refused, and the refusal cascades into `array index must be i32, got string` at each use | diagnostic cascade (the refusal itself is step 0b's capability) | `critic-consumer/p1.vl` | re-run |
| F7 | a generic over an index signature, `tot<T>(m: {[i32]: T})`, passes `vl check`, then emit refuses: `monomorphize: unsupported argument type` | 2, live emit site | `critic-impl/p8.vl`; `p11.vl` | p8 re-run |
| F8 | `{[K]: V}` with `K` a type parameter is an unknown type | capability gap | `critic-impl/p3.vl`, `p9.vl` | as reported |

The bound gaps of step 4 (`critic-impl/p2.vl`, `p10.vl`) are capability gaps, not defects, and
belong on the ROADMAP rather than in the inventory.

---

## 11. Questions for the owner

Only questions that are the owner's to rule: language semantics, permanent names, and
contracts. Ordered by importance.

**Q1. Reverse C2: `{[K]: V}` is the concrete map, not an interface, and `T[]` is not a
subtype of `{[i32]: T}`.**
*Options*: (a) reverse C2's "the index signature is an interface" and "`T[]` is `{[i32]: T}`"
sentences; the shorthands name concrete types with full methods, and "any mapping" is a bound.
(b) Keep C2 and build interface subtyping (D/E3).
*Recommendation*: (a). The checker already treats the types as disjoint, the index contracts
differ (a list read traps where a map read yields `null`, a list write traps where a map write
inserts), and (b) re-decides ~2,800 hand-written sites.
*Critics*: the type critic recommends (a) and calls it the owner's call; the implementer and
perf critics' plans assume (a); the consumer critic is indifferent (zero churn either way, since
consumers write concrete types); no critic defends (b).

**Q2. `Set<T>` as a distinct type.**
*Options*: (a) `Set<T>` is its own type with set methods, related to neither `T[]` nor
`{[K]: V}`; `{[K]: boolean}` stays legal and means a map of booleans. (b) Keep `Set()` as a map
typed `{[K]: boolean}`. (c) Make `Set<T>` the only set spelling and migrate the 39 consumer sites.
*Recommendation*: (a), as step 0a. Today's (b) prints two different things as one type and
gives wrong values (F1).
*Critics*: language-user and type critics want (a) first; the consumer critic wants (a) and
not (c).

**Q3. Is cost part of the contract?** Proposed rule: *no data-dependent representation change
without an observable* — a mode whose exit depends on the data (density, an insert below the
maximum) ships only with a way to see it, such as a `vl run --stats` mode-exit count, and a
user-facing cost page in `docs/guide`.
*Options*: (a) adopt the rule. (b) Adopt it for B-static only and let B-dynamic modes ship
benchmarked but invisible. (c) No rule; cost is not contract.
*Recommendation*: (a). It is the only thing that keeps "the compiler infers it" from meaning
"the program got 8× slower for a reason nobody can see", and type-selected representations
(step 3) are unaffected by it.
*Critics*: language-user and perf critics hold (a); the consumer critic leans (b); the others
did not rule.

**Q4. The dense int-keyed map: a named type or a hidden mode?**
*Options*: (a) a named, consumer-chosen type (a sparse id or slot table), iterating in key
order. (b) A hidden holey-ascending mode inside `{[i32]: V}`. (c) Both, (a) first.
*Recommendation*: (a), with (b) left open behind Q3's rule. The name is permanent, so it
needs choosing (for example `IdTable<V>` or `SlotMap<V>`) and goes through `std-api-reviewer`.
*Critics*: perf critic (a); consumer critic (b).

**Q5. Built-ins satisfy bounds as type-attached members.**
*Options*: (a) the built-in collection methods are members of the type, and a bound
`<M: { get(K): V | null }>` is satisfied by them directly, as in Go; one `builtinMethodTy` table
is the producer. (b) Declare them in `std` as UFCS self-functions over intrinsics (revision 1).
*Recommendation*: (a). Under B16, (b) cannot let a list and a map satisfy the same bound (one
`at` per scope), which is the case bounds exist for.
*Critics*: type and implementer critics (a); revision 1 held (b); no critic defends it now.

**Q6. A user function that shadows a built-in method is an error.**
*Options*: (a) `function get(self: {[i32]: i32}, …)` is refused with a sentence, because the
built-in would win. (b) The user function wins over the built-in. (c) Today's silent behaviour.
*Recommendation*: (a). (b) makes a built-in's meaning depend on imports; (c) is F5.
*Critics*: implementer critic (a); none for (b) or (c).

**Q7. Which spelling do hover and diagnostics render?**
*Options*: (a) the shorthand `{[K]: V}` and `T[]`, as today and as Swift renders
`[String: Int]`. (b) `Map<K, V>` and `List<T>`/`T[]`. (c) Whichever spelling the declaration
used.
*Recommendation*: (a). It is what users write today, it costs no fixture churn, and once Q1 is ruled (a) the shorthand is unambiguously the concrete type.
`Set<T>` renders as `Set<T>` either way.
*Critics*: language-user critic (a); type critic (b).

**Q8. i64 keys.**
*Options*: (a) `{[i64]: V}` as a built-in key representation now, ahead of any dense mode.
(b) Wait for general struct or tuple keys (A15 item 2).
*Recommendation*: (a). Filed twice (PL-018, PL-029), a key probe with no new `VKind`, and it
does not decide struct keys. Ruling it also rules §5(iv) for i64: key equality and hashing
are a function of `K` alone, with no user `==`.
*Critics*: consumer critic (a); type critic's key-equality rule applies; none for (b).

**Q9. Remove `.size` and add redirects.**
*Options*: (a) remove `m.size` (C2.3 already ruled it dropped) and turn `.size`, `.count`,
`len(xs)`, `Array<T>` and `Record<K, V>` into refusals that name the VL spelling. (b) Keep
`.size` as an alias.
*Recommendation*: (a). Two names for one property is a permanent second spelling, and a
refusal that names the answer teaches it in one step.
*Critics*: language-user critic (a).

**Q10. `in` is parsed only to refuse.**
*Options*: (a) parse `a in b` and refuse it with a per-receiver sentence (`m.has(k)` for a map
or set, `xs.includes(v)` or `i < xs.length` for a list). (b) Make `in` work for maps and sets
and refuse it on lists. (c) Leave it a parse error.
*Recommendation*: (a). It costs one parser rule, teaches the right method, and keeps the
keyword free if (b) is ever wanted.
*Critics*: language-user critic (a); revision 1 leaned (c).

---

## Appendix — probe programs

Revision 1's probes were run with `dist/vl run` / `dist/vl build` at `a277bf7b0` under
`taskset -c 0-15 nice -n 5`, and are reproduced inline in §2. The critics' probes are the
`critic-*/` files named in §9 and §10.
