# The I8 edges into stage B: 15 of 24 proven (2026-11-26)

`ir-i8-sweep.sh --edges` lists 24 static calls from a kept function into a stage-B function. A
proven edge (`scripts/ir-i8-census/edges-proven.txt`) is one the IR never takes, so the I8 PR may
delete its arm (cutover §8 step 4). Before this note 1 was proven.

Method: a static reading per edge (master b1bdf2f6c), and the regeneration-8 draft (where every
stage-B callee is a failing stub) over all 9,333 `tests/cases` programs and capability probes:
no program reached a stub.

| status | edges |
|---|---|
| proven (14 added) | armRecvPush, emitDelivered, emitEmptyArrUnionArm, emitListGetIdx, emitListGetRecv, emitNulIsNullTest ×3 (emitExpr, emitMapHas, emitDeadNullTest), emitInstMapReadIsNull, emitRecCopyFields, emitUnionBoxNulNiche ×2, emitUnionBoxOwed→emitUnionBoxArg, emitNumUnionRebox |
| latent: reached once a miss before it is covered | emitStrValue→emitAtomToStr, emitStrValue→emitExpr, arrLitDataElemExpr→emitExpr, arrLitDataElemExpr→emitWidened |
| a static path, its shape not taken on the draft | rcReadSource→emitExpr, emitNulIsNullTest→emitOptChainIsNull |
| open | emitChainRead→emitExpr, emitIdxIndex→emitExpr, refListReadAt→emitExpr |

The four latent edges sit behind one miss: a `for` over a list literal whose elements are not
constants (a literal-union atom, a narrowed string, a mutable global) is hoisted through
`irForLitHoist -> hoistInRangeCopy -> arrLitHoistGlobal`, which calls legacy's `emitStrValue` and
`arrLitDataElemExpr`. Today every such shape declines first with `non-stack temp: out of order`;
whoever covers that class gives the hoist an IR form for those elements, or the four edges become
reachable stubs.

The three open edges each hinge on one builder invariant: that every place side a record compare
accepts (`structEqPlaceSide`) was noted for a re-read (`irReadsAgain`). One producer that notes
nothing is `nullRecvField` (an `RGetField` over the recover of a variable); a proof shows it never
yields such a side, a refutation is a record compare over it.

`rcReadSource→emitExpr` needs a record copy whose source is a field read or a captured name; the
checker refuses the widening spelling (a shared record does not widen). `emitNulIsNullTest→
emitOptChainIsNull`'s shape (`p?.inner == q` with `p` non-null) runs on the draft without the stub.
