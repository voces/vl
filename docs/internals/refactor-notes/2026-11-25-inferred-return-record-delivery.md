# An inferred result's returned values are delivered to it (2026-11-25, lane IR-N5)

A written result's `return v` reaches `assignableExpr`, which queues `recPend(v, vTy, R, v)`; the
pend pass then builds a maker's call, or a local, at R's row (`recAdoptNote` → `recKeptFnPush`).
An inferred result's returns were never delivered: `adoptRetLits` stamped literals and
`recordCtxTy` only, so a maker kept its literal row and the join handed it over unconverted.
That was invalid wasm, then the record-join audit's refusal from #9997
([D17463](../inventory/D17463.md), [D17462](../inventory/D17462.md), [D17224](../inventory/D17224.md)).

## The change

- `adoptRetLits` queues `recPend(v, vt, ret, v)` for each returned value whose type is not the
  inferred result's. The audit from #9997 stays, and the delivered leaves pass it.

## Measured vs master `c2878db6` (fixpoint seeds on both sides)

- Every spelling in D17463's ablation runs. The case files
  `inferred-return-joins-a-built-record-in-each-position.vl`,
  `inferred-return-value-if-joins-two-makers.vl` and `inferred-return-joins-a-nested-built-record.vl`
  refuse on base and run on the candidate.
- The audit still refuses an un-annotated parameter returned beside a literal, which no
  delivery can rebuild.
- `vl check` output and rc are identical over tests/cases and capability-probes. Late demands
  and late tag rows are unchanged. The candidate compiles the base compiler source to the base
  fixpoint byte for byte.

## Left open

- [D17225](../inventory/D17225.md): a generic maker's call is not built at its delivery (check).
- [D17226](../inventory/D17226.md): a value `if` delivered at a written type keeps its call arm's row.
- [D17227](../inventory/D17227.md): the audit reads a lambda maker's call at a row another maker keeps.
- [D17228](../inventory/D17228.md): a maker joined into two storages is copied for one, and a value `if` of it is refused.
