# Step 7 slot layer, family B: can the checker's build record replace the struct-class storage readers? Measured, 2026-11-11

After #7238 (9a), `structIndexOfExpr`'s struct class is 353 programs. In each, the storage reader
answers a row that the rep read does not. The largest parts are `Ident` with no rep row (106),
`Index` element reads (89) and `Member` field reads (44). The storage readers answer from banks:

- the ref-list slot's element row (`rlElemStructRow`);
- the map-value slot (`mvValStructIdxOf`);
- the binding's stored row.

The orchestrator ruled to replace them with the checker's build record, after a probe proved
the two answers agree. This note is that probe. Nothing in the compiler changes. The probe was built on the
#7251 stack (`e4c6bfa1`), and never committed.

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
- **The literal-following extension of `recBuiltElemIn` is not worth building.** It would answer
  the 70 at most, and no storage reader would be deleted.

## The per-instance build column, probed: the call leg

A per-instance build column in `emit_elab` was the next candidate. It would extend
`elabNodeReps` (`elabNodeRepAt`, the per-instance build stamp of a literal) from literals to
reads. Two probes measured it.

- **The per-instance bank alone does not answer.** Take the literal's `elabNodeRepAt`, else the row
  of `nodeTyAt(rx, fnIx)`. At the struct-class nodes this matches the storage row at about 20
  nodes. About 280 nodes have no row for that type, and about 125 name another row. The
  store type (`rrStoreTy`) fails the same way.
- **The call leg, derived from elaboration.** For every call whose `structIndexOfCallStore`
  answers a struct row, the probe derived a row from elaboration: the callee instance's value
  leaves, a literal at `elabNodeRepAt(lit, fe)`, bindings and calls followed. It compared the
  canonical rows. 514 programs reach such a call:
  - 273 agree at every call;
  - 195 have no elaboration answer at some call (fn-value results, a relayed hole record, nested
    and nullable list results);
  - 46 disagree.

  The first disagreeing cell is `tests/cases/parser/call-first-stmt-then-brace-tail.vl`. There
  `mk1(n): Q1` has an annotated result, and the call's row is the declared result's row, which
  no literal stamp carries.

The call reader reads the callee instance's result-row column, `fRetStructIdx[fe]`. Its writer is
emit_collect's `fnRetCols*` / `fnRetColsFromRecorded`, one writer per instance, under rules no
literal stamp carries: the declared result, joins, fn-value results and the polymorphic
companion slot. Derived again in elaboration, the same rows would be a second derivation that
must stay equal to the column the module is built from.

## Ruling: a struct-class read's row is its storage column's row

The orchestrator's ruling. `structIndexOfExpr`'s dispatch on read kind is a syntax fact about
where the value is held. The row a read answers is its storage column's row. This holds while
every bank the dispatch consults is keyed by canonical type, and their rows are read canonical
(`sRowCanonOf`, #7214 and #7226):

| read | bank | writer | keyed by canonical type today |
| --- | --- | --- | --- |
| call | `fRetStructIdx` (`fnRetStructIndexSid`) | emit_collect `fnRetCols*`, one per instance | yes. The row is the result rep's slot; graded by design |
| binding | param row, declared local row, global cell (`globalCellStructIdx`), capture, frame `let` cell (`letCellSlot`) | the slot layer's cell kinds | by the binding's stored type through the cell kind; the VKind lane (w308) owns the rest |
| element | `rlElemStructRow` (ref-list bank) | `rlInternNameTy` | no. The key is `repElemIdOfNameTy(name, ty)`, half spelling; w311's ref-list key cut makes it so |
| map value | `mvValStructIdxOf` (map-value bank) | the mv mint | yes. The bank stores a rep record (#7157), and its name producers are 0 |
| field | `sFieldTgtStructIdx` (struct field table) | `pushFieldRow` | by field code and element name; w314's `sFieldStoreTy` cut makes it so |

So the struct class is not converted further in Family B. It closes when the ref-list key (w311)
and the field store column (w314) land.

## What is left of Family B

The struct and variant name producers that `2026-11-11-step7-closing-census-2.md` lists. Live
call sites on master `f570d7f7`, before this lane's #7214, #7226, #7238 and #7251 merge:

| producer | sites |
| --- | --- |
| `variantIndexOf` | 53 |
| `structIndexByName` | 27 (answers the canonical row from #7214) |
| `structRowOfSpelling` | 7 |
| `armFieldStructRow` | 4 |
| `structRowOfNameTy` | 4 |
| `structRowOfAnnTy` | 4 (3 after #7251) |
| `structIndexOfTypeName` | 3 (its two yes-or-no callers read the type since #7175) |
| `repStructRowByName` | 2 |
| `shapeElemDeclaredStructIdx` | 2 |
| `structIndexOfTypeNameTy` | 1 |
| `structIndexOfTypeNameGo` | 1 |

The proposed next cut is **`variantIndexOf`'s 53 sites, graded by where the name comes from**, as
the census did for the 63 sites in #7135:

- a declaration's own name: by design;
- an annotation, an `is` test or a cast: `annDeclVariantRow` / `declVariantRowAt` (#7139, #7150,
  #7165);
- a banked spelling: the bank's own cut;
- the type's first name: `repVariantShapeRowOf` or the declaration column.

Its witnesses are the Family B classes: MIX, where an arm shares its type with a standalone
record, and ARM2, where two unions' arms share one type.
