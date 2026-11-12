# D15959: a function-value call's emit refusal names its type, 2026-11-12

The step-7 floor audit (closing census 5) found the defect. `cloCallSigRejectWhat` is a
render-parse floor: a refusal's message renders a type for a person. In both of its witnesses it
rendered the type as nothing: "parameter 1 of type `` has no representation in the function-value
ABI".

**Mechanism.** It rendered with `tyToEmitName`, the emitter's spelling, which has no name for a
type variable or an inference hole. The message is output for a person, so it now renders with the
checker's `tyToStr`. That names `T` in `objects/error-record-field-of-generic-called-under-shadowing-name.vl`
and `_` in D15776's witness, as the checker's diagnostics do.

**Effect.**
- The four renders leave the render-parse ratchet, which reads 9 renders after the merge (see the baseline for parses).
  `--write-baseline` was run in this PR.
- The refusal itself stands: it is a clause-2 site with its own rows.
- D15776's quoted message is updated to the new text.

**Proof.**
- Both witnesses print the named type.
- Fixpoint: two refreshes produce byte-identical seeds.
- `lint-self.sh` is clean, `regress.vl` lost no runs, and `check-filed-witnesses --strict` grades
  both inventories as filed.
