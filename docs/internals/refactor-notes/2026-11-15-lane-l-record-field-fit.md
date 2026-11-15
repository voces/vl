# A record `is` narrowing a non-literal field, D16324 — 2026-11-15

Lane L, from the `--sites` ZERO rows in the union and narrowing area. Of the seven, only
`emitRecordFitIs` (wasmEmit.vl) was reached by a witness; the probe
`record-is-test-narrows-non-literal-field.vl` names it.

## What moved

- **One content check per narrowed field.** `recFieldFitBuild` (check_annot_resolve.vl) mints
  `{ const $rf = x; $rf.f is F && ... }` for a record test the shared predicate answers partly,
  each field whose members `F` does not all cover tested at `F`. A nested record recurses through
  its own minted check, so the literal-set case is a case of it for a concrete operand.
- **The union arm drops its literal-set gate.** `recPartFitArm` takes any partly fitting arm,
  so `A | C` and `A | null`, `match` and the union cast reach the same check.
- **The record cast.** `castRecordFitAt` takes any partial fit; a cast whose hit is its own
  operand binds the hit before the test, which would otherwise narrow it for reads only.

## What did not move

- The emitter's literal-set lowering stays: a generic or un-annotated operand gets no minted
  check (a type variable), and that lowering is what runs it today. Deleting it regresses the
  generic literal-set spelling; D16325 files the non-literal one.

## Evidence

- Matrices `--before` the master fixpoint, no cell ran before in any of them:
  `record-is-narrows-union-field` 62 of 64 run, `record-cast-narrows-union-field` 64 of 64,
  `record-match-narrows-union-field` 46 of 46; 0 runs → not-runs, 0 silent. The two refused
  `is` cells (un-annotated `argument` and `early_return_guard`) are D16325's.
- Probes 238 of 241 run before, 240 of 242 after.
- Net compiler lines +52 (70 added, 18 removed); emit_mono.vl unchanged at 908.
