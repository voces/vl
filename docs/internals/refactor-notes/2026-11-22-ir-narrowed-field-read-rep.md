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
  `--claimless` identical 14,020, fail under both 3,267, differ 0; `tests/cases` A/B same 8,738,
  differ 1, the new fixture (rc 70 on master, 0 here).
- **Armed shadow, `tests/cases`:** covered 68,928 to 68,925. The three fixture functions master
  counts as `fail a claimable function did not match` are `uncovered narrowed field read coercion`.
  Both `node-in array: differ` rows are the named miss, and two start rows move from
  `print operand rep` to it. No fail or differ row remains but master's own
  `generics/hole-map-tail-value.vl`.
- **Self-compile:** 19,880 to 19,878 functions with no blocker. The two are `valueLitBaseKind`
  and `riuLitBaseKey`, which read `TyLit.litKind` (an atom row) narrowed, only as an operand of a
  string `==`. That compare's lowering decodes the atom itself, so master's claim was correct by
  the tail and not by the read's rep, which the plain struct arm refuses too. Legacy writes them
  now. Building the narrowed atom read at its row and decoding it (`RAtomStr`) would cover both
  and run D17048's shapes through the IR; that is the follow-up.
- **Corpus:** 45,201 of 45,678 functions with no blocker, as on master.
- **Order check (mode 6):** 0 order rows over 21,043 programs.
- **Stack margin:** 960 and 940 KB pass, 920 KB fails, on this branch and on master.
- **Fuel:** L2 +0.01% on master's fixpoint.

