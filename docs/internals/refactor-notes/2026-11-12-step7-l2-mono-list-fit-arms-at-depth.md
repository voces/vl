# Step 7: `is K[]` over a union or nullable list arm tests emptiness at the depth the elements part (D15763, D15811 closed), 2026-11-12

D15763 (w316) is check-clean and silently wrong: `probe<i32>(e)` with `e` an empty `i32[][]`,
boxed in `V[][] | string` and tested with `is f64[][]`, prints `0`. D4912's empty-list fit wants
`1`.

## The matrix

The orchestrator asked for depth {1, 2, 3} × receiver {boxed `| string`, bare, nullable `| null`}
× value {empty, empty at the parting depth, non-empty}, in a generic instance: 24 cells. On a
master fixpoint, 18 run right and 6 are wrong, in two families:

| cells | prints | want |
| --- | --- | --- |
| boxed, depth 2 and 3, empty and all-empty (4) | `0` | `1` (D15763) |
| nullable, depth 2 and 3, non-empty (2) | `1` | `0` (D15811, filed here) |

The concrete spellings are refused by the checker (`f64[][]` is no variant of
`i32[][] | string`), so both families live only in generic instances.

## The mechanism

`emitListEmptyFitArms` (wasmEmit.vl) answers `is K[]` over a union or nullable receiver. It
admitted only an arm whose elements and `K`'s part at the first list level. An `i32[][]` arm
against `f64[][]` parts at the second, so the arm counted as one that meets `K`, and the test
fell back to the static fold:

- a box answered false;
- a nullable answered its non-null test, which is true for any list.

The bare receiver's path, `emitListEmptyFitIs`, already walks to any depth.

## Changed

`emitListEmptyFitArms` admits an arm at any parting depth. For depth 2 and up:

- it walks the arm's ref-list rows down to that depth, starting from
  `rlSlotOfTyOrTwin(tyRefArrElemOf(arm))`, as `emitListEmptyFitIs` walks a bare receiver's;
- it casts the box's payload to the outer row's wrapper;
- it runs the same emptiness loop under the arm's tag or non-null test.

The new fixture `generics/is-nested-list-over-union-arm-tests-emptiness-at-depth.vl` holds the
eight changed cells and their non-empty twins.

## Proof

- **Matrix:** 18 / 24 → 24 / 24.
- **Sweep.** The master fixpoint (`47ce8f86`) against the candidate fixpoint: same 24,021,
  bytes-only 0, output movers 1 (the new fixture), runs → not-runs 0, new compiler traps 0.
- **D15763's grading list:**
  - `const u: i32[][] | string = []` now prints `1`;
  - a multi-arm `is` prints `1 0 2`;
  - `probe<i32>([[]])` is a loud monomorphize refusal on master and candidate alike, unchanged.
- **Refusals kept:** D15762 and D4937 keep their refusals.
- **`check-filed-witnesses --strict`** on both inventories: 4,783 graded, 0 moved, 0 output
  mismatches.
- **Locally:**
  - refresh to a fixpoint, lint-self, budgets;
  - distilled `regress.vl`: no runs lost;
  - `cases_wasm_*`: 7,493 passed.
