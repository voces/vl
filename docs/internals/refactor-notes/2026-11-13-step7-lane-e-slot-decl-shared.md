# Step 7: the union key licence and `unionArmsAllSame` share one declaration test, 2026-11-13

This is lane E's follow-up to #7787 and lane G's #7788. Both PRs asked whether two record types
under one shape are one declaration: G's `armDeclSame` (emit_rep), for `unionArmsAllSame`, and
lane E's `variantSlotSame` (emit_union_registry), for the licence's variant slice compare
(D1492). G's #7788 kept `armDeclSame` file-private, since an export with no reader fails
`dead-exports`. This PR exports it, and `variantSlotSame` becomes `tySame` plus `armDeclSame`.

The two tests partition alike: `structNameOfTy` reads `cStructFirstPos`, as `armDeclPos` does,
and both compare `nomNameOfTy`. Two undeclared types answer "same" in both. The licence compare is
unreached today (a forced-false scan of `tests/cases` under `VL_REP_SHADOW` found no two rows
sharing a type key, #7787's note).

## Proof

- Refresh ×2: fixpoint.
- `vl_union_key_licence_test`: green.
- `scripts/gate.sh`: all rows pass.
