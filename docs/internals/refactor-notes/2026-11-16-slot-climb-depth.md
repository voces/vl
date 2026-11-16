# Slot delivery walk: a deep path ends at a cycle (2026-11-16)

Lane SLOT, branch `slot-climb-depth`. Asked by lane HASH: witness `fnone_d12` (a generic function
held twelve records deep) needs the walk to follow paths longer than eight steps.

## Change

`elabSlotClimb`, `elabSlotReadDeliveries` and `elabRetSlotOn` stopped at a path of 8 steps. Each now
keys an entry at 8 steps or more by (walk, node, interned path text) and stops only when the node was
already reached at a path the new one ends with: a cycle that only lengthened the path. Paths under 8
steps keep their old keys, so every program the old walk finished on reads the same.

## Measurements

- Fixpoint seed; `tests/cases` builds: 0 of 7837 differ from master `ec9ba3f9`'s fixpoint seed.
- `regress.vl` per cell: identical, 0 `runs -> not-runs` of 260,737 census cells.
- L2 self-compile fuel 92,964,385,625, +0.1% on 92,875,944,764. Seed 6,416,235 (master 6,414,858).
- `fnone_d12` with HASH's two edits prints 4.

## Breadth cap

Each walk also returns once `seen.length > 32`. A trip adds no delivery, so it answers "delivers
nothing", the unsafe answer. Filed as D16769 with a 40-alias witness that trips it 11 times and runs
today. The cap goes with the walk in part E (D16768).
