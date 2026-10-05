# Inline storage for records nobody writes (sunpa SP-038, SP-039)

**Status: S1 (inline record fields) is built as a host step, `scripts/vl-host/src/inline.rs` (D3678); D3679–D3681 are what it leaves, S2 among them. No owner ruling yet on §6.** The question is whether a record
type whose fields are never written can be stored by value: inline in its containing records,
and flattened in lists. The language would not change; only the compiler's storage choice
would. The fixed-array design (PR #3375, `fixed-arrays-design.md` §4.3 and §6) makes the same
placement argument for `T[N]`. This document makes it for ordinary records.

**The ask.** sunpa's posing still allocates about 250 small records a frame: `V3 {x, y, z}` and
`Q {x, y, z, w}`, all `f64`, pushed into lists and stored into record fields. The #3372/#3374
multi-value step (`scripts/vl-host/src/multivalue.rs`, D3625, D3630) removes a record only
where the caller reads its fields. A store keeps the struct: SP-039's `joints[0].rot =
qnorm(…)` is 52 `Q` a frame on its own.

## 0. Summary

* **Soundness: identity is unobservable today for a qualifying type, with four conditions.**
  `==` is structural. `Map`/`Set` refuse record keys. `print`, template holes and `std:json`
  refuse records. `extern` refuses structs. `===` does not parse. What remains observable:
  1. a field write, through any alias, including a layout twin or a width-subtyping view;
  2. `===` and `IdentityMap`/`IdentitySet`, which are ruled (A15) but not built;
  3. `is` on a supertype-typed value, if a subtype value was sliced into an inline slot;
  4. a record reaching a wasm boundary (an export or import), where JS has `===` and a linker
     assumes a layout.
  §1 turns these into the qualification rule.
* **Where to build it: a host wasm-to-wasm pass, run before the multi-value step.** The
  qualification is a wasm fact, and the step already computes most of it. A pass that fails
  validation leaves the module untouched, so its worst case is a missed optimisation. The
  emitter's worst case is check-clean invalid wasm at whatever position it forgot.
* **First slice: S1, inline record fields (a).** On a stored-field microbenchmark it is
  1.5x faster on V8 and 1.6x on wasmtime, and 392 scavenges per 10^7 stores fall to 0.
  It closes SP-039, a known **52 `Q` a frame**. It also feeds SP-038's IK record fields,
  whose per-frame share is not measured yet (§4).
* **Flattened lists (b) are a mixed result.** Push is 1.4–2.0x faster on V8 and 5.8–8.2x on
  wasmtime, with no allocation. An iterate-only loop is **1.1–1.7x slower** in cache, because
  each element costs three bounds-checked `array.get`s instead of one. So (b) is the second
  slice, and it ships after sunpa reports its per-frame split.

## 1. Soundness: what can observe a record's identity

VL records are shared WasmGC references (D622: "VL struct values have REFERENCE identity
uniformly"). Moving a value into its container's slots changes three things:
* a read returns a new box, or no box;
* a store copies the fields;
* a subtype value stored at a supertype slot loses its extra fields.

The table lists every operation that could see one of those changes. Each row was run on the
seed built from master `d2b09774b`, unless marked *design*.

| operation | today | observes identity? |
| --- | --- | --- |
| `a == b` on records | structural, at the **static** type (`V2`-typed `{1,2,3}` == `{1,2,9}` is `true`) | no |
| `Map`/`Set` with a record key | check error: keys must be `string`, `i32` or `i64` | no. A15 item 2 hashes structurally, so it stays no. |
| `IdentityMap` / `IdentitySet` | not built (A15 item 4) | **yes**, once built |
| `a === b` | parse error (A15 item 1, ruled 2026-09-01) | **yes**, once built: one `ref.eq` |
| `print(a)`, `"${a}"` | check error naming the fields | no |
| `std:json` | over the `Json` union only, with no reflection | no |
| `std:array` `indexOf`/`includes` | generic `==`, structural | no |
| `is` / `match` on a record arm | `ref.test` on the wasm type | only through slicing (row below) |
| `h.a is V3` where `h.a: V2` holds a `V3` | `true` | **yes, if `V2` slots were inlined.** Slicing makes it `false`. |
| `as` on records | check error: `as` is numeric only | no |
| `u as! V`, `u as? Q` on a record union | run today; `ref.cast` / `ref.test` | only through slicing (the `is` row), so condition 3 covers them |
| field write `p.x = …` | visible through every alias, layout twins and width views included (`const p: P3 = v; p.x = 5` changes `v.x`) | **yes**: this is the qualification |
| closure `==` | table index plus `ref.eq` on the environment | no. The environment's identity is kept; only what it holds changes rep. |
| generics | instantiated per wasm signature (`last<V3>` takes `(ref $V3[])`) | no |
| `extern function` | structs do not cross (`docs/guide/extern.md`) | no |
| entry-module `export function mk(): V3` | crosses as `(ref $V3)`; JS can `===` it or key a `WeakMap` with it | **yes** |
| the same, through a container: `getU(): V3 \| i32`, `getL(): V3[]`, `getH(): H` | the signatures are `(ref $box)`, `(ref $list)`, `(ref $H)`, with `$V3` absent from all three (entry exports) | **yes**: the `V3` is one `struct.get` away |
| threads | WasmGC structs are not shareable today | *design*: a shared struct would make an n-field store tearable |

**The rule.** A record type `T` qualifies when all four of these hold over the whole program:

1. **No field of any type in `T`'s alias class is written.** The alias class is:
   * `T` itself;
   * its layout twins: same field names, one wasm type (the `P3` row above);
   * every type in its width-subtyping component (D622).

   This is exactly `multivalue.rs`'s `written` set, charged by type and subtyping component
   (D3630).
2. **No `===`, `IdentityMap` or `IdentitySet` touches the class.** At the wasm level: no `ref.eq`
   whose operand's static type can hold a `T`. Today that is true by construction. Once A15
   lands, one `===` on a `V3` anywhere disqualifies `V3`.
3. **`T` is a leaf of the width-subtyping order:** no declared wasm subtype. Then a `T` slot
   can only ever hold a `T`, and nothing is sliced. sunpa's `V3` is a subtype of a
   `{x, y}` record (`$85 (sub $51 …)`), which is fine. A `V2` slot would not qualify,
   because a `V3` can sit in it.
4. **No value of type `T` reaches a wasm boundary, an export or an import,** at `T` or at any
   abstract supertype (`anyref`, `eqref`, `structref`; a union box's `anyref` field is one),
   through any type reachable from the signature: struct fields, array elements, union
   boxes. Exported globals and tables count (`getU`, `getL`, `getH` above).
   Inlining also changes a parent `P`'s layout, so `P`, and anything reaching `P`, must
   not cross a wasm-to-wasm boundary either: separate compilation and linking (plumb)
   would otherwise see two layouts for one type.
   *Recommended:* the layout of a record that crosses is unspecified, which would drop
   this condition (§6, owner question 2).

**These conditions are sufficient, not necessary.** Condition 3 could relax to exact-`T` slots
(a `V2` slot that provably never holds a `V3`). Condition 2 is vacuous until A15 lands.
Condition 1 is coarse: one write anywhere disqualifies the whole alias class.

Under these four, no expression can tell a shared box from a copy. Its fields never change,
so reading them early is reading them late, which is the step's argument for #3372. There
is no `ref.eq` that could compare it, and no `ref.test` that could find a missing subtype.
Two implementation duties keep it that way:
* **A read of an inline slot is eager.** `const q = j.rot` copies the fields at that point.
  A later `j.rot = …` must not reach `q`.
* **A store computes every field before it writes any.** If the parent is null, the first
  `struct.set` traps before any write. So a trap the embedder catches can never leave a
  half-written slot.
* **A store reads every source field before the first `struct.set`.** `h.a = h2.a` with `h`
  and `h2` possibly aliased would otherwise write `a.x`, then read the new `a.x`.

## 2. Which types qualify, and how the neighbouring features interact

* **Whole program, per alias class, by wasm type**, as the step already decides. In sunpa's
  `-O` build (sunpa `45e9202`, `VL_MV_EXPLAIN=1`):
  * `Q` is `$23` and `V3` is `$85`. Both are `candidate`: never written.
  * Both are leaves (`grep 'sub $85'` and `grep 'sub $23'` find nothing), and nothing casts
    to either.
  * Both have at most `MV_RECORD_MAX_FIELDS` (8) numeric fields, so v1 shares the step's
    bound, and re-boxing an inline value stays cheap.
* **Width subtyping (D622).** Prefix edges are computed over the name-sorted field list, and
  inlining expands a field of type `T` the same way in every parent. So a parent prefix stays
  a prefix after expansion: `{a: V3}` stays a supertype of `{a: V3, b: f64}`. Mutable fields
  are invariant, so a subtype and its supertype never disagree about a field's type at one
  position. The nested-pair row in D622 (`{n: Wide}` into `{n: Narrow}`, silent today) is a
  write through a mutable *parent*, and condition 1 sees that write.
* **Record covariance (owner, 2026-09-29) and fresh-record adoption (D3339).** Both decide a
  value's *type*. Neither creates an alias that D622 does not already have. A literal
  binding adopted to `V3` is a `V3`, and an inline store of it is three `struct.set`s.
* **Record spread (PR #3377).** `{ ...p, x: v }` builds a fresh record, so it is a read
  followed by a construction, never a write. Spread is the idiom that keeps a type
  never-written. `h.a = { ...h.a, x: 1.0 }` on an inline slot becomes three gets and three
  sets, with no allocation.
* **The whole-record store in place (PR #3377's build item, SP-032).** It does not come for
  free. sunpa's pool record is written 27 ways, so it does not qualify. A declared value
  record would make it qualify (owner question 1).
* **The cost of qualifying by inference** is a performance cliff at a distance. One
  `v.x = 1.0` added anywhere silently boxes every `V3` in the program. The explain output
  must name the write that disqualified the type (§5).

## 3. Where to implement: the emitter or a host pass

| | emitter (layout and representation) | host wasm-to-wasm pass, before `multivalue_step` |
| --- | --- | --- |
| sites to change | every site that maps a field to a slot. The tree has 327 `fbStructGet(`, 114 `fbStructNew(` and 44 `fbStructSet(` lines in `compiler/*.vl`, each count including its definition (grep, 2026-10-05); the share that touches user records is not counted. Add `buildStructSupers`, `emitStructEqRec`, variant boxes, closure environments, map value lists and the one-value-one-slot invariant (`fixed-arrays-design.md` §6.2). | one module rewrite: the type section, then every op on an affected type |
| deciding the qualification | must recompute the `written` set at the VL level, generic instances and std bodies included | the `written` set and the component rule already exist in `multivalue.rs` |
| failure mode | a site left unwired is check-clean invalid wasm, or wrong values, in the user's build. That is the D965 position-matrix lesson. | the pass validates its output and keeps the input if invalid, as the step does. That catches only invalid modules: a shifted field read that still type-checks validates. Grading by output is the real guard (§5). |
| `-O0` | inline at every level | allocates at `-O0`, in the in-browser playground and in anything not built through the host's `-O` steps: those never get it. Same trade as fixed-arrays Q5. |
| diagnostics | can name the VL write that disqualified a type | can name the function and op (the `VL_MV_EXPLAIN` style), but not the source line, unless built with `--names` |
| composes with #3372 | the producer still allocates unless the step makes a twin | yes: after the rewrite, a stored call result is read field by field, so the step gives it a twin |

**Can (a) be a host rewrite?** Yes. For a parent struct `P` whose field `k` holds `(ref null T)`:
* **The type:** field `k` becomes `T`'s n numeric fields. Later fields shift by n − 1, in
  `P` and in every type of `P`'s subtyping component, consistently.
* **`struct.new P`:** if the `k`th operand comes straight from `struct.new T`, drop that
  `struct.new` (its fields are already on the stack, as the step deletes a returned one).
  If it comes from a producer call, the twin supplies the fields. Otherwise spill it and
  read it n times.
* **`struct.set P k`:** spill the parent and the value, then emit n `struct.set`s. A value
  from `struct.new T` or a twin needs no spill.
* **`struct.get P k`:**
  * followed by `struct.get T j`, it becomes `struct.get P (k+j)`;
  * otherwise it materialises with `struct.new T` from n gets: a re-box, for a union, a
    nullable, an anyref slot or a non-twin call.
* **Declines,** per field:
  * an operand whose validator type is nullable, or a field read that reaches `ref.is_null`
    or `br_on_null`. VL emits a non-null `V3` field as `(ref null $V3)`, so the pass must
    prove that null never arrives.
  * a `struct.new_default P`, whose default would turn a null trap into `0.0`.

**Can (b) be a host rewrite?** Yes, with more ops to cover. `(array (mut (ref null T)))`
becomes `(array (mut f64))` at three times the length:
* `array.new_default` and `array.copy` scale their counts and offsets;
* `array.new_fixed` expands each operand;
* `array.set` becomes n sets;
* `array.get` followed by `struct.get T j` becomes one `array.get` at `3i + j`;
* any other `array.get` re-boxes;
* `array.len` divides by n;
* `array.fill` with a record value becomes a loop, or a decline.

The list header's length and capacity count *elements*, so they do not change. One effect is
not in either list: a `{[string]: V3}` map keeps its values in a `V3[]` list whose backing
has the same wasm array type (`$8` in the probe). So flattening the type flattens map values
too, and the map's code is rewritten with it. Generic and std bodies are instantiated per
element type, so no in-module boundary needs a copy. This matters because a list is mutable:
boxing a copy at a boundary would break aliasing.

**Does binaryen already do this?** No pass in binaryen 130 (`wasm-opt --help`) moves a
never-written struct's fields into its parent or flattens an array of structs. The nearest:
`--heap2local` scalarizes an allocation that does not escape, `--cfp`/`--gsi` fold constant
fields, `--type-merging`/`--unsubtyping`/`--type-ssa` change the type graph but not field
layout. A stored `V3` escapes into its container, so `--heap2local` leaves it. Binaryen does
re-run after the rewrite: the host runs the step first and the `-O` rung after
(`main.rs`, `opt.multivalue_step` then `opt.rung`), so it sees the inlined fields.

**Recommendation: the host, for both (a) and (b).** The emitter's part is the explain line
and, later, a hint. The emitter route is worth it only if the owner wants the guarantee at
`-O0` (fixed-arrays Q5), or wants a declared value record (owner question 1). A declaration is
a contract the checker must enforce whatever pass does the layout.

## 4. Cost model (measured)

Hand-written WasmGC was timed on V8 (Deno, FA2's `bench2.ts`) and on wasmtime 49 (startup
subtracted). Each figure is the minimum of 3 rounds, under `nice -n 19` at load 8–12.
Scavenges are counted from V8's `--trace-gc` over one timed call. The modules mirror what VL
emits today: a list is a `{backing, len, cap}` header, and each access reloads the header.

| row | what | V8 ms | wasmtime ms | scavenges |
| --- | --- | --: | --: | --: |
| field, boxed | 10^7 × `hold.a = unit(…)`; read `hold.a.y` (today) | 53.6 | 54.2 | 392 |
| field, **inline** | the same, 3 `struct.set` and 1 `struct.get` | **35.5** | **34.6** | **0** |
| list push+iterate, 1,024, boxed | 10^4 passes: clear, push 1,024, sum x+y+z | 62.0 | 544.1 | 122 |
| list push+iterate, 1,024, **flat** | stride 3, one bound test per element | **44.3** | **66.0** | **0** |
| list push+iterate, 65,536, boxed | 150 passes | 87.0 | 341.2 | 24 |
| list push+iterate, 65,536, **flat** | | **42.7** | **58.7** | **0** |
| iterate only, 1,024, boxed / flat | 5·10^4 passes over a list built once | 24.1 / 40.8 | 81.0 / 87.6 | 0 / 0 |
| iterate only, hoisted backing, 1,024 | the backing held in a local, both arms | 25.2 / 39.6 | 65.9 / 82.0 | 0 / 0 |
| iterate only, 65,536, boxed / flat | 800 passes | 37.0 / 41.9 | 79.4 / 90.1 | 0 / 0 |
| iterate only, hoisted, 65,536 | | 39.6 / 41.2 | 68.6 / 83.1 | 0 / 0 |

**What this shows:**
1. **An inline field is a strict win**: 1.51x on V8 and 1.57x on wasmtime, with no garbage.
   The read is one load instead of two.
2. **The cost a flat list removes is the allocation**, and wasmtime pays far more for it
   than V8: 8.2x at 1,024 elements against 1.4x.
3. **A flat list is slower to read.**
   * In cache it is 1.6–1.7x slower on V8 and 1.1–1.25x slower on wasmtime.
   * At 65,536 elements (1.5 MB) it is 1.04–1.13x slower on V8.
   * The cause is three bounds-checked `array.get`s, against one plus three unchecked
     `struct.get`s.
   * Reading the highest index first did not help on V8 (38.9 against 38.5 ms).
   * The boxed arm is the best case for boxes: allocated in order and never fragmented.

   A list that is built once and read many times would regress. That is why (b) waits for
   a profile.
4. **Code size.** One store site plus one read site is 264 B boxed and 265 B inline. One push
   site plus one three-field read is 395 B boxed and 428 B flat (+33 B). A re-box at an
   escape costs n `struct.get`s plus a `struct.new`, about 12 B for a `V3`. The seed is not
   affected, because it is not built through the host's `-O` steps.

**sunpa, statically** (its `-O` build, post-binaryen, with everything inlined into `animate`):
* `V3` has 39 `struct.new` sites, stored by 3 `struct.set` sites into one container (`$30`),
  6 `array.set` sites into a `V3[]` backing, and 7 constructions of 4 container types.
* `Q` has 6 `struct.new` sites, stored by 3 `struct.set` sites into `$41`, 2 `array.set`
  sites into a `Q[]` backing, and 2 constructions of one container.

These are static sites. Which slice removes more *per frame* needs sunpa's counter (S0).

## 5. Slices

| slice | what | removes | size |
| --- | --- | --- | --- |
| **S0** | the explain line, per type: qualifies, or the write, `ref.eq` or export that disqualifies it; how many stores feed a field and how many feed an array. sunpa then reports its per-frame split. | nothing, but it decides S1 against S2 | small |
| **S1** | (a) inline record fields, host pass, leaf never-written numeric records of ≤ 8 fields in non-null fields. Includes construction of the parent (`{ rot: qnorm(…), len }`) and closure environments, which are structs too. | **52 `Q` a frame known (SP-039)**, plus the V3/Q fields of the IK records and their constructions. Their share of the other ~200 is unmeasured. | medium: a type-section rewrite, which the step does not do today |
| S2 | (b) flattened `T[]` for the same types, map value lists included | one allocation per push. sunpa's `let at: V3[] = []` lists are built per call, which is the push-heavy shape that wins. | larger: every array op |
| S3 | nullable fields through a presence slot; unions stay boxed | rare in sunpa | later |

**Recommended first slice: S1.** It is the smaller rewrite. Its soundness is the #3372
argument word for word. It is a strict win in the measurements, and it closes a filed issue
with a known count. Expected saving: **at least 52 records a frame** (about 2–2.5 KB at 40–48 B a `Q`
box), plus whatever share of the ~200 sits in stored fields. S0 turns "whatever share" into
a number in about an hour of sunpa's time.

**What every slice must ship with:**
* a position matrix: binding, parameter, return, field, element, capture, global,
  `if`/`match` value;
* proof rows that print a value distinguishing a copy from an alias. `const q = j.rot;
  j.rot = other; q.x` must print the old value;
* a `-O`/no-`-O` agreement run over the distilled corpus;
* source-map row relocation, as the step does for its twins.

## 6. Risks and open questions

### For the owner (language questions only)

1. **Should a record type be able to declare itself a value?** For example, `value type V3 =
   { … }`; the spelling is the owner's.
   * It would mean what fixed-arrays Q1 (a) means for `T[N]`:
     * `v.x = 1.0` on an assignable place is `v = { ...v, x: 1.0 }`;
     * `=` copies, as far as anyone can observe;
     * `===` is a check error;
     * the record always qualifies.
   * Without it, qualification is inferred, and one distant write breaks it (§2).
   * With it, pool resets (SP-032 and PR #3377's build item) become in-place stores.
   * **Recommendation:** yes, but after S1. sunpa's `V3` and `Q` already qualify by
     inference. The declaration is the stable contract once a second consumer leans on it.
2. **Is a record's LAYOUT part of the export ABI** (JS identity and wasm-to-wasm linking)?
   `export function mk(): V3`: (A) layout and identity unspecified, `V3` may inline; (B)
   specified, any `V3` reaching a boundary stays boxed.
   (A) lets a host keep its own handle table if it needs identity; (B) disqualifies the type
   and everything reaching it, as the default does. **Recommendation:** (A). The stated
   default until a ruling is (B).
3. **Once A15 builds `===`, is `===` on a value-qualifying (or declared-value) type a check
   error,** rather than silently disabling the optimisation program-wide?
   `a === b` on a `V3`: (A) check error naming the type; (B) allowed, and `V3` loses inline
   storage everywhere.
   **Recommendation:** (A) for a declared value type (question 1), where `===` already has
   no meaning. (B) for an inferred one, with the explain line naming the `===`, because a
   check error from inference would make a distant write or compare change what compiles.

The `-O`-only question is not new. It is fixed-arrays Q5, and the same answer applies here.

### For the implementation

* The `written` set has to cover atomics and every future write form, and the explain line
  has to name the op that disqualified the type.
* A15 `===` will turn condition 2 from vacuous to real. Its build PR must add the `ref.eq`
  scan to the pass's qualification. Its value table should gain a row asserting that `===`
  on an inline-placed type still answers correctly, by disqualifying the type.
* **Threads:** an n-field store is not atomic. If shared structs ever arrive (the
  atomics/worker direction), a shared parent type must decline.
* **Type-section rewrite:** the rec group has a single parent per type (D622), parents come
  first in index order, and the index of every local, signature and global must be remapped.
  The first new risk class beyond `multivalue.rs` is a module that validates but reads a
  shifted field. Validation cannot see it; the proof rows above are the guard.
* **The growth bound:** a re-boxed escape costs about 12 B per site. Apply the step's
  per-module bound per function, as fixed-arrays §6.2 asks.
* **The (b) read regression:** a later engine-side bounds-check elimination, or a
  struct-of-arrays layout, could remove it. Neither is assumed here.
* `plumb-shape-cost.py` and `self-compile-time.sh` gate the pass's own cost. A type rewrite
  over a 10 MB plumb module must stay linear.

## Appendix: benchmark modules

Generated WAT, one `rec` group: `V3` (three `(mut f64)`), `HB {a: (ref null V3), b}` boxed,
`HI {a_x, a_y, a_z, b}` inline, `AR` of `(ref null V3)`, `AF` of `(mut f64)`, and list headers
`LB`/`LF` over them. Each exports `bench(n) -> f64`, and each pair agreed on its checksum. The
unit vector is `x = i·10^-6`, `l = sqrt(x² + 5)`, `(x/l, 2/l, 1/l)`. The flat read tests
`j < len` once per element; the boxed read tests it once and then `ref.as_non_null`s.
