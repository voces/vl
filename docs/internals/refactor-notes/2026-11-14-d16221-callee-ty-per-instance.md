# A literal slot's callee type is not given to a call two instances share (D16221), 2026-11-14

Lane B. One rule in the elaboration (`emit_elab.vl`), no mono arm, pin-helper count unchanged.

## What changed

`elabLitSlotCalleesAt` records, for each call a literal's open function slot reaches, the one type
the callee is called at (`elabCalleeTys`), keyed by the call node. A call inside a function built
at two or more elaboration instances is reached by other instances' values the scan does not see,
so it now records `-2` (no one type) there. `elabInstNodeTy` then reads the instance's own type.
`elabDeclKeyCount` counts a declaration's instances in `ekDecl`.

## Evidence

- Fixpoint: the second `refresh-compiler.sh` is `cmp`-identical.
- `regress.vl` against master's fixpoint seed: no cell moves.
- `hole-fn-record-beside-lambda-record.matrix.vl`: `return_inferred` annotated SILENT → RUNS;
  0 runs → not-runs; 0 silent.
- Net compiler lines +13 (+15 / −2).
