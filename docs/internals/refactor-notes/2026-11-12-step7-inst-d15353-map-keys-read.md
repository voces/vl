# Step 7 inst: a map of un-annotated functions read by its own keys is tagged, 2026-11-12

Lane w321, D15353. Take `fnMap` holding `inc0` and `half`, un-annotated and called at two types,
read as `for k in fnMap.keys() { fnMap.get(k) }`.

The tag pass decides a set's holder is read only in places that take the set's ids
(`ftHoldCtxOk`). For a map, `ftSlotOp` admitted `get`, `set`, `has` and `delete`. `keys()` was
none of them, so the set was never tagged and the map had no value storage:
`unsupported map value type`. A read by a literal key ran.

## Changed

`ftSlotOp` (`check_fn_tag.vl`) admits a map's `keys()`. It hands out keys only, never a
value, so it reads none of the set's ids.

## Measured

`scripts/capability-probes/matrix/map-of-hole-fns-read-by-keys.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 58 graded | 26 | 51 |
| un-annotated runs, of 29 | 4 | 24 |
| annotated runs, of 29 | 22 | 27 |
| `runs → not-runs` | — | 0 |
| silent | 3 | 3 |

The three SILENT cells are the same on both seeds. They are `array_push` (both faces) and
`map_set` (annotated): a map of an un-annotated function delivered by `push` or `set` into an
annotated container of maps of functions is check-clean invalid wasm. It needs no `keys()`.
Filed as D15752, clause 1. The other reds:

- `argument` is a template artifact: the proof's `k` is not in scope there.
- `local_assign` and `map_value` are check refusals of storing the map's functions at two
  signatures.

## Proof

**Full local sweep.** Fixpoint seeds, base master `8fbf0d78`, 23,973 programs:

| | count |
| --- | --- |
| same | 23,972 |
| bytes-only | 0 |
| output movers | 1 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The one mover is D15353, which goes from refusal to runs. D15752's witness is check-clean
invalid wasm on both seeds.
