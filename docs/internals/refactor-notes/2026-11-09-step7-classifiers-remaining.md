# Step 7: the 42 classifiers that remain, and the fact each would need, 2026-11-09

This is the input for deciding how step 7's classifier half finishes. It covers every classifier
`classifier-census.vl` probes after round 26 (`2026-11-09-step7-classifier-r26.md`). All 42 are
post-only.

**Where the numbers come from.**

* Calls and files are one census of the 23,814-program sweep population, run with `--callers
  --keep`. That census ran beside round 26's shadows, so its answers are master `67329a97`'s.
* Callers are the post-mono calls by calling function, read off the kept chunk rows through the new
  `sites.tsv`. The table gives the number of distinct callers and the top ones.
* Agreement is the best typed twin any round recorded, with the round. "None" means no round has
  shadowed a post-mono twin. Every count is calls, not programs. A twin's count is from its own
  round's tree, so it can exceed today's calls (`exprIsNulNone`).

**Update, 2026-11-10** (`2026-11-10-step7-hole-rep-and-kept-row.md`): 41 probed. `cloValueCallRetKind`
reads the callee's type and leaves the probe set. Group 8's fact is provided. `fieldCodeCellKind`
reads the emitter's storage and belongs with group 1.

Grouped by the missing fact. Each group says whose fact it is: a CHECKER fact (the checker owns
types) or an EMITTER rep fact (the emitter reconciles reps).

## 1. The answer is the emitter's own storage, and needs nothing new (8)

These read the cell, field code, companion slot or descriptor that the emitter writes the value
with. Under the rulings, that is the rep the emitter reconciles. A typed reader that disagrees
names the type's row where the storage holds another (round 21's slot twins, round 23's field-code
finding). **Recommendation: these stay.** Each can move to `NOT_BLIND` with its reason in the
census, as `captureValKind` and `capturedKindOf` did in round 25.

| classifier | calls (files) | callers | best twin | why the legacy answer is right |
| --- | --- | --- | --- | --- |
| `globalReadStructIndex` | 706,271 (9,904) | 1: `structIndexOfIdentExpr` | struct slot of the rep, 627,539 / 79,348 (r21) | It is the row `emitGlobalSection` writes the cell at (`globalCellStructIdx`, D842). The twin's slot is a different numbering. |
| `capturedStructIndex` | 555,691 (8,404) | 1: `structIndexOfIdentExpr` | none | The capture's companion slot, gated on `capturedKindOf`. A capture is keyed by name by design (r25). |
| `memberUnionFieldName` | 203,123 (11,035) | 1: `memberUnionFieldNameRead` | none post-mono (r16 pre-mono row rung 10 / 0) | The `FC_UNION` field's element name in the receiver's struct or narrowed variant table. |
| `armFieldUnionName` | 178,785 (10,937) | 1: `memberUnionFieldNameRead` | none | The same, for a declared union arm, which has no standalone struct row (D219, D4636). |
| `readIndexStoreKind` | 64,542 (4,858) | 1: `readStoreOf` | none | The kind an element or map-value slot stores. It is blind only through `mapReadMvSlot` (group 6). |
| `fnRetStructIndexSid` | 52,352 (2,270) | 1: `structIndexOfCallExpr` | none | The callee's rep descriptor slot, gated on its kind (D26, D1788). The callee is resolved by name and frame. |
| `memberIsClosure` | 35,572 (4,549) | 2: `cloValueCallRetKind` 20,787, `exprIsClosure` 14,785 | the field typed as a function: 19,989 / 788 at its caller (r23) | The field code is the rep fact. A hole or generic function field (`{f:(_)=>_}`, D6342) is typed as a function and holds no closure. |
| `recBuildRowOf` | 34,211 (8,969) | 2: `objLitBindDestRow` 30,689, `arrLitBuild` 3,522 | none | Already a CHECKER fact: the checker's record solve (`recBuildTyOf`). The census counts it as blind because it reads the solve's side table, not the arena. |

## 2. A hole has no covered rep (4)

The checker leaves the type a hole, or a function type over a type variable, and binds it per call.
The storage the emitter minted for it is the only answer. **This is an EMITTER rep fact**: the
covered rep of a hole field or binding, recorded where the row is minted (the step 6 storage
column) so a typed reader can ask for it. Recording it in the type would be the checker choosing a
type mono should choose, so it stays a rep record.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `calleeRetKindOfRead` | 223,664 (9,866) | 4: `exprUnionCall` 132,861, `calleeReturnsStringOfRead` 49,593, `callIsNulNone` 24,901 | the read's type at the instance, its `$fnsig` key's result, 216,222 / 7,442 (2026-11-10) | 6,722 of the 7,442 are the binding's producer lambda, keyed where its signature is interned (`cloSigKeyExt`). The read's type is a hole function (5,470), no function (675) or a function over a type variable (576). Record that key per binding declaration there. |
| `calleeReturnsStructIdxOfRead` | 34,723 (1,789) | 1: `structIndexOfCallExpr` | the same key's struct slot, 34,739 / 20 (2026-11-10) | Same as `calleeRetKindOfRead`. |
| `fieldCodeCellKind` | 847 (438) | 1: `readCellKind` | none needed | It answers only where the field's recorded storage type is a hole or `nulnone`, from the code `sFieldTypes` holds for the row. The code is written at mint and rewritten in place, so a copied column would go stale. It reads the emitter's storage: **group 1** (its `NOT_BLIND` move goes with that lane). |
| ~~`cloValueCallRetKind`~~ | switched 2026-11-10 | | the callee's type is a function, a field stored as a closure; 38,859 / 189, wasm byte-identical in 23,816 of 23,816 | — |

## 3. Function-value list rows (8)

The row is the joined function set's, or an open closure element's bound signature, and the
element's type names a narrower set or none (D15561, D12301, D12215, D6914). **This is an EMITTER
rep fact, and it is lane w254's** (`check_fn_tag`, `check_mint`, `emit_elab`). Once a list of
function values, or a record holding one, has its stored row recorded at the node that builds it,
`listRowOfExpr` covers these. Then `refListSlotOfExpr`'s and `refListKeptSlotOfExpr`'s ladders,
and `forInVarStructIdx`'s fallback, can go.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `cloArrCallRetKind` | 217,132 (10,552) | 2: `exprUnionCall` 147,179, `exprString` 69,953 | the call type's rep, 3,749 / 211,941 (r21) | It answers for the element signature the list stores, not the node. The twin is the wrong question. The right twin is the stored row's signature. |
| `refListSlotOfExpr` | 142,613 (5,761) | 64: `exprVariantIndex` 31,045, `nulVariantIdxOfExpr` 23,128, `indexElemUnionSlot` 12,689 | the rep row, else the type's row, 144,742 / 2,187 (r24) | Function-value lists (93 of 175 `tests/cases/closures/` files) and bundle-record holders. |
| `refListKeptSlotOfExpr` | 23,481 (965) | 2: `refListSlotOfExpr` 23,297, itself 184 | the rest of `refListSlotOfExpr`'s ladder, 14,316 / 2,000 (r25) | The same families: kept row 0 against a type that keys none (1,654). |
| `forInVarStructIdx` | 8,456 (2,174) | 2: `declareForInLocals` 8,196, `captureValStructIdx` 260 | typed except the reflist fallback, 8,441 / 15, wasm identical in 2,174 of 2,174 (r26) | One call: a loop over a list of hole-function lists (`hole-fn-list-reached-through-alias-called-in-callback.vl`). |
| `arrLitObjRowTy` | 6,532 (234) | 1: `arrLitRowTyIn` | the lead element's structural or variant row, 6,296 / 6 (r25) | `[{ fs: [inc0] }]`: the context row is the joined set's (`returned-lists-of-records-take-the-joined-set-runs.vl`). |
| `mfResultSlotOf` | 4,526 (1,194) | 5: `mfScan` 1,963, `emitMapFilter` 1,908, `exprEmittedRefListSlot` 598 | the `.slice` / `.filter` call type's row, 4,512 / 14 (r24) | `generic-fn-list-written-then-called.vl`, `hole-fn-list-*`. |
| `cloArrElemSelfKey` | 2,933 (394) | 1: `cloIndexCalleeSigKey` | the element's interned `sigKeyOfTy`, 1,293 / 79, plus 2,661 typed-only (r12) | A lambda literal's own key, which no type records. Not ablated. |
| `cloPinnedListElemKey` | 690 (51) | 1: `cloCallSigKey` | the same reader, 1,334 / 142 (r12) | The same. |

## 4. A closure bundle and the `fRet*` columns (3)

A function that returns its bundle parameter returns a record the mono bundle ledger knows
(D15142, D15146). `fRetKind` keeps `i32` for closure, list and variant results. **This is an
EMITTER rep fact.** Recording the bundle in the type was refused (r7). `fnRecordedRetTy` records the
`TyFunc`. Providing it means a delivered-bundle rep row per function (`elabCallBundleRet`), which
the cloRet* bundle arm reads today. It also needs lane w168's columns.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `cloRetValKind` | 617,622 (7,256) | 10: `fnSigKeyOf` 235,301, `cloRetValSlot` 130,422, `emitOneFuncType` 68,132 | `repOfFnSlot(fe)`, 408,591 / 16,210 (r21) | `fRetKind`'s `i32` for closure, list and variant results. |
| `cloRetKindOf` | 236,705 (7,052) | 2: `fnSigKeyOf` 235,301, `collectMapFilterUse` 1,404 | `repOfFnSlot(fe)`, 189,231 / 7,497 (r21) | The same. |
| `cloRetValSlot` | 130,422 (6,620) | 4: `emitOneFuncType` 68,132, `emitCloSigFunctype` 61,660, `cloRetNulVariantRow` 427 | one reader over `cloRetResultTy`, 68,124 / 11 (cloret-slot-typed); bundle arm 2,593 / 142 | The delivered bundle record. The rest are a one-member intersection union, a result at another type index, and shape twins. |

## 5. The instance of a generic function value (2)

**A CHECKER fact, held by the instance key.** The checker records a module copy `const g = f` of a
generic `f` with a type variable (D9130, D3868), which keys no `$fnsig`. A template's result type
parameter has no rep until mono picks the instance. Providing it means the copy's recorded type
names the lifted lambda's instance (its call key), the way identity typing keys a callback
argument (step 3). That is checker work on the copy's binding, not a rep record.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `fnSigKeyOf` | 235,301 (7,052) | 3: `cloSigKeyExt` 177,737, `collectLiftedCloSig` 55,487, `collectCloSigs` 2,077 | parameter tokens and the result type's rep, 2 / 17 (r19, pre-mono, at templates) | The instance binding of a template's type parameter. No post-mono twin has been tried, so its post-mono agreement is unknown. |
| `moduleCopySigKey` | 7 (4) | 1: `calleeCloSigKeyOfRead` | the copied binding's type key, then the read's, 3 / 4 (r25) | D9130: the copy's instance key. |

## 6. A read's rep in the reader's own table (6)

These answer for the read: the narrowed value, or the cell the read loads. The node's rep answers
for the node, and `rdSlot` numbers its slot in the rep tree's vocabulary, not the struct, variant
or mv table the reader indexes (r20, r21). **This is an EMITTER rep fact:** a read rep
(`readRepOf`, which exists for some reads), with its slot in each table's own numbering. Providing
it means covering `Ident`, `Member`, `Index` and `Call` reads, and a slot translation per table. It
is the largest group by calls (5.3 M).

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `exprIsLitAtom` | 1,244,345 (18,523) | 59: `argsHaveAtom` 205,669, `letInitIsLitAtom` 166,051, `emitBinLitEq` 138,568 | `nodeRepIsAtom` or `nodeRepIsNulAtom`, 1,241,201 / 738 (r20) | The read's rep, not the node's. |
| `exprNulLitUnion` | 1,221,687 (15,527) | 14: `exprIsLitAtom` 906,466, `letSpellsNulAtom` 165,378, `emitAssignIdent` 107,891 | `nodeRepIsNulAtom`, 1,220,010 / 916 (r20) | The same. |
| `nulVariantIdxOfExpr` | 955,480 (18,406) | 17: `memRecvNulVariantIndex` 563,204, `exprNullableVariant` 134,001, `armFieldUnionName` 122,421 | the `nulvariant` rep's slot, 956,025 / 1,978 (r21) | `rdSlot` in the variant table's numbering. |
| `exprIsNulNone` | 658,605 (18,483) | 11: `emitExpr` 172,070, `retNullIntoNonNullRef` 152,813, `nulNoneEqSides` 148,081 | `nodeRepIs nulnone`, 973,949 / 23,562 (r20) | The read's rep. Its `Ident`/`Member`/`Index`/`Call` arm already asks `readRepOf`, and the rest is the `if` and `??` joins. |
| `unionNameOfRead` | 647,780 (11,790) | 18: `mapReadMvSlot` 316,254, `emitAssignIdent` 108,349, `unionNameOfExpr` 99,444 | none (its asker `unionIdentReadKind` was typed in r24, finding 77 legacy errors) | A union read's registered name: a by-name walk of parameters, `let`s and globals (D2316, D2325). The read's cell (`identStoreClaimed`) names the box. The union's registered name is the rep fact. |
| `mapReadMvSlot` | 492,182 (12,779) | 14: `mapReadNarrowableSlot` 156,405, `exprString` 47,984, `coalesceMvSlot` 46,934 | the `map`/`nulmap` rep's slot, 462,068 / 39,941 (r21) | `rdSlot` in the mv table's numbering. |

## 7. Layout twins and named rows (2)

**Mostly settled by the ruling that the structural struct row is canonical.** A layout twin shares a
heap type, so a typed answer that names the canonical twin is graded at the consumers, as round 26
did (2,174 programs byte-identical). What is left is a named alias or intersection row (`type AB =
A & B`, `type MyCat = Cat`). The structural reader finds no row under that type, and creating one
would be a mint on a miss in a question reader, which the rulings exclude. **EMITTER**: the
intersection's row minted where the binding's type is first lowered.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `structIndexOfExpr` | 3,497,142 (13,707) | 50: `structIndexOfMemberExpr` 2,245,964, `memRecvStructRow` 690,308, `binEqStructRow` 171,338 | `structRowOfRecordTy(nonNullTy(type))`, 3,485,215 / 44,649 (r20) | 7,670 layout twins (no fact needed; grade at the consumers), 24,245 where only the type names a row, and 12,734 where only the classifier does. Not ablated since round 20, which predates the canonical-row ruling (#7009). **Re-shadow first.** |
| `letCellSlot` | 224,897 (16,203) | 3: `letLocalSlot` 189,006, `emitGlobalSection` 27,126, `captureValStructIdx` 8,765 | per arm (r16, r23): struct/variant 20 / 10, reflist 11,024 / 35, nulmap switched | The named intersection row (struct arm). A hole element at a generic pin (reflist arm, group 2). An un-annotated `Map()`'s per-binding shape (r14). |

## 8. A rep rule's row that the type does not key (1)

`keep([mkcall()])` takes `Circle`'s rep (`recListRetTakesRep`) while its type is the call's own
`{ r: null }` (D14813). **Provided 2026-11-10**: the row is the callee instance's declared result
type, so `listRowOfExpr` reads it for a named call whose own type keys no row (`callRetListRow`).
The binding's `letRefListSlot` rung answers, and `letTailRowSlot`'s calls fall 8,251 → 7,947.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `letTailRowSlot` | 7,947 (613) | 1: `letRefListSlot` | the initializer's rep row, else the literal's, else the element's, 7,941 / 5 (2026-11-10) | The 5 are 4 lists of function values (`[id]`, `[[inc0]]`, `fs: [inc0]`): group 3. It follows `refListSlotOfExpr` now. |

## 9. A call's result at its callee's published join (1)

**A CHECKER fact.** A recursive self-call is recorded `<error>` (`checkCallOnFuncTy` publishes
`TY_ERR` while the result is inferred). `lit(0, z, z)` over `lit<i64, i64>` is recorded `i64` while
the instance joins its arms apart and returns the box. Providing it means re-recording the call
site's type once the callee's result is published. A first try at `inferRetPublish` still read
`<error>` (r21).

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `exprUnionCall` | 171,346 (9,294) | 1: `exprUnion` | `nodeRepIs union`, 170,462 / 9 (r21); switching made 2 programs invalid wasm | `recursive-fn-joins-runtime-numbers-apart.vl`, `numeric-join-held-back-through-a-wrapper.vl`. |

## 10. Not tried yet (6)

No round has shadowed these post-mono. They classify a list literal by its elements, so the
obvious twin is the literal's recorded type (`litRepTyAt`) or its rep. **These are the next round's
leads**, and no missing fact is known for them yet.

| classifier | calls (files) | callers |
| --- | --- | --- |
| `arrLitIsRefTpl` | 93,162 (9,205) | 3: `arrLitIsRef` 88,891, itself 3,793, `arrLitFrameRefTy` 478 |
| `arrLitNumKind` | 78,567 (9,196) | 5: `emitArrUnder` 39,824, `collectArrLitScalar` 25,043, `arrLitUnionElemName` 6,760 |
| `arrLitObjElemBoxVariant` | 18,578 (1,894) | 5: `arrLitElemHintTy` 7,203, `arrLitInstElemRow` 4,709, `arrLitElemKindTpl` 2,791 |
| `arrLitInstElemRow` | 14,883 (4,093) | 3: `arrLitRowTyIn` 7,150, `arrLitElemName` 7,049, `arrLitKeptRowSlot` 684 |
| `refListElemNameOfExprRaw` | 7,595 (454) | 1: `refListElemNameOfExpr` (asked only when `listRowOfExpr` has no row) |
| `arrLitElemNameTpl` | 7,049 (4,037) | 1: `arrLitElemName` |

## 11. Follows another classifier (1)

| classifier | calls (files) | callers | why |
| --- | --- | --- | --- |
| `captureValStructIdx` | 15,374 (1,654) | 4: `tsCloEnv` 9,861, `emitOneFuncType` 4,011, `capturedCompanionSlot` 1,336 | Its `let` arm is `letCellSlot` (r25, 8,765 / 0) and its loop-variable arm is `forInVarStructIdx`. It leaves the probe set when both do. |

## Summary for the ruling

| missing fact | owner | classifiers | calls | touches |
| --- | --- | --- | --- | --- |
| none: the emitter's own storage | emitter (provided) | 8 | 1.83 M | D842, D219, D4636, D26, D1788, D6342 |
| covered rep of a hole (a binding's producer key) | emitter | 2 (+1 switched, +1 to group 1) | 0.26 M | D6271, D6342 |
| function-value list rows | emitter, lane w254 | 8 | 0.41 M | D15561, D12301, D12215, D6914 |
| closure bundle, `fRet*` columns | emitter, lane w168 | 3 | 0.98 M | D15142, D15146 |
| generic instance key | checker | 2 | 0.24 M | D9130, D3868 |
| read rep in the table's numbering | emitter | 6 | 5.22 M | D2316, D2325 |
| named intersection row | emitter (mint excluded today) | 2 | 3.72 M | `struct-alias-transparent.vl` |
| rep-rule row (`recListRetTakesRep`) | emitter (provided) | 1, now group 3's residual | 0.01 M | D14813 |
| callee's published join | checker | 1 | 0.17 M | (the two r21 witnesses) |
| not tried yet | ? | 6 | 0.22 M | none |
| follows the others | — | 1 | 0.02 M | none |

Two of these facts are the checker's: the instance key of a module copy of a generic, and the call
site re-recorded at its callee's published join. Every other fact is a rep record the emitter
already computes and does not keep where a typed reader can ask for it. Group 1's eight stay unless
the orchestrator rules otherwise. Group 10's six and a re-shadow of `structIndexOfExpr` against the
canonical row are the cheap next round.
