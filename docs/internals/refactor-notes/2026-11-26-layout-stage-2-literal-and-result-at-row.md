# Layout family stage 2: an object literal and its function's result at the row (2026-11-26, lane COV-START)

Stage 2 of the row-rep-versus-legacy-layout family (DECISIONS.md, "A value's IR rep follows its
storage"). It deletes stage 1's two exclusions:
- an object literal no longer stays at its own rep;
- a value whose rep retags into the row no longer keeps its rep.

A built record is now held at its storage row's rep. A function's result is held at the row legacy
declares it at. This is the production half. The read conversions (irConvert case (e),
record → record) build on COV-CALL's irConvert slice 2 and follow in their own PR.

## What deleting the exclusions cost, and the fix

With both exclusions gone and nothing else changed, the armed census over tests/cases lost 5
functions to verifier rule 2 (97,525 verified → 97,520) and none to coverage. The 5 functions:
- `mk2`, `heap-kid-row-field.vl`;
- `mk3` and `mk5`, `hole-fn-field-called-off-a-maker-call.vl`;
- `mk5`, `hole-fn-in-nested-maker-record-read-inline.vl`;
- `deep`, `hole-maker-nested-literal-rows-positions.vl`.

Each is a maker returning record literals nested around a function parameter. The inner literals
moved to their rows, which hold the function as the row's closure. The outermost literal and the
function's result stayed at the result type's rep, which nests the type-level records. The retag
between them crosses rows laid out apart.

Legacy returns the outer row (`(ref $1)` in `heap-kid-row-field.vl`, fields reordered `n` first).
Two places refused that row:
- `retDeclRowTy` declined whenever the result type's struct row is the declared row, comparing row
  identity rather than rep. It now declines only where the row's type and the result type are held
  at the same rep.
- These makers carry an elaborated result annotation, so `resultTy` took the annotated arm, which
  never asked for the row. Both arms now ask `retDeclRowTy`.

A row whose recorded type is open only where it stores closed (`rowTyBuildsAt`, the test `objLit`
already builds by) now counts as a storage row, both in `builtStoredTy` and for the result.

## Measured

Master `47cbeeef6`'s seed against this tree's, both built by the same seed.
- **Armed census, tests/cases:**
  - functions covered: 97,525 → 97,528;
  - verified: 97,525 → 97,528;
  - matched: 97,256 → 97,259;
  - no verifier failure and no new mismatch class.
- **tests/cases, per program:** PERPROGRAM
- **Family programs** (the 33 of this lane's and regen-9's lists still in tests/cases):
  - `closures/if-arm-records-written-into-fn-widened-place-runs.vl`: start `ref if arm rep` → covered;
  - `records/intersection-recursive-twin-row-retag-positions.vl`: one function `ref if arm rep` → covered;
  - nothing newly missed.
- **Claims mode (`--claims`, shipped):** no claim falls back.
- **`distilled/regress.vl`:** no runs lost.
- **Capability probes:** 281 of 282 run on both seeds; `--live-sites` 0 on both.
- **D17131, D17361, D17362:** print `6` on both seeds and still miss `object field coercion`. That
  is the record → record read conversion, case (e), which is the follow-up.
- **Sweep:** `tests/cases/records/maker-nested-literals-at-their-rows-positions.vl`. A maker's
  nested literals at their rows, read off a binding, an argument, a list element, an `if` arm,
  another literal's field, a relayed call, and a four-deep nest. It is covered on both seeds and
  prints the same; it guards the positions the exclusions used to keep.
