## Codegen, memory & runtime (Track B)

- **IR claims a call of a top-level lambda returning a bundle record:** the closure is called at the lambda's own signature, and the member the call's use takes is picked from the returned record, as legacy's `emitBundleResultPick` follows the call. `call of a non-declaration: top-level lambda record` falls 5 → 0: `closures/hole-lambda-bundle-returned-from-top-level-lambda.vl` (`@start`, `back`, `two`), the distilled `bundle_copy_closure_returned` cell and D15744's witness are fully claimed. Claimed and claims-off builds are byte-identical.
