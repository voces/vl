# Code-quality survey — the emitter, 2026-09-04

Surveyed at `facb9f610`. Every line number below is that commit's — except §5.3, re-measured
at `7a733ea6b` and carrying that commit's — and every number names the command that produced
it in §9, with nothing asserted without one. Read-only apart from §5.3's counter probe, which
reverts itself.

**Summary.** The emitter's twelve files hold 88,693 lines and 2,751 functions, and its
structural problems are not spread evenly — they cluster in three shapes. (a) One question is
resolved twice at adjacent call sites: `letRefListDestSlot` is **32.87% of a self-compile's
inclusive time** and its two callers ask it back to back with identical arguments. (b) One
walk is written per fact rather than per traversal: `fnDetectScratch` runs **twelve** whole-body
walks per emitted function and `dupScanRun` re-runs the set, for **21.25% inclusive**; sixteen
functions re-run the same four-to-seven-predicate list-rep ladder. (c) One ladder is written
per delivery position: the "seed the `pending*` hints from a cell's kind" ladder appears **four
times** across `emitLetDeclStmt`, `emitStartFnCode`, `emitGlobalSection` and `emitAssign`, and
the mechanism that would collapse it (`ExpCtx`, wasmEmit.vl:18764) already exists but is
private to `wasmEmit.vl`. Beyond those: 14 exported emitter functions have no reference
anywhere in the tree, `scripts/emitter-state-audit.py` reports 19 frame-flag asymmetries where
2 are real, and 456 of 527 emit refusal sites carry a message that appears nowhere under
`tests/`.

---

## 1 · Ranked top ten

| # | finding | value | size | risk | proof |
|---|---|---|---|---|---|
| 1 | `letListBuildKind` + `letListBuildSlot` each run the whole scoped destination walk with identical arguments, back to back, at all three call sites (§5.1) | ~16% of a self-compile; the subtree is 32.87% inclusive | S | low | byte-identical seed (`refresh-compiler.sh` + `cmp`), corpus `cmp`, `self-compile-time.sh` |
| 2 | `fnDetectScratch` performs 12 independent whole-body walks per function; `dupScanRun` repeats the set per shadowed-name bias (§5.2) | 21.25% inclusive — but **measured, the traversals are free**: one walk is 78% of it and the fusion was refused (§5.2's measured note) | L | med | byte-identical seed; `regress.py` 0 `runs → not-runs`; `vl_instance_state_leak_test.ts` |
| 3 | The cell-seed ladder is written four times; `ExpCtx` is the intended shape and is `wasmEmit.vl`-private (§6.1) | 311 `pending*` write sites collapse toward one resolver; four historical defect sites become one | L | med | byte-identical seed; gate ladder; `regress.py` |
| 4 | Sixteen functions re-run the same `expr*Array` classifier ladder in the same order (§6.2) | ≈23% inclusive summed over the seven classifiers; removes an ordering hazard the comments already name | M | med | byte-identical seed; corpus `cmp` |
| 5 | `nestedFnDeclaredInFrame` is the un-indexed twin of `nestedFnDeclaredIn`, which already uses `fnChildHead`/`fnChildNext` (§4.4) | one `arena-scan-outside-pass` entry retires; O(fnStmts) per chain rung → O(children) | S | low | byte-identical seed; `scan-budget.py --check` falls by 1 |
| 6 | Twelve lazy scratch-slot allocators are one function in three key variants (§4.1) | −145 lines, one place to get the `liBack` code discipline right | S | none | byte-identical seed + `cmp` |
| 7 | `fbBeginFunc` / `fbLocalsCount` / `fbEmitLocalsVec` walk one frame layout three times by hand (§7.1) | a base/count disagreement is silent wrong wasm, not a validator error | M | med | byte-identical seed; `cases_wasm_test.ts`; disassemble one frame with `wasm-dis` |
| 8 | 14 exported emitter functions have zero references tree-wide; `unused-function` exempts exports by design (§8.1) | dead code deleted, and a fourth ratchet keeps it deleted | S | none | byte-identical seed after deletion; a new `--check` script |
| 9 | `scripts/emitter-state-audit.py` names `startFnDetectScratch`, but D1595 moved the resets to `startFnDetectFrames` — it reports 19 asymmetries where 2 are real (§8.4) | restores a live instrument whose signal is currently 90% noise | XS | none | the script's own output; the 2 survivors are D1006/D1007 |
| 10 | **REFUTED, 2026-09-05** — `plCacheBlock` serves **96.28%** of 4,500,173 asks; an LRU ring of 128 avoids **1.12%** of the rebuilds and a ring was the whole proposal. The cost is 32 whole-program `dsScopeWalk` sweeps, not eviction (§5.3) | a ring buys ≈0.05pp of a self-compile, under the profile's own 0.22pp run-to-run spread; the reachable 97% needs an M/L change | S→M/L | low→med | `scripts/perf/parent-let-cache-probe.py`, not a profile A/B |

Everything below carries file, line, what, why, the change, size, risk and how to prove it
safe. "Byte-identical seed" means `scripts/refresh-compiler.sh` then `cmp` against a seed built
from the pre-change source — the only proof a pure refactor of this code needs, and the only
one that is not fooled by a gate that passes for another reason.

---

## 2 · What is already filed, and is not re-derived here

* `docs/internals/perf-opportunities-2026-09.md` — the ci-native job, the corpus oracle, the
  O(n²) string rep. None of §5 below appears in it (checked by grep for `dsScopeWalk`,
  `letRefListDestSlot`, `nodeChildren`: zero hits).
* `docs/internals/profiling-the-compiler.md` — the two landed instances of the whole-arena-scan
  class (#2419, D1514) and the three guards. §5.1 and §5.2 are the same class, third and
  fourth instance, and neither guard fires on them: `arena-scan-outside-pass` already carries
  `letRefListDestSlotK` in its baseline, and `vl_scaling_shape_test.ts` has no axis that varies
  the count of un-annotated list-literal bindings.
* `docs/internals/emitter-module-state.md` — the 445/80/four table. Re-run today it is
  **532 mutables · 162 prologue · 153 pass · 44 frame · 78 inner · 95 never**, and its
  asymmetry column has gone stale (§8.4).
* `docs/internals/destringify-types-program.md` — the type-string parse program. Its scorecard
  said 607 parse calls; today it is **431**, of which **225 (52%) are in `emit_classify.vl`**
  (§6.4).
* `docs/internals/emit-refusal-reachability-2026-09.md` — 504 sites, ≈187–328 reachable.
  Today the population is **525** (§8.2).
* Ratchets, as of this checkout: `scan-budget.py` **107** arena scans outside a pass (33 in
  `emit_classify.vl`, 28 in `emit_collect.vl`, 9 each in `emit_mono.vl`/`emit_sections.vl`);
  `ladder-budget.py` **441** silent kind ladders and **8** split walks (136 + 4 in
  `emit_classify.vl`, 39 + 2 in `emit_collect.vl`, 20 in `wasmEmit.vl`);
  `sentinel-budget.py` **361** unguarded sentinel-index reads (170 `emit_classify.vl`,
  68 `wasmEmit.vl`, 39 `emit_rep.vl`). `goal-scoreboard.py --sites` prints **22** capability
  literals, 12 of them in `wasmEmit.vl`.

---

## 3 · The shape of the area

Lines, then the file's longest function: `emit_classify.vl` 31,462 (`criClassify` 295) ·
`wasmEmit.vl` 22,106 (`emitCoalesce` 867) · `emit_collect.vl` 10,885 (`collectA` 678) ·
`emit_sections.vl` 5,687 (`emitTypeSection` 567) · `emit_mono.vl` 4,887 (`monoMakeInstance`
638) · `emit_rep.vl` 3,911 · `emit_base.vl` 2,929 · `emit_bytes.vl` 2,496 (`fbEmitLocalsVec`
454) · `emit_rewrite.vl` 1,400 (`drwWalk` 294) · `emit_state.vl` 1,162 (367 `export let`) ·
`emit_query.vl` 916 · `emit_bignum.vl` 852 (`ieeeBytes` 240). **88,693 lines, 2,751
functions**; median function 12 lines, 128 over 100, 39 over 200.

---

## 4 · Duplication

### 4.1 Twelve lazy scratch-slot allocators are one function

`compiler/emit_classify.vl:9892–10070`. Twelve exported functions (`sharedFieldRecvSlot`,
`widenSrcWrapSlot`, `widenDstBackSlot`, `unionEqStashSlot`, `unionLitIsStashSlot`,
`unionEqStashSlot2`, `structEqStashSlot`, `unionEqArmSlot`, `widenScalarWrapSlot`,
`widenScalarBackSlot`, `widenTmpSlot`, plus `listIdxScratchSlot` above them) are the same
eleven lines: scan `liBack` for a code, return `listIdxScratchBase + 1 + k` on a hit, else push
a `(kind, slot, code)` triple and return the new length. They differ only in the `liBack` code
and in which extra column is compared — none (4 of them), `liSlots` (5), or `liKinds` (2).

*Why it matters.* The discipline these encode is subtle and is stated in prose in each header
("its own code, not `unionEqStashSlot`'s 13, because an `is` can sit inside a union `==`"). One
shared allocator makes the code a *parameter* rather than a copied constant, so the next stash
cannot silently reuse a live code.

*Change.* Three helpers in `emit_classify.vl` — `scratchSlotByCode(code, kind)`,
`scratchSlotByKey(code, kind, key)`, `scratchSlotByKind(code, kind)` — with the twelve names
kept as one-line wrappers (they document which code is which, and the wrappers are already the
file's idiom: 48 single-call delegations, §6.5). ~145 lines become ~36 plus 12 one-liners.

*Size* S. *Risk* none — a pure refactor. *Proof*: byte-identical seed, `cmp` against a seed
built from the pre-change source.

### 4.2 Seven `exprIsStr*` predicates differ only in a method name

`compiler/emit_classify.vl:6998, 7011, 7025, 7039, 7051, 7063, 7077` — `exprIsStrSlice`,
`exprIsStrIndexOf`, `exprIsStrCharCode`, `exprIsStrCpAt`, `exprIsStrCpLen`,
`exprIsStrCharBoundary`, `exprIsStrBytes`. Each is: `P.nodes[callIx] is Call` →
`P.nodes[c.callFn] is Member` → `callee.memProp == "<name>"` → `exprString(callee.memObj, fnIx)`.
Only `exprIsStrIndexOf` accepts two names (`indexOf` / `includes`).

*Why it matters.* The `P.nodes[X.callFn]` read appears **134 times** in the emitter and is a
`sentinel-index-unguarded` hit at most of them; `.memProp ==` appears **83 times**. One
`callMethodOnString(callIx, fnIx, name)` (and a plain `callMethodName(callIx): string`) puts one
bound check where dozens stand.

*Change.* `function exprIsStrMethod(callIx: i32, fnIx: i32, prop: string)`, with the seven
names kept as wrappers. *Size* S. *Risk* none. *Proof*: byte-identical seed; the
`sentinel-budget.py --check` count should fall, and its `--why` should name the departures.

### 4.3 Four `binOpcode*` ladders over one operator alphabet

`compiler/emit_base.vl:534` (`binOpcode`, 58 lines), `:595` (`binOpcodeI64`, 58), `:653`
(`binOpcodeF64`, 33), `:690` (`binOpcodeF32`, 33) — 182 lines mapping the same operator
lexemes to four opcode families, with four independent string ladders. All four are called from
one function, `emitBinExprNode` (`wasmEmit.vl:20361, 20386, 20400, 20408`), and nowhere else.

*Change.* One `binOpIndex(op: string): i32` returning a slot in a fixed operator order, plus
four small opcode tables (`-1` where the family has no form, which is what `f64`/`f32` need for
`%` and the bitwise ops). Seventeen string comparisons become one ladder shared by four
families. *Size* S. *Risk* low — the mapping is a table, and a transcription error shows as a
different opcode byte. *Proof*: byte-identical seed; and disassemble one arithmetic function
per family with `./node_modules/.bin/wasm-dis` before believing it.

### 4.4 `nestedFnDeclaredInFrame` is the un-indexed copy of `nestedFnDeclaredIn`

`compiler/emit_classify.vl:3541` and `compiler/emit_collect.vl:2678`. Both answer "the
`fnStmts` position of a lifted function named `name` whose parent frame is `pp`". The
`emit_collect` one uses a lazily built child index (`fnChildHead`/`fnChildNext`, built by
`buildFnChildIndex` at `emit_collect.vl:2649`) and walks only `pp`'s children. The
`emit_classify` one scans **all of `fnStmts`** and filters on `fnParent[i] == pp`, once per rung
of the scope-chain walk in `fnIndexOfInScopeSid`.

Their callers `fnIndexOfInScopeSid` (`emit_classify.vl:3565`) and `fnIndexOfInScopeChainSid`
(`emit_collect.vl:2704`) are structurally identical bodies (17 lines each), and the header of
the first says why: *"this file cannot import `emit_collect`, since the module graph runs the
other way."* So the twin is deliberate; the *divergence in cost* is not.

*Change.* Move `fnChildHead`/`fnChildNext` and `buildFnChildIndex` into `emit_state.vl` (a leaf
both import) and have both twins read it. That also collapses the two 17-line chain walks into
one shared function. *Size* S. *Risk* low — same answer, different traversal order over the
same first-wins rule; `nestedFnDeclaredIn`'s header already states the order contract.
*Proof*: byte-identical seed; `scan-budget.py --check` falls by one, and `--why` should name
`nestedFnDeclaredInFrame` as the entry that left.

### 4.5 `exportSlotOfTarget` and `monoFirstFnIndexNamed` are byte-identical bodies

`compiler/emit_sections.vl:5412` and `compiler/emit_mono.vl:4466`: eleven lines each, scanning
`fnStmts` for the first `FuncDecl` named `name`. Both headers say they mirror each other, and
`exportSlotOfTarget`'s says *"four sections now depend on it agreeing."* In the profile,
`exportSlotOfTarget` accounts for **96 of the 1,947 `__str_eq__` leaf samples** (0.9% of the
whole self-compile) — all of it string comparison the sid tables could answer.

*Change.* One `firstFnStmtsSlotNamed(name)` in `emit_base.vl` or `emit_state.vl`, ideally
sid-keyed the way `fnIndexOfSid` already is (`emit_classify.vl:3536`). *Size* S. *Risk* low —
the "FIRST slot wins" rule is the thing to preserve verbatim. *Proof*: byte-identical seed.

### 4.6 Smaller pairs found by structural fingerprint

Same normalised token sequence, different names (§9, `dupes.py`); lines each in brackets.
`emit_query.vl:294 blockHasArrNew` / `:438 blockHasCoalesceCall` [31] ·
`:327 ifChainHasArrNew` / `:470 ifChainHasCoalesceCall` [13] ·
`emit_rep.vl:299 repCanonKey` / `:444 repElemKey` [29] ·
`emit_classify.vl:16815 arrLitIsF64` / `:28475 arrLitIsI64` [25] ·
`emit_rep.vl:1748 recordSFieldElemRowTy` / `:1775 recordUFieldElemRowTy` [19] ·
`wasmEmit.vl:18421 emitBreakStmtStmt` / `:18444 emitContinueStmtStmt` [22] ·
`:13197 floatIntrOpF32` / `:13214 floatIntrOpF64` [12] · `:13230 intIntrOpI32` /
`:13248 intIntrOpI64` [14] · `:18730 emitUserGlobalGet` / `:18746 emitUserGlobalSet` [13] ·
`emit_classify.vl:1526 letIsNulRef` / `:1540 letIsNulVariant` / `:29000 letIsNulMap` [10] ·
`:9337 mfRecordSrc` / `:9351 mfRecordDst` and `:9363 mfSrcLocalFor` / `:9375 mfDstLocalFor` [10].

The `blockHasX` / `ifChainHasX` / `exprHasX` family is the largest of these: **23 walkers**
over one statement-and-if-chain recursion, one triple per fact. §5.2 is the version of this
finding that has a number attached.

---

## 5 · Performance

All figures are from one `VL_PROFILE_GUEST` self-compile at `facb9f610`, 10,794 guest samples,
box load 35 (§9). Load cancels in the percentages; wall time is not quoted.

Whole-profile shape: `emitCodeSection` **51.43% inclusive**, `__str_eq__` **18.04% self**,
`nodeChildren` **12.34% self**.

### 5.1 `letRefListDestSlot` is asked twice, at every call site, with identical arguments

`compiler/emit_classify.vl:27605 letListBuildKind` and `:27612 letListBuildSlot` both call
`letRefListDestSlot(letIx, fnIx)` (`:27266`), which calls `letRefListDestSlotK` (`:27301`) —
which walks the binding's whole lexical scope through `dsScopeWalk` (`:27502`), allocating a
fresh `nodeChildren` list at every node, calling `dsRebindsName` at every nested `FuncDecl`,
and calling `dsDestSlotAt` (`:27337`) at every node. When the box answers, `letRefListDestSlot`
runs the walk a *second* time at `want = 1` for D411's two-destination check.

The two are called as an adjacent pair at all three call sites and nowhere else:
`wasmEmit.vl:17475–17476` (`emitLetDeclStmt`), `emit_sections.vl:1703–1704` (the start-fn
global-init loop), `emit_sections.vl:5313–5314` (`emitGlobalSection`).

Measured:

```
letRefListDestSlot$m16: on stack in 3548 of 10794 samples (32.87%) — immediate callers:
    1790  letListBuildSlot$m16
    1758  letListBuildKind$m16
```

and within it, `dsScopeWalk` 6.74% self / 32.83% inclusive, `dsDestSlotAt` 3.92% self /
7.30% inclusive, `dsRebindsName` 1.08% self / 6.91% inclusive, and **1,283 of `nodeChildren`'s
1,332 leaf samples are under `dsScopeWalk`** — 11.9% of the whole compile spent allocating
child lists for this one walk.

*Change, in two steps of very different risk.*

1. **One resolver returning the pair.** `letListBuild(letIx, fnIx)` computes the destination
   once and hands back `(kind, slot)`; the three sites take both from it. Nothing is cached
   across sites, so no staleness question arises, and the two calls are provably the same
   question — no interning happens between them. Expected saving ≈ half of 32.87%.
   *Size* S. *Risk* low.
2. **An epoch-stamped memo per `(letIx, fnIx)`**, on the pattern `emit_rep.vl` already uses
   (`repElemMemoEpoch` / `repElemMemoLen` / `repElemMemoUserVer`, `emit_rep.vl:484–486`). The
   answer depends on the ref-list intern tables, which grow during collect, so the stamp has to
   be the table length plus the user version — the same three columns. *Size* M. *Risk* med:
   this is D1514's "index, not memo" question, and the honest test is whether an emit-phase
   intern can change the answer.

*Proof.* Byte-identical seed via `refresh-compiler.sh` + `cmp`; `regress.py` 0
`runs → not-runs`; a second `VL_PROFILE_GUEST` run showing the subtree fall; and
`scripts/self-compile-time.sh` for the L2 number. Step 2 additionally needs the D411/D501/D661
fixtures (`tests/cases/**` cited in those rows) and the `d661-destination-scope` named set,
which is exactly the boundary this walk owns.

### 5.2 `fnDetectScratch` walks the body twelve times, and `dupScanRun` repeats the set

`compiler/emit_sections.vl:1226 fnDetectScratch` runs, per emitted function:
`blockPushPopBits`, `fnHasStrOp`, `fnHasArrNew`, `fnHasCoalesceCall`, `fnHasMap`,
`fnHasGlobalMapOp`, `blockHasCallRef`, `blockHasVariantRebox`, `collectRefPushSlots`,
`collectMemberPopRefSlots`, `mfScan`, `leqScanBlock` — twelve independent traversals of the
same body. `dupScanRun` (`:1260`) re-runs the whole set once per same-named-slot bias, and once
more when `frameHasBlockLetOverGlobal()`.

Measured: `dupScanRun` **21.25% inclusive**, of which `leqScanBlock` 15.24%,
`leqScanExpr` 15.20%, `leqScanStmt` 14.74%, and inside those `listOpKindOfBin` 10.67% →
`listOpKindOf` 10.60% (all 1,144 of `listOpKindOf`'s samples come from `listOpKindOfBin`).

*Why it matters.* The right shape is already stated in this function's own comment: *"ONE body
walk (`blockPushPopBits`) classifies every `.push`/Member-`.pop` receiver once and yields all
six kind flags together."* Eleven walks have not been folded in.

*Change.* Extend the bits idiom to the whole `fnUses*` set: one traversal returning a bitset
plus the slot lists, with the per-fact predicates kept as the *classifiers* the walk calls at
each node rather than as their own walkers. The `fnUses*` flags only ever go true and every
slot list dedupes (`dupScanRun`'s header states this), so ORing the results of one pass is the
same fixpoint the twelve passes reach. *Size* L. *Risk* med — the danger is a fact whose
walker descends somewhere another does not; enumerate that by comparing the per-walker `is`
arms before merging, not by reading. *Proof*: byte-identical seed is the whole safety
argument here (the frames are byte-visible); plus `vl_instance_state_leak_test.ts`, and
`regress.py` 0 `runs → not-runs`.

*Measured, and the fusion was NOT the change (2026-09-05).* A whole-body walk is nearly free:
`blockHasArrNew` traverses every body of the compiler for **0.08%** of a self-compile, and
eleven of the twelve legs together are ~4%. `leqScanBlock` alone is **19.01%** of the 24.47%,
and its cost is not traversal — `leqNoteBin` re-asks `listOpKindOfBin` up to four times and
`eqgListKindOfBin` twice per `==`/`!=`, with identical arguments. An instrumented compiler
counts **103,521** `leqNoteBin` calls, **61,691** of them on an operator none of its six
classifiers claims, and **190 of 5,173** detection passes are `dupScanRun`'s per-bias repeat
(3.7%, `dupScanActive` true in 118 of 4,983 runs, `frameHasBlockLetOverGlobal` 0). What landed
instead: the `k == 7` gate on the direct `eqgListKindOfBin`, one operator gate at
`leqScanExpr`, and the list-op scan leading `fnDetectScratch` so every monotone-flag leg behind
it is skipped once its flag is true — `fnDetectScratch` 24.47% → 20.16%, L2 user CPU −4.0%.
**The remaining redundancy is inside `eqCoreKindOfBin` and `eqgListKindOfBin`
(`emit_classify.vl`), which re-derive `listOpKindOfBin` for the same `(binIx, fnIx)`; a memo
there is worth ~2.5% and is the follow-up this row leaves open.**

### 5.3 `dsRebindsName` and the `parentLetOf` cache — the ring is REFUTED

**Re-measured at `7a733ea6b`, 2026-09-05.** The caller chain below is real; the *diagnosis* on
top of it is not. The cache serves **96.28%** of its asks, and the ring this row proposed would
avoid **1.12%** of the rebuilds it was proposed to remove. `#2567` (row 1's `letListBuild`)
landed between the two readings and halved this subtree, so the profile figures are re-taken.

`compiler/emit_base.vl:148 plCacheBlock` is a **single-entry** cache: `parentLetOfSid`
(`:420`) rebuilds `plScanStmt` (`:239`) whenever `blockIx != plCacheBlock`. `dsScopeWalk`
(`emit_classify.vl:27411`) calls `dsRebindsName` (`:27391`) at every nested `FuncDecl`, and
that calls `parentLetOf(fn.fnBody, nm)`.

That chain is confirmed. Over three self-compiles of identical source (7,458 / 10,044 / 9,348
samples): `plScanStmt` **3.29–3.51% self, 4.07–4.14% inclusive**, and 100% of its samples are
under `parentLetOfSid`; `parentLetOfSid` 4.57–4.81% inclusive, 89% of it `plScanStmt`;
`dsRebindsName` 0.66–0.76% self, 4.40–4.43% inclusive, and the immediate caller of **75.2%**
of `parentLetOfSid`'s samples. **83.1%** of `plScanStmt`'s samples sit under
`emitGlobalSection` → `letListBuild` → `letRefListDestSlot` → `dsScopeWalk` → `dsRebindsName`.

**What a profile cannot say is whether a bigger cache would avoid the rebuild.**
`scripts/perf/parent-let-cache-probe.py` counts it, over one self-compile:

| | |
|---|---|
| asks (`parentLetOfSid` + `parentLoopVarOfSid`) | 4,500,173 |
| served by the one-slot cache | 4,332,770 (**96.28%**) |
| rebuilds | 167,403 |
| arena nodes visited rebuilding | 4,086,747 |
| distinct blocks ever asked | 4,994 |

| cache | rebuilds avoided | of all rebuilds |
|---|---|---|
| LRU 2 | 1,424 | 0.85% |
| LRU 4 | 1,598 | 0.95% |
| LRU 8 | 1,692 | 1.01% |
| LRU 16 | 1,755 | 1.05% |
| LRU 32 | 1,815 | 1.08% |
| LRU 128 | 1,877 | 1.12% |
| unbounded | 162,409 | **97.02%** |

**There is no alternation to catch.** A second counter finds **32** whole-scope `dsScopeWalk`
roots — 29 of them rooted at the `Program` node, which is what `dsScopeRootOf` (`:27371`)
returns for a global binding — making **144,826** `dsRebindsName` calls between them: 4,526
per walk, one per `FuncDecl` the walk enters, and 86.5% of every rebuild in the compile. Each
walk marches through ~4,500 *distinct* bodies in sequence and then starts over, so the reuse
distance for any one body is ~4,500. That is why every ring from 2 to 128 lands within 0.3
points of the others while the unbounded column is 87× all of them: these are the sweep's
compulsory misses, not eviction pressure. The same fact refutes the row's second option —
`dsScopeWalk` already asks `dsRebindsName` exactly once per frame per walk, so "once per frame
rather than per visit" is already true and buys nothing.

**And the proof this row named cannot resolve the change it proposed.** `plScanStmt`'s self
time reads 3.29 / 3.34 / 3.51% across three profiles of the *same* source — a 0.22-point
spread, and 0.41 across the three taken one commit earlier. A 128-entry ring's whole effect is
1.12% of a ~4.1%-inclusive subtree, ≈0.05 points. The profile A/B is an order of magnitude
coarser than the effect it would grade; the counter is the instrument for this question.

*What is actually available*, and neither shape is S. 97% of 167,403 rebuilds is reachable —
the `plScanStmt` subtree is ~4.1% of a self-compile — by one of:

* **Stop re-walking the whole program once per global binding.** `letRefListDestSlotK`
  (`:27210`) roots the walk at `emitRootIx` whenever the binding is a global, so 29 globals
  each sweep every function in the program. This is row 1's subtree: #2567 halved the walk
  *count* and did not change a walk's cost.
* **An unbounded per-block index**, on the `index, not memo` pattern D1514 landed. Sound only
  if a block's `LetDecl` set cannot change after its first build; the arena grows during the
  pass table, so the invalidation has to be derived — an arena-length stamp covers an added
  node but not an in-place kind rewrite — and a wrong answer here is a silent miscompile, not
  a validator error.

*Size* M/L. *Risk* med. *Proof*: byte-identical seed; the counter above, never a profile A/B.

*And the control a multi-entry cache needs now exists, because the two fixtures that look
like it are not it.* `tests/cases/closures/capture-one-name-five-frames.vl` binds `v` in five
frames at five storage classes and types — a `for` variable (f64 element), a body `let`
(string), a parameter (boolean), the module-scope `const` (i32) seen from a frame binding no
`v`, and a nested frame shadowing its parent — and captures each, so a plan served for the
wrong block cannot type-check by accident. Sabotaged so `parentLetOfSid` serves the first
block it ever built, it is `expected (ref $type), found f64` inside `loopV`; under the same
saboteur `unions/list-literal-destination-scope.vl` and its shadow twin both still **pass**,
which is the reason to have run them rather than reasoned about them.

### 5.4 Type-string parsing is ~3.7% of a self-compile

`tyTopIndexOf` (`compiler/tyname.vl:158`) is **2.98% self** — 322 leaf samples, reached from
`nameIsFuncTypeAtom` (93), `splitUnionAtoms` (81), `nullablePartOf` (47), `nameIsRefArray` (41),
`parenUnionArrElemName` (34), `unionMemberCount` (21). With `splitUnionAtoms` (0.61 self) and
its siblings the `tyname.vl` character grammars are ~3.7% self.

This is the destringify program's own subject and is not a new finding; what is new is the
current count. §6.4 gives it.

---

## 6 · Normalising logic

### 6.1 The cell-seed ladder is written four times, and `ExpCtx` is the intended shape

There are **16** `pending*` module globals (`emit_state.vl`) and **311** write sites, all in
three modules: `wasmEmit.vl` 263, `emit_sections.vl` 47, `emit_collect.vl` 1. They concentrate:

| function | `pending*` writes |
|---|---:|
| `wasmEmit.vl emitDirectCall` | 35 |
| `wasmEmit.vl emitAssign` | 29 |
| `emit_sections.vl emitStartFnCode` | 28 |
| `wasmEmit.vl emitLetDeclStmt` | 25 |
| `wasmEmit.vl emitVariantFieldValue` | 24 |
| `wasmEmit.vl emitStructFieldValue` | 21 |
| `wasmEmit.vl emitReturnValue` | 20 |
| `emit_sections.vl emitGlobalSection` | 19 |

Four of these are the **same ladder over the same `VKind` alphabet**: given a cell's kind and
slot, seed the struct index, the variant index, the list kind and slot, the map shape, the
nullable heap, and the litunion/nulbool/nulstring flags.

* `wasmEmit.vl:17475–17560` — the local `let`.
* `emit_sections.vl:1645–1740` — a non-const global's init inside the start function.
* `emit_sections.vl:5286–5390` — a const global's constexpr init.
* `wasmEmit.vl:14105–14225` — `emitAssign`'s `global.set` arm.

The comments say so: *"mirrors the local-`let` seeding"*, *"Mirrors the kind-9 global cell's
seeding"*, *"exactly as the const-path and the local-`let` path seed it"*, *"Each mirrors
`emitLetDeclStmt`'s local kind ladder exactly"*.

*Why it matters.* Every one of these four is where a defect landed — D51 (the struct/variant
flip), D964 (the seed leak), D1031 (the arm unbox), D1563 (the seeds not cleared). A fix in one
is not a fix in the others, and the reader has no way to tell which of the four they are
looking at.

*The mechanism already exists.* `type ExpCtx` (`wasmEmit.vl:18764`) is exactly the explicit
version of the sixteen implicit parameters, with `expCtxHere` (`:18785`), `expCtxApply`
(`:18808`) and `emitExprExpect` (`:18831`). Its header states the motive: *"The `pending*`
globals are implicit parameters: a hand-rolled save/restore at every site risks a leaked
seed."* It is used at 47 `emitExprExpect` call sites and by nothing in `emit_sections.vl` —
`ExpCtx` is not exported, so the two global-init ladders cannot use it.

*Change.* (a) Move `ExpCtx` + the three helpers into a module both `wasmEmit.vl` and
`emit_sections.vl` can import — `emit_state.vl` holds the globals they transport, so it is the
natural home. (b) Add one `expCtxForCell(kind: VKind, slot: i32, letIx: i32, fnIx: i32):
ExpCtx` and have all four ladders build a context and hand it to `emitExprExpect`. *Size* L.
*Risk* med — the four ladders are not identical today (the const path at
`emit_sections.vl:5197–5410` writes `pendingNulNone` **nowhere**; the two global paths seed a
`nulvariant` cell's null from `uVarHeap` directly while `emitLetDeclStmt` reaches it through
`armDestHeapOf` at `wasmEmit.vl:17726`), so the first step is a table of the differences with a
witness for each, not a merge. *Proof*:
byte-identical seed is achievable only if the four really do agree; where they do not, the
difference is a finding and needs a fixture. Grade with the gate ladder, `regress.py`, and
`scripts/capability-probes/matrix.py` over the delivery positions.

#### 6.1.1 The difference table — every place the four ladders disagree

The four ladders, re-derived from the tree (the section's line numbers above are stale):

| id | ladder | where |
| --- | --- | --- |
| **L** | the local `let` | `wasmEmit.vl` `emitLetDeclStmt` |
| **S** | a non-const global's init, inside the start function | `emit_sections.vl` `emitStartFnCode` |
| **C** | a const global's constexpr init | `emit_sections.vl` `emitGlobalSection` |
| **A** | `emitAssign`'s `global.set` arm | `wasmEmit.vl` `emitAssign` |

**Two facts settle most of the table, and both are checkable.**

*One.* `isConstInit` (`emit_base.vl`) admits `NumLit`, `CharLit`, `BoolLit`, a short `StrLit`,
`Paren`, and an `ArrayLit`/`ObjLit` of those. It has **no `NullLit` arm and no `Call` arm**, so
`globalIsNonConst` is true for every `= null` and every `= Map()` global. **C can therefore
never receive a bare `null`** — and every null-rep seed exists only to be consumed by one.
Confirmed independently by disassembling each witness: in the C column of the kind matrix the
reach probe reads `S` for every `/null` face and for `map`, `refmap`, `nulmap`, `nulrefmap`,
`closure`, `nulclosure`.

*Two.* `letInfStrListByUseV`'s non-literal rung is gated `fnIx >= 0`. All three global ladders
run at `fnIx == -1`, where it degrades to exactly the literal-only `letInfStrListByUse` that
`letAnnRefListKind` already applies.

| # | seed / rung | L | S | C | A | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `pendingListKind`/`Slot` producer | `letListBuild` | `letListBuild` | `letListBuild` | `letAnnRefListKind`/`Slot` | **equivalent spelling** — `letListBuild`'s middle rung (`letRefListDestSlot`) answers for an un-annotated binding whose destination pins the slot; A's target is a declared global, whose declaration already names it |
| 2 | the `letInfStrListByUseV` rung | yes | no | no | no | **dead in S/C/A** — its extra arm is gated `fnIx >= 0`, and all three run at `-1` |
| 3 | `pendingStructIdx`, `nulstruct` cell | `localStructIdx[slot]` | `globalCellStructIdx` | `globalCellStructIdx` | `nulRefStructIdxOfLet` | **equivalent spelling** — `globalCellStructIdx` routes an annotated cell through `globalNulRefSupersede`, gated on `globalCellKind == "nulstruct"`, which is the module-scope twin of `nulRefStructIdxOfLet`'s redirect |
| 4 | `pendingVariantIdx` bound | unbounded | unbounded | bounded by `uVarHeap.length` | unbounded | **no witness** — the window needs `globalCellKind` to answer `variant`/`nulvariant` while `globalCellStructIdx` falls to `structIndexOfExpr`; the two are paired arm for arm. A defensive bound, not a live one. Called out, not filed |
| 5 | `pendingNulRefHeap`, `nulvariant` cell | no seed | `uVarHeap[i]`, ungated | `uVarHeap[i]`, ungated (bounded) | `armDestHeapOf(kind, i)`, gated on a `NullLit` RHS | **same value, three spellings** — `armDestHeapOf("nulvariant", i)` *is* `uVarHeap[i]` under the same bound, and `globalCellArmIdx(g, "nulvariant")` *is* `globalCellStructIdx(g)`. L needs no seed because `emitNullLitNode` reads `pendingVariantIdx` first, which L does seed. The gate scopes a leak; both global loops clear the seed at the foot (D1563) |
| 6 | `pendingNulNone` | no seed (an early `letIsNulNone` return emits `ref.null none`) | `gck == "nulnone"` | **no seed** | no seed (a `gaKind == "nulnone"` arm emits it) | **dead in C by construction** — a `nulnone` cell's init is `null`, which is never a constexpr. L and A are equivalent spellings: a direct emit instead of a seed |
| 7 | `pendingNulBool`/`NulString`/`NulClosure`/`NulList` | seeded | seeded | **none seeded** | seeded | **dead in C by construction** — each is consumed only by a bare `null` |
| 8 | `pendingNulBool` producer | `letNulBool` (annotation, inferred, or init probe) | `letIsNulBoolAnn` (annotation only) | — | `exprNulBool` | **equivalent spelling** — the inferred rungs answer for a binding whose init is not a bare `null`, and only a bare `null` consumes the seed |
| 9 | `pendingI64` / `pendingF64` | not seeded | not seeded | `gck == "i64"` / `"f64"` | not seeded | **equivalent spelling, stated in `emit_state.vl`'s own header** — a wasm constexpr carries no convert op, so C re-encodes the literal where the other three widen through `emitExprAs*` |
| 10 | `pendingF32` | set around `emitExprAsF32` | set around `emitExprAsF32` | `gck == "f32"` | not set | **equivalent spelling** — same three witnesses (float literal, integer literal, `f32[]`) at all four |
| 11 | `pendingMapSlot` for a `map`/`nulmap` **const** cell | — | seeded | seeded | seeded under `exprMap` | **dead arm in C, and its comment is stale**: "the `pendingMapSlot` seed makes the `Map()` init constexpr build it" cannot fire — `Map()` is a `Call` and `isConstInit` has no `Call` arm |
| 12 | `pendingNulRefHeap` for `nulreflist` / nul-scalar-list | seeded | seeded | **not seeded** (the `pendingListKind` half is) | seeded | **correct as written** — the ref-heap half is consumed only by a bare `null`; the list-build half *is* live at C and is present |
| 13 | `ExpCtx` carries 16 fields for 17 `pending*` globals | — | — | — | — | `pendingNulNone` is absent from `expCtxHere`/`expCtxApply`, so `emitExprExpect` neither applies nor restores it. Nothing observes it today (S is its only writer and S does not route through `emitExprExpect`), but a later merge must not start scoping it silently |
| 14 | what the per-cell RESET clears | restores through `emitExprExpect` | clears all eleven, `pendingNulRefHeap` among them | clears **nine**, and no null rep among them | restores through `emitExprExpect` | **the reason C stays unwired.** Rows 6, 7 and 12 say C never *consumes* a null rep. It also never *clears* one, and only the first fact was load-bearing until the builder arrived |

**Row 14 is the one the merge had to find the hard way.** Wiring C to the shared builder is
sound by consumption — a bare `null` cannot reach it — and unsound by leakage: a const cell of
kind `nulf64list` arms `pendingNulRefHeap` with its wrapper, C's reset does not clear it, and the
next `= null` global in the start function lowers as that wrapper. That is D1563's mechanism
exactly, and `tests/cases/globals/nullable-global-null-list-seeds.vl` plus
`nullable-global-assign-null-seeds.vl` turned check-clean invalid wasm (`type mismatch: expected
(ref null $type), found (ref null $type)`) under the wired build. **A dead arm and an inert one
are not the same claim**, and only the second licenses adding a seed.

**Outcome: no disagreement changes a program's outcome, so no row was filed.** Every entry is
an equivalent spelling or a dead arm, and each is named as one above.

*How that was measured.* Roughly 250 programs, graded `RUNS` / `check refuses` / `emit refuses`
/ `SILENT` / `trap` at each ladder position the shape can reach:

* a generative matrix over the whole `VKind` alphabet — 33 kinds × 4 positions × a `val` and a
  `null` face, 47 rows — with a **reach probe** that disassembles each module and reports which
  global-init ladder actually ran, because `globalIsNonConst`, not the spelling, decides S vs C;
* the **un-annotated** face of every one of those shapes, since a fixture that annotates every
  destination cannot see a defect whose ingredient is inference doing the pinning;
* an adversarial round using **two distinct** struct rows, ref-list slots and map shapes, so a
  wrong table row is a wrong heap type rather than a lucky slot 0;
* controls: a program that must print, a program that must be refused, and D1563's own witness
  as a positive control for the seed-leak channel.

The first run of the harness graded every cell `emit_reject`; the second graded every cell
`RUNS` with **empty output**. Both were the instrument — a flag order, then `main` not being an
entry point. Only the controls said so.

*What the merge then did.* `ExpCtx` and its three helpers are `export`ed rather than moved:
`emit_state.vl` imports nothing and is the graph root, so it cannot host `emitExprExpect`
(which calls `emitExpr`), while `emit_sections.vl` already imports from `wasmEmit.vl`. Adding
`export` alone is byte-identical. `expCtxForCell(kind: VKind): ExpCtx` then carries the four
rungs a ladder derives from the kind alone — the two nul-scalar-list seeds, `nullist` and
`nulclosure`. **Three of the four boundaries call it**: the local `let`, the start-fn global
init, and the `global.set` arm. The const cell keeps its own single live rung, for row 14's
reason. Row 5's `nulvariant` null is deliberately **not** in the builder: its gate genuinely
differs per boundary and no witness separates the three spellings, so folding it in would be an
unmeasured behaviour change.

### 6.2 Sixteen functions re-run one list-rep classifier ladder

`exprStringArray` → `exprF64Array` → `exprI64Array` → `exprF32Array` → `exprU8Array` →
`exprRefArray` → `exprArray`, in that order, appears in 16 functions; 9 of them run all seven:

```
7 probes  wasmEmit.vl:19960 emitMemberNode         7 probes  emit_classify.vl:15326 globalKind
7 probes  wasmEmit.vl:14997 emitPush               7 probes  emit_classify.vl:12380 forInElemKind
7 probes  wasmEmit.vl:14082 emitAssign             7 probes  emit_classify.vl:6486  catListKindOfExpr
7 probes  wasmEmit.vl:3511  emitUnionCoerce        7 probes  emit_classify.vl:6459  listOpKindOf
7 probes  emit_mono.vl:690  monoArgTyName
6 probes  emit_classify.vl:10152 ifExprRefKind · :5624 pushKindBitsOf · :3076 criClassify
5 probes  emit_classify.vl:5432 scalarListElemKind · :2062 exprNulScalarListKind
4 probes  wasmEmit.vl:21240 emitCoalesce · :21059 emitArrayCopyIntr
```

Each produces a *different alphabet* from the same classification: `-1/0/3/4`
(`listOpKindOf`), `0/1/3/4/6/7/10` (`catListKindOfExpr`), `"f64list"/"i64list"`
(`ifExprRefKind`), `"f64"/"i64"` (`scalarListElemKind`), `"nulf64list"/"nuli64list"`
(`exprNulScalarListKind`), a bitset (`pushKindBitsOf`).

The hazard is already named in the source: `catListKindOfExpr`'s header says *"Same ladder
order as `listOpKindOf`, so the two cannot classify one expression two ways"* — an invariant no
gate checks and that two more of the sixteen would have to restate.

Measured cost of the classifiers themselves: `exprRefArray` 7.53% incl, `exprString` 4.22%,
`exprArray` 3.01%, `exprStringArray` 2.99%, `exprF32Array` 2.82%, `exprF64Array` 1.83%,
`exprI64Array` 0.82%, `exprU8Array` 0.21% — ≈23% summed, with overlap.

*Change.* One `exprListRep(exprIx: i32, fnIx: i32): VKind | null` that answers the rep once,
and per-consumer mapping functions from `VKind` to each alphabet. The mapping tables are then
the only thing that can disagree, and each is small enough to read. *Size* M. *Risk* med — the
order matters (`listOpKindOf`'s comment explains why the four distinct-backing scalar lists
must decline rather than fall through to `exprArray`), so the shared classifier has to preserve
it exactly. *Proof*: byte-identical seed; corpus `cmp`; the four scalar-list families each
have `tests/cases/arrays/*` fixtures.

### 6.3 Boolean parameters: 72 emitter functions take one

Most are genuine polarity (`isNe` for `==`/`!=`, `invert`, `neg`). Two families are not:

* **`keyI32`** — 18 functions across `emit_classify.vl`, `emit_rep.vl` and `emit_collect.vl`
  thread a boolean selecting the map key space (`mvSlotByValNameK`, `mvSlotOfValTyK`,
  `mvShapeOfValNameK`, `mvSlotOfTyKArm`, `recordSFieldElemRow`, …). It is a two-member closed
  set, so a `MapKeyKind` would give the ladder ratchet something to check and would make the
  call sites readable.
* **`want`** — `letRefListDestSlotK(letIx, fnIx, want: i32)` uses `1` and `2` as the ref-list
  element kind. Its own header explains the numbers; a named pair would not need to.

*Size* S each. *Risk* none. *Proof*: byte-identical seed.

### 6.4 String-keyed decisions: 431 type-string parse calls, 225 of them in `emit_classify.vl`

Re-derived today against the destringify program's own list of parsers (§9):

| file | parse calls | | parser | calls |
|---|---:|---|---|---:|
| `emit_classify.vl` | **225** | | `nameIsArray` | 55 |
| `emit_base.vl` | 73 | | `nullablePartOf` | 51 |
| `emit_collect.vl` | 61 | | `nameIsLitUnionType` | 51 |
| `typecheck.vl` | 31 | | `splitUnionAtoms` | 50 |
| `emit_mono.vl` | 21 | | `annArrowAt` | 34 |
| `wasmEmit.vl` | 8 | | `nameIsRefArray` | 28 |
| `emit_rewrite.vl` / `tyname.vl` / `emit_rep.vl` | 5 / 5 / 2 | | `unionMemberCount` / `mapValNameOf` / `refArrElemName` | 22 each |
| **total** | **431** | | `isTopLevelFuncTypeName` | 18 |

**What is new versus the doc**: the total is 431, not the 607 the doc's SCORECARD CORRECTION
section reports, and the concentration has sharpened — 52% of all remaining parses are in one
file. The doc's strategy ("kill the SOURCES, not the call sites") is unchanged and is the right
one; the number is the thing to re-derive before scheduling a slice.

### 6.5 One hundred single-call delegation wrappers

Functions whose whole body is one call to another function with extra constant arguments:
`emit_classify.vl` 48, `wasmEmit.vl` 13, `emit_base.vl` 13, `emit_collect.vl` 11,
`emit_rep.vl` 8, others 7 — **100** in the emitter.

Most exist because VL has no default parameter values, so every signature widening spawns a
wrapper: `mvSlotOfMapValNameOrMono` → `…OrMonoK(ivIn, false)` → `…OrMonoKTy(ivIn, keyI32, -1)`
is a three-rung chain, and the `mv*`/`rl*` families are **67 + 44 = 111** functions carrying
`X` / `XAt` / `XTy` / `XK` / `XArm` / `XGo` / `XRow` suffixes.

*This is a language finding, not an emitter one* — the fix is default parameter values, which
the front end owns. Recording it here with the count so the emitter's share of the cost is
visible: the wrappers are cheap individually, and 100 of them is a naming surface nobody can
hold in their head.

---

## 7 · Oversized functions

The ten longest, with the seam each has and what a split buys. No split is proposed for its own
sake; where the answer is "nothing", it says so.

| # | function | lines | natural seam | worth splitting? |
|---|---|---:|---|---|
| 1 | `wasmEmit.vl:21240 emitCoalesce` | 867 | the lhs *shape* dispatch (re-associate, `nulnone`, narrow-excludes-null, map-get fusion) is lines 21245–21335; everything after is a **rep** ladder — `nulbool`, litunion niche, nullable collection, `string \| null`, nullable struct/variant, union box, call-lhs stash | yes: `emitCoalesceShape` + one `emitCoalesceNiche<rep>` per rep. The shared `br_on_non_null` core already exists at `:21190` (`emitCoalesceNulRefCtx`), so the split is mostly moving arms |
| 2 | `wasmEmit.vl:14082 emitAssign` | 707 | three target arms — `Ident` (277 lines), `Index` (208), `Member` (213) | yes, and it is nearly free: `emitAssignIdent` / `emitAssignIndex` / `emitAssignMember`. The `Ident` arm splits again at local-vs-global |
| 3 | `emit_collect.vl:4780 collectA` | 678 | a pass over statement kinds | not obviously — it is a single pass and its length is its coverage |
| 4 | `emit_mono.vl:2885 monoMakeInstance` | 638 | signature keying, body cloning, pin application | maybe; grade any split on `mono-tyaram-grid.sh` |
| 5 | `wasmEmit.vl:5997 emitArr` | 604 | the element-rep dispatch | yes, same shape as #1 |
| 6 | `emit_sections.vl:4470 emitTypeSection` | 567 | one block per WasmGC type family | yes: the blocks are already comment-separated and independent |
| 7 | `wasmEmit.vl:13353 emitCall` | 503 | intrinsic vs member vs direct vs indirect | yes |
| 8 | `emit_bytes.vl:1369 fbEmitLocalsVec` | 454 | one block per scratch frame | see §7.1 — the split that pays is the three-way one, not this function alone |
| 9 | `wasmEmit.vl:3511 emitUnionCoerce` | 445 | source-rep ladder | yes, same shape as #1 |
| 10 | `wasmEmit.vl:16654 emitReturnValue` | 406 | the seed block (20 `pending*` writes) then the delivery ladder | the seed block goes to §6.1's shared resolver; the rest stays |

### 7.1 One frame layout, three hand-written walks

`emit_bytes.vl:1075 fbBeginFunc` (188 lines) computes every scratch frame's **base**;
`:1332 fbLocalsCount` (35) counts the **runs**; `:1369 fbEmitLocalsVec` (454) **emits** them.
677 lines walking one layout in one order, three times.

`fbLocalsCount`'s header says it is *"DERIVED from the same `fnUses*` flags + `fnRefPushSlots`
that drove `fbBeginFunc`, so it cannot desync from the actual layout."* It is not derived — it
is a parallel hand-written list. Extracting each function's flag sequence (§9, `frames.py`)
gives 32 / 30 / 33 entries; the three agree today, and the only structural difference is
`fnUsesNulStrPush`, which appears in `fbEmitLocalsVec` alone and selects the *nullability* of a
run rather than adding one.

*Why it matters, precisely.* A **count** disagreement between `fbLocalsCount` and
`fbEmitLocalsVec` gives an invalid locals vector — the engine refuses, loudly. A **base**
disagreement between `fbBeginFunc` and `fbEmitLocalsVec` gives valid wasm reading the wrong
slot of the same valtype: silent, and clause-1. The three-way hand-maintenance is where that
comes from.

*Change.* One frame descriptor list — `(condition, slot count, run emitter)` per frame, in
layout order — walked three times by `fbBeginFunc`, `fbLocalsCount` and `fbEmitLocalsVec`.
*Size* M–L. *Risk* med. *Proof*: byte-identical seed is the whole argument; then disassemble
one function per frame family with `./node_modules/.bin/wasm-dis` and compare the locals
vector, because byte-identity over the compiler's own source only exercises the frames the
compiler itself uses.

---

## 8 · Dead, vestigial, and stale

### 8.1 Fourteen exported emitter functions have no reference anywhere in the tree

Searched over `compiler/*.vl`, `std/*.vl`, `tests/**`, `lsp/src/*.ts`, `scripts/**` (§9,
`unused2.py`). Of **1,322** exported emitter functions, these 14 appear exactly once — their
own declaration:

```
emit_base.vl:104   ulebToArr                    emit_classify.vl:5001   mvValArmSigOf
emit_base.vl:121   slebToArr                    emit_classify.vl:13124  blockTailIfHasEmptyArm
emit_base.vl:1796  nameIsNestedUnionElemArray   emit_classify.vl:24855  unionRowOfAB
emit_base.vl:2420  nameIsStructWithMapField     emit_classify.vl:25152  unionHasAtomOfTy
emit_bytes.vl:546  fbI64Eq                      emit_classify.vl:25158  unMemHasAtomTy
emit_rep.vl:3402   repTreeChildOf               emit_rep.vl:3413        repTreeKidAt
emit_rep.vl:3407   repTreeKidCountOf            emit_rep.vl:3422        repTreeReasonOf
```

`blockTailIfHasEmptyArm` additionally keeps a private helper alive
(`blockTailIfHasEmptyArmStmt`, `emit_classify.vl:13142`), so deleting it takes two functions.
The four `repTree*` accessors are a complete unused read API over one table.

*Why the lint does not see them.* `unused-function` (`compiler/lint.vl:1682`) skips exported
declarations by design — *"an exported one is public surface."* For `std/` that is right. For
`compiler/`, whose only consumer is `compiler/`, it is a blind spot the size of the export
list.

*Change.* A fourth ratchet on the pattern of the existing three: a
`scripts/dead-export-budget.py --check` over the compiler module graph, with a committed
baseline that may only fall, and `--why` naming what left. `lint-self.sh` already resolves the
whole module graph for a single-file `vl check`, so a `lint.vl` rule is also possible — but the
script is the cheaper first cut and matches the shape the tree already runs three of.
*Size* S. *Risk* none. *Proof*: the seed must be byte-identical after the 14 deletions (dead
code emits nothing); the ratchet's own `--check`.

### 8.2 456 of 527 emit refusal sites have a message that appears nowhere under `tests/`

Balanced-paren extraction of every `emitFail`/`emitFailAt` argument (§9, `msgs.py`) gives
**527** sites today — `wasmEmit.vl` 438, `emit_collect.vl` 27, `emit_bytes.vl` 21,
`emit_sections.vl` 17, `emit_mono.vl` 13, `emit_classify.vl` 9 — or **525** on the reachability
survey's own rule, which also excludes the two calls the definitions make to each other. That
is +21 over the survey's **504** in two days.

Of those 527, the message literal appears verbatim somewhere under `tests/` for **71**;
**456** have no appearance at all.

*Read this carefully.* It is a coverage measure, not a defect count. The reachability survey
puts ≈187–328 sites reachable by a `vl check`-clean program, so the untested-and-reachable set
is roughly **120–260**, and the rest are floors no program can reach. `tests/cases/**` carries
**86 files with an `@emit-error` directive over 78 distinct texts** (60 / 42 when the survey
was written), which is the growing half.

*Change.* None proposed as a batch — a fixture for an unreachable floor is worse than none.
What is worth doing is making the ratio visible: the survey's §1.4 method (match `@emit-error`
texts back to templates by longest common substring) is a 40-line script, and running it in
`gate.sh` would turn "456 untested" into a number that moves.

### 8.3 `nodeChildren`'s silent default is right, and says so nowhere

`compiler/ast.vl:1684` covers 25 of the 37 `Node` kinds and falls through to an empty list. It
is the 2nd-widest silent ladder in the tree by arm count (`ladder-census.py`), and every
generic walker in the emitter depends on it — `dsScopeWalk`, `drwWalk`, `alcWalk`,
`strAccWalk`, `dstPinSynthWalk`, `extents.vl`, seven walkers in `lint.vl`.

The 12 missing arms are `NumLit`, `StrLit`, `CharLit`, `BoolLit`, `NullLit`, `Ident`,
`ErrExpr`, `TypeRef`, `BreakStmt`, `ContinueStmt`, `UnionDecl`, `ImportDecl` — checked against
their `ast.vl` declarations, **every one is a genuine leaf**: no `i32` field of any of them
holds an arena index (`ImportDecl.impNameToks` holds token indices, `UnionDecl.udVariants`
strings).

*Change.* Name the default: a closing arm listing the leaf kinds, or a comment stating the
invariant and where it is checked. This is one of the 441 ratcheted silent ladders and one of
the cheapest to retire. *Size* XS. *Risk* none. *Proof*: byte-identical seed;
`ladder-budget.py --check` falls by one.

### 8.4 `scripts/emitter-state-audit.py` reports 19 frame-flag asymmetries where 2 are real

The script hard-codes `FRAME = {"emitFuncCode", "startFnDetectScratch"}` (line 74) and asks
which `fnUses*` flags each writes. D1595 **split** the start-fn builder: the resets moved to
`startFnDetectFrames` (`emit_sections.vl:1295–1336`) so the sweep could be re-run per bias, and
two more live in `emitStartFnCode` (`:1570–1571`). The script sees none of them.

Checked flag by flag: of the 19 it reports asymmetric, **15** are reset in
`startFnDetectFrames`, **2** in `emitStartFnCode`, and **2** are genuinely unreset —
`fnUsesU8Push` and `fnUsesMapVals`, which are D1006 and D1007, both still open and both pinned
by `tests/vl_instance_state_leak_test.ts`'s `OPEN_LEAKS`. The duplicated lines those rows name
as the tell are still there: `emit_sections.vl:782/783` and `:804/805`.

`docs/internals/emitter-module-state.md` quotes the script's 2026-09-01 output (445 mutables,
80 never-cleared, "four" asymmetric). Today it prints **532 · 162 · 153 · 44 · 78 · 95** and
"19 of 25 asymmetric".

*Change.* Make the script find the frame builders rather than name them — walk the callees of
`emitFuncCode` and of `emitStartFnCode` one level deep — and re-run the doc's table.
*Size* XS. *Risk* none. *Proof*: the script's own output; the two survivors must be exactly
D1006 and D1007.

### 8.5 A delivery position D965 did not wire

`emitRefListWidenSite` and `emitScalarListWidenSite` (`wasmEmit.vl:16297` / `:16324`) are wired
as a pair at eight boundaries. Two are unpaired: `wasmEmit.vl:8034` (the **map-value store**)
wires the ref site and not the scalar dual, and `wasmEmit.vl:14215` (the global-assignment arm)
wires the scalar dual only.

Graded on this checkout's seed:

```
const xs = [1, 2]
const m: {[string]: f64[]} = Map()
m["k"] = xs
// vl run -> type error at 3:9, "...no element-converting copy exists"
```

So the missing wiring sits behind a live checker gate (`typecheck.vl:15052`, one of the 22
`--sites` literals) and is a clause-2 capability gap, not a clause-1 hole. That is the order
CLAUDE.md prescribes — build the lowering, wire every delivery, then narrow the gate — with the
map-value delivery still owed.

*Change.* Not a refactor: a capability item. The instrument that settles the position matrix
is `scripts/capability-probes/matrix.py`, and there is **no** `element-widening-copy.matrix.vl`
template today (only the single probe `scripts/capability-probes/element-widening-copy.vl`).
Writing that template is the first step and is worth more than the wiring, because it is what
finds the next unwired position. *Size* M. *Risk* high — this is exactly the D965 shape.
*Proof*: `matrix.py --before/--after`, 0 `runs → not-runs` and 0 `SILENT`.

---

## 9 · What I measured and how

Environment: worktree at `facb9f610`, seed rebuilt with `bash scripts/refresh-compiler.sh`
(2,143,263 bytes; `scripts/seed-size.py --check` reports +1.8% over the committed baseline, a
pass). Box load 35 during the profile. `VL_STD` pinned to the worktree's `std/` on every native
probe.

**Ratchets and scoreboards** (their output is quoted in §2):

```sh
python3 scripts/scan-budget.py --check ; python3 scripts/scan-budget.py
python3 scripts/ladder-budget.py --check ; python3 scripts/ladder-budget.py ; python3 scripts/ladder-budget.py --why
python3 scripts/ladder-census.py ; python3 scripts/ladder-census.py --sets
python3 scripts/sentinel-budget.py --check ; python3 scripts/sentinel-budget.py ; python3 scripts/sentinel-census.py
python3 scripts/goal-scoreboard.py --sites
python3 scripts/emitter-state-audit.py
python3 scripts/seed-size.py --check
```

**Profile** (§5's every number):

```sh
vl build compiler/entry.vl -o names.wasm --names --compiler build/vl-compiler.wasm
VL_STD=$PWD/std VL_PROFILE_GUEST=p.json vl build compiler/entry.vl -o o.wasm --compiler names.wasm
python3 scripts/profile-rank.py p.json 600            # 10,794 samples
```

Two ten-line helpers on top of `profile-rank.py`'s parsing, both re-derivable from its
`stackTable` walk: one printing the immediate PARENT of every sample whose *leaf* is a given
frame (used for `__str_eq__` and `nodeChildren`), and one printing the immediate CALLER of the
shallowest occurrence of a frame anywhere on the stack (used for `letRefListDestSlot`,
`listOpKindOf`, `letUnionNameOf`). The second is what shows that `letListBuildKind` and
`letListBuildSlot` are the only two callers and split the subtree 1,758 / 1,790.

**Structural scans.** Five short scripts, each a single pass over `compiler/*.vl` with a
brace-depth function splitter that only starts counting after the first `{` (a multi-line
signature otherwise closes the function on its first line — that bug hid `monoMakeInstance`
from the first run of the length census):

* *function lengths* — 2,751 functions, median 12, 128 over 100 lines, 39 over 200.
* *structural near-duplicates* — normalise every identifier to `X`, every number to `N`, every
  string to `S`, hash the token stream, group. §4.1, §4.2, §4.6 are its output.
* *repeated ladders* — functions calling ≥4 of the seven `expr*Array` classifiers (§6.2).
* *dead exports* — tokenize every file under `compiler/`, `std/`, `tests/`, `lsp/src/`,
  `scripts/` once into an identifier Counter, then look up each of the 1,322 emitter exports
  (§8.1). The naive per-name regex over the same corpus does not finish in two minutes; the
  Counter version is instant.
* *`emitFail` sites* — balanced-paren extraction of the first argument, with the two
  definitions excluded by enclosing-function name, then a verbatim substring test of each
  ≥20-character literal against the concatenated `tests/` tree (§8.2).

**Counting by hand, and the two places it was wrong before the scripts.** The `emitFail`
population is 525 excluding the two definitions' own internal calls and 527 including them —
say which. The type-string parse count (§6.4) excludes comment lines and the parsers' own
declarations; the raw textual count is 20–25% higher, which is the same "a line is not a
message" trap one level over.

**§5.3 re-measured at `7a733ea6b`** (2026-09-05, after #2567), because a profile ranks cost
and cannot say whether a bigger cache would avoid it:

```sh
python3 scripts/perf/parent-let-cache-probe.py     # asks, rebuilds, LRU 2..128, unbounded
```

It patches counters into `emit_base.vl`, reports them through `emitFail` at the foot of
`emitProgram` (the compiler module is instantiated with an EMPTY linker, so `print` has no
import to reach), builds that compiler to a scratch path and reverts the patch *before* the
measuring build runs — so the instrumented bytes can never become anyone's seed. A moved
anchor is a loud refusal that writes nothing; the control for that is in §5.3's own numbers
being reproducible on demand. The walk count (32 roots, 144,826 `dsRebindsName` calls) came
from the same instrument with one extra counter at `dsScopeWalk`'s entry, not committed.

**Witnesses run** (verbatim, on this checkout's seed): the map-value scalar widen program in
§8.5. One further probe was written for a global-assignment ref widen and is **not** reported:
it used structural width subtyping rather than an interned ref-list pair, so it exercised a
different refusal and says nothing about the position it was meant to test.

**Not run:** the full census (a discovery instrument, forbidden by the brief) and `gate.sh`.
No proposed change was built: every "proof" column states what such a compile would have to
show. The one compile of modified compiler source in this document is §5.3's counter probe,
which changes no behaviour, is reverted by the script that applies it and never reaches
`build/`.
