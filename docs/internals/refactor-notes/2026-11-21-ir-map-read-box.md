# IR: a scalar map read into its nullable box (2026-11-21, lane IR-N3)

`map get rep` was the IR's refusal of a bare map read whose rep is a boxed `V | null` while the
map's value is a scalar (an `i32`, or a function held as its id). Legacy never reads such a value at
the box: the box writer (`emitUnionBoxArg`) reaches `emitUnionCoerceValueAtom`'s scalar map rung,
and `emitMapGetScalarBox` writes the box from the probe, with the value's tag and boxed payload on a hit
and the null tag on a miss. The shared box plan (`holeBoxPlanOf`) handed every map read to the
ladder, so the IR had no arm to follow.

## The change

- `holeBoxPlanOf` names the rung: `mapScalar` of kind `hbKind`, for a scalar map read into a union
  holding that scalar and `null` (`mapReadBoxPlanOf`). Legacy's `emitHoleBox` follows the plan
  through `emitMapGetScalarBox`, so the two sides take one decision.
- `emitMapGetScalarBox`'s tail after the probe is `emitMapGetScalarBoxTail`.
- The builder's `deliver` builds such a read as `RMapGet` with `mtBox`, the atom kind, typed at
  the box's union. The lowering writes the probe head and that tail, with no element-read row, since
  legacy banks none on this route.

## Witness

`tests/ir-shadow-rows/map-read-scalar-box.vl`: a hole-function-valued map, an `i32` map read into
its `i32 | null` local, and a narrowed re-read in an `if` arm.

## Measured (fixpoint seeds of master 4b5d638e and the change)

- Corpus blocker census: no-blocker 43,944 → 44,018 of 45,678. `map get rep` alone 75 → 1, and
  `global read coercion + map get rep` 12 → 0. The one left is an atom value (`AB | null`, disc 3).
- tests/cases armed shadow: covered and matched +72; `uncovered map get rep` 92 → 14, start 57 → 10;
  no new `fail` or `mismatch` row.
- Legacy: tests/cases A/B identical 7,300 (differ 0), `--names` self-compile identical, mode-3 self
  byte-identical. L2 fuel 105,397,452,434 → 105,464,626,510 (+0.064%).
