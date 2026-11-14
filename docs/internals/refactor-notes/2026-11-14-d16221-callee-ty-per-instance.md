# A literal slot's callee type is not given to a call two instances share (D16221), 2026-11-14

Lane B. One rule in the elaboration (`emit_elab.vl`), no mono arm, pin-helper count unchanged.

## What changed

`elabLitSlotCalleesAt` records, for each call a literal's open function slot reaches, the one type
the callee is called at (`elabCalleeTys`), keyed by the call node. A call inside a function built
at two or more elaboration instances, reached by a literal that lies outside that function, is
reached by other instances' values the scan does not see, so it now records `-2` (no one type)
there. `elabInstNodeTy` then reads the instance's own type. `elabDeclKeyCount` counts a
declaration's instances in `ekDecl`; `elabNodeWithinFn` exempts a literal inside the function.

The first cut had no exemption and lost D7202's and D15472's witnesses (runs → loud emit reject,
runs → check-clean invalid wasm): there the literal is copied into each instance and reaches that
instance's call alone. No distilled cell held either, so `regress.vl` passed; the three cells are
now the named set `d16221-callee-ty-per-instance`, and `regress.vl` on the first cut's seed exits 1.

## Evidence

- Fixpoint: the second `refresh-compiler.sh` is `cmp`-identical.
- `regress.vl` against master's fixpoint seed: no cell moves.
- `hole-fn-record-beside-lambda-record.matrix.vl`: `return_inferred` annotated SILENT → RUNS;
  0 runs → not-runs; 0 silent.
- Net compiler lines: see the PR.
