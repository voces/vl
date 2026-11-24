# IR: `is` over a record's box field at its storage, and `x?.f is K` (2026-11-23, lane IR-N1)

Part 3 of the `is` family: `is arm tag memStruct`, live once #9738 merged, and
`is arm tag optField`.

## What landed

- **A record's box field at its storage** (`storedBoxTest`): at storage, legacy's `memStruct`,
  `memVariant` and `memNarrow` arms read the field raw and compare the pattern's arm tag. The
  builder takes them through `storedMemberBoxTest` when the record is a local of the function.
  A global's record keeps the named miss `is stored member receiver`: a global read in start or
  in a closure lowers its narrowed field unboxed, where legacy's arm reads it raw. The first proof
  caught this case as a claim-mode miscompile in start (`path-reader-checked-at-each-call-runs`).
- **`x?.f is K`** (`optFieldTest`): an unstaged base `x` that owes no recover, read twice. Legacy
  writes the null test, then `false` or the base as non-null, the field and its tag. It is built
  as `ROptRead` with `orTag` ≥ 0, so the IR's `?.` read keeps one node for both forms. A chained
  base stays `is optional field chain`.
- `optFieldIsOpen` and `optFieldIsTail` (`wasmEmit`) are split out of legacy's `optField` arm,
  byte-neutral, and both writers call them.

## Legacy tails the IR calls

- `optFieldIsOpen`, `optFieldIsTail` (`wasmEmit`): the tagged `ROptRead` lowering's `if` and its
  field-tag tail.

## Bytes and coverage

- Self-compile `--names`: identical 9,037, differ 0. `--cases`: identical 7,749, differ 0.
  `--claimless`: identical 14,054, differ 0. `tests/cases` A/B: same 8,866, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases` armed shadow: covered = matched goes from 79,567 to 79,575. `is arm tag memStruct`
  4 → 0, `start: is arm tag memStruct` 2 → 2 `start: is stored member receiver`, `is arm tag
  optField` 9 → 0. Next blockers: `is member storage rep` +2, `coalesce optional record field` +1,
  `is optional field chain` 1, `is stored member receiver` 1. The corpus is unchanged.
- Row: `tests/ir-shadow-rows/is-stored-member-and-opt-field.vl`.

## Fuel

L2 +0.04% per PR on base 6b9b586c. A first spelling made `optField` its own `Rhs` member
(`ROptFieldIs`) and read +0.18%. The ablation (master plus the stored member arm alone: +0.00%)
put the rise in `checkProgram`, +0.13G, from the larger union every `Rhs` match checks. Folding
the test into `ROptRead` as a tag brought it to +0.05%.
