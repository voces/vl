# IR soundness: a narrowed box-field read at a rep its field does not store (2026-11-22, lane IR-N1)

D17048. A box local narrowed by a discriminant compare (`if b.kind == "a"`) and read at a field
whose storage is not the node's rep was built as `RBoxField` at the node's rep. An atom field
delivered at a `string` was claimed as a string with no decode, so a check-clean program built
invalid wasm in the default build (legacy's armed build was right). The narrowed arm checked a
union-box field's unbox rep and nothing for any other field. The plain struct arm already refuses
the same disagreement (`field read coercion`).

The first commit that builds the witness invalid is `5331d469` (#9259, 11-20), the shared field
read over an un-narrowed box. It made the narrowing compare buildable, which let the function
cover. The unchecked arm itself is older.

## What landed

- **`fieldReadsAt`** (`ir_build_ref.vl`): the narrowed arm's non-union-box field reads at `rep`
  only where the record's kid rep for the field is `rep`, or a nullable kid whose inner is `rep`.
  These are the plain arm's own terms (`repRecordKidOf`). Otherwise the read is the named miss
  `narrowed field read coercion`, and legacy writes the function.
- **Fixture** `tests/cases/unions/narrowed-field-atom-read-at-string.vl` (a return, a list
  element and a binding) and shadow row `tests/ir-shadow-rows/narrowed-field-read-rep.vl`, so
  `--cases` and the claim gate see this shape.

## Sibling sweep

Every member arm in `buildMember`, each probed with a witness on master:

| arm | rep check | probe on master |
| --- | --- | --- |
| list, map and string `length` | the read is an i32 count | not a field read |
| plain struct or variant field | the kid rep against `rep` (`field read coercion`) | refuses |
| narrowed box field, union-box field | `narrowUnboxRepIs` | runs |
| narrowed box field, any other field | none before this change, now `fieldReadsAt` | invalid wasm for an atom at a string, fixed |
| shared read over an un-narrowed box | the node rep and the tail's atom kind | runs, a mixed atom/string field included |

A narrowed `K | null`, `boolean | null`, list, record, `string | null` and nullable-record field
each covers and runs on master. Only the atom read at another rep was unchecked.

## Readings

Measured on fixpoint seeds of this branch and of master `14d707ae` (compiler identical to
`d78eca95`).

- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical; `--cases`
  identical 7,625, fail under both 68, differ 0, witnesses same 61.
