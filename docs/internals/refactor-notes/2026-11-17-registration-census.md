# Registration census: rows registered after the rep tree is built

Lane F1, 2026-11-17, master `ca88a78ca`. The question: which emit tables (union rows, struct rows,
variant rows) gain a row after the rep tree has been built from their absence. That is the family
D16911, D16948, D2681, D16953 and D16947 were each one site of. #8979 repairs it by rebuilding the
tree when the union rows grow; this note measures what that rebuild covers, and proposes the
single registration step that makes the rebuild unnecessary.

## Instrument

A scratch compiler built from master and never committed (the seed carries nothing):

- **Late registrations.** After the program's first rep-tree build (`rtSync` bumping `rtGen`),
  each row registration is counted. Union rows are counted at `unTyKeyPushRow`, tagged with the
  `registerInlineUnionAt` site code that drove them. Struct rows are counted at the five
  `sNames.push` sites, variant rows at `uVarTyIx.push`. Each count is keyed by kind, producer and
  `emitPhase`.
- **No-rep nodes.** Every `emitExpr` node whose list, union or record type has no rep
  (`repOfTy(..).rdKind == null`), by node kind.
- **Shared renderings.** The number of renderings (`tyToEmitName`) shared by two or more type ids
  that were asked for a rep.

Each compile reports one `CENSUS …` line, written as an `emitFail` at the end of emit. A zero exit
means the compile was clean. A compile that failed before the report is counted as unmeasured.

**Control.** D16953's witness reports
`late/union/site46/monomorphizing=1 late/struct/internInline/monomorphized=1`. The same program
without the record line reports no late keys, and `print(1)` is clean.

## Population

20,815 of 20,818 files reported: 1,478 distilled cells, 10,822 named cells, 8,517 `tests/cases`
files, and `compiler/entry.vl`.

| outcome | files |
| --- | --- |
| reported a census line | 14,547 |
| clean, no keys | 1,631 |
| failed before the report (unmeasured) | 4,637 |

The unmeasured files are expected `@error` cases and the cells' own not-runs.

## 1. Registrations after the first build: collect's own interleaving

8,075 files register a row after the first build. Most of these registrations happen in phase
`passes`, because collect asks for reps between its own registrations:

| producer | rows | files |
| --- | --- | --- |
| `internInline` struct rows | 6,999 | 4,334 |
| `#ref` atom struct rows | 4,254 | 2,840 |
| `collectVar` variant rows | 3,727 | 2,352 |
| `collectDecl` struct rows | 3,391 | 2,088 |
| `collectAnon` struct rows | 3,469 | 1,747 |

The compiler itself has 553 such rows. This is collect's internal order, not the defect, and it is
out of scope here.

## 2. Registrations after `monomorphize` starts: the zero target

775 files register a row after `monomorphize` starts.

| phase | kind | producer | rows | files |
| --- | --- | --- | --- | --- |
| monomorphizing | union | site 46 (`registerInlineUnionOfTy`) | 383 | 301 |
| monomorphized | struct | `internInline` | 200 | 162 |
| monomorphizing | variant | site 46 | 225 | 125 |
| monomorphizing | struct | `internInline` | 133 | 109 |
| monomorphized | struct | `collectAnon` | 212 | 97 |
| monomorphized | union | `unTyKeyPushRow` (no site) | 81 | 70 |
| arenaFinal | struct | `internInline` | 60 | 58 |
| monomorphizing | union | other | 4 | 4 |

### The paths that register them

A `--names` scratch build traps at a file's first post-mono registration. Over 120 sampled files of
the 775, the first registration came from these call stacks:

| first-hit stack (innermost producer ← caller) | files |
| --- | --- |
| `monoRegisterPinUnion` ← `monoRegisterElabJoinRows` ← `monomorphize` | 33 |
| `monoRegisterPinUnion` ← `monoPinRecordTy` ← `monoPinRetype` | 15 |
| `internOwnShapeOfTy` ← `monoClosedRecordOwnRow` ← `monoBundlePinArg` / `monoBundleRecordAt` | 17 |
| `collectAnnShapes` (a pass after `monomorphize`) ← `runEmitPass`: `internShapeDeepTy`, `mintGradualObjLitRows`, `mintPinnedObjLitRows`, `mintUnionFieldObjRow` | 31 |
| `registerSharedReadUnion` and `registerValueUnionNameAB` ← `scanPrintUse` (a pass) | 5 |
| `collectAHeldRep` ← `heldRepOf` ← `arrLitMintTrees` | 6 |
| `monoPinMintedUnion` ← `monoSubstLetType` (D2681's path) | 2 |
| `monoPinCoalJoin`, `monoLamPinRetAnn`, `collectFnTagMapReadBox`, `gaeEnsure`, `tsVariant` | 1 each |

### The `arenaFinal` row (58 files)

The registrations during module emit come from two paths:

- **57 files:** `emitModule` (32) or `emitFuncCode` (19) → `arrLitMintTrees` → `heldRepOf`
  (`emit_state.vl`) → `collectAHeldRep` (`emit_collect.vl:5768`) → `internShapeDeepTy`. A list
  literal's held rep (D15220) is computed lazily at its first ask, and that ask comes while the
  module or a function body is already being written.
- **1 file:** `emitTypeSection` → `tsVariant` → `armFieldStructRowMinted`. A variant arm's field
  row is minted while the type section is written.

## 3. Nodes with no rep at emit

44 nodes in 25 files, all in passing `@run` tests:

| node kind | nodes |
| --- | --- |
| `ArrayLit` | 38 |
| `Call` | 4 |
| `Ident` | 1 |
| `Member` | 1 |

All are empty list literals, or calls returning one, whose `never[]`/`null[]`-shaped type has no
rep of its own by design: the build takes the destination's row (`listBuildOfTyHeld`). They are
not this family.

## 4. Shared renderings

Nearly every program asks for reps of distinct type ids that share one rendering: typically 1 to
10 per program, and 672 in the compiler. `tyToEmitName` collapses literal types, sealed copies and
fresh instance ids, so this count is noise. It is to be re-measured as "same canon key, different
rep answer".

## Design: one registration step after the passes

**Where it sits.** The registrations to absorb are mono's (pins, bundles, join rows) and the
passes after it: `collectGenAliasShapes`, `collectAnnShapes` and `scanPrintUse` mint rows for
instance types. A step before `monomorphize` would see none of them, so the single producer runs
once, after the last row-minting pass (`scanPrintUse`) and before `capCacheBuild`.

**What it does.** It walks every node type the elaboration and mono have closed, together with
every instance's annotation and parameter types, and registers each type's rows through the one
type-keyed path. That path is `registerTyReachUnions` plus `internShapeDeepTy`, keyed by the
interned type id. It then forces each list literal's held rep (`heldRepOf`), which moves the 57
`arenaFinal` registrations to this point, and mints the variant arm field rows `tsVariant` would
otherwise mint.

**What it replaces.**

- **Deleted, the type walk subsumes them:**
  - `monoRegisterPinUnion`'s registration (site 46) at its four callers: `monoRegisterElabJoinRows`,
    `monoPinRecordTy`, `monoPinCoalJoin`, `monoLamPinRetAnn`.
  - `monoPinMintedUnion`'s record and list arms. The union arm's spelling remains, since a pin
    still needs a name.
  - `monoClosedRecordOwnRow`'s callers' minting.
  - `monoRegisterValuePin`.
- **Become readers of rows the step has minted:** `collectAnnShapes`' post-mono mints
  (`mintPinnedObjLitRows`, `mintGradualObjLitRows`, `mintUnionFieldObjRow`) and `scanPrintUse`'s
  `registerSharedReadUnion`.
- **Reads only, after the step:** `heldRepOf` (its lazy mint is moved into the step) and
  `armFieldStructRowMinted` (it reads; the step mints).
- **Deleted once the census reads 0:** #8979's growth rebuild in `rtSync` (`rtUnRows`). It is
  replaced by an assertion: a row registered after the step is an `emitFail` naming its producer.

**Grade.** The census row-2 total (775 files) reaches 0. Also the usual bars: rep-fuzz exact, no
`runs → not-runs`, and L2 fuel quoted. Net compiler lines should fall.

**Risks.**

- A pin's spelling (the name `monoPinMintedUnion` returns) is read during mono to re-spell
  annotations. The registration can move; the spelling must not. The step registers under the
  same canon key, so the spelling's row is found.
- `collectAHeldRep` depends on facts that are final only at `arenaFinal`. Forcing it at the step
  needs those facts settled by then. If they are not, the step runs at `arenaFinal`, just before
  `emitModule`, and the assertion moves there too.

## The step, measured (PR 1)

**Census after the step.** On the distilled corpus, no row is registered once the rows are final:
nothing in `rowsFinal`, `capsCached` or `arenaFinal`. The unmeasured count is unchanged at 3,268,
so the step adds no compile failures. This counts the step's own phase, so the mono-time
registrations it does not absorb are registered before the rows are final, which the census
allows.

**Canon keys answered two ways after the step.** 22 distilled programs ask one canon key and get
two rep kinds after the step, `list`/`reflist` or `struct`/`variant`. Each one was run on the
step's seed and on master's fixpoint, and graded by reading the program. All 22 build and print
the right values, the same on both seeds:

- `d15201`, `d15204`, `d15220`, `d15226`: a function list, whose rep follows its set's tag
  decision.
- `d933`, `rv3310`: a generic union arm that its read narrows.

The canon key carries neither fact, so the census reports these splits and does not count them.

**`monoClosedRecordOwnRow` stays.** With it a no-op, 87 cases fail. All are function-bundle records
whose rows mono itself reads to spell the bundle, so it is a reader that runs during mono, not a
late registration.

**Two mono registrations stay, because they are reader dependencies.**

- `monoClosedRecordOwnRow`: with it a no-op, 87 cases fail (see above).
- `monoRegisterElabJoinRows`' second registration: a join row spelled `monoPinSpellShaped`, or the
  atom pin name for a literal union. Its readers find the row by the name mono spells, which a
  type-keyed registration cannot supply. Deleting it lost three distilled cells, `d15314_d315`,
  `d15318_two_pins` and `d15318_pin_J`, the last of them check-clean invalid wasm. A hand bisect
  over the deletions found it.

Both register before the step, which the census allows.

**Scope: the nodes mono made.** A first version registered the reachable unions of every node's
type. That cost +75% L2 fuel and 18 KB of seed for rows nothing reads (`buildCodePayload` alone
rose to 90G). A pin's types live only on the nodes `monomorphize` makes, instance clones and
synthesized annotations; the template's types are open. So the step walks the arena from the length
it had when `monomorphize` began (`monoArenaMark`), and forces held reps for every node. The seed is
back to master's size.

**Records.** The step does not intern every node's record type. Doing so took records off the
wider rows they share, and broke 8 cases, one by recursion. It gives a row only to an
annotation's closed record that has none, together with the records nested in it: the rows
D2681's arm minted.
