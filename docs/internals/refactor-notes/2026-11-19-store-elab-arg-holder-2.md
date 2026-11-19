# STORE: a holder of the callee's own type parameter is keyed and planned at the set (2026-11-19)

This follows #9102, which made `elabCallArgSetTy` key an argument holding a tagged set at any depth.
F2 found two gaps on the D14433 combined tree; both are fixed here.

1. **The demand side.** `elabCallArgSetTy` returned -1 before the holder test for any annotated
   parameter other than a bare type parameter (`fnTagOwnTyParamJoins`), so `pick<V>(m: {[string]: V})`
   was never keyed at the set. The guard now also admits a parameter whose declared type holds one of
   the callee's own type parameters as a list element, map value or record field
   (`elabTyHoldsOwnTyParam`, an exhaustive match over a visited set).
2. **The plan side.** `elabSetArgBind` kept the check's closed binding for such a parameter
   (`callAt|V=(i32) => i32` planned, `callAt|V=Fn#6#13` demanded, D17014). A new arm binds the
   callee's type parameters by walking the declared type against an argument that holds a tagged set
   (`bindGenWalk`), taking only the bindings that are tagged sets.

## Measured (master fixpoint vs this branch's fixpoint)
- Late tag rows: unchanged (307).
- Late demands: 10 → 9. `functions/hole-lambda-listed-handed-to-generic-list-param.vl` is now
  planned at the key it is demanded at (its `V[]` parameter). The baseline is lowered here.
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B: see the PR.
