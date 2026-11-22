# IR: a literal-union map's bare read at its nullable atom (2026-11-22, lane IR-N2)

`map get rep`: on a fixpoint seed of master d5192673, 57 corpus functions miss there alone. An
instrumented seed named each read's map value rep and the rep it is delivered at. The largest
group, 24, is an atom-valued map (`{[i32]: AB}`) read at `AB | null`.

Legacy's bare read is the probe helper's `i32` (`__map_get_*`). Its miss is the `K | null` niche's
`-1` sentinel (`mapGetMissOf`), so the read is the nullable atom as it stands. `mapGetRepOk`
already took the boolean twin (miss `2` at `boolean | null`) and not this one.

## The change

`mapGetRepOk` (`ir_build.vl`) takes a mono-valued map's read at the value's nullable where legacy's
miss is that nullable's sentinel: `2` for `boolean | null`, `-1` for `K | null`. Both are
`mapGetMissOf`'s answer.

Covered = matched over the `map get rep` census files: 313 → 327. Left for later, because each
needs its own reading of what legacy writes:
- a `boolean | null` value read at `boolean` (17, under `??`);
- its atom twin (4);
- the mv slot reads whose value is already nullable (with other blockers).

Row file `tests/ir-shadow-rows/literal-union-map-read-nullable.vl`; witness
`tests/cases/maps/literal-union-map-read-is-its-nullable.vl`.
