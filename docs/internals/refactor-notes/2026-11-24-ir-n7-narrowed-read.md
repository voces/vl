# IR coverage: a box's null test and a seated box read on the `??` desugar; a non-atom string part at any rep (2026-11-24, lane IR-N7)

| Mechanism | Change | blocker class, tests/cases functions, before → after |
|---|---|---|
| narrowed read | `nulTest`'s `boxTag` arm reads its operand at its cell (`exprAt`), and `narrowedLocalRead` returns a seated read of a box cell on the plain `local` arm as it stands (`heldAsBox`), as legacy's D3172 desugar of `x ?? d` tests and copies the box | `narrowed read` 21 → 14 |
| string atom part route (direction A) | `buildStrBin` refuses only an atom-literal part whose rep is no atom; a part that is not `exprIsLitAtom` is built by `irBExpr` whatever its type's rep, as legacy's `emitStrValue` sends it to `emitExpr`, and the existing `string operand coercion` check still refuses one not built as a string | `string atom part route` 24 → 8; `string operand coercion` 2 → 2 |

Witness: `tests/cases/literal-unions/atom-part-concat-positions.vl`. A literal-union value is
joined into a string after being narrowed out of a mixed box, bound plainly, or passed as a
parameter, on the left and right of `+` and in an interpolation; each prints its member string,
and every function is matched on head.

The 8 left in `string atom part route` are direction B (an atom-literal part whose rep is a
string, e.g. `is string` over `1 | 2 | "s"`), pre-reviewed separately. One function moves on to
`member record` (`useA` in `unions/layout-family-literal-set-beside-string.vl`, `"useA " + a.kind`),
which is lane IR-N8's class.

## Measured

Fixpoint seeds: master 73c87bffa and head b15c82122.
- tests/cases functions with no blocker: 79,552 → 79,573; covered = verified = matched (79,551 → 79,572).
- Corpus: 45,555 covered = verified = matched, unchanged.
- Self-compile 20,469, unchanged. L2 fuel +0.00% per PR; late demands 9 / 9, late tag rows 307 / 307.
- `--cases` identical 7,754, differ 0; `--claimless` identical 14,056, differ 0.
- A/B over tests/cases: same 7,473, differ 0.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `heldAsBox` (existing, `ir_build.vl`) | the D3172 desugar's null test and copy of the box |
| `exprIsLitAtom` (existing) | `emitStrValue`'s split between `emitAtomToStr` and `emitExpr` |

## Legacy tails the IR calls

None new.
