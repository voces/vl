## Type system (Track A)

- **A parameter declared as a holder of its callee's own type parameter, handed a holder of a tagged set, is keyed and planned at the set:** `elabCallArgSetTy`'s guard admits a parameter whose declared type holds one of the callee's type parameters as a list element, map value or record field (`elabTyHoldsOwnTyParam`), and `elabSetArgBind` binds that parameter to the set at plan time, so the plan and the demand agree (D14433, D17014); one late demand falls (10 → 9).
