# Fix D17052: `x is S[]` over `i32[] | string[]` (2026-11-22, lane IR-N1)

A legacy fix, graded under Q15. A string literal set's list `S[]` stores its atoms as an `i32` list.
Where no union mixes an atom list (`vbAtomListUsed` false), `isArmTagOfTy(S[])` is the plain `i32[]`
tag. In `listIsAcrossRepsPlan` an `i32[]` arm then shared `S[]`'s tag, `listArmSharedTagFit` gave 0,
and the plan declined. The arm-tag rung answered by that tag: every `i32[]` value fit `S[]`, and the
`string[]` arm was never tested, so `["b", "a"]` did not fit.

## What landed

- `listArmTagCollides(a, chk)`: `chk`'s leaf is a string literal union and `a`'s no literal union.
  Such an arm never fits (D16047), so the plan skips it and still answers (`collide`), and the
  `string[]` arm is tested by its strings.
- `tests/cases/unions/is-string-literal-list-over-int-list-arm.vl`, the witness and its neighbours.
- 24 capability-matrix templates, `scripts/capability-probes/matrix/is-list-<L>-over-<X>-<Y>-*`:
  `is L[]` with `L` one of `S`, `K` and `string`, over `X[] | Y[]` with `X` its superset (`string`,
  `i32`, `string | null`) and `Y` each of `i32`, `f64`, `string`, the atom set, a record and the
  nullable. A float literal set is no type, so `f64` appears only as `Y`.

## Readings

Fixpoint seeds of this branch and of master `8c6f1dde`.

- **Moved programs:** `tests/cases` A/B same 8,744, differ 1, the new witness. Its bytes and its
  output move (master `true false true false false true`, here `false true false false true false`).
- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical; `--cases`
  identical 7,631, fail under both 68, differ 0, witnesses same 62; `--claimless` identical
  14,023, fail under both 3,267, differ 0.
- **Distilled corpus:** no runs lost.
- **Matrix:** the two `s-over-string-i32` templates run 0 of 64 on master and 64 of 64 here.
  Twenty-one others run 64 of 64 on both, and `runs -> not-runs` is 0 everywhere.
  `s-over-string-nullable-other` is D17053's open cell, 0 of 64 on both.
- **Armed shadow:** the witness's `is S[]` function and start body now take the `listAcross` rung
  where they took the arm tag. That rung is a named miss until #9603 builds it: covered 69,584 →
  69,583, start 6,073 → 6,072.
- **Order check (mode 6):** 0 order rows over 21,049 programs. **Stack margin:** 960 and 940 KB
  pass, 920 KB fails, on both. **Fuel:** L2 +0.00%.
