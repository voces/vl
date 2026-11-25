# IR coverage: assignment values parked and closure re-reads (lane COV-UNION, 2026-11-25)

Two classes of the I8 census: `assignment value parked` (10 rows) and `assignment value re-read
rep` (9 rows).

## Mechanism

- **parked.** `asgValueArmOf` answers `parked` where an assignment's target cannot be re-read: an
  element, struct field or map entry write. Legacy stores with `asgParkWanted` set, which parks the
  value in a scratch slot, and reads that slot back:
  - element store: `idxStoreTail`'s value slot (`listIdxValSlot`), always parked;
  - struct field store: `asgParkField`'s tee into a scratch local of the field's kind;
  - map set: `mapSetTail`'s value stash (`mapSetValStashLocal`).

  The IR builds the store as before, then a new Rhs `RAsgParked { apAt }` that lowers through one
  legacy writer per target (`asgParkedElemTail`, `asgParkedFieldTail`, `asgParkedMapTail`): the
  slot, recovered non-null as the parked arm recovers it. A field store and a map set carry
  `sfPark` / `msPark`, so the lowering parks through legacy's own tails (`fieldStoreParkTail`,
  `mapSetTail`'s `park`). A value narrower than its slot is narrowed by `RAsgUnwiden` over the read.
  `asgParkFieldList` is split out of `asgParkField` so both sides name one slot. A field of a kind
  no scratch local holds is a named miss.
- **re-read rep (closures).** A generic function assigned into a closure cell whose type leaves a
  part open is re-read at the cell's closure rep. Where the assignment's own closure type fills or
  leaves that part open (`holeRetagNoted`), the re-read is the same closure struct, retagged
  (`RRetag`), as a closure cell's read already is.
- The atom family of `re-read rep` (a `K | null` global's or field's re-read delivered as a string,
  3 rows) stays a miss: decoding it as the local case does wrote other start bytes.

## Measurements

- Class cut of the census (`CENSUS_CLASS`, 47 programs across this lane's assignment, store and
  union compare classes), before → after:
  - `assignment value parked` 10 → 0; `assignment value re-read rep` 9 → 3;
  - cases functions claimed 382 → 388 of 412, start bodies 13 → 14 of 27;
  - witnesses functions 237 of 239 (was 234), start bodies 9 of 17 (was 5).
  - Two rows move to later misses outside these classes: `store of a field or element write`
    (a chained write) and `coalesce optional mapField`.
- Q58 sweeps:
  - `tests/cases/assignment/parked-write-value-in-each-position.vl`: 72 of 72 functions and both
    start bodies matched; 4 of its functions missed `assignment value parked` before.
  - `tests/cases/closures/assign-generic-fn-into-cell-value-in-each-position.vl`: 18 of 18 and the
    start matched; 6 missed `assignment value re-read rep` before. Five legacy emit refusals on
    neighbouring generic-closure spellings were reported to the coordinator for lane SOUND and
    left out of the sweep.
