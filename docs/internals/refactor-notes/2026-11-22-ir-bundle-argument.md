# IR: a bundle argument (2026-11-22, lane IR-D1)

Coordinator assignment: `bundle argument`, 124 tests/cases functions at master 2de2ffc1, all
arms. A non-capturing lambda handed to a bundle parameter is baked into a direct call, so it
never reached the miss. Every row was a capturing lambda, e.g. `only((x) => x + k)`, or a
bundle record handed on whole, e.g. `function only(f) { other(f) }`.

## The change

- Legacy's argument ladder for a direct call's bundle parameter is split out byte-identically
  as `bundleArgArmOf` (wasmEmit.vl): `lambda`, `member`, `holder`, `fnRead`, `choice`, or
  `none`. The IR asks it per argument.
- `lambda`: `bundleArgRec` builds the closure of each signature's instance (`monoBundleFe`) in
  the parameter's record row's field order (`paramStructIdxOf`), as `emitBundleArg` does, then an
  `RMakeRec` at that row.
- `holder`, and `none` at a bundle parameter: the record as it is, delivered at the parameter's
  record rep.
- `fnRead`: the same builder at the row of the parameter's annotated bundle type
  (`repRowOfTyStruct`), each closure `monoBundleReadFe`'s, as `emitBundleReadArg`.
- `choice` stays a named miss (`bundle argument choice`).
- `bundleRecBuild` is the one record-of-closures builder, taking the signatures, row and type
  from its caller; IR-N6's closure-call arm delivers through it next.
- `calleeSig` and the argument's delivery rep type a bundle parameter as its record through
  `bundleHeldTy`, the rule #9446 gave the parameter's own variable. Without it, the verifier's
  rule 6 refused the call.
- Where an instance's bundle parameter is not a record, the lambda arm misses
  (`bundle argument closed parameter`).

## Measured vs master 2de2ffc1 (fixpoint seeds on both sides)

| population | functions | start bodies |
| --- | --- | --- |
| self-compile | 19,518 → 19,522 | 138 → 138 |
| distilled | 44,646 → 44,650 | 8,541 → 8,541 |
| tests/cases | 62,640 → 62,708 | 4,961 → 4,966 |
| capability probes | 517 → 517 | 170 → 170 |
| filed witnesses | 17,842 → 17,859 | 3,709 → 3,715 |

First misses in tests/cases:
- `bundle argument` rows: 161 → 11 (`choice` 9, `closed parameter` 2). The summary's
  distinct-function count was 124.
