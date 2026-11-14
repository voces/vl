# Phase products and a session value: design note, 2026-11-14 (lane Q)

Review item L5 (`engineering-review-2026-11.md` §6): `Parsed`, `Resolved`, `Checked` and
`Elaborated` values owned by a `Session`, in place of reset-in-lockstep globals; then
dependency-tracked memoization in place of the driver's `sk`/`wi` banks, and per-module scopes with
symbol ids in place of rename-and-merge. The review says to start with an explicit `EmitCtx`/`FnCtx`
in mono. This note has to come before the typed IR (L1) is fixed, because it decides what owns an
IR node.

This note is docs only and changes no compiler code. It was measured at master `3b431fbbb`,
against a fixpoint seed: two `refresh-compiler.sh` runs gave byte-identical output, sha256
`742e3819…`. Static counts come from the census script in §B, a Node program (the repo carries no
Python), and from the repo's own `scripts/emitter-state-audit.vl`. Cost figures come from
`scripts/self-compile-time.sh` and a `VmHWM` read of the self-build. §A lists each command.

## 0. Summary

- **The state is one shared heap.** `compiler/*.vl` declares **4,876** module-scope mutables:
  every column-0 `let`, plus each `const` that some file mutates in place. `emitter-state-audit.vl`
  counts 4,729 by its own rule. **544** of them are written in one phase and read in another
  (§1.1). Two records carry most of the traffic: the parse arena `P` (`ast.vl:306`, 3,197 reads)
  and the checker `T` (`check_types.vl:178`, 2,375 reads, `T.tys` being the type arena).
- **The checker's surface is 1,166 symbols.** Non-checker files import 1,166 distinct checker
  symbols. The review counted about 1,115 on an older tree. They are 941 functions, 152 mutable
  tables, 56 constants and 16 types. Emit imports 527 of them, elaboration 348, mono 247, the
  rewrite passes 247, and the driver 200 (§1.2).
- **Every phase writes the AST.** After parse, the checker calls a node constructor at 184 sites
  and overwrites a node in place at 58. Mono constructs at 139 sites and the rewrite
  passes at 136. So `Parsed` is not a product today: it is the first tenant of a shared arena
  (§1.3).
- **Speculation rolls back 23 table families.** A quiet probe calls `checkMark()` (8 sites) and
  `checkRollback(m, set)` (9 site sets). The rollback covers 23 families by bitmask
  (`check_rollback.vl:137–168`), and 145 tables are listed for the rollback assertion. Beside it
  sit 30 `*Truncate`, 25 `*Mark` and 4 `*Cut` functions, and the `check_map_undo` log (§1.4).
- **188 globals are hidden arguments.** 70 of them are *consumed*: a caller sets the global, and
  the callee reads it and clears it at entry. 127 are *scoped*: saved, set, then restored around a
  call (9 globals take both shapes). By declaring file, `emit_mono.vl` has the most (31), then
  `wasmEmit.vl` (29) and `emit_elab.vl` (13). Mono's instance builder takes 11 explicit
  parameters and **15 hidden ones** across its three functions (§1.5).
- **Rename-and-merge** is 22 driver functions (726 lines), 4 demangle functions with 77 call sites
  in 32 files, and 18 `modSuffixOf` calls (§1.6).
- **The sk/wi banks** are 87 functions (1,870 lines) and 69 tables. They have 21 distinct
  invalidation reasons (`SK_*` 12, `WI_*` 9), which the review calls rules found by experiment
  (§1.7).
- **The design (§2).** A `Session` owns the interners: types (lane H), reps (lane E) and symbols.
  It also owns a per-module `ModSlot` that holds `Parsed`, `Resolved` and `Checked`, and a
  program-level `Elaborated` that holds the instances. **An IR function is owned by an instance**
  (an `InstId` in `Elaborated`). Its nodes refer to session ids (`TyId`, `RepId`, `SymId`,
  `InstId`) and point back into `Parsed` only for spans.
- **Steps 0 to 8 (§3).** Each one is fixpoint byte-identical and deletes code. The first is an
  explicit `InstReq` for mono's instance builder, then a `FnCtx` that absorbs `body: u8[]`, then a
  `CheckRun` in place of the bitmasks. Estimated net: **about −6,000 to −8,000 compiler lines**
  (§5).
- **Cost (§5).** The measured baseline is L2 self-compile fuel **86.54 G**, a peak live set of
  **985 MiB**, and a process peak RSS of **4.06 GiB**. Steps 1 to 6 should leave fuel within ±1%
  and leave RSS unchanged. Step 7 (memoization) costs CLI runs nothing, and it trades RSS for
  re-check time only in the LSP and in `--batch`.

## 1. Inventory

The census in §B assigns each file to a phase by name (§B.1). A table *belongs* to the phase that
declares it. It is *cross-phase* if a file of another phase writes it, or if one phase writes it
and another reads it. A reference in another file counts only if that file imports the name from
the declaring module. A one-call setter (an exported function of at most three body lines that
writes the table) counts as a write wherever it is called.

### 1.1 Which phase writes what, and who reads it

Declared module-scope state by phase. The last two columns count tables that a file of another
phase writes, and tables that a file of another phase reads:

| phase (files) | state | `let` | containers | written by another phase | read by another phase |
|---|---:|---:|---:|---:|---:|
| parse (`lexer`, `parser`, `parse_*`, `tok_load`, `ast`, …) | 196 | 193 | 158 | 22 | 52 |
| resolve (`bind`, `symbols`, `intern`, `modid`, …) | 70 | 69 | 54 | 3 | 8 |
| check (`check_*`, `typecheck`, `tyquery`, …) | 1,857 | 1,781 | 1,454 | 44 | 151 |
| elab (`emit_elab`, `elab_*`, `value_reach`) | 271 | 265 | 222 | 4 | 6 |
| mono (`emit_mono`, `emit_inst_key`, `pin_spell`, …) | 179 | 178 | 126 | 0 | 0 |
| rewrite and collect (`emit_rewrite`, `emit_lift`, `emit_collect`, …) | 105 | 101 | 76 | 0 | 0 |
| emit (`emit_*`, `wasmEmit`, `wasm_*`) | 1,132 | 1,081 | 695 | **262** | 175 |
| opt (`opt_*`) | 358 | 348 | 303 | 0 | 0 |
| driver (`driver`, `entry`, `cli*`, `iface_hash`, `link`) | 549 | 532 | 361 | 0 | 0 |
| tools (`lint`, `format`) | 152 | 144 | 116 | 1 | 0 |

Mono and the rewrite passes show 0 in the last two columns only because they keep their products
in `emit_state.vl`, which is filed as emit. Those are the 262 emit tables written by another phase.
For example, `fnStmts` (`emit_state.vl:290`) is written by mono and rewrite and read 498 times.
`emit_state.vl` is a product store that belongs to no phase.

Writer phase → reader phase, counting tables (a table with several writer or reader phases counts
in each cell):

| writer \ reader | parse | resolve | check | elab | mono | rewrite | emit | driver |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| parse | – | 2 | 41 | 1 | 2 | 9 | 8 | 27 |
| resolve | 1 | – | 2 | 1 | 2 | 2 | 1 | 7 |
| check | 1 | 4 | – | **71** | 16 | 25 | 37 | 27 |
| elab | 1 | 0 | 10 | – | 4 | 1 | 6 | 1 |
| mono | 2 | 1 | **11** | 14 | – | 17 | 34 | 6 |
| rewrite | 2 | 0 | 22 | 11 | 22 | – | **205** | 13 |
| emit | 1 | 1 | **16** | 6 | 12 | **91** | – | 22 |
| driver | 14 | 3 | 18 | 4 | 6 | 4 | 10 | – |

What the matrix says about the products:

- **The edges run backwards.** Mono → check (11 tables), emit → check (16) and elab → check (10) are
  not reads of a finished `Checked`. They are later phases writing state that the checker reads,
  because mono and the elaboration **re-enter the checker**.
  - `monoRecheckBegin` (`check_assignable.vl:3480`) saves `inferQuiet`, `symEnabled` and a
    `checkMark()`, then pushes onto `njFnStack` and `tpEnvNames`. `emit_elab.vl` calls it too.
  - The backward tables are cursors (`curFnDeclIx`, `cstrOwnerStack`, `tpEnv*`) and the instance
    tables the checker consults during a re-check (`monoOrigNode`, `monoInstFe`, `fnParent`).
- **Check → elab (71 tables) is the widest forward edge.** Most of its read sites are the write
  scan's per-node columns: `cwIxUp` (`check_write_scan.vl:178`) is read 67 times by the
  elaboration, `cwIxUpKind` 50 times and `cwIxUpAux` 29 times. Then come `T`, at 271 elaboration
  reads, and the `TY_*` builtins.
- **Rewrite ⇄ emit (205 and 91 tables)** is the layout registry: `uBoxIdx`, `sHeapIdx`, `sNames`,
  `sFieldStart` and `uVariants`. The collect passes fill it, and the emitter both reads it and
  extends it. That is lane E's territory: heap types by rep.

**What clears them.** `emitter-state-audit.vl` classifies the 4,729 module-scope mutables by the
function that clears each one:

| cleared by | prologue | an inner function | a pass | a frame builder | scoped | rises | balanced | stamped | init | linstance | restored | never |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| tables | 2,193 | 2,066 | 294 | 55 | 32 | 38 | 17 | 13 | 10 | 7 | 4 | 0 |

So 2,193 tables are reset in lockstep by the per-compile prologue. Another 2,066 are reset by some
inner function, which makes their lifetime whatever that function's call pattern happens to be.
There are 195 `*Reset` functions (2,965 lines). Lane H's §1.7 counts 236 tables that hold type
ids, and `fnTyFactsReset` alone keeps a hand list of 35 tables and 16 resetters.

### 1.2 The checker's surface

| imported by | distinct checker symbols |
|---|---:|
| emit | 527 |
| elab | 348 |
| mono | 247 |
| rewrite and collect | 247 |
| driver | 200 |
| util, parse, resolve, tools | 24, 3, 3, 1 |
| **all non-checker files** | **1,166** |

By kind: 941 functions, 152 mutable tables, 56 constants, 16 types and 1 other. The 152 mutable
tables are the coupling a product type removes outright. The 941 functions are the query surface
that a `Checked` value will expose: `check_emit_queries.vl` and `check_query.vl` already gather
part of it.

### 1.3 The AST is everyone's arena

The `mk*` node constructors in `ast.vl` and `parser.vl` push onto `P.nodes`. Calls to them, and to
the in-place writers, by the calling phase:

| | parse | check | mono | rewrite | emit | driver | other |
|---|---:|---:|---:|---:|---:|---:|---:|
| `mk*` (51 constructors) | 126 | **184** | **139** | **136** | 41 | 8 | 10 |
| `addNode` | 45 | 10 | – | 1 | – | – | – |
| `arenaSetNode` | – | **50** | 2 | 6 | – | – | 3 |
| `arenaReplaceNode` | – | 8 | – | – | – | – | – |

- `checkProgram` begins by collapsing parentheses in place (`parenNamesCollapse`,
  `check_pins.vl:181`).
- Mono's instances are AST clones (`monoCloneBody` and its family, `emit_mono.vl:3146`).
- 26 reads of `arenaEpochNow` and 7 of `arenaRefWritesNow` outside `ast.vl` exist to notice that the
  arena moved under a memo.

### 1.4 Speculation: the rollback families

`check_rollback.vl` defines 23 one-bit families (`RB_DIAGS = 1` up to `RB_INFER_LET = 2097152`) and
one node-bank bit (`RB_NODE_BANKS`). Nine named sums choose them per site:

| site set | value | used by |
|---|---:|---|
| `RB_RETURNS` | 2,799,615 | `inferReturnsPrePass` (`check_top_level.vl:256`) |
| `RB_GLOBAL_INIT` | 702,462 | `globalInitPrePass` |
| `RB_CSTR_PROBE` | 688,129 | `cstrProbeBefore` |
| `RB_SOLVE` | 759,803 | `solveUnannotParams` (`check_fn_decl.vl:308`) |
| `RB_MONO` | 4,081,659 | `monoRecheckBegin`/`End` |
| `RB_CALL_REJOIN` | 526,335 | `checkCallOnFuncTy` (`check_calls.vl:1419`) |
| `RB_PINNED` | 32,766 | `tpIfRecheck` (`check_assignable.vl:956`) |
| `RB_ALL` | 8,388,607 | `elabOne` (`emit_elab.vl:3239`) |
| `RB_LINT` | 524,288 | one site |

- `CheckMark` has 35 fields.
- `PRB_TABLES` lists 145 tables for the rollback assertion (`probeRollbackArm`). The assertion
  exists because a family's membership is kept by hand.
- Outside this file, the same idea is implemented again by 30 `*Truncate` functions (315 lines),
  25 `*Mark` (428), 4 `*Cut` (82), 6 `*Restore` (114) and the `check_map_undo` log.
- Three `checkRestart` calls (`check_pins.vl:241`, `:321`, `:472`) are the heavy form. They run
  `initChecker`, which re-mints the type arena (lane H §1.7, the D16215 class).

### 1.5 Hidden arguments

The census looks inside one function for `const L = G`, where `G` is a module-scope `let`, followed
by a later write of `G`:

- **consumed**: the first write after the save is a literal reset (`-1`, `0 - 1`, `""`, `false`,
  `[]`, `Map()`) within three lines. The caller set `G` as an argument, and the callee takes it.
- **scoped**: `G` is set to a computed value and later restored from `L`. This is dynamic scoping.

| | globals | sites |
|---|---:|---:|
| consumed at entry | 70 | 105 |
| scoped | 127 | 179 |
| either (9 take both shapes) | **188** | 284 |

By declaring file: `emit_mono.vl` 31, `wasmEmit.vl` 29, `emit_elab.vl` 13, `emit_classify.vl` 10,
`emit_state.vl` 9, `emit_rewrite.vl` 9, `check_elab_cap.vl` 7, `check_types.vl` 6 and `parser.vl`
6. By sites: `wasmEmit.vl` 57, `emit_mono.vl` 33, `emit_elab.vl` 26 and `check_assignable.vl` 18.

**The instance builder is the worst single interface.** It has three functions and 15 hidden
inputs beside its 11 parameters:

- `monoMakeInstance` (`emit_mono.vl:8277`) scopes 4 globals (`monoInstOwn`, `monoInstBindN`,
  `monoInstBindT`, `cadInBaked`) and consumes 1 (`monoInstanceWidenRet`, set at 3 sites).
- `monoMakeInstanceGo` (`:9699`) consumes the 7 in the table below.
- `monoMakeInstanceKeyOf` (`:9346`) consumes `monoPinArgLit` and scopes `monoExplicitBN` and
  `monoExplicitBT`.

The globals `monoMakeInstanceGo` consumes:

| global | declared | set by |
|---|---|---|
| `monoCallFrameSlot` | `emit_mono.vl:6011` | 4 sites (`:10623`, `:10705`, `:17166`, `:20040`) |
| `monoSpecGoK` | `:5082` | 1 |
| `cadDelivery` | `:25490` | 1 |
| `monoMakeCallIx` | `:6013` | 1 |
| `monoInstRetWidenKey`, `monoInstRetWidenTy` | `:10211`, `:10214` | 2 each |
| `monoLamCloneSlots` | `:852` | its own accumulator |

So an instance's real signature is 26 inputs, and 15 of them are invisible at the call. The rest
of mono's hidden globals are the pin walk (`monoPinSink`, `monoPinInLit`, `monoPinLetReaches`,
`monoPinRetBox` and `monoPinHoleN`/`T`), the generic-call cloner (`monoCgcTyParams`/`TvN`/`TvV`)
and the open-lambda deferral (`monoOpenLamMark`/`Defer`/`Owner`).

**Emit's seats.** `emitCoerced` (`wasmEmit.vl:31208`) coordinates five globals:

| global | declared | writes | reads |
|---|---|---:|---:|
| `boxSeat` | `wasmEmit.vl:31182` | 6 | 10 |
| `numSeat` | `:23806` | 5 | 8 |
| `armSeat` | `:10553` | 5 | 8 |
| `coerceHeld` | `:31178` | 8 | 13 |
| `armServed` | `:10556` | 4 | 5 |

A delivery position sets `boxSeat` (`emitDelivered`), and the conversion spends it. The 24
`fnUses*` flags that the two frame builders clear are per-function state of the same kind; the
audit shows `fnUsesMapVals` and `fnUsesPackedPush` cleared by one builder only.

**In the checker,** the most-used hidden global is `inferQuiet` (`check_cursor.vl:26`). It is
consumed at 20 sites in 10 files and set at 17. Next come `symEnabled`, `cvNow`, `weLow` and
`curFnDeclIx`.

### 1.6 Rename-and-merge

`modid.vl` gives each module a stable `$m<id>` suffix, and the driver renames every top-level name
that a module declares before the arena is merged. The cost:

- **The rename itself:** 22 functions in `driver.vl` (`modRw*`, `modRename*`, `modShadow*`,
  `modTypeRenamed`, `modBuildRename`, `ambientRenameSingle`), 726 lines.
- **Undoing it for people:** `demangleName` (47 calls, 22 files), `demangleMsg` (18, 6),
  `demangleSpelling` (10, 5) and `ovDemangle` (2): 77 calls in 32 files.
- **Reading the suffix back:** `modSuffixOf` (18 calls, 5 files), `modIxOfId` (3 calls),
  and 131 other `$m` mentions outside `driver.vl` and `modid.vl`. For example, `wasmEmit.vl:26624`
  matches a hook by `name + "$m"`.

A name's module is therefore encoded in its spelling. Lane H's nominal key ("keyed by the
declaration node") and any symbol table must not depend on that spelling.

### 1.7 The sk/wi banks

| bank | tables | constants | functions | lines | reasons |
|---|---:|---:|---:|---:|---:|
| `sk*`: serve unchanged dependents (`checkSkipArm`, `driver.vl:5228`) | 33 | 32 | 43 | 1,120 | 12 (`SK_GRAPH` … `SK_WRITER`) |
| `wi*`: serve a target from an importer's check (`wiArm`, `:6640`) | 36 | 33 | 44 | 750 | 9 (`WI_UNSEEN` … `WI_GRAPH`) |

- Each reason is a way an unchanged module's check was found to differ.
- `SK_DEMAND`, `WI_DEMAND`, `skDeliv` and `skOcc` exist because an importer could change an
  exporter's types. That was record adoption across modules (DECISIONS "Record adoption crosses
  module boundaries", 2026-10-07).
- `SK_WRITER`, `WI_WRITER`, `skAsk`, `skWr`, `skQs` and `skUse` record which whole-program
  questions a check asked.
- `SK_AMBIENT` and `WI_AMBIENT` cover ambient statements.
- **The banks already record what a check read, by hand.** A query system records the same thing
  by construction.

## 2. The products

### 2.1 Ownership

```
Session                                  -- one per LSP instance, `vl check --batch` run, or CLI compile
  interners: StrId, SymId, TyId (lane H), RepId (lane E)   -- session lifetime, never reset per program
  modules:   ModId -> ModSlot
  program:   Elaborated | null            -- per entry point
  memo:      dependency log (§2.4)
  diags:     one sink (review medium 7's Diag)

ModSlot
  key, source hash
  parsed:    Parsed
  resolved:  Resolved
  checked:   Checked
  iface:     ModIface + hash              -- what importers may observe (`iface_hash.vl`)
```

| product | holds | built from | lifetime | replaces |
|---|---|---|---|---|
| `Parsed` | tokens; the node arena slice `[n0, n1)` (`parse_image.vl` already cuts it); doc comments; parse diagnostics. **Immutable once built.** | source | until the source hash changes | `P`'s per-module part, `parse_bank` |
| `Resolved` | a scope per declaration (`SymId = (ModId, decl index)`); `Ident` node → `SymId` (today `nodeSrc`, `symbols.vl:227`); imports as `SymId`s of other modules; the desugarings that `checkProgram` does today in place (paren collapse, `const_lets`) as a **lowered view**: `NodeId → NodeId`, overlay nodes ≥ `n1` | `Parsed`, and the imports' `ModIface` (names only) | until either changes | the `$m` rename, the demangle family, `parenNamesCollapse`'s writes |
| `Checked` | `NodeId → TyId` (the `ty(k, node)` banks); `SymId → TyId`; each generic's inferred requirements (L2 ruling); the write scan's per-node columns (`cwIx*`); constraint tables **only inside a `CheckRun`** (§2.2); diagnostics | `Resolved`, and the imports' `ModIface` (types) | until either changes. **Never an importer**: the freeze ruling means an exported un-annotated binding is typed by its own module. | the 1,857 checker tables' per-module part; the 152 imported mutable tables |
| `ModIface` | exported `SymId → TyId`, inferred requirements of exported generics, exported data layouts | `Checked` | with `Checked` | `iface_hash.vl`'s inputs, which today include bodies (Q4) |
| `Elaborated` | instances `InstId → (template SymId, arg TyId[], owning ModId)`; per instance `NodeId → TyId` and walk keys (`ekDecl`/`ekNames`/`ekTys`); function sets (`elab_fn_id`); lane S's places, edges and classes; per-importer copies of exported `const`s | every `Checked` in the graph, plus the entry | per program | `emit_elab.vl`'s 271 tables; mono's registries (`monoGen`, `monoOrigNode`, `monoInstFe`) |
| `Lowered` (L1) | per `InstId`: one IR function. Its nodes carry `TyId`, `RepId` and `SymId`/`InstId` operands, plus a `NodeId` for spans only | `Elaborated` | per program | mono's AST clones; the rewrite passes; `fnStmts` |
| `EmitCtx` / `FnCtx` | per output module: the type section and heap-type cache (`RepId` → wasm type index), the function table and layout registries. Per function: `body`, locals, `fnUses*`, the seats | `Lowered` (until L1, `Elaborated` plus the AST) | per output, per function | `emit_state.vl`; `boxSeat`/`numSeat`/`armSeat`/`coerceHeld`/`armServed`; the 24 `fnUses*` flags |

**What owns an IR node: the instance.** An IR function is owned by an `InstId` in `Elaborated`, and
each IR node by its function. It is not owned by a module, and not by an AST node:

- **An instance is per module, not per program.** Under the owner's rulings, an exported
  un-annotated binding takes its type from its own module, and an exported `const` is generalized,
  so each importer instantiates its own copy (`2026-11-14-export-freeze-census.md`, ruling D). So an
  instance's key is `(template SymId, arg TyId[])`, plus the importer's `ModId` for a `const` copy.
  A nominal `TyId` names its declaring module (lane H §2.3), so the key is the same whichever
  importer demands it.
- **An instance has one memo key.** Its IR is rebuilt when, and only when, its template's `Checked`
  or one of its argument types changes. An edit to module B cannot reach A's instances except by
  demanding new keys.
- **IR operands are session ids.** That is what lets L1's nodes outlive the program that built them.
  The `NodeId` back-pointer is for spans, so it may point into any module's `Parsed`.
- **Nothing after `Resolved` writes `Parsed`.** Mono's clones become IR (L1). Until L1, nodes minted
  after resolve live in the overlay range of the arena.

### 2.2 `CheckRun`: speculation as a value

- **A check walk writes into a `CheckRun`.** The 23 families' tables and the cursors become one
  record (`inferQuiet`, `symEnabled`, `curFnDeclIx`, `cstrOwnerStack`, `tpEnv*`, `njFnStack`). The
  tables are append-only logs with a single length mark.
- **A probe forks the run, keeping a list of families.** `checkMark`/`checkRollback(m, RB_*)`
  becomes `const r = run.mark(); …; run.dropExcept(r, KEEP_RETURNS)`. `KEEP_*` are named
  compositions (the review's small item 7), and the loop is generic over the record's family list,
  so a new family cannot be left out of a site. The rollback assertion (`PRB_TABLES`, 145 entries)
  then has nothing left to check, and deletes.
- **`monoRecheckBegin`/`End` becomes a child run.** Mono asks for a re-check of instance *i* as a
  value. It receives the facts as the child's result and never sees the checker's cursors. That
  removes the backward edges (mono → check 11, elab → check 10, emit → check 16), except for
  reads of the finished `Checked`.
- **A restart is a fresh `CheckRun` over the same `Resolved`.** Once lane H stage 3 lands, the
  intern table survives the restart, so `checkRestart` no longer re-mints the arena, and the
  hand-kept reset lists (`fnTyFactsReset`) become "a new run".

### 2.3 Per-module scopes and symbol ids

- **A `SymId` is a pair `(ModId, i32)`, where `ModId` is today's stable `$m` id from `modid.vl`.**
  The name keeps its source spelling.
- **The merge stops renaming.** The program is still one arena, but an `Ident` resolves through
  `Resolved` to a `SymId`. The emitter derives the wasm name `spell(sym) + "$m" + id` only where
  it writes a name. That one function keeps the name section byte-identical.
- **Diagnostics render the spelling**, so the demangle family (77 call sites) has nothing left to
  undo.

### 2.4 Memoization: one invalidation rule

- **A product is a function of its declared inputs:** a source hash, other products' hashes, and
  `ModIface` hashes. While it is built, every read of another product is logged as it happens.
- **The one rule:** a product is reused when none of its logged inputs changed hash. The banks'
  21 reasons collapse into that rule as follows:

| today | after |
|---|---|
| `SK_GRAPH`, `WI_GRAPH`, `WI_UNSEEN`, `WI_DIRTY`, `SK_FRESH`, `WI_FRESH` | input hash changed, or no product yet |
| `SK_DEMAND`, `WI_DEMAND`, `skDeliv`, `skOcc` | **gone**: `Checked(m)` has no importer input under the freeze ruling |
| `SK_WRITER`, `WI_WRITER`, `skAsk`, `skWr`, `skQs`, `skUse` | the logged reads of whole-program facts: an input like any other |
| `SK_AMBIENT`, `WI_AMBIENT` | ambient statements are `Parsed` content of the module, so they enter by its hash |
| `SK_IFACE`, `SK_SPAN`, `SK_DECOR`, `SK_STRAY`, `SK_PASS`, `WI_ENTRY`, `WI_ASKS` | each is either an input the bank did not hash (span, decoration) or a cut that a product boundary makes unnecessary. **Not verified one by one**: step 7 retires each with its witness, or keeps it as a named input. |

- **Exported generics are interfaces, not bodies.** Under L2, an exported generic's inferred
  requirements are part of `ModIface`, so an importer's `Checked` depends on the signature. Its
  instances in `Elaborated` depend on the body. That replaces Q4's "the interface hash includes
  the bodies of exported generics".

## 3. Migration

Every step is gated the same way:

- `refresh-compiler.sh` twice gives byte-identical output, and that seed equals the predecessor's
  seed. The corpus is emitted byte-identical too (the merge queue's identity diff).
- `regress.vl` reports 0 `runs → not-runs`. The full `gate.sh` passes.
- `self-compile-time.sh` and `plumb-shape-cost.vl --check` are reported against today's 86.54 G.
- The census in §B runs on both trees, and the PR names the counts that fell.

A step lands as several PRs where a file is too big for one. **None moves a byte**: a pure dataflow
refactor has no reason to. A byte that moves anyway is a defect the refactor exposed, and it lands
as its own row first.

| step | change | deletes | depends on |
|---|---|---|---|
| **0. Ratchet** | §B's census, ported to `scripts/phase-state-census.vl`, with `--check` against a baseline. The hidden-argument count (188), the cross-phase table count (544) and the checker-surface count (1,166) may only fall. This stops new lanes, including S's, from adding hidden globals while the migration runs. | 0 (adds a tool of about 300 lines outside `compiler/`) | – |
| **1. `InstReq` in mono** | The builder's three functions take one `InstReq` record holding the 26 inputs of §1.5. The callers that set the seats (4 + 1 + 1 + 1 + 2 + 2 + 3 sites) build it, and the 15 hidden globals delete. Then the generic-call cloner (`monoCgc*`, 3 globals), the open-lambda deferral (`monoOpenLam*`, 3) and the remaining 4 (`mfrPending`, `monoCellSigByCall`, `monoDestPinOff`, `monoBakeSpecK`) take a `MonoWalk` context. | 25 of the 31 `emit_mono.vl` hidden globals, their save, clear and restore lines, and the parameters they shadow. About **−250 to −400**. | Do it before lane H stage 5, so H's id-vector key is computed from `InstReq` and not from globals. The pin walk's six globals (`monoPinSink`, `monoPinInLit`, `monoPinLetReaches`, `monoPinRetBox`, `monoPinHoleN`/`T`) are left alone, because lane S stages 3–5 delete that walk. |
| **2. `FnCtx` in the emitter** | One `FnCtx` record holds `body`, `fnIx`, the locals, the 24 `fnUses*` flags and the five seats. It replaces `body: u8[]` (592 parameters, 304 of them as the first parameter) and the `fnIx: i32` that travels beside it. `emitDelivered`/`emitCoerced` pass the seat in the context. The two frame builders become one `FnCtx` constructor, so the asymmetry the audit reports is gone by construction. | the review's small item 8; the 29 `wasmEmit.vl` hidden globals; the frame-builder flag lists. About **−600 to −900**. | – (independent of 1) |
| **3. `CheckRun`** | §2.2. First the cursors and the 23 families move into one record with a generic mark and drop, and the site sets become `KEEP_*` lists. Then `monoRecheckBegin` returns a child run. | `check_rollback.vl` (594 lines down to about 150), `PRB_TABLES`, about 30 `*Truncate` and 25 `*Mark` functions, and the checker's 56 hidden globals. About **−900 to −1,300**. | Lane H stage 2 (holes leave the rows) first, since it changes 43 writers that a rollback family must otherwise cover. |
| **4. Lifetimes are records** | Group each lifetime's tables into one record (`CheckTables`, `ElabTables`, `EmitTables`, per module or per program), so a reset is `x = fresh()`. The audit's prologue (2,193), pass (294) and frame (55) classes move first. The inner class (2,066) moves per family, and each move names the lifetime it was found to have. | most of the 195 `*Reset` functions (2,965 lines) and the hand lists (`fnTyFactsReset`'s 35). About **−1,500 to −2,000**. | Lanes S and E put new tables into these records from their first stage, not as new `let`s. |
| **5. `Parsed` is frozen** | The checker's 50 `arenaSetNode`, 8 `arenaReplaceNode` and 184 `mk*` calls move to a lowering pass that `Resolved` owns, writing the overlay range. A debug assertion refuses a write below `n1` after resolve. | `arenaEpoch`, the edit log and the 33 epoch reads outside `ast.vl`. About **−150 to −300**. Mono's clones stay until L1. | Review medium 6 (lowering pass), if it lands first. Otherwise this step is its first slice. |
| **6. `SymId`s** | §2.3: resolve to `SymId`, and mangle at the name writer only. | the 22 driver rename functions (726 lines), the demangle family and its 77 call sites, the `$m` readers. About **−900 to −1,200**, net of about +300 for the scope tables. | Step 5, so that resolution has a frozen arena to point into. Lane H's nominal key reads a `DeclKey` accessor, which this step re-points from `NodeId` to `SymId`. |
| **7. The memo** | §2.4: the per-module `ModSlot` with logged inputs. The banks' reasons retire one by one, each with the witness that motivated it. | the `sk*`/`wi*` banks: 87 functions (1,870 lines) and 69 tables. About **−1,300 to −1,500**, net of about +400 for the memo. | The freeze ruling in the tree (D's implementation), and L2 for exported generics. Without L2, exported generic bodies stay an input, as Q4 says today. |
| **8. L1's owner** | The IR builder writes `Lowered` per `InstId` (§2.1). Mono's AST clones and `fnStmts` retire into it. | counted in L1's note, not here | L1 |

Steps 1 and 2 are where the review says to start, and either can go first. Each closes a whole
convention in one module: 15 hidden inputs on mono's one interface, and 5 seats plus 24 flags on
the emitter's. Neither needs a change from another lane.

## 4. Fit with lanes H, E and S

| lane | shared tables | ordering | what L5 needs from it |
|---|---|---|---|
| **H**, hash-consed types (`2026-11-14-type-hashcons-design.md`) | `T.tys`; `cUserTypes`; the 26 sidecars (371 references, H §1.4); `tyMutEpoch`, which is a check → emit cross-phase read (29 emit reads); the restart reset lists | H stage 0 (move `hcIntern`) is the first `Session` member. H stage 2 precedes L5 step 3. L5 step 1 precedes H stage 5. H stage 3 makes a restart cheap, which L5 step 3's fresh-run restart relies on. | (1) The intern table gets two entry points, a session reset and a program reset, and no other code clears it. (2) Nominal rows are keyed through one `DeclKey` function, which step 6 re-points to `SymId`. (3) Binder identity (stage 1) takes `(binder decl, index)` through that same function. H's §2.7 already says the per-walk reset registry belongs to L5: that is step 4. |
| **E**, `Rep` as an ADT (`2026-11-14-rep-adt-design.md`) | the layout registry: rewrite ⇄ emit, 205 and 91 tables (`uBoxIdx`, `sHeapIdx`, `sNames`, …); `rtSync`'s epoch | E stage 1 (the arena) can go any time. E stage 4 (heap types by rep) should split its cache along §2.1's line. | (1) The rep arena is session-level and interned, so `RepId` is stable across programs. (2) The heap-type cache (`RepId` → wasm type index) belongs to `EmitCtx`, because type indices are per output module. Keep them as two tables from stage 4 on, not one. |
| **S**, the slot store (`2026-11-14-slot-store-design.md`) | the elaboration's tables (271); mono's `monoPin*` globals (S deletes them); `elabHeldValTy`'s demand from mono | S stages 1–6 run inside `elabPrepare`'s rounds, which is `Elaborated`'s build. S's "nothing after the elaboration demands" is exactly `Elaborated` being finished before mono reads it. L5 step 1 leaves the `monoPin*` globals to S. | (1) Places, edges and classes are fields of `ElabTables`, not new `let`s (step 0's ratchet enforces this). (2) The fixpoint's reads go through `Checked` queries, not check globals, so step 3's backward-edge removal does not have to revisit them. |

**Through L1:** `Lowered` is owned by `InstId` (§2.1), and its operands are `TyId` (H), `RepId` (E)
and `SymId` (step 6). A place in S's store is an IR variable (S §7). So L1's node definition can
be fixed once those three id spaces exist, and step 6 is the only L5 step that L1 must wait for.
Before step 6, an IR callee operand is a `NodeId` of the declaration, which `DeclKey` maps.

## 5. Cost and net lines

### 5.1 Measured baseline

Measured at `3b431fbbb` on its fixpoint seed, on a 4-core box at a load average under 1:

| metric | value | command |
|---|---:|---|
| L2 self-compile guest fuel | 86,542,111,667 (+11.4% on the committed baseline 77.66 G, within the 1.5× trip) | `scripts/self-compile-time.sh` |
| L2 peak live set | 985 MiB (48% of the 2 GiB copying heap) | same |
| self-build peak RSS (`VmHWM`) | 4,259,964 kB (4.06 GiB) | §A.4 |

### 5.2 Expected movement

| step | fuel | peak RSS | why |
|---|---|---|---|
| 1, 2 | −0.5% to +0.5% | ±0 | A hidden global costs a `global.get` per read and a save, clear and restore per call (`global.get` and `global.set`). A record field costs a `local.get` plus a `struct.get`. Removing the save and restore pays for the extra `struct.get`. `FnCtx` replaces two parameters with one. |
| 3 | −1% to +1% | ±0 | The generic mark and drop loop does more work per probe (all 23 families) than a bitmask that skips most of them. Truncating an untouched log is one length compare per family. The probe count per self-compile was not measured; step 3 adds a counter and reports it. The named risk is a family made unconditional that the bitmask had kept. The `KEEP_*` lists preserve each site's choice, so no answer changes. |
| 4 | +0% to +1% | ±0 | A table read becomes a `struct.get` on a record held in a global. A hot function takes the record as a parameter. |
| 5, 6 | ±0 | ±0 | The same nodes are written to a different range. The mangle moves from merge time to name-writing time, which is the same string work done once. |
| 7 | CLI: 0. LSP and `--batch`: a fall on every unchanged module | CLI: 0. LSP: up by the retained `Checked` of each module, bounded by today's banks, which already retain diagnostics and lint sites | The CLI checks once and never consults the memo. |

These are argued, not prototyped. Each step's PR measures them, and `self-compile-time.sh` and
`plumb-shape-cost.vl --check` grade each one.

### 5.3 Net compiler lines (estimate)

| | lines |
|---|---|
| deleted, steps 1–7 (§3, summed) | about −5,600 to −7,600 |
| deleted by retiring hidden globals not listed per step (§1.5's other 100-odd, as they fall inside steps 3–4) | about −400 to −700 |
| added: `Session`/`ModSlot` and `fresh()` constructors | about +300 |
| added: `CheckRun` with generic mark and drop | about +150 |
| added: `SymId` scope tables | about +300 (already netted in step 6) |
| added: the memo | about +400 (already netted in step 7) |
| **net** | **about −6,000 to −8,000** of the 403,914 |

The upper end assumes step 4 retires two-thirds of the `*Reset` lines. Nothing was prototyped.

## 6. Not claimed

- **Phases are assigned by file name** (§B.1). A file that serves two phases is counted as one.
  `emit_state.vl` is filed as emit, which hides mono's and rewrite's writes behind 262
  "written by another phase" rows.
- **The census is lexical.** A table passed as an argument, or aliased into a local, is read where
  it is named, not where it is used. A `let` whose name a local shadows can be miscounted in its
  own file. Cross-file references are counted only through imports, so they are not affected.
- **The hidden-argument rule** needs the save to be a bare `const L = G`. A seat that a callee only
  reads and resets, with no save (`numSeat = -1` in `emitCoerced`), is not counted. So 188 is a
  lower bound. §1.5 lists the five emit seats by hand.
- **The sk/wi reason mapping in §2.4** was read from the code, not ablated. Step 7 retires each
  reason against its witness.
- **Every cost and line figure in §5** except the baseline is an estimate.

## A. Commands

All commands were run from the worktree root at `3b431fbbb`.

1. **The seed.**
   - `bash scripts/fetch-seed.sh`
   - `scripts/refresh-compiler.sh` twice, then `cmp`. They were equal, sha256 `742e3819…`.
2. **The census.**
   - `node phase-census.mjs compiler --json census.json` (§B).
   - Its §1.3 companions: `mk.mjs` counts calls to the 51 `^export function mk[A-Z]` constructors
     of `ast.vl` and `parser.vl`, and `arena.mjs` counts `arenaSetNode`, `arenaReplaceNode` and
     `addNode`. Both count by the calling file's phase.
3. **The audit.**
   `VL_STD=$PWD/std scripts/vl-host/target/release/vl run scripts/emitter-state-audit.vl --compiler build/vl-compiler.wasm`.
4. **Cost.**
   - `bash scripts/self-compile-time.sh` gives fuel and the live set.
   - Peak RSS: `vl build compiler/entry.vl -o self.wasm --compiler build/vl-compiler.wasm`, polling
     `VmHWM` in `/proc/<pid>/status` every 0.5 s. The output was `cmp`-equal to the seed.
5. **The rest.**
   - Rollback: `check_rollback.vl:137–204` read directly. Mark sites: `grep -n "checkMark()"`
     outside the file (8). `PRB_TABLES` entries: 145.
   - Function extents: an awk pass over column-0 `function` … column-0 `}` (15,775 functions). It
     gives the `*Reset`, `*Truncate`, `*Mark`, `sk*`/`wi*`, `modRw*` and demangle totals.
   - Demangle and suffix references: `grep -o "\bNAME(" compiler/*.vl | wc -l`, with
     `grep -l … | wc -l` for the file counts.

## B. The census script

### B.1 Phase assignment

| phase | files |
|---|---|
| parse | `lexer`, `parser`, `parse_bank`, `parse_image`, `tok_load`, `ast`, `extents`, `srcmap`, `const_lets` |
| resolve | `bind`, `symbols`, `intern`, `ident_audit`, `modid`, `missing_import` |
| elab | `emit_elab`, `elab_fn_id`, `elab_stub`, `value_reach` |
| mono | `emit_mono`, `emit_inst_key`, `pin_spell`, `call_bind_shadow`, `mfr_shadow` |
| rewrite | `emit_lift`, `emit_rewrite`, `emit_collect`, `emit_fn_scans`, `emit_local_scope` |
| check | `check_*`, `typecheck`, `tyquery`, `tyname`, `const_exact`, `record_rows`, `std_receivers`, `memo`, `fn_ret_shadow`, `box_dst_shadow` |
| emit | the other `emit_*`, `wasmEmit`, `wasm_*`, `id_shadow_state`, `opaque_snames_state` |
| opt | `opt_*` |
| driver | `driver`, `entry`, `cli`, `cli_budget`, `cli_util`, `iface_hash`, `link` |
| tools | `lint`, `format`, `fmt_util` |
| util | the rest |

### B.2 Rules

- **State** is a column-0 `let`, or a column-0 `const` that some visible file mutates.
- **A write** is `G =`, `G[…] =` or `G.f =`, or a call of `.push`, `.pop`, `.set`, `.delete`,
  `.clear`, `.insert`, `.splice`, `.shift` or `.unshift` on `G` or a field path under it. A call to
  an exported setter (at most three body lines, writing `G`) also counts as a write.
- **A read** is any other word-bounded mention, outside import clauses and comments.
- **Visibility:** the declaring file, plus every file that imports `G` from it.
- **A hidden argument** is §1.5's rule. Within one top-level function: `const L = G` with `G` a
  state `let`, followed by `G = …`.
  - *Consumed*: the first such write is a literal within three lines.
  - *Scoped*: otherwise.
  - *Set sites*: plain non-literal assignments of `G` in other functions.
- **Checker symbols:** the names that non-checker files import from checker files. Each is
  classified as state, constant, `export function` or `export type`.

### B.3 The script

The script is 312 lines of Node, quoted below so that the figures re-run from this note:
`node phase-census.mjs compiler --json census.json` from the checkout root. Step 0 has it ported to
`scripts/phase-state-census.vl` as a ratchet, and that port must reproduce this note's figures at
`3b431fbbb` before it gates anything.

<details><summary><code>phase-census.mjs</code></summary>

```js
// Cross-phase global-state census over compiler/*.vl.
//   node phase-census.mjs <compiler-dir> [--json out.json]
// Module-scope state = a column-0 `let`, or a column-0 `const` some file mutates in place.
// Writes: `G =`, `G[..] =`, `G.f =`, `G(.f)*.push|pop|set|delete|clear|insert|splice(`, and
// calls to a setter (a top-level function of <= 3 body lines that writes G).
// A reference in another file counts only if that file imports G from G's module.
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".vl")).sort();

function phaseOf(f) {
  const b = f.replace(/\.vl$/, "");
  if (/^(lexer|parser|parse_bank|parse_image|tok_load|ast|extents|srcmap|const_lets)$/.test(b)) return "parse";
  if (/^(bind|symbols|intern|ident_audit|modid|missing_import)$/.test(b)) return "resolve";
  if (/^(emit_elab|elab_fn_id|elab_stub|value_reach)$/.test(b)) return "elab";
  if (/^(emit_mono|emit_inst_key|pin_spell|call_bind_shadow|mfr_shadow)$/.test(b)) return "mono";
  if (/^(emit_lift|emit_rewrite|emit_collect|emit_fn_scans|emit_local_scope)$/.test(b)) return "rewrite";
  if (/^(check_|typecheck|tyquery|tyname|const_exact|record_rows|std_receivers|memo|fn_ret_shadow|box_dst_shadow)/.test(b)) return "check";
  if (/^(emit_|wasmEmit|wasm_|id_shadow_state|opaque_snames_state)/.test(b)) return "emit";
  if (/^opt_/.test(b)) return "opt";
  if (/^(driver|entry|cli|cli_budget|cli_util|iface_hash|link)$/.test(b)) return "driver";
  if (/^(lint|format|fmt_util)$/.test(b)) return "tools";
  return "util";
}

const src = {};
const lines = {};
for (const f of files) {
  src[f] = fs.readFileSync(path.join(dir, f), "utf8");
  lines[f] = src[f].split("\n").map((l) => {
    // strip line comments (not inside strings: good enough for counting)
    const i = l.indexOf("//");
    if (i < 0) return l;
    const pre = l.slice(0, i);
    const q = (pre.match(/"/g) || []).length;
    return q % 2 === 0 ? pre : l;
  });
}

// Imports: per file, name -> source module file.
const imports = {};
for (const f of files) {
  imports[f] = new Map();
  const re = /^import\s*\{([^}]*)\}\s*from\s*"\.\/([\w]+)"/gm;
  let m;
  while ((m = re.exec(src[f]))) {
    for (let n of m[1].split(",")) {
      n = n.trim();
      if (!n) continue;
      const parts = n.split(/\s+as\s+/);
      imports[f].set(parts[parts.length - 1].trim(), { from: m[2] + ".vl", orig: parts[0].trim() });
    }
  }
}

// Declarations.
const decls = new Map(); // name@file -> decl
const declRe = /^(export )?(let|const) ([A-Za-z_]\w*)\s*(:[^=]*)?=\s*(.*)$/;
for (const f of files) {
  lines[f].forEach((l, i) => {
    const m = declRe.exec(l);
    if (!m) return;
    decls.set(m[3] + "@" + f, {
      name: m[3], file: f, line: i + 1, exported: !!m[1], kind: m[2],
      type: (m[4] || "").slice(1).trim(), init: m[5].trim(), phase: phaseOf(f),
    });
  });
}

// Top-level functions with extents.
const fns = {}; // file -> [{name, start, end}]
for (const f of files) {
  fns[f] = [];
  let cur = null;
  lines[f].forEach((l, i) => {
    const m = /^(export )?function ([A-Za-z_]\w*)/.exec(l);
    if (m) { cur = { name: m[2], start: i, end: -1 }; fns[f].push(cur); return; }
    if (cur && l.startsWith("}")) { cur.end = i; cur = null; }
  });
}
function fnAt(f, i) {
  for (const fn of fns[f]) if (i >= fn.start && (fn.end < 0 || i <= fn.end)) return fn.name;
  return null;
}

const esc = (s) => s.replace(/[$]/g, "\\$");
const mutRe = (n) => new RegExp(`(^|[^\\w.])${esc(n)}((\\.\\w+|\\[[^\\]]*\\])*)(\\s*=(?!=)|\\.(push|pop|set|delete|clear|insert|splice|shift|unshift)\\()`);
const refRe = (n) => new RegExp(`(^|[^\\w.$])${esc(n)}(?![\\w$])`);

// Which files may refer to decl d: its own, and those importing it from its file.
function visibleIn(d) {
  const out = [d.file];
  for (const f of files) {
    if (f === d.file) continue;
    const im = imports[f].get(d.name);
    if (im && im.from === d.file) out.push(f);
  }
  return out;
}

// Pass 1: writes per decl, and setters.
const state = [];
for (const d of decls.values()) {
  const isLet = d.kind === "let";
  const wr = mutRe(d.name);
  const vis = visibleIn(d);
  const writes = [];
  for (const f of vis) {
    lines[f].forEach((l, i) => {
      if (i + 1 === d.line && f === d.file) return;
      if (/^\s*(import|export \{)/.test(l)) return;
      if (wr.test(l)) writes.push({ file: f, line: i + 1, fn: fnAt(f, i) });
    });
  }
  if (!isLet && writes.length === 0) continue; // immutable constant
  d.writes = writes; d.vis = vis;
  state.push(d);
}

// Setters: functions of <= 3 body lines writing a state decl; their calls are writes.
const setters = new Map(); // fnName@file -> decl
for (const d of state) {
  for (const w of d.writes) {
    if (!w.fn) continue;
    const fn = fns[w.file].find((x) => x.name === w.fn);
    if (fn && fn.end - fn.start - 1 <= 3 && /^export /.test(lines[w.file][fn.start])) setters.set(fn.name + "@" + w.file, d);
  }
}
for (const [key, d] of setters) {
  const [name, file] = key.split("@");
  const re = new RegExp(`(^|[^\\w.])${esc(name)}\\(`);
  for (const f of files) {
    if (f === file) continue;
    const im = imports[f].get(name);
    if (!im || im.from !== file) continue;
    lines[f].forEach((l, i) => {
      if (/^\s*(import|function|export function)/.test(l)) return;
      if (re.test(l)) d.writes.push({ file: f, line: i + 1, fn: fnAt(f, i), via: name });
    });
  }
}

// Reads per decl.
for (const d of state) {
  const rr = refRe(d.name);
  const wset = new Set(d.writes.map((w) => w.file + ":" + w.line));
  d.reads = [];
  for (const f of d.vis) {
    lines[f].forEach((l, i) => {
      if (f === d.file && i + 1 === d.line) return;
      if (/^\s*(import\b|\}\s*from|export \{)/.test(l)) return;
      if (f !== d.file && /^\s+[A-Za-z_]\w*,?\s*$/.test(l)) {
        // inside a multi-line import clause
        let j = i; while (j >= 0 && !/^import\b/.test(lines[f][j]) && !/^\S/.test(lines[f][j])) j--;
        if (j >= 0 && /^import\b/.test(lines[f][j])) return;
      }
      if (!rr.test(l)) return;
      // a pure write line still counts as a read if the name appears on the right of `=`
      if (wset.has(f + ":" + (i + 1))) {
        const after = l.replace(mutRe(d.name), "");
        if (!rr.test(after)) return;
      }
      d.reads.push({ file: f, line: i + 1, fn: fnAt(f, i) });
    });
  }
  d.writerPhases = [...new Set(d.writes.map((w) => phaseOf(w.file)))].sort();
  d.readerPhases = [...new Set(d.reads.map((r) => phaseOf(r.file)))].sort();
}

// Phase matrix: decl's writer phase W -> reader phase R (R != W), counting decls.
const PH = ["parse", "resolve", "check", "elab", "mono", "rewrite", "emit", "opt", "driver", "tools", "util"];
const mat = {};
for (const w of PH) { mat[w] = {}; for (const r of PH) mat[w][r] = 0; }
let crossDecls = 0;
for (const d of state) {
  let cross = false;
  for (const w of d.writerPhases) for (const r of d.readerPhases) if (w !== r) { mat[w][r]++; cross = true; }
  // written in two phases is cross too
  if (d.writerPhases.length > 1) cross = true;
  d.cross = cross;
  if (cross) crossDecls++;
}

// Per-phase declared state.
const byPhase = {};
for (const p of PH) byPhase[p] = { decls: 0, lets: 0, containers: 0, writtenElsewhere: 0, readElsewhere: 0 };
for (const d of state) {
  const b = byPhase[d.phase];
  b.decls++;
  if (d.kind === "let") b.lets++;
  if (/\[\]|\{\[|Map\(|Set\(/.test(d.type + d.init)) b.containers++;
  if (d.writerPhases.some((p) => p !== d.phase)) b.writtenElsewhere++;
  if (d.readerPhases.some((p) => p !== d.phase)) b.readElsewhere++;
}

// Hidden arguments: in one function, `const L = G` (G a state let) followed by a write to G.
const letByName = new Map();
for (const d of state) if (d.kind === "let") {
  if (!letByName.has(d.name)) letByName.set(d.name, []);
  letByName.get(d.name).push(d);
}
const hidden = new Map(); // name@file -> {d, consume:[], scoped:[]}
for (const f of files) {
  for (const fn of fns[f]) {
    if (fn.end < 0) continue;
    const body = lines[f].slice(fn.start + 1, fn.end);
    body.forEach((l, k) => {
      const m = /^\s*const (\w+) = (\w+)\s*$/.exec(l);
      if (!m) return;
      const [, loc, g] = m;
      const cands = letByName.get(g);
      if (!cands) return;
      const d = cands.find((c) => c.file === f || (imports[f].get(g) && imports[f].get(g).from === c.file));
      if (!d) return;
      const wr = new RegExp(`^\\s*${esc(g)}\\s*=(?!=)\\s*(.*)$`);
      let setAfter = null, restore = false;
      for (let j = k + 1; j < body.length; j++) {
        const w = wr.exec(body[j]);
        if (!w) continue;
        const rhs = w[1].trim();
        if (rhs === loc) restore = true;
        else if (setAfter === null) setAfter = { rhs, line: fn.start + 2 + j, gap: j - k };
      }
      if (setAfter === null && !restore) return; // plain snapshot read
      const key = d.name + "@" + d.file;
      if (!hidden.has(key)) hidden.set(key, { d, consume: [], scoped: [] });
      const lit = /^(-1|0 - 1|0|""|false|true|\[\]|Map\(\)|null)$/.test(setAfter ? setAfter.rhs : "");
      const site = { file: f, line: fn.start + 2 + k, fn: fn.name };
      if (lit && setAfter.gap <= 3) hidden.get(key).consume.push(site);
      else if (restore) hidden.get(key).scoped.push(site);
      else hidden.get(key).scoped.push(site);
    });
  }
}
// Setter sites of each hidden global outside its consuming/scoping functions.
for (const h of hidden.values()) {
  const own = new Set([...h.consume, ...h.scoped].map((s) => s.file + "#" + s.fn));
  const lit = /^\s*\w+\s*=(?!=)\s*(-1|0 - 1|0|""|false|\[\]|Map\(\))\s*$/;
  const plain = new RegExp("^\\s*" + h.d.name.replace(/[$]/g, "\\$") + "\\s*=(?!=)");
  h.setSites = h.d.writes.filter((w) => !own.has(w.file + "#" + w.fn) && plain.test(lines[w.file][w.line - 1]) && !lit.test(lines[w.file][w.line - 1])).length;
  h.setFns = new Set(h.d.writes.filter((w) => !own.has(w.file + "#" + w.fn) && plain.test(lines[w.file][w.line - 1]) && !lit.test(lines[w.file][w.line - 1])).map((w) => w.file + "#" + w.fn)).size;
}

// Checker symbols imported by non-checker files.
const checkerSyms = new Map(); // orig@from -> Set(importing files)
for (const f of files) {
  if (phaseOf(f) === "check") continue;
  for (const [n, im] of imports[f]) {
    if (!files.includes(im.from) || phaseOf(im.from) !== "check") continue;
    const k = im.orig + "@" + im.from;
    if (!checkerSyms.has(k)) checkerSyms.set(k, new Set());
    checkerSyms.get(k).add(f);
  }
}
const symKind = (k) => {
  const [n, f] = k.split("@");
  const d = decls.get(n + "@" + f);
  if (d) return state.includes(d) ? "state" : "const";
  if (new RegExp(`^export function ${esc(n)}\\b`, "m").test(src[f])) return "function";
  if (new RegExp(`^export type ${esc(n)}\\b`, "m").test(src[f])) return "type";
  return "other";
};
const symByKind = {};
const symByPhase = {};
for (const [k, users] of checkerSyms) {
  const kd = symKind(k);
  symByKind[kd] = (symByKind[kd] || 0) + 1;
  for (const u of users) {
    const p = phaseOf(u);
    symByPhase[p] = symByPhase[p] || new Set();
    symByPhase[p].add(k);
  }
}

// Report.
const out = [];
const P = (s) => out.push(s);
P(`files ${files.length}; module-scope state decls ${state.length}; cross-phase ${crossDecls}`);
P(`\nper phase: decls / let / containers / written-by-another-phase / read-by-another-phase`);
for (const p of PH) { const b = byPhase[p]; P(`  ${p.padEnd(8)} ${String(b.decls).padStart(5)} ${String(b.lets).padStart(5)} ${String(b.containers).padStart(5)} ${String(b.writtenElsewhere).padStart(5)} ${String(b.readElsewhere).padStart(5)}`); }
P(`\nwriter phase -> reader phase (state decls), off-diagonal only`);
P("          " + PH.map((p) => p.slice(0, 6).padStart(7)).join(""));
for (const w of PH) P(w.padEnd(10) + PH.map((r) => (w === r ? "-" : String(mat[w][r])).padStart(7)).join(""));
P(`\nchecker symbols imported by non-checker files: ${checkerSyms.size}`);
P(`  by kind: ${JSON.stringify(symByKind)}`);
P(`  by importing phase: ${PH.filter((p) => symByPhase[p]).map((p) => p + " " + symByPhase[p].size).join(", ")}`);
const hv = [...hidden.values()];
const cons = hv.filter((h) => h.consume.length);
const scop = hv.filter((h) => h.scoped.length);
P(`\nhidden-argument globals: ${hv.length} (consumed-at-entry ${cons.length}, scoped save/set/restore ${scop.length})`);
P(`  sites: consume ${hv.reduce((a, h) => a + h.consume.length, 0)}, scoped ${hv.reduce((a, h) => a + h.scoped.length, 0)}, other write sites ${hv.reduce((a, h) => a + h.setSites, 0)}`);
const hp = {};
for (const h of hv) hp[h.d.phase] = (hp[h.d.phase] || 0) + 1;
P(`  by declaring phase: ${JSON.stringify(hp)}`);
P(`  by declaring file (top 12):`);
const hf = {};
for (const h of hv) hf[h.d.file] = (hf[h.d.file] || 0) + 1;
Object.entries(hf).sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([f, n]) => P(`    ${f} ${n}`));
P(`  consumed-at-entry globals:`); cons.forEach((h) => P(`    ${h.d.name} ${h.d.file}:${h.d.line} consumed in ${h.consume.map((c) => c.fn + ' ' + c.file + ':' + c.line).join(', ')}; set by ${h.setSites} sites in ${h.setFns} fns`));
P(`  most-used (by sites):`);
hv.sort((a, b) => (b.consume.length + b.scoped.length) - (a.consume.length + a.scoped.length)).slice(0, 25).forEach((h) => {
  P(`    ${h.d.name} ${h.d.file}:${h.d.line}  consume ${h.consume.length} scoped ${h.scoped.length} set ${h.setSites}  e.g. ${(h.consume[0] || h.scoped[0]).fn} ${(h.consume[0] || h.scoped[0]).file}:${(h.consume[0] || h.scoped[0]).line}`);
});
P(`\nmost cross-read state (by reader phases, then reads):`);
state.filter((d) => d.cross).sort((a, b) => b.readerPhases.length - a.readerPhases.length || b.reads.length - a.reads.length).slice(0, 30).forEach((d) => {
  P(`  ${d.name} ${d.file}:${d.line} w[${d.writerPhases}] r[${d.readerPhases}] writes ${d.writes.length} reads ${d.reads.length}`);
});
console.log(out.join("\n"));
const j = process.argv.indexOf("--json");
if (j > 0) fs.writeFileSync(process.argv[j + 1], JSON.stringify({ state: state.map(({ vis, ...d }) => d), hidden: hv.map((h) => ({ name: h.d.name, file: h.d.file, line: h.d.line, phase: h.d.phase, consume: h.consume, scoped: h.scoped, setSites: h.setSites })), checkerSyms: [...checkerSyms.keys()] }, null, 0));
```

</details>
