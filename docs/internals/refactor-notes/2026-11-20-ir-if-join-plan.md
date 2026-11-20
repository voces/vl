# IR decision modules 4: a value `if`'s join (2026-11-20, lane IR6)

§10.1(a) stage 3, the control step. `emitIfExpr` classified a value `if`'s join by a ladder
(an optional guard; all-null; an atom join; a union box with a render name; a reference join;
else a scalar valtype, with a string join that drops a `null` atom refused), and
`ifExprPlainWhy`, which the IR's value `if` reads, restated it. The two were held together by
an armed agreement check, `ifExprPlainKind` against `emitIfExpr`'s every exit.

## The shared plan

`emit_plan_if_join.vl` is a new decision module:
- `ifJoinPlanOf(ifIx, fnIx): IfJoinPlan` is the ladder past the guard, its arm
  (`null | atom | union | ref | scalar`) with the union's name, the `RefJoin` and the valtype;
  `ifJoinDropsNulAtom(ifIx, fnIx, arm)` is the refusal's test;
- `emitIfExpr` asks the guard, opens the arms' prelude scope, asks the plan, pops, asks the
  refusal, then is an exhaustive `match` on the arm;
- `ifExprPlainWhy` keeps its own terms and maps the arm to its old miss names (`null join`,
  `atom join`, `union`, `ref <kind>`, `string drops null atom`), so the census's blocker classes
  are unchanged. It still misses any union join, as before, though legacy takes one with no
  render name down the later rungs;
- `ifPlainDisagrees` and `ifExprPlainKind` are deleted: with one plan there is nothing to
  disagree;
- the join's helpers move with it (`ifRefJoinOf`, `noRefJoin`, `nulStrJoinTakesAtom` and its
  leaf tests, `strJoinDropsNulAtom`, `deliveredAsNulAtom` and its two place tests);
  `tyRepsAsNulAtom` and its memo move to `emit_rep.vl` beside `repOfTy`, reset at the same point
  through `nulAtomTyMemoReset`;
- `IfJoinArm` is registered in `lint.vl`'s closed sets, and `ijArm` in its field table.

## Lines

| | lines |
|---|---|
| compiler | +307, −249 |
| `wasmEmit.vl` | +46, −233 |
| moved, not deleted | about 140 (the join helpers, `tyRepsAsNulAtom` and its memo) |
| deleted | the armed check and `ifExprPlainKind` (14), the ladder's two copies, about 70, for a plan of about 45 |
| new module overhead | its imports and header, about 40 |
