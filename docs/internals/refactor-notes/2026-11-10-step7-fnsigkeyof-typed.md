# Step 7: `fnSigKeyOf` keys a lifted function by its typed signature, 2026-11-10

Group 5 of `2026-11-09-step7-classifiers-remaining.md`. Base is master `797c12b5` (#7067), whose
fixpoint seed is 6,601,425 bytes. Counts are post-mono calls over the 23,837-program sweep
population (`classifier-census.vl`), from shadow rounds beside the legacy key.

`fnSigKeyOf(fe)` built the value-ABI `$fnsig` key from each parameter's annotation kind
(`cloParamTok`) and the return columns (`cloRetValKind`). Both default an open type to `i32`
without saying why. The typed key is each parameter type's `repSigTokOfTy`, then the result's,
kept only for an `i32` or `f64` result. Each shadow round added the fact the last one lacked:

| round | twin | agree | miss |
| --- | --- | --- | --- |
| 1 | the function node's recorded type, `sigKeyOfTy` | 112,844 | 118,935 |
| 2 | per parameter: its annotation's type at the instance (`instanceTyOf`); the recorded result (`cloRetResultTy`) | 220,550 | 11,229 |
| 3 | an instance's un-annotated parameter copy reads the template parameter's type (`nodeSrc`); a variable no instance binds takes `elabUnboundTpTy`, an open function `elabHoleFnClosed`, as `frsColsOfTy` lowers them | 231,017 | 762 |
| 4 | a tagged set's function type rides its id (`fnTagTyIsTagged`), as a parameter and as a result | 231,754 | 25 |

A result outside the value ABI counts as agreeing when both sides answer "". Round 4's 25 calls
are in 10 files:

* a record parameter whose row the function-field widening moved (D15333,
  `if-arm-records-written-into-fn-widened-place-runs.vl` and two siblings);
* a list of records holding a function list, which has no typed token (`d15203_run_param.vl`,
  `list-of-untagged-records-returned-beside-a-called-set-runs.vl`);
* a result legacy keys `i32` whose type is a variant, a record or a list of function lists
  (D14082, D14782 and `d15270_generic_mk.vl`);
* `__trap__` as a `() => never` value (`checker-special-intrinsic-as-value.vl`).

The missing fact group 5 named, the instance of a generic function value, turned out to be two
facts the emitter already has. A template lowered in place (its pin is the unbound default)
answers through `elabUnboundTpTy`, and a set of function values is a tagged id. No checker change
was needed.

## Switched

`fnSigKeyOf` is the typed key, and the legacy body is deleted. It reads the arena, so it leaves the
probe set. `cloSigKeyExt`'s extended spine still reads `cloParamTok`.

**Graded by wasm.** All 7,064 files that reach `fnSigKeyOf` were built by the base fixpoint and by
the candidate:

| result | files |
| --- | --- |
| byte-identical | 7,001 |
| the same refusal | 61 |
| different wasm, same output | 2 |

* `std/array-litunion-list-needle.vl` loses one of two identical functypes that no function uses
  (−9 bytes).
* In `intrinsics/checker-special-intrinsic-as-value.vl`, the call through `t0: () => never =
  __trap__` now names its callee's own functype. Legacy keyed the callee `>i` and the call site
  `>v`, a `call_indirect` mismatch behind a branch the program does not take (−4 bytes).

## Census (`classifier-census.vl`)

| tree | probed |
| --- | --- |
| base `797c12b5` | 18 |
| this PR | 17 |

`fnSigKeyOf` (231,779 calls in 7,064 files) leaves the probe set.

**Proof.** The fixpoint seed is 6,601,907 bytes (+482). Two `refresh-compiler.sh` runs are
byte-identical.

* The 7,064 reached files against the base's fixpoint: the table above.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.2%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`, `vl_scaling_shape`:
  7,502 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,686 as filed, 0 moved, 0 output mismatch.
