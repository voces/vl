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
| no row key needs declaration identity: an inline field and its `tySame` twin share a row, except `flat` and differing function sets (coordinator, #7306) | §3.3 | the shape interner's rows | #7306, #7669 |
| mono's anon-pin discriminator decides by the pin's type (coordinator, ruling (a)) | §3.3 | `monoAnonPinDiscrim` | lane D |
| the `unionNameOfExpr` producer's floor (`unionNameOfExprFloor` / `letUnionNameOfGo`, #7720): a function value's nullable box is keyed by its set | §3.4 | about 614 calls; `unionNameOfCall` is its rung | #7636; witness `closures/fn-map-index-read.vl` (runs, output as filed; a scratch probe on master `7683149a` shows it reaches the floor and the floor answers) |
| `tySame` plus the function sets | §3.3 registries | `sRowElemRepSame`, `fnSetsAgree` | `2026-11-12-step7-struct-name-producers-cut-2.md` |
| a function-value-set row is keyed by its set | §3.4 | `rlKeyTyOf`'s declines, `rlElemStructRow`'s name rung | #7636; D15552, D15804, D15922 |
| a type holding a type parameter is not a rep; an open body builds at the open row | §3.4 | the 40 type-parameter-row programs; `monoTypedExtra`'s open-binding text (#7708) | #7654; `2026-11-12-step7-vkind-uncovered-storage-rows.md` |

## Still failing at this draft (master `4a26a7be`, 2026-11-13 05:20)

The close is opened when this list is empty, or holds only items with an open PR. Closed since
the 23:00 draft: lane D's mono rows (#7681, #7688, #7699, #7708, #7710), lane F's `sFieldRefSlot`
fallback (#7683), lane H's `variantNestedRow` lookup (#7679) and `printUnionPlanCode` (#7690),
lane B's `structRowOfSpelling` chain (#7687), lane G's `utkAtomText` (#7704, so `sNameIx`'s
contract carries no exception), lane E's field-set spelling key (#7707), E/F's `internShapeDeepOfTy` render (#7705, the shape walk takes a type), `emitUnionUnionEq`'s two name reads (#7714), the union-name wrappers' 12 consumers (#7720, G's cut 8a), `variantNestedRow`'s spelling mint (#7724: the stored row, else a loud failure), the `unionNameOfExpr` producer's alias-spelling calls (#7723: keyed by the non-null part's resolved type), `armFieldStructRowMinted`'s spelling input (it interns by type and records the row's name as a label), `structElemArrayLowerable` (#7738: `structNameOfTy`), and `unionSetAtomsOf` (#7736, deleted). After #7727, `unionNameOfExpr` has two callers: the function-value-set floor and D16060's.

| lane | sites |
| --- | --- |
| E | `tyIsDeclaredNominal` (#7740: `cUserTypes[tyToNominalName(ty)] || nameIsGenAppDecl`); E's type-side form (`structNameOfTy`, `genAppNameOfTy`, a union alias that is not a numeric literal union) is gating |
| F | `shapeWalkSplitsUnion`'s `cUserTypes[ln]` and the walk's value-union arm, after E's predicate lands |
| A | `internArmShapeRow`'s render (`tyToEmitName(aty)` into `armMintShapeName`), after E's step (d), which waits on F's last `ftxt` readers in `shapeFieldElemName` |
| D | D16040 (filed, #7735; 6 programs; bundled with D16020 in D's PR 2, after #7742): `rlElemStructRowOfName` finds a generic instance's function-holding record by `structIndexByName(nonNulBaseOf(nm))`. Not on the carried list (coordinator), so it closes before the close |
| B | `variantIndexOf` as a name producer: #7737, open |

## The renders at this draft (master `537a04cc`, coordinator's measurement)

The close criterion is "renders down to the floor". Each of the 8 standing `tyToEmitName` renders,
graded:

| site | grade | contract or owner | witness |
| --- | --- | --- | --- |
| `lvSpellOf` (emit_rewrite:813) | floor | a recorded TypeRef text: a synthesized annotation is source text, checked again as source (§3.3) | `closures/capture-module-value-block-local.vl` (41 cases reach it) |
| `synthTypeRefOfTy` (emit_rewrite:1238) | floor | the same | `arrays/map-returning-list-runs.vl` (378 cases) |
| `cloSigNameOfTy` (emit_union_atoms:1392) | floor | the `clo:` link key: the closure slot's printable name, rendered from its type (§3.3) | `closures/alias-is-closure-arm-three-arm-union-call.vl` (495 programs) |
| `mapSoftTwinTagFail` (wasmEmit:6136) | floor | a diagnostic names a type for a person (§3.3) | `generics/error-literal-union-map-twin-through-one-instance{,-plain-first}.vl` |
| `nulNicheIsTestImpossible` (wasmEmit:4593) | floor | a diagnostic, inside a guard ruled an assertion (no program reaches it; filed when one does) | none, by the assertion ruling |
| `emitMapUnionPayloadTail` (wasmEmit:21950) | floor | the same | none, by the assertion ruling |
| `shapeWalkKeyOf` (emit_shape_intern:277) | failing | E / F, the D6 re-key: the walk key still decides in `tyIsDeclaredNominal` and `shapeWalkSplitsUnion` | — |
| `internArmShapeRow` (emit_shape_intern:730) | failing | A, after E's step (d) | — |

Six are floors and two block the close. The one parse, `nonNulBaseOf`, is D16040's (lane D's PR 2).

## Floors held by a filed row

Each is a checker-side gap outside step 7's exit (coordinator, 2026-11-12): the site reads a name
because the checker records no type there. Each is filed `runs today and must keep running`, and
its witness runs as filed on master `54b68c07`. The close carries them forward.

| row | site | the gap |
| --- | --- | --- |
| [D15976](../inventory/D15976.md) | `emitObj` → `fieldRowKindIn` | a record field's un-annotated `[]`-or-`null` join reaches emit with its element hole unfilled |
| [D16010](../inventory/D16010.md) | `sLitMintRow` | a hole instance's record literal has no elaborated type, so it builds at its minted row |
| [D16060](../inventory/D16060.md) | `printUnionPlanCode`'s name fallback | a field read through an un-annotated parameter stays typed at the hole in its instance |

## The scoreboard re-baselined (exit criteria, coordinator rulings 2026-11-11)

| target | reference | at the close | reason |
| --- | --- | --- | --- |
| emit_classify ↓ | 14,412 lines (2026-11-10) | TBD (14,962 at census 4) | each name read became a typed read plus an invariant `emitFail`; graded instead by the classifier census, NAME 52 → TBD and SPELLING 12 → TBD |
| seed ↓ | 6,589,035 bytes (the seed-size gate's baseline, #6986) | TBD (6,722,819 at census 4) | the conversions' cost, named as `2026-11-01-seed-growth.md` did; graded instead by the name ladders deleted |

`vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --write-baseline` is run in this
PR, on a fixpoint seed of the merged tree.
