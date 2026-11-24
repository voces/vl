# IR coverage: the `narrowed read` remainder — an assignment's atom re-read, a read narrowed to null, a string narrowed to a literal set (2026-11-24, lane IR-N7)

The 13 `narrowed read` functions on master `1784a86d3` were each reduced to a minimal witness and
ablated; the ablation, not the message, defines the families. This PR covers A, F and C/D (10 of
the 13); B and E go to their own PR and G is a refusal.

| Family | Mechanism | Change | tests/cases, by origin |
|---|---|---|---|
| A | an assignment used as a value re-reads an atom cell narrowed to one member at `str` | `assignValue` seats the re-read of a local held at an atom or a `K \| null` (`asgReReadSeated`), as legacy's `emitAsgValue` re-reads any target by `emitExpr`, and decodes a local `K \| null` cell's member through `widenTo` | `narrowed read` −4: closures/captured-litunion-assign and literal-unions/asg-into-nullable-atom-local-value-runs (one) → none; asg-into-nullable-atom-local-value-runs (one) → `return coercion` (4 → 5); assignment-value-into-literal-union-place → `atom cell local rep + declaration coercion`. Two `start`s move from `assignment value re-read rep` to `print operand rep` (1 → 3): asg-into-nullable-atom-field-value-runs and asg-into-nullable-atom-local-value-runs |
| F | a nullable local narrowed to `null` by the else of `is`, read unseated | `narrowedLocalRead` takes legacy's past-null cell read for an unseated read too, exactly where `nullReadOwnAt` is `NULL_READ_STORED` (no destination null) | soundness/null-narrowed-niche-read-keeps-its-cell's `f`: `member record + narrowed read + null test nulfold` → `member record + null test nulfold` |
| C/D | a `string` or `string \| null` local narrowed by `is` to a literal set, read where legacy decodes no atom | `narrowedLocalRead` reads it at the string it holds (`!exprIsLitAtom`), a nullable one through the recover legacy writes (`ref.as_non_null`) | `narrowed read` −2: literal-unions/is-nullable-string-receiver and unions/inferred-string-list-is-atom-list → none |

Scoping, measured: family A decodes a `K | null` re-read only for a LOCAL cell. A global's would
build a module `start` that was then invalid (D17260, since closed by #9912) (the `assignment-value-of-nullable-atom-cell`
template's `closure_capture_unann` ran on master and fell back on head), so a global stays
`assignment value re-read rep` as on master.

Pitfall, measured: `readDeclVar` creates the variable it is asked for when none exists. The first
cut of `asgReReadSeated` asked it, and 21 captured-mutation functions fell into `local slot`;
`asgReReadSeated` reads `ibDeclVar` instead, the variable the store just wrote.

Guard witnesses (C/D): the narrowed string stored into a `UA` local or handed to a `UA` parameter
misses by name (`nullable read recover`) under both seeds; compared with a member it runs and
matches; no read yields a string labelled as an atom.

Left: B (a callback parameter over a list of records of another row, legacy holds both on one heap)
and E (`match` over a mixed `N | null` with a null arm) go to their own PR; G is an `@emit-error`
program, filed as D17117; D's for-in variable is another arm.

Found on the way: D17117 (clause 2), D17121 (clause 1, closed by S2), D17122 (closed, a duplicate
of D17109 by #9866), D17260 (clause 1, closed by IR-N11's #9912), D17118/D17119 (closed by N9). V8's note on
#9849: unions/discriminant-mixed-litunion-bare-literal-arm's `start` now misses as
`narrowed field read coercion`.

## Measured

Fixpoint seeds: master `637158ab8` and head (this branch merged with it); host built from this tree
(sha256 `3bae86df…`, with 6bf25409).
- tests/cases, `VL_IR_SHADOW=4`, both arms on this tree's cases: `narrowed read` 26 → 10 (the 16
  include this PR's own pins); `narrowed read + null read storage rep` 2 → 0 and `null read storage
  rep` 2 → 4 (null/narrowed-null-bool-into-scalar-nullable-box, S2's D17121 pin: F removes the
  `narrowed read` half); `store after an operand` 40 → 42 (family A's interpolation pin, declined
  by #9866's guard); `return coercion` 3 → 4; none 85,795 → 85,808.
- `VL_IR_SHADOW=1`: covered = verified 85,795 → 85,808, matched 85,784 → 85,797; mismatch rows the
  same files on both sides; no new fail/differ.
- `--cases` identical 8,078, differ 0; witnesses 78 / 0; `--claimless` identical 14,495, differ 0.
- A/B over tests/cases: same 7,799, differ 0, built under one only 0.
- Corpus 46,899 matched, unchanged; self ir misses 0; L2 fuel +0.01% per PR; late demands 10 / 10,
  late tag rows 315 / 315.
- `check-filed-witnesses --strict`: 5,670 graded, 0 MOVED.
- Position sweep (the two `assignment-value-of-*-cell` templates): 70 / 70 graded cells run under
  both seeds; `VL_IR_SHADOW=6` over the 140 programs: 288 of 308 functions covered and matched (266
  on master), `start`s unchanged; `--claimless` identical 140, differ 0.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `asgReReadSeated` (new), `globalTarget`, `ibDeclVar` | `emitAsgValue`'s `emitExpr` re-read |
| `nullReadOwnAt` (existing) | `emitIdentNode`'s `nullread` arm, `emitNullReadAtDst` |
| `exprIsLitAtom` (existing), `recoverNonNulls` | `emitStrValue`'s split; the nullable recover |

## Legacy tails the IR calls

None new.
