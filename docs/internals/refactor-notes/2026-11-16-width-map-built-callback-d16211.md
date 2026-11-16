# An identity `map` over a built list keeps its elements' build (D16211), 2026-11-16

Lane WIDTH. Stacked on D16763's close (#8565), which this needs: without it the stamped `map`
result reached 27 check-clean invalid-wasm cells at annotated positions.

## What changed

- `fnOnlyReturnsParam` (`symbols.vl`, beside the other declaration queries so the emitter can ask
  it without a checker import) recognises a one-parameter callback that hands its parameter back:
  every `return` in the body returns it, or an arrow's expression body is it.
- Emitter: `monoListCbAt` (`emit_mono.vl`) types such a lambda's result, and the `map` call's list,
  at the build row the elaboration keyed the parameter at. A named function is instanced with its
  hole parameter bound at the build (`elabCbAtBuild`), so its result follows.
  `elabSameSlotsAtBuild` stamps the `map` result at the build, as it stamps `filter` and `slice`.
- Checker: `recCbTakesBuild` accepts such a `map` whose result holds the records, and
  `recSameElemsRecv` reads its result as the receiver's elements. Its deliveries are then judged
  as a `filter` result's are.

## Measurements

| instrument | before (master fixpoint) | after |
| --- | --- | --- |
| `map-callback-over-built-list.matrix.vl` (new) | 4 of 68 graded run | 29 of 68 run, 0 SILENT, 0 runs → not-runs; the rest are D16763's refusal, D16764 (owed), D16765 and the record-building callback |
| the same lowering without D16763 | | 27 SILENT, the reason for the stack |
