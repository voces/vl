# IR coverage: a map read at a twin of the stored value rep (2026-11-25, lane COV-CLOS)

This is task (e) of the coordinator's 06:48 order: the `map get rep` class. The coordinator was told
it would run before (d), which is 4 programs on a new loop shape.

## Mechanism

An mv-slot map's stored value rep (`RMap.rmVal`) can differ from the inner rep of a read typed
`V | null` only in closure openness. Two examples are a hole function stored in an un-annotated
`Map()` and read at its pinned signature, and a record of such closures. Both ways of spelling the
type lower to the same wasm, and legacy reads the stored ref as it is. The IR missed the read as
`map get rep`. Now `mapGetTwinTy` takes the `V | null` type of the stored value's own type
(`repTyOf(rmVal)`, through `nullableTyOf`, a wrapper in `emit_classify.vl` that keeps the
checker-import surface flat). It holds the read at that rep, where `mapGetRepOk` accepts it, and
retags to the read's rep (`repTemp`). The retag is allowed only where `holeRetagNoted` admits it.

Before the census, a measurement on the class showed that every one of its 13 cases had the read's
rep as `null1(X)` beside a stored `Y`, with X and Y twins. The checker's map value type is the
read's own type, so the rep has to come from the stored value.

## Census (O1): base (master + the duplicate `irReadsAgain` removed) → head, over 1,663 programs (tests/cases and probes that build a map)

| | base | head |
|---|---:|---:|
| distinct functions claimed | 12,356 | 12,359 |
| start bodies claimed | 1,169 | 1,175 |
| `map get rep` rows | 20 | 6 |
| claim fallbacks | 0 | 0 |

No function lost its claim. The reads that moved on reach `open temp type` (6 → 8),
`array element coercion` (1 → 2) or `ref if arm rep` (1 → 2). The 6 rows left are other shapes:
- a closure value read at a record rep (`module-map-of-bundles-read-from-functions.vl`, 3 functions);
- a record of union boxes (`is-on-field-of-map-read-narrowed-by-null.vl`);
- two narrowed-union reads with no mv slot (`narrowed-map-union-through-a-call-*.vl`).

Claimless identity over the same programs plus the sweep: 1,262 identical, 402 fail under both,
differ 0.

## Q58 sweep

`tests/cases/maps/map-read-at-twin-closure-rep-positions.vl` has 7 positions, and every one prints
its value. On head, 4 claim: a binding, a record field, a direct call and a `.get`. On base, 6 of
the 7 missed as `map get rep`, and the `??` position was already blocked on its own class. The
positions still missing on head miss on classes of their own: the `??` operand (`map read mv value
rep`), a list element (`array element coercion`) and a return (`return coercion`). Two positions
are left out because each hits an open defect that is not this change's:
- an annotated destination, filed here as [D17581](../inventory/D17581.md), clause 1;
- an `if` arm, which is [D16239](../inventory/D16239.md).
