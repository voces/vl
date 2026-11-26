# IR: object-field deliveries take the destination's row and `deliver`'s unbox (2026-11-26, lane COV-CLOS)

The object-field family the coordinator assigned off COV-START (regen-11, `object field *`). This
PR closes two of its mechanisms, ablated apart; the rest are listed under "Still open".

## Mechanism 1: a join of record literals delivered at a declared record (D15719)

`const k: K = if go { { j: { a: 1 } } } else { { j: null } }`, with `K = { j: J | null }`. The two
literals type apart, so the join's own rep is the box of `{j: J} | {j: null}`. Legacy writes both
arms at `K`'s struct (`ifRefJoinOf` names kind `struct` at `K`'s row; the disassembly shows two
`struct.new` of `K`'s heap and no box). `ifRefExpr` built at the row only when the join's own rep
was a record, so it built the box: each arm became a variant literal, and its `null` field missed
as `object field coercion`. A join whose rep is a box over a union of records
(`exprRecordArmsTy`) is now built at the row as well.

Ablation. A join of two literals of one type, a join of two `null`s, and an arm that is a
binding of `K` all claimed already; only literals that type apart missed. A first attempt that
built the variant field's `null` as the slot's bottom ref only moved the miss on to
`convert box -> record`. With the join built at the row it is dead code, so it is not in this PR.

## Mechanism 2: a narrowed arm into a record field (`object field arm unbox`)

`fieldPlainWhy` refused a record field whose value is a box narrowed to a record arm, unless the
value was a union of records. An argument, a binding or a return of the same value has no such
fence: `deliver` unboxes a narrowed local (`armUnboxOwed`) or casts a union of records
(`recordArmsUnboxOwed`), and a narrowed map read already arrives as the record. The fence is
removed, so a field delivers the value as an argument does. With claims on, all 68 functions of
`scripts/capability-probes/arm-with-struct-field-held-by-struct.vl` match legacy's bytes in shadow.

## Census: 2,266 programs

The population is the regen-11 red list (without `wit/`), every capability probe, and
`tests/cases/{objects,records,unions,soundness,structs}`. Base is `d8bb4ba1d`.

| | base | head |
|---|---:|---:|
| claimed functions | 14,472 | 14,475 |
| unclaimed functions | 152 | 144 |
| claimed start bodies | 1,852 | 1,857 |
| claimed lost | — | 0 |
| `object field arm unbox` | 8 | 0 |
| `object field coercion` | 3 | 1 |
| `map store value variant box` | 1 | 3 |

Two `narrowed-arm-delivery-positions` start bodies (a test and a probe) get past the field and
stop at the map store's own unbox fence (`map store value variant box`), which is not in this
family.

## Positions

`scripts/capability-matrix.vl` on `record-literal-join-at-declared-record.matrix.vl`, with
`VL_IR_REQUIRE_CLAIM=1`, before and after: 24 cells go from "IR declined (object field coercion)"
to RUNS (binding, argument, struct field init and assign, array element, assign and push, local,
global init and assign, map value and set, capture, the block positions, and function body). There
are 0 runs → not-runs and 0 silent. On `maker-union-of-records-at-declared-record.matrix.vl` the
three struct-field cells (init annotated, assign in both faces) go from `object field arm unbox`
to RUNS. The other 5 refusals there are `array ref` and `map store value unbox` at the array and
map cells, and they fail the same way on base.

## Still open in the family

* `object field coercion`, record → record across rows (D17402,
  `structs/rowless-record-narrowed-to-arm-as-field.vl`).
* `object field coercion`, a list re-pointed at a smaller function set (D16916).
* `object field holder` (4) and `object field nulStrAtom` (2).
