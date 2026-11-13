# Step 7, lane H: `variantNestedRow` restored, 2026-11-13

#7679 made `variantNestedRow` (`wasmEmit`) find a variant's nested-record row by type
(`uFieldTgtStructIdx`), with a loud floor in place of the unreached second spelling intern.
#7686 (squash `3fc49ea5`) reverted that hunk silently: a whole-file `--ours` conflict
resolution on its branch brought back the `sFieldElemName` read, the
`internInlineShapeTy(nm, …)` fallback and the two imports. Lane A confirmed that this was the
only hunk lost.

This PR re-applies #7679's `wasmEmit.vl` diff unchanged. The function body is identical to
#7679's, and the `internInlineShapeTy` and `uFieldElemTyIxRow` imports are gone again.

**Measurement:** sweep (`sweep.vl diff`, master `20722318` against this, fixpoint seeds on both
sides): see the PR.
