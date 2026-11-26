# START-2: `rep unsup of call` (2026-11-26)

Census restricted to the class's program (`maps/union-arm-constructed-map-field.vl`), master
4d96b69e: 1 → 0, its start body claimed.

A `Map()` delivered where its own type has no rep (the key and value come from the destination)
refused at the call (`openCallValue`'s `mapNewCall` arm). `deliver` now builds it at the
destination's map, typed at that map's own type (rule 3 refuses the node's open type), and widens
it to a nullable map.

Left open: `rep unsup of index` (`closures/hole-fn-list-named-callback.vl`, `r[0](5)` over a hole
parameter holding `[[inc6]]`) misses alike in its local spelling: a hole closure list's index, not
a start-body gap.
