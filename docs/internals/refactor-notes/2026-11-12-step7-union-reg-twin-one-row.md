# Step 7 L6: a twin-record alias adopts its set's row (D15761), 2026-11-12

The union key licence, on the type key since #7416, found one pair of rows under one type key
that differ, D15761: `type U = Cat | Kot` and `type V = Cat | { m: i32 }`, where `Cat`, `Kot` and
`{ m: i32 }` are one layout. The ruling is structural, as `tySame` is. A union is a set (D1712),
brands are erased, twins share heaps, and `is` between twins is a value test (D1023). So the two
sets are one set, and one row.

## Changed

`collectDeclaredUnion` already binds a declared alias to the row its type key finds when its
record arms are layout twins of the row's arms (`declArmsMatchRow`). It refused when an arm was a
twin of more than one of the row's arms: `V`'s `{ m: i32 }` is `tySame` to both `Cat` and `Kot`.
Now the arms named by a row variant claim it first, and each twin arm takes the first row arm no
other has taken. `V` binds to `U`'s row.

## The licence

`tests/vl_union_key_licence_test.ts` now wants `merge-diffset` and `merge-diffvar` 0 on every
witness. A new bucket, `keySweep/pair-keyed`, counts the pairs of keyed rows the sweep compares,
and the control (D15761's program) must show at least one, so the zero is not vacuous. **Negative
control:** a build with this adoption reverted fails the test on the control (`merge-diffset` 1,
`merge-diffvar` 1).

## Graded

- All 118 `tests/cases/*/*twin*.vl` (the `tyIsTwinRecordUnion` class among them) print what
  master prints. D15761's program prints its want (`7`, `7`, `yes`).
- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against #7416
  merged with master `a96bb2a0`: 23,987 same, 0 bytes-only, 0 output movers, 0 blocking.
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit, scaling,
  licence and inventory tests, emitter-state-audit, capability probes, splice-scan, seed-size,
  late-demands, and the dead-export and render-parse budgets.
