# The union label spelled from its type (D16032), 2026-11-14

Lane D. This closes D16032, the last of the step-7 carried rows that were not pure floors
(D16052 and D16025 before it).

## What changed

- `arenaEmitName` (emit_collect.vl) is `tyToNominalName(tyIx)`. The `canonEmitNameOfTy` re-parse
  is gone.
- `canonUnionMembersWalk` (check_program.vl) labels each member with `tyToNominalName(lt)`, not
  with `canonEmitNameAt` of that render.
- Deleted: `canonEmitNameOfTy`, `canonEmitName`, `canonTwinArmsShareRow`. The two
  `render-parse-floors.txt` entries those sites held (D16032, D16052) go with them, and so do
  `scripts/render-parse-census.vl`'s two list entries. The render-parse baseline drops to 4
  carried floors.
- D16032's checklist was already empty in the tree:
  - `memberUnionFieldName` (#7909);
  - `nulRefMapValInnerOfTy` (#7928);
  - `emitUnionCoerceUnder` (#7940);
  - the list-arm element readers (#7923);
  - `emitUnionConcreteNumCross` (#7869).

  The boxes are ticked with their PRs.

## Evidence

- I compared 19,769 programs (`tests/cases` plus distilled `cells/` and `named/`) under master's
  fixpoint seed and this one:
  - 15,086 build to the same bytes and 4,682 give the same refusal.
  - 1 differs: `tests/cases/maps/recursive-alias-declared-first.vl`. Its type section is
    renumbered, and every output line is identical.
  - 0 `runs → not-runs`.
- The member walk's half alone is byte-identical over the population. The one mover comes from
  `arenaEmitName`.
- The seed reaches a fixpoint (`cmp`).
