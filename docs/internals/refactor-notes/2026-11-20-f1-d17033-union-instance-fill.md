# D17033: a generic union instance filled at emit time keeps the emit epoch (2026-11-20)

Mono's `synthTypeRefTy` can apply a generic union alias at a new argument while emit runs
(`tyTsExact` → `tsToTy` → `applyGenAliasTys`). `applyGenAliasTys` mints the placeholder inside
`tyFreshBegin` and fills it there. Its record arm bumps the epochs naming that fresh row. Its union
arm fills through `fillUnionDeclMembers`, whose `tyMutBump(-1, -1)` named no row, so the emit epoch
moved and `emitProgram`'s window check refused a check-clean program.

## Change

- `fillUnionDeclMembers` takes the row it fills. It bumps `tyMayReachSelf(row) ? -1 : row`, which
  is the record arm's rule.
- The declaration caller passes -1. Its 0a placeholder was minted outside any fresh scope, so that
  path is unchanged, and the declaration fills skip the reach walk.

## Family

F2's witness and STORE's program trapped at the same `tyMutBump` call, under the same stack, in an
instrumented probe seed (since reverted). Both run with this one change.

F2's third spelling, a generic body that reads its annotated union, fails at
`mAssignUnionHeaps` on both seeds. It is filed as D17035.

## Readings

Measured against a fixpoint at the merge-base 48a54c094 (6,927,989 bytes). The candidate is also a
fixpoint (6,928,005 bytes).

- `tests/cases` A/B: 7,261 same, 0 differ. The one RC move, 1 → 0, is this PR's pin.
- Corpus `ir-identity --names`: 9,037 identical, 0 differ; self-compile identical.
- `--cases`: 7,542 identical, 0 differ. Witnesses: 59 same. Mode-3 self-compile identical.
- Self-compile covered and matched: 19,044 on both. Corpus covered: 41,774 on both.
- `check-filed-witnesses`: 5,545 as filed, 0 MOVED.
- L2 self-compile fuel 104,623,927,445 → 104,633,360,309 (+0.009%). Late demands 9 of 9; late tag
  rows 307 of 307; phase-state ok.
