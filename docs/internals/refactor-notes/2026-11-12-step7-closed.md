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

## Still failing at this draft (master `32ab5241`, 2026-11-13 08:15)

The close is opened when this list is empty, or holds only items with an open PR. Closed since
the 23:00 draft: lane D's mono rows (#7681, #7688, #7699, #7708, #7710), lane F's `sFieldRefSlot`
fallback (#7683), lane H's `variantNestedRow` lookup (#7679) and `printUnionPlanCode` (#7690),
lane B's `structRowOfSpelling` chain (#7687), lane G's `utkAtomText` (#7704, so `sNameIx`'s
contract carries no exception), lane E's field-set spelling key (#7707), E/F's `internShapeDeepOfTy` render (#7705, the shape walk takes a type), `emitUnionUnionEq`'s two name reads (#7714), the union-name wrappers' 12 consumers (#7720, G's cut 8a), `variantNestedRow`'s spelling mint (#7724: the stored row, else a loud failure), the `unionNameOfExpr` producer's alias-spelling calls (#7723: keyed by the non-null part's resolved type), `armFieldStructRowMinted`'s spelling input (it interns by type and records the row's name as a label), `structElemArrayLowerable` (#7738: `structNameOfTy`), `unionSetAtomsOf` (#7736, deleted), `tyIsDeclaredNominal` (lane E: `structNameOfTy`, `genAppNameOfTy`, a union alias that is not a numeric literal union) `variantIndexOf` (#7737, deleted), `shapeWalkSplitsUnion` (#7753: the walk's value-union and declared-union tests read the type) and D16040 (#7749: the last `nonNulBaseOf` caller is gone). After #7727, `unionNameOfExpr` has two callers: the function-value-set floor and D16060's.

| lane | sites |
| --- | --- |
| G | D16000: one type, two `unNames` rows (A's canonical-key probe, #7760) |
| A | D16001: one type, two ref-list rows (the same probe) |
| A | `internArmShapeRow`'s render (`tyToEmitName(aty)` into `armMintShapeName`), after E's step (d), which waits on F's last `ftxt` readers in `shapeFieldElemName` |

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

The census's other five renders are all in one function, `nodeArrayElemName`
(check_emit_queries:742, 764, 768, 772, 791). It renders an array literal's element type to a name,
and emit_shape_rows' `arrLitBoxElemName` (2 callers) and `arrLitElemRender` (8 callers) consume
that name. Graded a floor under the spelling-index contract by lane A's canonical-key probe (#7760, pending): no duplicate row carries its key. It moves to the floors when #7760 lands. The probe's one-type-two-rows cases are filed as D16000 (`unNames`, lane G) and D16001 (ref-list, lane A), and both block the close.

Of the 13 renders, six are floors and seven block the close. Before the close opens (in the close PR): re-run every floor witness on the then-current master and quote its output; probe `nulNicheIsTestImpossible` and `emitMapUnionPayloadTail` across the sweep (scratch build, a firing control) to show 0 reaches. The one parse, `nonNulBaseOf`, is D16040's (lane D's PR 2).

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
- (c) user-written source text: not a violation.

A `check_*` site is graded by the same rule. A checker parse of the program's own annotation text
is the checker's job. A checker parse reached from emit whose input the emitter or mono produced
(`synthTypeRefFb` → `recordClonedNodeTyFb`) is in scope, whatever file holds the parser. Lane I
then lists (a) and (b), renders included, by owner with counts, for the coordinator to split.
§3.3's sentence "parses no type spelling back" waits on that.

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
| a synthesized TypeRef (the capture-cell rewrite) | `letDeclResolveAnnot` (check_statements:393, 3 programs): the source writes `(t: T) => void`, and the string received is `((T)=>void)[]`, the emitter's rewrite of it | converts (the `recordClonedNodeTyFb` ruling) | B, with P5 |
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

## Floors held by a filed row

Each is a checker-side gap outside step 7's exit (coordinator, 2026-11-12): the site reads a name
because the checker records no type there. Each is filed `runs today and must keep running`, and
its witness runs as filed on master `54b68c07`. The close carries them forward.

| row | site | the gap |
| --- | --- | --- |
| [D15976](../inventory/D15976.md) | `emitObj` → `fieldRowKindIn` | a record field's un-annotated `[]`-or-`null` join reaches emit with its element hole unfilled |
| [D16010](../inventory/D16010.md) | `sLitMintRow` | a hole instance's record literal has no elaborated type, so it builds at its minted row |
| [D16060](../inventory/D16060.md) | `printUnionPlanCode`'s name fallback | a field read through an un-annotated parameter stays typed at the hole in its instance |
| [D16061](../inventory/D16061.md) | the field recorder | an anonymous record handed to an un-annotated parameter keeps its field typed at the hole, so the recorder resolves the element's name |
| D16022 (lane D's #7762, unfiled on master at this draft) | `monoArgTyNameRep`'s residual census site | a record-list literal argument with an open element type (a hole function or a type parameter) pins by its element's name; the pin must be chosen after the callee instance resolves, a mono reorder beyond step 7 (7 programs, all running, the scope loud) |

## The scoreboard re-baselined (exit criteria, coordinator rulings 2026-11-11)

| target | reference | at the close | reason |
| --- | --- | --- | --- |
| emit_classify ↓ | 14,412 lines (2026-11-10) | TBD (14,962 at census 4) | each name read became a typed read plus an invariant `emitFail`; graded instead by the classifier census, NAME 52 → TBD and SPELLING 12 → TBD |
| seed ↓ | 6,589,035 bytes (the seed-size gate's baseline, #6986) | TBD (6,722,819 at census 4) | the conversions' cost, named as `2026-11-01-seed-growth.md` did; graded instead by the name ladders deleted |

`vl run scripts/seed-size.vl --compiler build/vl-compiler.wasm -- --write-baseline` is run in this
PR, on a fixpoint seed of the merged tree.
