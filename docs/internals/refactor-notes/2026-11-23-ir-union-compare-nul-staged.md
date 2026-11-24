# IR: a union compare's null legs over a call box or call operand, parked as legacy parks them (2026-11-23, lane S1)

This follows #9780 and closes S1's union-compare claim. D17065 and D17066 made legacy's null-leg
arms read a box or operand that is no place once, into a slot of the nesting level. This PR
moves those slot steps into pieces both emitters call, and builds them in the IR.

## Legacy refactor (byte-identical)

| piece | does |
|---|---|
| `unionEqNulPlanOf` | also names leg 1 (a `K \| null` operand that is no place) and which sides are parked |
| `unionEqNulStageOpen(staged)` | the level's box slot where the box is parked, then one level deeper |
| `unionEqNulOpSlot(leg)`, `unionEqNulBoxSlot()` | the open level's operand and box slots |
| `unionEqAtomOperandTail` | a parked `K \| null` id decoded to its member string |

## IR

The builder writes the level's steps as `RUnionStage` effects: op 4 opens it, op 5 parks an
operand left of a parked box, op 6 parks the box. `RUnionConcreteEq.ucStage` names the parked
sides, and `unionNulEq` reads them from their slots (an operand parked at its leg is teed there).
When the box is not parked, the operand is built first, as legacy reads it first.

## Readings

| run | before (#9780's seed) | after |
|---|---|---|
| D17065's grids (144) and D17068's grid (252): bytes under legacy | | identical 396 of 396 |
| D17065's grids: uncovered union-compare rows | 88 | 50 |
| D17068's grid: uncovered or mismatch rows | 0 | 0 |
| the 4 witnesses: uncovered union-compare rows | 8 | 2 (`atomNoNull`, `boolField`: below) |
| self-compile IR misses | 0 | 0 |

## The grids, as named sets

D17065's grids (144 cells) and D17068's (252) are now named sets in
`scripts/silent-sweep/distilled/named/` (`d17065_*`, `d17068_*`), with their coordinates in
`scripts/silent-sweep/census/d17065-union-compare-grid.json` and `d17068-union-compare-grid.json`.
All 396 `runs`, so `regress.vl` reds if a later change stops one running.

## Left in the class (free, small items, one list per mechanism)

None of these is a null-leg call operand; each was uncovered on #9780's seed too.

- **A `K | null` operand that is a place** (legacy decodes it through `emitStrValue`): D17065's
  grids' `atom_*` param, field and global rows (26), and `atomNoNull` in
  `union-eq-nullable-string-atom-bool-operand`.
- **A `boolean | null` operand against a union with no `null` arm** (the plain arm over the
  niche's rep): D17065's grids' `bool_x_*` rows (12), and `boolField` in
  `union-eq-nullable-string-atom-bool-operand`.
- **A field or global operand on the null legs** (re-readable, not a place): D17065's grids'
  `str_*_eq_field`, `str_*_eq_global`, `bool_n_*_field`, `bool_n_*_global` rows (12).
- From #9780's note, unchanged: operand rep (`union-eq-narrowed-let-operand`,
  `union-closure-arm-equality`) and box shapes (`opt-chain-scalar-unbound-box`,
  `wide-union-forty-arms`, `nested-niche-all-null-inner-literal`,
  `inferred-nullable-mixed-litunion-return`, `alias-litunion-record-eq-literal-unann`).
