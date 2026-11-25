# IR coverage: a box over a valued join, through its numeric steps (2026-11-25, lane COV-CLOS)

The coordinator un-parked `box of a valued if` on 2026-11-25 because it blocks two gate tools for
I8's `scripts/` coverage (`scripts/sweep.vl` `recordOf`, `scripts/plumb-shape-cost.vl` `runTimed`)
and about 11 start units.

## Mechanism

Legacy writes a union box's tag ahead of the value it boxes. When that value is a valued `if` or
`??` (a join), the tag sits below the join. The IR already handled a box of the join's out alone.
`boxOfJoinAt` admitted that shape, and the lowering's `joinBoxHead` writes the box head as the join
opens. A join whose value takes a step first, as in `(n ?? 0) as f64`, missed as `box of a valued
if`.

Two narrow extensions:
- `boxOfJoinAt` admits, between the join and its box, a chain of one-operand numeric steps
  (`numConvSrcOf`, ir.vl): a widening, a plain cast with no miss path, or an op whose first operand
  is the chain's value and whose others are immediates. Each step reads the value first and
  nothing below it. A staged-lead coalesce (`coalArmStagesLeads`) may also follow its own operand's
  nodes, provided none of them is a statement the lead would be written above (`ifBelowLeadHas`).
- `stashIfHeadsNote` (ir_lower.vl) maps a box back through that chain to the join's out, so the
  existing `joinBoxHead` writes the head ahead of the join.

`leaf()`'s stack-order guard ("operand above a valued if's value") is unchanged. No position below
a waiting value is admitted that the guard would refuse.

## Census: base (master) → head, over 11,452 programs (tests/cases, probes, scripts/)

| | base | head |
|---|---:|---:|
| distinct functions claimed | 105,427 | 105,434 |
| start bodies claimed | 7,785 | 7,785 |
| claim fallbacks | 6 | 6 |

| class | base | head |
|---|---:|---:|
| `box of a valued if` | 42 | 30 |
| `short-circuit right operand` | 19 | 20 |

No function lost its claim. The one row that moves to `short-circuit right operand` is
plumb-shape-cost's `runTimed`, whose next miss is CENSUS's. `recordOf` is claimed. The 30 rows left
are other sub-shapes: arm sites, record joins, closure niches and nested coalesces.

## Proof

* Claimless identity (`--cases`): cases 8,291 identical, witnesses 87 the same, 0 differ in either.
  Shadow mode 6 shows no mismatch on the two scripts or the witness.
* `self-ir-misses`: 0, at the baseline. I8 sweep `--check`: "1 causes, none new: ok". Edges: "24,
  none new: ok".
* `tests/vl_deep_nesting_test.ts`: 5 passed. The labelled-loop case's stack edge is the same on head
  and base: passes at 916 KB and fails at 914 KB (V8 `--stack-size`, linux x86_64), which keeps
  the test's 940 KB margin.
* The guard's failing control. With the builder's shape check forced off (an instrumented scratch
  compiler), `((n ?? 0) + m) as f64`, a second var after the value, reaches the lowering. There
  `leaf()` refuses it: "mismatch unlowered: operand above a valued if's value". So the guard still
  stands behind the builder. On the real build the shape stays a `box of a valued if` miss, and it
  runs on legacy.

## Q58 sweep

`tests/cases/unions/box-of-valued-if-positions.vl` covers a binding, a return, an argument, a
record field, a list element, a map store and an op with an immediate. All 7 are claimed, against
0 on base. Its two controls are `4096 / (n ?? 1024)`, an immediate before the value, and
`(n ?? 0) + m`, a second var. Both run. The second stays a `box of a valued if` miss. The first
stops earlier, on `short-circuit right operand`.
