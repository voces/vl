# IR: a function handed through a closure call as a bundle, 2026-11-22

Lane IR-N6, the closure-call arm of the bundle argument (D14841). Legacy's `emitCallRefAt`
writes argument `i` of a closure call as a record of closures, one per signature, in two shapes:
- the parameter's annotated function type takes a delivered bundle (`bundleCallArgSigs`);
- the key's parameter slot is a delivered bundle's row and the argument names a function
  (`bundleKeyParamTy`).

`callRefPlainArgsTail` refused both, and legacy counted neither as plain.

## The change

- The two shapes are one plan, `callRefBundleArgOf` (wasmEmit.vl), returning the record type and
  its signatures. `emitCallRefAt` writes `emitBundleReadArg` from it and counts the argument as
  plain. `callRefPlainArgsTail` admits it in place of `callRefArgPlain`.
- `closureCallAt` (ir_build.vl) builds the argument from the same plan with IR-D1's
  `bundleRecBuild` (#9466), at the row `repRowOfTyStruct` gives. It refuses unless the key's
  parameter slot is that row (`sigParamSlotAt`).

The new row `tests/ir-shadow-rows/closure-call-bundle-argument.vl` has covered and matched floors
of 6 (base: 5).

## Readings (base: master `040768a45`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 67,742 | 67,751 |
| armed `tests/cases` covered / matched | 67,742 / 67,741 | 67,751 / 67,750 |
| `tests/cases` `call of a non-declaration` (any / alone) | 58 / 49 | 49 / 40 |
| corpus functions with no blocker | 44,941 | 44,941 |
| self-compile functions with no blocker | 19,724 | 19,724 |
| L2 self-compile fuel | 109,952,065,064 | +0.02% |

Of the 11 rows, 9 move. The other 2 are the key-parameter shape with the closure a local lambda,
called directly (`lap3(id)`): `callRefPlainKey` refuses it before the argument loop. That is a
follow-up. On both seeds the armed fail and mismatch rows are the same three. Armed self is 19,724
covered, verified and matched on both.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,607 |
| `--claimless` | 14,018 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,327 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (239 passed).
