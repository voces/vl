# Step 7 closed: §7's L2 and L6 lines deleted, the floors stated as contract, the scoreboard re-baselined

DRAFT, prepared on branch `step7-close`. It is finalized when the coordinator reports the lanes
done, and every figure below is re-read on the master it lands on (closing census 5).

## What the close deletes

ARCHITECTURE.md §7's two step-7 rows:

- **L2** (§2.4, §3.4, §4.1): render-then-parse, two-producer classifiers, and rows minted under a
  name.
- **L6** (§3.3, §4.1): registries keyed by spelling.

## The floors, now contract text

- **§3.3, renders kept for output:**
  - diagnostics (`cloCallSigRejectWhat`, `nulNicheIsTestImpossible`, `mapSoftTwinTagFail`,
    `emitMapUnionPayloadTail`);
  - the `clo:` link key (`cloSigNameOfTy`);
  - recorded TypeRef texts (`synthTypeRefOfTy`, `lvSpellOf`).

  No type-string parse remains.
- **§3.3, registries:** keyed by a type key, an identifier, literal content or an index memo.
  `cloSigPosBy` is re-graded as rep-keyed: its `$fnsig` key is built from rep tokens (#7646).
- **§3.4, classifiers:** one producer, the type. A name read is a label: a key rendered from the
  type (`monoTagMapRepName`), or a presence test (`annTyIsRefList`). Rows are found by type.

## The accepted contracts

Each is a site that reads a name or keys a row without a closed type, and passes closing census
5's three tests: it is cited, its reason is a contract, and a witness runs.

| contract | where §3.3/§3.4 states it | sites | cites |
| --- | --- | --- | --- |
| `sNameIx` maps a row's own name (an identifier or an `#anonN` handle) to the row, #7685 | §3.3 registries | `anonRowTyOfName`, `anonPinRow`, `retStructRowIndex`'s `#anon` rung | #7414, #7546; D15646, D2762 |
| the spelling index resolves a source name to its row | §3.3 registries | `unNameAdoptTyKeyRow`, `annShapeIndexOf` (untyped shapes) | `2026-11-12-step7-union-reg-riu-value-union.md`, `2026-11-12-step7-shape-layout-id.md` |
| a type parameter's name is an identifier; shadowing is a scoping question | §3.3 registries | `monoElabCompositeTy` | lane D, 2026-11-12 |
| `tySame` plus the function sets | §3.3 registries | `sRowElemRepSame`, `fnSetsAgree` | `2026-11-12-step7-struct-name-producers-cut-2.md` |
| a function-value-set row is keyed by its set | §3.4 | `rlKeyTyOf`'s declines, `rlElemStructRow`'s name rung | #7636; D15552, D15804, D15922 |
| a type holding a type parameter is not a rep; an open body builds at the open row | §3.4 | the 40 type-parameter-row programs; `monoTypedExtra`'s open-binding text (#7708) | #7654; `2026-11-12-step7-vkind-uncovered-storage-rows.md` |

## Still failing at this draft (master `e0d8c7f1`, 2026-11-13 00:40)

The close is opened when this list is empty, or holds only items with an open PR. Closed since
the 23:00 draft: lane D's mono rows (#7681, #7688), lane F's `sFieldRefSlot` fallback (#7683) and
lane H's `variantNestedRow` lookup (#7679). Then lane B's `structRowOfSpelling` chain (#7687), and lane D's instance registries (#7699).

| lane | sites |
| --- | --- |
| E | `structElemArrayLowerable` (`nameIsStructDecl`, `variantIndexOf` on the rendered name; the `nameIsShapeOpen` gate graded against #7668's note); `internFuncTypeShapesTyGo` (`isValueUnionName`, `nameIsShapeSpanEnds`); E3's `internShapeDeepOfTy`, `internArmShapeRow` renders; all in the D6 re-key (E and F co-own; F's step 1a is #7689; E on 2b, nested and arm rows by type, F on the walk), with the D6 interner's `nm` input, which `variantNestedRow` and `armFieldStructRowMinted` hand it |
| G | `unionNameOfCall`; `unionNameOfExpr`'s 7 call sites: 4 in its own producer (`letUnionNameOfGo`, `unionNameRowOfExpr`, `unionNameOfExprGo` ×2), `printUnionPlanCode` (#7690); `emitUnionUnionEq` ×2 (moved from lane A: a literal set needs a widened rep, a union-type question) |
| D | mono's typed instance key (#7699 merged: the four instance registries are off spellings, leaving `sNameIx` the one spelling-keyed registry): #7708 (merged): `monoSigPinDiscrim` becomes an `emitFail` assertion (its control fires only with `monoPinRespell` off: `call1(inc, 4)`), and `monoTypedExtra` keys explicit bindings by type, an open binding's text kept as a floor (22 decisions, 12 programs) under §3.4's type-parameter contract, witness `generics/param-copied-into-two-type-params-called-apart.vl`; `monoAnonPinDiscrim` converts to the pin's own type, ruled (a), PR to come (probe: 0 merges, 7 splits, 37 programs byte-identical) |
| G | `utkAtomText`, the last `sNameIx` reader with a spelling (convert or contract, #7685's note) |
| H | `printUnionPlanCode`'s name fallbacks: #7690, open (24 → 2; the 2 filed as D16060) |

## The scoreboard re-baselined (exit criteria, coordinator rulings 2026-11-11)

| target | reference | at the close | reason |
| --- | --- | --- | --- |
| emit_classify ↓ | 14,412 lines (2026-11-10) | TBD (14,962 at census 4) | each name read became a typed read plus an invariant `emitFail`; graded instead by the classifier census, NAME 52 → TBD and SPELLING 12 → TBD |
| seed ↓ | 6,589,035 bytes (the seed-size gate's baseline, #6986) | TBD (6,722,819 at census 4) | the conversions' cost, named as `2026-11-01-seed-growth.md` did; graded instead by the name ladders deleted |

`vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --write-baseline` is run in this
PR, on a fixpoint seed of the merged tree.
