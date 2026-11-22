# IR: a binding holding a returned bundle record (2026-11-22, lane IR-D1)

`open local type` was the largest open-type class on master 56a40ede: 83 tests/cases functions
in 35 files. Nearly all of them are a local holding a bundle record a function returned (the
D15144 holder), or a copy of one.

## The change

- `holderRecordTy(d, fnIx)` (emit_classify.vl) is split out of `holderRecordRow`: the record
  type mono minted for the holder's signatures. Legacy's `letCellKindGo` makes such a binding
  `struct` at that row.
  - The IR's `irBDeclVar` takes it as the variable's type.
  - `exprTyOf` takes it for a read of the binding (`emitHolderRead`).
- A direct call whose checked type is open takes its callee's result type (`resultTy`).
- `fnRetHeldAsBundle(fe, r)` (emit_classify.vl) is split out of `fn_ret_shadow`'s and
  `cloRetKeySuffix`'s closure-kind test. `resultTy` asks it for the recorded or checked result in
  place of `irTyOpen`, so legacy and the IR answer one question once (the queue's PRE-REVIEW).
- No new node kind, and no verifier change.

The measurements are in the PR body.
