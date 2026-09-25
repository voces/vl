# Collections — surface types and representation independence

**Status: DRAFT for argument, 2026-09-25.** Written at the owner's request so that agents
with different perspectives can argue over it. Nothing in `compiler/` or `std/` changes with
this document. Every fact marked **(RUN)** was measured on `dist/vl` at `a277bf7b0` (master
on the day), with the probe programs reproduced inline. Anything marked *judgement* is an
opinion and is open to argument. Sibling documents are `docs/guide/collections-design.md`
(the B6/C2 decision record), `docs/identity-design.md` §0 (A15),
`docs/internals/memory-gc-design.md` §2 (what WasmGC cannot do), and
`docs/internals/list-kind-audit-2026-09.md` (what a list rep costs the emitter).

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
by four, so the header indirection is paid once per loop and not once per element.

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
methods and std methods are therefore two tiers that bounds treat differently.

**`Set` is the map spelled `{[K]: boolean}`.** `const s: {[string]: boolean} = Set()`,
`s.add("a")`, `s["b"] = true` and `for x in s` all run (RUN). C2.2's own `Set<T>` type, the
one that avoids leaking map methods, is unbuilt (A15 item 3).

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
* 106 inventory titles name a map. The map has one `VKind` (`"map"`, 110 literal uses across
  10 compiler files), because its variation lives inside the runtime helpers (six
  `__map_*__` functions in `emit_bytes.vl`) and not in the type ladder. §3 builds on this
  contrast: **map variation lives in helpers and list variation lives in kinds, and only the
  kinds turned into a bug family.**

### 2.6 What consumers asked for

* **plumb PL-037** (VL against Rust, `~/plumb/docs/vl-issues.md`): the `array` kernel runs at
  2.02× Rust. Every access is a GC `array.get` with an engine bounds check, which LLVM elides
  for `Vec`. The `map` kernel was 2.90× and is 1.06–1.28× after #3134. plumb reports that
  "hot paths have dropped maps for arrays wherever keys are dense". A consumer performing the
  dense-int-map → array switch by hand is exactly what option (B) would automate.
* **plumb PL-003/PL-039**: separate compilation onto a shared linear memory. A representation
  chosen by whole-program analysis is in tension with separate compilation (§3.2).
* **veldt** (`/mnt/d/projects/veldt/docs/vl-notes.md`, ask #3): sub-byte widths in `flat`
  records, the `{ sdf: i8, mat: u8 }` voxel. That is a **linear-memory record-layout ask**, not
  a `T[]` representation ask, and it is already ruled as `flat` Phase 2.
* **glean VL-010**: no bulk copy between `u8[]` and linear memory. This is WasmGC ceiling #10
  (`memory-gc-design.md` §2): nothing copies a live GC array to or from memory.

---

## 3. The design space

Every option is judged on the same axes. **Code size** is monomorphization and runtime
helpers. **Dispatch** is `call_ref`/`call_indirect`, `br_on_cast` chains and type tests.
**Aliasing/identity** asks what a change of representation does to a shared value.
**WasmGC** asks what the target forbids. **Interop** covers linear memory for plumb and veldt.
**Separate compilation**, **predictability** of performance, and **diagnostics** complete the
list.

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

**Freedom left to the compiler.** Only what the type already selects (element packing, the key
probe) and whole-program facts that are true of every value of the type (`gMapDeletes`).

**Costs.** Code size is minimal: one helper set per (type, key representation). There is no
dispatch. Aliasing and identity are trivially kept, because one type has one layout. There are
no WasmGC issues. Interop goes through `Buf` and `flat`, and is explicit. Separate compilation
is easy, because the layout is a function of the type and so it is the ABI. Performance is
predictable and the diagnostics are today's.

**What it gives up.** The dense-int map, the tiny map, the never-grown list, and the plumb
pattern are all left to the consumer to hand-roll.

### 3.2 (B) One surface type, several representations chosen automatically

This has two variants, and they behave very differently.

**(B-static) The compiler picks a heap type per value, by whole-program analysis.**

Candidate representations:

| representation | when | soundness condition |
| --- | --- | --- |
| header-less fixed array (§VL.7) | no alias of the value is ever grown | alias-unioned, interprocedural growth analysis |
| dense int-keyed map as an array | i32 keys in a small, known range | the keys are always in range, **and iteration order equals insertion order** (see below) |
| packed element list, e.g. `i32[]` stored as `u8` | every stored value fits | every store is provably in range; `==`, hashing and serialization agree across layouts |
| persistent/immutable form | the value is never written after construction | **no mutable alias exists anywhere.** `readonly` is not enough: it is a view (§2.3), so writes can arrive through the owner's handle |

The costs are larger than they look.

* **Every representation must be uniform across a join.** A list element, a struct field, a
  union arm, a map value, a captured cell (D2339) and an `if` arm are all places where values
  from different origins meet. So the analysis is not per value but per equivalence class of
  "can flow to the same place", and a single slow-path member forces the whole class to the
  general representation. §VL.7 already names this ("aliases must agree on representation")
  and calls it the real cost.
* **The dense-int map breaks insertion order.** An array indexed by key iterates in key order.
  It is legal only when the analysis proves that keys are inserted in ascending order, or that
  the map is never iterated (no `for k in m`, no `keys()`, no `values()`). plumb's hand
  conversion is sound because plumb knows its iteration pattern. The compiler would have to
  prove it.
* **Code size.** Every function that can receive two representations is either specialized,
  so the instance count multiplies by the representations per parameter, or unified with casts.
  The mono grid (`scripts/mono-tyaram-grid.sh`) and the shape-cost ratchet
  (`plumb-shape-cost.py`) would both move.
* **Separate compilation.** A representation chosen by whole-program analysis cannot cross a
  compilation unit it cannot see. A boundary must fall back to a canonical representation, so
  the ABI is always the general form, with a conversion at each boundary or a proof that none
  is needed. plumb's PL-003 work would pay this cost.
* **Predictability.** A one-line change (a `push` in a callee, a `for k in m` in a debug print)
  can silently switch a whole equivalence class to the slow representation. Programs get
  performance cliffs that the source does not show. *Judgement*: this is the biggest cost, and
  it needs a diagnostic (`vl explain-rep`, or a hint when a class falls back) to be tolerable.
* **Validation surface.** §2.5's numbers apply directly. Each representation in the table is a
  new `VKind` family across the 154-function ladder, *unless* the descriptor campaign lands
  first. `u8[]` is the measured precedent: 28 titled rows.

**(B-dynamic) One heap type per surface type, with the layout varying inside it at run time.**

The value keeps one outer header, so identity, aliasing and every function signature are
unchanged. The header carries a mode, and the runtime helpers switch on it:

* **Small map as linear scan.** Below a threshold (8–16 entries, to be measured), leave
  `index`/`hashes` unallocated and scan `keys` directly. The switch is one branch on whether
  `index` is null. This changes no type, no `VKind` and no signature, and it lives entirely in
  the six `__map_*__` helpers. `identity-design.md` already plans the same "flat scan with the
  index unused" layout for `IdentityMap`.
* **Dense int-keyed map.** A mode in which `vals` is indexed by `key - base` while keys stay
  dense and ascending. On the first out-of-pattern insert, the map builds the pair index in
  place. Iteration order stays correct by construction, because the mode is only entered while
  insertion order equals key order.
* **List of small integers packed.** Possible in principle, but `array.get` on a packed array
  returns an i32, so the backing array's *type* differs. Varying it inside one header needs
  either an `anyref` backing plus casts, or two backing fields. *Judgement*: not worth it. The
  consumer has `u8[]` for that.

The costs of B-dynamic: a branch per operation, which is predictable and often hoistable when
the mode is loop-invariant (the same argument as the backing hoist in §2.1); larger helpers,
once per key representation and not per call site; and no analysis, no ABI change and no
effect on separate compilation. Its limit is that it cannot remove the header (the fixed
array) and cannot change element storage. Those are static-type questions.

### 3.3 (C) One surface; the consumer picks the representation with a hint or constructor

**Surface.** `Map.sorted()`, `Map.dense(0, 4096)`, `List.flat<u8>()`, `List.fixed(n)`, all
typed at the same `{[K]: V}` / `T[]`.

**The problem.** The hint picks a heap type, so it has the same flow problem as B-static,
now driven by the consumer. Two values with different hints that meet at a join (a list of
maps, a parameter called with both) need a common representation. Either the hint becomes
part of the *static* type, which makes it option (D) under another name, or the compiler
unifies with casts, which is dispatch. There is no third way under WasmGC.

**Contract honesty.** `Map.sorted()` changes the iteration order, which is observable (§2.3).
A sorted map therefore does not have "the same interface". It has the same *methods* and a
different *contract*. *Judgement*: a hint must never change what a program prints, so a sorted
map is its own type (D), and hints are limited to capacity-like, behaviour-free arguments
(`Map(capacity: 1024)`, a future `reserve`). Those arguments already fit (A) with no
representation change at all.

**Where (C) is legitimate.** A hint that selects a B-dynamic mode's *starting* state, such as
pre-sizing or starting dense, has no flow problem, because the heap type is unchanged. That is
a hybrid, covered in (E).

### 3.4 (D) An interface type plus several named concrete types (Rust/Java/C#)

**Surface.** `{[K]: V}` is a structural interface (C2's `Mapping`). `HashMap<K, V>`,
`SortedMap<K, V>`, `IdentityMap<K, V>`, `DenseMap<V>` and `Vec<T>`/`List<T>` are concrete
types that satisfy it. A parameter typed at the interface accepts any of them.

**There are two ways to lower an interface-typed parameter, with opposite costs.**

* **D-mono.** Treat `{[K]: V}` in a parameter as an implicit bound and specialize per concrete
  type. This is how bounds work today (§2.4, `constraints-design.md` §7.2: "the monomorphizer
  re-resolves each instance's member calls"). There is zero dispatch and code size multiplies
  by the concretes per parameter. It fails wherever a value of *interface* type must be
  stored: a `{[K]: V}[]` holding a hash map and a sorted map, a struct field, a map value.
  Those positions need an existential, and an existential needs D-dyn.
* **D-dyn.** An existential `{[K]: V}` value is a reference to a common supertype. Under a
  closed world (whole program, which VL is today) every operation can be a `br_on_cast` chain
  over the known concretes. Under an open world (separate compilation) it has to be a vtable
  of `call_ref`s. Either way, Heap2Local and inlining stop seeing through the call. That
  matters here because the escape-analysis direction of June 2026 ("emit uniform WasmGC, let
  binaryen scalarize") depends on inlining.

**Costs beyond dispatch.** The resolver has to pick between an interface-level and a
concrete-level method of the same name, and B16 has no overloading (C2.8 already flags this).
Variance becomes load-bearing: an interface parameter must be read-only, or a write through
it must be dispatched too. Diagnostics grow a class of errors ("`SortedMap` does not satisfy
`{[K]: V}` because …"). And the owner's first question returns: if `{[K]: V}` is the
interface, what does `Map()` construct, and what does a user write to get "a map"?

**What D gets right.** Types whose *contracts* differ (sorted order, identity keys, a
persistent map) belong under different names. `IdentityMap` is already ruled that way (A15
§0.6).

### 3.5 (E) Hybrids

**(E1) Concrete surface + B-dynamic + contract-distinct named types.** *This is the draft's
recommendation.*

* `T[]` is the list and `{[K]: V}` is the map, each concrete and each carrying its full method
  set (A). `Map<K, V>` and `Set<T>` are long spellings of the same types. They are not supertypes.
* **Within a type, the implementation may vary only in speed and footprint**, and preferably at
  run time behind one heap type (B-dynamic): small-map scan, dense mode, lazily built index,
  tombstone machinery gated by whole-program facts that hold for every value of the type.
* **Any difference a program can print is a different type** (D, for contracts only):
  `IdentityMap`/`IdentitySet` (ruled), and later `SortedMap` or a persistent map if a program
  needs one.
* **Header-less fixed arrays (§VL.7) are the one B-static representation worth pursuing**, and
  only after the descriptor campaign's phase 3. The payoff is large (no header load and no
  growth check), the soundness condition is growth-only, and D1686/D1687's covariance work has
  already paid for part of the handle-following.
* **Interfaces are bounds** (D-mono only): `<M: { get(K): V | null }>`. This needs one thing
  that does not exist yet: built-in collection methods must satisfy bounds (§2.4).
* **Linear memory stays a different type** (`Buf`, `flat`, a future `Rows<T>`), never a
  transparent backing for `T[]`. The reason is decisive and not a matter of taste: a
  linear-memory `T[]` would need a manual lifetime, and WasmGC has no finalizers (ceiling #8),
  so a GC-owned list cannot free its memory block.

**(E2) Concrete surface + B-static everywhere.** This is the "infer everything" reading of
VL's identity. It is maximal in power and maximal in cost, and (B-static) lists the costs.
*Judgement*: it becomes attractive only once the representation descriptor makes a new
representation a one-producer change. Before that, each representation re-runs the `u8[]`
bug history.

**(E3) C2 as written: interface `{[K]: V}`, concrete `Map`/`List`/`Set`.** This is D with the
shorthand as the interface. It needs D-dyn for stored interface values, and today's checker
already disagrees with it (§2.4: `T[]` is not a `{[i32]: T}`).

### 3.6 Summary matrix

| | A | B-static | B-dynamic | C | D-mono | D-dyn | E1 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| consumer sees one type per collection | yes | yes | yes | yes | no | no | yes (plus contract types) |
| dispatch per operation | none | none, or casts at joins | one predictable branch | casts at joins | none | `br_on_cast` / `call_ref` | one branch |
| code size | minimal | × reps per parameter | helpers only | × reps | × concretes | shared bodies plus vtables | helpers only |
| needs whole-program analysis | no | **yes** | no | no | no | no (closed world helps) | only for §VL.7 |
| separate-compilation ABI | the type | canonical rep plus conversions | the type | canonical plus conversions | the type | the supertype | the type |
| performance cliffs invisible in source | none | **yes** | small (mode switch) | none | none | inlining loss | small |
| new emitter kinds | 0 | per rep | 0 | per rep | per concrete | per concrete plus supertype | 0 (1 for §VL.7) |
| removes the header | no | yes | no | if hinted | n/a | n/a | yes, via §VL.7 |
| dense-int map | by hand | if order is proven | yes, order kept | by hint | `DenseMap` | `DenseMap` | yes |

---

## 4. Invariants any option must keep

Each row is something a VL program can already observe (§2.3) or has been ruled. ✓ means the
option keeps the invariant for free. ✓* means it keeps it at the stated cost. ✗ means it cannot
keep it without restriction.

| invariant | A | B-static | B-dynamic | C | D | E1 |
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
  what sits behind a stable header. That is the whole reason B-dynamic is cheap.
* **Insertion order is contract, not accident.** VL chose it (C2.4, D2315) and `==` on maps is
  refused *because of it* (§2.3). No automatic representation may reorder iteration.

---

## 5. The method-surface question, per option

The discussion has three sub-questions.

**(i) Does `{[K]: V}` carry map methods?**

* A, B, C and E1: **yes.** The shorthand *is* the map, and `get`/`has`/`set`/`delete`/
  `keys`/`values`/`length` are its methods, exactly as `T[]` carries `push`/`pop`/`slice`.
  This answers the owner's second question in the owner's direction: the symmetry argument
  holds. The C2 bug that motivated splitting them ("a value declared as something smaller than
  a map behaved as a full map") came from `Set` being spelled `{[T]: boolean}` and from
  struct-as-index-sig. `Set<T>` as its own type removes the first. The second has no
  population today. `f({ a: 1 })` into a `{[string]: i32}` parameter is refused with
  `expected {[string]: i32}, got {a: i32}` (RUN).
* D and E3: **no.** `{[K]: V}` carries only the read core (index, `length`, iteration), and the
  methods live on the concretes. The user has to learn which name to construct and which name
  to accept.

**(ii) `has` or `in`?**

| option | recommendation |
| --- | --- |
| all | keep `m.has(k)` as the method. It exists, it is a UFCS-shaped call, and it can satisfy a bound once built-ins do (§2.4). An operator cannot satisfy a bound without operator bounds, which are OQ-2 and deferred |
| if `in` is ever added | define it only where the answer is unambiguous: key presence on a map and membership on `Set<T>`. **Refuse it on `T[]`** with a sentence naming both readings ("`2 in xs` is index presence in JS and value membership in Python — write `xs.includes(2)` or `2 < xs.length`") |

The survey from today's discussion supports refusing `in` on lists. Python/Kotlin `in` on a
list is value membership, and JS `in` on an array is index presence. Two large populations of
readers expect opposite answers. A refusal with a sentence is the only spelling that surprises
neither. *Judgement*: `in` is not worth adding at all until a program shows `has` to be a real
friction. It adds a keyword-operator for one method call.

**(iii) Should `T[]` stay a subtype of `{[i32]: T}`?**

Today it is not one (§2.4, RUN), in either direction. **Recommendation: keep them disjoint, and
retire C2's `T[] = {[i32]: T}` sentence.** The decisive evidence is VL's own iteration rule
(C2.4): the first loop variable is the *element* for a list (`for x in xs`) and the *key* for a
map (`for k in m`). Under that rule a list is not a mapping from positions. A function written
against `{[i32]: T}` that iterates would bind positions from a map and elements from a list, and
it would be silently wrong for one of them. The inference engine already refuses to guess
between the two (§2.4, "ambiguous between an array and an i32-keyed map"). Keeping them
disjoint also removes the `2 in xs` trap from (ii) at the root. A function that wants "anything
indexable by i32" writes a bound.

Per option:

| | `{[K]: V}` methods | `T[]` vs `{[i32]: T}` | `has` / `in` |
| --- | --- | --- | --- |
| A | full map methods | disjoint | `has`, no `in` |
| B (either) | as A; reps are invisible to the method surface | disjoint | as A |
| C | as A, plus hint constructors on `Map`/`List` | disjoint | as A |
| D | read core only; methods on `HashMap`/… | `Vec<T> <: {[i32]: T}` is natural here, and inherits the iteration mismatch | `has` on the interface |
| E1 | full map methods; bounds for "any mapping" | disjoint | `has`; `in` refused on lists if ever added |

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

The compiler is itself the heaviest map consumer (324 `Map()` sites), so any map
representation change is priced by the self-compile. `self-compile-time.sh` and the
seed-size ratchet read it directly.

| option | surface churn | compiler work | risk |
| --- | --- | --- | --- |
| **A (complete)** | none. `Map<K, V>`/`Set<T>` are additive (A15 item 3) | `Set<T>` as a type (C2.2), annotation names, call type arguments. These are ROADMAP items, not new ones | low |
| **B-dynamic** | none | small-map scan: the 6 `__map_*__` helpers in `emit_bytes.vl` (2,790 lines total) plus the constructor. Dense mode: the same helpers plus the walk cursor (D2315 fixtures re-graded). No `VKind`, no ladder | low; graded by the D2370 randomized differential fixtures, which already exist for exactly this layer |
| **B-static, §VL.7 only** | none | an interprocedural, alias-unioned growth analysis; a new list rep, i.e. a new `VKind` family across the 154-function ladder unless descriptor phase 3 lands first; `===` on the header-less form | high before phase 3, medium after; precedent: `u8[]`, 28 titled rows |
| **B-static, full table** | none | the above, multiplied by each rep, plus iteration-order proofs for dense maps and join-class analysis | very high |
| **C** | additive constructors | as B-static per hinted rep, plus flow checks for hinted values meeting at joins | high, for little the consumer cannot get from D's named types |
| **D / E3** | **every one** of the ~2,800 hand-written `{[K]: V}` and `Map()` sites in compiler and tests must decide interface vs concrete; the 335 compiler sites also re-grade the seed | interface subtyping, two-layer method resolution (C2.8, against B16), existential lowering (D-dyn) or a storage refusal (D-mono), variance for interface parameters | very high; it reopens settled surface |
| **E1** | none beyond A | A's items, B-dynamic's helpers, built-in methods made bound-satisfiable (below), §VL.7 after phase 3 | low now, medium later |

**Making built-ins satisfy bounds** is the one new piece E1 needs. There are two ways. Either
`std` declares the collection methods as UFCS self-functions whose bodies are intrinsics (the
pattern `std:array` already uses for `filled` → `__array_new__`), or the bound-satisfaction
rung learns the built-in method table. The first puts the surface where `std-api-reviewer`
can see it. *Judgement*: prefer it.

---

## 7. Open questions for the owner

Each question carries a recommendation. None is decided by this document.

**OQ-1. May one surface type have several machine representations, invisible to the
consumer?**
*Recommendation: yes, under one rule.* The implementation may differ only in speed and
footprint. Anything a program can print (iteration order, identity, the key-equality relation,
aliasing) is contract, and a different contract is a different type. Prefer run-time variation
behind one heap type (B-dynamic) over compile-time selection (B-static).

**OQ-2. Is `{[K]: V}` the concrete map with map methods, or an interface?**
*Recommendation: the concrete map*, with full methods, exactly parallel to `T[]`. `Map<K, V>` is
its long spelling, not a supertype. This reverses C2's "index-sig is an interface" sentence and
keeps C2's other rulings (`Set<T>` its own type, `.length` everywhere, B8 iteration).
"Any mapping" is spelled as a bound.

**OQ-3. Should `T[]` remain related to `{[i32]: T}`?**
*Recommendation: no, keep them disjoint*, as the checker already does. The iteration rule
(element-first for lists, key-first for maps) makes a list a poor mapping, and disjointness
removes the `in` ambiguity.

**OQ-4. `has` or `in`?**
*Recommendation: `has`, and no `in` operator for now.* If `in` is added later, it covers map
keys and `Set` membership, and is refused on lists with a sentence naming `includes`.

**OQ-5. Which automatic representations are worth building, and in what order?**
*Recommendation*, in order:
1. The small-map linear scan (B-dynamic; helpers only; measured against `bench/collections`
   and `bench/vs-rust`).
2. The dense-int map mode (B-dynamic; this is the plumb ask; iteration order kept by
   construction).
3. Header-less fixed arrays (§VL.7, B-static), **only after** `rep-descriptor-campaign.md`
   phase 3.

Packed-integer lists and persistent maps: do not build. The consumer has `u8[]`, and
`readonly` does not license persistence.

**OQ-6. Should the consumer be able to choose a representation (C)?**
*Recommendation: only behaviour-free hints* (`capacity`, a starting mode). A choice that
changes observable behaviour is a named type. A choice that is behaviour-free but changes the
heap type has the join problem of §3.3 and buys nothing that B-dynamic does not.

**OQ-7. Should built-in collection methods satisfy bounds?**
*Recommendation: yes*, by declaring them in `std` as UFCS self-functions over intrinsics, so
that `<M: { get(K): V | null }>` accepts a map (§2.4 shows it refuses today). This is a std
surface change, so it goes through `std-api-reviewer`.

**OQ-8. Linear memory as a transparent backing for `T[]` (plumb, veldt)?**
*Recommendation: no.* WasmGC has no finalizers, so a GC-owned list cannot free a memory block.
Linear memory stays the explicit `Buf`/`flat`/`Rows<T>` tier. The array-kernel gap (2.02×) is
the engine's bounds check on `array.get`, and the lever for it is bounds-narrowing (§OQ.4 of
`collections-design.md`), not a change of backing.

**OQ-9. What does the consumer get when an automatic representation falls back?**
*Recommendation*: if any B-static representation is ever built, ship it together with a
`vl explain`-style report (or an `info` hint) that names the line that forced the general
representation. A performance cliff with no pointer to its cause is the predictability cost
(§3.2) that makes B-static a poor fit for a language whose pitch is "the compiler infers it
for you".

---

## Appendix — probe programs

All were run with `dist/vl run` / `dist/vl build` at `a277bf7b0` under
`taskset -c 0-15 nice -n 5`. The outputs are quoted in §2. The layout probes are the §2.1
blocks. The relation probes are the §2.4 blocks. The bound probe that *does* satisfy:

```vl
function at(self: {[i32]: i32}, k: i32): i32 | null { self[k] }
function look<M: { at(i32): i32 | null }>(c: M, k: i32): i32 { c.at(k) ?? -1 }
const m: {[i32]: i32} = Map()
m[1] = 7
print(look(m, 1))   // 7
```
