# Slot store: the flip's map-value regressions, fixed forward (lane SLOT, 2026-11-16)

The slot-store flip (#8731) lost `runs` cells in the maker, hole-parameter and relay capability
matrices (`map_set/unann`, `map_value/unann`): one refused at emit, two trapped. Each ran on the
pre-flip seed (`69032f02`). Row [D16768](../inventory/D16768.md); pin [D16864](../inventory/D16864.md).

## What changed

- **`eplSlotCallTysInto`**: a call through a slot is a delivery where its arguments are closed, at
  the result the call is typed, open or not. The flip demanded a closed result too, so `v(3)`
  through a maker's lambda read back by `get` (result typed `_`) delivered nothing and the map
  value interned no slot. The walk the flip replaced checked the parameters only.
- **`eplSlotCallRecs`**: read from a value, a call search leaves out the edge an index write
  (`m[k] = v`) or a `set` stores it along into a list or map element (`EPL.idxWrites`). The classes
  follow that write, so a generic a relay returns was delivered at two types (`__w`'s `string` and
  the map site's `i32`), and mono built one instance for both: a trap. The walk never followed the
  write. Lane WIDTH's per-call-site relay twinning removes the omit (D16864).

## Readings

Fixpoint seeds: master `9648a5f2a` and this branch.

| check | reading |
|---|---|
| `tests/cases` built, byte for byte | 0 of 7,921 differ |
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's; 0 `runs -> not-runs` |
| capability matrices, `--before` master `--after` this branch | 75 templates (maker, hole-fn, list-of, fn-record, closure, captured, relay): 0 `runs -> not-runs`, 0 to silent, 0 to a program trap; 9 cells gained (`map_value`, `map_set`, `map_value_place` un-annotated) |
| named cells (block `slot-flip-map-value`) | 4 run on this branch; master's seed fails all 4 (1 emit reject, 3 traps) |
| L2 self-compile fuel | 97.551e9 against the 97.110e9 baseline: +0.5% |
| `lint-self` | clean |
| `scripts/gate.sh` | every row ok but `generics/hole-fn-value-unresolved-read.vl`, master's #8741 regression |
