# Valued `if`: a plain arm delivered at its join's rep (2026-11-25, lane COV-CLOS)

The class `ref if arm rep`. A reference join's plain arm was built at its own rep (`exprAt`) and then
had to equal the join's rep unless a hole retag, the bottom ref or a niche reached it. Under
behaviour parity (#10171), an arm whose own rep differs, and which none of those reach, is now
delivered at the join's rep (`deliver`), as any other delivery position is.

## Census (master → head, 11,500 files)

| | master | head |
|---|---:|---:|
| claimed functions | 114,439 | 114,441 |
| lost | | 0 |
| `ref if arm rep` | 10 | 6 |
| `object field coercion` | 17 | 19 |

Gained: `@start` of `hole-fn-if-to-hole-param.vl` (hole functions at another closure rep) and of
`nullable-record-of-generic-fn-missing-key.vl` (a record element into a nullable record join). The
`@start` of `maker-union-of-records-at-declared-record-runs.vl` and of
`record-literal-join-at-declared-record-runs.vl` move on to `object field coercion`.

The 6 left need a record-to-record row conversion that `deliver` does not write: records on rows
that do not lower alike (5), and two map structs (1). They sit beside the adopted-storage-row family.

Tried and dropped: delivering every plain arm, including those whose node rep is the join's. It
gained nothing and widened the change.

Q58: `tests/cases/conditionals/valued-if-arm-delivered-at-join-rep-positions.vl`. `run` misses
this class on master and is claimed here; the output is the same claims-off and claimed. A list
element position hits legacy's `a ref list's element row does not resolve` and is left out.
