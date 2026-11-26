# D17170: an unrecorded inferred result is no union (2026-11-26, lane COV-START)

D17170: `function mk(f, b: boolean) { return if b { { r: { f: f } } } else { null } }`, called as
`mk(inc0, true)`. It refused at first with `ref valtype with no interned shape`. #10227 minted the
instance's literals inner-first, and after that it refused one step later: `a union's value-box
verdict is read off neither its member set nor its type`.

## The mechanism

`nulRetPlan` (emit_plan_null.vl) builds the `null` an un-annotated function returns. It asks the
value-union verdict of the function's inferred result (`inferRetTyIxOf`). For `mk` no type is
recorded (-1), so `isValueUnionOfSet(-1, -1)` reaches its floor.
- An unrecorded result names no union, so the question is now skipped.
- The next rung (`fRetNulHeapOf`, the stored kind's nullable struct row) names the null, as it does
  for any inferred nullable record.

Two guards were tried first and refuted:
- asking only for a union-typed result;
- skipping a record-typed result.
They showed the result type is absent, not a record, a union or an open type.

## Measured

- D17170 runs, printing `4`, the same under `$VL_IR_STRICT=1`.
- D17180's literal-or-`null` ablation (`if b { { f: half } } else { null }`) runs, printing `2`.
- Both arms run: the `null` arm prints `true`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- Fixture `tests/cases/records/hole-maker-record-or-null-result-positions.vl` refuses on master and
  prints `4 true 2 true` on head.
