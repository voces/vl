# START-2: `map store value union rep` (2026-11-26)

Regen-10 lists 4 units:
- `maps/bundle-map-two-records-key-test.vl` (`@start`)
- `maps/bundle-map-two-records-stored-from-function.vl` (`g`, `@start`)
- D17106's witness

An instrumented miss named the reps in every unit: a record (a function-signature bundle built at
its set's row) delivered at its own rep, against a union box, the map's value rep.

`mapSetValue`'s union arm now hands a value left at its own rep to `irConvertStored`, as push and
the element store do (#10326). The converter boxes the record into the union (`CONVERT_BOX`).

`ir-parity`: byte-identical on the three programs and on the sweep,
`maps/bundle-record-stored-into-union-map-positions.vl` (index store, `.set`, an index store in a
function). Master misses the sweep in `put` and `@start`.

Legacy refuses one neighbouring spelling: a bundle bound to a name, then stored
(`const held = lap2(...)` then `m["b"] = held`), with `a function returning a parameter called at
two signatures is called where its result is not used at one of them`. The IR names it
`bundle result pick refused`. Reported to CENSUS, not in this change.
