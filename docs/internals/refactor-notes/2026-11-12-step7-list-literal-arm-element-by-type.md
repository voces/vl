# Step 7: an array literal's arm element is decided by the element's type, 2026-11-12

An array literal whose element is a concrete union arm (`Cat[]`) coerces each element into the arm
(`emitArrayLit`'s `elemVariantIdx`). The decision asked `rlElemLitStructRow(slot) < 0`, which read
the element's spelling twice: `structIndexByName` for a struct row, and `variantIndexOf` for an arm.
It now asks `rlElemVariantRow(slot)`, the arm row of the element's type. `rlElemLitStructRow` had no
other caller and is deleted. This is site N1 of
`2026-11-12-step7-struct-row-by-name-graded.md`.

The population is the sweep's 23,995 programs, with base master `790e0d24` and fixpoint seeds on
both sides.

## The decisions that change

A probe beside the old decision (validated on `Cat[]`, which answers same-variant) compared it with
the type's answer at every struct-kind literal:

| result | programs |
| --- | --- |
| same, built as a struct | 1,829 |
| same, built at an arm | 500 |
| differ | 16 |

The 16 fall into two directions:

- The element type is a declared arm that also has a struct row, so the old decision built it as
  the struct, and the type builds it at the arm: `identity-literal-into-union-beside-same-names-record`,
  `unannotated-relay-of-fresh-list`, `empty-object-all-nullable-runs`, `record-is-narrowing-copy-runs`,
  `arm-list-literal-inline-record-field-unann`, `arm-objlit-global-cell-no-twin`, and
  `narrow-literal-list-builds-at-arm`.
- The spelling names an arm but the element type is not a variant member, so the old decision built
  it at the arm, and the type builds it as the struct: `spread-boxes-into-inferred-union-element-list`,
  `narrowed-arm-assignment-delivery`, and `nullable-arm-adopted-unannotated`.
- Six inventory witnesses also differ: D14533, D14871, D2203, D244, D2750 and D3380.

Every one builds a byte-identical module. An arm and its same-shape records share one heap (D280),
so the coercion they take lands on the same layout.

| witness | filed outcome | base | candidate |
| --- | --- | --- | --- |
| D14533 | open, runs today and must keep running | `7` | `7` |
| D14871 | closed, prints `1` | `1` | `1` |
| D2203 | closed, prints `0` | `0` | `0` |
| D244 | closed, prints `7` | `7` | `7` |
| D2750 | closed, prints `3` `3` | `3 3` | `3 3` |
| D3380 | closed, prints `1` | `1` | `1` |

D14533 is the pin for this mechanism, a struct list literal's element row spelled by name, and it
still runs.

## Proof

- Refresh ×2: fixpoint at 6,664,461 bytes (−188 on the base's 6,664,649).
- Sweep, fixpoint seeds on both sides: **23,995 same**, 0 bytes-only, 0 output movers.
- `rep-fuzz-check.sh` exact; `cases_wasm` (7,480), `regress.vl`, lint-self, seed size, late demands,
  plumb-shape cost and `vl_memo_generation` pass.
