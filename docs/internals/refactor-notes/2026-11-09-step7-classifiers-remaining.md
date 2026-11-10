# Step 7: the 42 classifiers that remain, and the fact each would need, 2026-11-09

This is the input for deciding how step 7's classifier half finishes. It covers every classifier
`classifier-census.vl` probes after round 26 (`2026-11-09-step7-classifier-r26.md`). All 42 are
post-only.

**After round 27** (`2026-11-10-step7-classifier-r27.md`) 32 are probed, and 31 after #7031 deleted `moduleCopySigKey`. Round 28 (`2026-11-10-step7-classifier-r28.md`) graded `arrLitIsRefTpl` and `arrLitNumKind` at their consumers and switched neither. Group 1's eight are
`NOT_BLIND` (the census's `STORAGE_READERS`, each with its reason), and group 10's
`arrLitObjElemBoxVariant` and `arrLitInstElemRow` read the literal's recorded types. The tables
below keep the eight ruled-out rows for their reasons and mark each change.

**Where the numbers come from.**

* Calls and files are one census of the 23,814-program sweep population, run with `--callers
  --keep`. That census ran beside round 26's shadows, so its answers are master `67329a97`'s.
* Callers are the post-mono calls by calling function, read off the kept chunk rows through the new
  `sites.tsv`. The table gives the number of distinct callers and the top ones.
* Agreement is the best typed twin any round recorded, with the round. "None" means no round has
  shadowed a post-mono twin. Every count is calls, not programs. A twin's count is from its own
  round's tree, so it can exceed today's calls (`exprIsNulNone`).

**After the hole-rep round** (`2026-11-10-step7-hole-rep-and-kept-row.md`) 29 are probed.
`cloValueCallRetKind` reads the callee's type, group 8's fact is provided, and `fieldCodeCellKind`
reads the emitter's storage, so it joins group 1 in `STORAGE_READERS`.
Then `2026-11-10-step7-hole-rep-read-key.md`: 2 fewer (26 on master `cc8c522e`'s tree). Both callee-read classifiers read one typed key
(`readCloSigKey`) and are deleted, so group 2 is closed.

Grouped by the missing fact. Each group says whose fact it is: a CHECKER fact (the checker owns
types) or an EMITTER rep fact (the emitter reconciles reps).

## 1. The answer is the emitter's own storage, and needs nothing new (8)

These read the cell, field code, companion slot or descriptor that the emitter writes the value
with. Under the rulings, that is the rep the emitter reconciles. A typed reader that disagrees
names the type's row where the storage holds another (round 21's slot twins, round 23's field-code
finding). **Recommendation: these stay.** Each can move to `NOT_BLIND` with its reason in the
census, as `captureValKind` and `capturedKindOf` did in round 25. **Done in round 27**: all
eight are in `classifier-census.vl`'s `STORAGE_READERS`, with the reasons below.

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
| ~~`calleeRetKindOfRead`~~ | deleted 2026-11-10 | | `readCloSigKey`: the read's closed type, else its declaration's initializer's lowered key, a parameter's or annotation's instance type, or the read's own type; 360,269 / 363 by key, wasm byte-identical in 10,337 of 10,337 reaching files | The binding's covered rep is its producer's lowered key, which the declaration link reaches. |
| ~~`calleeReturnsStructIdxOfRead`~~ | deleted 2026-11-10 | | the same key's struct slot | — |
| `fieldCodeCellKind` | 847 (438) | 1: `readCellKind` | none needed | It answers only where the field's recorded storage type is a hole or `nulnone`, from the code `sFieldTypes` holds for the row. The code is written at mint and rewritten in place, so a copied column would go stale. It reads the emitter's storage: **group 1**, in `STORAGE_READERS` since 2026-11-10. |
| ~~`cloValueCallRetKind`~~ | switched 2026-11-10 | | the callee's type is a function, a field stored as a closure; 38,859 / 189, wasm byte-identical in 23,816 of 23,816 | — |
| `unionNameOfHoleRead` | 72,498 (877) | 1: `unionNameOfRead` | none | A name read whose type keeps a hole the instance does not bind: `const x = a.h` in an un-annotated parameter's instance boxes at the instance's join (D15628), `m.get("b")` over a map of hole functions at `i32 \| null`. The box the binding was stored as is the fact. Split out of `unionNameOfRead` 2026-11-10. |

## 3. Function-value list rows (8)

The row is the joined function set's, or an open closure element's bound signature, and the
element's type names a narrower set or none (D15561, D12301, D12215, D6914). **This is an EMITTER
rep fact, and it is lane w254's** (`check_fn_tag`, `check_mint`, `emit_elab`). Once a list of
function values, or a record holding one, has its stored row recorded at the node that builds it,
`listRowOfExpr` covers these. Then `refListSlotOfExpr`'s and `refListKeptSlotOfExpr`'s ladders,
and `forInVarStructIdx`'s fallback, can go.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| ~~`cloArrCallRetKind`~~ | switched 2026-11-10 | | the result of `cloCallSigKey`, the key the call is lowered with; `STORAGE_READERS` ([notes](2026-11-10-step7-fnlist-rows-3.md)) | — |
| `refListSlotOfExpr` | 142,613 (5,761) | 64: `exprVariantIndex` 31,045, `nulVariantIdxOfExpr` 23,128, `indexElemUnionSlot` 12,689 | the rep row, else the type's row, 144,742 / 2,187 (r24) | Function-value lists (93 of 175 `tests/cases/closures/` files) and bundle-record holders. |
| `refListKeptSlotOfExpr` | 23,481 (965) | 2: `refListSlotOfExpr` 23,297, itself 184 | the rest of `refListSlotOfExpr`'s ladder, 14,316 / 2,000 (r25) | The same families: kept row 0 against a type that keys none (1,654). |
| `forInVarStructIdx` | 8,456 (2,174) | 2: `declareForInLocals` 8,196, `captureValStructIdx` 260 | typed except the reflist fallback, 8,441 / 15, wasm identical in 2,174 of 2,174 (r26) | One call: a loop over a list of hole-function lists (`hole-fn-list-reached-through-alias-called-in-callback.vl`). |
| `arrLitObjRowTy` | 6,532 (234) | 1: `arrLitRowTyIn` | reads the row `emitObj` builds the lead record literal at: **group 1**, in `STORAGE_READERS` since 2026-11-10 ([notes](2026-11-10-step7-mfresult-objrow.md)) | none needed |
| ~~`mfResultSlotOf`~~ | switched 2026-11-10 | | the `.filter`/`.slice` arm reads the call type's row, else its receiver's; 0 disagreements, 52 of 52 reaching files byte-identical ([notes](2026-11-10-step7-mfresult-objrow.md)) | — |
| `cloArrElemSelfKey` | 2,933 (394) | 1: `cloIndexCalleeSigKey` | the element's interned `sigKeyOfTy`, 1,293 / 79, plus 2,661 typed-only (r12) | A lambda literal's own key, which no type records. Not ablated. |
| ~~`cloPinnedListElemKey`~~ | deleted 2026-11-10 | | its rung fed no lowering: 1,489 reaching files byte-identical without it ([notes](2026-11-10-step7-fnlist-rows-3.md)) | — |

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
| ~~`fnSigKeyOf`~~ | switched 2026-11-10 | | each parameter type's token at the instance, an unbound variable at `elabUnboundTpTy`, a tagged set as its id; 7,001 of 7,064 reached files byte-identical, 61 the same refusal, 2 the same output ([notes](2026-11-10-step7-fnsigkeyof-typed.md)) | — |
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
| `exprIsLitAtom` | 1,244,345 (18,523) | 59: `argsHaveAtom` 205,669, `letInitIsLitAtom` 166,051, `emitBinLitEq` 138,568 | `nodeRepIsAtom` or `nodeRepIsNulAtom`, 1,241,201 / 738 (r20) | The read's rep, not the node's. A value `if` is `nodeRepIsAtom` of the join since 2026-11-10. What keeps it probed is the `??` arms: the join's rep loses 6 programs ([notes](2026-11-10-step7-lit-atom-joins.md)). |
| ~~`exprNulLitUnion`~~ | switched 2026-11-10 | | a value `if` and a `??` are `nodeRepIsNulAtom` of the join; a parameter read is its annotation's rep (`paramTypeNodeOfRead`); the rest read storage; 23,836 of 23,836 byte-identical ([notes](2026-11-10-step7-lit-atom-joins.md)) | — |
| ~~`nulVariantIdxOfExpr`~~ | switched 2026-11-10 | | reads the read rep's storage row (#7029); a value `if` or a non-map `??` is the row of its join's own type when it reps as `nulvariant`; 23,834 of 23,834 byte-identical ([notes](2026-11-10-step7-nulnone-nulvariant-joins.md)) | — |
| ~~`exprIsNulNone`~~ | switched 2026-11-10 | | reads ask their storage (#7032); a value `if` or a `??` is `nodeRepIs nulnone` of the join; 23,834 of 23,834 byte-identical ([notes](2026-11-10-step7-nulnone-nulvariant-joins.md)) | — |
| ~~`unionNameOfRead`~~ | switched 2026-11-10 | | the name `regUnionNameOfTy` gives the read's storage type (`readStoreTyAt`), a nullable box with no row of its own at its inner union's, a hole at the instance's binding; 0 `runs → not-runs` in 23,826, D4203 closed ([notes](2026-11-10-step7-union-name-of-read.md)) | The by-name walk stays as `unionNameOfHoleRead` for a hole the instance does not bind: group 2. |
| `mapReadMvSlot` | 492,182 (12,779) | 14: `mapReadNarrowableSlot` 156,405, `exprString` 47,984, `coalesceMvSlot` 46,934 | the `map`/`nulmap` rep's slot, 462,068 / 39,941 (r21) | `rdSlot` in the mv table's numbering. |

## 7. Layout twins and named rows (2)

**Mostly settled by the ruling that the structural struct row is canonical.** A layout twin shares a
heap type, so a typed answer that names the canonical twin is graded at the consumers, as round 26
did (2,174 programs byte-identical). What is left is a named alias or intersection row (`type AB =
A & B`, `type MyCat = Cat`). The structural reader finds no row under that type, and creating one
would be a mint on a miss in a question reader, which the rulings exclude. **EMITTER**: the
intersection's row minted where the binding's type is first lowered. **Done 2026-11-10**
([notes](2026-11-10-step7-named-alias-rows.md)): the alias's row is keyed by its type where the
declaration is lowered, and both classifiers still disagree on facts of other groups.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `structIndexOfExpr` | 3,497,141 (13,707) | 50: `structIndexOfMemberExpr` 2,245,964, `memRecvStructRow` 690,308, `binEqStructRow` 171,338 | `structRowOfRecordTy(nonNullTy(nodeTyAt))`, 3,452,888 agree + 3,736 layout twins / 40,517 (r27) | Re-shadowed in r27. 17,111 typed-only calls are union arm values, whose layout is `exprVariantIndex`'s (D34). 16,674 name a record's build row where the type names the declared one (`nested-record-built-wider-beside-own-binding-runs.vl`), and the literal's `litRepTyAt` row covers 431 of them. Missing: the read's built-at row (group 6's read rep). Named alias rows are keyed by their type since 2026-11-10, and against `repStructRowOfTy` no disagreement has an alias type (453 calls moved, [notes](2026-11-10-step7-named-alias-rows.md)). |
| `letCellSlot` | 224,897 (16,203) | 3: `letLocalSlot` 189,006, `emitGlobalSection` 27,126, `captureValStructIdx` 8,765 | struct arm 18 / 19 (2026-11-10); reflist 11,024 / 35 (r23), nulmap switched | The struct arm's one miss is a binding stored at its generic callee's wider row (group 9). A hole element at a generic pin (reflist arm, group 2). An un-annotated `Map()`'s per-binding shape (r14). |

## 8. A rep rule's row that the type does not key (1)

`keep([mkcall()])` takes `Circle`'s rep (`recListRetTakesRep`) while its type is the call's own
`{ r: null }` (D14813). **Provided 2026-11-10**: the row is the callee instance's declared result
type, so `listRowOfExpr` reads it for a named call whose own type keys no row (`callRetListRow`).
The binding's `letRefListSlot` rung answers, and `letTailRowSlot`'s calls fall 8,996 → 8,782.

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `letTailRowSlot` | 8,782 (613) | 1: `letRefListSlot` | the initializer's rep row, else the literal's, else the element's, 7,941 / 5 (2026-11-10) | The 5 are 4 lists of function values (`[id]`, `[[inc0]]`, `fs: [inc0]`): group 3. It follows `refListSlotOfExpr` now. |

## 9. A call's result at its callee's published join (1)

**A CHECKER fact.** A recursive self-call is recorded `<error>` (`checkCallOnFuncTy` publishes
`TY_ERR` while the result is inferred). `lit(0, z, z)` over `lit<i64, i64>` is recorded `i64` while
the instance joins its arms apart and returns the box. Providing it means re-recording the call
site's type once the callee's result is published. A first try at `inferRetPublish` still read
`<error>` (r21).

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| `exprUnionCall` | 171,346 (9,294) | 1: `exprUnion` | `nodeRepIs union`, 170,462 / 9 (r21); switching made 2 programs invalid wasm | `recursive-fn-joins-runtime-numbers-apart.vl`, `numeric-join-held-back-through-a-wrapper.vl`. |

## 10. List-literal classifiers (4 left of 6)

Round 27 shadowed all six. Two are switched and leave the probe set: `arrLitObjElemBoxVariant`
(the recorded union and the lead's adopted arm, 18,578 / 0) and `arrLitInstElemRow` (the lead's
build row, 14,881 / 0). The four left:

| classifier | calls (files) | callers | best twin | missing fact |
| --- | --- | --- | --- | --- |
| ~~`arrLitIsRefTpl`~~ | switched 2026-11-10 | | its blind default reads the emitter's build for the literal's recorded type (`listBuildOfTyHeld`); all 23,842 sweep programs byte-identical ([notes](2026-11-10-step7-isref-tpl-default.md)) | — |
| `arrLitNumKind` | 78,567 (9,196) | 5: `emitArrUnder` 39,824, `collectArrLitScalar` 25,043, `arrLitUnionElemName` 6,760 | **Switched** to the width of `litRepTyAt`'s element, by ruling: 23 programs build different wasm with the same output (`2026-11-10-step7-arrlitnumkind-rep-width.md`). | none |
| ~~`refListElemNameOfExprRaw`~~ | deleted 2026-11-10 | | after #7070 its 3 calls were `__array_new__` record fills, which name the element record's canonical row ([notes](2026-11-10-step7-rlen-raw-deleted.md)) | — |
| ~~`arrLitElemNameTpl`~~ | switched 2026-11-10 | | its one blind rung, a list of lists' scalar leaf, reads the inner literal's recorded rep; 448 of 450 reaching files byte-identical, 2 lose a dead row ([notes](2026-11-10-step7-elemname-tpl-leaf.md)) | — |

## 11. Follows another classifier (1)

| classifier | calls (files) | callers | why |
| --- | --- | --- | --- |
| `captureValStructIdx` | 15,374 (1,654) | 4: `tsCloEnv` 9,861, `emitOneFuncType` 4,011, `capturedCompanionSlot` 1,336 | Its `let` arm is `letCellSlot` (r25, 8,765 / 0) and its loop-variable arm is `forInVarStructIdx`. It leaves the probe set when both do. Neither moved in r27. |

## Summary for the ruling

| missing fact | owner | classifiers | calls | touches |
| --- | --- | --- | --- | --- |
| none: the emitter's own storage (`NOT_BLIND` since r27) | emitter (provided) | 8 → 0 | 1.83 M | D842, D219, D4636, D26, D1788, D6342 |
| covered rep of a hole (a binding's producer key) | emitter (provided) | 0 (2 deleted, 1 switched, 1 to group 1) | — | D6271, D6342 |
| function-value list rows | emitter, lane w254 | 8 | 0.41 M | D15561, D12301, D12215, D6914 |
| closure bundle, `fRet*` columns | emitter, lane w168 | 3 | 0.98 M | D15142, D15146 |
| generic instance key | checker | 2 | 0.24 M | D9130, D3868 |
| read rep in the table's numbering | emitter | 6 | 5.22 M | D2316, D2325 |
| named intersection row | emitter, keyed at the declaration (2026-11-10) | 2 | 3.72 M | `struct-alias-transparent.vl`, D14162 |
| rep-rule row (`recListRetTakesRep`) | emitter (provided) | 1, now group 3's residual | 0.01 M | D14813 |
| callee's published join | checker | 1 | 0.17 M | (the two r21 witnesses) |
| list-literal classifiers (r27: 2 switched) | emitter, partly lane w254 | 6 → 4 | 0.19 M | tagged id lists |
| follows the others | — | 1 | 0.02 M | none |

Two of these facts are the checker's: the instance key of a module copy of a generic, and the call
site re-recorded at its callee's published join. Every other fact is a rep record the emitter
already computes and does not keep where a typed reader can ask for it. Round 27 moved group 1's
eight to `NOT_BLIND`, switched two of group 10's six, and re-shadowed `structIndexOfExpr` against
the canonical row. The probe count is 32.
