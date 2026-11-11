# Step 7 inst: `monoReIsExpr` reads the instance's own `is`-test types, 2026-11-11

Lane w321, after #7204. `monoReIsExpr` re-parents an `is` test onto a rewritten operand. It copied
the shared node's `isVarTyIx` and `isPatTyIx`, which hold the last instance checked.

## Changed

- The elaboration now banks the tested type beside the pattern type: `elabCapIsNote(ix, tested,
  pat)` and `elabNodeIsTys`, read by `elabIsTyIn(ix, k)`.
- `monoReIsExpr` banks `elabIsTyIn` and `elabIsPatTyIn` at `elabWalkTop()` where they are closed,
  else the column.

## Measured

A scratch probe at `monoReIsExpr`, never refreshed into a seed, over all 7,732 `tests/cases`
programs:

| at the re-parented test | reaches | programs |
| --- | --- | --- |
| the instance's record equals the column | 261 | 75 |
| the column holds another instance's type | 24 | 8 |
| no record at the instance key | 3 | 1 |
| no instance key | 0 | 0 |

Every reach runs under an instance walk. Its four callers are `monoExprMake` (through
`monoExprRemake`'s pin passes), `monoCloneGenericCallsRaw`, `monoPinBinOps` and
`monoFoldLayoutAt`, all reached from `monoMakeInstanceBody*` after `elabWalkPush(ek)`. No caller
outside an instance walk reaches it in the corpus. The 24 differing reaches all sit on a
`T[]`-spelled test, which `monoSubstIsExpr` re-banks later in the same body. So the copy was
already overwritten. The 3 with no record are concrete tests in
`generics/generic-complement-list-union-positions.vl`, which keep the column.

## Proof

- **Bytes.** The 75 reaching programs, built with an L1 seed of master `24a4c87b` and with this
  candidate's, both from the same seed: 75 of 75 byte-identical.
- **Locally,** after merging master `b78a91c9`: one refresh. `cases_wasm` passes (7,440).
  `regress.vl` reports no runs lost. These pass: lint-self with its budgets, dead-export,
  render-parse, kind-ladder sets, `mono-tyaram-grid.sh`, `vl_probe_rollback_test.ts`
  (`elabCapIsTy` is classified), check-filed-witnesses `--strict`, seed-size (+0.5%) and
  late-demands (6).
