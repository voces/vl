# `Rep` as an algebraic type: design note, 2026-11-14 (lane E)

Lane E; engineering review §6 medium 2. This is a docs-only note: it changes no compiler code. It
was measured at master `b9d20e5c`, with a host built from that tree and the published
`seed-latest` (sha256 `dcf0e504…`). The profile in §5 used a `--names` seed built from the same
tree. The note files no inventory rows.

It covers five things:
- §1, an inventory of every rep encoding, the per-element-type function families, and the refusal
  sites that name a rep shape;
- §2, the ADT, with each encoding mapped onto it, and the closed set the emitter matches;
- §3, the migration order, stage by stage, each byte-identical and each deleting code;
- §4, lane J's bucket-(e) rows as acceptance rows;
- §5, the measured cost and an estimated net-lines figure.

§6 says how this fits lane S's slot store, the L3 ruling (option A) and lane H's hash-consing.

**The finding that shapes the design:** the tree already exists. `rtGo` (`emit_rep.vl:4676`) is a
memoized, hash-consed, exhaustive `match` over `Ty`. It builds a recursive rep tree over 17 node
kinds (`RtKind`, `emit_rep.vl:4498`). The review praises it (§2). But nothing is decided by it:
- it is private, stored as eight parallel columns (`rtKind`, `rtDisc`, `rtChild`, `rtKids`, …);
- its one consumer projects it down to the flat `RepDesc` (`repOfTy`, `emit_rep.vl:3383`), whose
  `rdKind` is a `VKind`;
- 22 `rdCovered == 0` fallbacks keep the legacy name-based path alive beside it.

So medium 2 does not need a new type. It needs this tree promoted to the authority, and every flat
encoding turned into a projection of it, then deleted.

## 1. Inventory

### 1.1 The rep encodings

Reference counts are identifier occurrences in `compiler/*.vl`, definitions included.

| encoding | where | members | refs (files) | what it encodes |
|---|---|---|---|---|
| `VKind` | `emit_state.vl:525` | 32 string literals | 240 `: VKind` annotations; 1,816 kind-literal comparisons | a local's, param's, global's or result's valtype class |
| `ListKind` | `emit_state.vl:1938` | 7 | 82 | a non-null list's element class |
| `FC_*` field codes | `emit_state.vl:889` | 29 (0–37, gaps) | 739 (19) | a struct field's storage |
| `TSK_*` | `emit_state.vl:2339` | 30 | 144 (3) | a type-section heap-type row kind |
| `RLK_*` | `emit_state.vl:1153` | 11 | 282 (15) | a ref-list element kind |
| `MVK_*` | `emit_state.vl:1213` | 10 | 134 (8) | a map's value class |
| `LBK_*` | `emit_state.vl:1633` | 12 | 246 (11) | a list-literal build kind |
| `PK_*` | `emit_state.vl:1313` | 4 (+`PK_KIND_BASE`) | 54 (6) | a packed element width |
| `MAP_KEY_*` | `check_ty_rep.vl:102` | 3 | 114 (17) | a map key's class |
| `ESC_*` | `check_ty_rep.vl:589` | 10 | 71 (5) | the checker's escape/scalar class |
| `TK_*` | `emit_ref_list_kinds.vl:617` | 9 | 63 (4) | a type-kind code |
| `LR_*` | `emit_eq_rows.vl:112` | 8 | 39 (3) | an equality row's leaf |
| `URC_*` | `emit_rep.vl:3470` | 10 | 52 (2) | how a union normalizes (atom, one list, box, …) |
| `LIST_ARM_*` | `wasmEmit.vl:6563` | 6 | 26 (1) | a union-of-lists arm class |
| `RtKind` (the tree) | `emit_rep.vl:4498` | 17 | private | the recursive rep |
| `RepDesc` | `emit_rep.vl:198` | 7 fields | 31; 67 `.rdCovered` reads | the flat descriptor over the tree |
| `MvRep` | `emit_state.vl:1236` | 2 fields | — | a map slot's value rep |
| `$fnsig` tokens | `emit_rep.vl:229` | 31 one-char codes | parsed back by `repKindOfSigTok` (`:413`) | a signature key's parameter and result kinds |
| box tags | `emit_rep.vl:3412` | 17 (0–18) | — | a member's tag inside a value box |
| `TSK_VALUE_BOX` slot | `emit_state.vl:2342` | 5 | — | a value box's scalar (0 i32 … 4 v128) |

**String-keyed rep facts.** These are the slot tables keyed by a type spelling, each with its own
twin-dedup column:
- `sNames` (210 refs), with `sTwin` and five parallel field columns: `sFieldTypes`,
  `sFieldElemName`, `sFieldCloSig`, `sFieldElemTyIx` and `sFieldElemKeyKind` (`emit_state.vl:918–950`);
- `rlElemName` (104), with `rlTwin` (21);
- `mvValName` (38), with `mvTwin` (11);
- `unNames` (83) and `uVariants` (113), with `uVarTwin` (20);
- `cloSigKeys`, `nliNames`;
- `tyToEmitName` (112 refs), the renderer the keys come from.

The `*TyIx` sidecars (destringify D0–D5) are the half-finished move to arena keys.

**Not rep encodings:**
- `RB_*` (`check_rollback.vl:137`, 31) are checker rollback masks (review small 7).
- `HC_*` (`emit_rep.vl:1417`, 14) is the type-key hash-cons, which is lane H's medium 1.
- `OP_*`, `VT_*` and `GC_*` are the instruction set. They stay.

**Translators between encodings.** By name pattern (`*OfKind`, `*KindOf*`, `*CodeOf*`, `*OfCode`, …)
there are 123 functions, 3,009 lines; 105 of them (2,567 lines) are emit-side. Examples:
- `fieldCodeOfVKind` (`emit_field_codes.vl:319`), `rlKindOfVKind` (`emit_rep.vl:5605`),
  `listBuildKindOfVKind` (`emit_ref_list_kinds.vl:278`) and `tyKindCodeOfVKind` (`:645`);
- `mvClassOfKind` (`emit_state.vl:1247`), `repSlotOfKind` (`emit_rep_slot.vl:51`),
  `vbHeapIdxOfKind` (`emit_rep.vl:2664`) and `repKindOfSigTok` (`:413`).

Separately, 97 functions (1,682 lines) return a `VKind` or `ListKind`. 34 of them are in
`emit_classify.vl`.

### 1.2 The per-element-type function families

These were found by stripping type tokens (`I32 I64 F32 F64 U8 V128 Str Bool Ref …`) from all
16,953 function names and grouping the stems that have two or more variants. That gives 50
families, 135 functions and 2,272 lines. The `fb*` builders (`fbF64Const`, `fbI32TruncF64S`, …)
are wasm opcodes and stay. The collapsible ones:

| family | members | lines | first site |
|---|---|---|---|
| `emitArr{U8,F32,F64,I64,Str,Ref,…}` | 7 | 380 | `wasmEmit.vl:14128` |
| `exprIs{I64,V128,F32,F64,Bool}` | 5 | 189 | `emit_classify.vl:5087` |
| `emitMapProbe{I32,I64}FnCode` | 2 | 141 | `emit_sections.vl:3825` |
| `binOpcode{I64,F64,F32}` | 3 | 130 | `emit_base.vl:1603` |
| `emitExprAs{I64,F64,F32}` | 3 | 106 | `wasmEmit.vl:23862` |
| `emitCoalesceNul{Ref,Bool}Join` | 2 | 101 | `wasmEmit.vl:40913` |
| `letIs{String,I64,F64,F32}` | 4 | 88 | `emit_classify.vl:13402` |
| `sharedFieldNul{Bool,Str}Plan` | 2 | 84 | `emit_obj_lit_fits.vl:717` |
| `arrLitIs{Ref,Str,F32}`, `expr{Ref,String,F64,U8,F32,I64}Array` | 9 | 101 | `emit_classify.vl:6561`, `:11626` |
| `tyIs{I32,Str}LeafElem`, `tyIs{I32,Str}List`, `annTyIs{Str,Ref}List` | 6 | 94 | `emit_rep.vl:1067` |
| `ts{I32,F64,I64,F32}List`, `ts{Ref,I32,F64,I64,F32}Array`, `tsMap{I32,I64}`, `ts{Str,Ref}Back` | 13 | 74 | `emit_sections.vl:8566` |
| `ret{I64,F64,F32}Flag`, `map{I32,I64}Ty`, `map{I32,I64}KeyLocal`, `helpMapProbe{I32,I64}Fn` | 9 | 74 | various |

The families hidden in kind-string ladders are larger than the named ones:
- 191 functions (9,407 lines) compare against three or more compound `VKind` literals;
- 139 compare against four or more.

The widest ladders:
- `forInBackingOf` (28 kinds, `wasmEmit.vl:35725`);
- `declareForInLocals` (23, `emit_collect.vl:2543`);
- `readKindIsNul` (14, `emit_classify.vl:14988`);
- `eqHelpFieldPaths` (13, `wasmEmit.vl:21667`);
- `emitStructEqFieldAt`, `repSlotOfKind`, `repSigTokHasSlot` and `emitOneFuncType` (10–11 each).

Each is one decision ("which backing", "is it nullable") spelled once per list or nullable twin.

The other half of the duplication is the **re-classifiers**. These are 138 functions (2,386 lines)
in `emit_classify.vl` that compute a node's kind from its AST (`exprIsF64`, `exprF64Array`,
`letIsI64`, …). They do not read the checker's recorded type. That breaks the owner's rule (emit
reads facts, it does not re-derive them), and §5 measures it as 15.5% of a self-build.

### 1.3 Refusals that name a rep shape

`vl run scripts/emit-refusal-sites.vl` reports 849 `emitFail`/`emitFailAt` call sites and 692
distinct templates. I classified its `--json` output by the rep shape each template names. **This
is a message count, not a mechanism count.** CLAUDE.md's rule applies: ablation defines a family,
and none was ablated here.

| shape named | sites |
|---|---|
| union box, variant, arm, atom | 160 |
| ref list, list rep, row, backing | 122 |
| struct, record, field | 65 |
| map, set | 64 |
| closure, function value, sig | 54 |
| nullable, niche | 48 |
| scalar width | 19 |
| nested list | 12 |
| scalar list (`f64[]`, `u8[]`, …) | 12 |
| v128 | 2 |
| **names a rep shape** | **558** |
| names none | 291 |

Of the 558:
- 139 are **table misses**: "has no interned shape", "no row", "not collected", "carries no row", …
  A lookup into a slot table keyed by a spelling found nothing.
- 66 say "not supported", "no lowering", "not built" or "cannot". 54 of those are in `wasmEmit.vl`.
- The other 353 read as internal invariant breaks.

The headline sentence is "nested arrays are not supported", at six sites: `wasmEmit.vl:14141`,
`:14166`, `:14203`, `:14238`, `:14375` and `:14534`. They are guards inside `emitArrU8/F32/F64/I64/…`.
`emitArrUnder` chose a scalar-element arm from a re-classifier of the literal, so it must check
that no element is itself a list. The disagreement exists only because the list's kind and its
elements' kinds are computed separately.

Checker side, seven distinct message literals concede a missing rep ("has no lowering", "a union
cannot hold both … yet", "is not built yet"). They are in `check_leaf_steps.vl`,
`check_ty_relate.vl`, `check_union_arm_msgs.vl`, `check_bind_adopt.vl` and `check_demands.vl`.

## 2. The ADT

### 2.1 Shape

VL has no payload variants yet (that is L4). The ADT therefore follows the `Ty` arena's own
pattern: distinct record types joined in a union, matched by `match` on the record type, with no
`_` arm. Nodes live in one hash-consed arena. A `RepId` is an `i32`, and **two reps are equal iff
their ids are equal**. Hash-consing is what makes the twin tables (`sTwin`, `rlTwin`, `mvTwin`,
`uVarTwin`) unnecessary.

```
type RepId = i32
type PrimRep = "i32" | "bool" | "i64" | "f32" | "f64" | "v128" | "str" | "none"
type ElemStore = "val" | "u8" | "i8" | "u16" | "i16"    // a list backing's element storage
type KeyRep = "str" | "i32" | "i64"
type NulDisc = "ref" | "sentinel" | "atom" | "boxed"   // RepDesc.rdNul 1..4, named

type RPrim     = { pK: PrimRep }                       // "none" is the null type (nullref)
type RAtom     = { aSet: i32 }                         // a literal union as an interned i32 id
type RList     = { lElem: RepId, lStore: ElemStore }
type RMap      = { mKey: KeyRep, mVal: RepId, mSet: boolean }
type RRecord   = { rRow: i32, rFields: RepId[], rArm: i32 }   // rArm: the union family it is a variant of, or -1
type RUnion    = { uArms: RepId[], uBox: boolean }     // a value box, or a struct union over variants
type RNullable = { nInner: RepId, nDisc: NulDisc }
type RClosure  = { cSig: RepId }                       // function storages: §6.1, shape agreed with lane S
type RSetId    = { sdSet: i32 }
type RDirect   = { dMember: i32 }
type RBundle   = { bMember: i32, bSigs: RepId[] }
type RView     = { vSrc: RepId, vDst: RepId }          // stored as vSrc, read as vDst through accessors
type RSig      = { sgParams: RepId[], sgRet: RepId }   // a signature, so `$fnsig` keys are rep ids
type RepNode = RPrim | RAtom | RList | RMap | RRecord | RUnion | RNullable
  | RClosure | RSetId | RDirect | RBundle | RView | RSig
```

That is 13 node kinds. Nesting is ordinary recursion: `RList{lElem: RList{…}}` is a list of lists,
at any depth. A recursive type is a cycle, which the existing tree already terminates through
`rtByTy` and its de Bruijn back-edge key (`repCanonKey`).

**There is no `unsup` node.** Today's tree has eight `unsup` reasons (`emit_rep.vl:4678–4853`).
`repOf(ty)` returns a `RepId` or a `RepGap{reason}`, and only the checker ever sees a gap:
- `hole`, `list:hole` and `leaf:unnarrowable` (`TyVar`/`TyErr`) are an open type after mono, which
  is a compiler bug, or a rejected program;
- `neg` is a narrowing-only type that is never stored;
- `prim:void`/`prim:never` have no value;
- `litunion:noalias` and `union:unclassified` are legacy gaps this design closes: an inline literal
  set gets `RAtom` with its own set id.
- `union:open` is an open arm, the TyVar case again.

So past the checker every type has a rep. "No rep for …" is not a value the emitter can receive.

### 2.2 Normalization is in the constructor

`repOf` is the one place a type becomes a rep, and it normalizes there:
- `URC_SAME` gives the member's rep;
- `URC_ONE_LIST` gives that list;
- `URC_NUM_BASE` gives the scalar;
- `URC_ATOM` gives `RAtom`, and `URC_NUL_ATOM` gives `RNullable(RAtom, "atom")`;
- `URC_MAP_TWIN` and `URC_BOX` give `RUnion`.

So the emitter never meets "a union that is really one list". `is K[]` against an `i32[]` arm
becomes the question `repOf(K[]) == arm`.

Two distinctions the flat codes lose and the ADT keeps by identity:
- `boolean` keeps its own `RPrim` (structural-non-twin-distinct.vl), as the tree does today.
- An inline literal set field and an aliased one stay distinct. `FC_STR` covers "an inline
  literal-union set" and `FC_I32` covers an aliased atom (`emit_state.vl:889–890`). The ADT gives
  them `RPrim str` and `RAtom` respectively, so the layout difference the July audit warned about is
  the identity itself.

### 2.3 Each encoding as a projection

Each projection is one exhaustive `match` over `RepNode`, with an inner `match` on `pK`, `lStore`
or `nDisc` where needed. None has a `_` arm. Each lives beside the ADT until its last reader is
gone.

| encoding | projection | e.g. |
|---|---|---|
| `VKind` (32) | `vkindOf(r)` | `RList{RPrim f64}` → `"f64list"`; `RList{RPrim i32 \| bool \| RAtom}` → `"list"`; `RList{any ref}` → `"reflist"`; `RList{_, u8}` → `"u8list"`; `RNullable{RList{RPrim str}}` → `"nulstrlist"`; `RNullable{RPrim i32, boxed}` → `"union"`; `RRecord{rArm ≥ 0}` → `"variant"`; `RPrim none` → `"nulnone"` |
| `ListKind` (7) | `vkindOf` restricted to `RList` | |
| `FC_*` (29) | `fieldCodeOf(r)` | `RNullable{RList{RPrim f64}}` → `FC_NUL_F64_LIST`; `RAtom` → `FC_I32`; `RNullable{RAtom}` → `FC_NUL_LIT_UNION` |
| `RLK_*`, `MVK_*`, `LBK_*`, `TK_*`, `LR_*`, `ESC_*` | one projection each | |
| `MAP_KEY_*` | `RMap.mKey` | |
| `PK_*` | `RList.lStore` | |
| `URC_*` | none: these are the constructor's normalization steps (§2.2) and become private | |
| box tags | `boxTagOf(arm)`: by `RPrim.pK`, or by list element for the list arms | |
| `$fnsig` tokens (31) | none: a signature key is an `RSig` id | the alphabet and its parsers (`repKindOfSigTok`, `sigTokSlotAt`, `sigTokBareSlot`, `repSigTokHasSlot`) go |
| `RepDesc` | none: callers read the `RepNode` | `rdNul` is `RNullable.nDisc`; `rdAtom` is `RAtom`; `rdListElem` is `RList.lElem` |
| `RtKind` (17) | none: it *is* the node set | the columns become the arena |

**`TSK_*` is not a value rep. It is the heap-type kind**, a small sum of its own, derived from the
rep that needs the heap type:

```
type Heap = HStruct{row} | HArray{store: ElemStore | RepId} | HListWrap{list: RepId}
  | HMap{map: RepId} | HValueBox{pK} | HUnionBox | HView{view: RepId}
  | HClosure | HSig{sig: RepId} | HEnv{fn} | HCloCell
```

`heapOf(r)` interns one heap type per `Heap` value:
- the 30 `TSK_*` become 11;
- the five scalar `*_ARRAY` and five scalar `*_LIST` kinds, plus `STR_BACK`/`STR_HEADER` and
  `REF_BACK`/`REF_WRAP`, become `HArray`/`HListWrap` over the element;
- `MAP`, `MAP_I32`, `MAP_I64` and `MV_MAP` become `HMap` over the map rep;
- `SV_VIEW` and `RV_VIEW` become `HView`.

The struct, ref-list, mv and union slot tables become caches over `heapOf`, keyed by `RepId`. The
string keys and twin columns of §1.1 delete.

### 2.4 The closed set the emitter matches

The emitter is a total function of (operation × `RepNode`). Every lowering entry point matches the
13 node kinds exhaustively, with no `_` arm, and delegates element work to a recursive call on the
child rep. Two consequences:
- **A nested list is not a case.** `emitArrLit(r: RList)` builds the backing `heapOf(HArray(storeOf(r.lElem, r.lStore)))`
  and emits each element with `emitAs(e, r.lElem)`. If `lElem` is an `RList`, the elements are lists.
  The guard at `wasmEmit.vl:14141` has nothing to compare against, so "nested arrays are not
  supported" is unrepresentable.
- **A new rep kind breaks the self-compile at every lowering**, rather than taking a fall-through.
  This is CLAUDE.md's ladder rule, paid by construction.

## 3. Migration

Each stage is one PR (or a few), gated by `refresh-compiler.sh` twice (fixpoint), `cmp` of the seed
against the stage's predecessor, `regress.vl` and `rep-fuzz-check.sh`. Where a stage cannot be
byte-identical, each byte mover is named before it merges. "Deletes" are estimates from §1's line
counts.

| stage | change | byte-identical? | deletes (est.) |
|---|---|---|---|
| **0. Shadow total** | Run the existing `repShadow*` facility over every `VKind` producer, not only `repOfTy`'s callers. List each disagreement between the tree and the legacy classifier as a named row in lane E's reserved block. | yes (instrument off by default) | 0; adds a report |
| **1. The arena** | Replace the eight `rt*` columns with a `RepNode[]` arena plus the existing intern map. Export `repOf`, `repAt` and the projections. `unsup` becomes `RepGap`. `repTreeVKind` becomes `vkindOf`. | yes: same answers, same mint order | about −250 (column plumbing, `repTreeAtomOf`, `repTreeNulOf`, `repTreeListElemName`) |
| **2. VKind is derived** | The 97 `VKind`-returning functions and the 138 re-classifiers read `vkindOf(repOfNode(x, k))`, where `repOfNode` is the checker's `ty(k, x)` through `repOf`. Retire `RepDesc` and its 22 `rdCovered == 0` fallbacks. Order: the files with zero stage-0 disagreements first. | yes, for each agreeing site; a disagreeing site moves only as its own row's close, with its witness | about −2,500 to −3,500 (`emit_classify.vl`'s re-classifiers, the `VKind` translators) |
| **3. Field codes are derived** | A field stores a `RepId`, not a code. The five parallel field columns collapse into one; `pushFieldStorage` matches the rep; `FC_*` survives only as `fieldCodeOf` for the object-literal stash (`100 + code`). | yes: the same valtypes in the same order | about −700 (`fieldCodeOf*` × 6, `anonNul*FieldCode*`, column sidecars) |
| **4. Heap types by rep** | `heapOf` interns heap types by `Heap`. The slot tables become caches by `RepId`. The `sNames`/`rlElemName`/`mvValName`/`unNames` keys and the four twin columns delete. `TSK_*` becomes `Heap`. | yes, if the cache mints in first-ask order as today and the twin dedup was exact. **Named risk:** any pair the spelling key kept apart but the rep merges, or the reverse, moves the type section. Stage 0's shadow lists them first. | about −1,500 (the twin passes, name-keyed resolvers, `tyToEmitName` keys) |
| **5. The families collapse** | `emitArr*` → `emitArrLit(RList)`; `ts*Array`/`ts*List` → `tsHeap(Heap)`; `map{I32,I64}*`/`emitMapProbe*` → keyed by `KeyRep`; `binOpcode*`, `emitExprAs*` and `ret*Flag` → `(op, PrimRep)` tables; the kind-string ladders → `match` on the node. The six "nested arrays" sites and the 12 nested-list messages delete. | yes: the same instruction streams; arm order is kept where it fixes byte order | about −2,000 (the families of §1.2, the ladder bodies of the 191 functions) |
| **6. Signatures are reps** | `$fnsig` keys become `RSig` ids. The 31-letter alphabet and its parsers delete. | **mover, named:** if the alphabet merged two signatures that reps distinguish, the type section gains a row. Measured at the stage, and seed size is checked against +3%. | about −400 |
| **7. Function storages** | Lane S's stage 2 writes `RClosure`/`RSetId`/`RDirect`/`RBundle` through this arena's constructors. `fnTagHeldRep`'s `i32` list and the closure-list rows become projections. | per S's stages | counted in S's note, not here |
| **8. Record views** | `RView{vSrc: RRecord(wide), vDst: RRecord(narrow)}` for L3's storage slow path. The existing scalar-list view (`svPairs`) and record-list-to-box view (`rv*`) move onto the same node. | yes for the existing views; the record view is new code | about −150 (view tables), plus a new lowering |

Stages 1 → 2 → 3 → 4 → 5 must go in that order. Stage 6 can follow stage 1 at any point. Stage 7
follows S. Stage 8 follows the L3 implementation lane.

**What a mover means here.** A stage that is not byte-identical changes the seed for one of two
reasons:
- the tree and a legacy path disagreed (stage 0 names it, and it is fixed as that row);
- two equal reps had distinct heap types (stage 4 or 6).

Neither is allowed to ride inside a refactor PR. It lands as its own PR, with the rows it closes.

## 4. Acceptance rows: lane J's bucket (e)

The 18 rows bucketed (e) primary in `2026-11-14-clause2-architecture-map.md`. "By construction"
is a prediction from each row's filed mechanism. Each close still owes its own witness grade, and
a row that does not close re-opens with the stage named.

| row | outcome | what the ADT does | expect |
|---|---|---|---|
| D1981 | check reject | `RList{RPrim v128}`, a v128 field rep and a v128 map value are ordinary nodes; `heapOf` builds `(array (mut v128))` | **by construction** (stages 3–5) |
| D2634 | check reject | a generic `T \| null` at a vector is `repOf` of the closed instance type, the same id as the direct spelling | **by construction** (stage 2) |
| D2673 | check reject | `RMap{mSet: true}` ≠ `RMap{mSet: false}`, so the set and the boolean map are distinct arms | **by construction** (stage 4) |
| D4263 | check reject | the same identity, between record arms' fields | **by construction** (stage 4) |
| D16172 | emit reject | the arm `RList{RMap set}` is a rep id, and `is` compares ids | **by construction**, after D2673 |
| D4860 | emit reject | two box lists differ in rep but share `heapOf`, so the concatenation copies one heap type | **by construction** (stage 4) |
| D14082 | emit reject | a box's tags derive from its arms' reps, so a box is never "unregistered" | **by construction** (stage 4); the mechanism was not traced, so this is the least certain |
| D14041 | emit reject | the arm `K[]` normalizes to `RList{RPrim i32}`, the arm's own id, so the arm lookup succeeds | **arm half by construction**; the element-fit half is D4778's |
| D14042 | emit reject | the same, for `as?` | **arm half by construction** |
| D4778 | emit reject | the arm-tag-plus-element-fit test (D4771's ruling) becomes one rule `fitTest(RList, ty)`, not per receiver kind | one recursive rule |
| D4265 | emit reject | a partial-fit field test descends `RUnion` box members | one recursive rule (the same `fitTest`) |
| D4267 | emit reject | the same, descending `RRecord` fields | one recursive rule (`fitTest`) |
| D16170 | emit reject | `FC_STRUCT`, "a struct, nullable or not", hid the difference; field reps `RNullable{RRecord X}` ≠ `RNullable{RRecord Y}` make the plan see a mixed field | misclassification **by construction** (stage 3); the box plan needs a null arm |
| D2196 | check reject | the readonly converting copy is `coerce(src, dst)`, recursive through `RNullable` and `RList`, instead of a copy site per destination kind | one recursive rule (`coerce`) |
| D12466 | emit reject | the niche-atom-into-box widening is a `coerce` entry `RNullable{RAtom} → RUnion` | one recursive rule (`coerce`) |
| D4770 | check reject | `luMembers` declines a literal-element member; with `repOf` normalizing the union to one `RList`, the checker reads that | closes when the checker query reads `repOf` |
| D4150 | check reject | a recursive alias's list is a cyclic `RList`, which is representable | prerequisite only: the literal's adaptation (bucket c) remains |
| D4151 | check reject | the same | prerequisite only |

Tally:
- **7 close by construction**, and 2 more on their arm half;
- **6 close by one recursive rule over `Rep`**: `fitTest` covers D4778, D4265 and D4267, and
  `coerce` covers D2196 and D12466;
- D16170 needs one null arm in the box plan;
- D4770 closes on a checker read of `repOf`;
- 2 rows are prerequisite only.

Of the 21 rows with (e) as their *secondary* bucket, I expect D1118, D2677, D3530, D4081, D4082 and
D4086 to move with `RAtom` and `RNullable{…, atom}`. That is not claimed.

## 5. Cost and net lines

### 5.1 Measured cost

This is a guest profile of a self-build (`vl build compiler/entry.vl` under a `--names` seed,
`VL_PROFILE_GUEST`, 22,758 samples). Inclusive shares, each sample counted once per group:

| group | inclusive |
|---|---|
| all emit (`emit_*.vl`, `wasmEmit.vl`) | 52.7% |
| `emit_classify.vl`, the AST re-classifiers | **15.5%** |
| the slot interners (`emit_shape_rows`, `shape_intern`, `ref_list_kinds`, `field_codes`, `map_value_slots`, `mv_slots`, `union_registry`, `list_rep`) | 5.6% |
| the 123 encoding translators | 5.1% |
| all of `emit_rep.vl` | 5.0% |
| the rep tree itself (`rt*`, `repTree*`, `repOfTy`, `repOfNode`) | 3.7% |

What this predicts:
- The tree, which becomes the authority, already costs 3.7%.
- What it replaces costs more: 15.5% for the re-classifiers, and 5.1% + 5.6% for the translators
  and the name-keyed interners. These overlap, because the groups are inclusive.
- The direction is a fuel fall, provided `repOfNode` is a memo read.

**The named risk is the tree's lifetime.** `rtSync` drops the whole tree on every `tyMutEpoch`
or `cUserTypesVer` bump (`emit_rep.vl:4548`). I did not measure how often that happens during
emit. If emit-time type mutation is frequent, making the tree the authority multiplies its
rebuilds. Lane H's hash-consed arena removes the epoch: an immutable `TyId` gives a memo with no
invalidation. Stage 2 is graded by `plumb-shape-cost.vl --check` and `self-compile-time.sh`, and
**should not start before the epoch count is measured** (stage 0 adds the counter).

Generated code is unchanged through stage 5 (byte-identical). Stage 6 may add type-section rows,
gated by `seed-size.vl --check`.

### 5.2 Net compiler lines (estimate)

| | lines |
|---|---|
| deleted, stages 1–6 (§3 column, summed) | about −7,350 to −8,350 |
| added: the arena and constructors | about +350 |
| added: the projections while they live (`vkindOf`, `fieldCodeOf`, five others) | about +450, then deleted with their last reader |
| added: `heapOf` and `Heap` | about +300 |
| added: the `(op × PrimRep)` tables | about +200 |
| added: `fitTest` and `coerce` (§4) | about +400 |
| **net** | **about −5,600 to −6,600** of the tree's 403,106 |

The upper end assumes stage 2 retires half of `emit_classify.vl`'s re-classifier lines and the
191 ladder functions shrink by a fifth. Neither was prototyped.

Pin-helper delta: 0. This note touches no test, and `tests/budget_pin_helper_test.ts` stays at
its baseline of 908.

## 6. Fit with the other designs

### 6.1 Lane S's slot store

S's §7 already says `slotStore(place).rep` is a `Rep` tree: `Fn(Closure(sig) | SetId(set) |
Direct(member))`, `List`, `Map`, `Record` and nullable or union nodes. That is the same ADT. So:
- **One arena.** This note's arena is the only definition. S's producer builds reps through its
  constructors (`repList`, `repClosure`, …).
- **Function storage is four top-level kinds:** `RClosure{cSig}`, `RSetId{sdSet}`,
  `RDirect{dMember}` and `RBundle{bMember, bSigs}`. A nested `Fn(…)` would put a second `match`
  inside every lowering. `cSig` and `bSigs` are `RSig` ids, so a closure's key is a rep, not a
  token. **I am sending this shape to S for agreement before stage 1.**
- **Structural rep vs place rep.** `repOf(ty)` is structural. For a function leaf it answers
  `RClosure(sigOf(ty))`, or `RSetId` where `fnTagTyIsTagged` holds, which is today's tree rule
  (`emit_rep.vl:4691`). A place's rep is `repOf` with S's per-path function decisions substituted.
  S owns the substitution, and this note owns the nodes.

### 6.2 L3, option A

- A record **parameter** is specialized per concrete row. That is mono at distinct `RRecord` ids,
  with no new node.
- A **storage slot** that receives a wider row takes one of two paths:
  - the prefix-subtype fast path, which is `RRecord` plus `sSuper` (wasm `sub`, D622), with no new
    node;
  - the accessor-view slow path, which is `RView{vSrc: RRecord(wide), vDst: RRecord(narrow)}`.

`RView` is also the node for the two views that already exist: the scalar-list view (D3028) and the
record-list-to-box view (D3041). So L3 adds a lowering, not a variant.

### 6.3 Lane H's hash-consed types

The two are independent but compose:
- Before H lands, `repOf`'s memo keeps the tree's epoch.
- After H, it is an array indexed by `TyId`, the twin and epoch logic goes, and `rtByTy` becomes
  that array.

Neither blocks the other's stage 1. Stage 2 waits on the epoch measurement (§5.1), and H may make
that measurement moot.

## 7. Not claimed

- **The groupings in §1.2 and §1.3** are by name and by message. No family was ablated.
- **The deletions** are estimates from line counts. Nothing was prototyped.
- **The acceptance tallies** are predictions from filed mechanisms. D14082's mechanism was never
  traced.
- **The fuel direction** is inferred from a sampling profile, not from `$VL_FUEL` A/B runs. The
  tree's rebuild count was not measured.
