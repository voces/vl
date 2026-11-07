# Step 7: post-mono return columns read off the recorded result

Measured 2026-11-07 on master `409a3a79` (#6705), 4-core box.

## What changed

`computeRetInference#2` (the run after `monomorphize`) first writes every un-annotated valued
function's five return columns (`fRetKind`, `fRetStructIdx`, `fRetRArrElem`, `fRetBool`,
`fRetLitAtom`, plus `fRetRListRow` for a ref list) from `fnRecordedRetCols`, and its fixpoint
walk skips those functions. The walk still runs for the functions the reader declines, and for
those `criRowByStamp` claims (it reads stamps, not the body). The epilogue's record-row refusal
and the ref-list row join (with its `-2` refusal) still run for every function.

The reader (`fn_ret_shadow.vl`), against the column shadow of #6705:

| differ class (post settled) | n | closed by |
|---|---|---|
| record or variant, recorded names no row | 497 | `repSlotOfKind` |
| closure the column calls `i32` | 83 | closure keyed `i32`, as an annotation keys it |
| ref list / map slot vocabulary | (strict compare) | a ref list's row is `fRetRListRow`; a map's shape is off its type |
| bundle record returned (sweep only) | 11 cases | `calleeReturnsRecord` / `bundleRetParamOf` + `bundleRecordRowOfSigs` |
| struct or variant rows differ | 19 | `criRowByStamp` ahead of the recorded row |

Declined, each by a named class, so the walk keeps the old answer:

| class | why |
|---|---|
| no result recorded (17), recorded result has no token (35), rep uncovered (13) | missing fact; the run moves 39 of them, so the walk is owed |
| recorded variant, own result a record (2 in the sweep) | a delivery widened the record to a union; the function builds the record |
| result is an assignment's value | the emitter returns the target cell's kind |

## The shadow's population was 70%

The in-process harness compiles 13,513 of 19,355 files; a program that stages a `std:` import
(rc 2) or that the emitter refuses is never graded. Every sweep regression of the first
candidate (32 `runs → not-runs`, 43 traps: bundle records, ref-list row refusals, widened rows)
was in that blind spot. The column shadow's "0 differ" is not enough to switch on; the sweep is.

## Post-mono, after the switch

Of 2,994 un-annotated valued functions in the shadow population, 2,897 are written from the
recorded result. The run still walks the 97 others (the missing-fact classes above, plus the
stamp-claimed ones, which skip the body). `criWalkBlock` stays: the pre-mono run calls it.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,451,370 → 6,458,307 (+6,937, +0.11%), base is #6705's fixpoint |
| `scripts/sweep.vl` diff, 23,610 cells | 23,606 same, 4 bytes-only, 0 output movers, 0 `runs → not-runs`, 0 traps |

The 4 bytes-only movers (D5590, D5593, `builtin-index-keeps-narrowing-beside-user-operator`,
`callee-declared-after-keeps-narrowing`) are one function each: a user `"[]="` whose tail writes
a literal-union field. Its result, which no index store consumes, now lowers at the recorded
string rep instead of `i32`.
