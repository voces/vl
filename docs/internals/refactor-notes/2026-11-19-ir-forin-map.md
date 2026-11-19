# `for in map`: a walk over a map global's keys or values (2026-11-19)

The coordinator's census named `for in map` (34 self-compile functions blocked by it alone).
`forInPlainWhy` refused any walk whose iterable is a map's keys or values.

## Shape
- `emitForInMapStash` splits at its receiver: `pushMapRecvRef` (legacy's receiver read) then
  `forInMapStash` (the shape, the op's mapRef, the walk's own stash). `emitForInList`'s map arm is
  `forInMapList` (the keys or values list off the stash). Both emitters call both halves.
- The IR takes a map receiver as its map ops do: a map global (`mapGlobalOf`), read by `globalRead`
  and recovered when narrowed, then `mapRecvRefTail`. `SForIn` carries it as `xfMap` and
  `xfMapNonNull`, its `xfList` an unread immediate. A map that is no global stays the named miss
  `for in map receiver`.
- The element variable's rep is the walk's bound element (`forInElemTyOf`), an i32 or a string
  (`forInPlainWhy` still names every other element kind); the verifier checks that.
- The tombstone skip and the resync after a body that writes the map are legacy's rolled-loop
  halves, already shared.

## Measured
See the PR body.
