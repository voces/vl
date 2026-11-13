# Step 7: the map-value struct rungs pass their held type, 2026-11-13

`mvShapeOfValNameArmTyGo` interns a record map value's ref-list row on one of two rungs. Neither
handed `rlInternNameTyK` a type, so the row's key came from re-parsing its name
(`repElemTyOfName`):

- **The armNm rung** (`rlInternNameTy(armNm, RLK_STRUCT, armTy)` with `armTy` -1). Here `armNm`
  is `valName`, chosen because `exactArmRowOfTy(cUserTypes[valName])` names an arm. The type that
  test asked about is the held type, and it is now passed.
- **The `sNames[vsi]` rung** (`rlInternName(sNames[vsi], RLK_STRUCT)`). `vsi` is the struct row
  of the value's canonical record type, and `sTyIx[vsi]` is the type that row was minted for. It
  is now passed through `rlKeyTyOf`. A record holding a function stays keyed by its name, as
  `rlKeyTyOf`'s contract requires (#7636). An `#anonN` row was already keyed by its `sTyIx`
  (`anonRowTyOfName`).

`rlInternName` had no other caller and is deleted.

## Graded

A probe compared each candidate's key and type with the name parse, with marks reset per
compiled program, over 24,170 programs on `baaf17797`:

| rung | candidate | agree | differ | declined (`rlKeyTyOf`) |
| --- | --- | --- | --- | --- |
| armNm | `cUserTypes[valName]` | 172 | 0 | 0 |
| armNm | `nonNullTy(kindTy)` | 172 | 0 | 0 |
| `sNames[vsi]` | `sTyIx[vsi]` | 881 (208 `#anon`) | 0 | 42 |
| `sNames[vsi]` | `nonNullTy(kindTy)` | 861 | 20 (`{r:i32\|null}` 15, `Dot` 5) | 42 |

The stored spelling cannot move: `rlElemStoredName` folds only `i32` and `string` lists, and
these rows are records.

## Measured

| instrument | result |
| --- | --- |
| full sweep, base `baaf17797` against this change, both fixpoint seeds | SWEEP_RESULT |
| fast set on the same tree | FASTSET_RESULT |
