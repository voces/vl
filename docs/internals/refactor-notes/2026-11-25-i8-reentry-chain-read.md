# I8 re-entry: a record compare's place root, 2026-11-25

Lane COV-CALL, the second of its I8 re-entry ports. Base: master 56de706a.

## The re-entry

The IR lowers a record compare (`RStructEq`) through legacy's `structEqTail` and
`nulStructEqGuardTail`. A place side is a global's read, a narrowed variable's read, or field reads
of one. It took `EQ_ROOT_EXPR`, so legacy's `emitChainRead` wrote the operand node through
`emitExpr` at each compared field, and `emitEqRootIsNull` wrote it again for its null test.

## The port

- `EqRootKind` gains `bytes`, and `EqRootPlace` gains `epBytes`.
- The IR's `structEqRootPlace` writes the side's read once (`irHoistRecv`) where `irReadsAgain`
  holds (a variable's, global's or element's read the builder noted, or a noted field read of one).
- `emitChainRead` appends those bytes (`wBytes`, relocations included) in place of `emitExpr`.
  `emitEqRootIsNull` does the same before the `nullRef` tail.
- A side the IR cannot read again keeps `expr`. Legacy's own compare path is unchanged.

## Measurement

`scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep.txt` over cases, witnesses and probes:

| | master 56de706a | this change |
|---|---:|---:|
| IR needs `reentry emitChainRead` (programs) | 42 | 0 |
| fallback `nullable record compare fields` | 23 | 22 |
| fallback `record compare fields` | 10 | 10 |
| newly failing: cases / witnesses / probes | 1171 / 528 / 38 | 1145 / 514 / 35 |

The record compare fallbacks left under the stub are the ones the coordinator listed after the
re-entries. They are not this re-entry.

## Proof

- 216 programs that compare records or nullable values (`tests/cases/records`, `structs`,
  `operators`, `null`, and the record compare classes' lists): every one claimless-identical, with
  no armed mismatch under `VL_IR_SHADOW=6`.
- `scripts/ready-check.sh`; `ir-identity.sh` runs in CI.
