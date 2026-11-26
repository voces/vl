# Spread literal: a converting group (2026-11-25, lane COV-CLOS)

This is the class `array spread conversion`. The spread plan (`spreadPlanOf`) records each group's
source list kind. Legacy's group tail (`spreadGroupStash`), which the IR lowering already calls,
converts a group at another kind: an atom list into a `string` list, or a scalar list widened.
The IR refused any group whose kind differed.

## Mechanism

* `spreadGroupConverts` (wasmEmit, beside the tail) answers whether the tail converts kind `gk`
  into the literal's `kk`. The builder admits exactly those groups.
* A converted group is built as a list at its own element rep and listed in `RSpread.spConv`. The
  verifier accepts a list source at another rep only at a listed index.
* A converted group built at the literal's own rep (an inline literal the plan builds at the
  destination's row) stays a miss. Otherwise the tail would convert it a second time, which the
  verifier cannot see and which wrote an invalid module in
  `spread-inline-litunion-atoms-beside-string.vl` before this fence.

## Census (master → head, 11,500 files)

| | master | head |
|---|---:|---:|
| claimed functions | 114,480 | 114,484 |
| lost | | 0 |
| `array spread conversion` | 8 | 3 |
| `list concat widen` | 5 | 6 |

Gained: `g` (infer-list-return-beside-string), `ws` (spread-scalar-list-into-union-at-pin), `go`
and `@start` (spread-litunion-atoms-into-string-list). `list-literal-join-widening-runs` `@start`
moves on to `list concat widen`. The 3 left are groups built at the literal's rep (the fence above).

Q58: `tests/cases/lists/spread-converting-group-positions.vl`. `widened`, `strs` and `run` miss
this class on master and are claimed here; the output is the same claims-off and claimed.
