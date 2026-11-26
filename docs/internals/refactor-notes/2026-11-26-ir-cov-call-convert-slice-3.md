# IR: `irConvert`, slice 3: container retags (2026-11-26, COV-CALL)

**Ruling.** This is slice 3 of the converter the coordinator ruled on 2026-11-26 (DECISIONS.md,
"One structural converter, `irConvert`, for every delivery site"). The ruling called this
slice "list and map copies". Every container row in the regen-9 coercion classes is either a
retag or not a conversion at all, so this slice adds no copy.

**Mechanism.** The cases are shared predicates in `ir.vl`, read by `convertRetag` and by the
verifier's `RRetag` rule alike:

- `listRetag` also admits elements that are record twins on one heap (`recRetag`), through
  `elemCoresRetag`.
- `mapRetag` (new) admits map values stored alike: one `recElemCore`, or record twins.
- `boxMapRetag` now admits a box and a boxed nullable mixed. The witness's own contract (maps
  whose values are two unions store alike) and legacy's wasm (one `ref` type at both arms of
  `tail-if-map-nullable-twin`'s `pick`) agree on that.

**Census.** Measured with the probe of this branch against slice 2's probe.

- Newly claimed: records/intersection-recursive-twin-row-retag-positions `elems`,
  records/plain-record-at-variant-twin-and-bool-list-at-i32-positions `asElem`,
  functions/tail-if-map-nullable-twin `pick` (D2700) and maps/union-valued-maps-share-one-struct
  `@start`.
- Not this slice's:
  - `list -> list` / `map -> map` between a record at its row's heap and a rowless record (heap
    -1: d15293 `mk`, covariant-record-field-read-only-runs `@init`,
    map-binding-keeps-own-type-when-read-so `@start`). That is the record row family, COV-START's.
  - functions/hole-leaf-literal-through-forwarder `outerE`, `i32[]` into `f64[] | null`. That is
    a hole leaf literal built at its own element rep, START-2's literal family.

**Q58.** `tests/cases/maps/container-twin-retag-positions.vl`: a list of record twins, a map
into its `| null` values and a union-valued map into a wider union, each at a declaration, an
argument and a return. Slice 2's probe misses 4 of its functions; this branch claims every one,
and the armed run prints the `@log` list.
