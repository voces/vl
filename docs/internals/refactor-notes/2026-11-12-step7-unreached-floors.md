# Step 7: the floor audit's unreached sites, deleted or re-graded, 2026-11-12

Closing census 5's floor audit listed some floors with no witness. Each was measured on master
`16dd6059` with a trap probe built into scratch and swept over the population: 24,189 programs.

## Deleted: two loud floors whose callers already refuse

- **`variantNestedShapeOkTy`** (emit_shape_intern.vl). It was an `emitFail` that answered `false`.
  Its two callers in `collectU` fall to their own refusal when the field code is `< 0`, so the
  floor only wrote a second message. Its message appears in none of the 24,189 programs.
- **`litStrMembersOutsideBox`** (wasmEmit.vl). It was an `emitFail` that answered `false`, so its
  branch in `emitIs` never ran. The next line refuses with `emitFailNoMembershipRecv()`. Its
  message appears in none of the 24,189 programs.

## Kept, as assertions and not floors

These four guard an invariant, and deleting each would turn a loud failure into a silent answer:

| site | why it stays |
| --- | --- |
| `emitIs`'s literal-union string-tag test | soundness: a box's string-tag test would answer true for a string outside the literal union |
| `nliHoleHasType` | the checker's contract: every un-annotated `let x = null` is filled or closed before emit |
| `nameFieldCodeTy`'s no-rung failure | a ladder over a closed set names what it excludes (CLAUDE.md, the ladder rule); without it, -1 |
| `funcTypeShapeLowerable`'s uncoded field | the same rule |

A census counts them as assertions, not as floors.

## Re-graded: the `clo:` key is reached, and `cloSigPosBy` is keyed by reps

The registry census (`2026-11-12-step7-registries-and-equality.md`) said that no program reaches
`cloSigPosBy`'s readers. A trap probe on each says otherwise:

- `cloSigPosOfKey`, `cloSigPosBy`'s reader, is reached by **7,338** programs.
- `cloSigNameOfTy`, the `clo:` render, is reached by **495**.

`cloSigPosBy` is keyed by a `$fnsig` key that `sigKeyOfTyGo` builds from `repSigTokOfTy` tokens.
That is a rep key by construction, not a type's spelling. So it is not a spelling-keyed registry,
and the census's spelling-keyed count falls from 6 to 5. `cloSigNameOfTy` stays a render floor,
since the render is the closure slot's name. Its witness runs.

## Witnesses named for the passing render floors

| floor | programs reaching it (cases) | witness |
| --- | --- | --- |
| `synthTypeRefOfTy` | 378 | `tests/cases/arrays/map-returning-list-runs.vl` |
| `lvSpellOf` | 41 | `tests/cases/closures/capture-module-value-block-local.vl` |
| `cloSigNameOfTy` | 241 | `tests/cases/closures/alias-is-closure-arm-three-arm-union-call.vl` |
| `rowDumpBuild` (a dump, a diagnostic label) | — | `tests/vl_row_classes_test.ts` |

All three cases run on master.

## Proof

- **Sweep:** both sides on fixpoint seeds (base `16dd6059`), 24,189 programs. All 24,189 were the
  same: 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- **Gates:** two refreshes were byte-identical, and `lint-self.sh` is clean.
