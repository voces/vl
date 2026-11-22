# IR coverage: a literal `is` test re-reads its receiver as built (2026-11-22, lane IR-N1)

`xs[i] is N`, `r.s is S` and a global `gl is S` are legacy's `emitIsTestLitArms`, which writes the
receiver once per member (`litArmsReadsOf` reads; `litArmsReadsAgree` is armed on the count).
The IR's `isLitArmsTest` admitted only a variable receiver, so a list element's, a field's or a
global's read, a temp, left it `is literal arms receiver`. Stacked on #9499.

## What landed

- **The builder** admits a temp receiver read more than once where `recvReadsAgain` holds (the
  IR's re-read check over its own read tables).
- **The lowering** writes the receiver through `litRecv`: its operand the first time, then
  `opndAgain` (`irHoistRecv` for a temp) at each later read, at all seven receiver reads of the
  arms. The count is `irLitReads` on `IrFn`, reset per `RLitArms`: right while no `RLitArms` is
  lowered during another's re-read, which holds since `irHoistRecv` re-writes only `RListGet`,
  global and field reads, never an `RLitArms`.

## Coverage

Measured on fixpoint seeds of this branch and of #9499's head `9e8b83a1`, each building this
branch's source.

| population | #9499 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,761 | 19,761 |
| corpus with no blocker (45,678) | 45,029 | 45,031 |
| `tests/cases` covered / matched (armed shadow) | 68,224 / 68,223 | 68,244 / 68,243 |
| `tests/cases` start bodies covered / matched | 5,687 / 5,686 | 5,695 / 5,694 |

`is literal arms receiver` falls from 29 rows to 3 and from 14 start rows to 1. The armed shadow
adds no fail, differ or mismatch row (the one fail row, `generics/hole-map-tail-value.vl`, is on
master too).

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,612, differ 0, witnesses same 60;
  `--claimless` identical 14,018, fail under both 3,267, differ 0; `tests/cases` A/B same 8,726,
  differ 0.
- **Fuel:** L2 +0.017% on #9499's fixpoint, measured live, source growth (the head seed on the
  base tree +0.000%).
