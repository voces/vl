# IR coverage: a `boolean | null` niche in `==`/`!=` (2026-11-20, lane IR4)

`operand type` was the only blocker for 7 self-compile functions at master 5463886d. Examples
are `mllDup[name] != true` and `mlvSet[name] == true` in the `moduleLocalLet*` family,
`moduleBindsLoopVar`, `canonOf` and `arrowSeedJoins`. In each, the left operand is a
`boolean | null` map read, held as the disc-2 niche: an i32 cell with `2` for null.
`operandWhy` refused it because `tyScalarBasePrim(boolean | null)` is null.

The corpus's `operand type` binary sites are a mix. A scratch-labelled seed split them:

| shape | count |
|---|---|
| `/ left box` | 34 |
| `== left box` | 13 |
| `== left nullable` | 9 |
| `+ left list` | 5 |

Only 2 of the 9 nullable compares are the bool niche (`d426nul_bool_eq`,
`d947_price_nulbool`), so this change covers those two plus the self rows.

## Legacy's route

Legacy writes these on its numeric tail, `emitBinNumeric`, as a plain `i32.eq`/`i32.ne` of the
two i32 cells. The disassembly shows this for:

- a niche against a literal on either side;
- a niche against a bool variable;
- a niche against another niche.

None of `emitBinExprNode`'s earlier arms takes them:

- `emitScalarMapReadEq` declines a bool map, whose read is the niche, not a probe box;
- no null literal, union, atom, string or list compare applies;
- no struct, variant or closure compare applies.

## What changed

- **`eqNumericRouteOf` (wasmEmit) answers whether legacy's ladder reaches the numeric tail for a
  `==`/`!=` node.** It is built beside `listEqRouteOf`; the two share `binEqPastLeadArms`, which
  is `listEqRouteOf`'s former prefix, unchanged. It adds four checks: no dead null test, no list
  compare arm, no null test, and no struct, variant or closure compare.
- **The builder asks that route.** `nicheBoolEq` then builds both operands and requires each to be
  `boolean` or the niche, with at least one niche. A `null` literal never reaches it, because it
  leaves the route.
- **`primSig` admits the pair for eq/ne only.** Its rule: "eq/ne compares the i32 cells of a
  bool and a `boolean | null` niche; the null sentinel 2 equals only null". This is an
  admission, not a no-code view Rhs (IR-REV).
- **`primOp` lowers a niche operand at `bool`**: `i32.eq`/`i32.ne`, legacy's bytes.

## Grading

Fixpoint seeds at merge-base 6aa68d8eb against the head.

| | base | head |
|---|---|---|
| self covered = matched | 18,972 | 18,977 |
| self `operand type` | 9 | 4 |
| corpus covered / matched | 95,601 / 95,587 | 95,605 / 95,591 |
| corpus `operand type` | 269 | 264 |

- **The census's 7 sole-blocker functions yield +5 covered.** The others reach later blockers.
- **Unchanged rows:** the verifier-fail and claimable-unmatched rows are the same 15 on both
  sides.
- **Witness: tests/cases/unions/nullable-bool-map-read-compared.vl.** It covers:
  - a literal on either side;
  - a bool variable;
  - a niche against a niche;
  - both operators, with present and missing keys.

  All 8 functions go from `operand type` to matched, and the program prints its `@log` lines
  under both seeds.

| bar | result |
|---|---|
| `ir-identity --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity --cases` | identical 7,536, differ 0; witnesses 59/59 |
| base-vs-head tests/cases A/B | 7,604 programs, 7,536 built, differ 0 |
| mode 3 | identical; 18,957 claimed (base 18,947) |
| L2 fuel, candidate vs base fixpoint | +0.042% (104,596,847,521 → 104,640,784,026) |
| plumb-shape cost | ok |
