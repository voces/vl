# The IR reads a field at its operand's stored-row kid (2026-11-24, lane IR-P1, D17165–D17169)

`buildMember` (`ir_build_ref.vl`) declined a plain struct field read (`field read coercion`) when
the field's kid rep in the receiver's checked-type rep (`kr`) was not the read's rep. Legacy reads
the field off the operand's stored row, so the IR now does the same: the read goes into a temp
typed at that row's kid (`skr`), and its consumer takes the temp at that rep.

## Why `skr`, not `kr`

Typing the temp at `kr` fails verifier rule 2 (`kidAt(opRep(v), gfIx) == dst`) where the
operand's row is not the receiver type's: a record field read at `record#8` off an operand at
`record#17`. The verifier self-test pair `field-read-at-receiver-type-kid` (rule 2 fails) and
`field-read-at-operand-row-kid` (verifies) in `ir_selftest.vl` pins this.

## Measured (master `27fc2c8b`, mode 1)

- 23 programs (the 5 witnesses, 4 corpus cells, 14 tests/cases programs): `field read coercion`
  rows 24 → 0; starts matched 4 → 14 of 25; functions matched 271 → 274 of 274; 0 verifier
  failures; every program's output unchanged. Legacy (claimless) and shipped bytes: 0 of 23 moved.
- L's position sweep (`field-read-stored-kid-hole-fn-lists.matrix.vl`): runs 46 of 46 before and
  after; `field read coercion` misses 46 (36 start, 10 function) → 0, all 46 starts and 68
  functions verified and matched.
- `ir-identity.sh`: `--names` 9,433 identical, `--cases` 8,152, `--claimless` 14,510, differ 0.
- `mono-tyaram-grid.sh`: 252 OK, 9 REJECT, no BAD, results identical to the base.

## Not in this change

- D17167 (family G) stops at its list's element coercions: `index element coercion` at the start
  and `array element coercion` in one instance of the maker.
- `narrowed field read coercion` (10 rows) is a separate decline, untouched.
