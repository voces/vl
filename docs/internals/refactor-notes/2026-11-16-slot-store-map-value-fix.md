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

READINGS
