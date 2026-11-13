# Step 7 D6: a union arm's record field interns its row from the field's element type, 2026-11-13

Census 5 lists item 4 of D6: `armFieldStructRowMinted` (`emit_collect.vl`) interned the struct row
that a union-variant record field stores. It did so through `internInlineShapeTy`, keyed by the
field's element name `sFieldElemName[ufn]`, with the field's element type as a hint.

It now interns with `internShapeDeepTy(uFieldElemTyIxRow(ufn))`, keyed by the type alone. The
field is still relabelled with the interned row's name: a row handle, as lane F agreed.

Lane F's dedicated type-only intern is not on master yet. F agreed to `internShapeDeepTy`, with
this table as the condition. F also flagged one case: a type already on the walk stack is
re-entered under its render key, so a self-reaching type gets the outer walk's row.

## Measured

A probe compared the two interns at the call. It ran `internShapeDeepTy` first, as the new code
does, then the old named intern, over 24,070 programs.

- **Reach:** the minter is reached at 1 decision, in 1 program:
  `closures/closure-nullable-union-field-struct-elem-array-result.vl`.
- **Agreement:** the two interns return the same row there.
- **Re-entry:** the probe did not separate F's case. With the one reaching decision agreeing, no
  program in the population is shown to differ through it; the CI sweep covers the rest.

That program and 60 programs under `tests/cases/unions/` were built with a base compiler and
with this cut's. All 61 are byte-identical.

## Counts

- `internInlineShapeTy` in `emit_collect.vl`: 1 → 0.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - `scripts/gate.sh`: all gates pass.
- **CI's sweep** should report no movers.
