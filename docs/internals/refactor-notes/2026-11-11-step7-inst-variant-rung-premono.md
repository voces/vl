# Step 7 inst: `exprVariantIndex` answers -1 before monomorphization, 2026-11-11

Lane w321. #7273 (record reps fixed for the whole compile) and #7285 (famb 14) merged minutes
apart, each tested without the other. #7285 turned `exprVariantIndex`'s pre-mono rung into an
internal `emitFail`, on the reading that nothing asks it before monomorphization. With #7273's
prime, a record that an instance union will hold reps as a variant from the first question.
`monoArgPinName` asks during `monomorphize`, before that union's variant row is minted. So the
rung was reached, and four programs refused with `exprVariantIndex: internal: a variant asked
before monomorphization`: the three #7273 witnesses and D14804's.

## Changed

Before monomorphization `exprVariantIndex` answers -1: no variant row exists yet. That is the
answer the rung gave those askers before #7273, when the record repped as a struct there. The
name read #7285 deleted (`variantIndexOf(structNameOfTy(…))`) stays deleted.

## Proof

- The four programs run and print as before #7285: `generics/generic-body-list-union-read-ops.vl`,
  `generics/generic-is-over-anonymous-record-pin.vl`, `generics/list-copy-record-at-two-pins.vl`
  and D14804's witness.
- `cases_wasm` passes (7,444), `regress.vl` reports no runs lost, and lint-self is clean. The
  full sweep is in the PR body.
