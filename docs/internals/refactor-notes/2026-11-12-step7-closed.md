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

  Whether a type-string parse remains is re-measured under #7748's census (below).
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

## Still failing at this draft (master `0b123e39`, 2026-11-13 14:25)

**Closing census 5's failing column is empty** (coordinator, 2026-11-13). `internArmShapeRow`'s render is a floor: since #7768 it answers its type's row first, and the render only labels a row it mints, which no row choice reads. The rows below are the L2 work and the blockers filed since.

The close is opened when this list is empty, or holds only items with an open PR. Closed since
the 23:00 draft: lane D's mono rows (#7681, #7688, #7699, #7708, #7710), lane F's `sFieldRefSlot`
fallback (#7683), lane H's `variantNestedRow` lookup (#7679) and `printUnionPlanCode` (#7690),
lane B's `structRowOfSpelling` chain (#7687), lane G's `utkAtomText` (#7704, so `sNameIx`'s
contract carries no exception), lane E's field-set spelling key (#7707), E/F's `internShapeDeepOfTy` render (#7705, the shape walk takes a type), `emitUnionUnionEq`'s two name reads (#7714), the union-name wrappers' 12 consumers (#7720, G's cut 8a), `variantNestedRow`'s spelling mint (#7724: the stored row, else a loud failure), the `unionNameOfExpr` producer's alias-spelling calls (#7723: keyed by the non-null part's resolved type), `armFieldStructRowMinted`'s spelling input (it interns by type and records the row's name as a label), `structElemArrayLowerable` (#7738: `structNameOfTy`), `unionSetAtomsOf` (#7736, deleted), `tyIsDeclaredNominal` (lane E: `structNameOfTy`, `genAppNameOfTy`, a union alias that is not a numeric literal union) `variantIndexOf` (#7737, deleted), `shapeWalkSplitsUnion` (#7753: the walk's value-union and declared-union tests read the type) and D16040 (#7749: the last `nonNulBaseOf` caller is gone). After #7727, `unionNameOfExpr` has two callers: the function-value-set floor and D16060's.

| lane | sites |
| --- | --- |

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
| `internArmShapeRow` (emit_shape_intern:745) | floor | a label on a fresh mint (#7768: the type's own row is answered first) | — |

The census's other five renders are all in one function, `nodeArrayElemName`
(check_emit_queries:742, 764, 768, 772, 791). It renders an array literal's element type to a name,
and emit_shape_rows' `arrLitBoxElemName` (2 callers) and `arrLitElemRender` (8 callers) consume
that name. Graded a floor under the spelling-index contract by lane A's canonical-key probe (#7760, merged): no duplicate row carries its key. The probe's one-type-two-rows cases are filed as D16000 (`unNames`, lane G) and D16001 (ref-list, lane A), and both block the close.

Of the 13 renders, six are floors and seven block the close.

Lane H's #7764 widens the render set: the census reads 98 renders, plus 44 display and diagnostic
ones. The criterion "renders down to the floor" is graded against that set once #7764 merges
(coordinator, 2026-11-13). Each render is graded by what its output feeds:

- (a) a decision or a re-parse: fails, with an owner;
- (b) a dictionary key: a floor only if its table passes lane A's canonical-key test (every mint and
  lookup renders alike), else it fails;
- (c) a label, output text or a diagnostic: a floor;
- (d) unreached: deleted.

Lane I's triage of #7774's 97 consumer rows (H counts 101; the other four are display
renders), by renderer family. Reach is summed over each family's rows:

| family | sites | reach | grade | owner |
| --- | --- | --- | --- | --- |
| F0 TypeRef text (`synthTypeRefOfTy`, `lvSpellOf`), the `clo:` link key (`cloSigTagSlotOfTy`), `nodeArrayElemName` (#7760) | 9 | 4,609 | floor | — |
| R1 mono pin spellings (`monoPinSpellShaped`/`NoAnon`, mono's `tyToNominalName`; `tagRepNameOfTy`, `registerRetJoinUnions`) | 40 | 26,056 | mostly labels under the pin-naming rule; (a) where the text decides (`monoRecordNominalPin` scans it, `monoTagRecordPinKind` and `monoSubstAnnNode` compare it); (b) where it is pushed into `pinned`, `pnames` or `tvV` | D grades per site |
| R2 ref-list row names (`rlRowNameOfTy`) | 15 | 16,692 | (b) through `rlInternNameTy`, which fails the canonical-key test while D16001 stands; (a) at `collectARefArrayAnn` (→ `isValueUnionName`) | A, with F |
| R3 union key text (`canonUnionKeyTextOfTy`, `unionSpellingOfTy`, `canonUnionKeyAtomOfTy`, `cloSigNameOfTy` in `specPart`/`unionPartSpelling`) | 10 | 38,571 | (b) into the union registry, failing while D16000 stands; (a) where it reaches `isValueUnionName` | G, with H for the P1 reads |
| R4a collect nominal (`arenaEmitName`, `reachRegisterName`, `registerInferredUnionTy`, `tyNomRenderLoops`) | 5 | 31,407 | (a) `arenaEmitName` re-canons a render; (b) `registerInferredUnionTy` into `unNameAdoptTyKeyRow` and `registerInlineUnionAt`; `tyNomRenderLoops` is a discarded cycle probe (floor) | E, with G |
| R4b mv slot keys (`mvDeepArmKeyName`, `mvDeepDeclKeyName`, `mvDeclNameOfValTy`) | 3 | 3,617 | (b), the canonical-key test owed | H |
| R4c `unionArmsAllSame` | 2 | 11,866 | (a): it compares two renders for equality, where `tyEq` or the canon key is the question | G |
| R4d shape_rows element names | 9 | 2,327 | (b), row keys with the canonical-key test owed; `fieldTypeRefusalMsg` is a diagnostic (floor) and unreached | A, with F |
| R6 the shape walk key (`shapeWalkKeyOf`, `shapeWalkName`) and `internArmShapeRow` | 4 | 45,618 | (a) for the walk key; `internArmShapeRow` is a floor since #7768 | F deletes the walk key; A |

Unreached (d): `arrLitElemName` (emit_classify:6909), `memReadBoxNarrowName` and
`fieldTypeRefusalMsg`. H also lists `nulNicheIsTestImpossible`, `mapSoftTwinTagFail` and
`emitMapUnionPayloadTail` at 0 programs during emit, but census 5 named
`generics/error-literal-union-map-twin-through-one-instance.vl` as `mapSoftTwinTagFail`'s witness.
That conflict goes to lane H. If the probe skips refusing programs, the census undercounts.

Routing (coordinator, 2026-11-13):

- every (b) canonical-key test goes to lane A, who owns the probe, one table at a time: ref-list
  after #7775, `unNames` after #7772, the mv slots, the shape_rows element rows, and mono's
  `pinned`, `pnames` and `tvV`; the owners fix whatever fails;
- R1's (a) and (b) go to lane D, graded per site;
- the R2 and R3 (a) sites that run through `isValueUnionName` go to lane H's D16062 PRs, which
  replace that predicate;
- R4a goes to lane E, R4c to lane G, R6 to lanes F and A;
- the (d) unreached sites go to lane F as deletions. Before the close opens (in the close PR): re-run every floor witness on the then-current master and quote its output; probe `nulNicheIsTestImpossible` and `emitMapUnionPayloadTail` across the sweep (scratch build, a firing control) to show 0 reaches. The one parse, `nonNulBaseOf`, is D16040's (lane D's PR 2).

## The census's coverage (lane H, #7748, open)

The render and parse counts above came from a census that read only `emit_*.vl` and `wasmEmit.vl`,
and counted ten named parsers, three of which no longer exist. Lane H's audit wrapped every
type-spelling parser's call site and recorded the sites reached while `emitProgram` runs, over
24,170 corpus programs:

| | old census | #7748 |
| --- | --- | --- |
| static type-string parse sites in scope | 1 | 149 (115 reached at emit) |
| static `tyToEmitName` renders in scope | 8 | 13 (5 in `check_emit_queries.vl`) |

There are also 148 `check_*` entry sites that emit reaches and the checker shares. Among them,
`nameToTy` is reached from emit through `synthTypeRefFb` (78 programs) and `monoSubstIsExpr`
(36 programs).

**L2's render/parse criterion is UNVERIFIED** (coordinator, 2026-11-13). "Renders down to the
floor, parses at one" is a claim about the old census, not about the emitter, so the close does not
open on it. The re-measure grades by the string's origin, not by file (coordinator, 2026-11-13). Lane H
classifies each reached parse site first:

- (a) a render, or (b) a synthesized or mangled name: fails, unless an accepted contract covers it;
- (c) user-written source text: not a violation, provided it holds by construction, not only on the corpus (coordinator, 2026-11-13). A parse whose input comes from a table that canon rewrites in place (`udVariants`: widened literal fields, generic applications) is in scope even where the corpus shows only source text. Lane H lists those sites in its census note, and each is re-graded failing under its owner, starting with `internShapeAs` (E) and the `isValueUnionName` sites that read declared-union member text. The census's substring rule also graded pieces split out of a render as source (`shapeInnerFieldSplit`'s `fieldNameOf` and `fieldTypeTextOf`; witness D14794, a folded intersection). Lane H's census PR makes a split of a render stay a render and applies the by-construction rule, regenerating in one commit. A rise in the failing count from that PR is a correction, not a regression. That PR is #7815. It moves four sites graded source on the corpus only to failing: `boxWidenAtomFor` (D), `ifExprNliName` and `unionHasBoolLeafArm` (G), and `cboxElemNeedsParens` (F). The three `nameIsQuotedLeaf` sites hold by construction and pass. Since 14:25, `monoNarrowedPinName` (#7811) and `internShapeAs` (#7813, which deletes `shapeInnerFieldSplit`) have landed. On master `43223386`, with D's #7805, the renders a content decision reads are down to two questions put to the coordinator. `monoTagRecordPinKind` holds no render. `monoNarrowedPinName` and `monoSubstAnnNode` test their render only for presence, and `monoSubstAnnNode` hands it to `synthTypeRefTy`, the TypeRef-text floor. `monoRecordNominalPin` walks its render only to drop spaces from the pin label: a label floor (coordinator; it returns to the list if anything downstream compares or parses that label). `arenaEmitName` hands its render to `canonEmitNameOfTy`, whose canon parsers run over an emitter-produced string: a render→parse whatever its output feeds, so it stays on lane E's list (coordinator). E probes first: if the canon pass is the identity on every render the corpus gives it, the call goes; otherwise the type-side render produces canon's form directly. **So the decision-render column is empty apart from `arenaEmitName`'s canon pass, a carried floor past step 7 under a row lane E is filing (coordinator, 2026-11-13; unfiled at this draft).** The same render→parse sits inside `canonUnionMembersWalk` (check_program:1793): it calls `canonEmitNameAt(tyToNominalName(leaf))` at lines 1819 and 1855, and the emitter reaches it through `canonUnionMembersInto` (7 call sites in emit_classify, emit_collect and wasmEmit). The census lists `canonEmitName` but not `canonEmitNameAt` or `canonUnionMembersInto`, so it does not see that site; lane H owns the census fix. Also landed: D16013 closed (#7816, `storageNormTy`), and the variant field-text column deleted (#7818).

A `check_*` site is graded by the same rule. A checker parse of the program's own annotation text
is the checker's job. A checker parse reached from emit whose input the emitter or mono produced
(`synthTypeRefFb` → `recordClonedNodeTyFb`) is in scope, whatever file holds the parser. Lane I
then lists (a) and (b), renders included, by owner with counts, for the coordinator to split.
§3.3's sentence "parses no type spelling back" waits on that.

**On master `43223386` (15:25):** 22 render or synthesized parses, which is 21 failing beside D16022's floor; 7 source, 14 unclassified; 95 renders and 42 display renders. The 21 by owner (coordinator, 15:20): A 6 (`declTyIxOfName`, `unionSetHasNullTy`, `emitUnionUnionNumCross` ×2, `emitUnionCoerceValueAtom`, `unionBoxEqColumns`); D 4 (`boxWidenAtomFor`, `boxNarrowAtomFor`, `nliAtomOfExpr`, `unionHasAtomKindArm`); H 3 (`collectDeclaredUnion` ×2, `identFnTypeAnnNameOfRead`); E 2 (`registerRefArrayArmUnions`, `msAtomIdOf`); G 2 (`leqNoteUnionArms`, `unionArmsNeedCloEq`); F 2 (emit_base's `nameIsShapeSpanEnds`, the shape family); B 1 (`repElemTyOfName`); F 1 (`recordClonedNodeTyFb`). Lane H's #7815, pending, adds `ifExprNliName` (G), `unionHasBoolLeafArm` (E), `cboxElemNeedsParens` (F) and a second `boxWidenAtomFor` site (D).

**On master `0b123e39`:** 27 render or synthesized parses (26 failing beside D16022's floor; `iisPushFieldElem` ×2 are gone), 7 source, 14 unclassified; 96 renders and 42 display renders. `arenaEmitName` is graded by what it feeds (#7809): its compare converts, its `monoInstanceRetSpelling` fallback is deleted, its empty-render returns are loud floors never taken, and its registry uses are labels under #7782. So the renders a content decision reads are D's four mono sites: `monoRecordNominalPin`, `monoSubstAnnNode` and `monoTagRecordPinKind` in #7805, and `monoNarrowedPinName` in #7811. The 26 failing parses by owner (coordinator, 14:20): G 10 (`leqNoteUnionArms`, `registerRefArrayArmUnions`, `unionArmsNeedCloEq`, `sharedFieldArmAtomKind`, `msAtomIdOf`, `unionSetHasNullTy`, `emitUnionUnionNumCross` ×2, `emitUnionCoerceValueAtom`, `unionBoxEqColumns`); D 4 (`boxWidenAtomFor`, `boxNarrowAtomFor`, `nliAtomOfExpr`, `unionHasAtomKindArm`); E 6 (emit_base's shape grammar ×5, `internShapeAs`); H 3 (`collectDeclaredUnion` ×2, `identFnTypeAnnNameOfRead`); B 1 (`repElemTyOfName`); A 1 (`declTyIxOfName`, for its non-identifier callers); F 1 (`recordClonedNodeTyFb`). Lane A grades the 14 unclassified parses; lane I's 06:20 provenance grade has 6 passing (a primitive's own name, or a keyword literal) and 8 failing (a member set's rendered atoms). G read a primitive's box kind off its type at three sites (#7807).

**On master `ad5abe1b`:** 29 render or synthesized parses (28 failing beside D16022's floor), 7 source, 17 unclassified; 96 renders and 42 display renders. D16002 closed (#7798), P6 closed (#7785, #7793). The failing parses by owner: B 4 (P5 and `identFnTypeAnnNameOfRead`); E/F 9 (the shape grammar, #7800 pending); E 2 (`iisPushFieldElem`); G 15 (`valueAtomKind` over rendered atoms ×12, `msAtomIdOf`, `unionHasAtom` ×2). The renders a content decision reads: D's `monoRecordNominalPin`, `monoSubstAnnNode`, `monoTagRecordPinKind` and `monoNarrowedPinName` (#7805 pending), and E's `arenaEmitName`. Another 17 renders are tested only for emptiness or for the decline sentinel. That is a **presence test, and a floor** (coordinator, 2026-11-13): the answer is whether the type has a rendering, never anything in the text. Each family's test stands for:

- `rlRowNameOfTy(…) == ""` (`arrLitFrameRefTy`, `arrLitStoredElemName`, `collectARefArrayAnn`, `ensureRefElemTys`): the element has no arena type, so it has no ref-list row to name;
- a mono pin spelling `== ""` (`monoNicheWidenedPinName`, `monoArgTyNameRep`, `monoLitUnionPinOfTy`, `monoPinNominalSpelling`, `monoNoteBindDeliveryCall`): the pin speller cannot spell the type (an open or unpinnable type);
- `tyToNominalName(…) == ""` (`fnElemNominalName`, `nulRefElemEmitName`, `fieldElemRowName`): the type has no finite nominal name (a cycle, or a type variable);
- `unionSpellingOfTy(…) == UNION_SPELLING_DECLINE` (`coalesceResultUnionName`, `valueUnionNameOfTy`): the speller declines a type that is not a value union;
- `canonUnionKeyTextOfTy(…) == ""` (`valueUnionKeyTextOfTy`, `unRowOfTyWide`): the type keys no union;
- `cloSigNameOfTy(…) == ""` (`unionPartSpelling`): the member is not a closure signature.

None of the 17 hands its string to a compare or a parse elsewhere in its body. The one parse in `monoArgTyNameRep` is D16022's carried floor.

Owners (coordinator, 2026-11-13): `collectDeclaredUnion` ×2 and `identFnTypeAnnNameOfRead` (#7804) go to H; `internShapeAs` to E; `recordClonedNodeTyFb` to F (the pin-type carry, with D); `repElemTyOfName` to B; `monoNarrowedPinName` to D. D16061 closed with lane A's #7806 and left the carried list. `declTyIxOfName` (emit_rep:2150, `resolveAnnot`) is one census entry, failing only for callers whose argument is a render or a synthesized name: lane H owns the `collectDeclaredUnion` member calls, `declArmsMatchRow`, `registerValueUnionName` and `registerValueUnionNameAB` (site 55 waits on lane B's `storageNormTy`); lane B owns `repSlotOfElemTy`, `fieldElemTyIxOfName`, `repNameCanonId` and `rlDeclTwinTy`; the `s.udName` calls read the declared union's own identifier and pass. Each owner traces its callers' argument origin with the census before cutting.

**On master `09aede4a`:** 33 render or synthesized parses, 7 source, 19 unclassified; 99 renders and 44 display renders. D16050 and D16051 closed (#7797: member slices bank `boxTagOfTy`). `shapeWalkKeyOf` is deleted (#7794: the walk's key is two bits of walk state). What blocks the close (coordinator, 2026-11-13): the render-origin parses (F the shape family; B, D, E and G the rest), the renders that feed a decision (`arenaEmitName`, E; mono's R1 pin decisions, D), and D16002 (A, unfiled at this draft).

**On master `bf693a80`:** 36 render or synthesized parses, 7 source, 20 unclassified; 99 renders and 44 display renders. Since 11:10:
- D16062 closed (#7789, PR 2).
- The variant rows choose their fields by the arm's type and close D16030 (#7787). The arm's spelling (`uVariants[i]`) fails the canonical-key test in both directions, but nothing reads the table by name since #7737, so the spelling is a per-union position label and the table grades floor. `isStructAtom` is deleted.
- `unionArmsAllSame` compares declarations, not renders (#7788, #7790: `armDeclSame`).
- An arm mint interns its row at the arm's type (#7786).
- Lane F deleted the census's unreached parse sites behind loud floors (#7759).
- D16012 is filed (#7791). D16063 is filed, checker-only and carried past step 7 (#7792): three inferred-return namers decide value-union-ness by parsing the name they render, at check time.

**On master `6b9f3f3c`:** 38 render or synthesized parses, 13 source, 37 unclassified; 100 renders and 44 display renders. Lane A's canonical-key test (#7782, `2026-11-13-step7-canonical-key-tests.md`) grades five render-keyed tables floor: ref-list (`rlElem*`, keyed by rep id), `unNames`, the mv slot keys, mono's instance keys, and the shape_rows element names (R4d). The variant-row table (`uVariants`) is lane E's, in E's PR. D16062 PR 1 (#7783) and `recordClonedIsVarTy`'s deletion (#7779) landed. `internArmShapeRow` (#7768) answers the row its type already has, and renders only to label a row it mints.

**On master `39f3f015`:** 44 render or synthesized parses, 12 source, 36 unclassified; with #7764's widened render set, 101 renders and 44 display renders. D16000 (#7772) and D16001 (#7775) are closed. D16022 is filed (#7762). Lane H's #7776 counts programs that end in a refusal: `mapSoftTwinTagFail` now shows 2 programs (`generics/error-literal-union-map-twin-through-one-instance-plain-first.vl`), which settles the conflict; `nulNicheIsTestImpossible` and `emitMapUnionPayloadTail` stay at 0. New rows D16050 and D16051 (#7777): a union member's box code is a fact about its spelling. They block the close (coordinator: a rep decided by a spelling is what step 7 forbids) and close in lane G's later PR that switches the member-slice producer to `boxTagOfTy` together with its readers. Across #7776 the sites table moved in 197 rows, by reach counts and example strings only; no site changed origin class, and `mapSoftTwinTagFail` is the one site whose reach rose from 0.

**On master `23e03fce`:** 47 render or synthesized parses, 12 source, 40 unclassified, 13 renders. Since 08:15: P1 parts 1 and 2 (#7752, #7770), P4's `gaeEnsure` and gates (#7757), P6 (#7761, #7769), `arenaEmitName` down to 4 callers (#7763), G's literal-arm question (#7766), and `nodeArrayElemName` graded a floor (#7760; D16000 and D16001 filed).

**On master `32ab5241`:** 61 render or synthesized parses, 12 source, 52 unclassified, 13 renders (#7751 P4, #7754 G's literal-arm column, #7755, #7756 E's field split, #7758 B since 07:15). `shapeWalkKeyOf` still decides: `ln == kn` picks the by-declaration path, and `ln` reaches `gaeEnsure`'s parse and the interner's key. It goes to F for deletion after A's #7757 lands `gaeEnsure(ty)`; #7757's note gives the replacement for the `kn` guard.

**On master `846a645b`, after #7748 merged:** the census baseline reads 66 render or synthesized parses, 25 source, 54 unclassified and 13 renders (`arenaEmitName` is not yet among them).

H's origin probe (lower bound): 73 reached parse sites of class (a) or (b), 20 ambiguous bare-name
sites, 21 source-only and 34 unreached, beside 13 renders. L2 stays open.

Lane H's per-site grade (#7748, `scripts/render-parse-origins.ts`) supersedes that: 75 render or
synthesized parse sites (a lower bound), 19 source-only, 55 ungraded, and 13 renders. Lane I's
triage, by mechanism (sent to the coordinator to assign):

| package | parser | sites | owner (coordinator, 2026-11-13) |
| --- | --- | --- | --- |
| P1 value-union-ness of a name | `isValueUnionName` | 16 | H 13 (G's 12 and H's 1); E 3 inside D6 |
| P2 atom kind of a member set's rendered atom | `valueAtomKind` | 13 | G, one producer change in the member-set slice, with P7's G sites and `msAtomIdOf` |
| P3 shape-spelling grammar | `groupInnerOf`, `nameIsShapeSpanEnds`/`nameIsShapeOpen`, `tyTopLevelSplit`, `peelGroupParens`, … | 18 (A's #7744 deleted `armMintShapeName`'s two) | E: emit_base 9, collect 4; F: shape_intern 3 (`internShapeFieldElemsTy`, `internInlineShapeTyGo`, `internShapeAs`); G: `msAtomIdOf`; B: `identFnTypeAnnNameOfRead` |
| P4 generic-application spelling | `gae*`, `annGenAppSpanEnds`, `nameMentionsGenAliasParam` | 11 | A |
| P5 a name resolved back to a type | `resolveAnnot`, `nameToTy` | 5 | B: emit_rep 3 and `recordClonedNodeTyFb` (ruled: converts, since `synthTypeRefTy` carries the type, and the TypeRef-text floor covers producing text, not reading it back); D: `recordClonedIsVarTy` |
| P6 mono spellings | `arrElemSuffixed`, `monoUnspacedUnions`, `canonEmitName` | 4 | D, after its PR 2 |
| P7 literal-set and nullable membership of a name | `nameIsLitUnionArmValueUnion`, `unionHasAtom`, `nullablePartOf` | 6 | G 5 (with P2); D 1 (`nonNulBaseOf`, D16040) |

The 34 unreached sites go to lane B after P5, as loud-floor deletions.

H's per-site table (`docs/internals/render-parse-sites.md`, #7748) moved the count to 69 (a)+(b)
once imported modules' declaration names grade as source, and 67 on master after #7744.

**The 20 bare-name sites, graded by provenance** (lane I, master `6faa6df4`):

| grade | sites | why |
| --- | --- | --- |
| passes: a primitive's own name, read off the type | 8: `memReadBoxedAtomKind`, `memReadNarrowOp`, `memReadCheckerAtomKind` (`t.primName`); `spreadSrcBoxAtom` (`tyArrayElemPrimName`); `nulScalarBoxAtomOf` (`repOfTy(inner).rdKind`: a rep descriptor's kind word, which also takes the sentinel `union`, answered -1); `emitNumExactCastFrom`, `emitHoleNumAsOpt` (`asExprNumTgtName` = `primNameStr(primNameOf(type))`); `njKindOfTy` (`primNameStr(p)`) | a `TyPrim`'s name is its identity, a keyword, not a rendered structure (check_ty_rep's `retAtomKindOf` states the same) |
| passes: a compiler literal | 2: `emitUnionCoerceValueAtom` (`"string"`), `valueKindIsPlainScalar` (a loop over keywords) | no type was rendered |
| fails: a member set's rendered atoms (P2, G) | 8: `printUnionPlanCode` (`atoms[d]`), `boxNarrowAtomFor` (`own[j]`), `emitUnionConcreteNumCross` (`unionArmsOf(uname)`), `xrepElemEq` (`unionBoxEqColumns`' arms), `boxNarrowScalarKinds` ×2 (`canonUnionMembersInto`), `emitBoxAtomRetagAtoms` (`msMemberAtomsOfSet` / `canonUnionMembersInto`), `staleBoxFrom` (`msMemberAtomsOfSet`) | the atoms are the canon render of each member |
| fails: P5 (B) | 1: `sTyIxOfNameTy`'s `annGenAppSpanEnds(nm)` | the same name `sTyIxOfNameTy` resolves back to a type |
| fails: F's field text | 1: `shapeFieldElemName`'s `nameIsInlineLitUnion(ftxt)` | `ftxt` is a field's spelling, among F's last `ftxt` readers |

So 10 of the 20 fail. P2 grows to 21 sites, and the census-scope total of failing parses is 77.

A `TyPrim`'s own name read off the type is an identity keyword, not a rendered structure, so it
passes (coordinator ruling, 2026-11-13).

**H's section 2, the checker-file sites reached during emit**, graded by the emit-side entry that
feeds each one. About 130 rows sit inside parser bodies, and each inherits its entry's origin:

| emit entry | check_* sites it feeds | grade | owner |
| --- | --- | --- | --- |
| `canonEmitName` (`monoPinUnionName`, mono:7942) and `canonEmitNameOfTy` via `arenaEmitName` (emit_collect:8143) | check_program's `canonEmitNameTs`, `canonShapeName`, `canonGenAppName`, `canonArrayName`, `canonFuncTypeName`, `canonEmitUnionName`, the `nulLit*` helpers, `canonSameShapeRecord`, `nameIsGenAppOfDecl`, `nameIsOneStrLit`; check_lit_union_spell (about 60 rows; up to 4,529 programs) | fails: the input is a render | D (P6) and the `arenaEmitName` callers |
| `resolveAnnot` (emit_rep:1104, 2092, 2097, 2148, 2780) and `nameToTy` (check_emit_queries:694, 713) | `annotResolve`, `applyGenAliasArgs` (with the bare `nameToTy(argNames[ai])`, 303 programs), `nameToTyReal` (with the bare `nameToTy(mapSpellKeyName(name))`, 606), `nameUnionTy`, `nameFuncTy`, `nameObjTy`, `retNameToTy`, `litMemberTy` (about 40 rows) | fails: each bare name is a piece the parser cut from a rendered spelling (a generic argument, or a map key) | B (P5) and D (`recordClonedIsVarTy`) |
| `valueAtomKind` (50 emit call sites) | check_ty_rep's `valueAtomKindSpan` ×8, `nulElemListAtomKind` ×7, `litUnionArrayElemOf` ×2 | fails where the caller passes a rendered atom (P2); passes for a primitive name | G (P2) |
| a synthesized TypeRef (the capture-cell rewrite) | `letDeclResolveAnnot` (check_statements:393, 3 programs): the source writes `(t: T) => void`, and the string received is `((T)=>void)[]`, the emitter's rewrite of it | converts (the `recordClonedNodeTyFb` ruling); its shadowed-parameter residue is carried as D16012 | B, with P5 (reach counts corrected in #7771's note) |
| checker source | `wsOrigTyOf` (check_demands:858): a bare type-parameter identifier | passes (coordinator) | — |
| a checker render, run during emit | `litUnionArmValueUnionRetName` (check_ret_names:345–346, 56 and 114 programs): `tyToEmitName` then `isValueUnionName` / `nameIsLitUnionArmValueUnion` | fails: in scope since it runs during emit | H, with P1 |

`arenaEmitName` (emit_collect:8143) is a render (`tyToNominalName` then `canonEmitNameOfTy`) that
the census does not count. It joins the render count, so there are 14 renders and 8 block the close.
Its six emit_collect callers go to E with P3 and D6, and `monoInstanceRetSpelling` goes to D with
P6. `slotRowTyOf` (emit_rep:2780) goes to B with P5 (coordinator, 2026-11-13).

## The opaque-sname arm (`VL_OPAQUE_SNAMES=1`)

With the arm on, `runs → not-runs` is 0 (coordinator, 2026-11-13): no known program traps armed.
The armed control is now byte-level. D12340's witness (7 lines) builds to a different module armed
than unarmed (`cmp` differs), and both run correctly. The spares are D14739, D15099, D15151,
D15241 and D15298. The close quotes that `cmp` on its own master, with a post-#7661 host and seed.

## A spelling-keyed registry graded: variant rows by the arm's spelling (lane E)

`mintVariantRows` (emit_collect) counts and mints a variant row for each struct member with
`isStructAtom(stmts, names[i])`, the spelling test (a declared struct name or an inline `{…}`). It
keys the row by that spelling: `uVariantsPush(names[i])`, and `collectVariantFields(stmts,
names[i], tys[i])` resolves the member's struct by name. The member's type `tys[i]` is in hand.

Lane E's probe, whose control fired at 7,013 reaches over the sweep, found that "the member type
is a `TyObj`" disagrees with the spelling test in exactly five programs. All five are intersection
arms spelled `Node&{v:i32}`, whose type is a record: D14162, D16001,
`objects/intersection-alias-field-and-nullable-positions.vl`,
`structs/recursive-nullable-field-equality.vl` and
`types/intersection-alias-recursive-positions.vl`. Taking the typed test moves three of them from
runs to an emit reject ("union variant names an unknown struct type"), because the row's key is
the spelling and an intersection spelling names no struct.

The variant-row key passes lane A's canonical-key test or is re-keyed by type (position and type,
as `variantIndexOf`'s retirement did). The owner follows from that result, likely lane B.
`isStructAtom` and its emit_base spelling test go with it. So does `collectVariantFields` → `collectShapeVariantFields`: it dispatches on `nameIsShapeSpanEnds` of the arm's spelling and splits that spelling's fields, and although the record type supplies each field's name and type, `variantFieldIdText(ftxt, fldTy)` stores the field text as the variant table's identity column. It re-keys with `uVariantsPush(names[i])`, not apart from it. Resolved by #7787: the rows choose their fields by type, and the spelling is a position label nothing reads by name (floor).

## Where the emitter's type hint and the name-derived type disagree (lane A's probe)

Every disagreement is `tySame` true and `tyEq` false, and in each the emitter's type hint wins, so
no program reads a wrong answer:

- **A stale twin-row label (a layout fold, not a defect).**
  `closures/twin-fieldset-closure-field-string-vs-bool-result.vl`: the field
  `{f: (i32,i32,i32) => boolean}` carries the `=> string` twin's name, because two layout-identical
  closure records fold to one heap type and the name is the folded twin's. It prints `false`, as
  filed.
- **A newtype's name resolves to its unbranded base** ([D16003](../inventory/D16003.md), a refutation pin, runs today):
  `memory/newtype-struct-reflist-key-population.vl` (`PView`),
  `maps/newtype-struct-map-value-struct-field.vl` (`EView`), and
  `types/newtype-over-litunion-alias.vl` (`NK = new K`). `declTyIxOfName` answers from
  `cUserTypes`, which holds the newtype's base, while the brand is the arena index in `nwTyIxs`.
  So a type read back off the name is `tySame` with the brand but not `tyEq`. The two are
  rep-identical, so no run reads the difference.
- **The classes already graded floors by the coordinator:** a hole function against a scalar
  name; an alias against its structural expansion (`D`, `U`, `I`, `Json|null`); a literal against
  its widening (`1|2|null` against `i32|null`).

## Floors held by a filed row

Each is a checker-side gap outside step 7's exit (coordinator, 2026-11-12): the site reads a name
because the checker records no type there. Each is filed `runs today and must keep running`, and
its witness runs as filed on master `54b68c07`. The close carries them forward.

| row | site | the gap |
| --- | --- | --- |
| [D15976](../inventory/D15976.md) | `emitObj` → `fieldRowKindIn` | a record field's un-annotated `[]`-or-`null` join reaches emit with its element hole unfilled |
| [D16010](../inventory/D16010.md) | `sLitMintRow` | a hole instance's record literal has no elaborated type, so it builds at its minted row |
| [D16060](../inventory/D16060.md) | `printUnionPlanCode`'s name fallback | a field read through an un-annotated parameter stays typed at the hole in its instance |
| [D16012](../inventory/D16012.md) | `letDeclResolveAnnot`'s residual re-parse | it re-parses only when two bound type parameters share a name or a type variable survives `substTyDeep`, where substitution by name can answer a concrete but wrong type; a checker gap (`generics/nested-generic-shadowed-param-capture.vl`) |
| [D16063](../inventory/D16063.md) | three inferred-return namers (check time) | they decide value-union-ness by parsing the name they just rendered; checker-only |
| [D16022](../inventory/D16022.md) | `monoArgTyNameRep`'s residual census site | a record-list literal argument with an open element type (a hole function or a type parameter) pins by its element's name; the pin must be chosen after the callee instance resolves, a mono reorder beyond step 7 (7 programs, all running, the scope loud) |

## The scoreboard re-baselined (exit criteria, coordinator rulings 2026-11-11)

| target | reference | at the close | reason |
| --- | --- | --- | --- |
| emit_classify ↓ | 14,412 lines (2026-11-10) | TBD (14,962 at census 4) | each name read became a typed read plus an invariant `emitFail`; graded instead by the classifier census, NAME 52 → TBD and SPELLING 12 → TBD |
| seed ↓ | 6,589,035 bytes (the seed-size gate's baseline, #6986) | TBD (6,722,819 at census 4) | the conversions' cost, named as `2026-11-01-seed-growth.md` did; graded instead by the name ladders deleted |

`vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --write-baseline` is run in this
PR, on a fixpoint seed of the merged tree.
