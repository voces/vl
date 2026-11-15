# D16331: a returned lambda takes the result its function's calls are delivered at

2026-11-15, lane I. Bucket (f), an extension of lane K's `lamRet` pin phase (D16310). A lambda
delivered to a closed function type takes that type's result as its annotation. A lambda an
un-annotated function `d` returns reaches the type only through `d`'s inferred result, so it had
no contextual result. The delivery `const v: () => { z: f64[] | i32 } = d()` built a
function-value adapter, whose record conversion the covariant-write rule refused at the lambda.

- `callFnDst` (`check_expected.vl`): per call, the closed function type `seedExpected` delivers it
  into outside a guess, `-2` once two disagree. `callDstTy` is not that: later deliveries
  overwrite it, the adapter's parameter among them.
- `lamRetFromCalls` (`check_fn_decl.vl`), at the start of `lamRetApply`: for such a call to a
  top-level `d` that is neither exported nor annotated, where every use of `d` is a call noted at
  the same type (a call an adapter wraps is noted at the adapter, `fvaAdaptedArg`), each lambda
  `d` returns, its tail included, is queued at that type's result. When any is queued, the
  adapters over `d`'s calls are undone, since the re-checked delivery is exact.
- Every other caller of `d` sees the type it asked for, so a second caller un-annotated or
  delivered at another type keeps the refusal. Changing the covariant-write walk alone does not
  help: past it, the record storage rule refuses the adapter's result, which is not fresh.

Measured on fixpoint seeds (master `b1c8cb00e` vs this branch):

- `lambda-result-at-delivered-result.matrix.vl`: `return_inferred` annotated check reject → RUNS,
  68 of 68; the 15 `fn-value-lambda-result-*` and two `hole-lambda-returned-*` templates: runs →
  not-runs 0, silent 0.
- Named set `d16331-returned-lambda-delivered`, 12 cells, all `runs` (10 refused on master).
- Pin helpers (`emit_mono.vl`): 908 → 908.
