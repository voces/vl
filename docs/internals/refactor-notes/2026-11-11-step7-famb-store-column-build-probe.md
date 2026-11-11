# Step 7 slot layer, family B: can the checker's build record replace the struct-class storage readers? Measured, 2026-11-11

After #7238 (9a), `structIndexOfExpr`'s struct class is 353 programs. In each, the storage reader
answers a row that the rep read does not. The largest parts are `Ident` with no rep row (106),
`Index` element reads (89) and `Member` field reads (44). The storage readers answer from banks:

- the ref-list slot's element row (`rlElemStructRow`);
- the map-value slot (`mvValStructIdxOf`);
- the binding's stored row.

The orchestrator ruled to replace them with the checker's build record, after a probe proved
the two answers agree. This note is that probe. Nothing in the compiler changes. Base is master
`e4c6bfa1`'s stack (#7251), probed off-tree.

## Method

At every struct-class node (struct rep, not an arm value, rep row ≠ storage row), the probe
computed the checker's candidate record and compared its row (`repStructRowOfTy`) with the
storage reader's row (`structIndexOfExpr`, canonical):

- `callBuiltTy` first: a call's, or a binding's, built record (`check_store_rep`).
- Else, for an index read of a list-literal binding, the one record every element is built at.
- Else, for a field read of a record-literal binding, the record its field's value is built at,
  or the field of the record the receiver is built at.
- Else, for a read of a binding, its initializer's.

The controls agreed: `lists/unannotated-list-binding-element-built-at-wider-record.vl` and
`objects/unannotated-record-call-field-built-at-wider-record.vl` (`Index`, `Member` and `Ident`
all `agree`). The sweep covered 23,910 programs. Counts are **programs**:

| outcome | programs |
| --- | --- |
| reach a struct-class node | 343 |
| every node agrees | 51 |
| some agree, the rest have no checker answer | 19 |
| no checker answer at any node | 258 |
| some node **disagrees** | 15 |

By arm and node: `Ident` none 159, `Index` none 118, `Member` agree 32, `Index` agree 29,
`Member` none 29, `Ident` agree 22, `Call` none 16, `Call` differ 13, `Ident` differ 7.

## The 15 disagreements: per-instance builds

All 15 are generic or hole-function instances:

- `D9181`, `D9250` and `D9302`'s witnesses;
- `d15221_opt_dbl`, `_half`, `optb_dbl` and `optb_half` (`distilled/named`);
- `closures/hole-fn-inline-list-record-stored`, `hole-fn-map-record-lambda-returned` and
  `hole-fn-map-record-returned`;
- `soundness/mixed-instance-list-reach-runs`, `mixed-instance-unrelated-arguments-runs` and
  `record-list-literal-held-call-part-runs`;
- `conditionals/object-literal-arm-bodies`;
- `unions/record-literal-nested-kind-not-an-arm`.

`callBuiltTy` and the build table are per **node**. The emitter's storage rows are per
**instance**. Where two instances build one node at two records, the checker answers one of
them or neither, and the emitter stores each at its own. All 15 run today on the emitter's
answer, so they are not defects. A switch would make them clause-1 candidates.

## The 258 with no checker answer

No build record covers these reads:

- **map reads** (`m["k"]`): the mv slot is the only record of the value's row;
- **lists nested in lists or records**, and fn-tagged record lists (`closures/fn-tagged-ids-in-records-*`);
- **generic records handed through parameters** (`closures/generic-record-*`, `hole-fn-generic-map-*`).

## Grading

- **Not switched.** The checker's build record replaces the storage reader in 70 programs at
  most (51, plus the agreeing nodes of 19). It answers nothing in 258, and the wrong instance in
  15.
- **The record that would replace the storage readers is a per-instance build column:** for each
  `(node, instance)`, the record the value is built at. It would cover lists, maps and fields, and
  be written where elaboration builds the value. It belongs with the per-instance bank (#7205's
  instance readers) and step 5's records, not with the per-node build table in `check_fit_rules`.
- **The literal-following extension of `recBuiltElemIn` is not worth building.** It would answer
  the 70 at most, and no storage reader would be deleted.
