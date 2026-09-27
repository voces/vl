# Code-quality survey, third pass: `compiler/*.vl`

Surveyed at `5eee42758` for the owner's cleanup ask: duplicate code, excessive comments,
non-semantic usage (redundant annotations, magic numbers, ints standing in for named
kinds, boolean parameters, sentinel ints) and giant files, under one hard constraint:
**the compiler must stay fast.** Each row names the file and lines, the problem, the
change, the risk, the expected perf effect and the proof it owes. The earlier passes
are [README.md](README.md), its three first-pass area surveys and their second passes; §6 says which of their
rows still stand.

Every number here comes from a script in §7 and should be re-derived from it, not
quoted, once the tree moves.

## 1 · Sizes

`wc -l compiler/*.vl`: **193,778 lines in 31 files.** Three files hold 62% of them.

| file | lines | comment lines | comment % | functions over 400 lines |
| --- | ---: | ---: | ---: | ---: |
| `typecheck.vl` | 54,451 | 10,599 | 19.5 | 6 |
| `emit_classify.vl` | 39,129 | 10,296 | 26.3 | 0 |
| `wasmEmit.vl` | 27,626 | 5,750 | 20.8 | 9 |
| `emit_collect.vl` | 12,351 | 2,789 | 22.6 | 1 |
| `emit_sections.vl` | 7,586 | 1,506 | 19.8 | 1 |
| `emit_mono.vl` | 6,563 | 1,268 | 19.3 | 2 |
| `lint.vl` | 5,117 | 935 | 18.3 | 0 |
| `driver.vl` | 5,088 | 1,004 | 19.7 | 0 |
| everything else (23 files) | 35,867 | 7,650 | 21.3 | 2 |

**7,126 top-level functions**, 445 of them one line; 222 are over 100 lines, 73 over 200, **21 over 400**. The largest:

| lines | function |
| ---: | --- |
| 923 | `wasmEmit.vl:26704 emitCoalesceGo` |
| 772 | `emit_mono.vl:4226 monoMakeInstance` |
| 767 | `typecheck.vl:37174 finishInferredReturn` |
| 759 | `wasmEmit.vl:17049 emitAssign` |
| 721 | `typecheck.vl:46726 checkBinExprNodeReal` |
| 696 | `emit_collect.vl:5796 collectA` |
| 609 | `emit_sections.vl:6034 emitTypeSection` |
| 609 | `typecheck.vl:37963 checkFuncDeclNode` |
| 591 | `typecheck.vl:34192 checkMemberCallNode` |
| 588 | `wasmEmit.vl:7146 emitArr` |

**Duplicate clusters.** Normalising every identifier to `X`, number to `N` and string to
`S` and grouping functions of six or more lines by body: **165 groups holding 502
functions.** Most small groups are the same SHAPE over different tables (the `fb*`
instruction encoders, the per-type `binOpcode*` tables) and are not duplication in any
useful sense. The real ones are §3's rows.

**Churn.** Commits touching each file on master over the four days before the survey:
`emit_classify` 84, `wasmEmit` 83, `typecheck` 83, `emit_sections` 39, `emit_collect` 35,
`emit_rewrite` 27, `emit_mono` 26. Everything else is under 25. Tranche 1 stays out of
the first three except for one-line call-site renames.

## 2 · Two facts every "name the magic number" change has to know first

**A module `const` is a global read, not an immediate.** `const K = 15` lowers to an
immutable global and every use to `global.get` (probe: `function f(x: i32) { x == K }`
emits `(i32.eq (local.get 0) (global.get $g))`, where `x == 15` emits `i32.const 15`).
The seed holds **418 such literal-initialised immutable globals, read 1,386 times.** Fuel
counts both forms alike; the engine pays a load for one and not the other, and the seed
pays a byte or two per read. So a campaign that turned 1,387 raw-literal comparisons into
named `const`s would add ~1,400 loads to the hottest classifiers. It is not free today.

**A string literal union is an i32 tag.** `type Q = "arrNew" | "coalesceCall"` as a
parameter lowers to `i32`, and `q == "arrNew"` to `(i32.eq (local.get $q) (i32.const 0))`
— the same code a raw `q == 0` produces, and cheaper than a `const`. This is the
zero-cost way to name a kind, and the compiler already uses it (`VKind` in `emit_rep.vl`).
One wrinkle, observed and not yet priced: a function containing any string-literal `==`,
including a literal-union one, declares twelve string-equality scratch locals whether it
uses them or not (`pick` in the probe: 12 locals; the same function over `i32`: 0).

Both are measured by the probes in §7.

## 3 · Ranked

Value is what the change buys a reader or the compiler; risk is the chance the proof
misses something. "Perf" is the expected effect on the self-compile and on generated
code, before measurement; tranche 1's rows carry their measured effect in §4.

| # | finding | where | change | risk | perf | proof | tranche |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **2,659 redundant-type hints**: return and binding annotations the checker infers exactly — and **removing them makes the self-compile slower** (§4.1) | `typecheck` 929, `emit_classify` 694, `driver` 330, `wasmEmit` 148, `emit_collect` 123, `emit_rep` 101, 17 more files 334 | first make inference cheap (a checker perf row, §4.1), then delete the spans | none for the output: 379 removals gave a byte-identical seed | **+70% self-compile fuel** as measured; ~2–13M fuel per inferred return, 1.4G per un-annotated list literal in `nodeChildren` | byte-identical seed AND self-compile fuel per file | not until the inference cost is fixed |
| 2 | **the same eight-line membership scan, 40 times**; the same index-of scan 18 times | every file; see §3.1 | `compiler/listutil.vl`: `strListHas`, `i32ListHas`, `strListIndexOf` | none: identical bodies | none for the parameterised copies (a direct call replaces a direct call) | IDENTITY | **1** (16 parameterised copies); 2 (the table-bound ones, §3.1) |
| 3 | **the checker and the emitter each own a copy of the i32-lexeme tests** whose comments say they must agree | `typecheck.vl:15040`, `:15064`; `emit_bignum.vl:83`, `:106` | the checker calls `emit_bignum`'s | none | none | IDENTITY | **1** |
| 4 | **two substring scans** | `cli_util.vl:343 cliContains`, `emit_base.vl:2989 strContains` | one `strContains` in `strutil.vl` | none | none | IDENTITY | **1** |
| 5 | **`nestedFnDeclaredIn` twice, and the scope-chain walk around it twice**; the headers say the twin exists because of an import cycle that no longer runs that way | `emit_classify.vl:4490`, `emit_collect.vl:3181`, `:3207` | one `nestedFnDeclaredIn`, one `nestedFnOnChain`, both resolvers call it | low | none: the `nestedNameBySid` gate stays inline, so the shared walk is called only when it can hit | IDENTITY | **1** |
| 6 | **the arrNew and coalesce-call scans are eight functions, two walkers** differing in one leaf test | `emit_query.vl:247`–`:525` | one walker over `ScratchQuery = "arrNew" \| "coalesceCall"` | low | one i32 compare per visited node | IDENTITY; ladder ratchet falls by 2 | **1** |
| 7 | **1,387 comparisons of a non-length value against a raw int** outside {-1, 0, 1}: field codes (`code`, `sFieldTypes`, `uFieldTypes`, `variantFieldTypeAt`, `memberFieldCode`: ~230), `rlElemKindTbl` (69), `mvValKind` (67), scalar codes (`scode`/`sc`/`vcode`/`vc`: ~110), list kinds (`pendingListKind`/`elemNest`/`nestKind`/`ank`: ~50) | `emit_classify` 567, `wasmEmit` 364, `typecheck` 125, `emit_collect` 109, `emit_bytes` 83 | first (a): the emitter folds a literal-initialised immutable global into `i32.const` at each read, which makes every existing named constant free; then (b) one code family at a time becomes a literal-union type (`FieldCode`, …), or named `const`s once (a) lands | (a) low, (b) medium per family | (a) removes 1,386 loads from the seed; (b) neutral after (a) | (a) corpus `cmp` plus `plumb-shape-cost`; (b) IDENTITY per family | 2 (a); 3 (b) |
| 8 | **the rep-key renderer is written five times** (`repCanonKeyGo`, `repElemKeyGo`, `repMvValKeyGo` at 85–98% pairwise; three identical 33-line `*Id` entry points) — emitter pass 2 §5.1, not landed | `emit_rep.vl:422`, `:597`, `:802`, `:1356`, `:1586`, `:1636` | `repKeyGo(ty, mode)`; one entry body | medium: the fold table is the content | neutral | byte-identical seed; `rep-fuzz-check.sh` (mandatory) | 2 |
| 9 | **37 `nodeTyIs*` / `nodeArrayElemIs*` predicates**, four pairs identical after normalisation — front-end pass 2 §7, not landed | `typecheck.vl:44056`–`:45676` | one `nodeArrayElemTy(ix)` and the leaf delegated to the `tyIs*` sibling | low | neutral | IDENTITY | 2 |
| 10 | **137 functions take a `boolean` parameter** (typecheck 52, wasmEmit 30); the largest are `finishInferredReturn(causeReported)`, `tyToNameGo(nominal)`, `emitPush(wantValue)`, `emitPopGo(nulBox)`, `objShapeAdapterless(direct)` | §7 census | a two-member literal union per parameter, named for what the caller means (`"value" \| "discard"`) | low | none: both are an i32 | IDENTITY | 2 (quiet files), 3 |
| 11 | **`typecheck.vl` is 54k lines** with banner-marked regions that are candidate modules: the function-effects summary and getter budget (`:50747`–`:52583`), flat layouts and nominal newtypes (`:18519`–`:20239`), the deep-`is` predicates (`:52998`–`:53651`) | `typecheck.vl` | split only a region whose call graph reaches back into the checker through a narrow, listed set, since a module cannot import its importer | medium | neutral | the module graph compiles; fixpoint | 3 (needs a call-graph census first) |
| 12 | **41,927 comment lines, 21.6% of the compiler, 2,824 `D<id>` citations**; the four comment lint codes are at zero, so what remains is content the lint cannot see: 239 backticked identifiers in comments that exist nowhere in the tree (after wasm spellings like `structref`, most are names the code no longer has — `plCacheMap`, `pushVT`, `declareLocals`, `nullSentinel`, `emitCodeSection`) | every file; `wasmEmit` 53, `emit_classify` 52, `typecheck` 42 | a stale-identifier detector as a fifth comment code, then the sweep | none | none | byte-identical seed | 2 |
| 13 | **the `exprIsStr*` family**: four methods (`Slice`, `CpAt`, `CpLen`, `Bytes`) identical after normalisation, seven in all — first pass §4.2 | `emit_classify.vl:8837`–`:8916` | one `exprIsStrMethod(ix, name)` | low | neutral | IDENTITY | 2 |
| 14 | **`fieldCodeOfVKind` / `fieldCodeOfListRep`** (53 lines each) and **`rlElemCodeOfListRep` / `eqListKindOfListRep`** (29 each) are the same ladder over one code table | `emit_classify.vl:23120`, `:35098`, `:35050`, `:35163` | one table, read twice | low | neutral | IDENTITY | 2 |
| 15 | **the table-bound membership scans** — `isBodyTyDecl(n)`, `gaIndexOf(name)`, `flatIndexOf(name)`, `modIndexOfKey(key)` and ~35 more, each a private loop over one module table | §3.1 | body becomes `i32ListHas(table, x)` | none | one extra call per query; `modIndexOfKey` is 47% inclusive on a 400-module build (`vl_scaling_shape_test.ts`), so measure before touching it | IDENTITY; the scaling-shape `modules` axis | 2 |
| 16 | **the operator set is spelled three times** and one header is wrong about the other two — front-end pass 2 §8 | `ast.vl:1896`, `parser.vl:2809`, `:2827` | derive the three from one list | low | neutral | byte-identical seed | 2 |
| 17 | **`ErrExpr.errWhat` / `errAt` are written and never read** — front-end pass 2 §10.5 | `ast.vl:75`, `:2175` | drop the fields | low | a smaller node | fixpoint; parse-error fixtures | 2 |
| 18 | **sentinel `-1` returns: ~2,300 `return -1`** (wasmEmit 951, emit_classify 643, typecheck 418) | every file | none wholesale: an `i32 \| null` is a box, and these sit on the hottest paths. The honest-type work is the sentinel lint's (`sentinel-index-unguarded`, 326 reads) | — | a nullable would cost an allocation per answer | — | not scheduled |
| 19 | **21 functions over 400 lines** (table in §1) | `wasmEmit` 9, `typecheck` 6 | split at seams with few live locals, as #2591 did for `checkFuncDeclNode` | medium | neutral to slightly positive (smaller frames) | byte-identical seed | 3 |
| 20 | **594 unused-parameter hints**, all `_`-prefixed and deliberate (a uniform signature across a family) | `wasmEmit` 57 in-file | none | — | — | — | not scheduled |

Rows 2–6 are tranche 1 and are §4. Row 1 was tranche 1 until it was measured (§4.1). Rows
7(a), 8, 9, 12, 13, 14 and 15 are the proposed tranche 2 (§5).

### 3.1 · The membership-scan clusters

Parameterised `(xs, v)` copies — **replaced in tranche 1**: `ast.strListHas`,
`emit_base.capHas`, `emit_sections.igShadowed`, `typecheck.nameInList`, `typecheck.nameIn`,
`typecheck.listHasStr`, `lint.txListHas` + `lint.txListIndexOf`, `typecheck.weParamIx`,
`emit_classify.lexInLexes`, `emit_collect.dstPinIsTyParam`, `emit_mono.monoI32ListHas`,
`typecheck.i32InList`, `typecheck.cwIntHas`, `typecheck.nameInI32`, `typecheck.jwSeenHas`,
`typecheck.listHasI32`; and `typecheck.mapTwinIn`, a copy of `tyArrHasEq`.

Table-bound copies — **tranche 2** (row 15): `isBodyTyDecl`, `fnHasTpBound`,
`modSelfFnDeclared`, `tailAssignInFlight`, `retMapInFlight`, `fnTyParamName`,
`unRowHasTyIx`, `monoInstantiatedAny`, `drwCloShadowed`, `chainHasMinus`,
`isHoleMapDemandTy`, `isTopLevelStmt`, `weIsOpen`, `isJoinHoleUnion`, `isBuiltinTyName`,
`isNewtypeName`, `isPlainAliasRef`, `partsHaveNull`, `holeHasIsAlt`,
`holeIsArrayDemanded`, `onInferStack`, `isInferLetNulStr`, `isInferLetNulBool`,
`castClobbered`, `gwIsLocal`, `gwDiscarded`; and the index-of family `declGpRowOf`,
`externSlot`, `cliSrcCacheGet`, `vcDgFind`, `modIndexOfKey`, `cloSigPosOfKey`,
`gaeIndexOf`, `gaeBaseSlot`, `repStructRowByName`, `klSetIndexOf`, `gaIndexOf`,
`flatIndexOf`, `ufcsWhyRow`, `getRowOf`, `saFind`, `maFoldRowOfDecl`. Each keeps its
name, which says what the table means; its body becomes one call.

## 4 · Tranche 1, landed in this PR

Rows 2–6, one commit, graded by IDENTITY: the candidate compiling master's source reproduces
master's fixpoint byte for byte, and the candidate's own fixpoint holds. The measured
effects are in the PR description, beside the checks that graded them.

### 4.1 · Row 1 was built, proved byte-identical, and withdrawn

The checker's `redundant-type` spans were deleted in the seventeen files outside the hot set
— 379 annotations — and the seed stayed byte-identical (three in `extents.vl` were kept: the
`extWalk`/`extKids`/`extBlock` cycle resolves its return later without them, which reorders
the type section). Byte identity says the OUTPUT is unchanged. It says nothing about what the
SOURCE costs to compile, and that is where the price is: the master seed compiling the
edited source burned **88.13G fuel against 51.68G** for master's source, +70%.

Graded one file at a time (master's source with one edited file, the same seed, fuel exact):

| file | removals | fuel added |
| --- | ---: | ---: |
| `ast.vl` | 69 | **+35.9G** |
| `emit_rewrite.vl` | 25 | +328M |
| `emit_rep.vl` | 101 | +220M |
| `emit_sections.vl`, `check_query.vl`, `format.vl`, `emit_bytes.vl` | 46 | +72M to +87M each |
| the other ten | 138 | −32M to +58M each |

Almost all of `ast.vl`'s is one ingredient: its 25 `const out: i32[] = [n.a, n.b]` bindings
in `nodeChildren` / `nodeSpineChildren`. Restoring just those annotations and keeping every
other removal brings the file back to +34M. So an un-annotated list literal of arena fields
that flows to a function's return costs about **1.4G fuel of checking each**, and an inferred
return about 2–13M. The first is a performance defect in inference, not a style question,
and the second is a standing price every un-annotated function in the tree already pays.
Either way the removal is not the cleanup it looks like, so it was withdrawn; §5 schedules
the inference fix first.

This is the fixture-that-annotates lesson from CLAUDE.md seen from the cost side: an
annotation pins work the checker would otherwise redo, and byte identity cannot see work.

## 5 · Proposed tranche 2

In order, each its own PR:

1. **The inference cost behind row 1.** File the `nodeChildren` witness (§4.1) as a checker
   performance row, find which pass re-walks per un-annotated list literal that reaches a
   return, and give it a `vl_scaling_shape_test.ts` axis. Only then remove annotations, one
   file per PR, graded by byte identity AND self-compile fuel.
2. **Row 7(a), fold literal-initialised immutable globals into `i32.const`.** An emitter
   change: a read of a global whose declaration is `const NAME = <int literal>` emits the
   literal. Priced by `plumb-shape-cost` and the self-compile, graded by corpus `cmp` of
   every fixture that reads such a const. It makes the 1,386 existing named-constant reads
   free and is the precondition for naming any of row 7's magic numbers.
3. **Row 15, the table-bound scans** — measured one call at a time; `modIndexOfKey` last
   and against the scaling-shape `modules` axis.
4. **Rows 9, 13, 14** — the `nodeTyIs*`, `exprIsStr*` and code-table twins, IDENTITY each.
5. **Row 8, the rep-key renderer**, with `rep-fuzz-check.sh`.
6. **Row 12, the stale-identifier detector** as a comment code, then the sweep, byte-identical.
7. **One scratch walk, not two.** Every caller of `exprHasScratch` / `blockHasScratch` /
   `fnHasScratch` asks both queries of the same node back to back; one walk returning both
   answers halves the work and pays back the ~0.04% plumb fuel row 6 costs.

Tranche 3 is structure: row 7(b) family by family, row 10's boolean parameters, row 11's
split after a call-graph census, row 19's long functions.

Row 7(b)'s first family, the struct and variant FIELD CODES, is named: the `FC_*` consts
beside `sFieldTypes` in `emit_state.vl`, used at 533 sites (comparisons against a field
code, the producers' literal returns, and literal codes passed or stored). Row 7(a) folds
every read into the literal, so the seed was byte-identical to master's.

## 6 · What the earlier passes left undone

Still standing at `5eee42758`, re-checked: first-pass row 12's remaining classifier sites
(refuted, not merged); emitter pass 2 rows 2 (the env-parameter ABI, a ruling), 4 (the
rep-key renderer, row 8 here), 6, 7, 8, 9, 11 (`binOpcode` ×4: identical after
normalisation because they are four opcode TABLES; not a DRY target) and 14; front-end
pass 2 rows 4 (`recordRedundantAnnot`'s scan), 5, 6 (row 9 here), 8 (row 16), 9, 11, 12, 13
and 14 (row 17). Consolidated rows 19 and 20 are owner rulings. Emitter pass 2 row 12
(`nestedFnDeclaredIn` ×2) and §5.3's scan clusters are closed by tranche 1.

## 7 · Method

All read-only, from the worktree at `5eee42758`:

* **Functions, sizes, duplicate groups, boolean parameters**: a function is
  `^(export )?function NAME(` to the next column-0 `}`, or its own line when that line closes
  its braces; bodies normalised as §1 says.
* **Redundant annotations**: `vl check compiler/<file>.vl --severity hint --json` per file
  (the hint is reported for the entry module only), code `redundant-type`.
* **Magic numbers**: every `<subject> (==|!=|<|<=|>|>=) <int>` outside comments and
  strings, excluding `-1`, `0`, `1` and `.length` subjects, grouped by the subject's last
  segment.
* **Const and literal-union lowering**: two five-line probes built with `--names` and read
  with `node_modules/.bin/wasm-dis`; the seed's global census from `wasm-dis` of
  `build/vl-compiler.wasm`.
* **Comments**: `//` lines per file; a stale identifier is a backticked name of six or
  more characters in a comment that appears in no `compiler/`, `std/`, `scripts/`,
  `tests/`, `lsp/src/` or host source file.
* **Churn**: `git log --since='4 days ago' --name-only -- compiler/`.
