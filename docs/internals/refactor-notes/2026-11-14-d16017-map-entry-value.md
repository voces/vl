# D16017: a map entry write used as a value yields its set's value stash, 2026-11-14

D16015 (#7938) made an element or field write used as a value yield the cell its store parks.
A map entry write stayed refused: a map set probes and then overwrites or appends, and it parks
nothing an element store does. It does evaluate its value once, before the probe, and keep it in
the set's value stash: an mv slot's own local (`fnMvValStashLocal`), else the map frame's slot 14.

When the assignment's value rung asks (`asgParkWanted`), the set keeps that stash on both paths. It
tees the value ahead of a per-shape store helper's call, and the inline store already set it. It
then records the stash as the parked value (`mapSetParked`). The index store that ran the set owns
the park, the same owner check D16015 uses. The rung compares a map entry's type by the map's value
type (`tyMapValOf`), since a read of the entry is that type or `null`.

A union- or nullable-valued map's entry stores a value typed apart from the assignment's, so it
stays refused under D16016's message. The separate map message is gone.

## Graded

| matrix | base | candidate |
| --- | --- | --- |
| `map-write-value` (`(mwm[mwk] = 5)`, plus string- and record-valued cells) | 0 of 50 run | 50 of 50 run, 0 silent |
| `element-write-value`, `field-write-value` | 50 of 50 | 50 of 50 |

Hand cells:
- `f(m[k] = 7, m[k] ?? 0)` prints `77`;
- `m[k] = xs[i] = 6` runs;
- two writes in one expression in a function run;
- an `i32`-keyed map, and `f64`-, string- and record-valued maps, run.

## Measured

| instrument | result |
| --- | --- |
| full sweep, base master against this change, both fixpoint seeds | SWEEP_RESULT |
| fast set | FASTSET_RESULT |
