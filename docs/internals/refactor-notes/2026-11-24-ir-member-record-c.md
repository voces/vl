# IR coverage: `member record` family C, a field read off a narrowed `V | null` member (2026-11-24, lane IR-N8)

`member record` on master 26a9bee9: 22 functions over 21 programs (one a distilled-corpus named
cell). A throwaway probe naming the first `structFieldPlain` clause that declines each read, and the
arm legacy's `memReadArmOf` takes, splits them into seven families:

| family | fns | arm, decline | ruling |
|---|---|---|---|
| A | 8 | `shared`, field stored `i32` atom read at `str` | N8, later cut (`deliverStr`) |
| B | 7 | `narrowed`, union receiver | N8, next measurement |
| C | 3 | `nulVariant`, field stores its read | **this PR** |
| D | 2 | `variant`, no struct | N8, with A |
| E | 1 | `variant`, field stored `str` read at `i32` | N8, with A |
| F | 1 | `shared`, `nulstruct` read as a variant | named, left |
| G | 2 | not a `Member` node | named, left |

Family C: `types/intersection-alias-recursive-positions`, `unions/struct-holding-self-recursive-arm`
and `named/hash4h_named_unroll_positions` (corpus). Each reads a field off a recursive record's
`Node | null` field narrowed by a null test, which legacy's `emitMemNulVariantRead` writes as the
receiver, `ref.as_non_null`, `struct.get` of the variant's field, and the `string | null` recover.

- **`nulVariantFieldPlain` (emit_plan_union.vl)**: `variantFieldPlain` on the `nulVariant` arm, over
  `nulVariantIdxOfExpr`; a union-box field is not taken.
- **The builder** (`buildMember`) admits it as a plain read; **the lowering** (`fieldIdxAt`,
  `fieldTail`) writes `ref.as_non_null` then `variantFieldTail`. Legacy's arm and the IR's ask only
  the IR-side predicates (`memberReadPlain`'s callers), so legacy is unchanged.

## Measured

Base master 26a9bee9, head its merge with this branch, both seeds fixpoints; re-checked after merging
master 404b92c4.

- Family C's 3 functions: covered, verified and matched under `VL_IR_SHADOW=1` and `=6`.
- `records/map-callback-union-arm-or-null-optional-element-read`'s `start` (family G) moves from
  `member record` to `coalesce box after an operand`.
- Census, each arm in a tree at its own commit (#26): `member record` rows 21 → 17.
- Covered-fell: tests/cases fell 0, rose 4; corpus fell 0, rose 1.
- L2 self-compile fuel per PR +0.04% on 404b92c4; the pair (the head seed compiling the base tree)
  is +0.026%. Asking `nulVariantFieldPlain` first in the lowering's field read, as the first version
  did, cost +0.22% of the compiler's own run; it is asked last, where the other two arms decline.

Disassembly: in `tests/cases/unions/nul-variant-field-read-positions-runs.vl`, `argScalar`'s read is
`struct.get $11 1 (ref.as_non_null (ref.as_non_null (local.get $1)))` (the receiver's own recover,
then the arm's), and the whole module is byte-identical under the base seed and the head seed with
every function claimed.

Position sweep (Q58), the same file: the read in 10 positions and a null cell that takes the null
test's other arm; base 11 `member record`, head 77/77 functions matched under `VL_IR_SHADOW=6`;
output `5 5 6 v5 h5 5 5 5 5 5 none` under the base, the head and claim-all. Row:
`tests/ir-shadow-rows/nul-variant-member-read.vl`.

## Legacy tails the IR calls

`nulVariantIdxOfExpr` (emit_classify.vl), and `variantFieldTail`, which the variant arm already calls.
