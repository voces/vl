# IR coverage: a box's null test and a seated box read on the `??` desugar; a non-atom string part at any rep (2026-11-24, lane IR-N7)

| Mechanism | Change | blocker class, tests/cases functions, before → after |
|---|---|---|
| narrowed read | `nulTestOperand`'s `boxTag` arm reads any operand but #9798's narrowed union-box global at its cell (`exprAt`), and `narrowedLocalRead` returns a seated read of a box cell on the plain `local` arm as it stands (`heldAsBox`), as legacy's D3172 desugar of `x ?? d` tests and copies the box | `narrowed read` 35 → 29 (8 leave; 2 arrive from the atom route) |
| string atom part route (direction A) | `buildStrBin` refuses only an atom-literal part whose rep is no atom; a part that is not `exprIsLitAtom` is built by `irBExpr` whatever its type's rep, as legacy's `emitStrValue` sends it to `emitExpr`, and the existing `string operand coercion` check still refuses one not built as a string | `string atom part route` 24 → 8 (13 to none, 2 to `narrowed read`, 1 to `member record`, 1 from `atom tower place + string atom part route` to `atom tower place + index element coercion`); `string operand coercion` 2 → 2 |

Witness: `tests/cases/literal-unions/atom-part-concat-positions.vl`. A literal-union value is
joined into a string after being narrowed out of a mixed box, bound plainly, or passed as a
parameter, on the left and right of `+` and in an interpolation; each prints its member string,
and every function is matched on head.

The 8 left in `string atom part route` are direction B (an atom-literal part whose rep is a
string, e.g. `is string` over `1 | 2 | "s"`), pre-reviewed separately. One function moves on to
`member record` (`useA` in `unions/layout-family-literal-set-beside-string.vl`, `"useA " + a.kind`),
which is lane IR-N8's class.

## Measured

Fixpoint seeds: master 86dd79148 and head dea56f25f (after merging master; the `nulTest` conflict
with #9798's `nulTestOperand` was resolved by hand, so the whole proof was re-run).
- tests/cases functions with no blocker: 79,586 → 79,606; covered = verified = matched (79,582 → 79,602).
- Corpus: 46,798 covered = verified = matched, unchanged.
- Self-compile 20,495, unchanged; self ir misses 0. L2 fuel +0.00% per PR; late demands 9 / 9,
  late tag rows 307 / 307.
- `--cases` identical 7,756, differ 0; `--claimless` identical 14,453, differ 0.
- A/B over tests/cases: same 7,475, differ 0, built under one only 0.
- Position sweep: `atom-arm-narrowed-out-of-box-joined.matrix.vl` and
  `coalesce-box-narrowed-to-nullable-scalar.matrix.vl` each run 76 of 76 graded cells under both
  seeds. Under `VL_IR_SHADOW=6`, all 152 programs match, with 574 functions covered and matched.
  All 152 are `--claimless` identical. Six `start` functions are uncovered under both seeds, in
  classes this change does not touch: `box of a valued if` (4) and `print mapScalar` (2).

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `heldAsBox` (existing, `ir_build.vl`) | the D3172 desugar's null test and copy of the box |
| `exprIsLitAtom` (existing) | `emitStrValue`'s split between `emitAtomToStr` and `emitExpr` |

## Legacy tails the IR calls

None new.
