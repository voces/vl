## Type system (Track A)

- **A coerce target's scalar membership and a union's `null` membership read the member set, not a parse of its spelling (step 7).** `emitUnionCoerceValueAtom` asks `msHasPlainValKind` of the target's set, and `unionSetHasNullTy` answers from the held type. Its name rung is unreached and deleted.
