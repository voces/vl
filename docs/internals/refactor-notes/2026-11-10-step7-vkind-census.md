# Step 7: where a VKind is produced, the slot producers re-counted, and the three twin pairs, 2026-11-10

Census for step 7's "VKind becomes derived from the rep descriptor" and the slot layer it absorbs
(`architecture-target-2026-10.md` §3 step 7; `2026-11-10-step7-closing-census.md` "Absorbs").
Base is master `61d7d912` (#7091). The seed is a fixpoint: three `refresh-compiler.sh` runs are
byte-identical at 6,600,459 bytes.

The instrument is `vl run scripts/vkind-census.vl` (`--list`, `--slots`, `--slots-list`). It is a
text walk over `compiler/*.vl`. It finds producers by signature and by name, and it does not
resolve calls. Its families are a first sort; the tables below are graded by reading each body.

## 1. VKind producers

`VKind` is a declared closed set of 32 members (`emit_state.vl:516`). A value of it comes from one
of three places:

- a function whose result is `VKind` or `VKind | null`: **79** of them;
- a write to a stored `VKind` column: `fRetKind`, `localIsRef`, and the memo columns `gckVal`,
  `lckVal`, `rkMemoKind`, `irkMemoKind` and `frsSnapKind`;
- a local `let k: VKind` ladder (25 declarations). Most of these default a nullable answer to
  `"i32"`; the one ladder of real size is `declareForInLocals`' `fiLk`.

### 1.1 The 79 functions, graded

| family | n | members |
| --- | --- | --- |
| **the descriptor build** (`emit_rep.vl`) | 7 | `repTreeVKind`, `rtListVKind`, `rtNulElemListVKind`, `rtNulVKind`, `repNulObjKind`, `repKindOfSigTok`, `repSigKindOfTy` |
| **descriptor read** (the answer is a `.rdKind`, maybe defaulted) | 20 | `annRepKindOf`, `vtKindOfType`, `vtKindOfParam`, `exprListRep`, `exprNulKind`, `exprNulScalarListKind`, `readCellKind`, `nulNoneReadCellKind`, `readLoopElemRepKind`, `identStoreClaimed`, `fnSigKindOfTy`, `ifExprRefKindOf`, `refListElemKind`, `forInElemKind`, `forInPairElemKind`, `cloValueCallRetKind`, `letBindRepKind`, `repKindOfTyMemo`, `scalarListElemKind`, `nulScalarListKindOfNode` (but see §1.2) |
| **memo** over a producer | 3 | `letCellKind`, `globalCellKind`, `ifExprRefKind` |
| **stored column read** | 4 | `inferredRetKindCore` and `retResultVKind` (`fRetKind`), `cloRetValKind` (`fRetKind`, after `vtKindOfType`), `declaredKind` (`localIsRef`) |
| **kind algebra** (`VKind` → `VKind`) | 9 | `vkNulKindOf`, `vkNonNullRefTwin`, `vkNulNicheOf`, `nulNicheOrNull`, `nextListRep`, `nulListBase`, `listOfKind`, `listRepOrNull`, `scalarListElemOfListKind` |
| **dispatch** over other members of this table | 7 | `identStoreVKind`, `identCellVKind`, `capturedKindOf`, `captureValKind`, `cloArrCallRetKind`, `emptyArrHoleKind`, `emptyArrUnionArmKind` |
| **codec** of a second stored encoding | 19 | field code: `fieldCodeVKind`, `fieldCodeCellKind`, `listRepOfFieldCode`, `listRepOfFieldCodeFrom`, `nulScalarListCodeKind`; ref-list element code: `rlElemListRep`, `rlElemListRepFrom`, `pushDestVKind`, `mvListValKind`; mv value code: `mvScalarValKind`; `MfKind`: `listRepOfMf`, `spreadScalarVKind`; wasm type index: `listFitStoodKind`; value-atom code: `njVKind`; `$fnsig` token: `sigKeyRetKind`, `sigParamKindAt` (with `sigParamCoerceKind` over it); read-rep string: `readListKindOf`, `readNulVKind` |
| **arena-type ladder** outside the descriptor | 4 | `tyPrimLeafListKind`, `tyScalarBackedListKind`, `tyScalarListKind`, `tyListRepKind` |
| **rendered name** | 4 | `scalarListRepOfName`, `nulScalarListKind`, `annNulListKind`, `annUnionSigKind` |
| **syntax rung** inside a typed read | 3 | `letCellKindGo` (`holderRecordSigs` → `"struct"`), `ifExprRefKindAt` (an `ObjLit` arm → `"struct"`), `nulScalarListKindOfNode` (a `TypeRef`'s `tyName`, after `annRepKindOf` declines) |

The rows add to 80, because `nulScalarListKindOfNode` is in two of them: a descriptor read with a
rendered-name rung behind it.

**Already derived:** the 20 descriptor reads, the 3 memos and the 10 kind-algebra functions take
their kind from `repOf*(...).rdKind`, or are total maps over a kind that came from it. Leaving
out `nulScalarListKindOfNode`, that is **31 of 79**. With the 7 inside the descriptor, 38 of 79
are by design.

**Still producers:** the 4 arena-type ladders, the 4 rendered-name ladders, the 3 syntax rungs and
the 19 codecs. Together that is **30 functions**. The 4 column reads and 7 dispatchers inherit
whatever their source is.

### 1.2 Notes on the grading

- `scalarListElemKind` (19 call sites, the largest single reader) asks five predicates, and each
  predicate is `exprListRep(exprIx, fnIx) == <kind>`. It is a descriptor read done up to five times,
  not a ladder of its own.
- The descriptor itself derives the kind twice. `repOfTyFlat` builds it through 74 `repMk(kind, …)`
  calls, then `repOfTy` overrides it with the rep tree's projection, `repTreeVKind`, wherever the
  flat arms cover the type. Both derivations live in `emit_rep.vl`, and the tree's answer wins. That
  is "assigned in one place" at file granularity, not one function.
- `repKindOfSigTok` is the decoder half of the `$fnsig` token scheme. Its encoder twin is
  `repSigTokOfKind`, an exhaustive `match`. A token is a stored encoding of the kind, so the decoder
  stands as long as `$fnsig` keys are strings.

### 1.3 The column writers

- **`fRetKind`:** `buildFnMap` writes it (`emit_collect.vl:2067` and `:2076`), and so does
  `fnRetColsFromRecorded` (`:2504`, from `frcKind`, a `repOf` read). The annotated half is lane w287's
  `buildFnMap#2` work and is not converted here.
- **`localIsRef`:** written only by `addLocalSlot`. It has 9 callers:
  - `letLocalSlot` (`letCellKind`);
  - `gPromoSlot` (`globalCellKind`);
  - `declareForInLocals`, three times: the loop variable (`forInElemKind`, a descriptor read), the
    pair variable (`forInPairElemKind`, a descriptor read) and the `#l` iterable temp (`fiLk`);
  - four `"i32"` cursor temps.

  `fiLk` is a 60-line ladder that maps the element's kind to the iterable's list kind, with two
  syntax rungs (`forInStringSrc`, `forInU8Src`). It is the one local-ladder producer.

## 2. Slot producers, re-counted

`vl run scripts/vkind-census.vl -- --slots` matches functions named for a bank:
`struct{Idx,Index,Row,Slot}`, `variant{…}`, `refList`/`rl` `{Slot,Row}` and `mapVal`/`mv` `{Slot,Row}`.
It keeps those whose result is a number and drops setters, resets, builders, mints and predicates.
That is a lower bound: a producer whose name does not follow the pattern is not counted. This
census and §6.6 match on the node-input count (77).

| bank | n (§6.6) | node | type | name | slot/code | rep record | other |
| --- | --- | --- | --- | --- | --- | --- | --- |
| struct | 77 (57) | 36 | 11 | 12 | 17 | — | 1 |
| variant | 43 (36) | 24 | 4 | 4 | 10 | 1 | — |
| ref list | 31 (39) | 15 | 8 | 4 | 3 | — | 1 |
| map value | 21 (51) | 2 | 2 | 9 | 8 | — | — |
| **all** | **172 (183)** | **77** | **25** | **29** | **38** | **1** | **2** |

Graded by input:

- **Node input (77): mostly BY DESIGN under an existing ruling.** DECISIONS.md §"How step 7's
  classifier half finishes" rules that a read's row is the emitter's own storage, and every other
  node's is its rep's. `structIndexOfExpr` is that shape already: storage first, then
  `structIndexOfRep` (#7069, `2026-11-10-step7-struct-index-of-expr.md`). The `*Store` arms it
  dispatches to are its own body split up. What is left to grade is a node producer that is neither
  a storage read nor a rep read. This census does not separate those.
- **Type input (25): the bank's own resolvers.** `repSlotOfKind` (`emit_rep_slot.vl:46`) answers
  through them: `repStructRowOfTy`, `repVariantSlotRep`, `rlSlotOfTyOrTwin`, `rlSlotOfRowTy`,
  `mvSlotOfMapKeyKTys`. They are the descriptor's slot resolution, and BY DESIGN.
- **Name input (29): the conversion target.** Twelve struct, four variant, four ref-list and nine
  map-value producers key a row by a rendered name. This is the L2 §7 deviation's
  "minted under a name".
- **Slot/code input (38): cross-bank maps.** Examples are `variantRowOf(vi)`,
  `repStructSlotRep(si)` and `mvSlotKeyKind`. They index one bank by another's slot, and they stand
  while there are four banks.

`RepDesc.rdSlot` is -1 from `repOfTy`; only `repDescRet` (the return-descriptor columns) sets it.
"A read of the descriptor's slot" therefore means `repSlotOfKind(d.rdKind, ty)` today. That is a
question reader, and the rulings forbid a broad mint-on-miss there.

## 3. The three named twin pairs

| pair | syntax side | grade |
| --- | --- | --- |
| `repOfNode` / `repOfTy` | `repOfNodeAt(n, nodeTyAt(n, fn))`, with a hole-element and union-alias adjustment | **BY DESIGN**: a typed read |
| `structIndexOfExpr` / `structIndexOfTy` | storage first (name, field, element, call, join), else `structIndexOfRep`; an `ObjLit` takes its context's row | **BY DESIGN** under the storage ruling. `structIndexOfTy` is the bank's arena-type key reader, not a rep producer |
| `njKindOfExpr` / `njKindOfTy` | `njKindOfTy(nodeTyIxOf(ix))`, then three syntax rungs (`exprIsF64`, `exprIsF32`, `exprIsI64`) "where an instance left that open", then `0` | **a second producer** in its three fallback rungs. It has 3 call sites. Whether the rungs are reached is unmeasured; the next step is a `classifier-census.vl` probe on the rungs |

## 4. Conversion order, biggest and safest first

1. **`scalarListElemKind` becomes one descriptor read.** It is 19 call sites, and today it calls
   `exprListRep` up to five times. The new body is one `exprListRep` call and a total map from the
   list kind to its element kind. That replaces five walks with one. It should be byte-identical.
2. **The four arena-type ladders become `repOfTy(ty).rdKind`.** These are `tyPrimLeafListKind`,
   `tyScalarBackedListKind`, `tyScalarListKind` and `tyListRepKind`, with 5 live call sites and two
   forwarders. Their input is already a type. The risk is a type the flat descriptor leaves
   uncovered, so it needs a differential.
3. **The rendered-name ladders take a type.** These are `scalarListRepOfName`, `nulScalarListKind`
   and `annNulListKind` (22 refs), `annUnionSigKind` (it already takes `ty`), and
   `nulScalarListKindOfNode`'s `tyName` rung. Each caller needs a type in hand, never a re-parse. A
   literal union must not mint: check D14041 and D14042 by hand.
4. **The syntax rungs:** `ifExprRefKindAt`'s `ObjLit` arm, `letCellKindGo`'s `holderRecordSigs`
   arm, `njKindOfExpr`'s three rungs (each measured for reach first) and `fiLk` (the iterable's own
   `repOf(iterTy).rdKind`, keeping the string and `u8` sources).
5. **The codecs, with the slot layer.** Each codec reads a second encoding that a table stores: a
   field code, a ref-list element code, an mv value code, an `MfKind`, a `$fnsig` token or a
   wasm type index. A codec goes when its table stores a rep record (kind and slot as one value)
   instead of the code. That is the slot layer's work: its 29 name-keyed producers come first, then
   the 38 cross-bank maps.

`fRetKind`'s annotated writer is lane w287's. Once it is a `repOf` read, every `fRetKind` write is
"a rep record kept where computed", and the column reads in §1.1 are by design.
