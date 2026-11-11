# A join of record literals delivered at one record they fit is built there, 2026-11-11

Lane w320. Base is master `1d517770`. Clause 1, two parts.

**The defect (D15719).** `if b { { j: { a: 1 } } } else { { j: null } }` is the union
`{j: {a: i32}} | {j: null}`: a record and `null` keep the arms apart (`joinObjFieldwise`). Delivered
as `K = { j: J | null }`, the checker adopts each arm at `K`, but emit built the join as the union's
box around the two `K` records, so the module failed to validate. Through a maker's call the result
is the same union, and nothing converted it.

**The change.**

- `recJoinOfLitsAtOne` (check_fit_rules.vl): a join of record literals, all fitting the one record
  it is delivered as, is stamped as built at that record. `joinStampedAtRecord` (wasmEmit.vl)
  takes the stamp over the union box in `emitIfExpr`, so the join holds `K`.
- `recUnionStoredApart`: a call's result or a binding typed such a union and delivered as one
  record that stores a member's field differently is refused at check. The call has no converting
  copy, and a binding is shared. Declaring the function's result, or the binding, as `K` runs.

**Graded.**

- `record-literal-join-at-declared-record.matrix.vl`: base 0 of 46 run, 25 SILENT. Now 24 of 46
  run, 2 SILENT (push, filed D15720) and 1 check refusal (an inferred return). The 20 un-annotated
  cells are D15717's shared read, closed on #7242.
- Local sweep, fixpoint seeds both sides, base `origin/master`: 23,910 same, 0 bytes-only, 0
  output movers, 0 runs → not-runs, 0 new traps. 3 programs exist only in the candidate:
  D15719's witness (check reject), D15720's (invalid wasm, as filed) and the new fixture (runs).
