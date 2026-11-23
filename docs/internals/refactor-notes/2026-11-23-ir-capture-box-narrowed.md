# IR: a narrowed union-box capture, 2026-11-23

Lane IR-N4. Base: master b03c57be. One of `capture binding`'s five shapes (the nullable literal
union, `tests/cases/match/litunion-nullable-literal-before-null.vl`).

## Change

A box local narrowed to a smaller union reads as `RStage` at the narrower box rep: the same box, no
bytes (`narrowedLocalRead`, `boxNarrowArmOf`'s `box` arm, local arm only). A capture's read is
legacy's `capture` arm (`emitCapturedRead`), which writes the env read or the lifted parameter's
read and no conversion. `captureRead` had no such arm and missed.

`captureRead` now reads such a capture at its own rep and binding type, and stages it at the read's
rep, in the env and the lifted form. The case needs:
- both reps boxes (`heldAsBox`);
- the read on the `capture` arm;
- the checker to have narrowed the read out of the capture's storage (`readNarrowedTyAt`).

A wider or unrelated union is not a spelling a variable read can have, so the guard states the
narrowing rather than relying on it. `narrowed` stays the nullable arm (`T | null` read at `T`), so
the two never take one read twice.

## Predicates and their legacy callers (R8)

| predicate | callers |
| --- | --- |
| `heldAsBox`, `identReadArmOf` (`capture`) | `emitCapturedRead`, legacy's capture arm |
| `readNarrowedTyAt` | legacy's narrowed-read classifiers (`emit_capture_frames.vl`, `emit_classify.vl`) |

## Legacy tails the IR calls

- None new.

## Witnesses and readings

`tests/ir-shadow-rows/capture-box-narrowed.vl` reads a `"a" | i32 | null` capture narrowed to
`i32 | null` in a closure, a lifted function, a nested closure and as a returned value. Master
leaves four functions on `capture binding`; this branch matches all nine and the start, with the
same output and bytes.

Fixpoint seeds on both sides, master b03c57be against this branch, `VL_STD` the tree's:

- tests/cases: `capture binding` functions 7 → 6; matched 79053 → 79054; 0 fail or mismatch rows
  on both.
- Self-compile: 20378 covered, matched and claimed on both; modes 1, 3 and 5 build the plain bytes,
  the same as master's.
- `ir-identity --names`: differ 0, self-compile identical. `--claimless`: identical 14047, differ 0.
  `--cases`: identical 7722, fail under both 68, differ 0; witnesses same 61, differ 0.
- tests/cases legacy A/B: identical 7435, fail under both 67, differ 0; nothing moved.
- Order check (mode 6): 0 order rows over the distilled corpus and over tests/cases.
- `self-ir-misses`: 0 missed. Deep nesting: 8 passed; the labelled-loop margin passes at 910 KB and
  fails at 900, as master's seed does. `phase state` holds: the narrowing test reads
  `readNarrowedTyAt`, which the builder already imports, not a checker symbol.
- Fuel: L2 121646442087 on both.
