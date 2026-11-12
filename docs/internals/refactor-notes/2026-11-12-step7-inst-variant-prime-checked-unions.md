# Step 7 inst: the variant prime covers a checked union that boxes two records, 2026-11-12

Lane w321, after #7273. w320's `record-literal-join-at-declared-record.matrix.vl` (#7304) has two
un-annotated cells, `map_value` and `map_set`, that #7273's guard refused: `a record type's rep
changed during emit, from a plain struct to a union arm: {j: {a: i32}}`. Neither is generic. An
`if` join of `{j: {a: 1}}` and `{j: null}` is stored as a map value. Its union row, and the
record's variant row with it, is minted during emit. #7273's prime registered only the record
arms of unions an instance is typed at.

## Changed

`elabInstUnionArmTys` also registers the record arms of every union a node is checked at, where
that union is a value-union box of two records of different types (`elabBoxesTwoRecords`). It
runs once per program after the elaboration, and is on the arena-scan allow-list
(`compiler/lint.vl`). `exprVariantIndex`'s pre-mono rung comment now states its contract.

## Measured and left out

A first cut registered the arms of every checked union. The full sweep lost 4 programs: D15031's
witness, `closures/void-seeded-let-written-value-fn-called-at-two-types.vl`,
`types/intersection-alias-to-shape-param.vl` (`ref valtype with no interned shape`), and
`conditionals/tail-if-field-assign-arm.vl` (invalid wasm). In each, a union collapses to one
struct, or no row is ever minted for it. Restricting the walk to value boxes of two distinct
records keeps all four.

## Proof

- Both cells now pass the guard. They still floor where the template's 17 other un-annotated cells
  floor, `field access receiver is not a struct`. That is D15717's shared read (unfiled: D15717, filed in #7242), which #7242
  closes.
- **Full local sweep**, fixpoint seeds, base master `5c962b49`, 23,933 programs: 23,933 same,
  0 bytes-only, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Locally:** `cases_wasm` passes (7,445). `regress.vl` reports no runs lost. rep-fuzz is exact,
  and lint-self is clean with its budgets. The `--findings` budgets pass: 0 dead-export, and
  render-parse 35 / 59. These also pass: `vl_scan_passes_test.ts`, late-demands (6) and
  seed-size (+0.6%). The `vl fmt` pass is byte-identical on the seed.
