# IR: a union alias arm's tag chain, and two null tests (2026-11-25, lane COV-IS)

Three classes, one mechanism each.

## `is variant tagChain`

`x is U`, where `U` is a union alias arm of the receiver's box, is legacy's tag chain
(`emitIsTestVariant`). For each tag of `U` it reads the receiver again and compares the box's tag,
then `i32.or`s each result after the first. The builder now builds that chain: an `RTest` per tag,
or-ed by `RPrimOp`. The receiver must read again with no effect (`unionEqOperandOk`), and each read
is built afresh, as legacy re-emits it.

## `null name test of a non-name null side` (left side)

A compare of a non-literal `null` side against a nullable is the other operand's null test
(`emitNulNameTestBin`). The `null` side is written for its effect: ahead of the test as the left
operand, after it as the right. The builder now builds a left side's effects (`nulNoneEffect`) and
then the test (`RAfterEffects`), where the side builds only temps. Two cases stay named misses:
- a right side (`null name test of a non-name null side`);
- a side holding a store (`null name test of a null side that stores`). Its statement would be
  written ahead of an operand already pending, which a first try showed as `non-stack temp: out of
  order`.

## `null test operand` (a holder const)

A `const` holding a record of members is null-tested at the `nullRef` arm (`holderRecordSigs`),
where legacy writes the read, then `ref.is_null`. The IR's read is the record, which
`nulTestOperandOk` refused. The builder and the verifier's `RNulTest` rule now take a record
reference there.

## Legacy tails the IR calls

None new.

## Census (restricted to the 19 tests/cases and 6 witness programs these classes held)

Base rows from master 7eddff27; head on this branch.

| reading | base | head |
|---|---|---|
| tests/cases distinct functions claimed | 53 of 87 | 75 of 87 |
| `null test operand` / `is variant tagChain` (cases) | 12 / 10 | 0 / 0 |
| `null name test …` (cases) | 11 | 3 right side + 6 that store |
| witnesses distinct functions claimed | 3 of 9 | 7 of 9 |
| start bodies claimed (cases, witnesses) | 16, 5 | 16, 6 |

## Witnesses (Q58, armed shadow)

- `tests/cases/unions/is-union-alias-arm-positions.vl` (new): a parameter, a local, a field and a
  global, across 11 positions. Base: 3 `is variant tagChain`. Head: 4 of 4 matched.
- The `tests/cases/functions/module-holder-of-bundles-*.vl` cases (8 programs) already sweep the
  holder's positions. Every function in them now claims and matches.
