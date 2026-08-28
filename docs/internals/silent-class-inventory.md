# Silent-class inventory — a measured rebuild of the queue

Every row below was produced by generating a program, running it, and grading the **run
value** against an expectation computed independently of the compiler. Nothing here is
inherited from an earlier filing. Where an earlier filing is contradicted, the
contradiction is stated in "Not a defect".

The sweep is reproducible: `scripts/silent-sweep/gen.py` (main grid), `genorder.py`
(declaration-order grid), `sabotage.py` (grader proof), `sweep.sh` (bounded runner, four
concurrent `vl` invocations), `grade.py` (classifier), `counts.py` / `pivot.py` (tallies).

---

## RE-MEASURED 2026-08-25 — READ THIS BEFORE SCHEDULING FROM ANY ROW BELOW

The whole sweep was regenerated and re-run against master `fb7900e7`, and the grader was
re-validated first (`sabotage.py` → 12 wrong_value / 8 wrong_evalcount / 6 trap / 4
correct, exactly as published). **The queue below is substantially stale, in one
direction: fixed rows still read as live.**

| | as filed | 2026-08-25 | end of 2026-08-25 |
|---|---|---|---|
| check-clean **silently wrong value** | 2 | **0** | **0** |
| check-clean **wrong evaluation count** | 4 | **0** | **0** |
| **compiler trap** (no diagnostic, no module) | 4 | **0** | **0** |
| check-clean **invalid wasm** | 97 | **23** | **0** |
| **SILENT TOTAL** | **107** / 9,345 (1.14%) | **23** / 9,126 (0.25%) | **0** / 9,126 |

The third column is after the day's four fixes (#1921 closure slot reps, #1922 D16, #1924
D7, and D6); the before/after for the last two is the table in "SILENT TOTAL 6 → 0" below.

Declaration-order grid: **0 silent** (was D1's family). The two categories that produce a
WRONG ANSWER rather than a failure are now **zero** — every survivor is invalid wasm, which
is loud at load.

*(Cell counts differ because the generator now skips more unreachable combinations, so this
is not a cell-for-cell delta.)*

**Per-row verdict, from `scripts/check-filed-witnesses.py` — which runs each row's OWN filed
repro rather than a paraphrase:**

| row | filed | today |
|---|---|---|
| D1 D2 D3 D4 D5 D8 D10 D11 | various | **runs — CLOSED** |
| D16 D7 D6 | check-clean invalid wasm | **runs — CLOSED 2026-08-25** (below) |
| D17 D18 | check-clean invalid wasm | **runs — CLOSED 2026-08-25** (below; one root, one change) |
| D14 | loud emit reject | **runs — CLOSED 2026-08-25** (below) |
| D9 | loud emit reject | **runs — CLOSED 2026-08-25** (below; 144 cells, `loud emit reject → correct`, nothing moved the other way) |
| D13 | loud emit reject | **runs — CLOSED 2026-08-25** (below, with the literal-union boundary class) |
| D12 D15 | loud emit reject | **runs — CLOSED 2026-08-25** (below; two roots, not one — grouped only as diagnostic-quality work of the same size) |
| D19 | check-clean invalid wasm (mis-graded; it LOADS then traps) | **runs — CLOSED 2026-08-26** (below, with the scope axis that measured the whole class: 38 silent cells, all module scope) |
| D20 | loud emit reject | **NEW 2026-08-25** — filed while closing D14. Its `capture` leg WAS D9 and is closed; **264 cells remain** at `loopvar` + `mapval`, and the repro is re-filed on `loopvar`. Three legs, three sites — proven by D9's fix reaching exactly one |
| D21 | loud emit reject | **NEW 2026-08-25** — filed while closing D9: the one capture BINDING FORM its fix does not reach (an un-annotated local), 168 of a 728-cell population, flat across every rep |
| D22 D23 D24 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the `nulvariant` CALL-BOUNDARY class. THREE roots at three layers, separated by an ABLATION and not by argument — a missing BOX, a misplaced one failing in the opposite direction at the same seam, and the monomorphizer's pin a whole layer earlier) |
| D25 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the ruling is in `DECISIONS.md`. The row named ONE cell and a 187-cell grid found **53**: neither filed option won — the argument-node channel moved 6 cells loud→silent, the annotation channel left 8. Two rungs, 0 silent) |
| D26 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; NOT the heap-type twin the filing named. `letInitReboxesToVariant` read a VARIANT index through the STRUCT table, and its `< sHeapIdx.length` test was a BOUNDS check standing in for a namespace check — it only ever declined while the struct table was EMPTY. Guard retired; 32 of 240 grid cells moved, all forward, and 1,832 corpus files emit byte-identically) |
| D27 D28 D29 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; ONE root — `fnAssignKindGuard`, a five-entry decline list whose `null` restored the caller's `i32` default. Four of its five recorded reasons were false and the fifth named a condition that was already available. The guard is deleted; 220 cells of three grids moved, every one forward) |
| D30 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the call site was asking a DIFFERENT question than the callee and now asks the callee's own — `fnRetMapShapeAt` → `inferredRetMapSlot`. The recursion the row filed as a blocker is GUARDED, not avoided: its unguarded symptom is a compiler HANG, not a trap, and the answer on re-entry is the checker's recorded type rather than the mono map, which is what keeps the self-referential case fixed too. 1,215 grid cells, 383 moved, none backward) |
| D32 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; `rlElemStructRow`'s canon-key rung declines for a name the variant table claims — the exact complement of the gate `exprVariantIndex`'s `Index` arm had carried all along. 140 of 480 grid cells moved, none backward) |
| D33 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the SAME complement one rung up and read through the ARENA rather than the NAME table. `shapeNominalOfTy` had four rungs and only ONE was nominal by construction; `variantRowOfTy` — arm-DECLARATION identity — was written, correct, and unasked, so two STRUCTURAL field-set scans decided a nominal question and a layout twin is claimed by both. 34 of 360 grid cells moved, 28 from silent and **6 from LOUD** — `std:array`'s last live carve-out, retired by the same predicate — and 0 backward) |
| D34 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the mv layer holds only a RENDER of the value type, and `tyToEmitName` spells a declared arm `{r:i32}` — so #1942's NAME gate cannot fire and #1944's `variantRowOfTy` correctly declines a re-resolved render. The fix CARRIES the nominal channel from the annotation node as an ARM-ONLY hint; everything downstream was a pairing whose STRUCT half already existed, `exprNullableVariant`'s missing map rung included. 36 of 300 grid cells moved, 30 to `runs` and 6 silent→LOUD, 0 backward. The filed read-dependence was mis-attributed and the retirement says how) |
| D35 | check-clean invalid wasm | **NEW 2026-08-26** — filed from D33's grid, and it is `std:array`'s ONE live carve-out: a `needle: T` at a LIST type whose element is a struct. The same `==` written DIRECTLY is a LOUD checker error, so the refusal is LOST in the instantiation rather than missing. All four `needle` exports; no union, no twin |
| D36 D38 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; ONE root, and the grid is what says so. Three classifiers that must agree ARM FOR ARM each carried their own un-gated `objVariantName` field-set scan, so an ANONYMOUS `{r: n}` matched a union arm structurally and the arms WIDENED it to the whole union — a kind-2 BOX list under a reader that unboxes. `arrLitBoxElemName`, which asks the ARENA whether the CHECKER recorded a union element, was written for `collectU` and had no caller on this path. 37 of 900 grid cells moved, 28 from silent and 9 from LOUD, none backward) |
| D39 D40 D41 | check-clean invalid wasm (D40: loud after #1948) | **runs — CLOSED 2026-08-26** (below; THREE INDEPENDENT ROOTS, and an ABLATION is what says so rather than the resemblance — one compiler per candidate fix over one 480-cell grid, moved sets PAIRWISE DISJOINT: the alias hop 40, the array-element rung 60, the return-annotation pin 16, and 12 more needing TWO of them. D41's root is a lookup that stops one hop short in a pass where no local is collected yet; D40's is a first-element SYNTAX probe with no arena rung, so an IDENT or CALL element fell to the i32 list; D39's is the ONE row in this family whose complement was NOT already written — an anonymous shape's two nominal claimants are separated only by the CONTEXT, so the return annotation had to be CARRIED to the local rather than re-derived. 132 of 480 cells moved, 0 backward; silent 63 → 20 and loud 137 → 52) |
| D65 D66 | loud emit reject / check-clean invalid wasm | **CLOSED 2026-08-26 by D40's fix, one commit after they were filed** (below; D65's own row says what was owed — *"the channel is the checker's recorded type on the array-literal node (`arrLitArenaElemRow`, which already exists), not a spelling"* — and that is `arrLitNominalElemName`. D66 moves silent → LOUD and stops being a `std:array` carve-out, because its direct spelling is the SAME refusal) |
| D51 D52 D53 | — | **NEW 2026-08-26** — three rows the D39/D40/D41 grid produced. D51: an un-annotated function returning a bare struct-shaped local with no `sNames` row is `emitProgram: ref valtype with no interned shape` — the returned-local rung has a struct arm and no VARIANT fall-through (34 of the grid's 72 residue cells, LOUD on master and branch, and 4 of them moved silent → loud in this change). D52: a local ANNOTATED at a union ARM, returned from an un-annotated function beside an exact layout TWIN — check-clean invalid wasm, 16 of the 20 remaining silent cells, and it is the new `INVALID_MODULE_SRC`. D53: an INLINE-SHAPE parameter in a program that also declares a struct of that layout is `emitProgram: ref valtype with no interned shape` — LOUD on both, and unrelated to the rows above |
| D37 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; ONE ARM, and its complement is three lines up in the same function — `monoStructAnnName` has had both a BARE and a LIST rung since it was written, and D23's union-arm arm took only the bare one, so `Circle[]` had no home and the cascade's `"i32"` catch-all claimed it. The filed "EMPTY seed" axis is REFUTED by its own cross product: the trigger is the ANNOTATION, flat across empty / literal / call-result seeds and absent from both un-annotated ones. 12 of 120 grid cells moved, all to `runs`) |
| D47 D48 D49 D50 | — | **NEW 2026-08-26** — four rows the D34/D37 grids and the census produced (renumbered from D39-D47 when #1945 landed first and took those three). D47: the INLINE map-annotation spelling of an arm-valued map keeps the LOUD `-3` floor while the ALIAS spelling now lowers. D48: an arm-valued map and a layout-TWIN struct-valued map in ONE program share a single mv slot (silent, master and branch). D49: `type C = Circle[]` — the array-ALIAS spelling of an arm-element list — is check-clean invalid wasm where the direct `Circle[]` spelling runs (silent, master and branch) — **CLOSED 2026-08-26**, see its own line below. D50: a `for` loop over an arm-valued container binds no variant loop var — LOUD on both, list and map spellings alike |
| D49 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; the complement is a RENDERER, not a predicate. `singleAliasMemberTyIx`'s array arm was gated on `arrSpineIsScalar`, whose own header says it is "the exact condition under which `tyToEmitName` renders the type name-faithfully" — a property of the renderer. `tyToNominalName` is that renderer's name-faithful twin, already written, already documented correct, and with **no consumer in emitted output at all**. 240 of 910 grid cells moved, 44 out of silent (22 to `runs`, 22 to LOUD) and 174 loud→`runs`; **0 `correct` cells moved anywhere**, and every one of the 218 is an ALIAS cell — no `direct` / `inline` / `inferred` cell moves. Ten cells go LOUD→silent and all ten land EXACTLY on their alias-free control's MASTER verdict, which is the alias ceasing to be a dialect rather than acquiring one; the two shapes they land in are filed as D63 and D64) |
| D48 | check-clean invalid wasm | **STILL OPEN 2026-08-26** — re-measured, and its witness module is **byte-identical** under this change. One candidate fix was built and REFUTED by ablation (below): parity at the slot-identity FIND separates the two slots and the downstream heap wiring does not follow — the failure moves from `mkD` to `mkC` and a two-ARM control that runs on master becomes invalid wasm. A sibling one container over is filed as D64 |
| D47 D50 | loud emit reject | **runs — CLOSED 2026-08-26** (below; TWO ROOTS, and the ablation says so — one compiler per candidate over one 1,024-cell grid, moved sets **PAIRWISE DISJOINT** at the outcome level (D50 160, D47 180, intersection **0**) with **34 further cells needing BOTH**, every one of them a `mapval` x `for`-in. D50's complement was already written as two REFUSALS, one per container, in `forInRefArrayStructIdx`; D47 is D-ALIASMAP — the INLINE spelling hands the mv layer the arm's NAME and the ALIAS hands it `tyToEmitName`'s structural render, so the two key different rungs and only one resolves. 374 of 1,024 cells moved, **365 to `runs`**, **0 `correct` cells moved anywhere**; 9 go LOUD→silent and every one has a ONE-AXIS control already holding that exact verdict on master. **THE TRADE, NAMED RATHER THAN ABSORBED.** This change moves 365 cells to `runs` and takes
the SILENT total from 9 to 18, i.e. the inventory from three silent rows to five. Both are
true and the second is movement against the metric that matters most, so it was measured
rather than argued: **holding those 9 loud was built as its own compiler and REFUSED by the
grid.** A floor on the shape costs 28 working programs, 6 of them `correct` on master today,
and still leaks 4 of the 9 — the numbers and the reason are on D93. D94's is not separable
at all: its `index` sibling reaches the same defect on master with no `for` in the program,
so D50's rung was masking that row rather than guarding it. Parity does not by itself say
which direction to converge; what says it here is that every available floor is a bigger
dialect (an unused `type Dot = {r:i32}` deciding whether a program compiles) than the one it
removes.

**ARM-NESS IS NO LONGER OBSERVABLE AT ANY COORDINATE THAT HAS AN ARM-FREE CONTROL** — the
grid's cleanest statement of the result. Graded against the `plain` leg coordinate by
coordinate (same container / spelling / construct / pairing / order, `Circle` simply not a
union member): on master the three arm legs differ from their control on **93 / 84 / 93** of
their 192 shared coordinates; on the branch, **0 / 0 / 0**. The `plain` leg itself is
UNCHANGED (171 `correct` / 21 loud / 0 silent, master and branch), which is the negative
control — and stronger than outcome parity: all **171** of its cells that emit a module at
all are **BYTE-IDENTICAL** under master and the branch (0 differ; the other 21 emit no module
on either side, and are the container limits `nested arrays are not supported` and the
nested-map `for`-in). A program with no union arm in it compiles to the same bytes it did.
Every residual failure sits at one of the 128 pairing=1 coordinates that have no
arm-free control by construction — a layout twin has to be declared for them to exist at all
— i.e. exactly D93/D94's territory. The composition is invisible to an outcome-class grader
and a MESSAGE diff is what exposes it: D47 alone leaves those 34 cells in the same column, and their message changes from `unsupported map value type` to D50's own `field access receiver is not a struct` / `field access but no struct type declared` — the set of message-movers-that-FULL-makes-`correct` is SET-IDENTICAL to the 34) |
| D88 D100 | check-clean invalid wasm / loud emit reject | **runs — CLOSED 2026-08-26** (below; TWO roots, and the ablation says so — 24 cells and 18 cells, pairwise intersection **0**, and the union of the singles is SET-IDENTICAL to the full branch on a 2,850-cell grid. Both fixes are a complement that was already written. D88: `monoArgTyName` pinned a generic's parameter from `nodeTyMapName`, whose renderer spells a declared union ARM STRUCTURALLY, so the clone's annotation named a fresh anonymous arena index and `collectA` minted a SECOND mv slot for one map; `shapeNominalOfTy` already recurses through `TyArray` for a LIST element and the MAP was the one container it never grew. D100: filed as D39's CHANNEL case, and the measurement its own row named and did not take REFUTES that — `repStructSlotsTwin(Circle, Dot)` is 1, so the two "claimants" are ONE heap type and `repSlotOfTy`'s bridge was asking for a unique ROW where soundness needs a unique HEAP TYPE. **The 9,450-cell D52 grid goes 50 silent → 0**, the first time that population has been empty; the 3,144-cell D75/D82 grid moves 0 cells; corpus byte-identical bar the two graduated fixtures) |
| D93 D94 | ~~check-clean invalid wasm~~ **CLOSED 2026-08-27** | **NEW 2026-08-26** — two rows the D47/D50 grid produced, both PRE-EXISTING on master and both the layout-twin collapse one container further out than D48/D64 reached. D93: a NESTED arm-valued map (`{[string]: {[string]: Circle}}`) beside its layout twin — silent on master at the ALIAS spelling, and D47's convergence brings the other three spellings to the same verdict. D94: a struct literal bound with NO annotation, beside two layout-twin declared rows whose FIELD elements differ in arm-ness — silent on master at 5 of its 6 cells |
| D31 | check-clean invalid wasm | **runs — CLOSED 2026-08-26** (below; filed while closing D25, whose fix routes a corpus control onto it. A call ARGUMENT inherited the enclosing RETURN's nullable expectation — `expCtxHere()` snapshots the ambient seeds and the four nullable ones were never cleared. NO generics anywhere) |
| D52 D66 | check-clean invalid wasm / loud emit reject | **runs — CLOSED 2026-08-26** (below; D52 is D39's seam read from the other end and it needed NO channel — the annotation is on the LOCAL, `criRetLocalLet` already hands the result-valtype pass that binding, and `letAnnVariantIdx` was written, exported and documented correct with no caller on this path. What was missing is the ROUTE: `fRetKind` had no inferred `"variant"` tier and `emitOneFuncType`'s inferred `infSlot` ladder had no `variant` arm — the three items D51's row predicted in writing. A FOURTH edit was needed and the disassembly is what found it: with only the functype corrected, `mk` validated and the CALLER did not (`struct.get 0 0` over a `(ref 1)` receiver), so the engine's message moved function and changed one word. 180 of a 9,450-cell grid moved, 0 backward — 84 silent → runs and 96 loud → runs; silent 200 → 116. Corpus: 1,850 of 1,851 co-emitted files byte-identical, the one difference being D52's own pin. D66 rides the same rung and its filed asymmetry — "annotate the CALLBACK'S RETURN; annotating the local does not" — is retired) |
| D111 D117 | loud emit reject | **runs — CLOSED 2026-08-27** (below; TWO roots and THREE edits, and the ablation says so — one compiler per candidate over one 1,710-cell grid, all three pairwise intersections **0**. Both roots are a complement already written and never called at the sibling rung. D111 needs TWO of the edits and the ORDER is measured: `letAnnIsUninternedShape`'s D53 bridge ALONE moves 16 cells to `runs` and **8 BACKWARD to check-clean invalid wasm**, because the lifted guard makes the binding a struct local whose row disagrees with the pin `monoAnnPinName` mints — that ladder had a `{…}[]` ELEMENT rung and no BARE inline-shape rung, so the argument fell to the `"i32"` catch-all. Disassembled: with the guard alone the instance is `(func (param i32) (result i32))` and `mk` `return_call`s into it from a `(result (ref 0))` frame. The pin rung alone moves 8 (`ann2` x `global` x `gen`, a MODULE-SCOPE binding where the `LetDecl`-local guard never fires). **The union of the three singles' moved sets IS set-identical to the full branch's (8 + 24 + 40 = 72) — the composition is a DIRECTION, not a cell count**, and that is the thing a union check does not say on its own: the full branch disagrees with the guard-alone compiler on exactly the 8 cells that compiler sends to `invalid_wasm`, every one of them `ann1` x `local` x `gen`. D117: `recordElemRepArrayLit` sits ABOVE `assignableExpr`'s `assignable` short-circuit precisely because a niche-element literal is covariantly assignable, and it already descends into an ObjLit's FIELD values — the ARRAY destination never grew the matching ELEMENT-wise descent, so an inner `[null]` kept its self-inferred `null[]` and every niche seed in the null-rep table stayed empty. 40 cells, and it is the three NICHES only: `(i32 | null)[][]` and `(S | null)[][]` already ran. **72 of 1,710 cells moved, all `loud emit reject` → `runs`, 0 backward, 0 same-class MESSAGE moves, 0 `runs`→`runs` value moves.** The 9,450-cell D52 grid moves **196 more cells to `runs`, 0 backward**, and keeps its silent population at 0; the 3,144-cell D75/D81/D82 grid moves **0** cells and 0 messages, so the change is inert where it is not the answer. **Every number here is the RE-MEASUREMENT on merged master `e67347aa`** — all five ablation compilers rebuilt on that base, not carried over from `7b600b57`; #1960 moves none of these 1,710 cells, and stripping all three patches out of the merged tree reproduces `e67347aa` BYTE-IDENTICALLY, which is what says the three are the whole compiler delta) |
| D123 D124 | check-clean invalid wasm | **runs — CLOSED 2026-08-27** (below; TWO roots and THREE edits, and an ABLATION says so where the resemblance could not — both rows are "one map layout, two mv slots", and their moved sets are disjoint on BOTH grids. D124's peel moves 49 of the 1,114 D112 cells and 0 of the 2,850 D88 cells; D123's pair moves 56 D88 cells and 0 D112 cells; pairwise intersection 0 each way and the union set-identical to the branch. **The ablation baseline is PROVEN rather than assumed**: stripping all three candidates out of the branch reproduces merged master `89d01c97` byte-for-byte at 1,452,441 bytes, and every number here is re-measured on that base with all five ablation compilers rebuilt on it — 0 cells differ from the pre-merge measurement, so #1962 moves none of this population. D124 is the rule already written in `nulRefMapValInnerOf`'s own header — a niche-nullable value shares its vals rep "and the heap dedup" with the non-null twin, and the mint honoured the first half while `repMapValSlotsTwin` keyed on an arena canon id that a `TyNullable` cannot share. **D123's TITLE AND REPRO ARE RE-FILED**: the filed mechanism (a missing `TyMap` rung in `shapeNominalOfTy`) explains none of its 100 cells — the mint never reaches a nominal question, `armTy=58 vrow=-1` — and the row's own witness turned out to be in the OTHER half of its population, now D139. What D123 is: `repMapValSlotsTwin`'s kind-1 arm asked D34's arm-identity PROXY for a question `rlSlotsLayoutTwin` answers directly one branch down, and then the value-row columns had to follow the merge through `mvCanonRepOf`. Comparator alone 8 cells, value-row read alone 0 (and 0 corpus bytes), together 56 — a COMPOSITION. The PAIRING axis is what sized the second rung: each cell passed alone and two in one file did not. 0 backward and 0 to a silent class on either grid; the 9,450-cell D52 and 3,144-cell D75/D81/D82 grids each move 0 and stay at 0 silent) |
| D139 | check-clean invalid wasm | **runs — CLOSED 2026-08-27** (below; ONE root, ONE caller. The channel diagnosis is CONFIRMED and the row's guess about the fix is REFUTED: the deciding annotation is a context an existing carrier already delivers — D81's `synthDstPinAnns` — and that pass walked `fnStmts` only, so a MODULE-scope binding never reached it. Probed at the mint, the module-scope program and its running function-scope sibling intern the SAME two mv slots over the SAME two ref-list rows and emit byte-identical type sections; the one column that differs is `letMapShapeOf`'s input, `letType=37` against `letType=-1`. The two heaps stay two — merging them is still wrong and `rlSlotsLayoutTwin` still declines. **Its own 36-cell binding-storage-class grid moves 3 (1 silent → runs, 2 loud → runs), 0 backward**; the D88/D100 and D112 grids move **0**, which is the finding rather than a null result — every cell of both builds the map as a function LOCAL, so neither could ever see this row. D52 (9,450), D75/D81/D82 (3,144), D111/D117 (1,710) and D131 (1,732) all re-graded: 0 moved, 0 backward, 0 silent. **The ablation base is PROVEN**: stripping the change out of the branch reproduces `54780e0b` byte-for-byte at 1,452,568 bytes. THREE MORE CANDIDATES WERE BUILT AND MEASURED AND ARE NOT IN THE COMMIT — see D156) |
| D155 | check-clean invalid wasm | **runs — CLOSED 2026-08-27** (below; ONE root, and the channel is D139's with the destination one SCOPE out rather than one hop. `mkm`'s result is un-annotated, so `dstPinRetDest` never runs and the four legs find nothing inside `mkm`: probed, `DPA let=18 name=c ret=-1 n=0` — not a WRONG destination, NO destination. The fix is one rung (`dstPinCalleeRetLet`: an ordinary call to an UN-ANNOTATED callee is transparent to the binding it hands back) plus `dstPinCallerDests`, the same `dstPinScan` over every OTHER function body and the module, gated on the binding being its own function's tail value — a DECLARED result answers -1 and is not a hop. **Its own 36-cell grid moves 3, all forward (1 silent→runs, 2 loud→runs), 0 backward**, plus 1 same-class MESSAGE move that is D163 showing through. **All six earlier grids re-graded at 0**: D52 (9,450), D75/D81/D82 (3,144), D88/D100 (2,850), D111/D117 (1,710), D131 (1,732), D112 (1,114). **The ablation base is PROVEN**: stripping all three candidates reproduces `1559d80c` byte-for-byte at 1,452,766. TWO MORE CANDIDATES (C1, C2) WERE BUILT AND MEASURED AND ARE NOT IN THE COMMIT — see D157: together they make that row's pin fire with the right name and still move 0 cells) |
| D156 D157 D158 D163 | check-clean invalid wasm | **NEW 2026-08-27** — D139's residue, split by MEASUREMENT rather than by resemblance: its filing lumped 44 D88 cells and 12 D112 cells under one row and the fix moved none of them. **D156 a NESTED arm-valued map — HALF-CLOSED 2026-08-27, its UNCONTESTED half (no declared layout twin) is `runs` and its contested half is D171**; D157 (the SPECIMEN) an element-preserving LIST conduit between the binding and its destination — RE-FILED with TWO roots, and "std" was the generator's spelling rather than the axis (a hand-written `rv<T>(xs: T[]): T[]` fails identically); **D158 the deciding annotation at the READ site — OPEN, ABLATED away from D156 as a second root, and the axis it needs now has a grid of its own (`scripts/silent-sweep/d156/`, 1,188 cells)**; **D163** the second root under D157 and the whole of 4 more cells — a LIST LITERAL keys its element row off the CHECKER's structural record, so an exact layout twin claims it through the struct table while the element expression's committed rep is the arm's |
| D171 D172 D173 | check-clean invalid wasm | **NEW 2026-08-27** — filed out of D156's ablation, and D156's own prescribed ORDER ("close the kind-6 twin first, then land the peel") is **REFUTED** by it: the arm/twin conflation the twin question would remove is LOAD-BEARING for every chain the pin cannot complete, so removing it first moves cells BACKWARD. Three rungs, three compilers, each measured alone. D171 the CONTESTED half of the peel (a half-pinned chain is worse than an un-pinned one); D172 an mv slot minted AFTER `mAssignTypeIndices`, so `mvMapTypeIdx` stays 0 and the map's `struct.new` names heap type 0; D173 the ref-list ELEMENT key conflating a union ARM with its declared layout twin one container out |
| D131 | ~~check-clean invalid wasm~~ **CLOSED 2026-08-27** | **runs — CLOSED 2026-08-27** (below; TWO roots, and the ablation says so — 120 cells and 240 cells on one 1,732-cell confirmation grid, pairwise intersection **0**, union SET-IDENTICAL to the full branch's 360, and every one of the 360 moves to `runs`. **The axis the row's four controls did NOT separate is the RECEIVER's storage class**: a PARAM, a module GLOBAL and a CALL result as the receiver of the same field read all RUN on master, and only a LOCAL does not — `exprNullableStruct`'s Member arm already classifies a code-15 read as the `(ref null $S)` it is, but resolves the receiver through `structIndexOfExpr`, whose Ident arm reads `declaredStructIndex`, a table `buildLocals` fills long after the GLOBAL return pass. Root two is the row's own SECOND sentence and it is receiver-BLIND: the RETURN is a kind-9 use site and the only one that never grew the `ref.as_non_null` a field access, a call ARGUMENT, an annotated `let` initializer and a nested-struct field STORE all emit — its control has no field read at all (`function pick(p: Circle | null, d: Circle): Circle { if p != null { return p } return d }` is check-clean invalid wasm on master). The whole 24-cell D111/D117 residue closes, under root ONE alone. D52's 9,450 cells and D87's 3,144 move **0**; corpus 2,312 files, **2** differ and both are the fixtures this change adds) |

| D181 | ~~check-clean invalid wasm~~ **CLOSED 2026-08-27** | **runs — CLOSED 2026-08-27** (below; the census's LARGEST single rescue family — 2,254 silent coordinates whose only one-step rescue is `claim=0`, all at `cont=list_of_map` — and **the row's own title is refuted**: the claimant COUNT is not the ingredient, an ARRAY-OF-MAP ALIAS BODY is, and the alias must be USED at a binding nobody READS for the failure to be silent rather than loud. ONE root, PATTERN ONE (the complement was already written): `singleAliasMemberTyIx`'s `TyArray` arm had a leaf test for a `TyPrim` and one for a declared struct and none for a MAP, so `collectU` minted the alias a one-variant union ROW and `isUName` claimed every alias-annotated cell for the `{tag, anyref}` box while the initializer lowered a list wrapper. The heap probe says no key and no channel were needed — the cell took the union box and the value the i32-list catch-all, and NEITHER was the list-of-map wrapper, so there was no pair of legitimate heaps to keep apart. A new 1,200-cell grid crosses `claim` with `annpat`, the axis the census holds constant across the whole family (`scripts/silent-sweep/d181/`): **592 move, all `check-clean invalid wasm` → `runs`, 0 backward, both loud columns unchanged**, silent 658 → 66, and the alias axis becomes INERT — 0 of 800 `claim>0`-vs-`claim=0` twin pairs differ afterwards, in message as well as class, against 592 before. A second candidate (the nominal render for a declared-struct map value) moves **0 cells on that grid** and is load-bearing on the 1,088-cell alias-vs-inline twin table, where the claim alone is +446 / **−3** and the pair is +447 / **0**; it is filed as D187. **The whole 250,238-cell census re-graded on both legs of merged master `e04b1567`: silent 15,183 → 10,701, all 4,482 moved cells `check-clean invalid wasm` → `runs`, 0 backward, both loud columns identical to the cell in every block — and all 2,254 cells of the `claim` family close, as do all 1,430 of `claim,cont`.**) |
| D187 D188 D189 | — | **NEW 2026-08-27** — filed out of D181's ablation and its census re-grade. **D187** a REFUTATION PIN: the array-of-map alias must render NOMINALLY, and the candidate it refuses (claim the map leaf, leave the renderer alone) was BUILT — it moves 0 cells on the 1,200-cell grid, and dropping it turns 3 twin-table cells from `runs` into a loud emit reject. **D188** the FOURTH array-spine leaf kind, an inline object shape, LOUD in all four positions where the direct spelling runs and at parity between master and the branch — with no silent form at all, because the assignability check refuses the empty literal before any emitter sees it. **D189** the `claim` axis firing FOR REAL — a second binding of the same list-of-map layout over a union arm with a declared twin, no alias anywhere — filed live off the `1e81b0f3` measurement and CLOSED BY #1969 before this branch could merge, so it ships as the REFUTATION PIN both fixes must hold |

**THE LARGEST REMAINING FAMILY WAS NOT IN THIS DOCUMENT — AND IT IS NOW CLOSED. SILENT
TOTAL 23 → 6.** 17 of the 23 were one unfiled shape, and the note that filed it named it
wrongly: it is NOT a nullable closure. `(i32) => i32 | null` binds the `|` INTO THE RETURN,
so every one of those cells carried a function RETURNING `i32 | null` — the parenthesised
nullable closure `((i32) => i32) | null` narrows and calls correctly at all seven positions
and always did (see §4d, whose 54-cell "probe error" is the loud half of the same spelling).

The real defect was rep invariance at a function SLOT. `v is (i32) => i32` over a
`v: (i32) => (i32 | null)` was gated on `assignable(tested, receiver)`, which accepts by
return covariance; the THEN branch then bound `v` at the unboxed-result type while the value
repped boxed, and the call emitted a `call_indirect` whose `(ref $box)` result met `print`'s
`i32` parameter. A closure carries no runtime type tag, so the narrow could never have been
true in the first place. `fnSlotAssignable` now enforces the invariance its own header had
stated since the numeric pair (`() => i32` must not reach a `() => i64` slot), and the same
rung closed three ASSIGNMENT-side twins that were `vl check`-clean `indirect call type
mismatch` traps: a named `(i32) => i32` into a `(i32) => (i32 | null)` parameter, the
`string` / `string | null` pair, and `(i32) => K0` into `(i32) => string`.

Measured before/after on the same 322 closure cells, same harness: silent 17 → 0, `correct`
unchanged at 43. The surviving 6 are D6 (4 cells, numeric-litunion map value at `mapget`)
and D7's family (2). **D7 IS NOW CLOSED TOO — SILENT TOTAL 6 → 4**, re-measured on the same
9,126 + 219 cells with the grader re-validated first: main grid `correct` 6,897 /
invalid_wasm 4, order grid 0 silent, and the 4 are exactly D6's `rep=numlit pos=mapget`
cells (c08730-c08733). D7's own two cells (c08570 / c08571) grade `correct` with the
evaluation-count oracle at 1. Pins: `tests/cases/closures/error-is-functype-slot-rep-reject.vl`,
`error-fn-slot-rep-differs-reject.vl`, and — for the shape the cells were aimed at —
`nullable-closure-is-narrow-positions.vl`.

## SILENT TOTAL 6 → 0 (2026-08-25, D7 and D6 closed)

**THE SWEEP IS AT ZERO.** Every run below is the same 9,126 cells and the same harness; the
grader was re-validated against the final compiler first (`sabotage.py` → 12 wrong_value /
8 wrong_evalcount / 6 trap / 4 correct, exactly as published).

| | `c31e9fae` | D6 alone | merged (D7 #1924 + D6) | + D14 |
|---|---|---|---|---|
| correct | 6,895 | 6,907 | **6,909** | **7,083** |
| check-clean invalid wasm | 6 | 2 | **0** | **0** |
| loud check reject | 1,199 | 1,199 | 1,199 | 1,199 |
| loud emit reject | 1,026 | 1,018 | **1,018** | **844** |
| **SILENT TOTAL** | **6** | **2** | **0** | **0** |

The `+ D14` column is a real re-run of the same 9,126 cells on the closing branch, with its
own baseline re-run on the same tree (which reproduced the `merged` column exactly). Cell for
cell, **174 cells moved, every one `loud_emit_reject → correct`, all of them `list_f32`** —
see D14 below.

Cell-by-cell against `c31e9fae`, **14 cells moved and every one of them improved** — 6
`invalid_wasm → correct` and 8 `loud_emit_reject → correct`. Nothing moved the other way,
in either change:

| cells | rep · position · construct | was | now |
|---|---|---|---|
| `c08570` `c08571` | `string` · `elem_place` · `??` | invalid wasm | correct (D7) |
| `c08730`–`c08733` | `numlit` · `mapget` · `!= null` / `== null`-else | invalid wasm | correct (D6) |
| `c08734` `c08735` `c08738` `c08739` | `numlit` · `mapget` · `is` / `??` | loud emit reject | correct (D6) |
| `c02568` `c02569` `c02572` `c02573` | `numlit` · `mapval` · `is` / `??` | loud emit reject | correct (D6) |

The two changes are disjoint in both the cells they move and the files they touch (D7 is
`wasmEmit.vl`'s list-index `??`; D6 is `emit_classify.vl` / `emit_collect.vl`'s map read),
and the merged run is a real re-run on the rebased tree rather than an addition of two
deltas.

**A WARNING ABOUT MEASURING THE BASELINE — IT COST TWO WRONG SWEEPS IN ONE SESSION.** The
host caches a compiled seed as `build/vl-compiler.wasm.<hash>.cwasm` NEXT TO the seed, and
**a SYMLINKED seed is not re-keyed when you retarget the link**: point the symlink at a
different seed and the run silently reuses the cached module for the previous target.
Proven both ways — with the symlink moved to the OLD seed and the NEW seed's `.cwasm` still
present the sweep behaved as the new compiler; `rm` the `.cwasm` files and the identical
setup behaved as the old one.

**THE PRECONDITION IS THE SYMLINK, and the original wording here omitted it — re-measured
2026-08-25 because an unconditional claim would make every `cp`-based A/B look untrustworthy.**
Overwriting a real FILE re-keys correctly, both at an arbitrary path and at
`build/vl-compiler.wasm` itself: `cp <old-seed> build/vl-compiler.wasm` then re-running the
D6 repro reproduces the defect, and copying the fixed seed back makes it pass again, with no
`rm` of any `.cwasm`. Retargeting a SYMLINK over the same two seeds keeps answering as the
first target. So `cp` is safe and `ln -sfn` is not — which is worth knowing precisely,
because the safe method is the cheaper one.

Both failures were quiet and both looked like results. The first "before" sweep reported
SILENT 2 — *no change at all* — and the first post-rebase "after" sweep reported SILENT 6,
i.e. the change had vanished. Each is a plausible number; neither is a crash. **Run each
side from a SEPARATE root with its own `build/` holding a real COPY of that seed**, and
sanity-probe one known cell (`runcell.sh` on the cell the fix targets) before spending
twenty minutes on 9,126.

**Do not re-derive this by hand.** `python3 scripts/check-filed-witnesses.py <doc>` runs
every filed repro and prints which have moved; it exits non-zero when any row no longer
behaves as filed. Prose cannot be re-run — that is why eight rows sat here as live work
after they were fixed.

---

## THE SCOPE AXIS (2026-08-26) — module scope was an unmeasured storage class, and it held 38 silent cells

**The whole grid had only ever executed inside a function.** `ALIAS_POSITIONS` carried a
`global` entry, so the grid varied where a binding SITS; the reading statements were always
wrapped in `function reader() { … }` and called. Two independent rows pointed at that gap
from opposite directions — D19 (a module-scope map miss that TRAPS, where the identical seven
lines inside a function print `1` / `absent`) and D20's residual (a module-scope list-valued
map read that is loud, and loud for its NON-nullable control too). Neither is a nullability
finding; both turn on the storage class of the executing body.

`gen.py` now takes a `--scopes` axis crossed with rep × nullability × position × construct ×
runtime input. `scope=fn` emits exactly what it always did; `scope=mod` emits the same
statements at module top level, with no enclosing function and no call.

**THE PAIRED RESULT, which is the only number that answers the question.** A module-scope
grid's absolute silent count means nothing on its own, because its population is not the
function-scope one. `scripts/silent-sweep/pairscope.py` compares the SAME
(leg, rep, nul, pos, con, read, inp, spell) coordinate at both scopes, so exactly one thing
differs between a cell and its control:

| | `scope=fn` | `scope=mod` |
|---|---|---|
| correct | 7,219 | 6,863 |
| **SILENT** | **0** | **38** |
| loud check reject | 1,147 | 1,147 |
| loud emit reject | 184 | 502 |

8,550 paired coordinates (17,100 cells) + 780 coordinates that exist only at `scope=fn`.
**All 780 skips are `pos=param`** — a parameter needs a function to be a parameter of, the one
structurally unrepresentable combination. The skip is recorded in the manifest and printed by
the generator; nothing else in the cross product is dropped. `pos=capture` IS generated at
module scope and is a real program, but its captured binding is then a global, so it re-covers
`global`'s storage class rather than adding one.

**All 38 silent cells were the same defect**: `pos ∈ {mapget, mapval_miss}`, `inp=1` (a
MISSING key), message `wasm trap: null reference`, function-scope twin `correct` in every
case. That is D19, and the seven reps it spans are exactly the ones whose map value reps as
the shared `{tag, payload}` union box. Closed by the arm named in D19's row; the grid re-run
on the fixed compiler moves **38 cells, every one `trap → correct`, zero in the other
direction, `correct → not-correct` zero**.

**A COVERAGE HOLE THE AXIS EXPOSED, worth more than the axis's own finding.** `mapval` only
ever read a key it had just STORED, so a declared-nullable map value was never once read at a
MISSING key by this grid — D19's own coordinate was not in the population that reported 0
silent. The new `mapval_miss` position adds it (204 cells at `scope=fn`), and 31 of the 38
silent cells live there. A grid can report zero because the defect is absent or because the
coordinate is; only reading the generator tells you which.

**THE 322 THAT WENT LOUD, and why they were NOT fixed here.** 322 paired coordinates are
`correct` at function scope and `loud_emit_reject` at module scope — 164 `bare null needs a
struct-typed context` and 110 `` `is` test but no union type declared ``, concentrated in the
list family (`mapval` 158, `mapget` 56, `field` 24, `elem` 24, `ret_unann` 12). That is D20's
residual, already filed, already named down to the rung (`exprNulScalarListKind` /
`exprNullableList` / `exprNullableRefArray` carry no `mapReadMvSlot` arm for value kind 6),
and already argued as deliberately not-widened because closing it changes NON-nullable
behaviour too. This measurement raises its size from the 12 coordinates its own 2×2 saw to
322 and leaves the ruling alone. Mixing it into a silent-class fix is the exact shape of
widening that has twice turned a loud reject into a silent one in this programme.

**Grader re-validated first, against the compiler actually being measured with**, both before
and after the fix: `sabotage.py` → **12 wrong_value / 8 wrong_evalcount / 6 trap / 4
correct**, exactly as published. A zero in a silent column is worth nothing until that column
has been made to fire on demand.

    python3 scripts/silent-sweep/gen.py       <cells>            # --scopes fn,mod (default)
    bash    scripts/silent-sweep/sweep.sh     <cells> <res>      # still xargs -P4
    python3 scripts/silent-sweep/grade.py     <cells> <res> --csv scope.csv
    python3 scripts/silent-sweep/pairscope.py scope.csv

---

## 0. What was measured

| | |
|---|---|
| cells generated and run | **9,345** |
| result files | **9,345** (asserted `records == cells` on every run) |
| `vl` invocations per cell | 2 (`check` + `run`), plus a third (`build`) only when the run stage failed |
| concurrency | 4, never more |
| runtime inputs per cell | **2 — every cell** (a present value, and `null` or a non-matching variant) |
| evaluation-count oracle | a module-scope counter incremented in the producer, printed as the last line of **every** cell |

The producer is called exactly once by construction in every cell, so the trailing count
line is a hard oracle: any cell printing anything but `1` is a failing cell whatever its
values say.

### The outcome columns, kept strictly separate

| column | cells | / 9,345 |
|---|---|---|
| correct | 6,499 | 69.5% |
| **check-clean SILENTLY WRONG VALUE** | **2** | |
| **check-clean WRONG EVALUATION COUNT** | **4** | |
| **check-clean INVALID WASM** | **97** | |
| **TRAP (emitted program)** | **0** | |
| **COMPILER TRAP (check-clean, no diagnostic at all)** | **4** | |
| loud check reject | 1,361 | |
| loud emit reject | 1,378 | |
| hint-only rc 1 | 0 | |
| other runtime failure | 0 | |
| **SILENT TOTAL** | **107** | 1.14% |

`compiler_trap` is split out from `trap` because they are not the same event: a trap with
**no module written** is the compiler's own `array.get` going out of bounds while emitting,
which produces no diagnostic and no artefact. Merging it with a program trap would hide the
worse one. The split is measured, not guessed — the third `vl build` stage records the
output module's size.

`hint-only rc 1` is zero because on this tip `vl check` exits **0** on a file whose only
diagnostics are `[HINT]` / `[WARNING]` (measured: a `redundant type annotation` hint and an
`Unused variable` warning together still give rc 0, and `vl run` neither prints them nor
fails). The classifier keys on the presence of an `[ERROR]` line rather than on rc, so the
column exists and would fire; it simply never did.

## 1. Grid totals per axis

### By representation (all legs)

| rep | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| boolean | 567 | 534 | **1** | 10 | 22 |
| string | 601 | 545 | 2 | 32 | 22 |
| i32 | 573 | 406 | **16** | 99 | 52 |
| i64 | 573 | 406 | **16** | 99 | 52 |
| f64 | 573 | 406 | **16** | 99 | 52 |
| f32 | 567 | 398 | **16** | 101 | 52 |
| namedlit | 573 | 509 | **2** | 40 | 22 |
| inlinelit | 558 | 460 | 0 | 40 | 58 |
| numlit | 573 | 384 | **26** | 125 | 38 |
| vubox (`string \| i32`) | 320 | 268 | 0 | 26 | 26 |
| structunion | 324 | 52 | 0 | 108 | 164 |
| struct | 359 | 296 | 0 | 27 | 36 |
| list_i32 | 377 | 301 | 0 | 50 | 26 |
| list_str | 377 | 253 | 0 | 50 | 74 |
| list_f64 | 355 | 253 | 0 | 28 | 74 |
| list_i64 | 340 | 244 | 0 | 24 | 72 |
| list_f32 | 340 | 76 -> **250** | 0 | 24 | 240 -> **72** |   *(D14, closed 2026-08-25; re-measured baseline on the closing branch was 76 / 0 / 18 / 246)*
| list_ref | 365 | 218 | 0 | 53 | 94 |
| closure | 331 | 31 | 0 | 252 | 48 |
| map_str | 371 | 257 | **4** | 50 | 60 |
| map_i32 | 328 | 202 | **8** | 24 | 94 |

### By position (all legs)

| position | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| **capture** | 780 | 312 | **90** | 75 | 303 |
| const_local | 892 | 744 | 4 | 75 | 69 |
| let_local | 456 | 374 | 0 | 41 | 41 |
| param | 780 | 642 | 0 | 75 | 63 |
| ret_unann | 456 | 374 | 0 | 41 | 41 |
| ret_ann | 780 | 642 | 0 | 75 | 63 |
| global | 780 | 640 | 0 | 75 | 65 |
| field | 870 | 560 | **3** | 252 | 55 |
| elem | 822 | 663 | 0 | 80 | 79 |
| mapval | 822 | 460 | 0 | 131 | 231 |
| loopvar | 780 | 470 | 0 | 79 | 231 |
| callres | 266 | 228 | **4** | 16 | 18 |
| field_place | 204 | 140 | 0 | 25 | 39 |
| elem_place | 204 | 42 | **2** | 150 | 10 |
| mapval_place | 204 | 54 | 0 | 150 | 0 |
| mapget | 204 | 112 | **4** | 18 | 70 |
| bare | 45 | 42 | 0 | 3 | 0 |

**`capture` holds 90 of the 107 silent cells (84%) on 8.3% of the population.** That is the
single strongest signal in the sweep.

### By construct

| construct | cells | correct | silent | loud check | loud emit |
|---|---|---|---|---|---|
| nenull (`if x != null`) | 1,442 | 978 | **36** | 168 | 260 |
| eqnull_else (`if x == null … else`) | 1,386 | 932 | **32** | 168 | 254 |
| is_t (`if x is T`) | 1,848 | 1,312 | **8** | 224 | 304 |
| match_null | 630 | 340 | 0 | 178 | 112 |
| andguard (`x != null && …`) | 198 | 188 | **10** | 0 | 0 |
| while_g (`while x != null && …`) | 462 | 348 | **10** | 22 | 82 |
| coalesce (`x ?? d`) | 828 | 546 | **2** | 18 | 262 |
| printdirect | 828 | 462 | 0 | 358 | 8 |
| eqnullcmp (`x == null`) | 504 | 439 | 0 | 23 | 42 |
| optchain (`const t = x?.p`) | 132 | **0** | 0 | 110 | 22 |
| direct | 652 | 588 | **6** | 42 | 16 |
| eqcmp | 216 | 208 | 0 | 2 | 6 |
| fwd (alias declared after its user) | 45 | **12** | **3** | 30 | 0 |
| ord (alias declared before its user) | 174 | 146 | 0 | 18 | 10 |

**Every silent cell in a narrowing construct is in a `null`-COMPARISON form**
(`!= null`, `== null`-else, `&&`-guard, `while`-guard). `is` contributes 8, all of them the
numeric-litunion box, and `match` contributes none. That is the shared root of §3.

### By runtime input, and by nullability

| axis | cells | correct | silent |
|---|---|---|---|
| input 0 (present value / matching variant) | 4,709 | 3,275 | 55 |
| input 1 (`null` / other variant) | 4,636 | 3,224 | 52 |
| plain (non-nullable) | 1,835 | 1,435 | 10 |
| nullable | 7,510 | 5,064 | 97 |

Both runtime inputs carry silent cells in near-equal share, which is the argument for the
requirement: **a one-input probe of this population would have found roughly half of it,
and would not have known which half it missed.**

## 2. Ranked live defects

Ranked silent-before-loud; within silent, wrong value → wrong evaluation count → invalid
wasm → trap; within a class, flat-across-many-reps before single-rep.

---

### D1 — [CLOSED 2026-08-25] a struct field whose type is an alias declared LATER in the file resolves to the wrong rep
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean SILENTLY WRONG VALUE · 2 cells + 1 invalid wasm + 30 loud check rejects, of 45 in the `fwd` leg (12 correct)**

Repro (`boolean` payload — prints `1`, must print `true`):

    type Wrap = { f: Flag }
    type Flag = boolean
    const w: Wrap = { f: true }
    print(w.f)
    // vl check: rc 0, no diagnostic.  Output: 1        <- WRONG
    // with `{ f: false }` the output is 0

Control (the same program with the two declarations swapped — prints `true`):

    type Flag2 = boolean
    type Wrap2 = { f: Flag2 }
    const w: Wrap2 = { f: true }
    print(w.f)

Second silent spelling (litunion payload — prints the raw interned atom id `0`, must print
`p`):

    type Kc = "p" | "q"
    type WrapKc = { f: Kd }
    type Kd = Kc | null
    function body() {
      const w: WrapKc = { f: "p" }
      const v = w.f
      if v != null { print(v) } else { print("NUL") }
    }
    body()
    // vl check: rc 0.  Output: 0                       <- WRONG (control prints `p`)

Third spelling, same axis, worse verdict — **check-clean INVALID WASM**:

    type K = "p" | "q"
    type WrapK = { f: K2 }
    type K2 = K
    const w: WrapK = { f: "p" }
    print(w.f)
    // vl check rc 0; module written (763 bytes); engine rejects it

Fourth spelling, a **bogus diagnostic** on a legal program:

    type WrapCh = { f: Ch1 }
    type Ch1 = Ch2
    type Ch2 = boolean
    const w: WrapCh = { f: true }
    print(w.f)
    // [ERROR]: Type `Ch1` is `never` (an empty type — its operands have no common
    //          values), so it has no values

* **Triggered by**: input 0 (the present value). The `null` input takes the else arm and is
  correct, which is why a null-only probe of this shape reads clean.
* **Flat on**: the declaration-order axis — every `fwd` cell of a print-classified payload
  is wrong, every `ord` control is right.
* **Varies on**: the payload rep. `boolean` → wrong value (`1`/`0`); a litunion → wrong
  value (the atom id) or invalid wasm; `i32`, `i64`, `f64`, `f32`, `string`, a struct
  alias, a nested struct → **correct**, because their print IS the default classification.
* **Narrower than it looks, and the narrowing is the diagnosis**: the stored VALUE is
  right. `print(w.f) == true` prints `true` and `if w.f { … }` takes the right branch
  (measured) — only `print` of the field is wrong. So this is a *print-classifier* lookup
  against a table the forward reference has not populated, not a storage bug.
* **Reach**: the struct-FIELD container only. A forward alias as a list element, a map
  value, a bare binding, a param, or a return type is correct (all measured).
* **One root or several**: one. All four spellings are the same forward reference; the four
  different symptoms are four different consumers of the unresolved field type.

---

### D2 — [CLOSED 2026-08-25] `for x in <expr>.keys()` / `.values()` evaluates `<expr>` TWICE, and iterates the SECOND result
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean WRONG EVALUATION COUNT · 4 cells of 4 reachable in the grid; confirmed on 8 further hand-written receivers**

Repro:

    let nCalls = 0
    function mk(): {[string]: i32} {
      nCalls = nCalls + 1
      const m: {[string]: i32} = Map()
      m["k"] = nCalls
      return m
    }
    for v in mk().values() { print(v) }
    print(nCalls)
    // vl check rc 0.  Output:  2 / 2      <- the value printed is from the SECOND map,
    //                                       and the count is 2, not 1

Control (bind the receiver first — one call, and the first map is the one iterated):

    const b = mk()
    for v in b.values() { print(v) }
    print(nCalls)
    // Output: 1 / 1

* **Triggered by**: both runtime inputs equally — this is not a null-dependent path.
* **Flat on**: the key rep (`{[string]: i32}` and `{[i32]: string}` both double); the
  method (`.keys()` and `.values()` both double); the receiver's shape — a call
  (`mk()`), a field of a call (`mk().m`), a call of a call (`idf(mk())`) all double; module
  scope and inside a function both double.
* **Varies on**: whether the receiver is a *place*. A local, a global and a parameter are
  each evaluated once. So the defect is "the receiver EXPRESSION is emitted twice", and a
  place is idempotent by luck rather than by design.
* **Not** `.size`, **not** `m["k"]`, **not** a plain list `for-in`, **not** `.slice`,
  **not** `.map`, **not** `.filter` — all measured at exactly one call.
* **Why this is worse than a doubled side effect**: `G4_identity` above shows the loop body
  reads the SECOND object. Any receiver whose two evaluations differ — a counter, a fresh
  `Map()`, a mutating builder, an allocation — iterates something the program never
  produced. This is one step from a silently-wrong value, and it is value-correct and
  check-clean today for exactly the reason #1441 was: the sibling receivers in the corpus
  have no side effect.
* **One root**: one — the for-in iterable lowering for the `keys`/`values` view emits its
  receiver once to obtain the view and once more to obtain the length/backing.

---

### D3 — [CLOSED 2026-08-25] a nullable SCALAR BOX captured by a nested function, narrowed with a `null` COMPARISON, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 86 cells, the largest silent family**

Repro:

    function body(p: i32 | null) {
      function inner() { if p != null { print(p) } else { print("N") } }
      inner()
    }
    body(7)
    body(null)
    // vl check: rc 0, "Checked 1 file, no errors."
    // vl run:   Invalid input WebAssembly code at offset 370:
    //           type mismatch: expected i32, found (ref $type)   [in function `inner`]
    // wasm-tools validate agrees: "func 6 failed to validate"

Control (the identical read, not captured — correct on both inputs):

    function body(p: i32 | null) {
      if p != null { print(p) } else { print("N") }
    }
    body(7)
    body(null)

Second control (the same capture with a niche payload instead of a box — correct):

    function body(p: string | null) {
      function inner() { if p != null { print(p) } else { print("N") } }
      inner()
    }

* **Triggered by**: both inputs — the module fails to validate, so neither input runs.
* **Flat on**: five payload reps (`i32 | null`, `i64 | null`, `f64 | null`, `f32 | null`,
  `(1 | 2) | null`), 16 cells each except the numeric litunion at 22; the inline and the
  declared-ALIAS spelling of the nullable both; a named nested function and a `=>` lambda
  both; one and two levels of nesting both.
* **Varies on the NARROWING FORM, and this is the whole finding**:

  | narrow form at a capture | verdict |
  |---|---|
  | `if p != null` | **check-clean INVALID WASM** |
  | `if p == null { … } else` | **check-clean INVALID WASM** |
  | `p != null && p == 7` | **check-clean INVALID WASM** |
  | `while p != null && …` | **check-clean INVALID WASM** |
  | `if p is i32` | loud: `emitProgram: narrowed union binding is not a local or global` |
  | `match p { null => … _ => … }` | loud: same |
  | `p ?? 0` | loud: same |
  | `print(p == null)` (no narrowing) | correct |

* **The complete capture-position map over all eleven nullable niches** (nullable leg, 780
  cells at this position):

  | payload | capture verdict |
  |---|---|
  | `string \| null` (nulstr) | correct (38/38) |
  | `boolean \| null` (nulbool) | correct (38/38) |
  | `S \| null` (nulstruct) | correct (24/26) |
  | `i32[] \| null` (nullist) | correct (24/26) |
  | `string[] \| null` (nulstrlist) | loud emit — `bare null needs a struct-typed context` |
  | `f64[] \| null` (nulf64list) | loud emit — same |
  | `i64[] \| null` (nuli64list) | loud emit — same |
  | `f32[] \| null` (nulf32list) | loud emit — same |
  | `S[] \| null` (nulreflist) | loud emit — `ref valtype with no interned shape` |
  | `((i32) => i32) \| null` (nulclosure) | loud emit — `bare null needs a struct-typed context` |
  | `{[string]: i32} \| null` (nulmap) | loud emit — same |
  | `i32/i64/f64/f32 \| null` (scalar BOX) | **check-clean INVALID WASM** |
  | `(1 \| 2) \| null` (numeric-litunion box) | **check-clean INVALID WASM** |
  | `(string \| i32) \| null` (value-union box) | loud emit — `narrowed union binding is not a local or global` |

* **One root**: one, and the source says so in the wrong direction. `emitUnionBoxPush`
  (`compiler/wasmEmit.vl:3123`) carries the floor and a comment asserting *"a clean reject,
  **not invalid wasm**"*. That assertion holds only for the readers that route through
  `emitUnionBoxPush` — `is`, `match`, `??`. A `null`-comparison narrow of a nullable scalar
  box reaches the read through a different classifier that never asks, so it emits an
  unboxed i32 read against a `(ref $type)` slot. **The floor exists and four of its seven
  callers do not stand on it.** The `(string | i32)` box is loud because its narrowed read
  DOES route through `emitUnionBoxPush` in every form.

---

### D4 — [CLOSED 2026-08-25] a map captured by a closure TRAPS INSIDE THE COMPILER — **FIXED, and the filed axis was wrong**
**CLOSED 2026-08-25 — the repro now RUNS. Was: COMPILER TRAP · 4 cells · check-clean, no diagnostic, no module**

**RESOLVED.** The axis filed below as "the map's KEY rep only" is the map's **VALUE** type.
Measured over 220 cells (11 value types × 2 keys × 4 capture routes + an uncaptured control ×
2 runtime inputs): the KEY is FLAT — 48 string-keyed and 48 i32-keyed cells trapped — while
the VALUE decides. `string`, `f64`, `i32[]`, `string | null`, `i32 | null` and `f64 | null`
trapped; `i32`, `boolean`, `boolean | null`, a litunion and a struct value did not. The
mechanism is why: `mapAnnShape` answers the MONO sentinel (`-1` string-keyed, `-4` i32-keyed)
for an `i32`/`boolean` value, and those were already declined by `sFieldIndex`'s `si < 0` arm;
only a value needing its own `$mapStruct` produces a nonnegative `mv` SLOT, and that slot was
returned where a STRUCT TABLE row was expected (`capturedStructIndex` →
`captureValStructIdx`, whose companion index is polymorphic in the capture's kind). Both
controls below still hold; the second one ("an i32-keyed map read WITHOUT the capture") is the
real discriminator, not the first.

The nearby loud floor named at the bottom of this entry is NOT the mechanism either: the trap
is an index-space confusion in the classifier, not the i32-key emit floor being reached late.
The 220-cell grid now reads 220 correct, and the fix also cleared 48 cells that this sweep had
recorded as check-clean INVALID WASM in the same population (`mapShapeOfExpr`'s captured-map
arm covered only the `LetDecl` binding, so a captured map PARAM read the mono shape against a
typed env field). Pinned by `tests/cases/closures/capture-map-i32-key-typed-value.vl` (this
entry's own program) and `tests/cases/closures/capture-map-typed-value-shape.vl`.

Repro:

    function mk(): {[i32]: string} {
      const m: {[i32]: string} = Map()
      m[1] = "x"
      return m
    }
    function body(m: {[i32]: string}) {
      function inner() { print(m.size) }
      inner()
    }
    body(mk())
    // vl check: "Checked 1 file, no errors."
    // vl run / vl build:  wasm trap: out of bounds array access
    //                     note: an index outside the bounds of an array.
    // No module is written.  The backtrace is 13 frames of the COMPILER's own wasm
    // (function 1416 .. 2794), not the program's.

Control (a string-keyed map in the same shape — correct):

    function body(m: {[string]: i32}) {
      function inner2() { print(m.size) }
      inner2()
    }

Second control (an i32-keyed map read WITHOUT the capture — correct).

* **Triggered by**: both inputs; there is no runtime, so the input is irrelevant.
* **Flat on**: the capture being a parameter or a local (both trap); the capture ROUTE (a
  nested `function`, an arrow lambda, a lambda passed as an argument, two levels deep — all
  four trap, 24 of 44 cells each); and the map's KEY (48 traps each spelling).
* ~~**Varies on**: the map's KEY rep only. String-keyed is clean at the same position.~~
  **WRONG — see the RESOLVED note at the top of this entry.** Varies on the map's VALUE type.
* **Why it ranks above the remaining invalid-wasm rows**: it is the only outcome in the
  whole sweep with **no diagnostic of any kind** — not a reject, not a bad module, just an
  out-of-bounds `array.get` in the compiler. Everything else at least produces a message or
  an artefact a reader can inspect. There is a nearby loud floor for this rep
  (`emitProgram: an i32-keyed Map/Set is supported as a binding / parameter / return /
  '| null' / an ARRAY element…`, 34 cells elsewhere in the sweep) — the capture storage
  class simply reaches an indexed table before that floor is consulted.

---

### D5 — [CLOSED 2026-08-25] a NARROWED nullable map iterated by `.values()` / `.keys()` emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 4 cells**

Repro:

    function mk(): {[string]: i32} | null {
      const m: {[string]: i32} = Map()
      m["k"] = 5
      return m
    }
    function body() {
      const v: {[string]: i32} | null = mk()
      if v != null { for z in v.values() { print(z) } } else { print("N") }
    }
    body()
    // vl check rc 0; module written (2030 bytes); engine rejects it

Control (`.size` on the same narrowed binding — correct):

    if v != null { print(v.size) } else { print("N") }

Second control (the non-nullable map, same loop — correct).

* **Triggered by**: input 0. The `null` input takes the else arm; but the module fails to
  validate, so neither input produces output.
* **Flat on**: `.values()` and `.keys()` both (2030 / 2060 bytes); both key reps.
* **Varies on**: the narrowing. The un-narrowed non-nullable map is fine.
* **Shares a root with D2** (see §3): both are the map view's for-in lowering failing to
  read the receiver through the recovered non-null temp.

---

### D6 — [CLOSED 2026-08-25] a NUMERIC-LITUNION map value, read by index and narrowed, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 4 cells of 12 in the `mapget` × numlit grid**

Repro:

    type N2 = 1 | 2
    function body() {
      const m: {[string]: N2} = Map()
      m["k"] = 1
      const v = m["k"]
      if v != null { print(v) } else { print("N") }
    }
    body()
    // vl check rc 0; module written (1996 bytes); engine rejects with
    //   type mismatch: expected (ref null $type), found i32

Controls (both correct): the string-litunion value type `{[string]: K}`; and the
DECLARED-nullable value type `{[string]: N2 | null}`.

* **Triggered by**: both inputs (present key and missing key) — validation fails first.
* **Flat on**: the `!= null` and `== null`-else narrow forms.
* **Varies on**: the value rep. `i32`/`i64`/`f64`/`f32` value types give a LOUD reject at
  the identical position (D11 below); the numeric litunion is the one that gets a bad
  module instead.

CLOSED BY THE ROOT-E CORRECTION §3 ALREADY NAMED, taken one step further than the row did.
Two rungs, and neither is new machinery:

1. `mapReadScalarBoxKind*` EXCLUDED the numeric litunion, on the claim — written into both
   twins' headers — that a nullable numeric litunion rides the `-1` sentinel the way
   `K | null` does. It does not: the `-1` niche is the STRING litunion's, because a string
   litunion's rep is an interned atom ID and every negative is spare, while a numeric
   litunion's rep is THE NUMBER (#1866) and no bit pattern is spare at all.
   `nulNumLitUnionBaseName`'s own header states the true rule — `1 | 2 | null` reps as
   `<base> | null`, WHICH IS THE VALUE-UNION BOX — and the disassembly of an `N | null`
   param agrees. So the read takes #1901's conditional box at the base scalar's atom.
2. `synthNullableAnn` then handed the RECORDED type over under a spelling that does not
   denote it: `tyToEmitName` renders the REP, so `N2 | null` renders `i32|null`. The
   annotation node's row was therefore unmatchable by `unRowOfCanon`, `letUnionNameOf`
   answered "" for a binding whose union NAME was registered, and the narrowed read skipped
   its unbox. A SOURCE `const v: N2 | null` never hit this because CANON rewrites that
   spelling and rebanks the row in the same move.

**THE ROW UNDERSTATED THE SEVERITY, and the understatement was in the filed program.** With
the binding ANNOTATED — `const v: N2 | null = m[k]` — the same map compiled and RAN, and a
MISSING key printed `0`: `emitMapGet`'s "rep's empty value" boxed under the PRESENT tag.
That is #1899's silent wrong answer, in the value rep #1901 excluded, and it is check-clean
and runs. Now `N`. Pins: `tests/cases/maps/numlit-value-read-narrow.vl`,
`numlit-value-annotated-miss.vl`, `numlit-value-read-shapes.vl`.

---

### D7 — [CLOSED 2026-08-25] `xs[0] ?? d` over a nullable-ELEMENT list emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 2 cells · already documented as a residue, still live**

Repro:

    function body() {
      const xs: (string | null)[] = ["aa", null]
      print(xs[0] ?? "DD")
    }
    body()
    // vl check rc 0; module written (1042 bytes); engine rejects with
    //   type mismatch: expected (ref $type), found (ref null $type)

Control (bind the element, then coalesce — correct on both elements):

    const a = xs[0]
    print(a ?? "DD")

Second control: `??` on a map index get (`m["k"] ?? "DD"`) — correct.

* This is the cell `per-rep-ladder-audit.md` C4 already names: *"`??` over a LIST index …
  check-clean INVALID WASM for the `(string | null)[]` control (1 cell), which is the worse
  verdict and is pre-existing."* Re-measured here at 2 cells (both inputs) and unchanged.
  Recorded so it is not re-derived a third time.

**THIS ROW AND `soundness/xfail-miscompile-nulstr-list-coalesce.vl` WERE ONE DEFECT** —
same program, same disassembly, filed twice under two names, cross-linked in #1923 before
either was fixed precisely so that closing it could not leave half the queue reading as
live. **BOTH HALVES ARE CLOSED**: this row is re-graded above, and the fixture graduated to
`tests/cases/lists/nullable-elem-list-coalesce.vl` (`@run` + `@log`). The mechanism the
fixture carried, kept here because it is what the fix had to remove:

    (if (result (ref $str))                   ;; the NON-NULL type `??` promises
      (ref.is_null (array.get $back …))       ;; the null test, on a re-read
      (then (global.get $default))            ;; already non-null — fine
      (else (array.get $back …)))             ;; THE SAME READ AGAIN, still (ref null $str)

The backing of a `(string | null)[]` is `(array (mut (ref null $str)))`, so the ELSE arm's
`array.get` yielded the nullable reference into a slot declared non-null. Every other `??`
sink narrowed at this seam; the list-index arm re-read and handed the raw nullable through.
The `then` arm was fine, which is why the shape surfaced at validation rather than at
execution.

**THE FIX, and why it is one fix for two defects.** Every other lhs of this rep narrows on
that re-read — an ident / struct-field read recovers itself once `rawNullRead` is cleared —
but a LIST INDEX cannot: the element legitimately holds null, so `xs[i]`'s `array.get` must
stay `(ref null $str)` under EVERY context and a recovering read arm would trap on the very
value `??` exists to answer for. **The re-read was also a SECOND EVALUATION of the index**,
which the invalid module hid: built with `--no-validate`, `xs[f()] ?? d` disassembles to two
`call $f`. Narrowing the else arm would have closed the first and left the second, so the
arm now takes the `br_on_non_null` block every OTHER nullable-ref niche already used
(`emitCoalesceNulRefCtx`, factored out of `emitCoalesceNulRef`): the place is evaluated ONCE
and the narrow IS the branch, so there is no value arm left to get wrong. Measured after:
both cells `correct`, eval-count oracle 1, and `xs[f()] ?? d` prints one tick.

* **Byte-identical after the fix**: the map-index control, the non-nullable-element list, and
  every non-`string`-rep cell of the grid (`boolean | null`, `K | null`, `S | null`,
  `i32[] | null` elements). The bind-first control is NOT byte-identical — it shares this
  lowering, so it lost its own re-read too (2102 → 2096 bytes) — and it answers the same.
* **NOT closed by this, and not this defect**: `(i32 | null)[]`, `(f64 | null)[]` and a
  nullable-CLOSURE element at the same position are a LOUD emit reject
  (``emitProgram: `??` is only supported on a map index get``) — the boxed value union and
  the closure have no INDEX arm in `emitCoalesce`, only an ident arm and a call arm. Loud,
  so not in the silent population; bind-first works for all of them.

---

### D8 — [CLOSED 2026-08-25] assigning `null` to a nullable binding INSIDE the block where it is narrowed non-null is rejected
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud check reject · flat across every place**

Repro:

    function body(p: string | null) {
      let q: string | null = p
      if q != null { print(q)
        q = null }
      print(q == null)
    }
    body("a")
    // [ERROR]: cannot assign null to string

Control (assign after the narrowed block — correct, prints `a` / `true`):

    if q != null { print(q) }
    q = null
    print(q == null)

* **Flat on**: `let`, param, struct field (`w.f = null`), module global — all four reject;
  and on both `if x != null { … }` and `if x == null { … } else { … }`.
* **Varies on**: the assigned value. `q = "zz"` inside the narrowed block is accepted, so
  the check is against the FLOW-NARROWED type rather than the declared one.
* **Why it is worth a slice**: it makes the ordinary drain idiom unwritable —

      while q != null { print(q)
        q = null }        // [ERROR]: cannot assign null to string

  there is no rewriting of that loop that keeps the guard and clears the variable, so the
  shape has to be replaced with a counter. Assignment should be checked against the
  binding's DECLARED type; narrowing constrains reads, not writes.

---

### D9 — [CLOSED 2026-08-25] a nullable-niche list / map / closure captured by a nested function is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 144 cells at the capture position (124 as filed, on the pre-`c0ee3089` grid)**

Repro:

    function body(p: string[] | null) {
      function inner() { if p != null { print(p.length) } else { print("N") } }
      inner()
    }
    body(["a"])
    body(null)
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls (both correct): the same capture with `i32[] | null`; and the same read
uncaptured.

**THE DIVERGENCE SITE IS ONE LADDER, AND IT IS THE `!= null` TEST, NOT THE READ.**
`emitNulIsNullTest` (`compiler/wasmEmit.vl`) is the one home for the null question of every
nullable rep — the `==`/`!=` compare and the `is`/`match` guard both call it — and it ends in
a disjunction of the per-rep `expr*` classifiers. An in-compiler probe placed at that
disjunction's fall-through (emit a distinguishing message whenever the receiver is an Ident
that `capturedKindOf` DOES type) fired on **190 cells**, and the 144 of them that were loud
emit rejects were exactly this row: `nulstrlist` 24, `nulf64list` 24, `nuli64list` 24,
`nulf32list` 24, `nulmap` 48. So the site is reached, the capture channel can answer, and the
ladder had no arm to ask it with — `exprNulScalarListKind`, `exprNullableMap` and
`exprNulClosure` resolved an Ident through param / declared local / global only, while
`exprNullableList` (`i32[] | null`, the filed control), `exprNullableRefArray` (`S[] | null`)
and `exprNullableVariant` already carried the fourth arm. That is why the controls were
correct and why message text could not group this: the identical fall-through reports
`bare null needs a struct-typed context` for `!=`/`==`/`while` (96 cells) and `` `is` test but
no union type declared`` for `is`/`match` (48 cells).

The fix asks `capturedKindOf` — `captureValKind` on the parent frame, the ladder that TYPED
the env field — so the read and the field cannot disagree about the wrapper.

**A NULL TEST ALONE IS A SEVERITY REGRESSION FOR THE MAP HALF, and the grid said so before it
shipped.** Teaching only `exprNullableMap` the storage class moved 22 `{[i32]: string} | null`
capture cells from `loud emit reject` to **check-clean invalid wasm**: the compare lowers, and
the narrowed `.size` then resolves its map SHAPE through `mapShapeOfExpr`, whose capture arm
answered for the non-null `map` kind only — so the read named the mono string-keyed
`$mapStruct` while `captureValStructIdx` had typed the env field with the i32-keyed one. The
shipped arm reads the env field's OWN companion slot (`capturedNulMapShape`), the number that
minted the field's heap type. A mono string-keyed map alone cannot catch this: its wrong
answer and its right answer are the same `-1`.

Measured on the 9,126-cell grid at `c0ee3089`: **144 cells moved, every one
`loud emit reject → correct`, nothing moved in the other direction, SILENT stays 0.** Per rep
(all /24): `string[]` 24, `f64[]` 24, `i64[]` 24, `f32[]` 24, `{[string]: i32}` 24,
`{[i32]: string}` 24. `f32[] | null` closes here only because D14 landed first — before it,
the same cells advanced from this row's failure to D14's `field access but no struct type
declared`.

Two more things this row's own 728-cell arm-for-arm population settled, over four capture
BINDING FORMS the main grid does not generate (outer param / annotated local / un-annotated
local / two frames deep) and thirteen reps:

* `((i32) => i32) | null` — the null TEST is closed; **CALLING** a captured closure is a
  separate gap that fails for a NON-nullable `(i32) => i32` capture too
  (`call to unknown function`), so it is not this axis.
* `S[] | null` at a capture no longer reports `ref valtype with no interned shape` and did not
  on this tip before the fix either — `exprNullableRefArray` already had the arm. **The filed
  claim of a second message inside this axis does not reproduce**; the real second message was
  the `is`/`match` one above.
* `string | null` at a `.length` READ was loud at every capture form (`field access but no
  struct type declared`) while `print(p)` of the same cell was correct. `exprString` knew the
  `str` capture kind and not `nulstr`, where `declaredString`/`paramString` claim both. Closed
  in the same change; pinned in the same fixture.
* **An UN-ANNOTATED captured local (`const v = mk()`) is still loud, for EVERY rep including
  `i32[] | null` and `S[] | null`** — 168 of the 728. It is a different site and it is filed
  as **D21** below, not silently absorbed here: `captureValKind` types an un-annotated env
  field through `letInitCellKind`, whose ladder names no nullable kind at all.

Pins: `tests/cases/closures/capture-nullable-niche-storage-class.vl`,
`tests/cases/closures/capture-nullable-map-shape-agreement.vl` (the map-shape one exists
because the null test alone passes the first fixture and still emits the invalid module).

---

### D10 — [CLOSED 2026-08-25] a numeric-valued map read by index and narrowed is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 40 cells at the `mapget` position across the four numeric value reps**

Repro:

    function body() {
      const m: {[string]: i32} = Map()
      m["k"] = 5
      const v = m["k"]
      if v != null { print(v) } else { print("N") }
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, all correct: `{[string]: boolean}`; `{[string]: string}`;
`{[string]: i32 | null}` (the DECLARED-nullable value type); `print(m["k"] ?? 0)`;
`for p in m.values()`.

* **Flat on**: `i32`, `i64`, `f64`, `f32` value types. Also `"p" | "q"` spelled INLINE as a
  map value type.
* **Varies on**: whether the map's value type is declared nullable. It is the map read's
  *implicit* `T?` that has no rep, not `T | null` itself.
* **The 40 cells carry THREE different messages for one axis**: 16 report `bare null needs a
  struct-typed context` (the `!= null` / `== null`-else forms), 16 report
  `emitProgram: 'is' test but no union type declared` (the `is` form), and 8 report
  `` `??` is only supported on a map index get`` — which is the "same root, different
  message" case in §3, inside a single row.
* **This is the axis-correction the orchestrator asked for.** The earlier filing retired
  "map-value reads with `is` and `!= null`" as working, and it IS working for `boolean` and
  for `K | null` values. The live half is the numeric value type, which the earlier probe
  did not carry.

---

### D11 — [CLOSED 2026-08-25] a nullable STRUCT UNION narrowed twice (`!= null`, then `is Variant`) is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 158 cells carry this message**

Repro:

    type Cat = { c: i32 }
    type Dog = { d: i32 }
    type Shape = Cat | Dog
    function body(s: Shape | null) {
      if s != null { if s is Cat { print(s.c) } else { print(s.d) } } else { print("N") }
    }
    body({ c: 1 })
    body(null)
    // vl check rc 0; vl run: emitProgram: narrowed receiver names no union variant

Control — do the `is` test DIRECTLY on the nullable, which also handles `null` correctly:

    function body(s: Shape | null) {
      if s is Cat { print(s.c) } else { print("OTHER") }
    }
    body({ c: 1 })   // 1
    body(null)       // OTHER

* **Flat on**: every position (11 of 11) and on the `match s { null => … _ => … }` spelling
  of the outer narrow.
* **Varies on**: whether the outer `null` narrow is present. Removing it fixes it — so the
  defect is that the FIRST narrow replaces the receiver with a temp the variant lookup
  cannot name.

---

### D12 — [CLOSED 2026-08-25] binding an optional-chain result to a `const` is a loud emit reject, with a message about `return`
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 22 cells · 0 of 132 `optchain` cells correct**

Repro:

    type S = { w: i32 }
    function body(a: S | null) {
      const t = a?.w
      print(t ?? 0)
    }
    body({ w: 3 })
    body(null)
    // vl check rc 0; vl run: emitProgram: unsupported expression in return

Controls, all correct: `print(a?.w ?? 0)` (no intermediate binding); `if a?.w != null { … }`;
`if a != null { print(a.w) }`.

* The message names `return`, and there is no `return` in the program. The reported
  position is the function's own header line.
* The neighbouring 100 cells in the same construct are a separate, LOUD, arguably-by-design
  family (110 cells): `?.length` / `?.size` on a nullable list, string or map is
  `[ERROR]: member access '?.length' on non-object i32[]?`. The message calls `i32[]?` a
  non-object, which is misleading, but the decline itself is consistent (only struct fields
  are reachable through `?.`). Filed as a message defect, not a capability defect.

**CLOSED — the root, and it is not about `return`.** `emitExpr`'s node dispatch had NO
`OptMember` arm at all. `?.` was reachable only where a bigger pattern consumed it whole
(`emitCoalesce`'s fused `?.f ?? d` arms; the null-test guards through
`emitOptChainIsNull`), so a `?.` that had to produce a value of its own reached the
dispatcher's trailing catch-all — which carried the message written for the RETURN arm and
raised it through `emitFail`, whose no-node fallback anchors at `emitCurFnIx`. That is both
halves of the defect from one cause. **The `const` binding is not the trigger**:
`print(a?.b ?? false)` over a `boolean` field is the same reject with no binding anywhere in
the program, because `emitCoalesce` dispatches the boolean niche on the operand's TYPE
(`exprNulBool`) long before its own `?.` arms.

`emitOptMemberValue` now lowers a standalone chain as the same two-arm select the fused arms
emit, with the default replaced by the null of the RESULT's own rep — a REP dispatch, not a
field one: `i32 | null` is the value-union box, `boolean | null` the i32 sentinel-2 niche.
Three ends had to agree: `exprUnion` answers for a scalar-leaf `?.` (else `emitUnionCoerce`
boxed the box a second time — `vl check` rc 0, `expected i32, found (ref $type)`), and the
checker exports the binding's inferred union (`inferLetNameOf` → `nliInferOptChainLet`),
which is the ONLY route for this type: `i32 | null` is synthesized from `S | null` plus an
`i32` field and is spelled in no annotation, so nothing else mints the box.

The catch-all message is now `emitProgram: unsupported expression`, anchored at the node.
**The 110-cell neighbour was fixed as the message defect it was filed as**: `?.` reaches
declared struct FIELDS only, so the message now says that and names the narrowing, instead
of calling a list a non-object. The decline is unchanged. Sweep, same 9,126 cells: the
`optchain` construct goes 0 correct / 132 to 22 correct + 110 loud check rejects, and
`unsupported expression in return` goes 22 cells to 0. Pins:
`tests/cases/structs/optional-chain-value-binding.vl`,
`tests/cases/structs/error-optional-chain-builtin-property.vl`.

---

### D13 — [CLOSED 2026-08-25] an INLINE literal union produced by a CALL and stored in a list or map is a loud emit reject
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 40 cells**

Repro:

    function src(): "p" | "q" { return "p" }
    function body() {
      const xs: ("p" | "q")[] = [src()]
      print(xs[0])
    }
    body()
    // now prints `p`. Was: vl check rc 0; vl run:
    //   emitProgram: literal-union atom narrowing needs a re-readable receiver

Controls, all correct then and now: the same list from a LITERAL (`["p"]`); the same call
through a NAMED alias (`type K = "p" | "q"` … `const xs: K[] = [src2()]`); the same call into
a plain `string[]`; the same call into a bare `const v: "p" | "q" = src4()`.

* **Flat on**: the list-element and map-value containers.
* **Varies on**: named vs inline (named is clean), and literal vs call initialiser (literal
  is clean). It needed BOTH the inline spelling and the call.

**CLOSED WITH THE LITERAL-UNION BOUNDARY CLASS, and this row is the reason the class was
grouped rather than worked defect by defect.** The container's slot holds the interned i32
ATOM (`ctxKeepsLitUnion` holds at an element, a field and a map value) while the call's result
is the string ref an inline literal union softens to at `RC_ROOT`, so the store needs a NARROW
— and the narrow is a `select` tower that re-reads its operand once per member, which for a
CALL is the wrong number of EVALUATIONS rather than merely a wrong value. So the tower refused
one. A non-place value is now STAGED: evaluated once into a slot, then re-read per member,
which is `emitAtomToStr`'s id stash mirrored and what the `.push` destination already did.

**ONE ARM, THREE DESTINATIONS, AND THE PREDICTED THREE WALKS WERE NOT NEEDED.**
`emitDestStrToAtom`'s header filed the array-LITERAL element and the INDEXED store as "the
same boundary one destination over" and expected each to need its own reservation walk. They
did not: the narrow has ONE entry point (`emitExpr`'s `pendingLitUnion` hook, which every
atom-typed destination already seeds), and all three destinations are EXPRESSION positions, so
`exprPopBits` — the value-position walk that already reserves the `.pop` frames — reaches them
all. Pinned as `tests/cases/literal-unions/inline-litunion-call-into-container.vl`, which
includes an evaluation-COUNT row: a tower that re-read the call per member would be a wrong
answer, not a refusal.

**LOUD DID NOT MEAN A DIFFERENT RUNG.** D13 was the only loud member of a class whose other
three directions were silent miscompiles, and the standing warning in *Root D* — that message
identity and root identity are independent in both directions — applies to SEVERITY too. The
severity split was an artifact of which side of the seam had a conversion available: at a
container store the emitter could see that the reps disagreed and refuse, and at the three
argument/result boundaries it could not see it at all.

---

### D14 — [CLOSED 2026-08-25] `f32[] | null` (audit row R2) was loud at every operation
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 140 cells carry `field access but no struct type declared`; `list_f32` was the worst-served rep in the whole sweep, 76 correct of 340**

Repro:

    function mk(): f32[] | null { return [1.25] }
    function body() {
      const w: f32[] | null = mk()
      if w != null { print(w.length) } else { print("N") }
    }
    body()
    // vl check rc 0; vl run: emitProgram: field access but no struct type declared

Controls, both correct: the `f64[] | null` twin; the non-nullable `f32[]`.

**THE DIVERGENCE SITE WAS ONE FUNCTION, AND THE `f64` TWIN ALREADY CONTAINED THE ARM.**
`exprF64Array` opens with `tyIsF64Array(nodeTyIxOf(exprIx))` — it trusts the type the CHECKER
recorded, which on a read inside `if v != null` is the narrowed, non-null `f64[]`, and every
position rides that one line. `exprF32Array` opened with `tyIsF32Array`, spelled
`tyKindOf(ty) == 21` against a helper whose return set is {-1,0,2,3,7,10,11,12,13,20} — a
CONSTANT FALSE that read like the same fast path. Every remaining rung in it asks a NAME
(`declaredF32Array` / `paramF32Array` / `globalIsF32ArraySid` / `capturedKindOf`), and a
`f32[] | null` name declares `"nulf32list"`, which none of them accepts. So the narrowed read
fell past the entire list ladder to the struct-field floor and reported the generic
field-access message — at every position at once, which is why this row was 174 cells wide
while the other nullable niches were narrow.

The arena CAN answer, structurally (`TyArray` -> `TyPrim "f32"`); that test already existed
one screen up as `callResTyIsF32Array`, scoped to curried-call results. It is now
`tyIsF32ArrayShape` and is attached to `exprF32Array`'s **IDENT** and **MEMBER** arms.

**NOT at the top of the function — that placement is wrong twice, and both were measured.**
Enabling it there reaches the same 250/340, and breaks two pinned corpus fixtures:

| shape | fixture | what the top placement does |
|---|---|---|
| `ArrayLit` | `unions/f32-list-union-member.vl` | `const g: f32[] \| string = [63.5]` records the union's `f32[]` ARM on the literal while the literal still BUILDS the f64 list — the coerce is what re-encodes it. Claiming the literal skips the coerce and boxes an `(ref $fl64)` payload under the f32-list atom tag: `wasm trap: cast failure`. |
| `Index` | `arrays/nested-array-inferred-empty-unsupported-leaf.vl` | an element read's rep comes from the CONTAINER's interned row, and the inferred-empty nested-array synthesis DECLINES an `f32[]` leaf on purpose (`tyNestedArrLeafSupported`). Claiming `outer[0]` turns that pinned loud decline into check-clean INVALID WASM. |

The second is the severity regression #1467 warned about, reproduced exactly: a partial fix
that converts a loud reject into a silent miscompile is site 1 of N, not a fix. Restricting
the leg to the two node shapes whose cell rep the declaration already fixed keeps both
fixtures at their pinned verdicts and still moves all 174 cells.

**Before / after, same 340 `list_f32` cells, same harness** (`correct` / denominator; the
`list_f64` column is the twin measured on the same run):

| position | before | after | `list_f64` |
|---|---|---|---|
| const_local | 14 / 40 | **40 / 40** | 40 / 40 |
| let_local | 6 / 16 | **16 / 16** | 16 / 16 |
| param | 6 / 28 | **28 / 28** | 28 / 28 |
| ret_ann | 6 / 28 | **28 / 28** | 28 / 28 |
| ret_unann | 6 / 16 | **16 / 16** | 16 / 16 |
| global | 6 / 28 | **28 / 28** | 28 / 28 |
| field | 6 / 28 | **28 / 28** | 28 / 28 |
| field_place | 0 / 8 | **8 / 8** | 8 / 8 |
| elem | 6 / 28 | **28 / 28** | 28 / 28 |
| mapget | 0 / 8 | **8 / 8** | 8 / 8 |
| mapval | 0 / 28 | **2 / 28** | 2 / 28 |
| capture | 4 / 28 | 4 / 28 | 4 / 28 |
| loopvar | 4 / 28 | 4 / 28 | 4 / 28 |
| callres | 12 / 12 | 12 / 12 | 12 / 12 |
| elem_place | 0 / 8 | 0 / 8 | 0 / 8 |
| mapval_place | 0 / 8 | 0 / 8 | 0 / 8 |
| **TOTAL** | **76 / 340** | **250 / 340** | **250 / 340** |

174 cells moved and **every one of them was `loud_emit_reject` -> `correct`**; nothing moved
the other way and the rep's SILENT total stayed 0. Joined coordinate-for-coordinate against
`list_f64` the two reps now differ on **0 of 340** cells — the residue (capture, loopvar,
mapval, the two `*_place` check rejects) is shared with `f64` and is therefore not this row.
**That residue is now filed as D20**, re-probed per (position, rep): it is a nullable-list
niche with no rep at three positions, 360 cells across every list rep, and nothing in this
fix touches it.
Corpus byte-identity across the whole `tests/cases` tree: **2,232 of 2,233 identical**, the
single mover being the new fixture, which the old compiler cannot emit at all.

* Pin: `tests/cases/arrays/nullable-f32-list-narrowed-positions.vl` (one narrowed read per
  moved position, with the lint hints DECLARED rather than the annotations deleted — each
  annotation IS the position under test).
* **FULL GRID, before and after on the closing branch**: `correct` **6,909 -> 7,083**, loud
  emit **1,018 -> 844**, loud check 1,199 -> 1,199, SILENT TOTAL **0 -> 0**. Cell for cell,
  exactly those 174 cells moved and nothing else in the other 21 reps did.
* **THE CORPUS WAS BLIND TO THIS, and the byte-identity number is the proof**: all 2,232
  pre-existing fixtures emit byte-identical modules, because not one of them narrowed an
  `f32[] | null`. A rep-by-position grid found it; no amount of corpus green would have.

---

### D15 — [CLOSED 2026-08-25] `??` applied to a NON-nullable value reports a map-index rule
**CLOSED 2026-08-25 — the repro now RUNS. Was: loud emit reject · 224 cells carry this message (204 when re-measured at `c0ee3089`, after D14's f32 work moved 20 of them)**

Repro:

    function mk(): i32 { return 7 }
    print(mk() ?? 0)
    // vl check rc 0; vl run: emitProgram: `??` is only supported on a map index get

Control: make the operand nullable (`function mk2(): i32 | null`) — correct.

* A useless `??` is a lint-level fact the checker should state at check time; instead it
  survives to emit and reports a rule about map index gets, which is not the reason. This
  is the single most common loud message in the sweep and most of its firings are of this
  shape, so it is worth correcting for the diagnostic alone.

**CLOSED — the policy, and what decided it.** `x ?? d` over an operand that cannot be null
is USELESS, not ill-formed: the operator is total and its value is `x`. It is now ACCEPTED
and lowered as the identity on the left operand, and the redundancy is STATED at check time
as a `warning` (`dead-coalesce-default`) rather than blocking the build. Against a check-time
error: `tests/cases/soundness/narrowed-read-coalesce-lowers.vl` pins `if p != null { print(p
?? 0) }` as correct at ten sites, and that shape types `p` NON-nullable at the read, so an
error keyed on the flow type would reject a contract the compiler deliberately supports.
Measured with narrowed places exempt, the rule fires **zero** times across `compiler/*.vl`
(494 `??` uses), `std/*.vl` and ~1,450 corpus fixtures — every `??` this compiler writes is
on a genuinely nullable operand; without the exemption it fires 10 times and all 10 are that
soundness fixture. Swift and Kotlin warn on the same construct, and VL's own parse-only lint
already reports the same family (`constant-condition`, a branch never taken) at `warning`.

**THE FOLD IS A REWRITE, NOT AN EMIT ARM, and that is measured.** Lowering the identity
inside `emitCoalesce` gives the right BYTES and leaves the `??` NODE for `exprString` /
`exprIsLitAtom` / the print-import chooser to classify — and each of their `??` arms answers
only for a NULLABLE operand. On these same 9,126 cells that version turned 132 loud rejects
into `correct` **and 62 into SILENT failures** (40 invalid-wasm on `string` / inline
litunion, 22 wrong-value on a named litunion printing its raw atom id). Folding the node in
`emit_rewrite.vl` leaves nothing to classify. Safe to fold early because every fused `??`
lowering needs a nullable operand: `m[k]`, `m.get(k)`, `xs.get(i)`, `xs.pop()` are all typed
`V | null`, so the query declines them.

The residue keeps a loud reject and finally names itself: ``emitProgram: `??` over this
nullable value is not supported yet — narrow it first, e.g. `if v != null { … }` ``, 204 → 10
cells. Pins: `tests/cases/expressions/coalesce-non-nullable-folds.vl`, and
`tests/cases/maps/error-nonmap-coalesce.vl` (the one fixture that held the old text — a
`K0 | null` operand, i.e. exactly the residue).

---

### D16 — [CLOSED 2026-08-25] an UN-ANNOTATED function returning an empty `[]`, passed on or returned, emits invalid wasm
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · 28 cells of a 384-cell grid · UNFIXED, filed by the D4/Shape-A slice**

CLOSED by reading the hole's element rep off the type the CHECKER unified it with, recorded on
the literal node itself (`emptyArrHoleKind` / `emptyArrHoleBuildKind`, `compiler/emit_classify.vl`).
The "Why it is not fixed here" note below asked for "a contextual seed at the argument boundary or
a reject scoped to a call-result hole" — neither was needed, because the context had already been
propagated: `vl check` was clean precisely because the checker HAD unified the hole with the slot.
The two emit-side readers of that unification disagreed. The RESULT VALTYPE was minted from it via
`exprStringArray`'s typed fast path (which is why `string`/`f64`/`i64` producers declared the right
wrapper) while the `return []` BUILD had no annotation node to seed from and fell to the default
i32 list; for `f32`/`u8`/struct/closure/nested elements neither reader answered and the SIGNATURE
was wrong too. Both now read the same node.

Verified over a 203-cell grid (8 non-i32 element reps × {named, lambda, annotated} producers ×
{call argument, typed return, typed local, typed global, two hops, push-after-arrival}, plus
`[[]]`, an unconsumed hole, a `.length`-only hole and two two-slot programs): **98 SILENT before,
0 after**. The two remaining non-running cells are the two-slot programs, and they are LOUD — one
hole reaching `string[]` and `f64[]` in one program is `type error … argument 1: expected f64[],
got string[]` at `vl check`, so the compiler never silently picks one.

This entry was not in the original sweep's population. It was found by the grid that fixed D4
and the empty-`[]` compiler trap, where it is the residual: 16 of its cells are red on master
untouched by that fix, and the other 12 were previously masked BY the compiler trap (they were
`compiler_trap` cells whose un-annotated NAMED-function twins were already this).

Repro (`string` element; the same holds for `f32`, `f64`, `i64`, `i32[]` and a struct element,
and for the un-annotated LAMBDA spelling of the producer):

    function sink(xs: string[]) { print(xs.length) }
    function fq() { return [] }
    function main() { sink(fq()) }
    main()
    // vl check rc 0, no diagnostic. Module written (789 bytes); the engine rejects it:
    //   type mismatch: expected (ref $type), found (ref $type) (at offset 0xe8)

Controls, both correct:

* the SAME producer consumed by `.length` / an index / a `for`-in (`print(fq().length)` → `0`),
  so the hole return is not itself unlowerable — only its flow into a slot that demands a
  concrete element rep;
* the producer ANNOTATED (`function fq(): string[] { return [] }`), which lowers.

* **Flat on**: the producer spelling (an un-annotated named function and an un-annotated lambda
  behave identically — that equality is an invariant the D4 slice established and it holds
  across all 8 element types × 6 consumers).
* **Varies on**: the CONSUMER (only `passon` and `ret`, 0 of the other four) and the element rep
  (the i32/boolean shared list backing is clean; every rep with its own backing is not).
* **Why it is not fixed here**: an empty `[]` passed DIRECTLY (`sink([])`) must stay legal and
  gets its element rep contextually from the parameter. A call RESULT cannot, so the fix is
  either a contextual seed at the argument boundary or a reject scoped to a call-result hole —
  a reject-parity change with its own evidence to gather. The annotated-lambda sibling of this
  shape ships as a loud floor instead (`tests/cases/arrays/
  lambda-empty-array-ref-element-rejected.vl`).

---

### D17 — [CLOSED 2026-08-25] an empty `[]` in a STRUCT-FIELD initializer is never pinned by the field's type
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · found while closing D16 · the root was the CHECKER, not the emitter · 111 SILENT cells of a 231-cell grid, 0 after**

CLOSED, with D18, by ONE change: `constrainEmpty` (`compiler/typecheck.vl`) now recurses through a
STRUCT FIELD, a MAP VALUE and a `| null` wrapper, and the three WRITE spellings that never called it
at all now do (`x = e`, `m.set(k, v)`, `xs.push(v)`). The row's own prediction held in both halves:
the fix belongs in `typecheck.vl`, and the D16 emit-side seed (`emptyArrHoleKind`, read off the
literal node) is what lowers them once the checker pins — **no emitter line changed**.

ONE ROOT, NOT TWO, and that was measured rather than assumed: the walk already recursed through an
ARRAY destination's element (`const xss: string[][] = [fq()]` has never been red), so the container
positions were not three defects but three arms missing from one recursion. D17, D18 and the write
spellings all close on it together.

THE CONFLICTING-CONSUMER RULE WAS CHOSEN: a hole pins from the FIRST consumer that reaches it and a
conflicting later use is a loud type error — the rule the call-argument position has shipped since
D16. "Reject as ambiguous" was considered and refused: the accept/reject VERDICT is already
order-independent (all 10 conflicting pairs measured reject in both orders; only the wording names
whichever consumer came second), so ambiguity would buy no determinism, and a second rule for the
container positions would make one program's verdict depend on which slot the author wrote it into.
Both behaviours are pinned: `tests/cases/arrays/empty-hole-pinned-by-container-position.vl` (accept)
and `tests/cases/arrays/empty-hole-container-conflict-rejected.vl` (reject, both orders and a
same-statement conflict).

THE ONE TRAP, worth reading before touching this walk again: **the pin erases its own trigger.**
`assignableExpr` records an ObjLit/ArrayLit's destination rep on the `nodeRepTyIx` sidecar only
while the literal still REACHES an open hole (`tyReachesEmptyHole` gates `recordRepTyAdopt`).
Pinning first makes that gate false, the rep is never recorded, and the literal falls back to
structural row resolution — which has no answer for a self-referential map value:
`tests/cases/types/recursive-map-value.vl` went `emitProgram: map value type has no interned slot`,
the one corpus file the field-wise pin reddened. `constrainEmptyExpr` records on the SAME condition
BEFORE pinning. Reordering to check-first instead would lose a same-statement conflict, so the
order is load-bearing in both directions.

Repro:

    type W = { xs: string[] }
    function fq() { return [] }
    const w: W = { xs: fq() }
    print(w.xs.length)
    // vl check rc 0, no diagnostic. Module written; the engine rejects it:
    //   type mismatch: expected (ref $type), found (ref $type)

THE DISCRIMINATOR FROM D16, and it is what makes this a different defect rather than a leg
of that one. D16 was two emit-side readers disagreeing about a fact the CHECKER had already
established — `vl check` was clean *because* the hole had been unified with the consuming
slot, and the fix was to make both readers take it from the literal node. Here the checker
establishes nothing: add a SECOND, conflicting consumer and it still says nothing.

    type W = { xs: string[] }
    function fq() { return [] }
    const w: W = { xs: fq() }
    function sinkF(ys: f64[]) { print(ys.length) }
    sinkF(fq())
    print(w.xs.length)
    // vl check rc 0 — `fq()` is accepted into a `string[]` FIELD and an `f64[]` PARAM in one
    // program. The argument position alone would be `argument 1: expected f64[], got string[]`.

So the struct-field position did not propagate its element type back to an un-annotated
producer at all. There was no fact on the literal node for the emitter to read, `fq`'s result
valtype and its `struct.new` agreed with each other at the i32 default, and the mismatch was at
the `struct.set` into the field. **The fix belonged in `typecheck.vl`** — the field position
joined the positions that pin a hole — and only then did the D16 emit-side seed answer. Both
programs above are now loud: the second is `argument 1: expected f64[], got string[]`.

* Control: `const w: W = { xs: [] }` — a DIRECT empty literal in the same field — lowered throughout,
  because the field annotation seeds the build (`seedFieldListBuild`). It was the call RESULT that was
  unpinned; the control is pinned as leg L7 of the accept fixture so a wider fix cannot quietly
  replace it.
* Pre-existing: the same program was check-clean invalid wasm on master before the D16 fix, and
  after it, unchanged in both directions.
* Grid: 21 positions × 11 element reps = **231 cells; 111 SILENT before, 0 after**,
  with `emit_reject` flat at 30 (the pre-existing `u8`-element and nullable-map-value loud floors) and
  `check_reject` flat at 0. Corpus sweep PASS=1697 CHECKFAIL=0 RUNFAIL=0 LOGDIFF=0.

---

### D18 — [CLOSED 2026-08-25] an empty `[]` assigned into a MAP VALUE is never pinned by the map's value type
**CLOSED 2026-08-25 — the repro now RUNS. Was: check-clean INVALID WASM · found while closing D16 · D17's twin, one container out**

Repro:

    function fq() { return [] }
    const m: {[string]: f64[]} = Map()
    m["a"] = fq()
    print((m["a"] ?? [1.0]).length)
    // vl check rc 0, no diagnostic. Module written; the engine rejects it:
    //   type mismatch: expected (ref null $type), found (ref $type)

Same root as D17, and the prediction in this paragraph is the one that was tested: the map-value
position did not pin an un-annotated producer's hole either, so the emitter had nothing to
read and the i32-list wrapper was stored into an `f64[]`-valued cell. The checker learned to
pin a hole from a container's declared element/value type, and **both rows closed together on the
one recursion**, with the D16 seed making them lower. See D17 for the mechanism, the
conflicting-consumer ruling and the grid.

* The `.set` SPELLING was the residue, and it is why this row is not merely D17 restated: `m[k] = v`
  and `m.set(k, v)` are two write paths, and the first fix closed only the first — 7 cells stayed
  SILENT until `.set` (and `.push`, the array sibling) called the same pin. The map arms already
  state that rule for their key/value HOLES one screen up; the VALUE ARGUMENT's own holes were the
  half that never followed it.
* Pinned: `tests/cases/maps/empty-hole-pinned-by-map-value.vl` (this repro, the `.set` twin, a
  struct-valued map, a nested map and the direct-`[]` control).
* Pre-existing: identical outcome on master before the D16 fix and after it.

---

### D19 — [CLOSED 2026-08-26] a MISS on a DECLARED-nullable numeric-litunion map, read at MODULE SCOPE, traps
**CLOSED 2026-08-26 — the repro now RUNS and prints `1` / `absent`, the same two lines its function-scope control always printed. Was: check-clean LOADS THEN TRAPS · found while closing D6, filed unfixed · module scope only. It was one rep of a seven-rep class the scope-crossed sweep then measured whole — see "THE SCOPE AXIS" below**

Repro:

    type N2 = 1 | 2
    const d: {[string]: N2 | null} = Map()
    d["a"] = 1
    const dhit = d["a"]
    if dhit != null { print(dhit) } else { print("absent") }
    const dmiss = d["nope"]
    if dmiss != null { print(dmiss) } else { print("absent") }
    // vl check rc 0; module written and LOADED; prints `1`, then:
    //   wasm trap: null reference
    //   note: a null value was used where a non-null one was required.

Control — the SAME seven lines inside a function print `1` / `absent`:

    function body() {
      const d: {[string]: N2 | null} = Map()
      d["a"] = 1
      const dhit = d["a"]
      if dhit != null { print(dhit) } else { print("absent") }
      const dmiss = d["nope"]
      if dmiss != null { print(dmiss) } else { print("absent") }
    }
    body()

* **PRE-EXISTING, measured in both directions.** Byte-identical modules before and after the
  D6 fix (`md5 ac93932e`, 3354 bytes), so that change neither caused nor cured it.
* **THE ROOT, and it is one missing arm.** `emitStartFnCode`'s global-init ladder
  (`compiler/emit_sections.vl`) is the module-scope twin of `emitLetDeclStmt`'s kind ladder,
  arm for arm — map, nulmap, struct, nulstruct, variant, nulvariant, nulbool, nulstring,
  litunion, nullitunion, list, nullist, the three nullable scalar lists, nulreflist,
  nulclosure, union. The one arm it never grew is `letNulMapReadUnionBox` →
  `emitMapGetUnionBox`, so a bare top-level `const t = m[k]` over a UNION-BOX-valued map fell
  through to `emitExpr` → `emitMapGet`, whose miss arm yields "the rep's empty value" — a
  BARE `ref.null`. The consuming `!= null` is a TAG COMPARE that recovers the box first, read
  straight off the disassembly of the repro and its control:

  | | miss arm the module emits | the null test that follows |
  |---|---|---|
  | inside a function | `i32.const 6 ; ref.null none ; struct.new $uBox` | `ref.as_non_null ; struct.get $uBox 0 ; i32.ne 6` |
  | **at module scope** | **`ref.null $uBox`** | the same three instructions — and the recover traps |

  The fix routes the module-scope init through the same `emitMapGetUnionBox`. It is 20 lines
  in `emitStartFnCode` plus an `export` on the helper; no layout, no new heap type, no
  allocation change (the miss builds the box it was already meant to build).
* **The value type is DECLARED nullable**, so this is not D6's implicit-`T?` seam — but the
  scope-crossed grid showed the implicit spelling has the same hole: `{[string]: string|i32}`
  read at module scope trapped identically with no `| null` in the program at all. The axis
  really is the STORAGE CLASS of the executing body, and the row's own reading of it was
  right.
* **`trap_loads` — the outcome vocabulary now has this state.** The former bullet here said
  `check-filed-witnesses.py` could not say what this row was, because a module that exists
  plus a non-zero run rc graded `silent_invalid_wasm`, and the status line was worded to grade
  as filed while the prose said the truth. That workaround is gone: the classifier now splits
  the two on the same marker vocabulary `grade.py` uses, `--self-test` proves the state fires
  (a program that prints `2` then indexes out of bounds routed `silent_invalid_wasm` before
  and `trap_loads` after), and **re-grading all 24 rows found no other row hiding behind the
  conflation** — D22, D23 and D24 stay `silent_invalid_wasm` under the sharper classifier,
  which is now a measurement rather than an assumption.
* **NOW PINNED, and the earlier refusal to pin was right at the time.**
  `maps/numlit-value-annotated-miss.vl` deliberately kept only the function-scope control,
  because pinning a trap freezes it as contract. A CLOSED trap is a different object:
  `tests/cases/maps/module-scope-union-box-map-read-miss.vl` is a `@run` fixture carrying all
  four affected value shapes at module scope plus the function-scope control in the same file,
  and it traps on master's own seed (`d7cab73e`) and runs on this branch.

---

### D20 — [CLOSED 2026-08-26: `loopvar` whole; `mapval` at FUNCTION SCOPE] a NULLABLE LIST had no niche rep at `loopvar` or `mapval`
**CLOSED 2026-08-26 — the repro, which is the `loopvar` leg, now RUNS. `mapval` closes 108/120 at FUNCTION scope and 48/60 at MODULE scope, and its residual is pinned and attributed below — read that before quoting this row as whole. Was: loud emit reject · 264 cells (`loopvar` 120 + `mapval` 144) · filed 2026-08-25 alongside D14, because it is what D14's residue turned out to be. Its `capture` leg was D9 and closed first**

Repro:

    function mk(): f64[] | null { return [1.5, 2.5] }
    function body() {
      const xs: (f64[] | null)[] = [mk()]
      for w in xs {
        if w != null { print(w.length) } else { print("N") }
      }
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, both correct: the same loop with the element made NON-nullable (`f64[]`); the same
loop over the SHARED-backing `(i32[] | null)[]`, which was clean at this position all along.

**THE THREE LEGS WERE THREE SITES, AND THE PROOF IS THAT EACH FIX REACHED EXACTLY ONE.** D9's
change (the capture storage class in `exprNulScalarListKind` / `exprNullableMap` /
`exprNulClosure`) moved 144 cells and **0 at `loopvar`, 0 at `mapval`** — so the shared
`bare null needs a struct-typed context` between the capture and loopvar legs was message
identity, not root identity, exactly as §3's Root D warns in the direction people forget.
Closing `loopvar` and `mapval` then took two more pairs of sites, sharing no code with D9's and
almost none with each other's.

#### `loopvar` — `forInElemKind` and the element read are ONE decision

Two coordinated sites, shipped together because either alone is worse than neither:

* `forInElemKind`'s ref-array ladder (`compiler/emit_classify.vl`) split the nullable niche for
  element kind 4 (`nullist`), a nullable struct (`nulstruct`) and `(string | null)[]`
  (`nulstr`), and NOT for kinds 6 / 7 / 8 / 10 / 9 — the four distinct-backing leaf lists and
  the nested ref array. A loop variable IS a declared local (`declareForInLocals` →
  `addLocalName`), so `declaredKind` reaches it; the kind STORED there was the non-null one.
  Those five arms now ask `rlElemIsNulNiche`, with the matching `fiLk` / `fiVarIdx` / `fiLs`
  rows in `declareForInLocals`.
* `emitForInStmt`'s element read (`compiler/wasmEmit.vl`) recovers each element
  `ref.as_non_null` from the `(ref null <elem>)` backing slot, off an explicit kind set. The
  five new niche kinds had to enter its wrapper/backing set and stay OUT of its recover set.

**ADDING THE FIVE ARMS ALONE IS A SEVERITY REGRESSION, AND IT IS MEASURED, NOT ARGUED.** Built
as its own compiler on this base and run over the same 120-cell grid: `loud emit reject` 70 →
0, `correct` 35 → 20, **`check-clean INVALID WASM` 0 → 100** (`type mismatch: expected
(ref null $w), found (ref $w)` — the slot is nullable, the recovered value is not). SILENT goes
**15 → 100**. Every cell of the five affected reps lands there; `i32[]` stays correct precisely
because its `nullist` arm was always paired this way.

#### `mapval` — NOT a layout change, which is what this row assumed

The filed assessment — *"a nullable-list map VALUE needs an mv slot that does not exist, which
is a layout change, not a missing arm"* — **is refuted.** A ref-valued map's `vals` element is
`(ref null <elem>)` for EVERY value kind; that is what lets a MISS read as null. So a stored
null needs no new slot shape, exactly as it needs none for the `{[K]: S | null}` /
`{[K]: {[K]: V} | null}` / `{[K]: (() => T) | null}` niches the layer already lowers. Two
coordinated sites again:

* `nulRefMapValInnerOf` excluded a list inner outright, so the value fell past the niche branch
  into the atom counting, whose single-ref-member arm answers the `-3` loud reject.
  `mvValKindOfName` now answers **kind 6** for a list inner — the same kind the NON-nullable
  list value gets — and the arm sits ABOVE the struct probe, which is the whole point. The
  original exclusion existed because `structIndexByValName`'s field-name parse ignores a
  trailing `[]`, so `{f: f64}[]` matched the ELEMENT struct and minted a kind-1 slot whose vals
  element the list store then filled with a `(ref $rlWrap)` — invalid wasm at `vl check` rc 0
  (fuzz frontier seed 615401451 d6). ORDERING answers that; excluding the whole family was the
  expensive way to avoid it.
* `forInElemKind`'s `.values()` arm answered `mvListValKind` — the NON-null list kind — for a
  kind-6 value. That is the loopvar bug again at the map-vals walk: the element read would
  recover a stored null non-null. It now answers `mvNulListValKind` when `mvSlotNullable`, and
  the recover-set change above serves both walks.

**Price of the layout change that was NOT needed**: nothing. No layout, no new heap type, no
new element slot, no allocation, no goldens.

#### `mapval` at MODULE SCOPE — a residual, and it is NOT this row's axis

**Caught in review, not by my grid, and the reason is worth recording: every leg of the
`mapval` fixture was inside a function**, so the fixture could not tell "closed" from "closed
at function scope". The witness is five lines with exactly one thing changed:

    const m: {[string]: f64[] | null} = Map()   // at MODULE scope: loud
    m["a"] = [1.5, 2.5]                          // the same five lines inside a
    const v = m["a"]                             // function: prints 2
    if v != null { print(v.length) } else { print("N") }
    // emitProgram: bare null needs a struct-typed context

Re-measured as a **2×2 of scope × NULLABILITY** — 6 list reps × 5 map operations × 2 runtime
inputs per quadrant, 240 cells, `records == cells` asserted:

| | `V \| null` | `V` (non-nullable) |
|---|---|---|
| function scope | 0/60 → **60/60** | 60/60 → 60/60 |
| **MODULE scope** | 0/60 → **48/60** | **48/60 → 48/60** |

**The `V` column does not move on either side, and that is the whole answer.** The 12 cells
that stay loud in each MODULE row are the *same 12 coordinates* — the `read` operation, every
rep, both inputs — and they are loud on master with a value type carrying no `| null` at all.
So module scope here is not a nullability axis and not a scope axis in general: `.size`,
`.has`, `?? d` and `.values()` over the same nullable-list map all reach 12/12 at module
scope, and a nullable STRING or nullable MAP value binds fine there (`{[string]: string |
null}` and `{[string]: {[string]: i32} | null}` both run at module scope, before and after).

**The missing rung, named.** A module-scope binding is a GLOBAL cell, so its kind resolves
through `letNulScalarListKind` → `exprNulScalarListKind(d.letInit)`; a function-local one
resolves through `letCellKind` / `letInitCellKind`, which DO carry a `mapReadMvSlot` arm. That
is the entire difference. The Index arm of the list-family nullable classifiers
(`exprNulScalarListKind` / `exprNullableList` / `exprNullableRefArray`) reads a
`(T[] | null)[]` ELEMENT and nothing else, while `exprNullableStruct` (`mvValKind == 1`), the
`nulstr` classifier (`== 3`), the union-box one (`== 2`) and the closure one (`== 14`) each ask
`mapReadMvSlot`. **Value kind 6 — a list — is the one kind with no consumer arm.**

**That rung also subsumes this row's other residual.** The 12 function-scope `mapval` cells
that stay loud are the INLINE `m[k] == null` spelling, which is the same rung asked with no
binding at all. One rung closes both; the two pins name each other and should be deleted
together.

**NOT WIDENED HERE, deliberately.** It is one rung conceptually but three classifier sites,
and closing it changes behaviour for NON-nullable list-valued maps — master's territory, not
this row's axis, and precisely the shape of widening that has twice turned a loud reject into a
silent one in this programme. The measurement above is what makes it schedulable without a
second investigation.

**Is it D19's axis?** *Adjacent, not shared* — and this is a probe, not a reading. D19 is a
check-clean **TRAP** on a MISS over a declared-nullable numeric-litunion map; this is a
**loud emit reject** over a list-valued map that fails identically when the value type is not
nullable at all, which D19's does not. They share the module-scope discriminator and nothing
below it: D19's mechanism is a miss-versus-stored-null confusion in the union-box value rep
that reaches runtime, and this one never emits a module. What the two DO jointly establish is
that **a module-scope binding is a storage class the classifiers under-serve** — two
independent rows now turn on it, which makes it a candidate axis for a sweep of its own rather
than a coincidence. This fix's own sites cannot see it: they classify a value TYPE from a
spelling and are storage-class blind by construction; the residual is in binding
classification, which is D21's ladder, not this one's.

> **THE SWEEP WAS BUILT AND IT RULED ON BOTH HALVES — 2026-08-26, see "THE SCOPE AXIS"
> above.** *Adjacent, not shared* holds: D19's class closed on one arm in
> `emitStartFnCode` that this residual's coordinates never touch, and re-running the grid on
> the fixed compiler moved 38 cells, none of them here. What the axis DID change about this
> row is its size — **322 paired coordinates**, not the 12 its own 2×2 saw, are `correct`
> inside a function and `loud_emit_reject` at module scope, concentrated exactly where this
> row predicted (`mapval` 158, `mapget` 56, `field` 24, `elem` 24, `ret_unann` 12; 164 of
> them `bare null needs a struct-typed context`, 110 `` `is` test but no union type
> declared ``). **The "NOT WIDENED HERE, deliberately" ruling above stands, and the scope
> sweep is a reason to keep it** rather than to revisit it: the 322 are LOUD, the silent
> class that shared their axis had a different root, and folding the two together is how a
> loud reject becomes a silent one.

**One more thing the probes turned up, recorded so nobody spends the afternoon on it**:
annotating the binding is not a workaround and not scope-related. `const v: f64[] | null =
m["a"]` is a CHECKER reject — `cannot assign f64[] | null | null to 'v' of type f64[] | null` —
at module scope and inside a function alike. The map read's implicit `T?` is not collapsing
over an already-nullable value type. Separate defect, separate layer, not filed here.

#### The measurement

Three grids, each with its own declared axes and `records == cells` asserted per run. Baseline
is master's own compiler (`4628300f…`, byte-identical to the published `seed-latest`).

**`loopvar`**: 6 reps × 10 narrowing constructs × 2 runtime inputs = **120 cells**, plus the
same 120 at a `ctl_idx` CONTROL position (`const w: T | null = xs[0]`), which was already
120/120 correct and stays there — the fix moves nothing off the loop.

| verdict | before | after |
|---|---|---|
| correct | 35 | **120** |
| loud emit reject | 70 | **0** |
| **TRAP (emitted program)** | **15** | **0** |
| SILENT TOTAL | **15** | **0** |

Transitions, all 85 movers: `loud_emit → correct` **70**, `trap → correct` **15**. Nothing
moved in the other direction. Per rep, `correct` / 20: `string[]` 3 → 20, `f64[]` 3 → 20,
`i64[]` 3 → 20, `f32[]` 3 → 20, `S[]` 3 → 20, `i32[]` 20 → 20 (the control rep).

**THE ROW'S OWN "120 LOUD" WAS WRONG IN A WAY THAT MATTERED, and this is the refutation the
work turned up.** 15 of those cells were never loud. Three constructs — a body that never reads
the loop var, one that passes it to a `T | null` parameter, and one that copies it into an
annotated `T | null` local — never ask the null question, so nothing reached the classifier
fall-through. They compiled CLEAN and **trapped at runtime on the null element** (`a null value
was used where a non-null one was required`), because the element read recovered it. On the
present-value input those same three cells already ran correct, which is exactly why a
loud-reject census could not see them. `loopvar` was carrying a silent class, and the §1 tables
score it 0.

**`mapval`, at FUNCTION scope**: 6 reps × 10 map operations × 2 runtime inputs = **120
cells** (`{[string]: V | null}`, with one of the ten operations re-keyed to
`{[i32]: V | null}`). The module-scope quadrant is the separate 2×2 above.

| verdict | before | after |
|---|---|---|
| correct | 0 | **108** |
| loud emit reject | 120 | **12** |
| SILENT TOTAL | 0 | **0** |

All 108 movers are `loud_emit → correct`; per rep 0/20 → 18/20, flat. Per operation, 12/12 for
store+read, stored null, missing key, `?? d`, `.size`, `.has`, `.delete`, `.values()`, `.keys()`
and the i32-keyed row.

**The 12 that stay loud are a DIFFERENT defect and it has a control.** All 12 are the INLINE
`m[k] == null` spelling, and the same compare over a **NON-nullable** `{[string]: f64[]}` is
loud too — pinned as `tests/cases/maps/error-inline-null-compare-list-value.vl`. It is the
SAME missing rung as the module-scope residual above: value kind 6 has no `mapReadMvSlot` arm
on the list-family classifiers' Index arm, where kinds 1 / 2 / 3 / 14 all do. Binding the read
first (`const r = m[k]; if r != null`) lowers for both — at function scope. Orthogonal to
nullability, loud, never invalid wasm — do not re-open this row for either.

**Exotic value shapes, run because opening a niche is where a loud reject turns silent**: 10
further map value types × 2 inputs. 16 of 20 move `loud_emit → correct` (`u8[]`, `boolean[]`,
`i32[][]`, `(string|null)[]`, `(i32[]|null)[]`, `((i32) => i32)[]`, `{[string]: i32}[]`,
`S[][]`, a litunion `K[]`, `string[]`), **SILENT 0 → 0**. The 4 that stay loud: `u8[] | null`
keeps the `-3` decline by construction — the packed byte list is in neither
`scalarListKindOfName` nor `nameIsRefArray`, so the niche covers exactly the element reps its
non-null twin covers — and `(string | null)[] | null` reports a struct-field message, which its
NON-nullable twin `{[string]: (string | null)[]}` reports on master too, so the nullable form
now behaves exactly like the value it wraps.

* Corpus byte-identity across the whole `tests/cases` tree: **2,240 of 2,244 identical**, and
  every mover is a fixture this change adds. Three are the new `@run` files, which the old
  compiler cannot emit at all. The fourth is the module-scope pin, and its movement is itself
  a result: master rejects it `unsupported map value type` (the value rep did not exist) and
  this branch rejects it `bare null needs a struct-typed context` (the rep exists; the binding
  rung does not) — loud → loud, and the message change is the evidence that the value type IS
  now supported at module scope and something later refuses. The inline-compare pin is
  byte-identical on both sides. **THE PRE-EXISTING CORPUS WAS BLIND TO BOTH LEGS** — not one
  fixture iterated a `(T[] | null)[]` or declared a nullable-list map value.
* `scripts/rep-fuzz-check.sh`: `exact ✅ (0 baselined failures — 0 unsound, 0 reject; 0 new, 0
  stale)`.
* Pins: `tests/cases/arrays/nullable-list-elem-loopvar.vl` (all six reps, four narrowing
  spellings, and the three trap cells — a body that ignores the loop var, one that passes it
  on, one that copies it — so a future half-fix cannot pass by moving only the noisy ones);
  `tests/cases/maps/nullable-list-valued-map.vl`;
  `tests/cases/maps/nullable-struct-list-valued-map.vl` (the fuzz case that filed the ordering
  hazard, flipped from `@emit-error` to `@run`);
  `tests/cases/maps/error-inline-null-compare-list-value.vl` and
  `tests/cases/maps/error-module-scope-list-value-read-bind.vl` (the two residuals, each
  naming its own non-nullable control and the rung they share — delete them together).
* **The §1 `loopvar` and `mapval` rows predate this close** and still carry the pre-fix numbers
  (`loopvar` 470/780 correct, silent 0; `mapval` 460/822, silent 0). Both understate `correct`,
  and the `loopvar` one understates SILENT by the trap cells above; re-run the sweep before
  quoting either.
* **This was never D14 and never f32-specific.** When D14 closed, `list_f32` reached exact
  parity with `list_f64` — 0 differing cells of 340 — and the cells that stayed loud stayed
  loud in BOTH.

---

### D21 — an UN-ANNOTATED captured local loses its `| null` for EVERY nullable rep
**CLOSED 2026-08-26 (#1935) — the repro now RUNS. Was: loud emit reject · 168 of a 728-cell capture population · filed 2026-08-25 while closing D9, because D9's fix reaches every capture form EXCEPT this one**

Repro:

    function mk(): i32[] | null { return [1, 2] }
    function body() {
      const v = mk()
      function inner() { if v != null { print(v.length) } else { print("N") } }
      inner()
    }
    body()
    // vl check rc 0; vl run: emitProgram: bare null needs a struct-typed context

Controls, both correct: the same capture with the local ANNOTATED (`const v: i32[] | null =
mk()`); and the same un-annotated local read UNCAPTURED.

**IT IS NOT A REP AXIS — IT IS THE ANNOTATION.** Measured over four capture binding forms
(outer param / annotated local / un-annotated local / two frames deep) × thirteen reps × seven
narrowing constructs × two runtime inputs: after D9, the param / annotated-local / two-deep
forms are clean for every rep the compiler otherwise supports, and the un-annotated form is
loud for **every rep except plain `S`** — including `i32[] | null` and `S[] | null`, the two
that were D9's own working controls. 168 of 728, 14 per rep, flat.

The site: `captureValKind` types an ANNOTATED env field through `vtKindOfType(annotation)` and
an un-annotated one through `letInitCellKind`, whose ladder returns `map` / `nulstruct` /
`union` / the six non-null list kinds / `struct` / `list` / `str` / `i64` / `f32` / `f64` /
`closure` / `i32` — **no nullable kind but `nulstruct`**. So `const v = mk()` over a
`T | null`-returning call types the env field at the NON-NULL kind, `capturedKindOf` answers
the non-null kind to every classifier that asks, and the null test finds no nullable rep. That
is also why the row is loud rather than silent today: the field and the read agree, and they
are both wrong in the same direction.

**Do not fix it by widening `letInitCellKind` without measuring the other consumers.** It is
also `letCellKind`'s initializer arm, which feeds `criClassify` / `fnAssignRetKind` — and
`fnAssignKindGuard` right beside it already DECLINES `nulstr` / `nulclosure` / `nulmap` /
`nulreflist` at those consumers with a recorded reason per kind (a named `nulstr` there
converts a reject into a TRAP). A nullable kind admitted here has to be admitted at a
consumer's granularity, not the ladder's.

**HOW IT CLOSED (#1935), and the framing above that was half wrong.** It needed no design
change: `vl check` on `const v = mk(); print(v.length)` already reports `member access
'.length' on non-object i32[] | null`, so the checker knew the binding was nullable all
along, and the same un-annotated binding read UNCAPTURED already ran — `collectLocals`
handles it. The divergence was confined to the capture path and was a hand-copy that had
drifted, not a missing inference.

* **The arm diff, confirmed.** `collectLocals` (`emit_collect.vl:2454`) has eight nullable
  arms — `letNulLitUnion`, `letIsNulMap`, `letIsNulVariant`, `letIsNulRef`,
  `letIsNulListInfer`, `letNulScalarListKind`, `letIsNulRefArray`, `letIsNulClosure` /
  `letInfersNulClosure`, `letIsNulString`, `letNulBool` — plus the bare-map-read family
  (`letNulMapReadValKind` / `letNulMapReadUnionBox`). `letInitCellKind` had ONE
  (`letIsNulRef` → `nulstruct`). "Loud for every rep except plain `S`" and "the only
  nullable arm is `nulstruct`" are the same fact.
* **Fixed in two commits.** (1) `captureValKind` / `captureValStructIdx` were handing the
  `letIs*` family an `fnStmts` POSITION where it wants an ARENA index — filed in
  `captureValKind`'s own header, byte-neutral over 1825 corpus programs, and it had to land
  first because widening the ladder is what makes the mismatch live. (2) the ladder widened
  arm for arm to `collectLocals`, `captureValStructIdx`'s companion-index ladder widened to
  match, and `fnAssignKindGuard` lost its `variant` decline.
* **Both halves of the KIND/SLOT pair were needed.** With the kind arm alone, the
  `S[] | null` capture moved from one loud message (`bare null needs a struct-typed
  context`) to another (`ref valtype with no interned shape`), because
  `captureValStructIdx` had no `letIsNulRefArray` arm and answered slot -1.
* **The guard question, measured rather than reasoned.** Over a 432-cell implicit-return
  assignment grid (20 reps × 4 assignment shapes × 2–3 consumption modes × 2 inputs): 32
  cells moved, ALL improvements, 0 regressions. The only new decline decision that mattered
  ran the other way — `variant` was DECLINED and had to stop being, because `null` from that
  guard restores the `i32` default and an `i32` result valtype under a body pushing a
  `(ref $uVarHeap[vi])` is check-clean INVALID WASM. Four `variantann` cells were exactly
  that on master and are a loud emit reject now, pinned as
  `tests/cases/functions/tail-assign-variant-cell-reject.vl`. The `nulstr` decline, newly
  REACHED from the un-annotated local, delivered what it promised: 12 cells to `runs`.
* **The capture population after the fix: perfect annotation parity.** All four binding
  forms score identically — **180 `runs` / 0 loud emit reject / 2 loud check reject of 182
  each**, 140 cells moved and every one `loud emit reject → runs`. The only residual in the
  whole 728-cell grid is 8 cells: `match` over a literal-member union, a checker limitation,
  flat across all four forms and so not an annotation axis at all.
* **THE `nulvariant` RESIDUAL CLOSED, AND IT TOOK BOTH FIXES — measured, not assumed.** When
  this row was first written the residual was 14 per form at `Circle | null`, attributed to
  the D22–D24 call-boundary class rather than to the annotation axis. #1937 closed that class.
  Re-run on the merged base, the un-annotated `nulvariant` cells are a 2x2 over the two
  branches:

      neither fix   (master ea8e59aa)     14 cells loud emit reject
      D21 fix only  (branch pre-#1937)    14 cells loud emit reject
      #1937 only    (master 2788d76f)     14 cells loud emit reject
      BOTH          (branch merged)       14 cells RUN

  Neither fix alone moves a single one of them. The nullable-variant NICHE is resolved by the
  call-boundary ladders #1937 repaired, and reaching those ladders at all needs the capture
  ladder this row repairs — so the attribution was right and the two changes compose exactly.
  Pinned at the foot of `capture-unannotated-nullable-reps.vl`, where deleting either half
  restores `bare null needs a struct-typed context`.
* **No collateral.** Re-measured against each master this branch was merged onto; on
  `2788d76f` the figure is in the commit that merged it. Every corpus program that compiles
  under both seeds is BYTE-IDENTICAL under both; the only files that differ are the fixtures
  this change adds.
* Pins: `tests/cases/closures/capture-unannotated-nullable-reps.vl` (nine reps that moved,
  `Circle | null` for the two-fix composition above, and `S | null` — the one that already
  worked — kept as the control that a future half-fix cannot pass on alone) and `tests/cases/functions/tail-assign-variant-cell-reject.vl`.
  `tests/cases/closures/capture-nullable-niche-storage-class.vl` is the ANNOTATED control
  the first is measured against — the two must not diverge again.
* **WHAT THE `variant` RESULT OPENED, filed as D27 / D28 / D29 — ALL THREE CLOSED 2026-08-26
  (#1938).** Lifting that decline proved `fnAssignKindGuard`'s `null` is not a no-answer but
  an `i32`. The four SURVIVING declines were then each lifted ALONE over a 192-cell grid that
  is identical on master and on this branch: **all 76 of its check-clean-invalid-wasm cells
  are caused by a decline**, 70 becoming correct programs and 6 a trap, 0 backward. Four of
  the five recorded reasons are refuted by that measurement. The fifth (`nulstr`) survived
  THIS grid and did not survive the next one: its "the recover is UNCONDITIONAL" premise was
  false — the recover is gated on `nulStrReadStaysRaw`, and the missing condition was that the
  implicit-return-assignment position never declared itself a nullable-string target. The
  guard is now DELETED outright, not shortened.

---

### D22 — [CLOSED 2026-08-26] an object LITERAL as the argument to a `Circle | null` parameter is boxed into a niche slot
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 while fixing the call-argument non-null recover ladder · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset 252)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function go(v: Circle | null) {
      if v is Circle { return v.r }
      return -1
    }
    print(go(null))
    print(go({ r: 3 }))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — a `null` argument to the SAME parameter, and the SAME literal to a `Shape`
parameter, both run. It is the third combination that has no arm:

    print(go(null))          // fine — the niche's `ref.null` seed
    print(area({ r: 3 }))    // fine — a `Shape` param genuinely wants the box

* **THE MECHANISM IS THE BOX, NOT THE NULL.** `Circle | null` is the `nulvariant` NICHE — one
  non-null member, so no `{tag, value}` allocation — but an object literal in that argument
  position takes the union-BOX path because the program declares a union at all, and emits
  `struct.new $Circle ; struct.new $unionBox` into a slot typed `(ref null $Circle)`. The two
  `$type`s in the message are different heap types; the disassembler prints both by the same
  placeholder, which is why it reads like a nullability complaint and is not one.
* **IT WAS MASKED.** The same file's narrowed-`Circle | null` pass-through failed FIRST, in an
  earlier function, so the module never reached this one. Only fixing the narrow half surfaced
  it — the reason a grid takes the whole cross product instead of stopping at the first red
  cell.
* Pinned as `tests/cases/soundness/xfail-miscompile-nulvariant-literal-arg.vl`, which was also
  `tests/vl_check_codegen_test.ts`'s live `INVALID_MODULE_SRC` specimen.

**CLOSED 2026-08-26.** The ARGUMENT position never learned the niche's non-null half. The LET
position seeds the variant index from its annotation (`letAnnVariantIdx`) and the RETURN
position seeds the identical pair (`retNulVariantFlag` + `nulVariantIndexOf`); `emitDirectCall`
had only the null half (`cParamNulVariantHeap`, armed for a bare `null` argument), so an object
literal fell to `emitObj`'s union-program default. `cParamNulVariantIdx` is the third rung of
that pairing, seeded exactly as the kind-8 `cVi` seed beside it is.

The grid found the SAME root at one more position, and it is fixed here too: a local
ASSIGNMENT (`let c: Circle | null = null; c = { r: 5 }`) had no niche seed at all, while the
DECLARATION of the same binding did — two spellings of one binding disagreeing.

Graduated to `tests/cases/soundness/nulvariant-call-boundary.vl` (`@run`, 9 cells), which also
carries D24's direction. The xfail is deleted and `INVALID_MODULE_SRC` now names D25 below.

---

### D23 — [CLOSED 2026-08-26] a monomorphized parameter's rep pin answers `i32` for a narrowed nullable ref
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · 8 of a 192-cell call-argument grid · filed 2026-08-26 beside D22 · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset 235)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function useGen<T>(x: T, k: i32): i32 {
      return k
    }
    function go(v: Circle | null) {
      if v is Circle { return useGen(v, 7) }
      return -1
    }
    print(go(null))
    // vl check rc 0 (one unused-parameter warning); the engine refuses the module:
    //   type mismatch: expected i32, found (ref null $type)

Control — the SAME call against a NON-generic callee runs, and that is the whole difference:

    function useIt(x: Circle, k: i32): i32 { return k }
    function go2(v: Circle | null) {
      if v is Circle { return useIt(v, 7) }
      return -1
    }

* **A DIFFERENT ROOT FROM THE NON-GENERIC TWIN, AND THE MESSAGE SAYS SO.** The non-generic
  spelling reported `expected (ref $type), found (ref null $type)` — a missing coercion at a
  correctly-typed parameter, fixed by giving the call-argument recover ladder its `closure` and
  `variant` arms. This one reports `expected i32`: the monomorphizer's argument-type pin never
  learned the `nulvariant` rep, its cascade fell through to the catch-all, and the INSTANCE was
  emitted with an `i32` parameter. No coercion bridges that; the instance itself is wrong.
* **THE CATCH-ALL IS THE DEFECT, NOT THE MISSING ARM.** A cascade that answers `i32` when it
  does not recognise a rep will always mint a wrong instance silently; one that answers "no"
  gets the honest emit refusal the `readFile`-shaped `u8[]` spelling already produced. The
  same catch-all is what made a `u8[]` receiver pick the i32-list wrapper.
* **8 cells, and they are exactly the generic half of two reps**: `nulvariant` at direct /
  binding / nested delivery, and `nulreflist` reached through a struct FIELD read, each under
  both `is` and `!= null`. The other 184 cells of that grid run.
* Not pinned in the corpus: an `@error`/`@run` row cannot express "check-clean invalid module",
  and the class already has its live specimen in D22.

**CLOSED 2026-08-26, and the filing under-counted it.** A 26-cell rep grid over one
`dstGen<T>(x: T, k: i32)` destination found **7** silent cells, not 4: the three `nulvariant`
deliveries and the `nulreflist` field read as filed, the two `u8[]` spellings the row's own
prose predicted — and **the NON-NULL `variant` itself**, which the filing does not mention.
`x: Circle` handed to a generic was `vl check` rc 0 and `expected i32, found (ref $type)`.

The fix is the row's own diagnosis taken literally, in two parts:

* **A pin for the reps that have one.** `monoAnnPinName` claimed a struct, a union, the
  composite-list / scalar spellings and the nullable form of each, and NOT a declared union
  ARM — `isSName` declines a variant by construction (a variant has no struct row). One arm
  (`variantIndexOf(name) >= 0`) covers `Circle`, and because `monoNulAnnName` delegates its
  base to that same ladder, `Circle | null` comes with it. 4 cells → **runs**.
* **A FLOOR for the reps that do not**, because the catch-all is the defect: `""` fails the
  call loudly (`monomorphize: unsupported argument type for …`) instead of minting an i32
  instance over a `(ref …)`. Three floors, each measured silent-wrong first —
  `exprNullableVariant`, `exprNullableRefArray`, `exprU8Array` — plus the propagation of `""`
  through the un-annotated-let arm, without which `const xs = o.xs` re-entered the catch-all
  one binding later. 3 cells → **loud emit reject**.

  Deliberately narrow: the other nullable niches (`nullist`, `nulmap`, `nulstr`, `nulclosure`,
  the scalar lists, `boolean | null`) were measured RUNNING through the annotation channels,
  and a floor can only fire where the answer would have been `"i32"` — so an unmeasured
  widening could turn a working cell loud. D-SHAPEFIELD's rule, one ladder over.

Graduated to `tests/cases/soundness/nulvariant-generic-pin.vl` (`@run`); the two floors are
pinned as `…/error-generic-nulreflist-field-pin.vl` and `…/error-generic-u8-list-pin.vl`.

---

### D24 — [CLOSED 2026-08-26] a narrowed nullable union ARM handed to a UNION parameter is passed raw, never boxed
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 by the std review of the commit that retired the narrowed-callback carve-out · pre-existing, measured against master's published `seed-latest` (identical rejection, identical byte offset)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function go(c: Circle | null) {
      if c is Circle { return area(c) }
      return -1
    }
    print(go({ r: 5 }))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the SAME call with a NON-nullable `Circle` parameter boxes correctly and prints `5`:

    function go2(c: Circle) { return area(c) }
    print(go2({ r: 5 }))

* **THE ARGUMENT IS NOT BOXED AT ALL** — disassembled, `go` does `local.get 0 ; return_call
  $area` with no `struct.new $uBox` between them, handing a `(ref null $Circle)` niche to a
  parameter typed `(ref $uBox)`. So the message names a nullability mismatch and the defect is
  a missing BOX; the two `$type`s are different heap types.
* **IT IS NOT THE CALL-ARGUMENT RECOVER LADDER**, which is why fixing that ladder's `closure`
  and `variant` arms did not reach it. `emitDirectCall` routes a union-typed parameter through
  its own `cUNm != ""` branch to `emitUnionBoxArg`, which returns BEFORE the ladder's recovers
  run. Inside, `exprVariantIndex` answers -1 for a kind-19 `nulvariant` — it has arms for the
  kind-8 param, the declared local and the global, and none for the nullable niche — so the
  value falls through to `emitUnionCoerce` and is passed through raw.
* **THE FIX NEEDS AN ARM-FOR-ARM TWIN, not a one-arm patch.** `exprNullableVariant` answers
  this question across param / declared-local / global / call-result / field / index arms; an
  `exprNulVariantIndex` that covers only the param arm would close the witness below and leave
  the rest, which is the diagonal-for-a-cross-product mistake this repo keeps paying for. That
  scoping is why this row is filed rather than fixed in the commit that found it.
* **REACHABLE THROUGH `std:array`**, which is why the module header names it: `reduce`'s
  `init: A` is the only generic non-array parameter in std, and `reduce([1, 2], bump, c)` with
  a narrowed `c` and a `Shape`-accumulating `bump` reproduces it while importing only std. A
  plain STRUCT accumulator in the same shape runs; the same narrowed variant as `indexOf`'s
  `needle` gets an honest emit refusal instead.

**CLOSED 2026-08-26, and THE TWIN WAS ALREADY WRITTEN.** The row asked for an
`exprNulVariantIndex` built arm for arm against `exprNullableVariant`; `nulVariantIdxOfExpr`
already existed and was that twin, three arms short and two arms divergent. Completing it beat
minting a second home for one question, and completing it was the fix:

| `exprNullableVariant` arm | `nulVariantIdxOfExpr` before | after |
|---|---|---|
| `exprIx < 0` → false | -1 | unchanged |
| `Paren` → recurse | recurse | unchanged |
| `AsExpr` → `retNulVariantFlag(exprIx)` | `variantIndexOf(e.asTy)` — a NAME test that also answered for a NON-null `as Circle` | `nulVariantIndexOf(exprIx)`, the arena rung the flag IS |
| `Call`, `Ident` callee | `cloRetValSlot(cfe)` UNGATED — polymorphic over five kinds, so a `: P \| null` callee's STRUCT row came back as a variant index | gated on `cloRetValKind(cfe) == "nulvariant"` |
| `Call`, closure-VALUE callee (`calleeRetKindSid`) | **missing** | `calleeCloSigKeySid` + `sigKeyRetSlot`, gated on `sigKeyRetKind` |
| `Call`, `Member` callee | `cloRetValSlot(ffe)` ungated | gated on `cloRetValKind(ffe)` |
| `Ident` param | `nulVariantIndexOf(paramTypeNode(…))` | unchanged |
| `Ident` declared local | `localStructIdx[slot]` under `localIsRef` | unchanged |
| `Ident` CAPTURE | **missing** | `capturedNulVariantIdx`, the kind-gated reader on the companion-slot index space |
| `Ident` global | annotation, else recurse into the init | unchanged |

`emitUnionBoxArg` then gains one rung beside its `exprVariantIndex` rung, gated on the BOOLEAN
twin so the kind and the slot cannot come from different questions. The box's payload field is
`anyref`, so the niche rides it in the same three bytes the non-null variant ref does, and the
narrow that reached the position is what makes it sound.

**IT WAS NOT ONE POSITION.** A 20-cell POSITION grid (11 cells of this direction, 9 of D22's)
found the same missing box at every box-typed destination — the call argument, return,
annotated let, list element, `push`, map value, struct field, local assignment, if-expression
arm, nested argument, global cell. **10 of the 11** the `emitUnionBoxArg` rung fixed outright,
because they already route through it. The ELEVENTH — a struct FIELD — did not: the three
code-16 field sites (construct at `wasmEmit.vl:1274`, variant payload at `:1864`, field store
at `:13800`) called `emitUnionCoerce` directly, and a field cell IS the `(ref $uBox)`, so all
three now use the wrapper like every other box-typed position. That also fixed the NON-NULL
variant into a struct field, which was broken in the same way and is not a nullable question
at all (grid cell `variantIntoField`).

**AND ONE MORE STORAGE CLASS.** `exprVariantIndex` — the non-null twin — had param / declared /
global legs and no CAPTURE leg, while `captureValKind` types a `v: Circle` env field "variant"
and `captureValStructIdx` banks the index beside it. A captured variant handed to a union
parameter was never boxed, in the named-nested and the lambda spelling alike. `capturedVariantIndex`
is that reader, beside the `nulvariant` one the twin table above adds.

Graduated to `tests/cases/soundness/nulvariant-call-boundary.vl` (`@run`, 9 cells) together
with D22. `std/array.vl`'s live-`reduce`-cell paragraph is retired.

---

### D25 — [CLOSED 2026-08-26] a NARROWED argument's type does not ride the monomorphization pin
**CLOSED 2026-08-26 — the repro RUNS (prints 5). Was: check-clean invalid wasm · filed 2026-08-26 by the specimen hunt that followed D22/D23/D24 · pre-existing, measured ON THE FILED FILE against the parent commit (rc 0 / rc 1 there too, with the pin's older `expected (ref $type), found i32`)**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    export function area(sh: Shape) {
      if sh is Circle { return sh.r }
      return 0
    }
    function idg<T>(x: T): T {
      return x
    }
    function mkc(): Circle | null {
      return { r: 5 }
    }
    function go(c: Circle | null) {
      if c is Circle { return area(idg(c)) }
      return -1
    }
    print(go(mkc()))
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the same round trip on a NON-nullable variant runs and prints 5, and so does the
same narrowed value handed to a generic that does not return it (`dstGen<T>(x: T, k: i32)`):

    function go2(v: Circle) { return area(idg(v)) }     // prints 5
    function go3(c: Circle | null) {
      if c is Circle { return dstGen(c, 7) }            // prints 7
      return -1
    }

* **TWO CHANNELS, ONE CALL, TWO ANSWERS.** Inside `if c is Circle` the checker types `c` as
  `Circle`. The monomorphizer's argument pin reads the PARAMETER's declared annotation, which
  is still `Circle | null`, so the instance is minted `(x: Circle | null): Circle | null` —
  correct for the question it was asked. The value coming back therefore keeps the niche's
  `(ref null $uVarHeap[vi])` valtype while the checker has already typed the expression
  `Circle` and `area`'s parameter wants the `(ref $uBox)`.
* **IT IS NOT A MISSING ARM, which is why it is filed rather than fixed beside D22/D23/D24.**
  Those three are each "what rep does this position want, and does the classifier deciding
  know about the niche". This one needs a RULING on which channel owns a narrowed argument's
  type — the annotation the pin ladder trusts everywhere else (because mid-mono every `expr*`
  classifier is blind: `buildLocals` has not run), or the checker's recorded type on the
  argument NODE, which knows the narrow but is unreliable for the shapes the annotation arms
  exist to cover. Only the generic RESULT positions can see the difference; a pin whose type
  parameter does not appear in the result is unaffected, which is why the `dstGen` control runs.
* **THE FAILURE MOVED WHEN D23 CLOSED, THE OUTCOME DID NOT.** On the parent commit the same
  file is `vl check` rc 0 and `expected (ref $type), found i32` at offset 0xe3 — the pin's old
  `T := i32` answer. On this commit it is rc 0 and `expected (ref $type), found (ref null
  $type)` at 0xe4. Same cell, same silence, one rung along.
* Pinned as `tests/cases/soundness/xfail-miscompile-generic-roundtrip-nulvariant.vl` and it is
  `tests/vl_check_codegen_test.ts`'s live `INVALID_MODULE_SRC` specimen — the ninth.

**CLOSED 2026-08-26, AND THE RULING IS IN `DECISIONS.md`** ("which channel owns a NARROWED
argument's type at a monomorphization pin"). Read it there; what belongs here is the size of
the row and what it cost to grade.

**THE ROW NAMED ONE CELL AND THE GRID FOUND 53.** A 187-cell grid over generic-call shapes —
type parameter in the result vs not · `is` / `!= null` / no narrow · fifteen argument reps ·
six deliveries · four callee shapes — graded on the real outcome vocabulary:

| | runs | loud check | loud emit | check-clean INVALID WASM | blockers (loud→silent) |
|---|---|---|---|---|---|
| master | 94 | 33 | 7 | **53** | — |
| (a) the annotation owns it | 134 | 33 | 12 | **8** | 0 |
| (b) the argument node owns it | 98 | 33 | 10 | **46** | **6** |
| (c) shipped | **146** | 33 | 8 | **0** | 0 |

* **THE `nulvariant` NICHE IS NOT THE AXIS.** `P | null`, `P[] | null`, `i32[] | null`,
  `string | null`, `i32 | null`, `f64 | null`, `{[K]:V} | null` and a nullable CLOSURE all sit
  in the same 53, and so does a shape with no nullability at all: a `Shape` PARAMETER narrowed
  to the ARM `Circle` (`expected (ref $type), found (ref $type)` — the union BOX against the
  variant row).
* **IT WAS AN ORDER DEPENDENCE.** The registry is keyed on the pin NAMES; the RESULT was
  substituted through the argument NODE's arena row, which the key does not carry. One
  program, two function declarations swapped, nothing else changed: wide-call-first RUNS,
  narrow-call-first is check-clean invalid wasm. The `Circle | null` twin moves between
  running and a loud emit failure the same way. Both orders are in the graduated fixture.
* **OPTION (b) IS DISQUALIFIED BY MEASUREMENT, NOT BY TASTE** — 6 cells loud→silent, which is
  the blocker rule, plus 21 `runs`→invalid-wasm. Its breakage is exactly where this row
  warned the node type is unreliable: a literal union's render softens to `string`, a nominal
  `P` renders `{r:i32}`, a closure renders an arrow where the pin needs a `$fnsig` marker.
* **WHAT SHIPPED IS TWO RUNGS**: the instance's RESULT substitutes through the same column its
  parameter slot and body bindings take (so an instance is a function of its key), and a
  narrowed argument pins the NARROWED spelling where that spelling is a top-level MEMBER of
  the annotation's own union/nullable spelling and `monoAnnPinName` echoes it back unchanged.
  The membership gate is what admits the narrow and excludes (b)'s breakage by construction.
* **THE SAFETY PROPERTY WAS MEASURED, NOT ASSUMED.** A pin becomes the instance's parameter
  annotation, so the question is whether a NON-generic function with that annotation already
  lowers the same program. `function takeN(x: N): N` called with a `W` value narrowed to `N`
  RUNS ON MASTER for all ten reps in the grid — the call boundary emits the `ref.as_non_null`
  and the result is boxed for a union consumer. Pinning the WIDE spelling is equally legal and
  lands the RESULT off that path, which is the whole of option (a)'s residue.
* **FIVE CELLS ARE NOW LOUD RATHER THAN RUNNING**, and that is the intended floor: a narrowed
  `P[] | null` and a narrowed nullable CLOSURE whose generic RESULT is then indexed / called
  give `emitProgram: field access receiver is not a struct` and `emitProgram: callee is not a
  function name`. Both were check-clean invalid wasm before.
* **IT ROUTED A CORPUS CONTROL ONTO A SEPARATE ROOT, WHICH IS FILED AS D31 AND FIXED IN THE
  SAME COMMIT.** Closing the pin put `generics/mono-nullable-arg-pin.vl`'s own `narrowed`
  control on a generics-free master defect — a call ARGUMENT inheriting the enclosing
  RETURN's nullable expectation. The two are independent (D31's witness has no generic in
  it) and neither closes the other; they ship together only because the corpus reaches D31
  through D25's fix.
* **RE-MEASURED ON `d26c4421`** after #1938 closed D27/D28/D29 by deleting `fnAssignKindGuard`,
  since that change touched `wasmEmit.vl`'s nullable-string return seeding, which is adjacent
  to D31's fix. The whole 187-cell grid is **byte-identical at both baselines**: 53 silent on
  `c99838a8` and 53 silent on `d26c4421`, 0 cells moved between them, and 0 silent with the
  fix at either. The five loud-floor cells below are the same five, with the same messages.
* Retired: `xfail-miscompile-generic-roundtrip-nulvariant.vl`. Graduated:
  `tests/cases/soundness/generic-narrowed-arg-pin.vl` (24 cells). `INVALID_MODULE_SRC` moved
  to D26 — see that row.

---

### D26 — [CLOSED 2026-08-26] a UNION accumulator and a MEMBER-STRUCT accumulator, two `reduce` instances in one program
**check-clean invalid wasm · filed 2026-08-26 by the `std-api-reviewer` pass over the D24 retirement, which went looking for the CROSS cell the retirement's own pin did not have · pre-existing, measured on this exact file against master's compiler (identical rejection, identical offset 0x29e) · CLOSED by retiring `letInitReboxesToVariant`, whose heap comparison read a VARIANT index through the STRUCT table**

Repro:

    import { reduce } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function bumpC(acc: Circle, x: i32): Circle { return { r: acc.r + x } }
    function bump(acc: Shape, x: i32): Shape {
      if acc is Circle { return { r: acc.r + x } }
      return acc
    }
    function circleFold(): i32 {
      const c: Circle = { r: 5 }
      const out = reduce([1, 2], bumpC, c)
      return out.r
    }
    function shapeFold(): i32 {
      const s: Shape = { r: 1 }
      const out = reduce([1, 2], bump, s)
      if out is Circle { return out.r }
      return -2
    }
    print(circleFold())
    print(shapeFold())
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   wasm[0]::function[16]::circleFold$m0 … type mismatch: expected (ref $type), found (ref $type)

Controls, all of which RUN — the reviewer's own axis table, each cell executed:

* either accumulator ALONE (`circleFold` without `shapeFold`, or the reverse);
* two DISTINCT struct accumulators (`Circle` + `Sq`) with no union in the program;
* the union accumulator beside a NON-MEMBER struct accumulator (`Other`);
* the same pair with the member-struct result taken as `return reduce(…).r` instead of
  through a `const out` binding.

* **NO NARROWING AND NO NULLABILITY ANYWHERE**, which is what separates it from D22/D23/D24
  (all three need the `nulvariant` niche) and from D25 (which needs a narrowed argument
  riding a generic RESULT). It is the heap-type TWIN at a monomorphized instance's RESULT,
  and the disassembly says so rather than the message shape — `wasm-tools print` of
  `circleFold`:

      (func (;16;) (type 14) (param structref) (result i32)
        (local (ref 2) (ref 0) (ref 9))     ;; local 1 = the Circle VALUE, local 2 = `out`
        i32.const 5
        struct.new 2                        ;; the literal builds heap type 2
        local.set 1
        …
        call 8                              ;; the A = Circle instance: (ref 2) -> (ref 2)
        local.set 2                         ;; …into a local DECLARED (ref 0)
        local.get 2
        struct.get 0 0                      ;; and read back through heap type 0

  Types 0 and 2 are both `(struct (field (mut i32)))` and are distinct heap types: the plain
  struct row (`sHeapIdx`) and the union-arm row (`uVarHeap`), which the two tables never
  cross-dedup. The instance's parameter, body and result agree with each other on `(ref 2)`;
  it is the `const out` BINDING's slot that resolved `Circle` through the other table. That
  is why the same call consumed inline (`return reduce(…).r`) runs — with no binding there is
  no second resolution to disagree with.
* **THE UNION HAS TO BE INSTANTIATED TOO.** With only the `Circle` instance the program
  runs; the union instance is what makes `Circle` resolve through `uVarHeap` at one end.
  This is precisely the interaction a single-instance grid cannot see, and it is the third
  time `std/array.vl`'s ledger has recorded a diagonal standing in for a cross product.
* **PINNED 2026-08-26, AND IT IS NOW THE LIVE SPECIMEN.** D25 closed, so this row inherited
  `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC` — the tenth. Its file is
  `tests/cases/soundness/xfail-miscompile-reduce-union-and-member-struct-accum.vl`
  (`@no-instantiate`), and the row was re-run verbatim against the D25 fix first: identical
  rejection, identical offset 0x29e, so the pin closure did not move it.
  `tests/cases/std/array-reduce-narrowed-variant-init.vl` instantiates `reduce` at four
  accumulator types on purpose and says in its header which fifth one is missing and why.

**CLOSED 2026-08-26.** The filed program above runs and prints `8` / `4`.

* **TWO CLAIMS IN THE FILING ARE OVERTURNED BY THE CLOSE, and the filed text is left standing
  above so the correction is legible.** (i) *"the two tables never cross-dedup"* is true but
  is NOT the mechanism — nothing here needed the two rows to merge; the defect is that ONE
  index was read through BOTH tables. (ii) *"THE UNION HAS TO BE INSTANTIATED TOO"* is an
  artifact of the witness. What is required is that `Circle` be a REGISTERED variant and that
  the struct table be non-empty; the union instance was merely how this program achieved the
  second. And *"not pinned in the corpus"* no longer holds — the LOUD spelling of the same
  root is an `@run` fixture, which is what made it pinnable.
* **IT IS NOT ABOUT `reduce`, NOT ABOUT THE MONOMORPHIZER, AND NOT ABOUT TWO INSTANCES.**
  The root is `letInitReboxesToVariant` (`compiler/emit_classify.vl`, #1010), the one
  predicate that can veto `letIsVariant`. It compared the two heap tables:

      const ssi = structIndexOfExpr(d.letInit, fnIx)
      if ssi < 0 || ssi >= sHeapIdx.length { return false }
      return sHeapIdx[ssi] != uVarHeap[vi]

  `structIndexOfExpr` hands back a **VARIANT** index for a variant-returning call —
  `fRetStructIdx` is the polymorphic companion slot (`emit_state`'s own header: *"also a
  union-VARIANT return's variant index"*), a `: Circle` annotation leaves `fRetKind` at
  `"i32"` (`retAnnKindChain`), and `fnRetStructIndexSid` reads the slot UN-GATED. So the
  comparison is mis-typed, and `ssi < sHeapIdx.length` is a **BOUNDS check, not a namespace
  check**. It declined every variant index only while the struct table was EMPTY — which is
  exactly a program whose object types are ALL union arms, because `collectS` skips a
  `TypeDecl` that `variantIndexOf` claims (`emit_collect.vl`). Add ONE standalone struct and
  the variant index lands in bounds and is read as `sHeapIdx[<variant index>]`.
* **MEASURED AT THE SITE**, with a probe printing the guard's own intermediates. On the filed
  program: `vi=0 ssi=0 sLen=2 uVarHeap[vi]=2 names=[0]{r:i32}@0[1]{s:i32}@1`. On the same
  program minus the union instance: `vi=0 ssi=0 sLen=0` — the bounds check declining. And
  with a `Pre = {p,q}` struct declared FIRST, so the anonymous row is index 1 while the
  variant index is 0: `ssi=0` — the answer really is in the VARIANT namespace, not the
  anonymous row's.
* **WHAT MADE THE STRUCT TABLE NON-EMPTY IN THE FILED PROGRAM.** `Circle`/`Sq` have no
  `sNames` row of their own. The two rows are ANONYMOUS inline shapes `{r:i32}` / `{s:i32}`,
  minted because the monomorphizer's instance annotation spells the union STRUCTURALLY: a
  chain probe caught `internShapeDeepTy` entered with
  `({r:i32}|{s:i32},i32)=>{r:i32}|{s:i32}` — the substituted `f: (A, T) => A` — whereupon
  `internFuncTypeShapesTy` split the composite union and interned each arm. That is why the
  row read as "needs a monomorphized generic": the generic is only how the struct table
  stops being empty. **One plain `type Pre = { p: i32, q: i32 }` is enough**, and then no
  generic is involved at all —
  `tests/cases/unions/unannotated-bind-variant-call-beside-plain-struct.vl`.
* **THE SAME ROOT IS LOUD OR SILENT DEPENDING ON WHICH ROW THE VARIANT INDEX LANDS ON.** If
  that row carries the field being read, the module emits and the engine refuses it (the
  filed cell); if it does not, `emitProgram: unknown struct field in field access` — the
  `umt` (union + member struct + a THIRD struct) eighth of the grid below.
* **THE GUARD CANNOT BE RIGHT FOR ANY ARM `exprVariantIndex` ANSWERS FROM**, which is why it
  is retired rather than re-typed. Every arm is REP-authoritative: `paramVariantIndex` /
  `declaredVariantIndex` / `capturedVariantIndex` / `globalVariantIndexSid` read the cell
  KIND; the `as` arm reads the cast the checker proved; the `Index` arm excludes a
  plain-struct element list by name; and the CALL arm is gated on `retVariantFlag` — *"the
  same predicate the callee's own functype result is emitted from"* — added in #1816 on
  2026-08-22, a MONTH after the guard landed (#1010, 2026-07-22). That gate is what makes
  the plain-struct twin the guard was written for (`mk3(): {a:i32,f:i32}`, #1005) answer -1
  at `exprVariantIndex` and stop reaching the guard at all.
* **MEASURED DEAD.** A probe firing only when the guard returns TRUE, over **all 2,254 (at the time)
  `tests/cases/*.vl`** and over the compiler's own module graph: **0 programs**. A second
  probe firing on every entry past `vi >= 0`: 12 corpus files, every one returning false —
  8 on `ssi < 0` and 4 on the empty-table bound (`types/variant-as-value.vl`,
  `unions/call-struct-arm-into-union-global-cell.vl`,
  `unions/declared-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-call-positions.vl`) — and `sHeapIdx[ssi]` out of range in
  all 12. The guard's only live effect was this defect. **AND FROM THE EMISSION SIDE**: of the
  2,256 `tests/cases/**/*.vl`, 1,832 compile under both master `7fe81e5b`'s seed and this
  one, and all 1,832 are BYTE-IDENTICAL — 0 differ, 0 lost the ability to compile, and exactly
  2 gained it (the two fixtures this close adds). Not one byte moves anywhere the guard was
  consulted.
* **GRID, 240 cells** (accumulator pairing x consumption x std-`reduce`/hand-written generic
  x declaration order x 2-or-3 instances), master vs branch:

  | | master `7fe81e5b` | branch |
  |---|---|---|
  | runs | 192 | **224** |
  | check-clean invalid wasm | 40 | **16** |
  | loud emit reject | 8 | **0** |
  | loud check reject / trap / wrong value | 0 | 0 |

  **32 cells moved, every one toward a better outcome; 0 moved backward** — 24
  `check-clean invalid wasm -> runs` (the `um`/`umt` `bind` and `pass` consumptions) and 8
  `loud emit reject -> runs` (`umt_bind`, where the row the variant index landed on had no
  such field). The axes agree
  with the filed controls: only the `um` / `umt` pairings ever failed (union + MEMBER
  struct), `std` and `own` are identical at 20/4/96 each — so it was never a std problem —
  and `fwd`/`rev` declaration order and 2-vs-3 instances are flat.
* **WHAT REMAINS: the 16 `list` cells, and they are a DIFFERENT RUNG** — D32 below. Storing
  the variant into a `Circle[]` resolves the ref-list ELEMENT heap through `rlElemStructRow`,
  whose canon-key rung (`repRowOfTyStruct`) bridges the variant's SHAPE onto a standalone
  struct row. Identical on master and on this branch (same 16 cells, same message),
  reachable with no generic at all, and chartered as ROADMAP repOf item (e).
* Pinned as `tests/cases/unions/unannotated-bind-variant-call-beside-plain-struct.vl` (the
  loud spelling, no generic, four consumptions) and as the fifth accumulator of
  `tests/cases/std/array-reduce-narrowed-variant-init.vl`, which its own header had reserved
  for this close.

---

### D27 — [CLOSED 2026-08-26] a `closure` cell at an implicit-return assignment: the guard declines, the result valtype falls back to `i32`
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 18 of a 192-cell guard-decline grid, plus 16 of the 432-cell implicit-return assignment grid · filed 2026-08-26 while closing D21 · pre-existing, identical on master's `vl-compiler.wasm` and on D21's branch (same offset, same message)**

Repro:

    function mkF(): (i32) => i32 { return (x) => x + 1 }
    function mkG(): (i32) => i32 { return (x) => x + 5 }

    let g: (i32) => i32 = mkF()

    function f() {
      g = mkG()
    }

    f()
    print(0)
    // vl check rc 0 (one redundant-annotation hint); vl run:
    //   Invalid input WebAssembly code at offset 262:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME shape over a cell kind the guard does NOT decline (`struct` for
`closure`, the only change), correct:

    type S = { a: i32 }
    function mkS(v: i32): S { return { a: v } }

    let g: S = mkS(3)

    function f() {
      g = mkS(9)
    }

    f()
    print(0)
    // prints 0

Second control — the SAME program with an ANNOTATED return, correct. An annotation takes
`emit_sections`' `fn.fnRet >= 0` branch and the guard is never consulted:

    function f(): (i32) => i32 {
      g = mkG()
    }

* **THE `expected i32` IN THE MESSAGE IS THE GUARD'S OWN FALLBACK.** `fnAssignKindGuard`
  returns `null` for `closure`, `fnAssignRetKind` therefore answers "no kind", and
  `emit_sections`' inferred-return arm writes the `i32` default result valtype while the body
  pushes `(ref $cloStructIdx)`. The guard's header called `null` *"no answer, leave every
  classifier exactly as it was"*; it is not that. It is an answer, and the answer is `i32`.
* **MEASURED BY LIFTING THE ONE DECLINE.** With `if k == "closure"` removed from
  `fnAssignKindGuard` and NOTHING else changed, 18 of the 192 grid-3 cells move
  `check-clean invalid wasm → runs` and 0 move backward; in grid 2 the same single change
  moves 10 cells the same way. The decline is the cause, not an incidental bystander.
* **THE RECORDED REASON DOES NOT HOLD FOR THIS SHAPE.** It reads "`fnReturnsClosure` already
  owns the closure result at both functype producers, ahead of every kind this could supply".
  `fnReturnsClosure` owns a tail that IS a function value; this tail is an ASSIGNMENT, so
  nothing owns it and the decline hands the position to the `i32` default instead.
* **Flat on all four storage classes** — module global, parameter, annotated local,
  un-annotated local — and on both assignment shapes (`g = e`, `return (g = e)`), 16 cells.
  The `nulclosure` sibling adds 12 more with its own decline lifted, and 2 more cells filed
  under `nulclosure` in the grid are actually `closure` cells (their un-annotated initializer
  is non-null) and move with this one.
* **Varies on CONSUMPTION, and that is the silent/loud line**: with the result UNCONSUMED
  (`f()`) it is invalid wasm; with it bound and called (`const r = f()  print(r(4))`) it is a
  loud `emitProgram: call to unknown function` — a different, already-known gap. The
  unconsumed half is silent because the checker never types the result, so nothing downstream
  notices the disagreement.
* Not pinnable in the corpus AS FILED: an `@error`/`@run` row cannot express "check-clean
  invalid module". **THAT IS NO LONGER TRUE OF THIS ROW, AND THE PIN AND THE FIX ARE THE SAME
  CHANGE** — the cells RUN now, so `tests/cases/statements/tail-assign-cell-kinds.vl` holds
  them as an `@run` with real `@log` values. That fixture is check-clean invalid wasm on
  master (`type mismatch: expected i32, found (ref $type)`, offset 2241) and prints its ten
  lines on the branch.

**CLOSING EVIDENCE (#1938).** `fnAssignKindGuard` is DELETED, not shortened;
`fnAssignCellKind` answers each storage class directly. Three grids, master vs branch:

| grid | cells | silent (master) | silent (branch) | moved | backward |
|---|---|---|---|---|---|
| straight-line (`g = e` / `return (g = e)`) | 192 | 76 | **0** | 76 | 0 |
| if-arm join (both spellings) | 192 | 108 | 16 (D30, since CLOSED) | 92 | 0 |
| lambda producer (`cloRetValKind`) | 144 | 44 | **0** | 52 | 0 |

Every one of the 220 moves is `check-clean invalid wasm → runs`, except 8 lambda cells that
went `check-clean invalid wasm → loud emit reject` (the closure-result consumption gap, which
is loud) and 8 that went `loud emit reject → runs`.

---

### D28 — [CLOSED 2026-08-26] a `map` / `nulmap` cell at an implicit-return assignment, same root as D27
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 40 of a 192-cell guard-decline grid (32 `map`, 8 `nulmap`) · filed 2026-08-26 beside D27 · pre-existing, identical on master and on D21's branch**

Repro:

    function mkM(v: i32): {[string]: i32} {
      const m: {[string]: i32} = Map()
      m["a"] = v
      return m
    }

    let g: {[string]: i32} = mkM(3)

    function f() {
      return (g = mkM(9))
    }

    f()
    print(0)
    // vl check rc 0 (one redundant-annotation hint); vl run:
    //   Invalid input WebAssembly code at offset 1061:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME program with the straight-line tail spelling instead of
`return (g = …)`, the only change, correct:

    function f() {
      g = mkM(9)
    }
    // prints 0

* **SAME ROOT AS D27** — `fnAssignKindGuard` declines `map`, the result valtype falls back
  to `i32`, the body pushes `(ref $mapStruct)`. Lifting `if k == "map"` alone moves all 32
  `map` cells `check-clean invalid wasm → runs`, 0 backward; lifting `if k == "nulmap"` alone
  moves its 8 the same way. Neither lift disturbs the other's cells, which is what makes the
  attribution per-decline rather than shared.
* **THE RECORDED REASON WAS TESTED ON THE SHAPE IT NAMES, AND IT DOES NOT HOLD.** The guard
  says the `map` arm "reads the SHAPE off the return EXPRESSION (`mapRetExprShape` over
  `fnRetExprOf`), which for this shape is the assignment node, not a map expression", which
  would only have a slot to get wrong for a REF-VALUED map (a mono map's shape is -1). The
  grid carries both: `{[string]: i32}` (mono) and `{[string]: S}` (mv slot ≥ 0). **All 16
  cells of each move to `runs`.** The mv-slot hazard the reason describes is not reachable
  from this position.
* **The `map` half varies on the ASSIGNMENT SHAPE and not on the storage class**: the
  straight-line tail runs at all four classes and `return (g = e)` is invalid wasm at all
  four. The `nulmap` half varies on the VALUE instead — `g = null` is invalid wasm at all
  four classes while `g = mkN(true)` is a loud check reject (`'f' infers the nullable return
  type … not yet supported by codegen`). That second asymmetry is `fnAssignRetTargetName`'s
  own filed note about the checker typing `x = e` as `e`'s UN-coerced type: a `null` RHS
  types as `null` and slips past the gate that catches the nullable one.

**CLOSING EVIDENCE (#1938), AND THE HALF THE ROW DID NOT SEE.** The recorded reason named a
hazard ("a named kind whose companion slot cannot be minted from the same binding") that the
row then declared unreachable, on the strength of every `mapref` cell of the straight-line
grid moving to `runs`. It IS reachable — one storage class over. `cloRetValSlot` routes the
whole assignment-cell answer through `fnAssignRetSlot`, which answered `-1` for a map, so
naming the kind pointed a `{[string]: S}` LAMBDA cell at the MONO `$mapStruct`. Measured:
with the declines lifted and no slot arm, 8 cells of a 144-cell lambda-producer grid moved
`runs → check-clean invalid wasm` — the ONLY backward move of the whole change, and one no
grid in the filing covered. The straight-line grid is silent about it because
`mapRetExprShape` falls through to the assignment node's recorded type there and happens to
be right.

The fix is the missing payload column, not a re-decline: `fnAssignCellMapShape` answers the
cell's value shape per storage class (`letMapShapeOf` / `nulMapShapeOf` / `paramMapShape`),
`fnAssignRetSlot` returns it for `map` / `nulmap`, and `inferredRetMapSlot` is the one home
both the functype result (`emitFunctionSection`) and the in-body `Map()` seed
(`emitReturnValue`) read. With it, the lambda grid moves 52 cells forward and 0 backward.

---

### D29 — [CLOSED 2026-08-26] a `nulstr` cell at an implicit-return assignment: the one decline measurement CONFIRMS — and the premise UNDER it did not
**CLOSED 2026-08-26 (#1938) — the repro RUNS. Was: check-clean invalid wasm · 6 of a 192-cell guard-decline grid · filed 2026-08-26 beside D27 · pre-existing, identical on master and on D21's branch · NOT the same disposition as D27/D28**

Repro:

    let g: string | null = "hi"

    function f() {
      g = null
    }

    f()
    print(0)
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 256:
    //   type mismatch: expected i32, found (ref $type)

Control — the SAME program assigning a non-null value instead of `null`, the only change,
correct:

    function f() {
      g = "bye"
    }
    // prints 0

Second control — the SAME program with the annotation dropped, a loud CHECK reject
(`cannot assign null to string`), because the un-annotated cell is `str` and not `nulstr`.

* **THE MECHANISM IS D27's** — the guard declines `nulstr`, the result valtype falls back to
  `i32`. **THE DISPOSITION IS NOT.** Lifting `if k == "nulstr"` alone moves these 6 cells to
  `wasm trap: null reference`, not to `runs` — exactly what the guard's own comment predicts
  ("makes the module VALID and it then TRAPS on `g = null`"). Of the five surviving-decline
  experiments this is the only one whose recorded reason survived measurement.
* **BUT THE COMMENT MIS-NAMES WHAT IT PRESERVES.** It says the decline keeps "the loud
  invalid-wasm reject it is on master". Check-clean invalid wasm is a SILENT class by this
  document's vocabulary — `vl check` says rc 0 — so the decline is trading a loud runtime
  trap for a silent one, not a trap for a reject. Whether that is the right trade is a real
  question; the comment currently answers a different one.
* **THE ROOT IS NOT THE GUARD**, and the comment already says where it is: `emitIdentNode`'s
  kind-16 arm applies `ref.as_non_null` UNCONDITIONALLY, so a store-then-re-read of a
  `string | null` cell cannot be sound whatever the guard answers. Fixing that arm is what
  turns these 6 cells into `runs`; until then neither disposition is correct and the choice
  is between two failure classes.
* **Flat on the three ANNOTATED storage classes** (global, parameter, annotated local) × both
  assignment shapes, unconsumed. The un-annotated local is a loud check reject instead (see
  the second control), and every CONSUMED cell is a loud check reject.

**CLOSING EVIDENCE (#1938) — THE MEASUREMENT WAS RIGHT AND THE PREMISE UNDER IT WAS WRONG.**
Lifting the decline alone really does turn these 6 cells into `wasm trap: null reference`,
exactly as filed. But the reason that was the whole outcome — "`emitIdentNode`'s kind-16 arm
applies `ref.as_non_null` UNCONDITIONALLY" — is false at all three of its sites. Every one of
them reads

    if !nulStrReadStaysRaw() { … ref.as_non_null … }

and `nulStrReadStaysRaw()` is `pendingRawNullRead || pendingNulString`. The recover has been
conditional since the rule was written; what was missing is that the implicit-return
assignment position never declared itself a nullable-string TARGET, which is the second of the
two contexts the rule's own header names. So the choice this row framed — "fix the read rule
(bigger) or convert the silent outcome to a loud one" — had a third option that is smaller
than either: declare the context.

`emitReturnValue` now seeds `retNulString` from `fnAssignRetKind(fnPos)` — the SAME fact the
functype result valtype is minted from, beside the existing `inferNicheNullByName` niche seed
— so the re-read keeps the raw `(ref null $sTypeIdx)` the result declares. The READ RULE is
untouched, and so are its other consumers; the blast radius is one `if` reachable only for a
function whose implicit return is an assignment to a `string | null` cell.

Measured with everything else already in place (so this is the entry's own effect and not the
change's): straight-line grid 6 cells `check-clean invalid wasm → runs`, if-arm-join grid the
same 6, lambda grid 4, 0 backward in any of the three, and **no cell anywhere became a trap**.
Pinned by the `gs` row of `tests/cases/statements/tail-assign-cell-kinds.vl`.

---

### D30 — [CLOSED 2026-08-26] the CALLER's view of an inferred REF-VALUED map return from an if-arm tail assignment
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · 16 of a 192-cell if-arm-join grid · filed 2026-08-26 by the if-arm-join grid built to measure D27/D28/D29 · pre-existing (silent on master too, with the older `expected i32` message the guard's `i32` default produced)**

Repro:

    type S = { a: i32 }
    function mkR(v: i32): {[string]: S} {
      const m: {[string]: S} = Map()
      m["a"] = { a: v }
      return m
    }

    let g: {[string]: S} = mkR(3)
    let h: {[string]: S} = mkR(3)

    function f(c: boolean) {
      if c {
        g = mkR(9)
      } else {
        h = mkR(9)
      }
    }

    const r = f(true)
    print(r.size)
    // vl check rc 0 (two redundant-annotation hints); vl run:
    //   Invalid input WebAssembly code at offset 1171:
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — the SAME program with a MONO value type (`{[string]: i32}`, and `m["a"] = v`), the
only change, correct — it prints 1.

Second control — the SAME program with the straight-line tail `g = mkR(9)` instead of the
tail `if`, the only change, correct.

Third control — the SAME program with the result UNCONSUMED (`f(true)` then `print(g.size)`),
the only change, correct.

* **THE CALLEE IS RIGHT AND THE CALLER IS WRONG.** #1938 gave the callee's result valtype its
  map SHAPE (`inferredRetMapSlot`, via `fnAssignRetSlot`), which is why the third control
  runs. The CALL SITE resolves the same function's map shape through `fnRetMapShapeSid`,
  whose un-annotated rung is `mapRetExprShape(fnRetExprOf(...))` — and `fnRetExprOf` reads the
  body's last STATEMENT, which for a tail `if` is not an expression at all. It answers -1, so
  `collectLocals` types the receiving `const r` at the MONO `$mapStruct` while the call pushes
  the ref-valued one. The straight-line control escapes because there `fnRetExprOf` IS the
  assignment node and `mapRetExprShape` falls through to its recorded type.
* **NOT A REGRESSION, and the message changed while the class did not.** Master rejects the
  same program at offset 1137 with `expected i32, found (ref $type)` — the decline's `i32`
  default — and the branch at 1171 with `expected (ref null $type), found (ref $type)`. Both
  are `vl check` rc 0 with a module the engine refuses.
* **THE FIX IS THE ONE THE ROW NAMED, AND THE RECURSION IS GUARDED RATHER THAN AVOIDED.**
  The call site now asks the callee's own function (`fnRetMapShapeAt` →
  `inferredRetMapSlot`), so the two ladders cannot name different structs. That opens the
  cycle this row filed — `fnRetMapShapeAt → inferredRetMapSlot → fnAssignRetSlot →
  fnAssignCellMapShape → letMapShapeOf → mapShapeOfExpr → fnRetMapShapeAt` — because an
  UN-ANNOTATED cell's shape is its INITIALIZER's, and an initializer that calls the function
  being resolved asks the question again. An ANNOTATED cell short-circuits at
  `letMapShapeOf`'s annotation arm and never reaches it.
* **THE CYCLE COULD NOT BE CUT, AND THE UNGUARDED SYMPTOM IS A HANG, NOT A TRAP.** Three cuts
  were weighed and each fails: preferring the CHECKER's recorded type at the call site is a
  behaviour change over every map-returning call, and `letMapShapeOf`'s own header measures
  the two spellings disagreeing on 128 of 2,097 corpus entries; precomputing a per-function
  table in `computeRetInference` needs the same fixed point to fill the table, so the
  visited-set only moves; and restricting the new rung to `fnRetExprOf < 0` narrows the
  population without removing the cycle (a tail `if` whose cell's initializer calls the
  function still walks it). MEASURED BY ABLATION, and the failure mode depends on how much of
  the guard is missing: with the in-flight check deleted, `let g = f(true)` beside
  `function f(c) { if c { g = mkR(9) } else { g = mkR(8) } }`, its straight-line twin and a
  two-function chain each fail in **under 3s** with `the call stack was exhausted — most
  often unbounded recursion` (rc 1); with NO guard machinery at all — the first build of the
  fix — `vl check --codegen` on the straight-line twin ran **317s with no output and no
  diagnostic** before it was killed. The unbounded recursion is the same; only the loudness
  differs, and the silent form is the one a reader meets first.
* **THE ANSWER ON RE-ENTRY IS THE CHECKER'S, NOT -1.** Returning the mono map on re-entry —
  the value master's declining `fnRetExprOf` produced — would reintroduce this very defect
  for exactly the self-referential programs the guard exists for. `shape(f) = shape(g) =
  shape(f)` has no syntactic ground, but the checker already solved it (that is how
  `let g = f(true)` typed at all) and banked the answer on the CALL node.
  `mapFindShapeOfNodeTy` over that node is the rung both call sites already fall through to
  for "a call whose callee the syntactic path misses", so the guarded answer needs no new
  sentinel and no new ladder. The guard is the house idiom (`cnSetNarrow`'s `cnRecording`);
  push and pop are balanced by construction, `inferredRetMapSlot` being a wrapper with no
  early return.
* **GRID: 1,215 cells, 383 moved, none backward.** 450 cells (tail shape x map value type x
  consumption x arm agreement x annotated/inferred cells) moved 104, all
  `check-clean invalid wasm` → `runs`; a 750-cell extension over the assignment target's
  STORAGE CLASS (global / local / param) and five further value types moved 270, all the same
  way; 15 self-reference cells moved 9 — 6 to `runs` and 3 to `program_trap`, those three
  being programs that read a global before its own initializer completes or recurse without
  bound, whose trap is correct behaviour that the invalid module used to mask. No cell moved
  from a loud outcome to a silent one and no `runs` cell changed its output. Graduated to
  `tests/cases/maps/inferred-map-return-if-arm-tail-caller.vl`, whose last section is the
  recursion witness.

---

### D31 — [CLOSED 2026-08-26] a call ARGUMENT inherits the enclosing RETURN's nullable expectation
**CLOSED 2026-08-26 — the repro RUNS. Was: check-clean invalid wasm · filed 2026-08-26 by D25's grid, which routed `generics/mono-nullable-arg-pin.vl`'s own `narrowed` control onto it · pre-existing, measured on this exact program against master's compiler**

Repro:

    function takeS(x: string): string { return x }
    function narrowed(x: string | null): string | null {
      if x != null { return takeS(x) }
      return null
    }
    print(1)
    // vl check rc 0, no diagnostic at any severity; the engine refuses the module:
    //   type mismatch: expected (ref $type), found (ref null $type)

Control — the SAME call in the SAME function with a CONCRETE enclosing return, the only
change, and it prints `1`:

    function narrowed(x: string | null): string { … return "zz" }

Two more that run, isolating the axis: the call taken through a binding
(`const y = takeS(x); return y`), and the call not in return position (`return takeS(x).length`).

* **NO GENERICS ANYWHERE**, which is what separates it from D25. The callee is an ordinary
  function; the two boundaries are its PARAMETER and the CALLER's RETURN.
* **`expCtxHere()` SNAPSHOTS THE AMBIENT SEEDS.** `emitDirectCall` builds each argument's
  context from it, and at a `return f(x)` those seeds are the RETURN boundary's. The four
  nullable seeds were set only ever TO TRUE — `if cParamNulString { argCtx.nulString = true }`
  — never cleared, so a `string | null` RESULT expectation reached the ARGUMENT of a call whose
  parameter is a plain `string`, and the narrowed value kept its `(ref null $s)` rep under a
  `(ref $s)` param.
* **THE ONE-BIT DIFF IS THE WITNESS**, not an inference from the message: disassembled, the
  concrete-return control carries `local.get 0 ; ref.as_non_null ; return_call` and the filed
  shape carries `local.get 0 ; return_call`, on the same argument of the same call to the same
  function.
* **THE FIX IS ASSIGNMENT, NOT AN OR.** All four seeds (`nulBool`, `nulString`, `nulClosure`,
  `nulList`) now take the PARAMETER's answer and only the parameter's. The other four reps
  (`struct`, non-null list, `closure`, `variant`) already had their own explicit recover arms
  below; the seeded four had none because the seed was supposed to BE the answer.
* Graduated: `tests/cases/soundness/nullable-return-arg-seed.vl`. It reproduces on the parent
  commit and runs on this one.

---

### D32 — [CLOSED 2026-08-26] a `Circle[]` ref-list ELEMENT resolves its heap through the STRUCT table when a layout twin exists
**CLOSED 2026-08-26 — the repro now RUNS (prints `8` / `1` / `3`). Was: check-clean invalid wasm · found by D26's 240-cell grid (16 cells, the `list` consumption) · filed 2026-08-26 while closing D26 · pre-existing, identical on master (`c99838a8` and `7fe81e5b`) and on D26's branch — same 16 cells, same message · a DIFFERENT rung from D26 and unmoved by its fix**

Repro:

    type Dot = { r: i32 }
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function mkD(): Dot { return { r: 3 } }
    function useShape(): i32 {
      const s: Shape = { r: 1 }
      if s is Circle { return s.r }
      return -2
    }
    function circleList(): i32 {
      const c: Circle = { r: 8 }
      const xs: Circle[] = [c]
      return xs[0].r
    }
    print(circleList())
    print(useShape())
    print(mkD().r)
    // vl check rc 0 (four redundant-annotation HINTS, no error or warning); vl run:
    //   Invalid input WebAssembly code at offset 348:
    //   type mismatch: expected (ref null $type), found (ref $type)

Controls, each RUN:

* the same file with `Dot` DELETED — with no layout twin in `sNames` the element resolves
  through `uVarHeap`;
* the same file with `type Dot = { d: i32 }` (a struct that is NOT a layout twin);
* the same `Circle` value not put in a list (`return c.r` in place of the two list lines).

**AND THE TWIN DOES NOT HAVE TO BE THE CALLER'S OWN TYPE — ONE `std:array` CALL MINTS IT.**
This is the spelling a user meets, and it is why `std/array.vl`'s header names this row. There
is no `Dot`, no member-struct accumulator, and `circleList` calls no generic:

    import { reduce } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function bump(acc: Shape, x: i32): Shape {
      if acc is Circle { return { r: acc.r + x } }
      return acc
    }
    function shapeFold(): i32 {
      const s: Shape = { r: 1 }
      const out = reduce([1, 2], bump, s)
      if out is Circle { return out.r }
      return -2
    }
    function circleList(): i32 {
      const c: Circle = { r: 8 }
      const xs: Circle[] = [c]
      return xs[0].r
    }
    print(circleList())
    print(shapeFold())
    // vl check rc 0; vl run: Invalid input WebAssembly code at offset 687,
    //   type mismatch: expected (ref null $type), found (ref $type)

Control — **the same program with the one `reduce` call spelled as two direct `bump` calls**
(`const out = bump(bump(s, 1), 2)`), the only change: prints `8` / `4`. The monomorphized
`f: (A, T) => A` is the mint.

**EVERY `Circle[]` IN THE PROGRAM IS AFFECTED, not just a literal.** Measured on this branch
and on master, same program shape, only the list spelling varying:

| spelling | outcome |
|---|---|
| `const xs: Circle[] = [c]` | check-clean invalid wasm |
| `const xs: Circle[] = []` then `xs.push(c)` | check-clean invalid wasm |
| a `Circle[]` PARAMETER, called with the list | check-clean invalid wasm (`take$m0`) |
| a `Circle[]` STRUCT FIELD (`type Bag = { items: Circle[] }`) | check-clean invalid wasm |
| `const xs: Circle[] = []` never written | runs |
| **`const xs: Shape[] = [c]`, `is`-narrowed on read** | **runs — the remedy** |

* **THE PRODUCER AND THE CONSUMER DISAGREE, ARM FOR ARM.** The READ side
  (`exprVariantIndex`'s `Index` arm) resolves a `Cat[]` element through `uVarHeap` and gates
  on `structIndexByName(elemName) < 0` — an EXACT-NAME lookup, which `Circle` passes because
  a variant has no `sNames` row. The ELEMENT-HEAP side (`mAssignTypeIndices`' ref-pair loop
  in `emit_collect.vl`) tries `rlElemStructRow` FIRST and only falls through to
  `rlElemVariantHeap`; `rlElemStructRow`'s third rung is `repRowOfTyStruct`, the structural
  canon-key bridge, which returns `Dot`'s row. So the backing array is typed
  `(array (mut (ref null $Dot)))` while the value stored is `(ref $uVarHeap[Circle])`.
* **THE TWIN SIG PASS CARRIES THE SAME LADDER** (`rlSig`'s `else` arm) by design — its
  header says it "mirrors the `rlElemHeap` resolution below" — so a fix must move BOTH in
  lock-step or the dedup decision and the heap disagree.
* **DELIBERATELY NOT FIXED WITH D26.** Besides the two ref-pair-loop sites above,
  `rlElemStructRow` has SIX other call sites — `wasmEmit`'s element STORE (13564), PUSH
  (14215) and array-LITERAL (19787), `emit_classify`'s `rlSlotsLayoutTwin` (the ref-list
  slot dedup itself) and `structListPopGetElem` (`xs.pop()` / `xs.get(i)`) — and each would
  need the same gate, and `rlElemLitStructRow`'s header already records a MEASURED reason its own name
  rung is deliberately narrower ("changes the answer on 7 corpus calls and 311 fuzz
  programs — every one of them a both-decline today, i.e. exactly the -1 the variant route
  depends on"). This is the seam ROADMAP charters as repOf item (e), the variant/struct-table
  seam, whose LOUD half is already recorded there.

#### THE CLOSE — one predicate, read in two directions

`rlElemStructRow` now declines for an element name that is a registered union VARIANT and
not a registered plain struct:

    const ln = nonNulBaseOf(rlElemName[slot])
    const bn = structIndexByName(ln)
    if bn < 0 && variantIndexOf(ln) >= 0 { return -1 }   // <- added

That is the EXACT COMPLEMENT of the READ side's gate, which had stated the rule from the
consumer's end since the `{f: boolean}[]` fuzz finding: `exprVariantIndex`'s `Index` arm is
`if structIndexByName(ren) < 0 { return variantIndexOf(ren) }`. One predicate, two
directions — the array a `Cat[]` read unpacks through `uVarHeap` is now the array this side
types. Both of `mAssignTypeIndices`' passes ask the one function, so the SIG pass and the
HEAP pass moved in lock-step by construction; the six other `rlElemStructRow` consumers
(element STORE, PUSH, `__array_new__`, `rlSlotsLayoutTwin`) all treat -1 as "no struct hint",
which is already their default for every non-struct element kind.

**THE ANSWERING RUNG WAS MEASURED, NOT INFERRED.** A probe printing all three rungs at the
site, on the row's own filed program:

    ELEMROWPROBE slot=0 name=Circle arena=-1 byname=-1 canon=0 vi=0

Rungs 1 and 2 decline (a variant arm has no `sNames` row); rung 3 — `repRowOfTyStruct`, the
canon-key structural bridge — answers `Dot`'s row 0, while the variant table held the right
answer (`vi=0`) the whole time.

**THE DISASSEMBLY IS ONE TYPE INDEX.** `wasm-tools print` on the filed witness, master vs
this branch, everything else in `circleList` byte-for-byte identical:

    master   (type (;8;) (array (mut (ref null 0))))   ; 0 = Dot, the standalone row
    branch   (type (;8;) (array (mut (ref null 1))))   ; 1 = uVarHeap[Circle]

with `struct.new 1` pushing a `(ref 1)` into it in both — which is precisely the engine's
"expected (ref null $type), found (ref $type)", two DIFFERENT heap types behind one
placeholder.

**GRID — 480 cells, master vs this branch, RUN TWICE.** Once against `a80c6717` and again
against `da133669` after D30 merged into this branch — same 280/140/60 → 420/0/60 both times,
so D30's fix and this one do not interact and the numbers below are the merged tree's, not
inherited from the earlier baseline. Axes: twin presence (none / exact
layout twin / same-arity different-field-NAME / same-field different-TYPE / minted only by a
`std:array` generic instance) × consumption (element read / element written via `push` /
nested `Circle[][]` / map value / struct field / parameter / return / captured) ×
declaration order (4 placements of the twin block relative to the arms and the union) ×
arity (one twin / two twins / a twin that is itself an arm of a second union).

| | master | branch |
|---|---|---|
| runs | 280 | **420** |
| check-clean invalid wasm | 140 | **0** |
| loud check reject | 60 | 60 |
| loud emit reject / compiler trap / trap / wrong value | 0 | 0 |

**140 cells moved, every one `check-clean invalid wasm → runs`; 0 moved backward**, and the
branch has ZERO silent cells on the grid. The axes reproduce the filed controls exactly:

* **twin presence** — `exact` 56/96 and `stdmint` 84/96 fail on master; `namediff`,
  `typediff` and `notwin` are **0/96 each**. It is a LAYOUT bridge, not a name coincidence.
* **consumption** — 20/60 at each of the seven ref-list consumptions and **0/60 at the map
  VALUE**. The 60 map-value cells are a loud checker reject identically on both sides, and
  **that zero is the grid measuring the wrong coordinate, not a limit of the fix.** The cell
  generated a map whose value type is a bare `Circle`, which has no map-value rep at all and
  never reaches a ref-list slot. A `Circle[]` map VALUE does, and it is a D32 cell the grid
  therefore never held: `{[string]: Circle[]}` narrowed with `!= null` is invalid wasm on
  master and prints `8 / 1 / 3` on this branch. (The offset is deliberately not quoted: it
  reads 568 under `a80c6717`'s seed and 518 under `da133669`'s, so a bare offset in prose goes
  stale without anything noticing — the message and the function are the stable identifiers.) Found by the `std-api-reviewer`
  pass, not by the grid — the inventory's own coverage-gaps section states the rule this
  broke ("**read the generator before quoting a zero**: a coordinate that is not generated and
  a defect that is not present produce the same number"), and this is that rule catching an
  under-claim rather than an over-claim for once.
* **declaration order** — FLAT, 35/120 at each of the four orders. Unlike D1, order is not
  load-bearing here.
* **arity** — the cross-tab is the mechanism restated: `exact` fails at `one` 28/32 and
  `two` 28/32 but **`armtwin` 0/32**, because promoting `Dot` to an arm of a second union
  REMOVES its `sNames` row and so removes the very row the canon rung was finding. `stdmint`
  is 28/32 at all three, because the monomorphizer's anonymous `#anonN` row is not something
  a declaration can take away.

**CORPUS BYTE-IDENTITY**, also re-baselined against `da133669`: 1,834 of the 2,260
`tests/cases/*.vl` compile under both seeds, and **exactly 2 are byte-different — this
change's own two pins**, with 0 lost and 0 gained. The 2 are the point rather than a
blemish: a program carrying this defect still COMPILES (the engine refuses it at LOAD), so an
affected corpus file shows up as byte-different rather than as newly-compiling, and these are
the only two the corpus has. Measured before the fixtures existed the same sweep read 0
byte-different over 2,258 files. The gate fires where the defect was and nowhere else.

Pinned TWICE: `tests/cases/unions/variant-element-list-beside-layout-twin.vl` (seven
consumptions, no import and no generic), and `circleList` in
`tests/cases/std/array-reduce-narrowed-variant-init.vl` for the `reduce`-MINTED spelling —
a `Circle[]` in a function that calls no generic, beside that file's union accumulators.
**The second pin was written for this close, not inherited**: the first draft of the
`std/array.vl` retirement cited that fixture as already covering the cell and the fixture
contained no `Circle[]` at all. It fails on master with the row's own message (offset 1597
under `a80c6717`'s seed — quoted with the seed named, because offsets move between them),
which is what makes it a regression pin rather than a demonstration.

An incidental finding from writing it, pre-existing and NOT fixed here: the hint tier
renders that binding's inferred type with the monomorphization suffix intact —
``redundant type annotation: `xs` is inferred as `Circle$m0[]` `` — a mangled instance name
leaking into a user-facing diagnostic. Byte-identical on master for the same four-line
program, so it is a separate row's worth of work; it is declared verbatim in the fixture
rather than pinned in its pretty form, so the tree notices when it is fixed.

#### THE CENSUS THE CLOSE OWED — one rung here, and a SECOND live rung at D26's source

D26 was a VARIANT index read through the STRUCT table. D32 is **not that mechanism**: no
index crosses a namespace here, a *lookup* does — a structural canon key resolving a nominal
question. Both are "asked the wrong table", at different rungs. Both patterns were swept:

* **`sHeapIdx[x] != uVarHeap[y]` comparisons** — three sites survive D26's deletion
  (`emit_classify.structIdxHasReboxVariant`, `wasmEmit`'s `emitUnionCoerce` rebox arm at
  ~4016, `wasmEmit.emitUnionBoxArg` at ~4458). All three are reachable, and two of them take
  their `ssi` from `structIndexOfExpr`.
* **`structIndexOfExpr`'s Call arm still reads the polymorphic slot UN-GATED.** D26 deleted
  the one bad CONSUMER; the PRODUCER is unchanged. `fRetStructIdx` holds four different
  namespaces by kind — a struct row (`struct`/`nulstruct`), a VARIANT index
  (`variant`/`nulvariant`, where `retAnnKindChain` leaves `fRetKind` at `"i32"`), a ref-list
  SLOT (`reflist`) and a map SHAPE (`map`) — and every other reader is kind-gated
  (`cloRetValSlot`'s two arms, `capturedVariantIndex`, the `fnsig` result at ~13073, whose
  comment says *"Kind-GATED like every other reader on the polymorphic companion slot"*).
  `fnRetStructIndexSid` was the one that was not.
* **MEASURED, not argued:** an in-compiler probe firing when `fnRetStructIndexSid` answers
  `>= 0` for a non-struct kind reaches **11 of the 2,258 corpus files** today —
  `soundness/call-result-union-arg.vl`, `soundness/call-result-union-binding.vl`,
  `std/array-reduce-narrowed-variant-init.vl`, `types/display-render-is-nominal.vl`,
  `types/variant-as-value.vl`, `unions/call-struct-arm-into-union-global-cell.vl`,
  `unions/declared-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-call-positions.vl`,
  `unions/inline-union-struct-arm-standalone-positions.vl`,
  `unions/unannotated-bind-variant-call-beside-plain-struct.vl` (D26's own pin) and
  `unions/variant-annotated-global-floor.vl`. Every one is a `: Circle`-annotated variant
  return whose VARIANT index is handed to `structIndexOfExpr`'s ~40 struct-namespace
  consumers. They all compile correctly today because each consumer happens to decline —
  which is exactly the state D26 was in until one consumer stopped declining.
* **The gate is in this change, and it is byte-neutral.** `fnRetStructIndexSid` now returns
  -1 unless `fRetKind` is `struct`/`nulstruct`. Measured over the same 2,258 files against
  the D32-fix-only compiler: 1,834 compile under both, **0 byte-different, 0 lost, 0
  gained**, and the 480-cell grid is identical (420/0/60). It is a HARDENING with zero
  observed behaviour change, not a fix for an observed defect — it removes the D26 mechanism
  at its source instead of at one consumer, and brings the last un-gated reader of the
  polymorphic slot in line with the convention the other four already state.

---

### D33 — [CLOSED 2026-08-26] a type parameter bound through a CALLBACK ANNOTATION resolves a union arm onto a DECLARED layout twin
**CLOSED 2026-08-26 — the repro now RUNS (prints `1`). Was: check-clean invalid wasm · found by the `std-api-reviewer` pass over D32's OWN retirement, looking for the cross cell that retirement had no fixture for · filed 2026-08-26 · pre-existing, byte-identical on master (`a80c6717`, `235b365b`) and on D32's branch · the SAME FAMILY as D32 and a DIFFERENT RUNG, unmoved by its fix**

Repro:

    import { mapIndexed } from "std:array"

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function mk(x: i32, i: i32): Circle { return { r: x + i } }

    print(mapIndexed([1, 2], mk)[0].r)
    // vl check rc 0 with NO diagnostics at all — not even a hint; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)
    //   (in mapIndexed$m1. No byte offset quoted: it moves with the seed — the
    //    Circle[]-map-value cell in D32 above was 568 under `a80c6717` and 518 under
    //    `da133669`, which is why a bare offset in prose goes stale silently.)

SECOND SPELLING, the `reduce` ACCUMULATOR — same file shape, `A = Circle[]` instead of a
callback result, and this is the one that turns the row from a position into a property:

    import { reduce } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function addTo(acc: Circle[], x: i32): Circle[] {
      const c: Circle = { r: x }
      acc.push(c)
      return acc
    }
    function f(): i32 {
      const seed: Circle[] = []
      const out = reduce([1, 2], addTo, seed)
      return out[0].r
    }
    print(f())
    // vl check rc 0; vl run: type mismatch: expected (ref $type), found (ref $type)

Controls, each RUN, each ONE line different from the above (verified on BOTH spellings):

* `Dot` DELETED — `Dot` is never mentioned below the type declarations, and it is the whole
  trigger;
* `type Dot = { q: i32 }` (same arity, different field NAME — not a layout twin);
* `Sq` and `Shape` DELETED, so `Circle` is not a union arm at all;
* a plain non-arm struct as the callback result, so no variant namespace is involved.

* **THE DECIDING PROPERTY IS THE BINDING COLUMN, NOT THE POSITION NAME**, and the row was
  filed one position too narrow. A type parameter first bound through a CALLBACK'S ANNOTATION
  carries the defect; one bound through the RECEIVER does not. Measured over six positions,
  and the LAST one is what makes it a property rather than a count of two:

  | position | outcome |
  |---|---|
  | `mapIndexed`'s `U` — callback RESULT | check-clean invalid wasm |
  | `reduce`'s `A` at `Circle[]` — accumulator | check-clean invalid wasm |
  | `reduce`'s `A` at a STRUCT holding a `Circle[]` | runs |
  | `reverse` over a `Circle[]` RECEIVER | loud (``monomorphize: expected an array argument for `self```) |
  | `indexOf`'s `needle` | loud (the same receiver refusal arrives first) |
  | **`reduce` over `Circle[][]` (`T = Circle[]`, `A = i32`)** | **runs, with `Dot` declared** |
  | **`reverse` over `Circle[][]` (`T = Circle[]`)** | **runs, with `Dot` declared** |
  | **`sorted` over `Circle[][]`, comparator `byR(a: Circle[], b: Circle[])`** | **runs, with `Dot` declared** |

  The last three rows are the same `Circle[]` type reaching a type parameter through the
  RECEIVER instead of through a callback annotation, in a program that still has the twin and
  still has `Circle` as an arm — so they isolate the binding column with the trigger HELD
  CONSTANT rather than by removing it, which is what makes them controls rather than three
  more negative cells. **The `sorted` one is the sharpest and it is why the word FIRST is in
  the property**: its comparator ANNOTATES `Circle[]` outright, and it still runs, because
  `T` is first bound at `self: T[]`. A callback merely MENTIONING the type is not the trigger;
  being where the parameter is FIRST BOUND is.

  **The same property is recorded one carve-out back**, which makes it corroboration rather
  than coincidence: `std/array.vl`'s litunion-accumulator paragraph had already found that
  "the deciding property is PARAMETER ORDER (`A` is first bound at the CALLBACK parameter;
  move `init: A` ahead of `f` and the identical body runs)". Same column, a different rep,
  found independently twice. That split is the
  seam `std/array.vl`'s header already reasons about: a substituted RETURN annotation goes
  through the argument's arena rows (`pinTys`) while the body's annotated locals go through
  the pin re-resolved from the pin's NAME (`pinnedTyIx`), and the header's own note says those
  two "differ in coverage, not in meaning" — this is a second place where they differ in
  MEANING. **Found by the std review's second pass**, after the first pass's finding had
  already been written up as "the callback-result position".
* **IT IS NOT `mapIndexed`'S AND NOT std'S.** A hand-written `myMap<T, U>` importing nothing
  reproduces it, and so does a hand-written `myReduce<T, A>` for the accumulator spelling.
  `std:array` is where a caller meets both, which is why that module's header names them.
* **IT IS A DIFFERENT RUNG FROM D32, AND THE PROBE IS WHAT SAYS SO** rather than the
  resemblance. D32 was `rlElemStructRow` bridging a variant arm's SHAPE onto a standalone
  row, and its fix is a NOMINAL gate — decline for an element name the variant table claims.
  Here the element name is not `Circle` for that gate to catch. The same probe at the same
  site, on this row's own filed program:

      ELEMROWPROBE slot=0 name=[Dot] ln=[Dot] arena=0 byname=0 canon=0 vi=-1

  against `name=[Circle] … vi=0` on the `Dot`-deleted control. So `rlElemStructRow` is
  answering CORRECTLY for the name it was handed, every rung agreeing, and the structural
  resolution that crossed the nominal boundary happened EARLIER — the monomorphizer
  substituted `U` (bound to `Circle` by `mk`'s return type) and resolved its spelling onto the
  declared twin's NOMINAL name. **Widening D32's gate cannot reach this**; the fix belongs at
  the substitution, and that is why the row is filed rather than folded into D32's close.
* **THE DISASSEMBLY IS THE SAME TWO-TABLES SHAPE.** The backing array is
  `(array (mut (ref null $Dot)))` — `Dot`'s standalone row — while `mapIndexed$m1`'s functype
  result is `(ref $uVarHeap[Circle])`.
* **IT IS THE SPECIMEN, AND IT IS PINNED TWICE.**
  Both `xfail-miscompile-mono-*-twin.vl` pins are DELETED, which is those files' own written
  instruction for the day they start passing. The graduated pin is
  `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl` — ten cells, both
  `reduce` parameter orders, the hand-written import-free twins, and the three RECEIVER
  controls with the trigger held constant. `tests/vl_check_codegen_test.ts`'s
  `INVALID_MODULE_SRC` is swapped to D36 below.
* **HOW IT WAS FOUND IS THE REUSABLE PART.** The note it replaced in that test file said D30
  and D32 were the last two live rows and the class might be empty — true of the FILED rows
  and false of the tree. The inventory grades only what someone filed; the `std-api-reviewer`
  pass over the closing change has now out-produced it three times running (D26 from the
  ninth retirement's review, D32's understatement from D26's, this from D32's).

**CLOSING EVIDENCE (2026-08-26).**

* **THE FIX IS ONE ARENA RUNG AND ITS COMPLEMENT ALREADY EXISTED**, which is the third
  consecutive rung of this family to close that way. `shapeNominalOfTy` maps a structural
  shape back to a declared NAME for the monomorphizer's pin, over four rungs — and only ONE
  of them was nominal by construction:

      const si = structIndexOfTy(ty)          // arena, struct table   — NOMINAL
      if si >= 0 { return sNames[si] }
      const av = variantRowOfTy(ty)           // arena, VARIANT table  — NOMINAL  <-- ADDED
      if av >= 0 { return uVariants[av] }
      const fs = structRowOfObjFieldSet(ty)   // field-set scan        — structural
      if fs >= 0 { return sNames[fs] }
      const vr = variantRowOfObjFieldSet(ty)  // field-set scan        — structural
      if vr >= 0 { return uVariants[vr] }

  `variantRowOfTy` matches `uVarTyIx[i] == ty` — the ARM DECLARATION's own arena identity
  (`declTyIxOfName` resolves each arm) — and it was written, documented as correct, and
  unasked here. The two rungs BELOW are both structural field-set scans, one per table, and an
  exact layout twin is claimed by both, so their fixed order was the entire answer. It is
  placed AFTER the arena struct rung, not before it, because that is the exact complement of
  D32's own gate (`if bn < 0 && variantIndexOf(ln) >= 0`) read through the ARENA instead of
  through the NAME table: struct-row identity still wins where it exists.

* **MEASURED AT THE SITE, on the row's own filed program:**

      SHAPENOM ty=40 arenaS=-1 arenaV=0 fsS=0 fsV=0 render={r:i32}
      MONOFN-ARENA raw=[(i32,i32)=>{r:i32}] nom=[(i32,i32)=>Dot]

  `arenaV=0` is `Circle`'s own variant row. `fsS=0` is `Dot`. The wrong name then became the
  binding for `U`.

* **THE RECEIVER CONTROLS PRODUCE THE SAME WRONG RENDER AND RAN ANYWAY** — which is what the
  probe adds to the six-position table above, and it is why the word FIRST is load-bearing
  rather than merely observed. `xss.sorted(byR)` over a `Circle[][]` nominalizes its comparator
  to `(Dot[],Dot[])=>boolean` on master too. The render is equally wrong there; it only matters
  where it becomes a BINDING.

* **THE DISASSEMBLY IS ONE TYPE INDEX**, `wasm-tools print`, master `235b365b` vs branch, every
  other instruction in the module identical:

      master   (type (;8;) (array (mut (ref null 0))))   ; 0 = Dot, the standalone row
      branch   (type (;8;) (array (mut (ref null 1))))   ; 1 = uVarHeap[Circle]

  with `mk` emitting `(result (ref 1))` and `struct.new 1` under BOTH, and the `.r` read moving
  `struct.get 0 0` → `struct.get 1 0`. Two DIFFERENT heap types behind one `$type` placeholder,
  which is the whole of the engine's message.

* **GRID — 360 cells, master `235b365b` vs this branch.** Axes: binding column x export
  (12 spellings: `mapIndexed` callback RESULT, `reduce` ACCUMULATOR, `reverse`/`sorted`
  RECEIVER, `indexOf` NEEDLE, and hand-written import-free twins for callback RESULT, callback
  PARAMETER, both `reduce` PARAMETER ORDERS, receiver, and one type parameter in TWO columns in
  both orders) x substituted type (bare arm / list of arm / list-of-list / arm in a struct field
  / arm as a map value) x twin (absent / exact / same-arity different-NAME / same-name different
  TYPE / twin that is itself an arm / twin declared after use).

  | | master | branch |
  |---|---|---|
  | runs | 206 | **240** |
  | check-clean invalid wasm | 70 | **42** |
  | loud emit reject | 84 | **78** |
  | loud check reject / compiler trap / trap / wrong value | 0 | 0 |

  **34 cells moved: 28 `check-clean invalid wasm → runs` and 6 `loud emit reject → runs`; 0
  backward.** The 6 loud ones are `A = Circle` beside an exact twin — `std/array.vl`'s last
  live carve-out, retired by the same predicate because `recordedParamPinName` reads the same
  resolver.

  **THE 42 THAT REMAIN ARE NOT RESIDUE, and the twin axis is what says so**: they are flat at
  7 per twin across all six twin spellings, including `absent`. They are D34/D35 below, and
  they were live on master at the same 42 coordinates.

  **THE MOVED CELLS' OWN AXES ARE THE BINDING-COLUMN PROPERTY MEASURED BY THE DELTA**, which is
  stronger than the six-position table above because it is the whole grid rather than eight
  hand-picked cells:

  * twin presence — `exact` **17** and `after` **17**, and `namediff` / `typediff` / `armtwin` /
    `none` are **0 each**. Both movers are the same exact-layout twin, one declared later. A
    LAYOUT bridge, not a name coincidence, and declaration order is not an axis.
  * binding column — every one of the 34 is a CALLBACK-BOUND column (`mapIndexed` RESULT 6,
    `reduce` ACCUMULATOR 6, hand-written map RESULT 6, hand-written `reduce` callback-first 6,
    one type parameter in two columns callback-first 6, callback PARAMETER 4). **Zero receiver
    cells and zero init-first cells moved, because they already ran.** The property is not
    asserted from controls here; it is what the delta's own distribution says.
  * substituted type — `bare` 10, `list` 12, `listlist` 12, and `field` / `mapval` 0. A `Wrap`
    holding a `Circle[]` runs either way (the wrapper's own row answers the arena rung), and
    `mapval` is D34/D35 territory on both sides.
  * a SIXTH substituted type — a NESTED GENERIC, where the accumulator's own value comes out of
    another generic instance — was **measured as a spot cell rather than crossed into the grid**,
    and it is recorded that way rather than counted: `reduce([1,2], addTo, mapIndexed([5,6], mk))`
    is silent on master (`reduce$m1`) and RUNS here. It is pinned as `nestedGeneric` in the
    graduated fixture. A spot cell is weaker evidence than a crossed axis and is labelled so.
  * parameter ORDER — the hand-written `reduce` at `A = Circle[]` was silent at callback-first
    and RAN at init-first on master, which is the litunion carve-out's column at a new rep.
    Both run now, and both are pinned running.

* **CORPUS BYTE-IDENTITY vs `235b365b`: 1,837 of 2,262 compile under both seeds, 2
  byte-different, 0 lost, 1 gained.** The file list is the corpus AS OF `235b365b` — taken
  before this change added or renamed anything, so the three movers are named by the names
  they had then: `xfail-miscompile-mono-result-list-elem-twin.vl` and
  `…-callback-accum-list-twin.vl` (byte-different — a D33 program still COMPILES; it is the
  engine that refuses it at load), and `error-array-reduce-member-accum-layout-twin.vl`
  (gained — it emits no bytes at all on master, because the loud refusal aborts the module).
  All three are this change's own pins. Nothing else in the corpus moved a byte.

* **THE CENSUS, extended from #1942's to the SUBSTITUTION path, in two halves.**

  *The polymorphic-slot half is clean.* `fRetStructIdx`'s four-namespaces-by-kind hazard has no
  second un-gated reader here: `cloRetValSlot` is kind-PARTITIONED per arm rather than reading
  one slot, `cloRetTypeName` gates its `sNames` read on `k == "struct"`, and
  `structIndexOfExpr`'s Call arm reaches this path only through `fnRetStructIndexSid`, which
  #1942 gated. Grep-verified, nothing to add.

  *The nominal-resolver half is the one that found this row, and it was then swept.* The
  question is: how often is a NOMINAL question on this path answered by a structural rung when
  BOTH tables claim the shape? An in-compiler counter at the two sites that can be
  (`shapeNominalOfTy`'s two field-set scans, and `resolveShapeToNominal`'s name-keyed twin,
  which has the same struct-before-variant order) reads **0 files of 2,262 in the corpus and 0
  of the 360 grid cells** with this fix in place.

  **That zero is proven live, not assumed.** Two constructed programs trip the counter
  (`shapeUncovered=1` each): a callback whose result is annotated with the INLINE shape
  `{ r: i32 }` rather than with `Circle`, and an un-annotated lambda. Both RUN — an anonymous
  shape has no declaration identity, so `variantRowOfTy` correctly declines and the structural
  bridge is the right answerer there. `resolveShapeToNominal`'s counter reads 0 everywhere
  INCLUDING both positive controls, so **that half of the census is an UNPROVEN zero** and is
  recorded as one rather than as a clearance.

* **PINNED** as `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl` (ten
  cells) and `tests/cases/std/array-reduce-member-accum-layout-twin.vl` (the loud rung, renamed
  from `error-…` because an `error-` fixture that no longer errors is worse than none).

---

### D34 — [CLOSED 2026-08-26] a map VALUE typed at a union ARM is invalid wasm at the STORE, once anything READS the map
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). Was: check-clean invalid wasm · found by D33's own 360-cell grid (24 of its 42 flat-across-twin residue cells) · pre-existing, byte-identical on `235b365b`, `f2064bec` and on D33's branch · NO generic, NO import, NO layout twin · a DIFFERENT ROOT from D37, which was closed in the same change**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type CM = {[string]: Circle}

    function mkX(i: i32): CM {
      const m: CM = Map()
      const c: Circle = { r: i }
      m["k"] = c
      return m
    }

    function rdX(v: CM): i32 {
      const g = v["k"]
      if g != null { return g.r }
      return -1
    }

    print(rdX(mkX(7)))
    // vl check rc 0 (one unrelated hint); vl run:
    //   failed to compile: …::mkX — type mismatch: expected (ref null $type), found (ref $type)

* **THE READ IS WHAT MAKES IT SILENT, and that is the whole finding.** Delete `rdX` and the
  same store is the LOUD, documented refusal `emitProgram: unsupported map value type (no rep
  for a union-member struct, …)` — which writes nothing. Adding a narrowed READ of the map
  gives the value slot a rep, the emit floor stops firing, and the STORE then puts a non-null
  `(ref $uVarHeap[Circle])` into a `(ref null …)` slot. So this is not an unimplemented corner
  reached from a new direction: it is an existing floor being switched OFF by an unrelated
  expression elsewhere in the program.
* **`std/array.vl`'s header measured the FIRST half of this and stopped one step short.** Its
  note says "bind the read and test it `!= null` and `vl check` goes clean, and the emit
  refusal above is what you get". The first clause holds; the second does not once the map is
  also RETURNED from the function that stores into it.
* **THE `: Circle` ANNOTATION ON THE STORED VALUE IS LOAD-BEARING** — it is what makes the
  value a union ARM rather than an inferred inline shape. Dropping it (`m["k"] = { r: i }`)
  RUNS. That control is why this is filed as a union-arm row and not as a map-rep row.
* Controls, each ONE line different, all measured: `Sq`/`Shape` deleted so `Circle` is a plain
  struct → runs; no `rdX` → loud emit refusal; the annotation dropped → runs.
* 24 grid cells, flat at **4 per twin** across all six spellings INCLUDING `absent`, which is
  what separates it from D32/D33. All 24 are the `mapval` substituted type, across four
  different generic spellings, and every one fails in the STORE helper (`mkX` / `mkX$m0`)
  rather than in the generic — which is the same thing the import-free witness above says.

---

**CLOSED — the map layer never saw the name, and the node that still had it was one hop away.**

* **THE FILED READ-DEPENDENCE IS REAL BUT NOT THE MECHANISM, and the grid corrected it.** The
  row said "delete `rdX` and the same store is the LOUD documented refusal". Re-run verbatim
  on `f2064bec`, a store-only program with no read at all (`m["k"] = c; return i`) is the SAME
  silent invalid wasm — offset 478, same message. What switches the loud floor off is not a
  READ but whether anything in the program interned an INLINE-SHAPE struct row for the value's
  rendered field set; the row's own repro interned one through its `type CM = {[string]:
  Circle}` alias, and the fixture it was contrasted against (`error-map-value-struct-in-union.vl`)
  does not. That fixture's spelling is still the loud floor on this branch (filed as D47).
* **THE MECHANISM, MEASURED.** Every value spelling the mv layer holds is a RENDER —
  `nodeTyMapValName` is `tyToEmitName(t.mVal)` — and `tyToEmitName` spells a declared arm
  `{r:i32}`, character for character what an anonymous shape renders as. Both NAME-keyed
  resolvers then answer about the wrong table:

      INLINEMINT nm={r:i32} row=0 varShape=0
      MVPROBE in={r:i32} canon={r:i32} kind=1 vsi=0 vname={r:i32} varIdx=-1 varShape=0

  `varIdx=-1` is `variantIndexOf` declining (the render is not the arm's NAME, so **#1942's
  gate cannot fire here by construction** — this row needed no twin because the second claimant
  is an inline row minted from the arm's own field set, not a declared one). `varShape=0` is the
  variant table claiming the same shape structurally. Re-resolving the render mints a FRESH
  arena index (`vTy=61`, where `Circle`'s declaration is `40`), so **#1944's `variantRowOfTy`
  correctly declined too** — the nominal channel had already been destroyed upstream, which is
  the one thing that makes this row unlike the three before it.
* **THE FIX CARRIES THE CHANNEL RATHER THAN GUESSING IT BACK.** `collectA`'s `TypeRef` walk
  holds the annotation NODE, whose recorded value type is still the declaration's own index, and
  hands it to the interner as an ARM-ONLY hint (`mvShapeOfMapNameArmTy`). It is a SECOND
  parameter rather than the existing `rowTy` bank because D-MAPNODETY forbids a better ANSWER at
  the slot FIND rung — an arena leg that answers where the name bridge does not skips the mint —
  and says nothing about an input consulted after the mint has been decided on.
* **EVERYTHING DOWNSTREAM WAS A PAIRING WHOSE STRUCT HALF ALREADY EXISTED.** Four of them, and
  the fourth is the one that makes the point: `exprNullableVariant`'s own header says it is
  built ARM FOR ARM against `exprNullableStruct`, and `exprNullableStruct` has had the map-read
  rung (`mapReadMvSlot` → `mvValKind == 1`) since the struct-valued map was written. The variant
  twin had no `Index` arm at all. The others: `ExpCtx.variantIdx` ("the bare variant an ObjLit
  must build") has existed since the variant literal path and the map STORE seed only ever set
  its struct twin; `structIndexOfExpr`'s two map rungs now decline for an arm; and
  `mvValElemHeapOf`'s kind-1 arm now reads `rlElemHeap` like the four ref kinds above it
  instead of re-deriving from the struct table.
* **THE DISASSEMBLY IS ONE TYPE INDEX.** `wasm-tools print`, master `f2064bec` (seed 1,425,295
  bytes) vs this branch (seed 1,426,430 bytes), every other instruction in `mkX` identical:

      master   (type (;8;) (array (mut (ref null 0))))   ; 0 = the inline-shape row {r:i32}
      branch   (type (;8;) (array (mut (ref null 1))))   ; 1 = uVarHeap[Circle]

  with `struct.new 1` under BOTH and the narrowed field read moving `struct.get 0 0` →
  `struct.get 1 0`.
* **CENSUS — the change created one hazard of its own and it is gated.** `repMapValSlotsTwin`'s
  kind-1 arm deduped two map slots through `repStructSlotsTwin(mvValStructIdx[a], …)`, and
  `mvValStructIdx` is the INLINE row: an arm-valued `{[string]: Circle}` and a plain
  `{[string]: Dot}` matched the same row. Harmless while both sides had the same wrong heap;
  with the arm's own `uVarHeap[vi]` under one of them it is one map struct over two different
  vals wrappers. An arm-parity gate is in this change.
* **THE ZERO IS SPLIT INTO ITS TWO HALVES, because "measured 0" is the claim #1944 got wrong
  when its counter read 0 on its own positive controls.** A THREE-rung counter was built —
  the kind-1 arm ENTERED, the parity test returning 0, the parity test returning 1 — and swept:

      arm entered      46 calls over 25 of the 2,263 corpus files
      parity returns 0  0
      parity returns 1  0

  So the counter is **reachable and reached**: the arm is live, and this is not #1944's
  unproven zero. What is 0 is the parity BRANCH, and the honest word for it is not "measured
  0" but **not reachable today**: deciding it needs two DISTINCT kind-1 slots agreeing on canon
  id and key rep, and D48 is exactly the reason that pair cannot exist — the two maps collapse
  onto ONE slot before the twin question is asked. Three constructed positive controls confirm
  it rather than assume it (an arm beside a layout twin; two arms of ONE union sharing a field
  set; two arms of DIFFERENT unions sharing a field set): all three build, and all three enter
  the arm **0 times**. The gate is therefore kept as a STRUCTURAL guard for the day D48 closes,
  not as a measured-inert one — the distinction #1942 could make and #1944 could not.
* Pin: `tests/cases/maps/member-struct-valued-map.vl` (five cells: the annotated store, the
  un-annotated store, both read through a bare get and through `?? d`, and the store-only
  program the filed control claimed was loud).

---

### D35 — [CLOSED 2026-08-26] a `needle: T` the checker will not `==` LOSES that refusal in the instantiation
**CLOSED 2026-08-26 — the repro is NOW A LOUD CHECK REJECT, in the direct spelling's own words (``==` over Circle[] has no lowering (the call's argument types)`). Was: check-clean invalid wasm · found by D33's grid (18 of its 42 residue cells), AXIS CORRECTED by the `std-api-reviewer` pass over D33's own retirement · pre-existing, byte-identical on `235b365b` and on D33's branch · NO union, NO layout twin, NO STRUCT, NO hand-written generic**

**THIS IS THE ONE ROW IN THIS FILE WHOSE CLOSE IS A REFUSAL RATHER THAN A RUNNING PROGRAM**, and the witness grader had to learn to say so — `closed` mapped to `runs` unconditionally, which would have graded the fix as a failure. `scripts/check-filed-witnesses.py` now reads `now a loud check reject`.

Repro:

    import { indexOf } from "std:array"

    type Circle = { r: i32 }

    function mkX(i: i32): Circle[] {
      const c: Circle = { r: i }
      const o: Circle[] = [c]
      return o
    }

    function cell(): i32 {
      const n = mkX(7)
      const xs: Circle[][] = [n]
      return xs.indexOf(n) + 7
    }

    print(cell())
    // vl check rc 0; vl run:
    //   failed to compile: …::indexOf$m1 — type mismatch: expected i32, found (ref $type)

* **THE CONTROL IS WHAT MAKES IT SHARP, and it is one line.** The same comparison written
  DIRECTLY is a LOUD CHECKER ERROR:

      const a: Circle[] = [{ r: 7 }]
      const b: Circle[] = [{ r: 7 }]
      if a == b { … }        // type error: `==` over Circle[] has no lowering

  So the compiler is not missing a lowering it never had — it HAS the refusal, and the
  refusal does not survive the trip through a type parameter. One decision, two severities,
  chosen by the spelling.
* **THE RECEIVER'S OWN STRUCT-ELEMENT REFUSAL DOES NOT FIRE BECAUSE THE RECEIVER IS FINE.**
  `monomorphize: expected an array argument for `self`` is what a `Circle[]` receiver gets; a
  `Circle[][]` receiver IS an array argument, so the call gets past it and the needle is
  reached. That is why `std/array.vl`'s "a STRUCT ELEMENT is refused at EMIT with a clean
  error" needed the qualifier AT THE RECEIVER, which it never had.
* **ALL FOUR `needle: T` EXPORTS** — `indexOf`, `lastIndexOf`, `includes`, `count` — measured
  in one program (`vl check` rc 0, the module refused at the first of them).
* **THE AXIS IS EQUATABILITY OF `T`, NOT "A LIST WHOSE ELEMENT IS A STRUCT" — the row was filed
  one axis too narrow, and the std review's witness has no struct in it at all:**

      import { indexOf } from "std:array"
      type CM = {[string]: i32}
      function mkX(i: i32): CM { const m: CM = Map()  m["k"] = i  return m }
      function cell(): i32 {
        const n = mkX(7)
        const xs: CM[] = [n]
        return xs.indexOf(n) + 7
      }
      print(cell())
      // check rc 0; run: …::indexOf$m1 — type mismatch. `a == b` spelled directly over two
      // CM bindings is "`==` over {[string]: i32} has no lowering" — LOUD.

  No struct, no list-of-struct, no union, no twin — and `xs.reverse()` over the same `CM[]`
  runs and prints 7, so the receiver is fine and the needle is the whole of it.
* **THE SHARPEST CELL IS ONE THAT RUNS.** At `T = ("a" | "b")[]` the direct `==` is also
  refused (`isn't equatable`) and the instantiated `indexOf` **runs and returns the correct
  answer** (index 0). The lost refusal is uniform across every non-equatable `T`; whether a
  given one comes out as invalid wasm or as a working program is decided DOWNSTREAM by
  whether the emitter happens to have a comparison for that rep. Filing this as "a struct
  element" described the two unlucky reps and missed both the mechanism and the cell that
  shows it most clearly.
* Equatable `T` is unaffected, measured rather than assumed: `i32[]`, `string[]`, `boolean[]`,
  `i32[][]` and a plain struct all compare correctly both directly and through the needle.
* **18 cells in the grid, flat at 3 per twin — no twin required**, each failing in
  `indexOf$m1` rather than anywhere else, which is what separates these six `mapval` cells
  from D34's twenty-four (those fail in the STORE helper).
* **THE REMEDY DOES NOT EXPIRE, which is rare enough here to state.** Project to an equatable
  key and search that — `xs.mapIndexed(firstR).indexOf(n[0].r)`, measured, returns the right
  index. VL has no `==` over a list of structs *at all*, so fixing D35 makes `xs.indexOf(n)`
  LOUD rather than working, and a caller who took the projection never has to unwind it. That
  is a stronger guarantee than the "a caller who took it is still correct" this file usually
  gets, and it is the idiom `std/array.vl` already prescribes for `sorted`.

#### The close

**WHERE THE REFUSAL WAS LOST, exactly.** `checkBinary`'s equality arm asks two questions of
the operands — `isEquatable` (a plain object/array compares field-by-field, which is sound
only when every component is value-comparable) and `eqCmpKindOfTy` (does a compare CORE exist
for this rep). Inside a generic body the operand is `T`, a `TyVar`: `isEquatable` answers TRUE
and `eqCmpKindOfTy` answers `""` (OPAQUE). **Both answers are correct about a type variable and
useless about the instance**, and nothing re-asked once the pin was known — `monoCloneBody`
re-emits the compare at the substituted type and the checker never runs again.

**THE FIX RIDES THE PIN, and it did not need a new channel** — the deferred binary-op
constraint (`noteBinCstr` / `validateBinCstrs` / `binOpDefinedFor`) already carries exactly
this shape of question from a generic body to its call sites. Its `==` arm asked only MUTUAL
COMPATIBILITY; it now asks the same two gates, off a single home (`eqRefusals`) that
`checkBinary` also calls, so "the checker rejects" and "the pin rejects" are one sentence
rather than two guesses.

**THREE RUNGS, and the middle one is a pre-existing defect the fix could not ship without.**

1. `eqRefusals` — one home for both gates and both message channels.
2. **The constraint list was a GLOBAL keyed on the TyVar NAME, and it already leaked.** On
   master, a `function addT<T>(a: T, b: T) { return a + b }` sitting anywhere in the file made
   `idT(c)` — a generic that adds nothing — report `operator '+' is not defined for Circle and
   Circle`, because `substTyDeep` maps ANY `T` to the call's binding. That was a false reject
   before this change; it is also why stating the EQUALITY capability at the pin was unsafe
   without an owner column, since `indexOf`'s `self[i] == needle` would otherwise have refused
   `xs.reverse()` over the same receiver. Constraints now carry the declaration that recorded
   them, and a call adjudicates only its own callee's. The RE-DEFERRAL needed the same
   treatment: a callee with no declaration is a closure PARAMETER called inside a generic body
   (`f(self[i], i)` in a HOF), and with the whole list in scope that inner call re-recorded a
   sibling generic's `T == T` onto the HOF's own `T` — which is how `xs.mapIndexed(toI)` came
   to report `==` over an element type nothing in the program compares.
3. **`validateBinCstrs` lived on the direct-call path only.** `xs.indexOf(nd)` never reached
   it — the same asymmetry the `u8[]`-meets-a-generic rule had, for the same reason: `self`
   arrives AHEAD of the argument loop the rule sits in. The UFCS half is now there.

**THE GRID, 1712 cells** (T binding × equatability of `T` over the full rep vocabulary ×
operation × route × needle delivery × receiver delivery × CALLEE delivery ×
alias-vs-spelled-out):

| | runs | loud check | loud emit | check-clean INVALID WASM |
|---|---|---|---|---|
| master `f2064bec` | 958 | 130 | 383 | **241** |
| master `b5dfc64c` (after #1945 merged) | 958 | 130 | 383 | **241** |
| branch | 956 | 303 | 340 | **113** |

Re-measured cell-for-cell after merging #1945 (the D36/D38 close): **every column and every
one of the 225 transitions is identical**, so nothing below is that change's.

**225 cells moved, 0 in a genuine loud→silent direction.**

* **132 `invalid wasm → loud check reject`** — the row's own class, turned loud at `vl check`,
  which is where an editor sees it.
* **49 `loud emit → loud check`** — the same refusal, one stage earlier.
* **18 `runs → loud check`**, and they are **all** the `T = ("a"|"b")[]` cells this row calls
  its sharpest. The paragraph above predicted exactly this, and the direct spelling of the
  same comparison has always been `K[] isn't equatable`.
* **26 cells LEFT a loud outcome** (16 to `runs`, 6 to `loud emit`, 4 to `invalid wasm`) and
  every one of them is the CROSS-GENERIC FALSE REJECT being removed, not a lost refusal. Each
  such cell's master diagnostic is `operator '+' is not defined for X and X`, produced by a
  sibling `addT<T>` the cell never calls at that type. **The control is one line: delete the
  sibling generic, and master gives exactly the branch's answer** — measured on both
  compilers, both for a cell that lands on `runs` (`idT(nd)` alone prints `1` on master) and
  for one that lands on invalid wasm (a `string | null` needle is D42 on master with `addT`
  deleted, at the same offset and message). The leak had been MASKING D42 in four cells.

**THE CALLEE'S OWN DELIVERY IS AN AXIS, and holding it constant cost a round.** The first grid
over this change was 1514 cells crossing the NEEDLE's delivery and the RECEIVER's delivery,
five values each — and spelled the callee `f(x)` in every one. A draft of the scoping rule said
an unnamed callee sees only the enclosing body's constraints, which is right for the closure
parameter inside a HOF and wrong for `const f = addT  f(c, c)`: it turned a loud
`operator '+' is not defined for Circle and Circle` into check-clean invalid wasm. **A
loud→silent move produced by the fix for loud→silent moves, invisible to a 1514-cell grid.**
The rule that shipped withholds only the RE-RECORD from an unnamed callee, which is the
narrower thing the HOF case needed; the callee axis is now in the grid and in
`error-deferred-constraint-true-positives.vl`.

**THE 113 CELLS THE BRANCH STILL GRADES SILENT, ALL ACCOUNTED FOR, and none of them is this
row.** The residue proper is **104 = 96 + 8**; the other 9 are counted here only because the
harness put them in this column, and they do not belong to it — see the last bullet.

* **96** are a NULLABLE `T` — `string | null`, `i32[] | null` — where the DIRECT spelling is
  ACCEPTED and correct, so there is no refusal to lose and `eqRefusals` is right to stay
  silent. D35's MIRROR, filed as **D42**.
* **8** are `+` rather than `==`, and **six of them are this row's exact shape one operator
  over** — `addT<T>(a: T, b: T) { return a + b }` at `T = Circle[]` is `vl check` rc 0 over an
  invalid module while `a + b` spelled out is a loud emit reject. Filed as **D44**. The other
  two (`T = f64[]`) are not a pin defect at all: `f64[] + f64[]` is silently invalid at BOTH
  spellings, so the pin is faithfully reproducing the direct behaviour. **The `==` gate was
  scoped to `==`/`!=` deliberately** — `binOpDefinedFor`'s `+` arm claims any two arrays are a
  list concat, and tightening that needs its own grid over the concat rules rather than a rider
  on this one.
* **9 are NOT residue of this grid and are the arithmetic's own trap.** They are
  `type E = Circle[]` cells that die inside the MAKER before the comparison is reached —
  **D43, whose own filed outcome is `loud check reject`**, so a bucket labelled "check-clean
  invalid wasm" cannot contain them and a draft of this paragraph that made `96 + 9 + 8 = 113`
  close was adding two different outcome classes. They measure nothing about the comparison
  they were written for; the same three bindings spelled out DO reach it and are loud. The
  right reading is that the grid has 9 cells it cannot grade, not 9 silent ones.

Fixtures: `tests/cases/std/error-array-needle-not-equatable.vl` (all four exports, the
struct-free `CM` row, the cell that used to run, a hand-written generic off the std surface,
and the direct control in one file), `tests/cases/generics/deferred-constraint-scoped-to-its-callee.vl`
and `tests/cases/generics/error-deferred-constraint-true-positives.vl` (the scoping, both
directions).

---

### D36 — [CLOSED 2026-08-26] an ANONYMOUS object literal in a lambda's inferred LIST return resolves onto an arm when a twin also exists
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). ONE ROOT WITH D38; the closing evidence for both is at the foot of D38 below. Was: check-clean invalid wasm · found 2026-08-26 as a constructed positive control for D33's census probe · pre-existing, byte-identical on `235b365b` and on D33's branch · NO import, NO generic · was the specimen, now replaced by D39**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function f() {
      const g = (n: i32) => {
        const o = [{ r: n }]
        return o
      }
      return g(7)[0].r
    }

    print(f())
    // vl check rc 0 with NO diagnostics at all — not even a hint; vl run:
    //   failed to compile: …::f — type mismatch: expected (ref null $type), found (ref $type)

* **IT IS THE SAME FAMILY AS D32 AND D33 WITH THE DIRECTION REVERSED**, which is why neither
  fix reaches it. Both of those are "a DECLARED arm resolved onto a struct row". Here the
  expression contains no declared arm at all: an INLINE literal is being resolved, and two real
  rows — a struct and an arm — both claim its layout. Probed at D33's own site on this program:
  `arenaS=-1 arenaV=-1 fsS=0 fsV=0`. **Both arena rungs correctly decline** — an anonymous
  shape has no declaration identity — so nothing in the arena can break the tie and the
  structural scans decide it. D33's fix cannot reach it by construction, and that is recorded
  in D33's census rather than discovered later.
* Controls, each ONE line different, all measured: `Dot` DELETED → LOUD (`emitProgram: field
  access but no struct type declared`); `Sq`+`Shape` DELETED so `Circle` is not an arm → RUNS,
  prints 7; the element ANNOTATED (`const o: Circle[] = [{ r: n }]`) → RUNS, prints 7. The
  third names the axis: the ANONYMOUS spelling is the trigger, not the list and not the lambda.
* **IT IS ONE OF THE TWO PROGRAMS THAT PROVED D33'S CENSUS PROBE WAS LIVE.** That counter reads
  0 on all 2,262 corpus files and all 360 grid cells; two constructed programs trip it, and
  this is the one where the tie is also a miscompile. The other runs.
* The `@no-instantiate` pin `xfail-miscompile-lambda-list-anon-elem-arm-twin.vl` is
  DELETED — that file's own written instruction for the day it starts passing.
  Graduated to `tests/cases/unions/anon-objlit-list-elem-beside-arm.vl` (the
  twin-declared half, six cells plus the two heterogeneous controls) and
  `…/anon-objlit-list-elem-arm-no-twin.vl` (the no-twin half). `INVALID_MODULE_SRC`
  is swapped to D39 below.
* **THE FILED DIAGNOSIS WAS TRUE AND WAS NOT THE MECHANISM.** `arenaS=-1 arenaV=-1
  fsS=0 fsV=0` at `shapeNominalOfTy` is a correct reading and both arena rungs do
  correctly decline — but that site is not where this program's element rep is
  decided. D36 has no generic, so `shapeNominalOfTy` never binds anything here; the
  deciding site is the ARRAY LITERAL's own element classifier. Reading the probe as
  the mechanism because it fired is the same mistake D26's filing made with its
  heap-type twin. What the probe DID establish is still true and still useful: the
  arena cannot break the tie for an anonymous shape, which is why the answer had to
  come from the checker's recorded element type instead.

---

### D37 — [CLOSED 2026-08-26] a generic in the INIT-FIRST parameter order with an ANNOTATED list-of-arm seed
**CLOSED 2026-08-26 — the repro now RUNS (prints `1`). Was: check-clean invalid wasm · found while building D33's graduated fixture, by an axis D33's own grid held constant · pre-existing, byte-identical on `235b365b`, `f2064bec` and on D33's branch · NO layout twin · NOT reachable through `std:array`, whose `reduce` is callback-first · TITLE CORRECTED: the trigger is the ANNOTATION on the seed, not its emptiness — see below · a DIFFERENT ROOT from D34, which was closed in the same change**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function addTo(acc: Circle[], x: i32): Circle[] {
      const c: Circle = { r: x }
      acc.push(c)
      return acc
    }

    function myReduceInit<T, A>(xs: T[], init: A, f: (A, T) => A): A {
      let a = init
      let i = 0
      while i < xs.length {
        a = f(a, xs[i])
        i = i + 1
      }
      return a
    }

    function rdList(v: Circle[]): i32 { return v[0].r }

    function cell(): i32 {
      const hseed2: Circle[] = []
      const out = myReduceInit([1, 2], hseed2, addTo)
      return rdList(out)
    }

    print(cell())
    // vl check rc 0; vl run:
    //   failed to compile: …::myReduceInit — type mismatch: expected (ref $type), found i32

* **THE SEED BEING EMPTY IS THE TRIGGER**, and that is the axis worth recording: replacing
  `const hseed2: Circle[] = []` with a seeded list built by a function RUNS, on master and on
  the branch. D33's 360-cell grid crossed four axes and held this one constant at "seeded",
  while D33's own filed witness used an EMPTY seed — so the grid and the pin were different
  programs on a hidden axis. **The diagonal passing for a cross product, one level down from
  where `std/array.vl`'s ledger records the same mistake.**
* **IT IS NOT D33 AND THE TWIN CONTROL IS WHAT SAYS SO:** delete `Dot` (this repro has none)
  and it still fails; the CALLBACK-FIRST order with the identical empty seed was D33 and now
  RUNS. So the parameter-order axis separates them rather than uniting them.
* Controls, each ONE line different, all measured: `Sq`/`Shape` deleted so `Circle` is a plain
  struct → runs, prints 1; `A = i32[]` instead of `Circle[]` → runs, prints 1; a non-empty
  seed → runs.
* `std:array`'s `reduce` is `(self, f, init)` — callback-first — so this position has no std
  spelling and is reachable only with a hand-written generic. Recorded in
  `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl`, whose init-first cell
  is deliberately SEEDED with a comment saying why.

---

**CLOSED — one arm, and its complement is three lines above it in the same function.**

* **`monoAnnPinName` IS THE ONE HOME for "which annotation NAME can serve as a pin", and its
  STRUCT twin has had BOTH rungs since it was written:**

      function monoStructAnnName(name: string) {
        if isSName(name) { return name }                                        // bare  S
        if nameIsArray(name) && isSName(arrElemNameRaw(name)) { return name }   // list  S[]
        ""
      }

  The union-ARM arm added for D23 took only the FIRST. `Circle[]` was then claimed by NEITHER —
  `monoStructAnnName`'s list rung asks `isSName("Circle")`, false by the very construction its
  own header names (a variant has no struct row), and `variantIndexOf("Circle[]")` is false
  because the name is an array. Both declines are correct in isolation; together they left a
  spelling with no home and the cascade's `"i32"` catch-all pinned an i32 over a `(ref $rlWrap)`
  list — which is the sentence D23's own paragraph, four lines up, already writes about the
  bare arm. **Four for four: the closing predicate's complement already existed and was not
  consulted.**
* **THE FILED AXIS WAS WRONG AND THE CROSS PRODUCT IS WHAT SAYS SO.** The row read "THE SEED
  BEING EMPTY IS THE TRIGGER", because its control replaced the annotated empty local with a
  call-result ARGUMENT — two changes in one step, the same failure mode the row's own second
  bullet accuses D33's grid of. Crossed properly (120 cells: parameter order x seed spelling x
  arm-ness x declaration order):

  | seed spelling | master | branch |   | parameter order | master | branch |
  |---|---|---|---|---|---|---|
  | ANNOTATED `[]` | 4/24 | **0/24** | | init-first | 12/40 | **0/40** |
  | ANNOTATED `[c0]` | 4/24 | **0/24** | | callback-first | 0/40 | 0/40 |
  | ANNOTATED `mkSeed()` | 4/24 | **0/24** | | no generic | 0/40 | 0/40 |
  | INFERRED `mkSeed()` | 0/24 | 0/24 | | | | |
  | DIRECT `mkSeed()` | 0/24 | 0/24 | | | | |

  Emptiness is FLAT across the three ANNOTATED spellings and absent from both un-annotated ones.
  The annotation is the trigger because it is the only channel `monoAnnPinName` is consulted on:
  an INFERRED binding never reaches it and the cascade answers correctly. Parameter order and
  arm-ness are load-bearing exactly as filed (0/30 at `plain`, 0/30 at a non-member struct);
  declaration order is FLAT (6/60 each).
* **IT IS NOT D34, AND THE FIX SEPARATES THEM MECHANICALLY.** The two rows were grouped on
  suspicion ("a union arm inside a container the compiler types elsewhere"). They are two roots
  in two layers: D37's fix (one arm in `emit_mono.vl`) moved all 12 of its cells and **0** of
  D34's; D34's fix (`emit_classify` / `emit_bytes` / `wasmEmit`) moved all 30 of its cells and
  0 of D37's — measured by building each compiler separately. Their failure SIGNATURES differ
  in kind too: D34 is two heap types for one shape with no rep-class change
  (`expected (ref null $type), found (ref $type)`), D37 a rep-class collapse to the i32
  catch-all with no second heap type involved (`expected (ref $type), found i32`).
* Pin: `tests/cases/generics/mono-initfirst-annotated-arm-list-pin.vl` (all five seed spellings
  at the init-first column plus the callback-first control).
  `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl`'s init-first cell is now
  UN-SEEDED, which is that paragraph's own written instruction for the day this row closed.

---

### D38 — [CLOSED 2026-08-26] an INFERRED list result through a generic's callback resolves onto a union ARM, with no twin needed
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). ONE ROOT WITH D36, and the closing evidence for both is at the foot of this row. Was: check-clean invalid wasm · found 2026-08-26 by the `std-api-reviewer` pass over D33's OWN retirement — the FOURTH consecutive time that review has produced the closing change's next row · pre-existing, byte-identical on `235b365b` and on D33's branch · on `std:array`'s own surface, twelve lines, NO twin and NO hand-written generic**

Repro:

    import { mapIndexed } from "std:array"

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(n: i32, _i: i32) {
      const o = [{ r: n }]
      return o
    }

    function f(): i32 {
      const out = mapIndexed([7], mk)
      return out[0][0].r
    }

    print(f())
    // vl check rc 0; vl run:
    //   failed to compile: …::mapIndexed$m1 — type mismatch

* **IT IS THE ANNOTATION, AND THE FOUR-CELL CROSS IS THE WHOLE ROW.** The axis D33's grid held
  constant was the callback result's SPELLING — every grid cell annotated it. Crossed against
  the twin:

  | callback result | twin | master `235b365b` | branch |
  |---|---|---|---|
  | ANNOTATED `Circle[]` | none | runs | runs |
  | ANNOTATED `Circle[]` | `Dot` declared | **silent** | **runs** — this is D33 |
  | INFERRED `[{ r: n }]` | none | **silent** | **silent** — this row |
  | INFERRED `[{ r: n }]` | `Dot` declared | **silent** | **silent** |

  So D33's fix moves the ANNOTATED spelling and leaves the INFERRED one, on the same export,
  at the same position. Deleting `Sq`/`Shape` so `Circle` is not an arm RUNS in every cell, so
  the union is the trigger.
* **NO SEPARATE TWIN IS NEEDED BECAUSE THE ARM IS THE TWIN.** That is what makes it a distinct
  rung from D36 rather than the same one: D36's lambda needs `Dot` to have any struct row at
  all (delete it and D36 is LOUD, `field access but no struct type declared`), while
  `mapIndexed`'s minted `U[]` supplies the row here, so the anonymous `{r:i32}` has a struct
  row to resolve onto with nothing else declared. Same direction as D36 — an ANONYMOUS shape
  resolved onto an ARM — and D33's fix cannot reach either, for the reason D33's census
  records: an anonymous shape has no declaration identity, so `variantRowOfTy` correctly
  declines.
* **THE REVIEW'S OWN CONTROL TABLE HAD ONE ROW THAT DOES NOT REPRODUCE, and it is recorded
  because the finding survived it.** The review filed the ANNOTATED/no-twin cell as "silent
  invalid on master"; re-run verbatim it RUNS on master, which D33's own filed control already
  implied (`Dot` deleted → runs). The cell that actually carries D33 is ANNOTATED **with** the
  twin. The conclusion the review drew from the table — the fix moves the annotated spelling
  and leaves the inferred one — is correct and is what the corrected table shows; only the
  supporting cell was wrong. Run the row, not the table.
* **IT MAKES `std:array`'s RESIDUAL COUNT TWO, NOT ONE**, and the count was written as ONE in
  this change's own first draft. That is the seventh consecutive retirement whose review found
  the sentence ahead of the measurement, and the header's ledger had already promoted that
  from a run of bad luck to a standing expectation before this one confirmed it again.

**CLOSING EVIDENCE (2026-08-26) — D36 AND D38 TOGETHER.**

* **ONE ROOT, AND THE GRID IS WHAT SAYS SO.** The two rows differ in every obvious way — a
  lambda against a generic callback, a twin needed against no twin needed, no import against
  `std:array` — and this repo has had the one-root hypothesis refuted as often as confirmed
  (the literal-union class needed four rungs; D26 and D32 looked like one family and were an
  index-crossing against a lookup). So the cross product was built first, 900 cells over
  **twin** (absent / exact / same-arity different-NAME / a twin that is itself an ARM / twin
  declared after use) x **producer** (anonymous object literal / a named `const c: Circle` /
  a call result) x **route** (direct / lambda inferred / lambda annotated / function inferred
  / function annotated / `std:array` callback inferred / annotated / hand-written generic
  callback inferred / annotated / `std:array` RECEIVER (`reverse`) / `std:array` `reduce`,
  which is CALLBACK-first (`(self, f, init)`) / a hand-written `reduce` that is INIT-first)
  x **container** (bare / list / list-of-list / map value / struct field). The last two are
  D33's binding-column axis carried forward; neither contributed a moved cell here, so this
  change says nothing new about that column and does not claim to.

  | | master `f2064bec` | branch |
  |---|---|---|
  | runs | 100 | **137** |
  | check-clean invalid wasm | 247 | **219** |
  | loud emit reject | 553 | **544** |
  | loud check reject / compiler trap / wrong value | 0 | 0 |

  **37 cells moved: 28 `check-clean invalid wasm → runs` and 9 `loud emit reject → runs`; 0
  backward.** The two DISCRIMINATORS are in the moved cells' own distribution rather than in
  an argument: **producer `anon` 37 of 37** (`named` 0, `call` 0) and **container `list` 37 of
  37** (`bare` 0, `listlist` 0, `mapval` 0, `field` 0). Both rows are the same coordinate on
  both of those axes, and nothing else moved on either. The twin axis SPREADS — none 9,
  namediff 9, armtwin 9, exact 5, after 5 — and **a twin is not necessary**: the nine `none`
  movers declare no standalone struct at all. What the twin decides is only which FAILURE the
  cell had beforehand. Per twin, by the outcome it moved FROM:

  | twin | from `loud emit reject` | from `check-clean invalid wasm` |
  |---|---|---|
  | none / namediff / armtwin | 3 each | 6 each |
  | exact / after | 0 | 5 each |

  Where no standalone row shares the layout, three of the nine cells had no struct row to
  resolve onto at all and were the LOUD `field access but no struct type declared`; where one
  does, every mover was already silent, because the wrong row existed to be found.

* **THE COMPLEMENT ALREADY EXISTED — the fourth consecutive rung of this family to close that
  way**, after D26's namespace check, D32's `exprVariantIndex` gate and D33's `variantRowOfTy`.
  Three classifiers key an array literal's ref-list row and their own headers require them to
  agree ARM FOR ARM — `arrLitElemName` (the row's NAME), `arrLitElemKind` (kind 1 struct
  element / kind 2 union box) and `arrLitElemHintTy` (the arena row the name denotes). Each
  carried its OWN copy of one line:

      if uDeclared {
        if objVariantName(a.arrElems[0]) != "" { ... the whole UNION ... }
      }

  `objVariantName` is a global FIELD-NAME-SET scan of the variant table. In any program
  declaring `Shape = Circle | Sq` it answers `Circle` for an anonymous `{ r: n }`, and the arms
  then widened that to `Shape` — so `const o = [{ r: n }]` built a kind-2 BOX list. Every
  CONSUMER of the same anonymous shape resolves it to a nominal ROW and none of them widens
  (`structIndexOfObj` at a field read, `shapeNominalOfTy` at the monomorphizer's pin).

  `arrLitBoxElemName` is the predicate that was already written: it asks the ARENA whether the
  CHECKER recorded this array's element as a non-literal union of two or more members, and its
  own header states the rule this rung needed — *"asked of the ARENA rather than inferred from
  the render, because the render is shared — a struct / map / closure / nested-array element
  also answers a non-`""` name and none of those is a union to register"*. It was written for
  `collectU`'s registration pass and for the scalar classifiers, and had no caller on the
  object-literal path. Measured at the site:

      D36  vn=[Circle]     box=[]          si=0    -> was widened to `Shape`
      D38  vn=[Circle$m0]  box=[]          si=-1   -> was widened to `Shape$m0`
      het  vn=[Circle]     box=[Circle|Sq] si=-1   -> `Shape`, and CORRECTLY so

  The three arms now share ONE function, `arrLitObjElemBoxVariant`, rather than three copies —
  which is the part that keeps them agreeing. **Gating `arrLitElemName` alone changed nothing
  at all**: the emitted bytes were identical, because `arrLitElemKind` still answered 2 and the
  row interned as a box under the new name. Two of the three arms were invisible to the first
  fix and only the byte comparison caught it.

* **AND A SECOND RUNG UNDER THE SAME PREDICATE, which is why D38 needs no twin.** With the
  widening gated, an anonymous element whose only claimant is an ARM has no `sNames` row for
  `structIndexOfObj` to find, so `arrLitElemName` returns the ARM's own name instead of "" —
  the same ladder order every consumer already uses (struct row, then variant row; see
  `shapeNominalOfTy`). `rlElemLitStructRow` then declines, the array-literal lowering seeds
  `variantIndexOf(name)`, and the backing array is built over the BARE variant struct, which is
  the unboxed `(ref null $uVarHeap[Circle])` element the reader was already expecting. Without
  that line D38's literal has no name here at all and falls to the i32 list.

* **THE DISASSEMBLY IS ONE ARRAY TYPE AND TWO INSTRUCTIONS** (`wasm-tools print`, master
  `f2064bec` vs branch, on D36's own filed witness; every other line in the module identical):

      master   (type (;4;) (array (mut (ref null 3))))   ; 3 = the union BOX {i32, anyref}
               i32.const 0 / struct.new 1 / struct.new 3 ; tag, uVarHeap[Circle], then the box
      branch   (type (;4;) (array (mut (ref null 0))))   ; 0 = Dot's standalone row
               struct.new 0

  and the READ is `struct.get 0 0` under BOTH — which is the whole of "expected (ref null
  $type), found (ref $type)": two DIFFERENT heap types behind one placeholder. On D38 the same
  edit is `(type (;7;) (array (mut (ref null 2))))` → `(ref null 0)`, the box row dropping out
  of the module entirely as `mk`'s result and `mapIndexed$m1`'s minted `U[]` collapse onto one
  list type.

* **VARIANTS STAY NOMINAL**, the same ruling D32 and D33 were placed under. The fix does not
  dedup the arm and the anonymous shape — they genuinely share a layout — it stops a STRUCTURAL
  scan answering a question the CHECKER had already answered. `objVariantName` keeps its job at
  every site that has a union CONTEXT (`emitUnionCoerce` through `unionArmVariantForObj`, the
  variant-literal construct); what it loses is the un-contexted array-literal path.

* **CORPUS BYTE-IDENTITY vs `f2064bec`: 2,263 files walked, 1,813 compile under both seeds,
  424 fail to compile under both (pre-existing `error-`/`xfail-` cases), 0 lost, 0 gained, 26
  byte-different.** Every one of the 26 was RUN under both seeds: **25 behave identically**
  (same exit code, same stdout) and the 26th is D36's own `@no-instantiate` pin, which now
  prints 7. The 25 are the literals whose row key moved from a union alias to a struct or arm
  name without changing what the program does — union/struct-arm array literals in
  `unions/`, `closures/`, `maps/`, `arrays/`, `lists/`, `types/`, `loops/`, `structs/` and
  `generics/mono-callback-bound-arm-beside-layout-twin.vl`.

* **WHAT REMAINS AND WHERE.** The grid's residue is 219 silent cells, every one of them live
  at the same coordinates on master. They are not this root's residue and the axes say so:

  | population | cells | row |
  |---|---|---|
  | `anon`, an ANNOTATED result, the `exact` / `after` twin (12 `bare` + 8 `list`) | **20** | **D39** below |
  | `named` producer — the element is an IDENT of a declared ARM type | **135** | **D40** below (50 of them also `mapval`) |
  | `call` producer — the element is a CALL result | **64** | D40's sibling (50 also `mapval`) |
  | of which `mapval` container, either producer | *(100)* | **D34** |
  | of the `named` total, the `bare` container with NO union required | *(subset)* | **D41** below |

  No arm of this fix can see the `named` or `call` populations: their first element is not an
  `ObjLit`, so the three classifiers' object arms never run. The 20 `anon` cells that remain
  are flat across all four ANNOTATED routes and absent from all five inferred ones, which is
  the axis D39 is filed on.

---

### D39 — [CLOSED 2026-08-26] an ANNOTATED result over an UN-ANNOTATED local holding an anonymous element, beside an exact layout twin
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). Was: check-clean invalid wasm · found 2026-08-26 in D36/D38's OWN closing grid, which left these 20 of its 900 cells silent under BOTH compilers at the same coordinates · pre-existing (silent on `f2064bec`; that change moved its BYTES, not its outcome) · eleven lines, NO import, NO generic, NO lambda · THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function mk(n: i32): Circle[] {
      const o = [{ r: n }]
      return o
    }

    print(mk(7)[0].r)
    // vl check rc 0 with NO diagnostics at all — not even a hint; vl run:
    //   failed to compile: …::mk — type mismatch: expected (ref $type), found (ref $type)

* **THE RETURN ANNOTATION IS THE AXIS, and that is what makes it a different rung from D36
  rather than the same one.** Controls, each ONE line different from the witness, each RUN:

  | control | outcome |
  |---|---|
  | the return annotation DROPPED (`function mk(n: i32) {`) | **runs, prints 7** |
  | `Dot` DELETED | runs, prints 7 |
  | `Sq` + `Shape` DELETED, so `Circle` is not an arm | runs, prints 7 |
  | `type Dot = { q: i32 }` (same arity, different field NAME) | runs, prints 7 |
  | the LOCAL annotated (`const o: Circle[] = [{ r: n }]`) | runs, prints 7 |

  So it needs three things at once: the ANONYMOUS element, the exact-layout standalone twin,
  and a `Circle[]` annotation on the RESULT but not on the local.
* **IT IS A FOURTH PARTY DISAGREEING WITH A LADDER THAT IS OTHERWISE CONSISTENT.**
  `arrLitElemName` resolves an anonymous object element to a nominal ROW — struct table first
  (`structIndexOfObj` → `Dot`), variant table second — which is the ladder D36/D38's fix
  installed and the one every CONSUMER of an anonymous shape already used. The checker does
  not push a return annotation into an un-annotated local: probed, the array node's recorded
  element is the anonymous `{r: i32}` even with `: Circle[]` present. So the local builds
  `Dot`'s row while the result boundary says `uVarHeap[Circle]`. Delete `Dot` and the ladder's
  SECOND rung answers `Circle`, which is what the boundary wanted, and the program runs — which
  is why the `none` and `namediff` columns are clean and only `exact` / `after` are not.
* **20 CELLS, and the CONTAINER is not one of its axes.** 12 are the `bare` container (the same
  shape with no list at all: `function mk(n: i32): Circle { const o = { r: n }  return o }`) and
  8 are `list`. Flat across all four ANNOTATED routes (plain function, lambda, `std:array`
  callback, hand-written generic callback) and absent from all five inferred ones.
* Pinned as `tests/cases/soundness/xfail-miscompile-annotated-list-return-anon-elem-twin.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC`.

---

**CLOSED — and this is the FIRST row in this family whose complement was NOT already
written.** D26, D32, D33, D36/D38 and D37 all closed by calling a predicate that existed, was
documented correct, and simply had no caller on the failing path. Here there is no such
predicate and there cannot be one, and the row's own controls say why: `structIndexOfObj`
finds `Dot` by field set, `objVariantName` finds `Circle` by field set, and with the return
annotation DELETED `Dot` is the RIGHT answer and the program runs. Two structural claimants,
one anonymous shape, and only the CONTEXT separates them.

* **THE FIX CARRIES THE ANNOTATION INSTEAD OF RE-DERIVING IT** — `synthRetPinAnn`, the third
  member of `synthEmptyListAnn` / `synthNullableAnn`, whose headers already state the rule:
  *"an annotation is the ONE input every downstream path reads, so writing the inferred type
  back as one makes the slot classifier agree without teaching it to re-infer"*. The
  destination behaviour is not a guess either: it is the row's own fifth control, `const o:
  Circle[] = [{ r: n }]`, which was already measured RUNNING.
* **SCOPED TO THE STRUCT/VARIANT SEAM, WHICH IS THE ONLY ONE THAT CANNOT BRIDGE.** Two
  DECLARED structs of the same layout merge at the heap layer (`sTwin`), which is exactly why
  the row's `Sq`/`Shape`-deleted control RUNS — so the pin fires only where the return
  annotation names a CONCRETE VARIANT, bare or as a ref-list element. `DECISIONS.md` records
  that seam as nominal and D32/D33/D34 are the three rungs already placed under that ruling.
* **AND ONLY OVER A LITERAL.** The pinned binding's initializer must be an object literal, or
  a list whose first element is one: those are the producers whose row is chosen by a
  field-set scan. A local initialized from a CALL or an IDENT already carries its producer's
  committed rep, and re-pinning it would move a value rather than name it.
* **THE ALIAS SPELLING NEEDED THE LOOKUP D41's FIX BUILT**, which is the one coupling between
  the three roots and it is a coupling of LOOKUPS, not of mechanisms. `const o0 = { r: n }
  const o = o0  return o` must pin `o0` — annotating `o` alone asks for a coercion between two
  heap types that has no adapter — so the pin resolves the returned ident through
  `retLocalLetOfBlock`, the same chased lookup `criRetLocalLet` uses.
* **16 CELLS on the shared grid, all of them `ann=result`**, and 0 of them shared with either
  other patch. The BARE container is 12 of the row's own 20 and closes with the list.
* **DISASSEMBLY**, master `c0873a06` (seed 1,429,387 bytes) vs the closing branch (seed
  1,431,479 bytes after the #1948 merge), on the filed witness; every other instruction in
  `mk` identical:

      master   (local (ref 7))   array.new_fixed 6 1   struct.new 0 / struct.new 7
      branch   (local (ref 5))   array.new_fixed 4 1   struct.new 1 / struct.new 5

  where master's `0` is `Dot`'s standalone row and the branch's `1` is `uVarHeap[Circle]` —
  the two `$type`s the engine's message could not tell apart.
* Graduated to `tests/cases/unions/annotated-return-pins-unannotated-local.vl` (five cells:
  list, bare, through an alias, the no-annotation axis control, and a struct/struct layout
  twin that always ran). `xfail-miscompile-annotated-list-return-anon-elem-twin.vl` is
  DELETED, which is that file's own written instruction for the day it starts passing.

---

### D40 — [CLOSED 2026-08-26] an UN-ANNOTATED local holding a list of a DECLARED union arm, returned under an annotated `Circle[]`
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`), and so does the `std:array` spelling beside it. Was: check-clean invalid wasm, then a loud emit reject for one commit (#1948's floor) · found 2026-08-26 in D36/D38's closing grid — the largest single population in its residue (135 `named`-producer cells, 64 more at the `call` producer) · pre-existing and byte-identical on `f2064bec` · NO twin, NO generic, NO import, NO anonymous shape**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(n: i32): Circle[] {
      const c: Circle = { r: n }
      const o = [c]
      return o
    }

    print(mk(7)[0].r)
    // vl check rc 0 (no diagnostics at all); vl run:
    //   failed to compile: …::mk — type mismatch: expected i32, found (ref $type)

SECOND SPELLING, on `std:array`'s own surface — this is the one that puts it in that module's
header, and its engine MESSAGE differs, which is recorded rather than smoothed over:

    import { mapIndexed } from "std:array"

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(n: i32, _i: i32) {
      const c: Circle = { r: n }
      const o = [c]
      return o
    }

    print(mapIndexed([7], mk)[0][0].r)
    // vl check rc 0; vl run:
    //   failed to compile: type mismatch: expected (ref $type), found (ref $type)

* **THE INTERMEDIATE BINDING IS THE AXIS ON THE IMPORT-FREE SPELLING ONLY, and the std review
  of this change caught the difference.** `return [c]` with no intermediate local RUNS above and
  is SILENT through `mapIndexed` — the same message, unchanged. The remedy that holds for BOTH
  is annotating the local. That distinction was written the wrong way round into `std/array.vl`'s
  header first, as a remedy a caller would have followed into a `vl check`-clean invalid module,
  which is the worst shape this repo files. Measured, all four `vl check` rc 0:

  | spelling | import-free | through `mapIndexed` |
  |---|---|---|
  | the witness | silent | silent |
  | `return [c]`, no intermediate local | **runs, 7** | **silent** |
  | `const o: Circle[] = [c]` | **runs, 7** | **runs, 7** |
  | annotate the callback's own return `: Circle[]` | (is the witness) | silent |
* **THE TWO SPELLINGS GIVE DIFFERENT ENGINE MESSAGES** — `expected i32` import-free, `expected
  (ref $type)` through `mapIndexed` — so whether they are one rung or two is OPEN. Both are
  silent, both are byte-identical on `f2064bec`, and both are fixed by the same two one-line
  controls; that is what groups them here. Do not read the grouping as a measured shared root:
  this doc has had that hypothesis refuted as often as confirmed, and nothing was ablated.
* **THE MESSAGE NAMES THE MECHANISM AND IT IS A DIFFERENT ONE FROM D36/D38's.** `expected i32`,
  not `expected (ref …)` — the literal fell to the **i32 list** rather than resolving to the
  wrong ref row. `arrLitIsRef`'s first-element probes are syntactic (`ObjLit` / `FuncDecl` /
  `ArrayLit`) and an IDENT is none of them; its last two rungs ask the CHECKER's recorded
  element, which is `Circle` — an arm, not a union and not a map — so every rung declines and
  the ref-list classification never happens. That is the same shape as the defect
  `arrLitUnionElemName`'s own header records for `const xs = [pick(true)]` and `const xs = [w]`,
  one type-class further out: there the missing case was a union arriving by CALL or IDENT,
  here it is a union ARM arriving the same two ways.
* Controls, each ONE line different, all measured:

  | control (on the IMPORT-FREE witness) | outcome |
  |---|---|
  | `return [c]` with no intermediate local | **runs, prints 7** |
  | the LOCAL annotated (`const o: Circle[] = [c]`) | runs, prints 7 |
  | the element written ANONYMOUSLY (`const o = [{ r: n }]`) | runs, prints 7 (that is D36/D38) |
  | the return annotation DROPPED | LOUD (`emitProgram: field access but no struct type declared`) |
  | `Sq` + `Shape` DELETED, so `Circle` is a plain struct | LOUD (`emitProgram: struct array elements are not supported`) |

  The last two are what keep it out of D39's family: D39's own axis control (drop the return
  annotation) is LOUD here rather than running, and the plain-struct control reaches a
  documented emit floor rather than the defect.
* **IT IS A GENUINE `std:array` CARVE-OUT BY THE ROUTING TEST, and that is a stronger statement
  than "a caller can reach it".** The std spelling has no return annotation, and its import-free
  sibling — the same body called directly — is the LOUD `emitProgram: field access but no struct
  type declared`. Routing the identical producer through `mapIndexed` turns that loud refusal
  into silence, which is D35's property at a second position. **The BARE container does the same
  thing** (`const c: Circle = { r: n }  const o = c  return o`): loud called directly, silent
  through `mapIndexed`. Both containers are counted in `std/array.vl`'s header for that reason.
* **ALMOST FLAT ACROSS THE TWIN AXIS, and the exception is measured rather than rounded off**:
  the 135 `named` cells are 25 at `none`, 25 at `namediff`, 25 at `armtwin`, 30 at `exact` and
  30 at `after`. The witness above is in the flat 25 — no twin at all — which is what separates
  it from D32/D33/D39. The extra 5 at each exact-layout spelling are all `bare`-container
  (`named__fnInf__bare`, `named__lambdaInf__bare`, `named__lambdaAnnot__bare`,
  `named__stdInitFirst__bare`, `named__handInitFirst__bare`) and are a twin-sensitive shape
  that is NOT reduced here; they are recorded as unattributed rather than claimed for this row.
* The `call` producer (`[mkC(n)]`, a call result) is 64 cells with the same 10/10/10/17/17
  twin profile and is very likely the same root by `arrLitIsRef`'s own account — an IDENT and a
  CALL miss the same first-element probes. It is recorded as a sibling rather than folded in,
  because it was not separately reduced to a witness.

---

**CLOSED — the row's own `arrLitIsRef` diagnosis was right, and the complement it needed was
one function away in the same file. D65, filed one commit earlier by an unrelated grid, says
the same thing in its own words and closes with it.**

* **BOTH SPELLINGS ARE ONE RUNG AND THE ABLATION SETTLES IT**, which the row filed as OPEN
  ("whether they are one rung or two is OPEN … nothing was ablated"). One predicate moves the
  import-free witness AND the `mapIndexed` one, and moves neither of the two rows closed
  beside it. So do the `call` producer the row recorded as an unreduced sibling, the
  PLAIN-STRUCT control the row used as evidence that the arm was required, D65, and D66.
* **THE COMPLEMENT.** `nodeArrayElemName`'s own header states the rule: *"the emitter's
  first-element SYNTAX probe cannot see such an element: a CALL (`[pick(true)]`) and an IDENT
  (`[w]`) are neither an object literal nor a nested literal, so with no recorded name the
  literal fell to the i32 list"*. It says that of a value UNION element and installed
  `arrLitUnionElemName` for it; one type-class in — a union ARM or a plain DECLARED STRUCT —
  nothing answered. **D65's row asks for exactly this and names the channel**: *"the inferred
  spelling should reach the ref-list path the annotated one does; the channel is the checker's
  recorded type on the array-literal node (`arrLitArenaElemRow`, which already exists), not a
  spelling."* `arrLitNominalElemName` is that rung, reading the same recorded element row and
  resolving it through `arrElemNominalOfTy` → `shapeNominalOfTy` (banked struct row, then
  `variantRowOfTy` — arm-DECLARATION identity — then the field-set scans, the ladder D33
  installed). Read by `arrLitIsRef`, `arrLitElemKind` and `arrLitElemName`, and DECLINED by
  `arrLitElemHintTy`, which is the fourth classifier's own documented rule for an arm.
* **#1948's FLOOR IS NOT REDDENED, IT IS OUT-RANKED.** That change gave the array-literal
  ladder its missing VARIANT arm — `emitProgram: union-arm array elements are not supported in
  this position` — which turned this row and D65 from silent into loud. The floor stays; the
  literal simply never reaches it any more, because the ref-list classification now happens
  one layer earlier. On the closing branch the witness RUNS and the floor is still there for
  the shapes that genuinely have no rep.
* **THE `Sq`/`Shape`-DELETED CONTROL IS A SYMPTOM, NOT AN AXIS, and the fixture that said so
  was already in the corpus.** The row cites that control's LOUD `emitProgram: struct array
  elements are not supported` as what "keeps it out of D39's family". It is the SAME missing
  rung one type-class over: the i32 list refuses a struct element at its floor and swallows a
  variant one. `tests/cases/arrays/error-inferred-union-element-lone-struct.vl` pinned that
  loud cell and its header named the fix outright — *"closing it means teaching `arrLitIsRef`
  to read a bare struct element off the arena, which is a separate slice with its own kind,
  its own hint column and its own grid. Left open deliberately; the reject is loud."* That
  file is now `tests/cases/arrays/inferred-lone-struct-element-list.vl`, running.
* **THE `std:array` CARVE-OUT IS RETIRED BY THE ROUTING TEST'S OWN CRITERION** at the LIST
  container: written directly and routed through `mapIndexed`, both RUN. The BARE container
  is D66, and it retires too — for the other reason: both sides are now the SAME loud refusal.
* **60 CELLS on the shared grid, 0 of them shared with either other patch**, plus 12 more that
  need this patch AND D41's lookup together (an ALIAS of a list of a `: Circle`-annotated
  value — the lookup has to reach the right `let` and that `let`'s literal has to classify as
  a ref list). That composition is what a two-root path looks like and a shared root does not.
* **DISASSEMBLY**, master `c0873a06` vs the closing branch, on the import-free witness:

      master   (local (ref 0) (ref 6))   array.new_fixed 3 1   struct.new 6
               ; type 3 = (array (mut i32))              — the i32 backing
               ; type 6 = the i32-list wrapper, under a (ref 8) ref-list RESULT
      branch   (local (ref 0) (ref 4))   array.new_fixed 3 1   struct.new 4
               ; type 3 = (array (mut (ref null 0)))     — the element's own row
               ; type 4 = the ref-list wrapper, and the result valtype is (ref 4)

  Master's module also carried the whole string/i32-list helper set the i32 route pulled in;
  the branch emits neither.
* Graduated to `tests/cases/unions/arm-element-list-from-ident-or-call.vl` (four cells: the
  annotated result, the un-annotated result, a CALL element, and the `mapIndexed` route) and
  to `tests/cases/unions/plain-struct-element-list-from-ident.vl`, which is the no-union half
  and a separate file because arm-ness is a whole-program property.

**BOTH LIST SPELLINGS ARE LOUD AS OF D49's CLOSE, AND THE BARE ONE IS NOT — so the two
containers this row deliberately kept together really were two rungs.** The missing VARIANT
arm in the array-literal i32 fallback (see D65) floors the list container at both spellings:

    import-free witness   `emitProgram: union-arm array elements are not supported in this position`
    through `mapIndexed`  the same message, at the callback's own `const o = [c]`

The BARE container (`const o = c`, no list) is UNMOVED and byte-identical
(`expected (ref $type), found i32` at offset 479 through `mapIndexed`, `vl check` rc 0), so it
is re-filed on its own as **D66**. The "different engine messages, one rung or two is OPEN"
question above is thereby ANSWERED for the pair it was asked about: both LIST spellings share
the array-literal floor, and the BARE container does not reach it at all.

The two `std:array` carve-outs this row supplied are now ONE (`std/array.vl`'s ledger is
updated with the same measurement). What is still owed is the REP, not the floor — an inferred
arm-element list should reach the ref-list path the annotated one does; see D65.

---

### D41 — [CLOSED 2026-08-26] an un-annotated local ALIASING an un-annotated object literal, returned
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). Was: check-clean invalid wasm · found 2026-08-26 by the `std-api-reviewer` pass over D36/D38's OWN retirement — the FIFTH consecutive time that review has produced the closing change's next row · pre-existing and byte-identical on `f2064bec` (same offset, same message) · SEVEN lines, no import, no generic, no union, no twin, no annotation and NO TYPE DECLARATION AT ALL**

Repro:

    function mk(n: i32) {
      const c = { r: n }
      const o = c
      return o
    }

    print(mk(7).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   failed to compile: …::mk — type mismatch: expected i32, found (ref $type)

* **THE ALIAS IS THE WHOLE OF IT.** Two controls, each ONE line different, both RUN:

  | control | outcome |
  |---|---|
  | `return c` — drop the intermediate local | **runs, prints 7** |
  | `function mk(n: i32): Circle` with `type Circle = { r: i32 }` declared | **runs, prints 7** |

  A third, `return o.r` inside `mk` so the object never crosses the return boundary, also runs.
  So the defect is an un-annotated RETURN whose value reaches it through an alias of an
  anonymous object literal; the emitter types the result `i32` and the body hands it a ref.
* **THE REVIEW FOUND IT AND ITS DIAGNOSIS WAS WRONG, which is why this row carries a smaller
  witness than the one filed.** The review's nine-line version imports `mapIndexed` and declares
  a struct, and it concluded "the route is the whole of it — this is D35's property at the RESULT
  position", on a direct-call control that was LOUD. That control had a UNION declared. Delete
  the union and the direct call is SILENT too — the seven lines above, with nothing declared —
  so the generic is not the axis and neither is the union. Re-running the review's own control
  cells is what separated them; the finding survived, the mechanism did not.
* **IT IS THEREFORE NOT A `std:array` CARVE-OUT** under that header's routing test (an outcome
  that is WORSE through the module than written directly), and `std/array.vl` names it as a
  compiler row rather than counting it. The union-PRESENT bare cell IS a carve-out and is
  counted there, under D40.

  **BOTH HALVES OF THAT BULLET ARE FALSE AND THE MEASUREMENT IS BELOW** — corrected at this
  row's close rather than left standing, because a reader following the pointer got the
  opposite answer at both ends. (i) This cell IS worse through the module: routed through
  `mapIndexed` it is `emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or
  string parameters are supported` on `c0873a06`, on `6bb5d46f`, on `cbc61bd4` and on the
  closing branch alike, while the direct spelling now RUNS — a carve-out by the criterion, and
  the simplest spelling of the class (`function mk(n: i32, _i: i32) { return { r: n } }`, two
  lines, no local) was one on every one of those compilers. (ii) The union-PRESENT bare cell
  (D66) is NOT a carve-out any more: it is the same loud refusal on both sides (D51).
  `std/array.vl`'s ledger carries the long form.
* **IT IS THE UNION AXIS THE 900-CELL GRID COULD NOT SEE.** `type Sq`/`type Shape` are declared
  in every one of those 900 files, so a cell whose finding is "the union is not required" was
  outside the population by construction. That is the same shape as the two entries
  `std/array.vl`'s ledger already catalogues (a grid that held the callback result's SPELLING
  constant, and "the diagonal passing for a cross product") — a population measurement is only
  as wide as its axes.
* Pinned as `tests/cases/soundness/xfail-miscompile-alias-local-anon-objlit-return.vl`,
  `@no-instantiate`. It is NOT the specimen — `INVALID_MODULE_SRC` points at D39 — but the
  tripwire's biconditional only asks that the marked set be non-empty while a specimen is
  named, so a second pin is legal and is what freezes this shape.

---

**CLOSED — a lookup that stops one hop short, in a pass whose whole reason for existing is
that no local has been collected yet.**

* **THE MECHANISM IS THE RESULT VALTYPE AND NOTHING ELSE**, which the row's message direction
  already said (`expected i32`, not `expected (ref …)`) and the disassembly confirms: master's
  two LOCALS were both `(ref 0)` — `buildLocals` had the object right — while the function's
  functype said `(result i32)`. One line of wasm changes and nothing else in the module moves:

      master   (type (;1;) (func (param i32) (result i32)))
      branch   (type (;1;) (func (param i32) (result (ref 0))))

* **WHY THE LOOKUP AND NOT THE CLASSIFIER.** `criClassify` is a GLOBAL pass: `buildLocals`
  runs per function much later, so `exprStruct`'s Ident arm — which answers for a param, a
  global and a capture — has nothing to read for a body-declared local. `criRetLocalLet`
  exists for exactly that reason, resolving the returned ident to its `let`. An INIT that is
  itself a bare local ident is the same miss one hop further in.
* **ONLY AN UN-ANNOTATED LINK IS FOLLOWED**, and that is what makes the hop transparent rather
  than a guess: an annotation PINS the cell's rep (`letIsStruct`, `letIsRefArray` and
  `structIndexOfLet` all read it first), so every let on the chain is un-annotated and each
  one's rep IS the next one's, down to the declaration that has an answer. The step bound is a
  termination guard on a node arena the lookup did not build, not a policy.
* **40 CELLS on the shared grid, 0 of them shared with either other patch.** The chase also
  carries the LIST spelling (`const c = [{ r: n }]  const o = c  return o`, `emitProgram:
  field access receiver is not a struct` on master) and a two-hop chain, both by construction
  rather than by a second arm.
* **THE UNION-PRESENT CELL IS NOT CLOSED AND IT IS FILED, NOT LEFT.** Add `type Shape = Circle
  | Sq` to the witness and the same program is `emitProgram: ref valtype with no interned
  shape` on master and on this branch alike: the returned-local rung's struct arm claims it
  and `structIndexOfLet` answers -1, because a union ARM has no `sNames` row and the rung has
  no VARIANT fall-through. That is D51, and it is the same "struct row, then variant row"
  ladder D38's fix took only the first half of, one pass over.
* Graduated to `tests/cases/soundness/unannotated-return-through-local-alias.vl` (five cells:
  the filed witness, two hops, the list spelling, a chain that ENDS at an annotated let, and
  the alias of a PARAM, which never had the defect and covers the lookup's stopping condition
  from the other side). `xfail-miscompile-alias-local-anon-objlit-return.vl` is DELETED.

---

### D42 — [CLOSED 2026-08-26] a `needle: T` the checker WILL `==` loses that ACCEPTANCE in the instantiation
**CLOSED 2026-08-26 — the repro now RUNS and prints the right index (`1`). Was: check-clean invalid wasm · found 2026-08-26 by D35's 1712-cell grid (96 cells, the largest of three residue families) · pre-existing, byte-identical on `f2064bec` and on D35's branch · NO struct, NO layout twin, NO hand-written generic needed (though every route reproduces)**

**THE DIRECTION THAT COUNTS AS A WIN HERE IS `runs`, NOT LOUD**, and it is worth saying before the mechanism because the neighbouring row's win is the opposite. D42 is an ACCEPTANCE lost; a fix that made these cells loud would be D35's over-broad twin, which is already filed as **D45**. The close is graded against `runs`: 16 of the grid's cells moved `check-clean invalid wasm → runs`, none of this family moved to a refusal.

Repro:

    import { indexOf } from "std:array"

    function mkT(i: i32): string | null {
      if i > 1 { return "b" }
      return null
    }

    function cell(): i32 {
      const xs: (string | null)[] = [mkT(1), mkT(2)]
      const nd: string | null = mkT(2)
      return xs.indexOf(nd)
    }

    print(cell())
    // vl check rc 0; vl run:
    //   failed to compile: …::indexOf$m1 — type mismatch: expected (ref $type), found
    //   (ref null $type)

* **IT IS D35'S MIRROR, and that is the reason to file it separately rather than as D35's
  residue.** D35 was a REFUSAL the checker holds and the pin drops. This is an ACCEPTANCE the
  checker holds and the pin drops: `eqCmpKindOfTy(string | null)` is `"nulstr"` — a compare
  CORE exists, `emitNulNicheEq` owns it — and the direct spelling is correct at run time. So
  D35's fix cannot reach it and must not: `eqRefusals` is right to say nothing here.
* **THE CONTROL RUNS AND IS CORRECT.** Two `string | null` bindings compared directly print
  `0` — the null guard and the string compare both fire:

      const a: string | null = mkT(2)
      const b: string | null = mkT(2)
      if a == b { return 0 }
      return -1

* **THE AXIS IS THE NULLABLE / VALUE-UNION REP AT THE PIN, not equatability.** Measured across
  the grid's whole rep vocabulary, at `T = <rep>` with a `T[]` receiver, all four `needle: T`
  exports plus a hand-written generic of the same signature, spelled out (no alias):

  | `T` | direct `==` | every generic route |
  |---|---|---|
  | `string \| null` | runs, correct | **check-clean invalid wasm** |
  | `i32[] \| null` | runs, correct | **check-clean invalid wasm** |
  | `i32 \| null` | runs, correct | loud emit reject |
  | `Circle \| null` | runs, correct | loud emit reject |
  | `i32 \| string` | runs, correct | loud emit reject |

  The first two are the silent half — 96 of the 113 cells the branch still grades silent after
  D35's close, and the largest of three residue families rather than the whole residue. The
  other three are honest and are listed because the split is the finding: the NICHE-repped
  nullables (a `(ref null …)` whose non-null core exists) are the ones that get through the
  pin and hand a nullable ref to a non-null slot; the BOX- and SENTINEL-repped ones are
  refused at emit.
* Non-nullable `T` is unaffected and correct at every route after D35's close: `i32`, `f64`,
  `string`, `boolean`, `i32[]`, `string[]`, `boolean[]`, `i32[][]`, a plain struct, a scalar
  literal union and a closure all run; `f64[]`, `Circle[]`, `{[string]: i32}`, `CM[]`, `K[]`
  and a struct with a map field are all LOUD at both spellings.
* **THE REMEDY IS D35's, WITH D35's CORRECTION ATTACHED**: project to a key and search that,
  **only where the key is unique in the receiver** — a first element is not a key, and the
  version of this sentence that omitted the qualifier returned the wrong index (`std/array.vl`'s
  ledger takes it as an over-promise). Where no unique key exists, the element-wise loop. Here
  the projection costs nothing a caller did not already owe, because a nullable needle has to be
  discriminated before it can be searched for at all. Unlike D35's, this remedy DOES expire —
  the direct compare works, so the pin is expected to grow the same rep one day.

#### The close

**WHERE THE ACCEPTANCE WAS LOST, exactly, and why it is NOT where D35's refusal was.**
`binEqNulNiche` decides whether a `==` needs the null-guarded lowering, and it asked ONE
channel: `nodeEqCmpKind`, the type the CHECKER banked on the operand node. `monoCloneBody`
rebuilds only the STATEMENT SPINE of an instance and SHARES every leaf expression, so one
`self[i] == needle` node serves every instantiation of `indexOf<T>` and the type on it is `T`
however the instance was pinned. `eqCmpKindOfTy` answers `""` for a `TyVar` — correct about the
type variable, silent about `string | null` — the guard was skipped, and the plain string
compare fed a `(ref null $array)` into a `(ref $array)` slot.

**SO THE DEFERRED CONSTRAINT IS THE WRONG CHANNEL HERE, and that was worth checking rather than
assuming.** D35's fix rode `noteBinCstr` / `validateBinCstrs` because it had a REFUSAL to carry
to the call site. This row has no refusal — the checker is right to accept — so there is nothing
for `eqRefusals` to say and nothing for a `vl check` gate to state. The answer has to arrive at
EMIT, where the instance exists. **D35's "place the gate at `vl check`, not `emit_mono`" holds
for a RULE; it does not apply to a LOWERING.**

**THE SECOND CHANNEL WAS ALREADY WRITTEN, AND SO WAS THE PRECEDENT FOR ASKING IT.**
`exprNullableString`, `exprNullableRefNiche`, `exprNulClosure`, `exprNullableList`,
`exprNulScalarListKind` and `exprNullableRefArray` are the emitter's own rep classifiers, all
`fnIx`-SCOPED — and a monomorphized instance IS its own emitted function with its own parameter
kinds, so they answer per instance where the node cannot. `isNumRecvBaseName` in the same file
has EXACTLY this two-channel shape for an `is` receiver, and its header already says why:
"gating on the node's banked type alone cannot see an instance at all". `binEqNulNiche` was a
one-channel consumer that predates it.

**THREE RUNGS.**

1. `exprNulNicheKind` — the emitter's own name for the six niches, `eqCmpKindOfNulInner`'s six
   tokens read off the classifiers instead of off the arena. Exactly the six whose NON-NULL core
   exists, because that is the contract `emitNulNicheEq` is written against.
2. `eqCmpKindOfOperand` — ONE HOME asking the banked type first and the classifiers second,
   **gated on `nodeTyIsTyVar` rather than on "the first channel said nothing"**. The five other
   reasons `eqCmpKindOfTy` answers `""` (a literal, a literal union, a value-union box, the two
   SENTINEL-repped nullables, the error hole) all mean "the existing dispatch owns this rep and
   is already correct", and claiming them would wrap a guard around a compare that already
   null-tests correctly. Only the type variable means the question was never answered.
3. **BOTH CONSUMERS ASK IT, and a first cut that gave the channel only to the GUARD is the
   measurement that says so.** `binEqNulNiche` decides whether there is a guard;
   `eqCoreKindOfBin` decides which CORE goes under it. With the channel on the guard alone,
   `i32[] | null` reached `emitNulNicheEq` with the core selection still answering -1 and the
   eight std cells became ``emitProgram: `==` over this operand rep has no compare core`` —
   silent → loud instead of silent → runs. Wiring the same home into the core selection also
   keeps the frame-reservation scan (`leqNoteBin`, which reads `eqCoreKindOfBin`) in agreement
   with the emitter by construction, which its own header requires.

**THE MEASUREMENT.** The `std:array` half of the grid — `T` over the rep vocabulary x all four
`needle: T` exports x receiver delivery — moves **16 cells `check-clean invalid wasm -> runs`**,
every one correct against a hand-computed answer: eight `string | null` and eight `i32[] | null`,
across `indexOf` / `lastIndexOf` / `includes` / `count` and both a bound and a call-result
receiver. **No cell of this family moved to a refusal**, which is the grading this row requires.

**THE GRID ENUMERATED TWO REPS AND THE FIX HAS A BOUNDARY, and the difference is a finding
rather than a rounding.** `eqCmpKindOfNulInner` names SIX niche tokens and `exprNulNicheKind`
mirrors all six, so the admission is the whole family and not the two cells the grid happened to
contain. Measured after the fact, one file per cell, on both compilers — every one
`vl check` rc 0 on master and correct on the branch:

| `T` | token | master | branch |
|---|---|---|---|
| `string \| null` | `nulstr` | check-clean invalid wasm | **runs, right** |
| `i32[] \| null`, `boolean[] \| null` | `nullist` | check-clean invalid wasm | **runs, right** |
| `string[] \| null` | `nulstrlist` | check-clean invalid wasm | **runs, right** |
| `i32[][] \| null` | `nulreflist` | check-clean **runtime TRAP** (`null reference`) | **runs, right** |
| `((i32) => i32) \| null` | `nulclosure` | check-clean **runtime TRAP** | **runs, right** |
| `type L = i32[] \| null` (ALIAS spelling) | `nullist` | check-clean invalid wasm | **runs, right** |

Two of them were a TRAP rather than invalid wasm, so "16 cells, all `invalid wasm -> runs`" is
true of the sixteen and is **not** the family's failure kind. A row stated on the enumeration
would have let three of these five regress silently and would have under-promised the change;
the fixture now pins all five plus the alias.

**THE SIXTH TOKEN IS `nulstruct`, AND ITS REFUSAL IS NOT ABOUT COMPARING.** A draft of this
paragraph filed `Circle | null` beside `i32 | null` as "a BOX and a struct-eq shape, not niches
with cores", and that is false twice over: `eqCmpKindOfNulInner` answers `"nulstruct"` for it,
`eqKindIsNulNiche` lists it, this change's own second channel has an explicit `nulstruct` arm,
and two `Circle | null` bindings compared DIRECTLY run and are correct. What refuses the generic
route is `emitProgram: ref valtype with no interned shape`, and the ablation is one file: a
hand-written generic **containing no `==` at all** fails identically at `T = Circle | null` and
RUNS at `T = Circle`. A nullable STRUCT cannot be a generic ARGUMENT and the compare is never
reached. `i32 | null` is the genuine eq BOX (`emitProgram: `==` over a struct union is not
supported yet`), unchanged. **Two cells failing by two mechanisms had been given one shared
reason, and the reason was false for one of them** — caught by the `std-api-reviewer` pass, the
sixth consecutive time that review has produced the closing change's next correction.

**A NEEDLE THAT IS `null` FINDS THE FIRST NULL ELEMENT** — `null == null` is true at every rep
here, as it is written directly. Measured: `[null, "b"]` searched for `null` gives `indexOf` 0,
`lastIndexOf` 0, `includes` true, `count` 1. The remedy this retirement retires ("project to a
non-null key and search that") had no spelling for that search at all, so this is a capability
the close ADDS rather than one it restores.

Fixture: `tests/cases/std/array-needle-nullable-niche.vl` (both niches, all four exports, a
hand-written generic off std's surface, and the direct control).

---

### D43 — a type ALIAS for a LIST OF STRUCT is opaque: neither assignable from its own body nor a list — **CLOSED 2026-08-26**
**closed · was a loud check reject · found 2026-08-26 while building D35's grid (its `type E = Circle[]` cells) · pre-existing, byte-identical on `f2064bec` and on D35's branch · NOT silent, filed because it is the reason nine grid cells could not be graded on their own axis**

Repro:

    type Circle = { r: i32 }
    type E = Circle[]

    function mkT(i: i32): E {
      const c: Circle = { r: i }
      const o: E = [c]
      return o
    }

    print(mkT(1).length)
    // vl check rc 1:
    //   cannot assign {r: i32}[] to 'o' of type E
    //   no field 'length' on E

* **THE ALIAS IS THE WHOLE OF IT.** Spell `Circle[]` out at both positions and the identical
  program runs. So `E` and `Circle[]` are the same type by every reading of the source and
  two different things to the checker.
* **BOTH DIRECTIONS FAIL**, which is what says it is opacity rather than a variance rule: a
  `Circle[]` value will not go INTO an `E` slot, and an `E` value has no `.length` coming OUT.
* It is LOUD, so it is not a member of this file's silent classes; it is filed so the next
  grid over `std:array` does not spend its list-of-struct cells on it a second time. Nine
  cells of D35's grid — the `acc-cbfirst` / `acc-initfirst` / `cb-result` bindings at
  `structlist`, `maplist` and `litunionlist` — fail inside the MAKER for this reason and
  measure nothing about the comparison they were written for. The same three bindings spelled
  out do reach the comparison and are LOUD after D35's close, measured.

**RETIREMENT — THIS IS D49 IN ITS LOUD HALF, and the two rows were filed a day apart from two
different grids without either noticing the other.** **`check-filed-witnesses.py` is what
found it, not review**: D49's change was written against D49's witness alone, the grader was
re-run over the whole doc afterwards as the bulk-edit discipline requires, and this row came
back `check_reject → runs` unprompted. Reading the diff would not have surfaced it — nothing
in the change mentions `.length`, and the two rows share no message, no container and no
grid. That is the whole argument for grading the doc after every change rather than reviewing
what the change appears to touch. D49's own bullet called the reading side
"a second, independent alias gap"; it is not independent and it is not second. One predicate
decides the alias on BOTH sides — `declaredTyOfName` (the checker, which produced this row's
two messages) and `singleMemberAliasTyIx` (the emitter, which produced D49's invalid wasm) read
the same `singleAliasMemberTyIx` arm. Admitting a NOMINAL array leaf there closes both: this
repro now prints `1`, and `type E = Circle[]` where `Circle` is a plain declared struct — which
is exactly this row — was ALSO the loud `emitProgram: struct array elements are not supported`
on the emit side, the control D49's row filed as "runs".

Its nine ungradeable `std:array` grid cells are therefore gradeable now.

---

### D44 — [CLOSED 2026-08-26] the SAME lost refusal one operator over: a `+` the checker will not lower survives the pin
**CLOSED 2026-08-26 — the repro is NOW A LOUD CHECK REJECT (`` `addT` concatenates its type parameter with `+` here: `+` over Circle[] has no lowering ``), and so is the direct spelling. Was: check-clean invalid wasm · found 2026-08-26 by D35's 1712-cell grid (6 cells, its `+` control column) · pre-existing, byte-identical on `f2064bec` and on D35's branch · deliberately OUT OF SCOPE for D35, whose gate covers `==`/`!=` only**

**THE DIRECTION THAT COUNTS AS A WIN HERE IS `silent → loud`** — the opposite of D42's, one row up, and the two shipped together. This is a REFUSAL lost, so a running cell would be the failure.

Repro:

    type Circle = { r: i32 }

    function addT<T>(a: T, b: T): T { return a + b }

    function cell(): i32 {
      const a: Circle[] = [{ r: 1 }]
      const b: Circle[] = [{ r: 2 }]
      const r = addT(a, b)
      return r.length
    }

    print(cell())
    // vl check rc 0; vl run:
    //   failed to compile: …::addT — type mismatch: expected i32, found (ref $type)

* **IT IS D35's MECHANISM WITH A DIFFERENT OPERATOR, and that is the whole of it.**
  `binOpDefinedFor` is the one place a deferred constraint's operator is judged at the pin;
  D35 gave its `==`/`!=` arm the two comparability gates, and its `+` arm still answers
  "any two arrays are a list concat" (`if lArr is TyArray { if rArr is TyArray { return true } }`)
  regardless of what the element is.
* **THE CONTROLS SPLIT THE FAMILY IN TWO, and only one half is a pin defect** — measured, each
  one line different:

  | `T` | `a + b` spelled out | through `addT<T>` |
  |---|---|---|
  | `Circle[]` | loud emit reject (`field access receiver is not a struct`) | **check-clean invalid wasm** |
  | `{[string]: i32}[]` | loud emit reject | **check-clean invalid wasm** |
  | `"a" \| "b"` | loud check reject (`operator '+' is not defined for string and string`) | **check-clean invalid wasm** |
  | `f64[]` | **check-clean invalid wasm** | check-clean invalid wasm |

  The first three are a refusal the pin drops — this row. The `f64[]` row is not: the direct
  spelling is silently broken too, so the pin is faithfully reproducing it, and fixing that is
  a `+`-lowering question rather than a pin question.
* **WHY D35 DID NOT TAKE IT.** The `==` arm's two gates are already written and already the
  checker's own answer (`eqRefusals`), so stating them at the pin is a re-ask, not a new rule.
  The `+` arm's list-concat claim is a rule nobody has stated exactly — `i32[] + i32[]` works,
  `Circle[] + Circle[]` does not, and the boundary between them is the emitter's concat cores.
  Writing that boundary needs its own grid over element reps at both spellings, and widening a
  rule past its measured need is the precedent this file keeps paying for.
* The `"a" | "b"` row's DIRECT message names `string and string`, not the union — the literal
  union softens before the operator arm sees it. That is a diagnostic-quality note, not a
  second defect, and it is recorded so a future reader does not chase it as one.

#### The close

**TWO ROOTS, AND THE ELEMENT TYPE IS WHAT DISCRIMINATED THEM.** A literal union goes through the
first, a list element through the second, and neither fix reaches the other's cells.

**ROOT ONE — THE PIN SOFTENED BEFORE ITS STRING ARM AND `checkBinary` SOFTENS AFTER.**
`binOpDefinedFor` ran `softenLitTy` on both operands and THEN asked `isStringTy`, so at
`T = "a" | "b"` it saw two `string`s and admitted a concat, while the direct spelling reaches its
own softening only after string concat and list concat have both declined. One decision, two
severities, chosen by the spelling — and the pin's was the permissive one, over a module the
engine refuses. The `+` arm now uses the UNSOFTENED types for its string and array tests and the
softened ones for the numeric tail, which is `checkBinary`'s order exactly. The ordering
comparisons and the remaining arithmetic soften first, as they already did and as `checkBinary`
does.

**ROOT TWO — "ANY TWO ARRAYS ARE A LIST CONCAT" WAS A RULE NOBODY HELD, not a rule the pin
dropped.** There is exactly ONE concat core, `emitListConcatI`, the i32 backing.
`listOpKindOfBin` names three list kinds and the emitter's `+` arm refuses two of them outright;
every element rep that classifier does not claim at all fell PAST the list arm into the NUMERIC
tail and emitted `i32.add` over two refs. So this half is worse than D35's shape: the refusal
existed at NEITHER spelling for the reps that mattered, and the pin stated its absence as though
somebody held it.

`concatRefusal` is the one home, read by `checkBinary`'s concat arm, by `binOpDefinedFor` and by
the emitter's floor (`binConcatHasNoLowering`, the `+` twin of `binEqHasNoLowering`).

**THE ACCEPT SET IS THE i32 BACKING, AND IT WAS MEASURED RATHER THAN DERIVED.**
`eqCmpKindOfArrayElem` is NOT that set and cannot stand in for it — it answers "none" for a
literal-union element, and `("a"|"b")[] + ("a"|"b")[]` concatenates correctly today. Every
element rep below was RUN at both spellings before the rule was written:

| element | direct, master | through `addT<T>`, master | both, branch |
|---|---|---|---|
| `i32`, `boolean` | runs | runs | **runs (unchanged)** |
| `K = "a"\|"b"`, `N = 1\|2` | runs | runs | **runs (unchanged)** |
| `Id = new i32` | runs | runs | **runs (unchanged)** |
| `boolean \| null`, `K \| null` (i32 SENTINELS) | runs | runs | **runs (unchanged)** |
| `Circle` | loud emit | **invalid wasm** | loud check |
| `{[string]: i32}` | loud emit | **invalid wasm** | loud check |
| `string[]` | loud emit | **invalid wasm** | loud check |
| `f64`, `f32`, `i64` | **invalid wasm** | **invalid wasm** | loud check |
| `u8` | **invalid wasm** | loud emit | loud check |
| `string`, `i32[]`, `new string` | loud emit | loud emit | loud check |
| closure, struct union, `i32 \| null`, `f64 \| null`, `Circle \| null`, `i32[] \| null` | loud emit / invalid wasm | loud emit / invalid wasm | loud check |

Note the `i32 | null` / `boolean | null` split: the first is a value-union BOX and the second the
i32 value 2, so "a nullable element" is not the axis and a rule written on it would have removed
a working capability. **The predicate DEFAULTS TO ACCEPT** — a rep it has not measured keeps
today's behaviour, which is `binOpDefinedFor`'s own stated convention. The one row it leaves
alone deliberately is `"x" | 7`, a MIXED literal union: loud at both spellings today, so refusing
it would buy nothing and mis-stating it could cost something.

**THE MEASUREMENT.** In the 741-cell grid, **19 cells move `check-clean invalid wasm -> loud
check reject`** and **12 `loud emit -> loud check`** (the same refusal one stage earlier). The
row's own 6 cells are inside the first number. Nothing in this family moved toward `runs`, which
is the grading this row requires — the opposite of D42's, one row up.

**A LEAK THIS GATE WOULD HAVE WIDENED, FOUND BY A FIXTURE AND NOT BY THE GRID, AND CLOSED WITH
IT.** `error-deferred-constraint-true-positives.vl` began reporting `addT`'s `+` refusal at a
call to `myIndexOf` through a bound local. A call site that cannot NAME its callee consults EVERY
generic's constraints and `substTyDeep` matches TyVars by NAME, so the leak is #1946's rung 2 at
the one callee delivery its fix could not reach — and it is **pre-existing**: on master,
`const g = idT  g(structList)` already reports `myIndexOf`'s `==` refusal, for a generic that
compares nothing. A local bound to a bare Ident naming a declared function now NAMES that
declaration (`fnAliasScopes`), so `const f = addT  f(c, c)` keeps its own true positive and the
cross-generic leak goes. **The grid missed it because every cell had ONE generic in the file** —
the same axis-holding mistake #1946 records for the callee's delivery, one level up: enumerate
the SIBLINGS as well as the deliveries.


**THE GRID'S CALLEE-DELIVERY AXIS HAS FOUR VALUES AND ONLY THREE OF THEM MEASURE ANYTHING, and
saying so is the point of listing it.** #1946 records that holding the CALLEE's delivery constant
cost it a round, so this grid varied it — `f(x)` by name, `const f = g  f(x)`, a HOF's closure
PARAMETER, and a struct FIELD. Measured on both compilers:

| callee delivery | what the 105 cells at that value do |
|---|---|
| direct `a op b` | live — 45 runs / 54 loud check / 4 invalid wasm / 2 loud emit |
| `f(x)` by name | live — 45 / 54 / 2 / 4 |
| `const f = g  f(x)` | live — 43 / 54 / 2 / 6, and this is the delivery #1946's own regression rode |
| struct FIELD | live at CHECK (54 loud check, 4 of this change's 61 moves), refused at EMIT for the other 51 |
| HOF closure PARAMETER | **refused at EMIT in all 105, on master and on the branch alike** |

The last two hit floors that have nothing to do with this change and are identical on `c0873a06`:
`emitProgram: function-value call arity has no interned signature` for the field, and
`emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or string parameters are
supported` for the HOF parameter — **a generic function VALUE cannot be a closure argument at
all today**, filed as **D58**. So the honest reading is that this change is measured across
THREE live callee deliveries plus the check-stage half of a fourth, not four; an axis whose value
is loud at every cell on both compilers is a column of nothing, and reporting it as coverage is
the shape D43 was filed to stop.

Fixture: `tests/cases/generics/error-list-concat-no-core.vl` (four element reps at both
spellings, plus the literal-union pair that separates the two roots).

---

### D45 — [CLOSED 2026-08-26] `isEquatable` refuses a LITERAL-UNION element although that element compares correctly
**CLOSED 2026-08-26 — the repro now RUNS and prints `false`. Was: loud check reject · found 2026-08-26 by the `std-api-reviewer` pass over D35's retirement — the FIFTH consecutive time that review has produced the closing change's next row · pre-existing, byte-identical on `f2064bec` and on D35's branch · NOT silent, and filed anyway because D35's close is what put it in a caller's way**

Repro:

    type K = "a" | "b"

    function cell(): boolean {
      const a: K[] = ["a"]
      const b: K[] = ["b"]
      return a == b
    }

    print(cell())
    // vl check rc 1, TWO errors:
    //   K[] isn't equatable (a field is not value-comparable) — compare a projection whose
    //     components are
    //   `==` over K[] has no lowering
    // (The remedy clause read "— define a `==` operator for it" when this row was filed. It
    //  prescribed a declaration the compiler silently ignored and was retired with D46 on
    //  2026-08-26; the refusal itself — which is what THIS row is about — is unchanged.)

* **THE FIRST SENTENCE IS FACTUALLY WRONG ABOUT THE FIELD, and that is the row.** `isEquatable`
  answers false for a `TyUnion`, so a list whose element is a literal union is "not
  value-comparable". Measured, one line each: `K == K` over two `K` bindings runs and prints
  `false` (correct), and `string[] == string[]` runs and prints `true`. The element compares,
  the container shape compares, and the refusal names a component that is fine. `type N = 1 | 2`
  behaves identically.
* **THE SECOND SENTENCE MAY BE HONEST.** `eqCmpKindOfArrayElem` has three list cores and a
  literal-union element reaches none of them; a `K[]` will not launder into a `string[]`,
  because a container's wasm type is fixed by its element's storage. So "has no lowering" is
  plausibly a real missing arm even though the pre-D35 grid measured `indexOf` at `T = K[]`
  RETURNING THE CORRECT INDEX — the emitter's generic path found a compare the direct path
  never offered.
* **WHY IT IS FILED THOUGH IT IS LOUD.** D35's close made the pin state this refusal, so 18
  grid cells that ran correctly now do not, and this row is the reason to ask whether the
  refusal itself is right rather than only whether it is consistent. **D35's fix is still the
  right call** — two spellings of one call answering with two severities is not a capability,
  and the silent answer was the permissive one — but "the caller was relying on a coincidence"
  is only half the story, and the other half is here. Same precedent as D43: a loud row filed
  because it is now the reason a working spelling stopped working.
* Fixing it is a language-design question, not a rider on D35: either `isEquatable` grows a
  literal-union arm (and `eqCmpKindOfArrayElem` a core to match), or the refusal stays and the
  MESSAGE stops naming a field that is comparable.

#### The close (2026-08-26, #D45)

**BOTH, AND THE BACKING DECIDES WHICH.** The row offered two exits and the answer is that they
are not alternatives: the first sentence is wrong for EVERY literal union and the second is
right for exactly one backing, so the arm and the message correction are the same change read
at two severities.

* **THE COMPLEMENT WAS ALREADY WRITTEN, ONE OPERATOR OVER.** `concatRefusal`'s
  `concatElemIsI32Backed` / `tyUnionAllLits` decide "is this element one i32 cell" for list
  `+`, accept the whole literal family, and say so in their own header — *"`eqCmpKindOfArrayElem`
  is NOT that set — it answers "none" for a literal-union element, and a `("a"|"b")[] +
  ("a"|"b")[]` concatenates correctly today"*. The `==` home had the note pointing AT it and
  never called it. `isEquatable` now asks `tyUnionAllLits` (which also covers the `| null`
  member — the atom's spare `-1`), and a bare `TyLit` answers true for the same reason.
* **THE LOWERING HALF IS SPLIT BY BACKING, and the split is the honest half of the row's second
  sentence.** `eqCmpKindOfArrayElem` spells its accept set as two prim names; a literal-union
  element is the third member of it when the backing is i32 — the interned ATOM for a string
  union (`tyIsLitUnion`), the BASE SCALAR for a numeric one (`numLitUnionBaseName == "i32"`).
  An `f64`- or `i64`-based numeric union rides its own list wrapper, whose `==` has no core at
  all, so `F[]` stays refused. The `TyArray` arm's inner check took the same two tests one hop
  down, which is what admits `K[][]` as the ref list of i32 lists it is.
* **THE `f64` CELLS ARE THE MESSAGE DIFF, and an outcome-class count cannot see them.** 10 of
  the grid's cells are `loud_check_reject` on both sides and moved MESSAGE only: from
  `F[] isn't equatable (a field is not value-comparable) — compare a projection whose
  components are…` to `` `==` over F[] has no lowering ``. That is the row's second exit taken
  for the cells the first one does not reach — the sentence stops naming a comparable field
  and names the missing lowering instead.
* **26 GRID CELLS, every one `loud check reject` → `runs`**, across `K` / `N` element types x
  `list` / `listlist` / `nullist` containers x `direct ==` / `direct !=` / a hand-written
  `eqT<T>` / `indexOf` / `includes`.

#### The clearance above was WRONG, and the axis it was missing is the one this file keeps losing

**THAT GRID HELD THE OTHER OPERAND'S TYPE CONSTANT**, so it could not contain the cell the
widening actually broke. Found by the `std-api-reviewer` pass — the EIGHTH consecutive time
that review has produced the closing change's next correction — and verified before acting on
it. Four lines, no import:

    type K = "a" | "b"
    const k: K[] = ["a"]
    const s: string[] = ["a"]
    print(k == s)
    // LOUD on master `8bf0f20f` (both D45 sentences).
    // With the first draft of this fix: vl check rc 0, and
    //   Invalid input WebAssembly code at offset 314: type mismatch: expected i32, found (ref $type)

`K <: string`, so the two ARE mutually assignable and `checkBin` has nothing to say.
`eqRefusals` asks `eqCmpKindOfTy` of each operand **separately** and refuses only on `"none"`
— it never asked whether the two answer the same CORE. Before the widening a literal-union
element answered `"none"` whatever the other operand was, so `K[]` was loud on either side and
the missing pair check could not be reached; admitting it as the i32 list left `"list"` against
`"strlist"` and one core lowering over the other's storage. **A loud → check-clean-invalid-wasm
move: this file's own blocker condition, produced by a close that had just declared zero of
them.**

That is `std/array.vl`'s TWENTIETH ledger entry — *"a population measurement is only as wide as
its axes"* — reproduced verbatim in the change that cites the entry's file.

**THE FIX IS THE PAIR, ON THE CORE.** `eqCoreKindOfTyToken` already mapped a token to its
compare core and already folded each `nul*` niche onto its base (the null guard's contract); it
lived in `emit_classify` while the checker's half of the same question lived here, which is the
two-guesses shape `eqCmpKindOfTy`'s header exists to end. It moved to `typecheck.vl` beside
`eqCmpKindOfTy`, and `eqRefusals` now refuses when both operands have a core and the cores
DIFFER. **Cores and not tokens is what keeps the good half**: `N[] == i32[]` is two tokens and
ONE core, and it runs and is correct — a storage-CLASS predicate would have refused it. The
compiler already owned this refusal one boundary over (the same pair at an ARGUMENT position is
the loud element-storage message); `==` was the only boundary not asking.

**THE RE-MEASUREMENT IS A NEW GRID WHOSE AXIS IS THE PAIR**: every ORDERED pair over 26 rep
spellings x `==` / `!=`, **1,352 cells**, each graded on its ANSWER (the two operands are given
equal values, and a second row gives them different ones). Master `8bf0f20f`: 106 runs, 1,242
loud check, 4 loud emit, **0 silent**. Branch: 146 runs, 1,202 loud check, 4 loud emit, **0
silent**. **40 cells moved, every one `loud check reject` → `runs`, 0 backward**, plus 36 that
moved MESSAGE only inside one class.

* A SECOND correction from the same pass, and the same shape one predicate over: the first
  draft reused the `+` home's `tyUnionAllLits`, which accepts a MIXED-BASE union
  (`type M = "a" | 1` — every member a `TyLit`, but one reps as a string ref and one as an
  i32, so it is a value-union BOX and not one cell). That moved `{ m: M }`'s compare from a
  plain `vl check` ERROR to `emitProgram: unsupported struct field type in equality` — loud to
  loud, so not the blocker class, but a severity downgrade for a shape that was correctly
  refused. `tyUnionIsOneLitCell` is the narrower question this gate actually asks, and the
  `| null` coverage the first draft's comment claimed was never reachable at all (D101).
* Graduated: `tests/cases/literal-unions/litunion-list-equality.vl` (the compiler-side pin,
  importing nothing — list, `!=`, LENGTH, numeric base, `K[][]`, and a struct with a `K` FIELD,
  which is the structural gate's own shape) and `tests/cases/std/array-litunion-list-needle.vl`
  (all four `needle: T` exports at both backings, each pinned to a different answer). The `K[]`
  rows of `tests/cases/std/error-array-needle-not-equatable.vl` — the fixture that PINNED this
  refusal — graduated out of it and were replaced by an `F[]` row, which is the half that was
  true. `std/array.vl`'s ledger gained a `needle: T` at a LITERAL-UNION LIST row (RETIRED) and
  its `f64` sibling (compiler floor, symmetric); the module's live carve-out count is unmoved
  at **zero silent, one loud**, re-measured rather than carried over.

---

### D46 — [CLOSED 2026-08-26] a `function "=="` declaration parses, type-checks, and is SILENTLY IGNORED — and a diagnostic tells you to write one
**CLOSED 2026-08-26 — the declaration is now a loud check reject, raised at the PARSE stage so `vl check` reports it as `(parse error)` (`` `==` is not overloadable — every type compares structurally, and a `function "=="` declaration would be ignored ``) at all four spellings, and the diagnostic that recommended writing one no longer does. Was: check-clean SILENTLY WRONG VALUE · found 2026-08-26 by the `std-api-reviewer` pass over D35's retirement · pre-existing, byte-identical on `f2064bec` and on D35's branch · NO generic, NO import, six lines**

**THE DECISION IS REJECT, NOT HONOUR**, and the reasoning is at the foot of this row. This is the FIRST ROW IN THIS FILE whose filed outcome was a check-clean WRONG VALUE, and the witness grader's newest rung is what graded it honestly.

Repro:

    type Circle = { r: i32 }

    function "=="(self: Circle, other: Circle): boolean {
      return true
    }

    function cell(): boolean {
      const a: Circle = { r: 1 }
      const b: Circle = { r: 2 }
      return a == b
    }

    print(cell())
    // vl check rc 0. The declared operator returns `true` unconditionally, so a dispatch
    // would print `true`. The two warnings it does emit are `Unused parameter self/other` —
    // the witness's own, and a CONSEQUENCE of needing a body that disagrees with the
    // structural fallback; nothing says the declaration itself is inert.
    // PRINTS false

* **THE DECLARATION HAS NO EFFECT AND NOTHING SAYS SO.** It is not a parse error, not an
  unknown-name error, not an unused-function warning: it is accepted and the structural
  compare runs instead. (`vl check` does report `Unused parameter self/other` — those are the
  witness's own parameters, unused because the body has to disagree with the fallback to be
  observable, and they say nothing about the declaration's fate.) `compiler/parser.vl`'s `opDeclName` is reached only from
  `OP_INDEX_GET` / `OP_INDEX_SET`, and `checkBinary` returns on the equality arm before the
  operator-dispatch tail, so `==` is not in the overloadable set at either end.
* **THE COMPILER ASKS FOR IT BY NAME.** `isEquatable`'s refusal ends "— define a `==` operator
  for it", and doing exactly that changes nothing: the same two errors come back over a `K[]`,
  and over a struct the declaration is quietly discarded. A diagnostic that prescribes an
  unimplemented remedy is the loud-message counterpart of this file's silent classes, and D35's
  close is what puts this one in front of a `std:array` caller.
* **THE `true`-RETURNING BODY IS LOAD-BEARING IN THE WITNESS.** A first draft used
  `return self.r == other.r`, which agrees with the structural compare on every input, so it
  printed `false` and proved nothing. The witness has to disagree with the fallback to see
  which one ran.
* Two ways out, and they are not the same size: implement the dispatch (`==` joins the
  B13/B14 operator-function set), or delete the clause from the message. The second is a
  one-line change and is what the message should do until the first exists.

#### The close

**THE DECISION IS REJECT, and the deciding measurement is who the diagnostic's customer is.**
`eqRefusals`' clause fires on a CONTAINER — `K[]`, `Circle[]` — and a container's compare
recurses through `emitStructEqRec`, `emitListEqRCore` and `emitListEqSCore`, three cores with no
per-element dispatch hook, and through `isEquatable`, std's four `needle: T` exports and the map
key. **Honouring the top-level struct case alone would leave the message still prescribing
something inert one container deep**, which moves the trap rather than removing it — and would
create a NEW silent class: a user `==` that some of those honour and others do not. Implementing
the dispatch properly is a language-design change to six lowerings, not a rider on this row.

**THE COST IS ZERO AND IT WAS CHECKED, NOT ASSUMED.** Nothing in `compiler/`, `std/`, `tests/`,
`bench/`, `playground/` or `reference/` declares a `==` or `!=` operator function. The only
operator declaration in the whole tree is `tests/cases/objects/operator-self-method.vl`'s
`function +`, which is untouched.

**FOUR SPELLINGS, ONE HOME.** The symbol-token name (`function ==(…)`) and the quoted name
(`function "=="(…)`) converge on the same `name` in `parseFuncHead`, so one test covers both, and
`!=` is the same rule — measured, and its witness printed `true` where the declaration said
`false`. The reject is at the PARSER because that is where both spellings meet and because it is
the earliest place an editor sees it; `isStrFuncName` still ACCEPTS the two names so that the
quoted spelling gets this sentence rather than the generic "must be an operator" list.

**THE DIAGNOSTIC IS RECONCILED IN THE SAME CHANGE, which is the half that makes this a close
rather than a move.** `eqRefusals` no longer ends ``— define a `==` operator for it``; it ends
`— compare a projection whose components are value-comparable, and only one that no two distinct
values share`, the idiom `std/array.vl` already prescribes for the same shape. Leaving the old
clause beside the new reject would have been strictly worse than the state this row was filed
against: a diagnostic recommending a declaration the compiler now refuses.

**THE QUALIFIER IS LOAD-BEARING AND THE FIRST DRAFT DROPPED IT, along with the sentence's
predicate.** `std/array.vl`'s ledger has one entry it calls its worst-shaped — the only one that
ever printed a WRONG ANSWER rather than a wrong claim — and it is exactly this remedy stated
UNQUALIFIED: "project to a key and search that", where a first element is not a key. Importing
the unqualified half into a diagnostic hands every caller that defect, and for `==` it is worse
than for a search: two distinct values sharing a projection compare EQUAL. The first draft also
ended on "…whose components are" and stopped there — **a sentence with no predicate that every
gate passed**, because `@error` matches a SUBSTRING and the fixture's directive stopped before
the clause. `error-array-needle-not-equatable.vl` now carries one directive that runs to the end
of the sentence, which is the cheapest thing that would have caught it. Both found by the
`std-api-reviewer` pass over this change.

**THE COST IN CELLS, STATED HONESTLY.** 12 grid cells move `runs -> loud check reject`: an `i32`
comparison beside an inert `==`/`!=` declaration, at every declaration form the grid enumerates
(quoted, symbol-token, `!=`, wrong arity, wrong types, no `self` parameter). Their ANSWER was
right, and it was right only because the declaration did nothing — the same reading D35's 18
`("a"|"b")[]` cells got. Nothing moved to a silent outcome.

**A DECLARATION FORM THAT IS NOT THIS ROW.** An operator CLOSURE FIELD (`{ "==": … }`) is a
different mechanism and is untouched: `isEquatable` already refuses a struct with a
function-typed field, so that spelling is loud at both ends today and rejecting a FIELD NAME
would be over-broad.

Fixture: `tests/cases/objects/error-equality-not-overloadable.vl` (all four spellings).

---

### D47 — [CLOSED 2026-08-26] the INLINE map-annotation spelling of an arm-valued map keeps the LOUD `-3` floor the ALIAS spelling no longer hits
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). Was: loud emit reject · found 2026-08-26 by D34's own retirement, which had to explain why the pinned `error-map-value-struct-in-union.vl` still errors · pre-existing and IDENTICAL on `f2064bec` and on D34's branch · the ACCEPTABLE class (loud both sides), filed for the SPELLING-dependence, not for the reject · CLOSED by #1954 — the mv slot is keyed by the ARM'S OWN NAME, read off the caller's recorded type, which is the one channel BOTH spellings have**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function cell() {
      const a: {[string]: Circle} = Map()
      const c: Circle = { r: 7 }
      a["k"] = c
      const g = a["k"]
      if g != null { return g.r }
      return -1
    }

    print(cell())
    // vl check rc 0 (two hints); vl run:
    //   emitProgram: unsupported map value type (no rep for a union-member struct, …)

* **THE CONTROL IS ONE LINE AND IT IS THE WHOLE ROW.** Hoisting the annotation into an alias —
  `type CM = {[string]: Circle}` and `const a: CM = Map()`, nothing else changed — RUNS on
  D34's branch and prints `7`. It was silent invalid wasm on `f2064bec`.
* **THE MECHANISM IS THE KIND GATE, WHICH IS NAME-KEYED AND RUNS AHEAD OF THE ARM HINT.**
  `mvValKindOfName`'s last arm is `structIndexByValName(valName) >= 0`, a field-set scan over
  the struct table for the value's RENDER. The alias declaration causes the render `{r:i32}` to
  be interned as an inline-shape row before the map is asked, so the arm answers kind 1 and
  D34's arm hint then supplies the arm; the inline spelling asks first and gets `-3`. So
  whether an arm-valued map lowers at all still depends on an incidental intern — which is the
  half of D34's "an unrelated expression switches an emit floor off" that survives it.
* **CLOSING IT IS A KIND-LADDER CHANGE, NOT A COLUMN ONE, AND THAT IS WHY IT IS FILED RATHER
  THAN FOLDED IN.** `mvValStructIdx`'s missing variant half — the reason
  `tests/cases/maps/error-map-value-struct-in-union.vl`'s header gives for the floor — no
  longer exists; the column is there (`mvValVariantIdx`). What remains is the `-3` sentinel
  itself plus the FIVE name-keyed `mvValKindOfName(...) != -3` gates
  (`mapValKindLowerable` and its four siblings), which decide whether a map local / return /
  field is lowerable at all and have no type in hand at several of them. Its arena twin
  `mvValLowersTy` is where an arm arm would go.
* Pinned as-is by `tests/cases/maps/error-map-value-struct-in-union.vl`, whose header now
  records the corrected mechanism.

**THE FILED MECHANISM WAS HALF WRONG, AND A PROBE IS WHAT SAID SO.** The bullet above reads
"the alias declaration causes the render `{r:i32}` to be interned as an inline-shape row
before the map is asked". Measured: declaring `type CM = {[string]: Circle}` and NOT using
it leaves the inline program rejecting, so the declaration interns nothing that helps. A
probe at `mvShapeOfValNameArmTy` over the two programs says what actually differs — **six mv
asks each, every one MINT-path, every one already carrying D34's arm hint**:

| program | value spellings the mv layer is asked about | kind |
|---|---|---|
| inline `const a: {[string]: Circle} = Map()` | `Circle` ×4, `{r:i32}` ×2 | all `-3` |
| alias  `type CM = …; const a: CM = Map()`    | `{r:i32}` ×6              | all kind 1 |

A TypeRef's emit spelling for an ALIAS is `tyToEmitName` of the resolved type, and that
renderer spells a declared arm structurally; the INLINE annotation hands over the source
text. So the two spellings key the mv table under two different names and only one of them
resolves — and which one resolves is an incidental intern, not a property of the value.

**THE FIX (D47).** `mvArmKeyName` rewrites the mv key to the ARM'S OWN NAME whenever the
caller's recorded value type is a declared arm (`variantRowOfTy` → `uVariants[vr]`). Both
channels produce `Circle`; the render is reachable from only one of them.

* **D-ALIASMAP IS THE STANDARD AND IT PICKED THE DIRECTION.** `DECISIONS.md` /
  `destringify-types-program.md` require a type alias to be TRANSPARENT — an alias must not
  be a dialect — and #1948 invoked exactly that to converge an alias onto a direct spelling.
  Here the ALIAS was the one that worked, which is the same asymmetry pointing the other way,
  and the rule does not say which spelling wins: only that they must agree.
* **A KEY, NOT A KIND RUNG, and the difference is measurable.** Teaching `mvValKindOfName` to
  answer for `Circle` and leaving the key alone mints a SECOND slot — the render's slot is
  already minted in the same program and the two spellings key different rungs
  (`mvValTyIxOfNameRow` re-resolves a render to a FRESH arena index, D34's own measurement) —
  so the `Map()` construction builds one while the ops read the other. The nominal rung is
  still added, but only for the FIVE name-keyed GATES that never canon.
* **NOMINAL IN THIS DIRECTION TOO.** The rewrite asks nothing structurally, which is what
  #1942's ruling requires: `variantRowOfTy` has no structural rung *because variants are
  nominal*, so a genuinely anonymous `{[string]: {r:i32}}` keeps the render it always keyed.
* **THE ABI GATE IS A THIRD COPY OF THE SAME QUESTION AND THE GRID IS WHAT FOUND IT.**
  `mvValLowersTy` — `mapValKindLowerable`'s recorded-type twin, read by `retMapFlag` to pick
  a map param/return's VALTYPE — has the identical struct-only rung (`isStructOfTy`). With
  only the interner taught, an arm-valued map LOCAL lowered while its
  `{[string]: Circle}`-returning function kept the i32 mono result valtype: check-clean
  INVALID WASM at the return seam, **15 grid cells**, exactly the drift `mvValKindOfName`'s
  own header predicts in writing. `variantRowOfTy` is that rung's nominal twin as well.
* **ONE FURTHER RUNG BECAME REACHABLE AND WAS LOUD-BUT-WRONG, which is why it is fixed here
  rather than filed.** `m[k]?.f ?? d` over an arm-valued map reads the value row's STRUCT
  index; that is -1 for an arm, `sFieldIndex` bounds itself, and the program stayed LOUD —
  with the message "`?.` field is not on the map's value struct" about a field that IS on
  it. Same either/or as the store seed and the `??` default seed have carried since D34, and
  all three accessors were already written arm for arm: `variantFieldIndex` /
  `variantFieldTypeAt` / `uVarHeap`. Pinned by
  `tests/cases/maps/arm-valued-map-optional-chain.vl`, hit AND miss arm. The grid has no
  `?.` axis, so this rung is pinned by fixture rather than measured by the sweep.
* Its pin GRADUATED rather than being deleted: `tests/cases/maps/map-value-struct-in-union.vl`
  (renamed from `error-…`), `@run` with the values, condition table kept.

---

### D48 — [CLOSED 2026-08-26] an arm-valued map and a LAYOUT-TWIN struct-valued map in one program share a single mv slot
**CLOSED 2026-08-26 — the repro now RUNS (prints `7` / `9`). Was: check-clean invalid wasm · found 2026-08-26 by the census extension D34's change required · pre-existing on `f2064bec` and NOT fixed by D34 — the branch fails in the OTHER function · NO generic, NO import · CLOSED by #1952 — the ARM is the THIRD component of an mv slot's identity, threaded as a TRI-STATE hint**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    type CM = {[string]: Circle}
    type DM = {[string]: Dot}

    function mkC(i: i32): CM {
      const m: CM = Map()
      const c: Circle = { r: i }
      m["k"] = c
      return m
    }

    function mkD(i: i32): DM {
      const m: DM = Map()
      const d: Dot = { r: i }
      m["k"] = d
      return m
    }

    function rdC(v: CM) { const g = v["k"]; if g != null { return g.r }; return -1 }
    function rdD(v: DM) { const g = v["k"]; if g != null { return g.r }; return -1 }

    print(rdC(mkC(7)))
    print(rdD(mkD(9)))
    // vl check rc 0; vl run on f2064bec:  invalid wasm at offset 500 in mkC
    //                 vl run on D34's branch: invalid wasm at offset 1244 in mkD

* **THE mv SLOT'S IDENTITY IS STRUCTURAL AND BOTH MAPS RENDER THE SAME.** `mvSlotOfTyK` is
  keyed on the VALUE's arena type, reached by re-resolving `tyToEmitName(t.mVal)`, and
  `{[string]: Circle}` and `{[string]: Dot}` both render `{[string]: {r:i32}}` — so there is
  ONE slot, not two, and the first minter's arm hint decides it for both.
* **THE CONTROL IS THE FIELD NAME.** `type Dot = { q: i32 }` — same arity, different field name,
  everything else identical — RUNS on D34's branch and prints `7` / `9`. It was silent invalid
  wasm on `f2064bec`. So the collision is the shared render, not the pair of maps.
* **THE DEDUP LAYER IS ALREADY GATED FOR THE DAY THE SLOTS SEPARATE.** `repMapValSlotsTwin`'s
  kind-1 arm now requires arm PARITY before it asks `repStructSlotsTwin`. Counted properly (see
  D34's census bullet) the ENCLOSING arm is live — 46 calls over 25 corpus files — while the
  parity branch itself is **not reachable today**, and THIS ROW IS WHY: deciding it needs two
  distinct kind-1 slots agreeing on canon id and key rep, which is exactly the pair that
  collapses here. Closing this row is the other half: the arm has to enter the slot's IDENTITY
  (the `mvSlotOfTyK` / `mvSlotByValNameK` find rungs), and the find sites at the op boundary do
  not hold the annotation node the mint site does.
* Ranked below D47 because the outcome is unchanged (silent on both sides), but it is the
  strictly worse row: the reject in D47 is loud.

**RE-MEASURED 2026-08-26 WHILE CLOSING D49, AND ONE CANDIDATE FIX IS REFUTED BY ABLATION.**
The witness module above is **byte-identical** under D49's change (`wasm-tools print`, 4,003
bytes both sides), and 0 of the 130 `mapval` / `nestedmap` cells of D49's 910-cell grid move —
so the two are TWO ROOTS and the mv layer is untouched by that change.

The candidate, built and swept as its own compiler:

* `mvSlotOfTyK` gains the ARM half of the slot's identity — the same parity question
  `repMapValSlotsTwin`'s kind-1 arm already asks at the DEDUP layer, asked at the FIND. Both
  sides are arena types, so `variantRowOfTy` is askable there.
* the mint keys an arm's slot on the ARM'S DECLARATION index (`armTy`) rather than on the
  re-resolved render, and banks the same index, so the parity round-trips through a re-find.
* the mint's NAME-scan rung — the seam the arena rung cannot close, since an arm and its
  layout twin render the same string — enforces the same parity where the caller knows the
  value's type.

**It separates the slots and the downstream wiring does not follow.** The repro's failure
MOVES from `mkD` to `mkC` (offset 543), and a control that RUNS on master — two maps whose
values are arms of two DIFFERENT unions — becomes check-clean invalid wasm. So the slot
identity is necessary and not sufficient: `mvRlSlot` / `mvMapTypeIdx` and the op-boundary
finds that hold no arena type still resolve through the render. **On the 910-cell grid the
candidate moves ZERO cells**, which is also a coverage finding — that grid cannot see it, and
the hand control is what refuted it.

What remains, precisely: **every name the mv layer holds is a RENDER**, and the fix has to
stop that being the slot's identity, not patch a parity test onto it. The nominal channel
exists at the mint (`armTy`, #1947) and at the routed op finds (`nodeMapValTyIx`); it does
NOT exist at `mvSlotByValNameK`, at `mvSlotOfValNameTyK`, or at any un-hinted
`mvShapeOfMapName` caller, and those three are where the second slot goes wrong. The cheaper
interim — a LOUD floor at the map-store seed (`wasmEmit`'s `svVi = mvValVariantOf(mslot)`
site, which already reads the slot's arm) — has to compare HEAPS and not names, or it reddens
the two-arm control above, which runs today.

**THE CENSUS GATE'S STATED REASON HAS NOW EXPIRED, AND THE GATE ITSELF WAS WRONG IN ONE
DIRECTION.** It read: `repMapValSlotsTwin`'s parity branch needs two distinct kind-1 slots
agreeing on canon id and key rep, and that pair cannot exist because this row collapses it.
Closing the row creates the pair, so the branch is now REACHABLE — measured with a
three-rung counter (arm entered / cross / both-arms) over 1,070 grid cells and the 2,282-file
corpus, **re-run on the post-#1951 base** because that change moved variant index resolution
and this predicate is a heap-twin question over exactly that machinery (grid counters
identical to the pre-merge run, call for call):

| rung | grid | corpus | first witness |
|---|---|---|---|
| kind-1 arm entered | 34 calls / 30 files | 49 / 26 | — |
| `cross` (one arm, one struct → refuse) | **22 / 20** | 2 / 1 | `maps/arm-valued-map-beside-layout-twin.vl` |
| both arms, heap twins → **allow** | **10 / 10** | 1 / 1 | `maps/arm-valued-map-beside-layout-twin.vl` |
| both arms, NOT heap twins → refuse | 0 | 0 | none — see below |
| neither an arm (the old struct rung) | 2 | 46 / 25 | `arrays/empty-hole-pinned-by-container-position.vl` |

**The corpus's 46 pre-existing entries all take the STRUCT rung**, unchanged — the
arm-valued-map population was exactly the one no test wrote, which is why this could sit
mis-stated. The three corpus calls on the two live rungs are this row's own new fixture, so
the two branches that decide the heap now have a corpus witness where they had none. **And the shipped test was an IDENTITY test (`mvValVariantOf(a) !=
mvValVariantOf(b)`) where the question is a HEAP one.** Two arms of two DIFFERENT unions over
one field set are `uVarTwin` layout twins and therefore ONE variant heap type, so their maps
DO share a map struct; refusing that merge emitted two identical map structs and a
`pass`-onward boundary that resolved one of them for a value of the other — **2 grid cells
moving `runs` → check-clean invalid wasm**, caught by the grid and not by argument. The arm
half now asks `repVariantSlotsTwin` (the variant layer's own pairwise twin relation, the
`repStructSlotsTwin` sibling), and cross-table is a flat 0 because a variant struct and a
struct row are never one heap.

The `both arms, NOT heap twins` rung reads **0** on both populations and on a hand attempt
(two arms whose field is an atom-backed litunion vs an inline one — they came out heap
twins). Reported rather than deleted, on this file's own standard: an unreached rung is not a
wrong one, and it is the conservative half of a heap-equality test whose other half is
measured live.

**WHAT ACTUALLY CLOSED IT, AND WHY #1948's CANDIDATE WAS ONE STATE SHORT.** That candidate
asked arm PARITY of two SLOTS at `mvSlotOfTyK`. A find has one slot and a caller, and the
caller falls into THREE cases, not two:

* `MV_ARM_NOHINT` — the caller holds no type. Matches any parity; this is what every
  un-hinted entry point passes, so nothing they resolve moves. **This is the state a
  two-value parity has no room for**, and its absence is why the refuted candidate's repro
  merely moved its failure to the other function.
* `-1` — the caller's type IS resolved and is NOT an arm. The state that stops the TWIN's
  mint from finding the arm's slot.
* `>= 0` — the caller's type is that arm.

A hint is a FILTER on the existing rungs and never a new match, which is what lets it sit
under a MINT without violating D-MAPNODETY: a find can only DECLINE a slot whose arm is not
this value's, so the mint runs in strictly more cases and is skipped in none. Four sites
supply it — the mint (`mvShapeOfValNameArmTy`, off `armTy`), the routed op find
(`mvSlotOfMapValNameOrMonoKTy`, off `valTy`), `mapAnnShape` (off `nodeMapValTyIx`, and this
is the one that types every FUNCTION BOUNDARY: without it the slots separated and both `mkC`
and `mkD` still returned the FIRST map struct), and `letMapShapeOf` (whose header refuses to
route its node type at the FIND rung, for 128 measured disagreements — the arm-only hint is
not that routing, and it is the one that reached D48's own alias-spelled witness).

Regression fixture: `tests/cases/maps/arm-valued-map-beside-layout-twin.vl` (both declaration
orders plus the two-arms-of-two-unions control).

---

### D49 — the array-ALIAS spelling of an arm-element list is invalid wasm where the direct spelling runs — **CLOSED 2026-08-26**
**check-clean invalid wasm · found 2026-08-26 by D34's 300-cell grid (6 of its 6 residual silent cells, flat at 2 per arm-ness across `arm_notwin` / `arm_twin` / `arm_namediff`) · pre-existing and IDENTICAL on `f2064bec` and on D34's branch · NO generic, NO import, NO twin needed · CLOSED by #1948 — `arrSpineIsNominal` + `tyToNominalName`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type C = Circle[]

    function mk(i: i32): C {
      const c: Circle = { r: i }
      const l: C = [c]
      return l
    }

    function cell(): i32 {
      const l = mk(7)
      return 1
    }

    print(cell())
    // vl check rc 0 (one hint); vl run:
    //   Invalid input WebAssembly code at offset 274:
    //   type mismatch: expected i32, found (ref $type)

* **THE ALIAS IS THE WHOLE TRIGGER.** Spelling the same two annotations `Circle[]` directly —
  `function mk(i: i32): Circle[]` and `const l: Circle[] = [c]`, `type C` deleted — RUNS and
  prints `1`, on both compilers.
* Controls, each ONE line different, all measured: ~~`Sq`/`Shape` deleted so `Circle` is a
  plain struct → runs~~ — **THIS ONE DOES NOT REPRODUCE AND THE CORRECTED VALUE IS THE ROW'S
  SECOND HALF.** Run verbatim on `c0873a06`, `Sq`/`Shape` deleted is the LOUD
  `emitProgram: struct array elements are not supported`, not `runs`: the array alias was
  broken for a PLAIN declared-struct element too, loudly there and silently for an arm. A
  filed control that does not reproduce is a row that was never fully run, so the rest of this
  line is re-stated as re-measured rather than inherited: a `Dot` twin present or absent → no
  change (flat 2/2 at every arm-ness that has an arm, 0/2 at a NON-MEMBER struct); declaration
  order → flat.
* **IT IS NOT D34's ROOT AND ITS SIGNATURE SAYS SO**: `expected i32, found (ref $type)` is a
  rep-class collapse, not two heap types for one shape — the same signature D37 had, one layer
  down. The remaining cells of D34's grid at `listelem` READ positions are a LOUD checker
  reject (`cannot index non-array C`), which is a second, independent alias gap.

**RETIREMENT — the trigger is filed correctly and the ROOT is one layer above where the row
looks.** The array alias never reaches the emitter's ref-list layer at all: `nameIsRefArray`
and every rung under it key on the DECLARED SPELLING, and `C` is not `X[]`. What was supposed
to have already rewritten it is `canonEmitTypeNames`, which rewrites every `TypeRef.tyName`
into the emitter's own vocabulary and DOES resolve a transparent one-member alias
(`type Id = i32`, `type L = i32[]`, `type M = {[string]: i32}`) through
`singleAliasMemberTyIx`. That function's `TyArray` arm is gated on `arrSpineIsScalar`.

**THE COMPLEMENT IS A RENDERER, NOT A PREDICATE — and `arrSpineIsScalar`'s own header says
so.** It reads: *"the exact condition under which `tyToEmitName` renders the type
name-faithfully"*. `tyToEmitName` re-renders an array's element, so `Cat[]` comes out
`{n:i32}[]` and the declared name the emitter's element tables key on is dropped —
#1137's "nominal emit route to lose", pinned from the losing side by
`tests/cases/types/array-alias-nominal-element-stays-opaque.vl`. The gate is a property of
that renderer, not of the language. `tyToNominalName` is its name-faithful twin: written,
documented correct, and carrying the line **"NOTHING consumes this in emitted output yet —
it is a byte-identical foundation"**. Under it the member renders `Cat[]`, which is the
DIRECT annotation character for character. **Fifth for five: every rung of this family has
been closed by a predicate (here a producer) that already existed and was not consulted.**

* **THE PREDICTED SABOTAGE DOES NOT FIRE, AND THAT IS THE MEASUREMENT THAT MATTERS.** The
  opaque pin's header said "widening the arm to every `TyArray` turns this file red". Widened
  and paired with the nominal renderer it is GREEN — the route is kept. Its header now records
  the retirement and keeps the file as the other direction's witness (substituting the
  STRUCTURAL render still reddens it).
* **ONE PREDICATE, BOTH SIDES.** `declaredTyOfName` (the checker) and `singleMemberAliasTyIx`
  (the emitter) read the same arm, so the filed *"second, independent alias gap"* — the loud
  `cannot index non-array C` / `field 'length' is not on every member of C` at every READING
  use — is the SAME root and closes with it. It was not independent.
* **THE FILED `plain` CONTROL WAS WRONG, AND THE CORRECTION IS THE INTERESTING HALF.** The row
  says "`Sq`/`Shape` deleted so `Circle` is a plain struct → runs". Run verbatim on
  `c0873a06` it is a LOUD `emitProgram: struct array elements are not supported`. So the alias
  spelling was broken for a plain declared-struct element too — loudly there and silently for
  an arm, which is the same defect wearing the loud floor the arm falls through.
* **THE DISASSEMBLY IS THE WHOLE MODULE.** Master's `mk` builds the i32 list — `array.new_fixed
  3` over `(array (mut i32))`, `struct.new 6`, `(result i32)`, and a local typed `(ref 2)`
  (the value-union box) — while types 7/8 (`(array (mut (ref null 0)))` and its wrapper) sit
  interned and unused. On the branch the whole module is **byte-identical to the DIRECT-spelling
  control's**: `array.new_fixed 7`, `struct.new 8`, `(result (ref 8))`, local `(ref 8)`.
  (Seeds: master `c0873a06` 1,429,387 bytes; branch 1,429,949 bytes.)
* **THE TEN LOUD→SILENT CELLS ARE ACCOUNTED FOR CELL BY CELL, and none of them is new silent
  surface.** Six are D63 (the alias / alias-of-alias spellings of `listelem`, `listoflist`,
  `structfield` at `iterate`) and four are D64 (`store` / `storeread` at the twinpair struct
  field). For all ten, the DIRECT-spelling control is ALREADY that row on `c0873a06`, at the
  same byte offset with the same message, and **both rows' filed repros contain no array alias
  at all** — so the shape is reachable without the alias and the alias joined a class that was
  already counted. Ablating the new array-literal floor on its own moves **0 of the 10**: they
  build through the ref-list path, so the i32 fallback the floor stands in is never entered.
  The three questions (covered? reachable without the alias? floor-takeable?) were each
  answered by re-reading the graded sweeps, not by argument.
* **A SECOND, SMALLER ROOT WITH THE SAME SIGNATURE RIDES ALONG, and it is the missing loud
  floor.** The `inferred` spelling (`const l = [c]`, no annotation for the ref-list layer to
  key on) reaches the array-literal i32 fallback, whose ladder already floors an ARRAY element,
  a STRUCT element and a MAP element — the map arm's comment even writes D49's exact sentence,
  *"expected i32, found (ref $type), invalid wasm"*. There was no VARIANT arm, and the two
  namespaces are exclusive so `exprStruct` declines for an arm by construction. Adding it moves
  **22 grid cells silent → LOUD** and 0 `correct` cells anywhere: on that backing a
  `(ref $uVarHeap[arm])` element has no rep at all, so the floor cannot turn a running program
  loud. Filed as D65 for the rep the inferred spelling still does not reach.

---

### D50 — [CLOSED 2026-08-26] a `for` loop over an ARM-valued container binds no variant loop var
**CLOSED 2026-08-26 — the repro now RUNS (prints `7`). Was: loud emit reject · found 2026-08-26 by D34's 300-cell grid (6 cells moved silent → LOUD by its fix) · the LIST spelling is loud on `f2064bec` too; the MAP spelling was silent there and is loud now · CLOSED by #1954 — `forInRefArrayVariantIdx`, whose BOTH rungs were already written as REFUSALS in the struct half**

Repro (the LIST spelling — loud on both compilers):

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(i: i32): Circle[] {
      const c: Circle = { r: i }
      const l: Circle[] = [c]
      return l
    }

    function cell(): i32 {
      const l = mk(7)
      let t = 0
      for v in l { t = t + v.r }
      return t
    }

    print(cell())
    // vl check rc 0; vl run:
    //   emitProgram: field access but no struct type declared

The MAP spelling (`for v in m.values()` over a `{[string]: Circle}`) is the same gap reached
from the other container; it was check-clean invalid wasm on `f2064bec` and is
`emitProgram: field access receiver is not a struct` on D34's branch, because
`forInRefArrayStructIdx` now DECLINES for an arm rather than handing back a struct row from
the wrong namespace.

* **`forInElemKind` HAS NO `"variant"` ARM**, so `declareForInLocals` binds the loop var
  through the struct/nulstruct legs and `addLocalName` gets a struct index the arm does not
  have. Both container spellings land there, which is what makes this ONE row rather than a
  map row and a list row.
* Reading the same element OUT of the loop runs on D34's branch (`l[0].r`,
  `m["k"]` narrowed) — the loop VAR's storage class is the whole difference.

**THE FIX (D50). THE COMPLEMENT WAS ALREADY WRITTEN — AS TWO REFUSALS, ONE PER CONTAINER.**
`forInRefArrayStructIdx` declines both arm coordinates already, and each decline names the
row it is declining to hand back:

* the MAP half, since D34 — `if mvValVariantOf(mvs) >= 0 { return -1 }`, i.e. *the loop
  var's layout lives in the variant table and this resolver's contract is a struct index*;
* the LIST half, since D63 (#1952) — `structIdxOfElemName`'s nominal floor
  `if variantIndexOf(n) >= 0 { return -1 }`.

`forInRefArrayVariantIdx` is those two declines read FORWARDS, rung for rung and in the same
order. The list rung goes through `rlElemVariantRow`, the exact complement of
`rlElemStructRow`'s own floor (struct precedence, then the `uVariants` name lookup), so the
two sides of the seam are one predicate read in two directions.

* **FOUR LADDERS, ONE ELEMENT KIND, and only teaching all four moves the outcome.**
  `forInElemKind` (the loop var's rep), `declareForInLocals`'s struct/nulstruct/union chain
  (the var's index), that same function's SECOND list (the `#l` temp's ref-list slot), and
  `emitForInStmt`'s two sets (wrapper/backing, and the non-null recover). Teaching the first
  two moved the repro from `field access but no struct type declared` to
  `ref valtype with no interned shape` — **a loud→loud move with a different message, which
  is progress no outcome-class grader can see**, and the message is what named the third
  ladder. The regression fixture reads a value out of the loop for that reason.
* **THE LOOP VAR IS THE KIND-8 CONCRETE-VARIANT LOCAL** — the same `(ref $(uVarHeap[vi]))`
  cell `const c: Circle = …` binds. That is the invariant: one `for` must bind what one
  index read yields, and the row's own last bullet says the index read already worked.
* **D63'S PIN GRADUATED.** `tests/cases/lists/arm-elem-forin-beside-layout-twin.vl` carried
  "a FLOOR PIN — flip it when D50 lifts" in its header; it is flipped, `@run`, with all
  three of its one-line controls now running. `tests/cases/lists/arm-elem-forin.vl` holds
  the twin-free spelling and `tests/cases/maps/arm-valued-map-values-forin.vl` the map one.
* **IT IS THE FLOOR FOR THREE SPELLINGS AND THE GRID CONFIRMS THE THIRD.** The list and map
  spellings are this row; D63's twin spelling routed onto it in #1952. All three run.


### D57 — [CLOSED 2026-08-26] a STRUCT `==` goes check-clean invalid wasm the moment a UNION that contains that struct is DECLARED
**CLOSED 2026-08-26 — the repro now RUNS. Was: check-clean invalid wasm · found 2026-08-26 by the D42/D44/D46 grid (20 of its 741 cells, every one of them in that grid's prelude) · pre-existing, byte-identical on `c0873a06` and on the D42/D44/D46 branch · NO generic, NO import, NO twin, and the union is NEVER USED**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function cell(): boolean {
      const a: Circle = { r: 1 }
      const b: Circle = { r: 1 }
      return a == b
    }

    print(cell())
    // vl check rc 0; vl run:
    //   failed to compile: …::cell — type mismatch: expected i32, found (ref $type)

* **THE CONTROL IS ONE LINE AND IT IS THE THIRD.** Delete `type Shape = Circle | Sq` and the
  identical program prints `true`. `Shape` is declared and never mentioned again — no value of
  it is built, no function takes one, nothing is narrowed — so the trigger is the DECLARATION,
  not any use.
* **THREE SPELLINGS, ONE TRIGGER, measured one file each — and only TWO of them can carry the
  one-line control, which is worth saying rather than rounding up.** All three are `vl check`
  rc 0 and invalid wasm with the union declared: a direct `Circle == Circle`; `xs.indexOf(nd)`
  over a `Circle[]` with a `Circle` needle (which fails inside `indexOf$m1`, so it is the same
  site reached through the pin rather than a second defect); and a `Shape == Shape` over two
  `Circle` values. The FIRST TWO run with the `type Shape` line deleted. **The third cannot
  have that control by construction** — delete the union and the program has no `Shape` to
  annotate — so it is listed as a third silent spelling of the same site, not as a third cell
  of the ablation.
* **THE INITIALIZER FORM IS NOT AN AXIS**, which is what says the compare and not the operand is
  the site: an object LITERAL (`const a: Circle = { r: 1 }`) and a CALL RESULT
  (`const a: Circle = mkcirc()`) both reproduce, and both run with the union deleted.
* **IT IS NOT D42/D44/D46's, and it is not D33's or D34's.** It is silent on `c0873a06` and on
  the branch that closes those three, at the same offset and with the same message; there is no
  layout twin (`Sq`'s field set differs from `Circle`'s), no map, no list-of-arm and no callback.
  The neighbourhood to look in is `emitStructEq` → `structIndexOfExpr`, which resolves `Circle`
  to a table index — the same STRUCT-table-versus-VARIANT-table namespace question D26, D32 and
  D33 each settled at a different site.
* **20 CELLS of the D42/D44/D46 grid, and they are that grid's whole remaining silent column.**
  Every one has `Circle` or `Shape` on at least one side of a `==`/`!=` and a `Shape` in the
  prelude; the grid's OTHER 721 cells are unaffected by the union's presence.

**THE FIX (#D57, 2026-08-26).** The neighbourhood named above was right and the reading under it
was one layer off: `structIndexOfExpr` does not resolve `Circle` to the WRONG table index — it
resolves it to NONE. `collectS` SKIPS a `type X = {…}` that is a union member, so declaring the
union DELETES `Circle`'s `sNames` row and mints a variant row instead; `declaredStructIndex` is
kind-gated on `localIsRef[slot] == "struct"` and the slot is now kind-8 `"variant"`. Both rungs
answered -1, the `eqLsi >= 0 || eqRsi >= 0` gate was false, and the compare fell PAST the
struct/closure arms into the i32 tail at the bottom of `emitBin` — `i32.eq` over two
`(ref $Circle)`. That is why it was silent rather than loud: nothing refused, because nothing
recognised the operands at all.

* **THE COMPLEMENT WAS ALREADY WRITTEN — the same shape most of this file's 2026-08-26 closes
  had.** `exprVariantIndex` is `structIndexOfExpr`'s storage-class twin, built arm for arm —
  param, declared local, capture, module global, `: T`-returning call, ref-list element, bare
  map read, `?? default`, `as` cast — with every leg kind-gated so the two cannot both answer
  for one binding. No channel was needed: this is not D39's two-equally-valid-claimants shape,
  because the two ladders name two TABLES and the storage class already decides which.
* **ONE CORE, TWO TABLES — the EQ ROW.** `emitStructEqRec` / `emitStructEqField` /
  `emitChainRead` now take an eq ROW (`>= 0` a struct-table row, `< 0` variant `-1 - row`)
  rather than a struct index, reading through `eqRowFieldCount` / `eqRowFieldTypeAt` /
  `eqRowHeapIdx` / `eqRowTgtStructIdx`. Only the ROOT of a chain can be a variant — a code-15
  nested field resolves through `uFieldTgtStructIdx`, which answers in the STRUCT namespace —
  so the encoding never survives a descent. The field-code ladder, its five supported codes and
  its one loud floor are untouched and shared.
* **THE VARIANT RUNG IS ASKED FIRST, AND ON AGREEMENT ONLY.** Both operands must resolve to the
  SAME variant row; a mixed pair (an arm against a standalone twin) still gets the existing
  `emitProgram: struct equality is not supported yet`
  (`tests/cases/unions/error-arm-struct-equality-mixed.vl` is that control). FIRST is
  load-bearing and was measured, not assumed: with an exact layout twin in the module,
  `structIndexOfExpr`'s two NON-kind-gated legs (the `Index` arena rung, the global's
  `structIndexOfLet`) resolve a variant operand to the TWIN's row, so struct-first left
  `xs[0] == xs[1]` and `ga == gb` invalid wasm — 12 cells that only variant-first fixes. Storage
  class beats a structural twin.
* **THE NULLABLE HALF WENT WITH IT.** `emitNulStructEq` asked the same one ladder, so
  `Circle | null == Circle | null` was the loud `struct equality over a non-struct operand`
  while the non-null compare had just learned to run — the exact drift `emitEqNonNullCore`'s
  header names. It now asks `nulVariantIdxOfExpr` (the niche's own arm-for-arm twin) under the
  same agreement condition and in the same ORDER — niche rung first — and that order was
  measured on its own witness rather than copied for symmetry: a `Circle | null` MODULE GLOBAL
  beside an exact layout twin resolves through the non-kind-gated `structIndexOfLet`, so
  struct-first read a `(ref null $uVarHeap[vi])` through `sHeapIdx` and stayed check-clean
  invalid wasm (`expected (ref null $type), found (ref null $type)`, identical on `a97c9ae1`).
  `arm-struct-equality-nullable-niche.vl` carries that cell.
* **THE FIX IS THREE PARTS, AND AN ABLATION ON THE MERGE BASE SEPARATES THEM.** One compiler
  per cumulative stage, each built from its own sources, all four graded over the same 770
  cells. **A** = master `2ea654d2`. **B** = the DISPATCH rung alone. **C** = B + the
  FRAME-RESERVATION scan. **D** = C + the REFUSAL gate (the branch).

  | stage | runs | check-clean invalid | loud emit | loud check |
  | --- | --: | --: | --: | --: |
  | A master `2ea654d2` | 224 | 294 | 202 | 50 |
  | B + dispatch | 488 | 60 | 172 | 50 |
  | C + reservation scan | 524 | 24 | 172 | 50 |
  | D + refusal gate | **524** | **0** | 196 | 50 |

  The stages are DISJOINT: A→B moves 264 cells (234 silent→runs, 30 loud→runs), B→C moves 36
  (silent→runs), C→D moves 24 (silent→LOUD), and no cell moves twice.
* **WHAT THE DISPATCH ALONE DID IS NOT WHAT A FIRST DRAFT OF THIS ROW SAID, AND THE ABLATION IS
  WHAT CORRECTED IT.** The claim was "the dispatch alone created a NEW silent cell". It did not:
  A→B has **0 loud→silent moves**. What it did is worse to detect and better to know — on 36
  cells it **swapped one silent mechanism for another**. They are check-clean invalid wasm in A
  and check-clean invalid wasm in B, so the outcome-class grader scores them IDENTICAL and the
  A→B diff shows nothing; only the MESSAGE moved, from D57's own
  `type mismatch: expected i32, found (ref $type)` (the i32 tail) to
  `unknown local 4` / `unknown local 5` (a compare emitted against locals the function never
  declared). All 36 are the `richfields` and `clofield` shapes — an arm carrying an `i32[]` or
  a function-valued field, whose compare stages operands in a frame `exprIsStructEq` had to
  claim first and, still asking only the struct table, did not. **A partial fix inside one
  silent class is invisible to a grader that reads the class**, which is why the row carries the
  message diff and not just the counts, and why the corpus witness carries an arm with one field
  of every supported code. It is verbatim the vein `eqCoreKindOfBin`'s own header names.
* **AND A THIRD DISAGREEMENT SHAPE: TWO DIFFERENT ARMS OF ONE UNION.** `type Shape = Circle |
  Ext` with `a: Circle == b: Ext` resolved on both sides, to two variant rows, so the agreement
  rung declined; neither had an `sNames` row, so the refusal gate — struct-table only — was
  false and the compare fell into the same i32 tail. Silent on `a97c9ae1`, on `6ac49ac9` and on
  `2ea654d2`, all at the same offset, and still silent at stage C. The gate now spans both
  tables and the cell is LOUD, which is the CONTROL's answer: delete the union and
  `Circle == Ext` is two struct rows that disagree, giving exactly `emitProgram: struct equality
  is not supported yet`. The win direction here is a refusal and D45 is still not widened —
  nothing that ran stops running; a silent cell became the diagnostic its no-union twin already
  gave. Found by the `std-api-reviewer`, not by the grid.
* **THE GRID: 770 cells, the PRELUDE as a varied axis** — 7 preludes (none · declared-unused ·
  declared-and-used · two unions containing the struct · union + exact layout twin · a union NOT
  containing it · no union + a twin) x 3 declaration ORDERS (before the structs, between them
  and the compare, after the compare) x 23 operand/route shapes x `==`/`!=`. **324 cells moved,
  every one of them FORWARD**: 270 check-clean invalid wasm -> `runs`, 30 loud emit reject ->
  `runs`, and 24 check-clean invalid wasm -> LOUD (the cross-arm shape, loud in EVERY prelude
  including `none`, so the union's presence no longer changes it). **0 cells moved from a loud
  outcome to a silent one, 0 lost the ability to run, 0 produced a different value from the same
  cell's no-union oracle, and 0 check-clean invalid cells remain.** The DECLARATION-ORDER axis is
  inert — all three orders agree in every one of the 770 cells, before and after.
* **D45 IS NOT WIDENED, and it is checkable rather than asserted.** No cell that RAN stopped
  running and no rep lost an acceptance: loud check rejects held at 50, and the only cells that
  gained a diagnostic are the 24 cross-arm ones, whose no-union control gives that same
  diagnostic. On the 2,284-file corpus, 1,851 compile under both compilers, **0 are
  byte-different, 0 lost the ability to compile, and the only 3 that gained it are this change's
  own new cases** — inert on everything that already emitted, active only on what fell through.
  (The master side of that comparison is a seed rebuilt from the merge base's OWN sources —
  `6ac49ac9`, 1,437,150 bytes — not the shared `build/vl-compiler.wasm`. That distinction is
  not pedantry: a concurrent agent refreshed the shared artifact mid-session, and measured
  against it a D52 fixture read as a regression this change had not caused. Re-run against a
  seed built from a named commit, both the grid and the corpus diff are unchanged from the
  `a97c9ae1` run: same 324 cells, same 0 byte-different.)
* Corpus witnesses: `tests/cases/unions/arm-struct-equality.vl` (seven storage classes, plus an
  arm carrying one field of EVERY supported code — i32 · string · `i32[]` · boolean · f64 ·
  nested struct · function value — which is the shape the reservation half needed),
  `tests/cases/unions/arm-struct-equality-nullable-niche.vl` (the niche, including the
  global-beside-a-twin ordering cell), `tests/cases/unions/error-arm-struct-equality-mixed.vl`
  and `.../error-arm-struct-equality-cross-arm.vl` (the two disagreement shapes, one file each
  because emit reports the first failure), `tests/cases/std/array-needle-union-arm.vl` (the four
  `std:array` needle routes, each pinned to a DIFFERENT answer).

---

### D58 — [CLOSED 2026-08-26] a GENERIC function passed as a closure ARGUMENT is a loud emit reject at every instantiation
**CLOSED 2026-08-26 — the repro now RUNS and prints `false`. Was: loud emit reject · found 2026-08-26 by the D42/D44/D46 grid's callee-delivery axis (105 of its 741 cells, every one of them) · pre-existing and IDENTICAL on `c0873a06` and on that branch · NOT silent, filed for the same reason D43 is: it is why a whole axis value of that grid could not be graded on its own question**

Repro:

    function opT<T>(a: T, b: T): boolean { a == b }
    function hof<U, R>(g: (U, U) => R, a: U, b: U): R { g(a, b) }

    function cell(): boolean {
      const a: i32 = 1
      const b: i32 = 2
      return hof(opT, a, b)
    }

    print(cell())
    // vl check rc 0; vl run:
    //   emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or string
    //   parameters are supported

* **THE PIN IS FINE AND THE VALUE IS NOT.** `opT` at `T = i32` is the most ordinary
  instantiation in the language; called by NAME (`opT(a, b)`) the identical program prints
  `false`. The refusal is about handing the generic over as a function VALUE to a parameter.
* **IT IS LOUD AT EVERY CELL OF ITS AXIS**, which is the whole reason to file it: all 105 cells
  of the D42/D44/D46 grid's HOF-parameter column answer this, at every `T` in the rep vocabulary
  and every operator, so that column measures the delivery and never reaches the comparison it
  was written for. The struct-FIELD column has the same shape at emit
  (`emitProgram: function-value call arity has no interned signature`) but its CHECK half is
  live, so it is graded and this one is not.
* Not a member of this file's silent classes — it is a clean emit reject with a message naming
  the unsupported position. Filed so the next grid over the callee-delivery axis does not spend
  a fifth of its cells discovering it again.

#### The close (2026-08-26, #D58)

**THE TITLE IS ONE AXIS TOO WIDE, AND THE CONTROLS ARE WHAT NARROW IT.** "Passed as a closure
argument" is not the trigger — the RECEIVER is. Each of these is one line different from the
repro and each RAN on master `8bf0f20f`:

| control | outcome on master |
|---|---|
| `hof(g: (i32,i32)=>boolean, …)` — the receiver CONCRETE | runs |
| `hof<U,R>(…)` with a CONCRETE `opC` argument | runs |
| `hof<R>(g: (i32,i32)=>R, …)` — only the arrow's RESULT rides a type param | runs |
| `const f = opT  hof(f, a, b)` through a concrete `hof` | runs |

The trigger is a GENERIC function value flowing into a parameter whose annotation is an ARROW
riding the RECEIVER's own type parameters. Both halves are required, which is why a grid that
holds either fixed cannot see it.

**IT IS AN ORDER, NOT A MISSING RESOLVER — the first row in this file's 2026-08-26 run that is
neither the standing "call the complement" lead nor D39's channel.** `monoWalk`'s coercion loop
hands the receiver's DECLARED parameter type to `monoCoerceFnValue`, which is sound only while
that type is a function type; `(U, U) => R` is not one yet. `monoFnTypeAnnParamsName` split it
into the pin names `["U", "U"]` and `monoInstanceFor` minted an instance of `opT` whose
parameters are SPELLED `U` — a type variable of a different function, which
`emitOneFuncType`'s parameter ladder correctly refuses. The main binding loop then compounded
it: it binds a type parameter at its FIRST use in declaration order, `U`'s first use is `g`,
and the only thing there to read it off is the argument's own declaration (`(T, T) => boolean`),
so `U` bound to `T`.

Three edits, and the middle one is the whole fix:

| edit | site | what it does |
|---|---|---|
| the gate | `monoWalk`'s coercion loop + `monoFnParamAnnRidesTyParam` | skip the eager coercion when the parameter's annotation mentions the receiver's own type parameters — a receiver with none answers false, so every concrete call is untouched |
| the ORDER | `monoInstantiate`'s pre-binding pass + `monoCallGenFnToTyParamArrow` | bind the type parameters from the NON-arrow arguments first, so the arrow substitutes to a function type that exists. Gated on a generic function actually being on its way into such a parameter — the two orders can only disagree when one of them answers with a type VARIABLE |
| the deferred call | `monoInstantiate`'s composite-arrow branch | `monoCoerceFnValueName(args[i], pinC, …)` at the SUBSTITUTED pin, which is the coercion `monoWalk` skipped |

**12 GRID CELLS, every one `loud emit reject` → `runs`** — `arg_gentv` and `arg_gen2` x a
generic callee x `i32` / `f64` / `string` x 0 and 1 EXTRA generics in the file. 0 in any other
direction, and the `arg_concrete` / `arg_genret` / `direct` / `bound` / `field` / `ret` columns
are byte-for-byte unmoved. Graduated:
`tests/cases/generics/generic-fn-as-generic-hof-argument.vl`, which carries all four arrow
shapes and the three controls above.

---

### D63 — [CLOSED 2026-08-26 — now RUNS] a `for` over an arm-element list beside an EXACT LAYOUT TWIN is SILENT where D50 is loud
**NOW RUNS (prints `7`) — D50 lifted in #1954 and this coordinate lifted with it, which is what "the floor was there all along and the twin was walking round it" predicted; the fixture below graduated from a floor pin to `@run`. Was, between #1952 and then: a loud emit reject (`emitProgram: field access receiver is not a struct`) — the twin no longer routes around D50's floor, and D50 is what both spellings now take. Was originally: check-clean invalid wasm · found 2026-08-26 by D49's 910-cell grid (12 of its 24 residual silent cells: `listelem` / `listoflist` / `structfield` x all four spellings) · pre-existing and IDENTICAL on `c0873a06` and on D49's branch · NO generic, NO import, NO alias needed · CLOSED by #1952 — the nominal floor `rlElemStructRow` already carried, at the SECOND copy of that ladder**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function cell(): i32 {
      const c: Circle = { r: 7 }
      const l: Circle[] = [c]
      let t = 0
      for v in l { t = t + v.r }
      return t
    }
    print(cell())
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 334:
    //   type mismatch: expected (ref $type), found (ref $type)

* **THE CONTROL IS ONE LINE: DELETE `type Dot = { r: i32 }`.** Without the twin the same
  program is D50's LOUD `emitProgram: field access but no struct type declared`; with a
  same-arity DIFFERENT-FIELD-NAME neighbour (`type Dot = { q: i32 }`) it is the loud
  `emitProgram: field access receiver is not a struct`; with `Sq`/`Shape` deleted, or with
  `Circle` a NON-member of the union, it RUNS. So arm-ness AND an exact layout twin are both
  required, and the twin is what turns D50's floor off.
* **IT IS THE FAMILY'S SIGNATURE, NOT D50'S.** `expected (ref $type), found (ref $type)` is
  two heap types for one shape — D26/D32/D33/D34's message — where D50's is a located emit
  reject. So `forInElemKind`'s missing `"variant"` arm is the LOUD half and something one
  layer down resolves the twin's row before that arm is reached.
* Strictly worse than D50 at the same coordinate: the loud floor exists and the twin routes
  around it. Ranked accordingly.
* **IT IS THE DESTINATION OF SIX OF D49's TEN LOUD→SILENT CELLS, and the accounting is the
  reason to read that as inherited rather than created.** Those six are the ALIAS and
  ALIAS-OF-ALIAS spellings of the three containers above; the DIRECT and INLINE spellings of
  the same three coordinates are already this row on `c0873a06`, at the same offsets and with
  the same message, and the repro above contains **no array alias at all**. So the shape is
  reachable without the alias, and D49's close moved the alias spelling onto a defect that was
  already counted rather than growing the silent surface. The alias's own previous verdict was
  the checker reject `for` could not get past, which is a LID in the sense
  `array-alias-return-unread.vl` describes.
* D49's new array-literal floor does NOT reach these: measured by ablating the floor alone (a
  D49-without-floor compiler against D49-with-floor), **0 of the 6 move**. The list is built
  through the REF-LIST path here — that is what D49's fix does — so the i32-list fallback the
  floor stands in is never entered, and the failure is a layer later at the loop var.

**THE COMPLEMENT WAS ALREADY WRITTEN AND WENT ON ONE OF TWO COPIES — the D36/D38 shape.**
`forInRefArrayStructIdx`'s LIST path calls `structIdxOfElemName`, which is the slot-less twin
of `rlElemStructRow`: the same three rungs (nominal `structIndexByName`, the canon-key row,
the fieldset scan) in the same order. `rlElemStructRow` grew a nominal floor for **D32** — *a
ref-list element whose name is a registered union VARIANT and not a registered plain struct
has NO struct-table row, so every rung below must decline* — and `structIdxOfElemName` never
did. The canon-key rung under it then bridged `Circle`'s SHAPE onto `Dot`'s row and
`declareForInLocals` typed the loop var `(ref $Dot)` while the element read yields
`(ref $uVarHeap[Circle])`. The MAP half of the very same function had the equivalent gate
since D34 (`if mvValVariantOf(mvs) >= 0 { return -1 }`); the list half did not.

The fix is that one line, placed AFTER the nominal rung and AHEAD of the structural ones —
the ordering `rlElemStructRow` documents ("a nominal question must not be settled by
whichever structural rung happens to fire first"). `structIdxOfElemName` has exactly one
caller, so the blast radius is this resolver.

**GRID: 24 cells, every one `check-clean invalid wasm` → `loud emit reject`, 0 in any other
direction.** All 24 are `iterate` at `twin=exact`, across `listelem` / `listoflist` /
`forinvar` and both pairings and declaration orders. **D50 STILL FIRES for its own shape**
after the change (`emitProgram: field access but no struct type declared`, verbatim repro,
unchanged), which is the point: the floor was there all along and the twin was walking round
it. Regression fixture (a FLOOR pin — flip it when D50 lifts):
`tests/cases/lists/arm-elem-forin-beside-layout-twin.vl`.

---

### D64 — [CLOSED 2026-08-26] an arm-element list in a STRUCT FIELD beside a layout-twin struct is invalid wasm
**CLOSED 2026-08-26 — the repro now RUNS (prints `1` / `1`). Was: check-clean invalid wasm · found 2026-08-26 by D49's 910-cell grid (8 of its 24 residual silent cells: `store` + `storeread`, `arm_notwin` and `arm_twin` alike, direct and alias spellings) · pre-existing and IDENTICAL on `c0873a06` and on D49's branch · D48's shape ONE CONTAINER OVER — no map anywhere · CLOSED by #1952 — `structFieldCodesEq`'s referenced-layer guard, which existed for ONE of the three field codes that need it**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    type Box = { xs: Circle[] }
    type Box2 = { xs: Dot[] }
    function mkC(): i32 {
      const c: Circle = { r: 7 }
      const xs: Circle[] = [c]
      const b: Box = { xs: xs }
      const l = b
      return 1
    }
    function mkD(): i32 {
      const c: Dot = { r: 9 }
      const xs: Dot[] = [c]
      const b: Box2 = { xs: xs }
      const l = b
      return 1
    }
    print(mkC())
    print(mkD())
    // vl check rc 0 (two unused-variable warnings); vl run:
    //   Invalid input WebAssembly code at offset 368 in mkD:
    //   type mismatch: expected (ref $type), found (ref $type)

* **THE PAIRING IS THE TRIGGER AND A ONE-CONTAINER GRID CANNOT SEE IT** — the same blind spot
  that hid D48. Either function ALONE runs; `Circle` a plain struct (delete `Sq`/`Shape`) runs;
  `Dot` with a different field name runs.
* **IT IS D48 AT THE STRUCT-FIELD ELEMENT ROW RATHER THAN THE MAP-VALUE SLOT.** Two
  layout-twin field element rows resolve to one ref-list slot whose element heap is
  `uVarHeap[Circle]`, and `Box2.xs` stores a `(ref $Dot)` into it. `sFieldElemName` /
  `sFieldElemTyIx` and `rlSlotByNameTy`'s struct-twin rung are the layer, and the nominal
  channel is on the FIELD's own recorded element type — the same shape as D48's `armTy`.
  Filed separately because the layer is different and the ablation has not been run;
  grouped with D48 in intent.
* The failure is in the SECOND function, as D48's is — whichever declaration comes second
  loses. Declaration order swaps which function fails and does not change the count.
* **IT IS THE DESTINATION OF THE OTHER FOUR OF D49's TEN LOUD→SILENT CELLS.** Those four are
  the ALIAS spellings of `store` and `storeread` at `arm_notwin` and `arm_twin`; their DIRECT
  twins are already this row on `c0873a06` at the same offsets, and the repro above spells
  every type out — **no array alias anywhere**. Reachable without the alias, therefore
  inherited by it and not created for it.
* D49's array-literal floor does not reach these either: ablated on its own, **0 of the 4
  move**. Both field element lists are annotated, so they take the ref-list path and the i32
  fallback the floor stands in is never entered.

**THE ABLATION THIS ROW ASKED FOR WAS RUN, AND IT SAYS D48 AND D64 ARE TWO ROOTS.** One
compiler per candidate, all three swept against one 1,070-cell grid: D63's fix moves 24
cells, D64's 24, D48's 21, the three sets are **pairwise disjoint**, their union is exactly
the 69 cells the full branch moves, and the full branch's verdict equals each single's on
every cell it moves. No cell needs two patches. Same shape, three layers, three roots.

Re-established on the **post-#1951 base** (five compilers rebuilt, five sweeps re-run):
every one of the 1,070 cells holds the same verdict under all five as it did pre-merge —
`master` 0 differ, `A` 0, `B` 0, `C` 0, `FULL` 0 — so the verdict is a property of the tree
that ships, not of the base it was first measured on.

**AND THE LAYER IS NOT THE mv ONE AT ALL — it is the STRUCT-ROW DEDUP.** The ref-list layer
kept `Circle[]` and `Dot[]` apart correctly (two slots, element heaps `uVarHeap[Circle]` and
`$Dot`). What merged was `Box` and `Box2` themselves: `buildStructTwins` matches on
`slotCanonId` (canon renders the arm structurally, so they agree) plus `structFieldCodesEq`,
whose per-field test compares only the top-level CODE — both fields are code 5, a
struct/union ref list — and the two rows collapsed onto one WasmGC struct type. `Box2`'s
`struct.new` then pushed a `(ref $DotListWrapper)` into a field typed
`(ref $CircleListWrapper)`.

**THE GUARD WAS ALREADY WRITTEN, ON ONE ARM OF THREE.** `structFieldCodesEq` carries a
referenced-layer descent for code 15 (a nested struct): distinct element names must resolve
to rows that are twins themselves, and an unresolvable element name DECLINES the merge. That
is exactly the test code 5 needs, and code 28 (`S[] | null`) too — measured as its own
witness, `type NBox = {xs: Circle[] | null}` beside `type NBox2 = {xs: Dot[] | null}`,
identical message. `fieldCodeRefsElemHeap` now names the set {15, 5, 28} — "the field codes
whose emitted storage is a `(ref [null] <heap>)` the code alone does not name". For an arm
element the descent declines because an arm has no `sNames` row at all, which is the correct
answer and the nominal one.

The other named-heap codes (19 a map field, 29 its niche) are deliberately NOT in the set:
over a union arm they are a LOUD reject long before any row is merged (`unsupported map value
type …`), measured one file each, so adding them would be an unwitnessed widening of a MERGE
gate — the direction that cannot be graded.

**GRID: 24 cells, every one `check-clean invalid wasm` → `runs`, 0 in any other direction.**
All 24 are `structfield` at `pairing=twinpair, twin=exact`, across `store` / `read` /
`storeread` / `pass` and all three spellings and both declaration orders — the pairing axis
is the trigger, which is why a one-container grid could see neither this row nor D48.
Regression fixture: `tests/cases/structs/arm-elem-list-field-beside-layout-twin.vl`.

---

### D65 — [CLOSED 2026-08-26] an INFERRED arm-element list has no rep, and now says so
**CLOSED 2026-08-26 — the repro now RUNS (prints `1`), ONE COMMIT AFTER IT WAS FILED, by the change that closed D40. Was: loud emit reject · found 2026-08-26 by D49's 910-cell grid (19 of its 46 post-D49 silent cells) · was check-clean invalid wasm on `c0873a06`, then a loud emit reject on `6bb5d46f` for exactly one commit · NO generic, NO import, NO alias, NO twin**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function cell() {
      const c: Circle = { r: 7 }
      const l = [c]
      return 1
    }
    print(cell())
    // vl check rc 0 (one unused-variable warning); vl run:
    //   emitProgram: union-arm array elements are not supported in this position
    // on c0873a06 the same program was:
    //   Invalid input WebAssembly code at offset 255: type mismatch: expected i32, found (ref $type)

* **THE ANNOTATION IS THE WHOLE TRIGGER, IN THE OPPOSITE DIRECTION FROM D49'S.** Writing
  `const l: Circle[] = [c]` RUNS; leaving it off drops the list into the i32 backing, because
  the ref-list layer keys on a declared spelling and an inferred local has none.
* The floor added while closing D49 is the ladder's missing VARIANT arm, beside the ARRAY,
  STRUCT and MAP arms that were already there — the map one's own comment writes this row's
  master message verbatim. It cannot redden a running program: on the i32 backing a
  `(ref $uVarHeap[arm])` element has no rep at all.
* **WHAT IS STILL OWED IS THE REP, NOT THE FLOOR.** The inferred spelling should reach the
  ref-list path the annotated one does; the channel is the checker's recorded type on the
  array-literal node (`arrLitArenaElemRow`, which already exists), not a spelling.
* Flat across arm-ness (`arm_notwin` / `arm_twin` / `arm_namediff`) and across `listelem` /
  `structfield`; `plain` and `nonmember` run.

---

**CLOSED ONE COMMIT AFTER IT WAS FILED, BY D40's FIX, AND THIS ROW IS WHAT MADE THAT FIX
CHECKABLE RATHER THAN PLAUSIBLE.** Its own bullet names the channel — *"the channel is the
checker's recorded type on the array-literal node (`arrLitArenaElemRow`, which already
exists), not a spelling"* — and `arrLitNominalElemName` reads exactly that row, resolving it
through `arrElemNominalOfTy` → `shapeNominalOfTy`. Two grids filed by two people from two
directions (D49's 910-cell grid here, D39/D40/D41's 480-cell grid there) converged on one
missing rung, which is stronger evidence for the rung than either grid alone.

The floor #1948 added is untouched and still fires for the shapes that genuinely have no rep;
what changed is that an INFERRED arm-element list is no longer one of them. The witness runs
and prints `1`; the annotated spelling this row contrasts it with still runs, so the two
spellings now agree instead of differing by a diagnostic.

---

### D66 — [CLOSED 2026-08-26 — RUNS] the BARE-container half of D40: a callback result bound through an un-annotated local, silent only through `std:array`
**runs, prints 7 — closed by D52's rung (below), which is the ONE thing this row's own remedy note said did not work: "annotate the CALLBACK'S RETURN (`: Circle`). Annotating the local does not." It does now, and the alias hop is why — `retLocalLetOfBlock` stops at the first ANNOTATED link, so `const c: Circle = { r: n }  const o = c  return o` hands the result-valtype pass `c`, whose annotation names one unambiguous arm. Was: a loud emit reject after #1949; before that — the repro is LOUD on both sides of the routing test, so it is no longer a `std:array` carve-out. Was: check-clean invalid wasm · split out of D40 on 2026-08-26 when the LIST half went loud · pre-existing and byte-identical on `c0873a06` (same offset, same message) · a genuine `std:array` CARVE-OUT by the routing test — the same producer called directly is LOUD**

Repro:

    import { mapIndexed } from "std:array"

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(n: i32, _i: i32) {
      const c: Circle = { r: n }
      const o = c
      return o
    }

    print(mapIndexed([7], mk)[0].r)
    // vl check rc 0, no diagnostics; vl run:
    //   failed to compile: …::mapIndexed$m1
    //   Invalid input WebAssembly code at offset 479: type mismatch: expected (ref $type), found i32

* **THE ROUTING IS THE CARVE-OUT TEST AND IT PASSES IT.** The same body called DIRECTLY is the
  loud `emitProgram: field access but no struct type declared`; routing it through
  `mapIndexed` turns that refusal into silence. That is D35's property at a third position.
* **IT DOES NOT SHARE D40's FIX, WHICH IS WHY IT IS ITS OWN ROW NOW.** D40's list half is
  floored by the array-literal ladder's new VARIANT arm (D65); this one builds no array
  literal at all, so that ladder is never reached. The message says so too — `expected
  (ref $type), found i32`, the rep-class collapse, not an element-type mismatch.
* Remedy that HOLDS, measured: annotate the CALLBACK'S RETURN (`: Circle`). Annotating the
  local does not. That asymmetry is D40's own note and is unchanged.

---

**NOW A LOUD EMIT REJECT, AND THEREFORE NO LONGER A CARVE-OUT — closed by D40's fix as a
side effect, in the direction that makes the routing test come out even.** Measured on the
closing branch, both sides of this row's own criterion:

    direct call        emitProgram: ref valtype with no interned shape
    through mapIndexed emitProgram: ref valtype with no interned shape

The row's finding was that the SAME producer is loud written directly and silent routed. It
is now loud on both, so nothing about `std:array` makes this program worse and the entry
comes off that module's ledger. What remains is the shared refusal itself, which is **D51** —
`criClassify`'s returned-local rung has a struct arm and no VARIANT fall-through, so
`structIndexOfLet` answers -1 for a binding a union ARM claims. This row's remedy (annotate
the CALLBACK'S RETURN) still holds and is unchanged.

---

### D51 — [CLOSED 2026-08-26] an un-annotated function returning a bare struct-SHAPED local with no `sNames` row
**CLOSED 2026-08-26 — the repro now RUNS and prints `7`. Was: loud emit reject · found 2026-08-26 by the D39/D40/D41 grid, and it is the largest single family in that grid's residue (34 of 72 cells) · LOUD on master `6bb5d46f` and on the closing branch alike, and 4 of its cells moved silent → LOUD in that change · it is also what D66 reduces to once that row stops being a carve-out**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq

    function mk(n: i32) {
      const c = { r: n }
      const o = c
      return o
    }

    print(mk(7).r)
    // vl check rc 0 (no diagnostics at all); vl run:
    //   emitProgram: ref valtype with no interned shape

* **IT IS D41 WITH THE UNION ADDED, AND THAT IS THE WHOLE DIFFERENCE.** Delete `Sq` + `Shape`
  and the identical program is D41 — closed, prints 7. Declare them and `Circle` moves from
  the struct table to the variant table, so `letIsStruct` still claims the binding (through
  `exprStruct`'s ObjLit arm) while `structIndexOfLet` answers -1.
* **THE LADDER'S SECOND HALF.** `arrLitElemName`'s object arm already has the shape this needs
  — struct row, then the ARM's own name (`objVariantName`), which is what D38's fix added.
  `criClassify`'s returned-local rung has only the struct half: `letIsVariant` is never asked
  and `fRetKind` has no inferred `"variant"` route at all. Closing it needs three things
  rather than one arm, which is why it is filed rather than folded in: a `retKindPri` tier for
  `"variant"` (today it is 0, so `criSetRetKind` can never land the write), a `variant` arm in
  `emit_sections`' inferred-return `infSlot` ladder, and the rung itself.
* **34 CELLS**, every one `container=bare`: 32 at `decl=arm` and 2 at `decl=nodecl`, spread
  across `binding` (direct 8 / local 12 / alias 14), `ann` (none 24 / localann 10), `twin`
  (none 16 / namediff 16 / exact 2) and `route` (**fn 17 / std 17**). The even route split is
  what retires D66: the outcome is no longer WORSE through `std:array` than written directly.
  30 of the 34 were LOUD on master with a different message and 4 moved silent → LOUD.
* **THE OTHER 38 RESIDUE CELLS, ACCOUNTED FOR RATHER THAN ROUNDED OFF.** 20 are silent — 16
  of them D52 and 4 D52's `mapIndexed` leg. 12 are `decl=nodecl` + `route=std` at a DIFFERENT
  loud floor (`emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, …`): an
  inline anonymous shape returned from a `mapIndexed` callback, which is the LOUD carve-out
  D41's close created on `std/array.vl`'s ledger. The last 6 are `ann=localann` cells at two
  more loud messages — 4 at `emitProgram: field access …` (this row's shape with the ARM
  annotation on the binding, so the read floors instead of the result valtype) and 2 at
  `emitProgram: binding's inline-shape type has an unsupported field` (an inline-shape LOCAL
  annotation beside a declared struct of that layout, D53's sibling spelling).

#### The close (2026-08-26, #D51)

**THE PREDICTION WAS RIGHT ABOUT THE ROUTE AND WRONG ABOUT THE COUNT, AND THE COUNT IS THE
ROW.** D52 shipped the `retKindPri` tier, the `infSlot` arm and one rung, so the three pieces
this row's own text named were already in the tree; what was left was the RESOLVER and the fact
that FOUR separate sites mint the pair `("struct", -1)`, not one. Fixing them one at a time is
a sequence of half-fixes each of which an outcome-class grader scores as no progress — which is
exactly the trap D52's close records, met again on the same row.

**THE RESOLVER: the object-literal leg `exprVariantIndex` deliberately lacks, asked under the
opposite precondition.** `letObjLitVariantIdx` / `objLitVariantIdxNoStructRow` answer
`objVariantName`'s field-set match, and ONLY where `structIndexOfObj` says the struct table has
no row for that field set. That is what separates this from D39's channel and it is checkable
rather than asserted: D39's two claimants exist only when a `Dot` does, and where a `Dot` does
the gate declines and the struct path answers, as it should. **The `-1` gate makes the whole
change inert on every program that emits a module today** — the pair it fires on is
`fbValtype`'s bounds guard, so there is nothing running to break.

| edit | site | what it does |
|---|---|---|
| the resolver | `objLitVariantIdxNoStructRow` + `letObjLitVariantIdx` | the field-set answer, gated on the struct table having no row |
| the RETURNED-LOCAL rung | `criClassify`'s `letIsStruct` arm | `const c = { r: n }  const o = c  return o` |
| the RETURN-EXPRESSION rung | `criClassify`'s `exprStruct(rx)` arm | `return { r: n }`, no local at all — a two-line spelling the rung above cannot see |
| the LOCAL's own slot | `collectLocals`' struct arm | the locals VECTOR, where the reject moved to when only the functype was fixed |
| **the emit SEED** | `wasmEmit`'s LetDecl + un-annotated-return `pendingVariantIdx` | the slot-kind twin of `letAnnVariantIdx`, exactly as the `nulstruct` seed beside it is `letAnnStructIdx`'s |

**THE FIFTH EDIT WAS FOUND BY DISASSEMBLING AND IT WAS A LOUD → SILENT MOVE, which is this
file's blocker condition.** With the first four in place the repro was no longer a reject and
was not correct either:

    (type 0) (struct (field (mut i32)))        Circle's variant heap
    (type 2) (struct (field i32) (field anyref))   the union BOX
    (func (result (ref 0)) (local (ref 0) …)
      i32.const 0  local.get 0  struct.new 0  struct.new 2  local.set 1   ← invalid

`emitObjLitNode` has three arms — a seeded `pendingVariantIdx`, a matching standalone struct,
and `uDeclared` → BOX — and the seed was read only from the ANNOTATION, so every binding
classified from its INIT fell to the box. `vl check` rc 0 and a module the engine refuses,
strictly worse than the reject it replaced. Reported as a grid count alone the stage looks like
a fix.

**GRID: 12 of the 434 shared cells, every one `loud emit reject` → `runs`, 0 in any other
direction** — `decl=arm` x `objlit` source x `direct` / `local` / `alias` bindings x `ret` /
`retann` / `read` consumption. Graduated:
`tests/cases/unions/inferred-arm-local-return.vl` (five spellings including the no-local one
and a SECOND arm, so the field-set match is choosing between rows rather than finding the only
one). Beside it, `inferred-arm-local-return-beside-layout-twin.vl` is a CONTROL and not a
graduation — every row in it already ran on master `8bf0f20f` and its module is byte-identical
under both compilers, which is the point: it is the declaration state where the struct table
HAS the row and the new rung must DECLINE, and a file pinning only the failing state cannot
tell an inert gate from an over-eager one. `std/array.vl`'s ledger row
`bare container, const c: Circle | LOUD | LOUD | RETIRED (D66/D51)` is re-measured to
`RUNS | RUNS`, with and without the twin, and an UN-annotated row added beside it.

---

### D52 — [CLOSED 2026-08-26] a local ANNOTATED at a union ARM, returned from an UN-ANNOTATED function beside an exact layout twin
**runs, prints 7 — CLOSED 2026-08-26, and the closing account is the section below this row. Was: check-clean invalid wasm · found 2026-08-26 by the D39/D40/D41 grid, which leaves 20 of its 480 cells silent and 16 of them here · pre-existing: silent on master `6bb5d46f` and on `c0873a06` with the same message · eleven lines, no import, no generic, no lambda, no list · THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function mk(n: i32) {
      const c: Circle = { r: n }
      return c
    }

    print(mk(7).r)
    // vl check rc 0 — one redundant-annotation HINT, no error; vl run:
    //   failed to compile: …::mk — type mismatch: expected (ref $type), found (ref $type)

* **THE TWIN IS THE AXIS.** Controls, each ONE line different, each RUN:

  | control | outcome |
  |---|---|
  | `type Dot` DELETED | **runs, prints 7** |
  | `type Dot = { q: i32 }` (same arity, different field NAME) | runs, prints 7 |
  | `Sq` + `Shape` DELETED, so `Circle` is a plain struct | runs, prints 7 |
  | `function mk(n: i32): Circle` (the RESULT annotated) | runs, prints 7 |

* **IT IS D39's SEAM READ FROM THE OTHER END.** With the RESULT annotated, `synthRetPinAnn`
  and the annotated-return ladder agree on `uVarHeap[Circle]` (that is D39, closed). With only
  the VALUE annotated, the local's own cell resolves the arm correctly — its annotation is
  nominal and unambiguous — while the INFERRED result valtype takes `Dot`'s row from the
  structural ladder. The two `$type`s in the engine's message are those two heap types.
* **16 CELLS, all `decl=arm` + `twin=exact`**, across `prod` (anon 6 / named 10), `container`
  (bare 14 / list 2), `binding` (direct 2 / local 6 / alias 8), `ann` (none 6 / localann 10)
  and `route` (fn 8 / std 8). A further 4 silent cells are the same shape at `twin` none /
  namediff, reachable only through `mapIndexed` (`expected (ref $type), found i32`), and are
  recorded as that row's std leg rather than as a separate row. Those 20 are the WHOLE silent
  residue of the grid: every one is `decl=arm`, and every one carries the `: Circle`
  annotation on a binding or a value rather than on the RESULT.
* Pinned as `tests/cases/soundness/xfail-miscompile-annotated-arm-local-beside-layout-twin.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.

**CLOSED 2026-08-26 — A MISSING CALL, NOT A CHANNEL, AND THE DISTINCTION IS THE ROW.** The
first thing asked of this row was whether `synthRetPinAnn` has an inverse already written.
It does not, and it does not need one. D39 needed a CHANNEL because an anonymous `{ r: n }`
has TWO nominal claimants — `structIndexOfObj` finds `Dot` by field set, `objVariantName`
finds `Circle` by field set — and with no annotation at all `Dot` is the RIGHT answer, so
only the context could separate them and the return annotation had to be carried to a local
that never saw it. Here the annotation is ON the local. `criRetLocalLet` already hands the
result-valtype pass that very binding, and `letAnnVariantIdx` — exported, documented "the
union-VARIANT table index a `LetDecl`'s annotation names", and covering `Circle | null` by
the same seeding — reads one unambiguous nominal answer straight off it. It had no caller on
this path. That makes D52 the seventh rung of the family whose complement was already
written, and D39 still the only exception.

**WHAT WAS GENUINELY MISSING IS THE ROUTE, AND D51's ROW HAD PREDICTED IT IN WRITING** —
"a `retKindPri` tier for `"variant"` (today it is 0, so `criSetRetKind` can never land the
write), a `variant` arm in `emit_sections`' inferred-return `infSlot` ladder, and the rung
itself". All three, plus one the prediction did not contain:

| edit | site | what it does |
|---|---|---|
| the tier | `retKindPri` | `"variant"` SHARES `"struct"`'s tier (4), and the sharing is the guard — a return is a plain struct or an arm, never both, and `criSetRetKind`'s strict `>` is that refusal. Same precedent `u8list` shares `f32list`'s tier on |
| the rung | `criClassify`'s returned-local block | `letAnnVariantIdx(rll)` ahead of the struct arm, which now carries a `!= "variant"` guard |
| the slot | `emitOneFuncType`'s inferred arm + `cloRetValSlot` | `infSlot = fRetStructIdx[ti]` for kind `variant`, from the companion column `emit_state`'s header already declares polymorphic |
| **the call site** | `fnRetVariantIndexSid` | the un-annotated arm, by that function's OWN stated rule: gate on the predicate the callee's functype result is emitted from |

**THE FOURTH EDIT WAS FOUND BY DISASSEMBLING, NOT BY THE GRADER, AND THAT IS THE
TRANSFERABLE PART.** With the first three in place `mk` validated and the CALLER did not:

    master   (result (ref 0))   (local (ref 1))  struct.new 1   struct.get 0 0
    half-fix (result (ref 1))   (local (ref 1))  struct.new 1   struct.get 0 0   ← still invalid
    branch   (result (ref 1))   (local (ref 1))  struct.new 1   struct.get 1 0
             ; type 0 is Dot's standalone row, type 1 is uVarHeap[Circle]

The engine's complaint moved from `mk` to the start function and changed one word
(`expected (ref null $type)`). A grader reading only "still invalid_wasm" cannot tell that
apart from no progress, and a grader reading only "`mk` validates now" cannot tell it from a
fix. Both would have shipped a half-fix that looks whole.

**THE GRID: 9,450 CELLS, 180 MOVED, 0 BACKWARD.** decl (arm / plain / nodecl) x ann
(localann / retann / both / none / otherarm) x twin (none / exact / namediff / armtwin /
late) x container (bare / list / field / mapval / nested) x consumption (ret / bound / pass
/ inline / store) x route (fn / gen / std) x order (before / after), 1,800 combinations
skipped as structurally unrepresentable and counted rather than dropped.

    outcome                     master   branch
    runs                          6388     6568
    loud emit reject              2862     2766
    check-clean invalid wasm       200      116
    SILENT TOTAL                   200      116

    transitions   loud emit reject -> runs      96
                  invalid wasm     -> runs      84
                  anything         -> silent     0
                  runs             -> anything   0

**THE GRID VARIES WHAT ITS PREDECESSORS HELD FIXED.** A previous 900-cell grid missed D41
because the union was declared in all 900 files — a constant, not an axis — so `decl` here
has a `plain` level (no union at all) and a `nodecl` level (no type declaration at all), and
both are in the population rather than outside it. `consumption` varies CALLEE DELIVERY,
which a 1,514-cell grid held fixed: the `pass` level hands the value to `thru(x: Circle)`,
whose PARAM is annotated and whose RESULT is not. Nothing is carried in a shared prelude
that is not itself an axis level.

**CORPUS, re-measured on both sides rather than argued:** 2,278 files under `tests/cases`;
1,851 emit a module under BOTH compilers and **1,850 are byte-identical**. The single
difference is this row's own pin, which moves from failing to printing 7. 0 lost, 0 gained.

**THE `pass` LEVEL FOUND A SECOND RUNG AND IT IS THE SAME MISSING CALL ONE STORAGE CLASS
OVER.** `function thru(x: Circle) { return x }` — six lines, no local, no twin needed —
minted `(result i32)` over a body pushing `(ref $type)`, because nothing in this pass ever
asked about a returned PARAM of arm type. `exprVariantIndex` answers for seven storage
classes (param, declared local, capture, module global, a `: Cat`-returning call, a `Cat[]`
element, an `as Cat` cast) and had no caller here either. It is safe to call by the ladder's
OWN documented property rather than by inspection: every arm of it is REP-AUTHORITATIVE
rather than a shape match, its header says so, and there is no object-literal field-set leg
in it — so a bare `return { r: n }` is still NOT answered there and still falls to the struct
arm, where `Dot` is the right answer when `Dot` is what the program means. Gating one of
several duplicated copies is what makes a fix inert (D36/D38); this is the twin built arm for
arm, and 96 of the 180 moved cells are its.

**RESIDUE FILED, NOT LEFT — 116 cells, every one accounted for.** All are `decl=arm`, and
every one has an exact-layout twin (`twin` exact 58 / late 58; the other three levels are
empty). 104 of the 116 carry NO annotation on the local, which is what says they are D39's
CHANNEL problem rather than D52's missing call:

* **D81 — 88 cells.** An anonymous object literal delivered to an ARM-TYPED DESTINATION that
  is not a `return`: a module GLOBAL (48) or a callee PARAM (40). `synthRetPinAnn` carries
  exactly this fact for the return destination and there is no equivalent for either of
  these. It is the new `INVALID_MODULE_SRC`. (The residue holds 52 `pass` cells in all; the
  12 whose local IS annotated are D82's, not this row's — 48 + 40 = 88.)
* **D82 — 28 cells.** The MONOMORPHIZED hand-written generic instance beside a layout twin:
  `route=gen` only, and the 12 cells whose local IS annotated are all here, which is what
  separates it from D81.

Graduated to `tests/cases/unions/annotated-arm-local-return-beside-layout-twin.vl` — five
cells, including D66's alias body, D39's result-annotated control and the PARAMETER storage
class — and `xfail-miscompile-annotated-arm-local-beside-layout-twin.vl` is DELETED, which is
that file's own written instruction for the day it starts passing.

---

### D53 — [CLOSED 2026-08-26] an INLINE-SHAPE parameter in a program that also declares a struct of that layout
**CLOSED 2026-08-26 — the repro now RUNS and prints `7`. Was: loud emit reject · found 2026-08-26 while building D41's graduated fixture, by bisecting a whole-program interaction · LOUD on master `6bb5d46f` and on the closing branch alike · unrelated to D39/D40/D41; it is here because it silently decides what a fixture may contain**

Repro:

    type Boxed = { r: i32 }

    function paramAlias(c: { r: i32 }) {
      const o = c
      return o
    }

    print(paramAlias({ r: 7 }).r)
    // vl check rc 0 (no diagnostics at all); vl run:
    //   emitProgram: ref valtype with no interned shape

* **THE DECLARATION IS THE TRIGGER AND THE PARAMETER NEVER MENTIONS IT.** Delete
  `type Boxed` and the program runs; spell the parameter `c: Boxed` and it runs. The two
  spellings denote the same type and only one of them lowers.
* Found the way whole-program interactions get found: a five-cell fixture failed while every
  one of its cells passed alone, and the pairwise bisect named the pair. That is why the D41
  fixture spells its param cell `c: Boxed` — a fixture must fail for the row it pins.

#### The close (2026-08-26, #D53)

**IT IS NOT TWO CLAIMANTS — IT IS ONE CLAIMANT AND A RESOLVER THAT COULD NOT REACH IT.** The
grouping guessed a channel; the measurement says a call. `internInlineShapeTy` ends in
`annShapeIndexOf`, which DEDUPS the inline shape onto the declared row and pushes **no `sNames`
entry** for `{r:i32}` — correct, and it leaves `structIndexByName("{r:i32}")` with nothing to
find. So the shape has exactly one row and one name, and the name is `Boxed`.

**THE FUNCTYPE FOR THE SAME NODE ALREADY RESOLVED IT, which is how the asymmetry was found
rather than reasoned to.** Disassembled, `function f(c: { r: i32 })` with the parameter unused
emits `(func (param (ref 0)) (result i32))` where type 0 IS `Boxed`'s row — `annValtypeSlotOf`
→ `retStructIndex` → `repSlotOfTy`'s structural→declared bridge. `paramStructIndex` asked
`structIndexByName` and nothing else, so the member READ (`emitProgram: field access receiver
is not a struct`) and the inferred RETURN (`ref valtype with no interned shape`) both answered
-1 for a parameter whose own valtype was already correct. `annValtypeSlotOf`'s header names
this failure in advance: *"a SHORTENED MIRROR of this ladder is a `ref valtype with no interned
shape` reject for exactly the kinds it never learned"*.

**THE RUNG IS LAST AND UNDER TWO MORE GUARDS, and this is a site that RETRACTED an arena rung
once.** That retraction put `structIndexOfTy` FIRST and it won with the wrong row for a generic
original. Placed LAST it speaks only where the name says nothing — today a -1 — so every call
the retraction measured (15,922 corpus, 294 self-compile) keeps its answer by construction. The
other two guards each answer a recorded failure: **inline shapes only**
(`nameIsShapeSpanEnds` + not a registered variant), because `repSlotOfTy`'s bridge would
otherwise hand a union ARM the row of an exact layout twin — the D63/D75 collapse, in the one
namespace this resolver's header forbids it to enter; and **not a generic original**
(`fn.fnTyParams.length == 0`), which is the retraction's own counterexample and IS an inline
shape, so the shape guard alone does not exclude it (`error-param-shadow-tyaram-nullable-elem.vl`
is the pin).

Also measured, and it is why the arena rung is `repSlotOfTy` and not `structIndexOfTy`: the
rung the retraction removed answers **-1** on this shape. The bridge is the leg that answers.

**GRID: 16 of the 434 shared cells, every one `loud emit reject` → `runs`, 0 in any other
direction** — `inlineparam` source x `decl` levels `nodecl` / `plain` / `arm` / `armtwin` /
`armdiff` x `direct` / `local` / `alias` x `ret` / `retann` / `read`.

**THE RESIDUE IS THE SIXTH `decl` LEVEL AND IT IS D39'S CASE AFTER ALL — filed as D100.** With
TWO declared structs of the same layout the bridge's uniqueness guard (`repSlotKeyN[key] == 1`)
declines and the reject stands, on the branch exactly as on master: 9 cells, `plaintwin` x the
same 3 x 3. That is not a gap in this fix, it is the boundary of what a resolver can decide —
`Circle` and `Dot` are two equally valid answers for `{r:i32}` and only the context that WROTE
the annotation knows which. So the grouping's guess ("two claimants for one shape") was right
about a shape D53's own repro does not contain and wrong about D53. Graduated:
`tests/cases/structs/inline-shape-param-beside-declared-twin.vl` (six rows: the three resolvers
that answered -1, both result-annotation spellings, and the nominal control).

---

### D75 — [CLOSED 2026-08-26] a MODULE GLOBAL of a union ARM, through a GENERIC `==`, beside an EXACT layout twin
**closed · one root with D82, and the complement was already written · found 2026-08-26 while grading D57's 770-cell grid, at a coordinate that grid did NOT vary and a hand-written combination did (module-global delivery x generic route x exact layout twin) · pre-existing and byte-identical on `a97c9ae1` and on D57's branch, same offset and same sentence · NOT D57: the compare is reached, the ARGUMENT is not**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function eqT<T>(x: T, y: T): boolean {
      return x == y
    }

    const c1: Circle = { r: 1 }
    const c2: Circle = { r: 1 }
    print(eqT(c1, c2))
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 238:
    //   type mismatch: expected (ref $type), found (ref $type)
    // (THE OFFSET IS QUOTED ONLY BECAUSE IT IS STABLE ACROSS EVERY SEED MEASURED: a master
    //  `a97c9ae1` seed rebuilt from its own sources (1436302 bytes), the same for `6ac49ac9`,
    //  and both of D57's branch fixpoints all give byte 238 and the identical sentence.)

* **THE ONE-LINE CONTROL IS `type Dot`, AND IT TURNS A LOUD FLOOR OFF.** Delete it and the same
  program is the loud `emitProgram: monomorphize: unsupported argument type for `x` in a call to
  `eqT``. Give the twin the same arity and a DIFFERENT field name (`type Dot = { q: i32 }`) and
  the loud floor comes back. So an EXACT layout twin is required, and D63's sentence applies one
  layer up: the loud floor exists and the twin routes around it.
* **A SECOND ONE-LINE CONTROL RUNS.** Delete `type Shape = Circle | Sq` instead and the program
  prints `true` — the twin alone is harmless. Both the arm-ness and the twin are required, which
  is D63/D64's signature, not D57's.
* **IT IS NOT D57, and the ablation says so rather than the neighbourhood.** Move the two
  operands from module globals into LOCALS of a function and the identical program runs on
  D57's branch (it was invalid wasm before it). The compare inside `eqT$m1` is fixed; what is
  still wrong is the INSTANCE'S PARAMETER TYPE. Disassembled, the module has THREE structurally
  identical `(struct (field (mut i32)))` types in one rec group: the global's cell is typed
  `(ref 1)` and `eqT$m1` is declared `(param (ref 0) (ref 0))` — two heap types for one shape,
  never merged, so the `call` is what fails to validate, not the `==` in the body.
* **THE FAMILY IS `uVarTwin` / `sTwin`, NOT `structIndexOfExpr`.** The twin columns exist
  precisely to collapse a variant and a same-shaped struct onto one heap type; here they did not,
  and the monomorphizer's argument classifier — which refuses an arm argument outright without
  the twin — accepts it WITH the twin and pins the wrong row. Reachable neighbourhood:
  `mAssignTypeIndices` (`uVarTwin`) and the monomorphizer's argument-type resolution.
* **#1952 CLOSED ITS NEIGHBOURS AND DID NOT REACH IT, which is the handoff.** D48, D63 and D64
  are the same layout-twin / heap-slot family and all three are closed on `2ea654d2`; this row
  is not, and the ablation says so rather than the neighbourhood: the repro is byte-identical
  and at the SAME offset on `a97c9ae1`, on `6ac49ac9`, on `2ea654d2` and on all three stages of
  D57's own fix. So neither `structIdxOfElemName`'s new rungs, nor the mv find/mint sites, nor
  `repVariantSlotsTwin` touch it — the twin that is not collapsing here is the one between a
  MONOMORPHIZED INSTANCE'S PARAMETER and a module global's cell, which is a coordinate none of
  those three sites reads. Start there, not at the container sites #1952 rewrote.
* Ranked as a silent row strictly worse than the loud floor it replaces, and left for whoever
  next works the heap-slot / twin-collapse region rather than reached from the equality path,
  which has no say in either table's index assignment.
* **CLOSED 2026-08-26 (#D87PR). THE ROW'S OWN DIAGNOSIS WAS RIGHT ABOUT THE COORDINATE AND
  WRONG ABOUT THE FAMILY.** It is not `uVarTwin` / `sTwin`: the two heap types are supposed
  to stay distinct (`DECISIONS.md` keeps the struct/variant seam NOMINAL) and collapsing them
  would be the bug. What was wrong is which of the two the INSTANCE was pinned to.
  `monoArgTyName`'s struct arm asked `structIndexOfExpr` and returned `sNames[si]`; with
  `Dot` in the module the un-kind-gated legs (the `Index` arena rung, the global's
  `structIndexOfLet`) answered DOT'S row, so the pin was the literal string `Dot` — measured
  at the pin with a probe, not inferred from the message. That is D57's root exactly one
  layer out: `collectS` skips a union-member `type X = {…}`, so `Circle` has no `sNames` row
  to be found and only a twin's row is there to be found instead.
* **THE COMPLEMENT WAS ALREADY WRITTEN — the ninth rung of that family.** `exprVariantIndex`
  is `structIndexOfExpr`'s storage-class twin arm for arm (param, declared local, capture,
  module global, `: T`-returning call, ref-list element, bare map read, `?? default`, `as`
  cast), every leg kind-gated so the two cannot both answer, and this ladder never asked it.
  The fix is that call plus `monoAnnPinName` — the ONE membership list for "which annotation
  name can serve as a pin", which already carried the variant rung.
* **D82 IS THE SAME ROOT AND THE ABLATION SAYS SO.** One rung moves 312 of a 3,144-cell grid
  (276 against the `8bf0f20f` base this was first measured on) and closes both rows; see D82.
  The no-twin LOUD floor goes with it (`unsupported argument type for \`x\``) — 114 of those
  312 are loud→runs.
* Disassembly, both sides, one seed each: master `8bf0f20f` (1438562 bytes) emits
  `(global (mut (ref 1)))` with `eqT$m1 (param (ref 0) (ref 0))` and `struct.get 0 0`; the
  branch emits `(param (ref 1) (ref 1))` and `struct.get 1 0`. Type 0 is `Dot`'s standalone
  row, type 1 is `uVarHeap[Circle]`, and the rec group holds three structurally identical
  `(struct (field (mut i32)))` rows that are never merged.
* Fixture: `tests/cases/unions/module-global-arm-through-generic-eq.vl`, four cells (the two
  filed rows plus the LOCAL and PARAMETER storage classes either side of them).

---

### D81 — [CLOSED 2026-08-26] an anonymous object literal delivered to an ARM-TYPED DESTINATION that is not a `return`
**closed · a CHANNEL, as the row predicted — and its two legs are TWO roots, plus two more the grid did not have · found 2026-08-26 by the D52 grid, and it is 88 of the 116 cells that grid leaves silent · pre-existing: silent on master `a97c9ae1` with the same message · twelve lines, no import, no generic, no lambda, no list · THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    let gsto: Circle = { r: 0 }
    function mk(n: i32) {
      const c = { r: n }
      gsto = c
      return n
    }
    mk(7)
    print((gsto).r)
    // vl check rc 0 — one redundant-annotation HINT, no error; vl run:
    //   the emitted module is not valid wasm … type mismatch:
    //   expected (ref $type), found (ref $type)

* **IT IS D39's CHANNEL PROBLEM AT A DESTINATION `synthRetPinAnn` DOES NOT REACH.** An
  anonymous `{ r: n }` has TWO nominal claimants and neither scan is wrong — delete `Dot` and
  the same program runs, so this cannot be fixed by reordering the ladder. Only the CONTEXT
  decides, and here the context is the assignment TARGET's annotation, which the literal never
  sees. **So this is a channel, not a missing call**, and it is the opposite verdict from D52
  on programs one line apart: annotate the local `: Circle` and D52's rung answers it.
* **TWO LEGS, ONE SHAPE, NOT SEPARATED BY AN ABLATION.** The GLOBAL destination above is 48
  cells; the PARAM destination is 40 — `function thru(x: Circle) { return x }` with
  `return thru(c)` over the same un-annotated `c`. Both carry the same engine message and both
  are flat across route (fn / gen / std) and container (bare / list). They are filed as ONE row
  because they are one missing channel, but **no ablation has been run** to prove they are one
  ROOT, and the D39/D40/D41 precedent is that a resemblance in this family is refuted as often
  as confirmed. Run one before assuming.
* **THE `return n` AND THE TOP-LEVEL READ ARE LOAD-BEARING** — checked, not assumed. Drop them
  and the same shape is a LOUD `emitProgram: ref valtype with no interned shape` instead, which
  is a different row. A retyped minimisation that dropped them measured the other program.
* Pinned as `tests/cases/soundness/xfail-miscompile-anon-objlit-into-arm-typed-global.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.
* **CLOSED 2026-08-26 (#D87PR). THE ROW WAS RIGHT THAT IT IS A CHANNEL** — the one exception
  in a family whose other nine rungs closed on an un-called complement. The test it is
  recognised by is the one D39/D52 established: the site has TWO equally valid nominal
  claimants and only context to separate them, so there is no unasked predicate to call and
  the annotation has to be carried. `synthDstPinAnn` is that carry, `synthRetPinAnn`'s
  sibling at the destinations a `return` is not, sharing its gate (`armPinAnnName`) and its
  literal-producer test (`armPinLitInit`) rather than copying them.
* **THE ROW'S "NO ABLATION SEPARATES ITS TWO LEGS" IS NOW MEASURED, AND IT SEPARATES THEM.**
  One compiler per leg over one 3,144-cell grid: the module-GLOBAL leg moves 36 cells, the
  callee-PARAM leg 36, and their intersection is EMPTY. Neither closes the other's cells.
  The row's caution was right for the reason it gave and the answer went the other way.
* **AND THERE WERE FOUR DESTINATIONS, NOT TWO.** An annotated LOCAL is the same sentence at
  the same class in both its spellings (`const o: Circle = c`, and `let o: Circle` … `o = c`)
  — 108 more cells, disjoint from the other two. The D52 grid's `cons` axis had only the two
  levels it filed, which is how they were missed. A struct FIELD is NOT one of them, and that
  is measured: `const b: Box = { c: c }` is the LOUD `only i32 / boolean / string / array
  struct fields are supported`, a different floor.
* **THE ONE GENUINELY NEW FACT IS THE PASS ORDER.** `synthRetPinAnn` lives in
  `collectLocals`, which runs long after `monomorphize`. That is too late the moment a
  hand-written generic sits between the literal and its destination: `idg<T>(x: T): T` has
  already been cloned as `idg$m0(x: Dot): Dot`, pinned off the very row the un-annotated
  literal resolved to, so the conduit reads as a concrete `Dot` destination, vetoes the real
  one, and its own signature is wrong regardless. `synthDstPinAnns` is therefore a PASS,
  ordered `> collectU buildFnMap dispatchRewrite` and before `monomorphize`; the
  `collectLocals` hook stays for the start function and the bodies mono mints. 30 grid cells
  separate the late position from the early one.
* Disassembly, both sides: master emits `(local (ref 0))` + `struct.new 0` into a
  `(mut (ref 1))` global cell; the branch emits `(local (ref 1))` + `struct.new 1`.
* **AN UN-ANNOTATED BINDING ON THE PATH IS A LINK, NOT A DESTINATION** — a distinction the
  grid does not contain and code review caught. `retLocalLetOfBlock` walks THROUGH an
  un-annotated alias to the binding that actually supplies the value, so `const alias = c`
  sits on the path from the literal to its real destination; recorded as a destination it
  answers "" and vetoes the pin it is a link of. `const c = { r: n }  const alias = c
  gsto = alias` was still silent until that skip. The ASSIGNMENT arm is deliberately NOT
  symmetric: `let o = { r: 0 }` … `o = c` over an un-annotated `o` is a genuine destination
  whose cell is already committed by its own literal, so there the veto is right.
* **THE ENCLOSING FUNCTION'S DECLARED RESULT IS A DESTINATION TOO, and it is there for the
  GATE rather than for the pin.** `function mk(n: i32): Dot { const c = { r: n }  gsto = c
  return c }` has an arm-typed GLOBAL destination and a plain-struct RESULT over one literal;
  neither spelling satisfies both. Without that rung the scan pinned `Circle` and moved the
  failure from the `global.set` to the return — check-clean invalid wasm on both sides, which
  an OUTCOME-CLASS grader scores as no change and only a MESSAGE diff catches (the offset
  moved 191 -> 195 and nothing else did). With it the cell is byte-for-byte master's. An
  UN-annotated result records nothing: an inferred return is not a nominal claim — it is what
  D52's rung derives FROM the binding — and recording it would veto this row's own population.
* **A FIFTH DESTINATION ARRIVED WHILE THIS WAS IN REVIEW, and it is #1954's doing rather
  than this row's.** An arm-valued MAP's value slot (`m["k"] = c`) was a LOUD floor on
  `8bf0f20f`, so it was never in D81's silent population at all; #1954 taught the arm-valued
  map to lower under the inline spelling, the floor went, and 18 grid cells came out
  check-clean invalid wasm on `922d52eb`. Same channel one destination further — annotating
  the local makes them run there, which is what says the LITERAL's row is wrong and not the
  map's slot — so `dstPinMapValue` is the fifth leg, and it is disjoint from the other four
  like all the rest.
* RE-MEASURED AGAINST `922d52eb` after merging it, because the base moved under the row: the
  grid's silent count is 306 there (not 264 — #1954 moved 42 loud cells into the silent class
  on this population) and the branch takes it to **0**. 528 cells moved, every one forward,
  0 backward, 0 message-only. The five candidates move 312 / 36 / 36 / 108 / 36, all TEN
  pairwise intersections empty, union set-identical to 528.
* Graduated to `tests/cases/unions/anon-objlit-into-arm-typed-destination.vl` (nine cells:
  all five destinations, the generic hop, the list-element destination, the alias hop, and
  the DISAGREEMENT gate that keeps master's behaviour where two destinations name different
  claimants). The `xfail-` pin is DELETED, which is that file's own written instruction, and
  `INVALID_MODULE_SRC` moves to D87 below.

---

### D82 — [CLOSED 2026-08-26] a MONOMORPHIZED hand-written generic instance beside a layout twin
**closed · ONE root with D75, closed by one rung · found 2026-08-26 by the D52 grid, and it is 28 of the 116 cells that grid leaves silent · pre-existing: silent on master `a97c9ae1` · the ONE residue family whose cells survive with the local ANNOTATED, which is what separates it from D81**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function idg<T>(x: T): T { return x }
    function thru(x: Circle) { return x }
    function mk(n: i32): Circle {
      const c: Circle = { r: n }
      return idg(thru(c))
    }
    print(idg((mk(7)).r))
    // vl check rc 0; vl run:
    //   type mismatch: current function requires result type [(ref (id 1))]
    //   but callee returns [(ref (id 0))]

* **THE MESSAGE IS THE TELL AND IT IS NOT D52's.** `current function requires result type
  [(ref (id 1))] but callee returns [(ref (id 0))]` names the INSTANCE's own signature, not a
  field read — the pin resolved `T` to the twin's row while the argument carries the arm. It is
  the layer D33 works in (`shapeNominalOfTy` / `variantRowOfTy`), one function-boundary out.
* **IT IS `route=gen` ONLY**, 28 of 28, flat across order and container; every cell whose local
  is annotated (`localann` / `both` / `otherarm`, 12 of them) is in this family and nowhere
  else. That is what says it is a separate root from D81 rather than its generic spelling: D52's
  rung reaches the annotated local at the `fn` and `std` routes and does not reach it here.
* Not pinned: D81 is the specimen and one live `@no-instantiate` member is what the tripwire's
  biconditional wants.
* **CLOSED 2026-08-26 (#D87PR), AND IT IS THE SAME ROOT AS D75 — the row's "a separate root
  from D81" was right and its implied separateness from D75 was not tested.** The pin probe
  answers `Dot` for BOTH: `idg(thru(c))`'s argument is a call result, D75's is a module
  global, and `monoArgTyName`'s struct arm reaches the twin's `sNames` row from either. One
  `exprVariantIndex` rung closes both, and the ablation confirms it rather than assuming it —
  the single-candidate compiler that carries only that rung moves 312 cells and the two rows'
  own witnesses are among them.
* The distinguishing observation the row DID make holds and is worth keeping: `route=gen`
  only, and every annotated-local cell in the residue was here rather than in D81. That is
  what makes the two rows different POPULATIONS even though they are one root — D81's channel
  moves none of D82's cells and vice versa (intersection 0 in the ablation).
* Fixture: `tests/cases/unions/module-global-arm-through-generic-eq.vl`, the `mk`/`idg`/`thru`
  cell, kept beside D75's in one file because they are one root.

---

### D87 — [CLOSED 2026-08-26] an UN-ANNOTATED map local whose value is an ARM, handed to a map PARAMETER, beside a layout twin
**closed · it was #1952's regression, and #1954 turned it into the DESTINATION CHANNEL's problem by flipping its own control · a REGRESSION with a bisect: it RAN on `6ac49ac9` and is silent from `2ea654d2` (#1952) onward · found 2026-08-26 by RE-RUNNING D52's own 9,450-cell grid against today's master, which grades it 212 silent where #1951 reported 116 · THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) { return x }
    function mk(n: i32) {
      const c = Map()
      c["k"] = { r: n }
      return thru(c)
    }
    print(((mk(7))["k"] ?? { r: 0 }).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   Invalid input WebAssembly code at offset 1162:
    //   type mismatch: expected (ref $type), found (ref $type)
    // (The offset is NOT the identifier — it moves with the seed. The sentence is.)

* **IT IS A REGRESSION AND THE BISECT NAMES THE COMMIT.** Three compilers, each rebuilt from
  its own commit's sources rather than from a shared artifact: `6ac49ac9` (#1951, 1,437,150
  bytes — the size that PR itself reported, so the seed is self-verifying) RUNS this program
  and prints `7`; `2ea654d2` (#1952, 1,437,704 bytes) and `8bf0f20f` (1,438,562 bytes) are
  both check-clean invalid wasm. So #1952's mv find/mint rewrite turned a running program
  silent, in the direction that matters most.
* **ITS OWN GRID COULD NOT SEE IT, WHICH IS THE REUSABLE PART.** #1952 reported 0 loud→silent
  and 0 runs lost over a 770-cell grid — truthfully, because that grid had no MAP-VALUED
  container. This is 96 cells of the 9,450-cell D52 grid, every one `cont=mapval`, spread
  across all three routes and both declaration orders. A grid grades only the axes it varied;
  when a closing change leaves no residue of its own, re-grade an EARLIER change's grid
  against today's master. That is how this was found and it is a sixth source to add to the
  list `tests/vl_check_codegen_test.ts` keeps.
* **THE TWIN IS THE AXIS AND IT TURNS A LOUD FLOOR OFF** — D63's signature, one container
  over. Delete `type Dot` and the same program is the LOUD `emitProgram: only i32, i64, f64,
  f32, boolean, struct, union, array, or string parameters are supported`.
* **IT IS NOT THE ANNOTATED-MAP PATH.** Annotate the local `const c: {[string]: Circle} =
  Map()` and the outcome is a DIFFERENT loud floor — `emitProgram: unsupported map value type
  (no rep for a union-member struct …)` — on `6ac49ac9`, on master and on the branch alike.
  Run the repro verbatim; the annotated spelling is a different program.
* **NOT FIXED BY THE CHANGE THAT FILED IT, ON PURPOSE.** The mv find/mint sites are the region
  #1952 rewrote and the region D47 (the inline map-annotation spelling of an arm-valued map)
  is open in; the D75/D81/D82 work this row ships beside is the struct/variant PIN seam and
  moves none of these 96 cells in either direction (measured: 96 silent on both sides).
* **IT SURVIVES #1954**, which had to be checked because that PR closed D47/D50 in this very
  region: on `922d52eb` the repro is the same sentence at a different offset (1162 -> 1214),
  which is exactly why the row's identifier is the sentence and not the offset.
* Pinned as `tests/cases/soundness/xfail-miscompile-arm-valued-map-local-into-map-param.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.
* **CLOSED 2026-08-26 (#1956), AND THE CONTROL THAT DECIDED IT FLIPPED UNDER THE ROW.** When
  this was filed, annotating the map local (`const c: {[string]: Circle} = Map()`) was a
  DIFFERENT loud floor — which is exactly what said "not the destination channel, leave it to
  the mv seam". #1954 then taught the arm-valued map to lower under the inline spelling and
  that same control began to **RUN**. Re-measured rather than inherited, and the answer
  reversed: with the annotated spelling working and the un-annotated one silent, this is the
  ordinary shape of `synthDstPinAnn`'s family — an annotation the producer never saw.
* **TWO HELPER WIDENINGS, NO NEW LEG.** `armPinAnnName` accepts a MAP whose VALUE names an
  arm (the third container beside the bare arm and the ref-list of one); `armPinLitInit`
  accepts a bare `Map()` / `Set()`, by the rule its own header states rather than by
  resemblance — an EMPTY map commits no value rep at its initializer, so its slot is chosen
  by later use and an annotation can re-aim it without contradicting a decision made
  elsewhere. A map-RETURNING call is not admitted, which is why the test is the constructor
  NAME and not `exprMap`.
* **MEASURED, NOT ESTIMATED, BECAUSE BOTH HELPERS ARE SHARED** with `synthRetPinAnn` and all
  four legs: 76 of its own 96-cell family move to `runs`; **0 cells of the 3,144-cell grid
  move at all** (0 outcome, 0 message); the 9,450-cell D52 grid goes 278 -> 50 silent with
  330 moved and 0 backward; and the corpus is 1,868 of 1,868 byte-identical. Inert wherever
  it is not the answer, which is what said it belongs inside this change rather than beside
  it.
* **THE 20 IT DOES NOT REACH ARE A DIFFERENT ROOT AND ARE FILED AS D88** — `route=gen` only,
  and every control that separates the neighbours is inert on them.
* Its pin is DELETED and graduates to
  `tests/cases/unions/arm-valued-map-local-into-map-param.vl`; `INVALID_MODULE_SRC` moves to
  D88 below.

---

### D99 — [CLOSED 2026-08-26] a VARIANT-typed PARAMETER re-bound to a LOCAL and returned from an un-annotated function, beside an EXACT layout twin
**CLOSED 2026-08-26 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-26 by the D45/D51/D53/D58 ablation grid, as the ONLY silent cells that 434-cell grid held (2 of them, `local` and `alias`) · pre-existing and byte-identical on master `8bf0f20f` and on all four single-fix ablation compilers**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mk(c: Circle) {
      const o = c
      return o
    }
    print(mk({ r: 7 }).r)
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 176:
    //   type mismatch: expected i32, found (ref $type)
    // (Offset quoted against a seed rebuilt from master `8bf0f20f`'s own sources, 1,438,562
    //  bytes; the `alias` spelling — one more `const p = o` — is the same message at 183.)

* **THE TWIN ROUTES AROUND A LOUD FLOOR, which is D63's sentence one storage class over.**
  Delete `type Dot` and the same program is the LOUD `emitProgram: field access but no struct
  type declared`; give the twin a same-arity DIFFERENT field name (`type Dot = { q: i32 }`) and
  it is the LOUD `emitProgram: field access receiver is not a struct`. Both controls measured
  one file each on master. So the exact layout twin is required and it is strictly worse than
  the floor it replaces.
* **THE `direct` SPELLING ALREADY RAN**, and the gap between it and this one is the whole row:
  `function mk(c: Circle) { return c }` is D52's `exprVariantIndex` return-EXPRESSION rung
  (#1951), and ONE binding hop was enough to leave that ladder. The RESULT-annotated spelling
  ran too (D39).
* **THE COMPLEMENT WAS ALREADY WRITTEN AND EXPORTED — the eighth rung of that family.**
  `criClassify`'s returned-local block calls `structIndexOfLet` for the struct half and called
  only `letAnnVariantIdx` — the ANNOTATION alone — for the variant half, while
  `variantIndexOfLet` is `structIndexOfLet`'s arm-for-arm twin (annotation, then
  `exprVariantIndex` of the initializer) with no caller on this path. Asked FIRST, which is
  load-bearing and is D57's measured ordering rather than a symmetry: `structIndexOfLet` falls
  through to `structIndexOfExpr`, whose non-kind-gated legs resolve the variant parameter to
  the TWIN's struct row, so storage class has to beat a structural twin.
* Safe by `exprVariantIndex`'s own documented property rather than by inspection: every arm of
  it is REP-AUTHORITATIVE, and it carries no object-literal field-set leg — so a bare
  `return { r: n }` is still not answered there and still falls to the struct arm, where `Dot`
  is the right answer when `Dot` is what the program means. `letAnnVariantIdx` stays in front
  of it so D52's `Circle | null` coverage is unchanged.
* **6 GRID CELLS: 4 `loud emit reject` → `runs` and 2 `check-clean invalid wasm` → `runs`.**
  It is the only one of the five candidates in that ablation whose moves include a silent
  outcome, and it takes the grid's silent total to 0. Pairwise-disjoint from all four others.
* Graduated: `tests/cases/unions/variant-param-local-return-beside-layout-twin.vl` (one hop,
  two hops, the no-local row that already ran, and the annotated control).

---

### D100 — [CLOSED 2026-08-26] an INLINE-SHAPE parameter where TWO declared structs share that layout
**CLOSED 2026-08-26 — the repro now RUNS and prints `7`. Was: loud emit reject · found 2026-08-26 by the D53 close's own grid, as the 9 cells that close does NOT move (`plaintwin` x direct/local/alias x ret/retann/read) · pre-existing and IDENTICAL on master `8bf0f20f`, on the D53 branch and on `764ad0dd` · NOT silent, and filed because it is the exact boundary of D53's fix**

Repro:

    type Circle = { r: i32 }
    type Dot = { r: i32 }

    function mk(c: { r: i32 }) {
      const o = c
      return o
    }

    print(mk({ r: 7 }).r)
    // vl check rc 0 (no diagnostics at all); vl run:
    //   emitProgram: ref valtype with no interned shape

* **TWO ONE-LINE CONTROLS, EACH RUNNING, AND THEY BRACKET THE AXIS.** Give the second struct a
  DIFFERENT field name (`type Dot = { q: i32 }`) and it prints 7 — that is D53, closed. Spell
  the parameter `c: Circle` and it prints 7. So the trigger is the COUNT of declared rows with
  this layout, not the presence of one.
* **IT IS D39'S SHAPE, NOT D53'S, AND THAT IS THE WHOLE ROW.** D53's fix is `repSlotOfTy`'s
  structural→declared BRIDGE, which by construction answers only when the twin is UNIQUE
  (`repSlotKeyN[key] == 1`). Two rows and it declines — correctly: `Circle` and `Dot` are two
  equally valid readings of `{r:i32}` and nothing at a resolver's position can separate them.
  This is the case D39 needed a CHANNEL for, one storage class over.
* **THE INFORMATION EXISTS AND IS DISCARDED, which is where a channel would go.**
  `internInlineShapeTy` ends in `annShapeIndexOf`, which PICKED a row when it deduped this
  annotation — nothing records WHICH, so the answer cannot be read back at query time. A
  sidecar keyed by the annotation node (the shape `sTyIx` / `recordSRowDeclOfName` already take
  for the rows they mint) is the reachable neighbourhood.
* Worth checking first, and NOT checked here: `sTwin` merges exact layout twins onto ONE heap
  type, so if `Circle` and `Dot` are `repStructSlotsTwin` the two answers emit the same module
  and a "first row wins" rule would be sound without a channel at all. That is a measurement,
  not an argument — `structIndexOfLet`'s arena rung carries the same caveat and names
  `repStructSlotsTwin` (the CONJUNCTION, not `structFieldCodesEq` alone) as the predicate to
  ask.
* Ranked below D99: it is LOUD at every cell, on both sides, and no spelling of it is silent.

#### The close (2026-08-26, #D100)

**IT IS NOT D39's CHANNEL. THE ROW NAMED THE MEASUREMENT THAT REFUTES IT AND DID NOT TAKE
IT.** The bullet above reads *"Worth checking first, and NOT checked here: `sTwin` merges
exact layout twins onto ONE heap type, so if `Circle` and `Dot` are `repStructSlotsTwin` the
two answers emit the same module and a 'first row wins' rule would be sound without a channel
at all. That is a measurement, not an argument."* Taken, with a probe at `repSlotOfTy`'s
declining rung on the filed witness:

    N=2 rows=Circle(0/rep0) Dot(1/rep0)[twin0=1]

Both rows carry `repStructSlotRep` **0** and `repStructSlotsTwin(0, 1)` is **1**. The two
"equally valid claimants" are ONE WasmGC heap type, so there is no answer to choose between
and nothing for a channel to carry. What declined was a UNIQUENESS TEST STRONGER THAN
SOUNDNESS NEEDS — `repSlotKeyN[key] == 1` asks for a unique ROW where the question is a
unique HEAP TYPE — and the predicate that asks the weaker one was already written, exported
and documented "queryable PAIRWISE (independent of `buildStructTwins` having run)".

**SO IT IS THE COMPLEMENT PATTERN, NOT THE CHANNEL PATTERN, AND THAT IS THE REUSABLE PART.**
Two of today's three patterns look identical from a resolver's seat: "two claimants, only
context separates them" and "one answer, nobody called the function that knows it". The
discriminator is not the count of claimants — it is whether the claimants DIFFER IN THE
OUTPUT. Here they do not, and the row's own filed verdict was wrong for the whole day it
stood. A row that names its own refuting measurement should have it taken before the row is
scheduled, not after the fix is designed.

* **THE PREDICATE IS THE CONJUNCTION THE ROW NAMED**, not `structFieldCodesEq` alone:
  `repStructSlotsTwin` is the `slotCanonId` key AND the field-code layout guard. Asked
  against the bucket's FIRST (smallest) row, which is what makes the accepted answer that
  row — if every member is a twin of the smallest, `repStructSlotRep` of every member IS the
  smallest, so the choice is deterministic and agrees with the `$fnsig` canonicalization.
* **GENUINE AMBIGUITY STILL DECLINES**, and that arm is kept rather than removed: two rows
  sharing a canonical key but NOT a layout — the atom-vs-plain collision `repRowOfTyStruct`
  refuses to guess through — fail the guard and the bridge answers -1 exactly as before.
  Nothing reaches the VARIANT namespace either: D53's caller still gates on
  `variantIndexOf(ty.tyName) < 0`, so the D63/D75 collapse is unreachable from the widened
  rung too.
* **ORDER WAS CHECKED, NOT ASSUMED.** The new column (`repSlotKeyFirst`) is arena-only and
  is filled in the same loop as the two existing ones, so it cannot see a later `sNames`
  growth that they do not; the twin test itself runs at QUERY time over row-local tables
  (`sFieldCount` / `sFieldTypes` / `sFieldElemName`), never inside the cache build, so no
  field-code answer is frozen at an epoch where the codes are not yet filled.
* **18 GRID CELLS, every one `loud emit reject` → `runs`, 0 in any other direction** —
  `plaintwin` x `inline` x `bare` x all three routes x direct/local/param/paramlocal/retann
  x `ann0` x both declaration orders. Pairwise-DISJOINT from D88 (intersection 0), and the
  union of the two singles is set-identical to the full branch.
* **AND 18 MORE MOVED LOUD → A DIFFERENT LOUD, which no outcome-class count can see.** The
  `ann1` siblings stop reporting the positionless `ref valtype with no interned shape` and
  start reporting an anchored `emitProgram: binding's inline-shape type has an unsupported
  field`. That second sentence is a THIRD resolver asking D53's question — filed as D111 —
  and it is graded WIDER than this row, so it is not this row's residue.
* Graduated: `tests/cases/structs/inline-shape-param-beside-two-declared-twins.vl`
  (D53's own six-row delivery chain, so the two fixtures are comparable).

---

### D101 — [CLOSED 2026-08-26] a `| null` LITERAL UNION still takes D45's corrected sentence, because the arm is on `TyUnion` and the spelling is a `TyNullable`
**CLOSED 2026-08-26 — the repro RUNS and prints `true`. The `==` ladders grew the arm the emitter's own wrapper ladder already had, at THREE rungs: `isEquatable` (soundness), `eqCmpKindOfArrayElem` (the list core, 1-D and 2-D) and `emitStructEqFieldInner` (field codes 21/30 join the `i32.eq` scalar arm). The `boolean | null` TWIN had the identical divergence and moved with it. Was: loud check reject · found 2026-08-26 by the `std-api-reviewer` pass over D45's close, checking a coverage claim in that close's own comment · pre-existing and IDENTICAL on master `8bf0f20f` and on D45's branch · NOT silent, and filed because a comment said it was covered**

Repro:

    type K = "a" | "b"

    function cell(): boolean {
      const a: (K | null)[] = ["a"]
      const b: (K | null)[] = ["a"]
      return a == b
    }

    print(cell())
    // vl check rc 1, TWO errors:
    //   (K | null)[] isn't equatable (a field is not value-comparable) — compare a projection
    //     whose components are value-comparable, and only one that no two distinct values share
    //   `==` over (K | null)[] has no lowering

* **THE FIRST SENTENCE IS WRONG HERE FOR EXACTLY D45's REASON.** A `K | null` is the interned
  atom with the spare `-1` for null — ONE i32 cell, no field — so a list of them is the same
  i32 list `K[]` is, and D45 closed that shape. This one it does not reach: `K | null` resolves
  to a `TyNullable`, INLINE and through an alias (`type L = K | null`) alike, and D45's arm is
  on `TyUnion`. Measured at both spellings, both sentences.
* **THE `+` TWIN ALREADY RUNS**, which is the same divergence D45 was filed to close, still open
  one shape over: `(K|null)[] + (K|null)[]` prints `3` while `(K|null)[] == (K|null)[]` is
  refused for "a field that is not value-comparable" about the same cell.
* **A DRAFT OF D45's `isEquatable` COMMENT CLAIMED THIS AS COVERED** — "`tyUnionAllLits` covers
  the `| null` member too (the atom's spare `-1`)" — and the claim never fired. The sentence is
  deleted and this row filed in its place, which is the difference between a fix and a fix's
  description of itself.
* Reachable neighbourhood: a `TyNullable` arm in `isEquatable` recursing for the SENTINEL family
  only (`boolean | null` is the i32 value 2 and `K | null` the atom's `-1`; every other nullable
  is a `(ref null …)` niche or a box, which is the split `concatElemIsI32Backed`'s `TyNullable`
  arm already makes), plus the matching element arm in `eqCmpKindOfArrayElem`.
* **IT IS THE CORPUS'S ONLY ASSERTION ON THE REMEDY CLAUSE**, and that is a constraint on
  whoever closes it: `tests/cases/std/error-array-needle-not-equatable.vl` carries this row
  precisely because it is the last shape printing BOTH sentences, and the directive must be
  MOVED to another two-sentence row rather than deleted.

**HOW IT CLOSED — THE COMPLEMENT WAS WRITTEN AND HAD NO CALLER ON THIS PATH.**
`tyScalarBackedListKind` in `emit_classify.vl` — the EMITTER's own wrapper ladder — has
answered `"list"` for `K[]`, `(K | null)[]` and `(boolean | null)[]` all along, off a
measurement its header records (a program binding all eight list spellings side by side gives
those three the same wrapper `i32[]` gets). The rep home `repOfNullable` decides the two
i32-sentinel niches off `tyIsLitUnion` / the boolean prim; `tyIsNullableLitUnion` already
carried BOTH arena spellings of the atom one. So every fact the `==` home needed was already
written down, in the file next door, and the fix is the call. **Pattern 1 — the complement
already written**, the tenth rung closed on it.

* **TWO SENTINEL FAMILIES, NOT ONE.** The row names `K | null`; grepping for the OTHER
  spelling of the same rep found `boolean | null` with the identical divergence — `+` runs,
  `==` refuses with both sentences. Both are in the fix and both are pinned.
* **THE ROW'S OWN "reachable neighbourhood" NAMED TWO OF THE THREE RUNGS** — the `isEquatable`
  arm and the matching one in `eqCmpKindOfArrayElem`, both correct. The third is the one a
  prediction made from the repro could not see, because the repro is a LIST and the rung is a
  struct FIELD.
* **THE THIRD RUNG IS ONLY REACHABLE ONCE THE FIRST LANDS, and skipping it would have been
  invisible to an outcome count.** `{ f: K | null } == …` was a loud CHECK reject; teaching
  `isEquatable` alone would have moved it to `emitProgram: unsupported struct field type in
  equality` — loud to loud, no outcome class changed, and a severity downgrade for a shape
  that is soundly comparable. Field codes 21 and 30 are declared with the same `0x7f i32`
  storagetype code 0 is, so they join its arm and the cell RUNS.
* **RUNG THREE DOES NOT REACH A 2-D LIST FIELD, AND ONE CELL DID TAKE THE DOWNGRADE THE BULLET
  ABOVE SAYS WAS AVOIDED.** `{ f: (K | null)[][] }` and its `boolean | null` twin were a loud
  CHECK reject on master and are now `emitProgram: unsupported struct field type in equality` —
  the soundness gate learned the sentinel, the field-code arm is about a SCALAR field, and
  nothing in between covers a 2-D list one. Found by the `std-api-reviewer` pass over this
  close, by running a shape the fix's own grid did not carry; the bullet above is corrected
  rather than deleted because the 1-D cell it describes does run.
  **It is SYMMETRIC and it is the base type's own floor**, which is why it stands:
  `{ f: i32[][] }`, `{ f: K[][] }` and `{ f: boolean[][] }` give that identical sentence on
  BOTH seeds, so the sentinel now agrees with the type it niches into — D102's "one rule, both
  directions" arriving at the same answer from the other side. Recorded in `std/array.vl`'s
  field-ladder scope line too, because the cell is reachable from `indexOf`.
* **FOUR SPELLINGS OF THE ATOM SENTINEL, NOT TWO, AND THE FIRST GRID CONTAINED HALF OF THEM.**
  The row names the two-part form (`K | null` inline, and through an alias) — a `TyNullable`.
  The EXPANDED form `"a" | "b" | null`, written inline and through an alias, is a `TyUnion`
  with a null member: a different arena shape for the same rep, which `tyIsNullableLitUnion`
  already carried and which a grid built from the row's own two spellings could not contain.
  It moves too (`runs`, correct answers), and had the fix missed it the first grid would have
  reported the row closed with half its surface untested. **`std/array.vl`'s twentieth ledger
  entry — "a population measurement is only as wide as its axes" — self-inflicted and caught
  by widening rather than by a gate.** The un-annotated `["a", null]` is NOT a fifth spelling:
  it infers as `(string | null)[]`, the ref niche, and is refused on both sides — measured,
  because `tyIsNullableLitUnion`'s own header cites that spelling as the expanded form's
  source.
* Grid: **245 shape cells** (37 type spellings x 7 operation shapes), **42 moved: 32 forward,
  10 into D117's artifact** (see below). Ablated to this row alone: **32 outcome cells, 34
  counting message-only moves.** 1,568-cell pair grid: **12 moved, all `loud check reject` →
  `runs`, 0 backward.** Every newly-running cell is graded on its ANSWER and every one is
  correct, including `null`-vs-value and LENGTH.
* **THE 10 "BACKWARD" CELLS ARE THE PROBE'S VALUE, NOT THE FIX, and both readings were run.**
  Every one is a 2-D cell whose second value is a bare `[[null]]` — which is a loud
  `emitProgram` on master with no `==` in the program at all (D117, filed below). The `==`
  refusal had been masking it; closing the refusal lets the program reach emit. Re-run with a
  NON-null second value, the same 8 rows are `loud check reject` → **`runs`** and answer
  correctly. So the cells are loud→loud on programs that are independently unbuildable, and
  **0 cells moved to any silent outcome, 0 lost the ability to run, 0 produced a different
  value.**
* **D45's TRAP DID NOT REPEAT, and the reason is D45's own fix.** `(K | null)[] == string[]`
  is the exact analogue of the cell that made D45's first draft emit invalid wasm. It is LOUD
  here, in `eqRefusals`' core-pair sentence — because that rule refuses on differing CORES and
  the widening flows through it. The predecessor's fix is what made the successor safe.
* Graduated: `tests/cases/literal-unions/nullable-litunion-list-equality.vl` (the
  compiler-side pin, importing nothing — both sentinel families, both spellings of each,
  `!=`, LENGTH, the struct FIELD, and the `+` twin kept beside the `==` it diverged from) and
  the eight `(K | null)` / `(boolean | null)` rows added to
  `tests/cases/std/array-litunion-list-needle.vl` (all four `needle: T` exports at both
  sentinels, each pinned to a different answer). **The full-clause directive MOVED, as this
  row required** — from `(K | null)[]` to `(N | null)[]`, the numeric twin whose spelling is
  identical and whose rep is a value-union BOX, so the two adjacent rows now state the
  boundary rather than merely occupy it.

---

### D102 — [CLOSED 2026-08-26] a list `+` over an `f64`-backed LITERAL UNION is check-clean invalid wasm
**CLOSED 2026-08-26 — now a loud check reject, and the win direction is loud rather than runs because `f64[] + f64[]` is itself a loud check reject: there is exactly ONE concat core (`emitListConcatI`, hard-wired to `$lTypeIdx`/`$aTypeIdx`), so the literal spelling now says what its own BASE type says. THE ROW WAS ONE ARM TOO NARROW — three spellings were check-clean invalid wasm, not one. Was: check-clean invalid wasm · found 2026-08-26 by the `std-api-reviewer` pass over D45's close, checking the `+` home cited as that close's authority · pre-existing and IDENTICAL on master `8bf0f20f` and on D45's branch, same offset and same sentence**

Repro:

    type F = 1.5 | 2.5

    function cell(): i32 {
      const a: F[] = [1.5]
      const b: F[] = [2.5]
      const c = a + b
      return c.length
    }

    print(cell())
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 255: type mismatch: expected i32, found (ref $type)
    // (Offset quoted against a seed rebuilt from master `8bf0f20f`'s own sources, 1,438,562
    //  bytes; identical on the D45 branch.)

* **THE `==` SIDE IS THE ONE THAT GOT THIS RIGHT, WHICH IS THE REVERSAL WORTH NOTING.** D45's
  close cites `concatElemIsI32Backed` / `tyUnionAllLits` as the complement that "had accepted
  this family all along" — and it accepts too much: `tyUnionAllLits` admits EVERY literal base,
  so an `f64`-backed union is claimed as an i32 list. `eqCmpKindOfArrayElem` splits by backing
  and refuses `F[] == F[]` loudly; `+` does not and writes a bad module.
* **THE STRING AND i32 HALVES ARE FINE**: `K[] + K[]` and `(1|2)[] + (1|2)[]` run, and so does
  `(K|null)[] + (K|null)[]` (prints 3) — so the fix is a split, not a retreat, and the
  `| null` member has to stay accepted.
* The `+` home's header states "DEFAULTS TO ACCEPT, deliberately… a rule that over-refuses
  removes a capability, and every rep it does refuse below was RUN at both spellings first."
  That convention is why this is filed rather than folded into D45: narrowing it is a change to
  a DIFFERENT operator with its own population to measure, and D45's own lesson is that a
  population measurement is only as wide as its axes.
* The one-line shape of the fix, named so the next reader does not re-derive it: give
  `concatElemIsI32Backed`'s `TyUnion` arm the same backing split `eqCmpKindOfArrayElem` now
  has (`tyIsLitUnion`, or `numLitUnionBaseName == "i32"`), keeping the `TyNullable` arm's
  sentinel rule as it is. Expected direction: check-clean invalid wasm → loud, which is the
  same trade D57's stage D made.
* The comment at `concatRefusal`'s header that asserted the opposite ("`eqCmpKindOfArrayElem`
  is NOT that set") is corrected on D45's branch and names this row.

**HOW IT CLOSED — AND THE ROW'S OWN ONE-LINE FIX WOULD HAVE CLOSED ONE THIRD OF IT.**
The row named the `TyUnion` arm. `concatElemIsI32Backed` over-accepts at **three** arms, and
the element axis run cell by cell says so:

    element spelling            master                 branch
    type F = 1.5 | 2.5          INVALID WASM (off 332) loud check `+` over F[] has no lowering
    type G = 1.5                INVALID WASM (off 332) loud check `+` over G[] has no lowering
    type BIG = 9999999999       INVALID WASM (off 337) loud check `+` over BIG[] has no lowering
    type I = 9999999999 | 1     loud emit              loud check
    type M = "a" | 1            loud emit              loud check
    (N | null)                  loud emit              loud check
    (F | null)                  loud emit              loud check
    i32 · boolean · K · N · H="a" · J=1 · (K|null) · (boolean|null)   runs -> runs, same values

`type G = 1.5` and `type BIG = 9999999999` are the **`TyLit` arm** (`if e is TyLit { return
true }`), not the union arm — and `BIG[]` fails at a DIFFERENT offset with a DIFFERENT sentence
(`expected (ref $type), found (ref $type)` rather than `expected i32, found (ref $type)`), so
it is not the same cell wearing another name. The `TyNullable` arm was over-broad too: it asked
`tyUnionAllLits` of the inner, which admits the NUMERIC litunions, and `repOfNullable` niches
only the STRING one.

**THE OFFSETS ABOVE ARE THE ELEMENT-AXIS PROBE'S OWN PROGRAMS, NOT THIS ROW'S REPRO**, and the
distinction matters because an offset is a property of the module: every cell in that table is
the same four-line body under one shared nine-line prelude, which is what makes 332-vs-337
comparable at all. This row's own two-line repro is offset **255**. All quoted against a seed
rebuilt from master `8d070d46`'s own sources, **1,449,387 bytes** — never the shared
`build/vl-compiler.wasm` — and re-run there after merging: every offset and every sentence in
the table is unchanged from the `764ad0dd` measurement, so #1957 is orthogonal to this row.
The SENTENCE is the identifier; the offset only separates F/G from BIG within one program
shape.

* **THE WIN DIRECTION WAS CHECKED, NOT ASSUMED.** `f64[] + f64[]` and `i64[] + i64[]` are loud
  check rejects written directly, and `emitListConcatI` is hard-wired to the i32 wrapper — so
  the `+` OPERATOR has no lowering for an f64-backed literal union, and giving it one would
  need a new concat core, which is `f64[]`'s capability and not this row's. Loud is the CORRECT
  loud: D45 made `K[]` say what `i32[]` says (runs); D102 makes `F[]` say what `f64[]` says
  (loud). One rule, both directions.
* **"THE OPERATOR", NOT "THE TYPE" — AND THE FIRST DRAFT OF THE BULLET ABOVE SAID THE WRONG
  ONE.** It read "an f64-backed literal union cannot legitimately concatenate", which a
  ten-line program falsifies: `std:array`'s `concat` is an ordinary `push` loop over `T`, so it
  inherits the element's own storage instead of assuming one, and `a.concat(b)` over two `F[]`
  lists prints `2 / 1.5 / 2.5` — on this branch AND on master. Found by the `std-api-reviewer`
  pass over this close. What this row removes is a spelling that wrote a bad module; the
  CAPABILITY was never absent, and after this change `concat` is the only working spelling for
  those element types, which `concat`'s own doc block now says.
* **NARROWING A "DEFAULTS TO ACCEPT" PREDICATE NEEDS THE OTHER DIRECTION MEASURED**, and it
  was, per cell: the eight spellings that ran still run and still read back the same VALUES —
  a `.length` check alone would not have caught a concat that wrote the right count into the
  wrong backing. `tests/cases/literal-unions/litunion-list-concat-backing.vl` is that accept
  set written down, so a later over-refusal goes red instead of quietly removing a capability.
* Ablated on the 245-cell grid: **10 outcome cells, 20 counting message-only moves.**
  **The intersection with D101 is EMPTY at both grades and the union of the two singles is
  set-identical to the branch at both grades — so this is TWO ROOTS, and the discriminator
  is that D101-only leaves both invalid-wasm cells standing while D102-only leaves the
  `runs` count unmoved at 84.** One under-accepts on `==`, the other over-accepts on `+`;
  they share two predicates and no cells.
* `tyUnionAllLits` has no caller left and is deleted. The `+` and `==` homes now share
  `tyLitUnionIsI32Backed` and `tyIsI32SentinelNullable`, so the two operators can no longer
  answer differently about the same cell — which is the drift both headers exist to prevent
  and which each of them had reproduced once.

---

### D117 — [CLOSED 2026-08-27] an ALL-`null` INNER array literal under a NESTED niche annotation
**CLOSED 2026-08-27 — the repro RUNS and prints `1`. Was: loud emit reject · found 2026-08-26 as D101's closing residue, by the probe VALUE its shape grid used · pre-existing and IDENTICAL on master `764ad0dd`, on master `8d070d46` after the merge, and on D101's branch at every one of fourteen cells · NO `==`, NO `+`, NO generic, NO import, two lines**

Repro:

    type K = "a" | "b"
    const c: (K | null)[][] = [[null]]
    print(c.length)
    // vl check rc 0; vl run:
    //   emitProgram: bare null needs a struct-typed context

* **THE OUTER ANNOTATION DOES NOT REACH THE INNER LITERAL, and the inner literal has nothing
  else to infer from.** One member changes it: `[["a", null]]` RUNS and prints 1, because the
  non-null member types the inner literal and the `null` then coerces to that element's niche.
  So the axis is ALL-`null` inner, not `null`-anywhere, and it is the seeding of the inner
  literal's element type rather than the niche itself.
* **IT IS THE THREE NICHES AND NOT THE BOXES**, which is the discriminator worth recording
  because it is the opposite of what the sentence suggests. Measured, one file per cell:
  `(K | null)[][]` (the atom sentinel), `(boolean | null)[][]` (the i32 sentinel 2) and
  `(string | null)[][]` (the ref niche) are all loud; `(i32 | null)[][]` and `(S | null)[][]`
  both RUN. The fallback the emitter reaches when nothing seeded the element is a
  struct-typed null, which the two BOX/struct shapes can absorb and the three niches cannot.
* Every 1-D form RUNS — `(K | null)[] = [null]`, and the same for all five inner types — so it
  is the NESTING and not the bare `null`. `(K | null)[][][] = [[[null]]]` reproduces, so it is
  not a depth-2 special case either.
* **THE ONE-LINE WORKAROUND, and it is what two fixtures in this change use**: bind the inner
  list to an ANNOTATED local and put the local in the outer literal
  (`const r: (K | null)[] = [null];  const c: (K | null)[][] = [r]`) — RUNS. That is also the
  evidence the emitter can lower the value perfectly well once the element type is known.
* **NOT MOVED BY D101, and the fourteen-cell control set says so at every cell** — identical
  outcome and identical sentence on master `764ad0dd` and on the branch that filed this. D101
  merely made it REACHABLE in a shape grid: `[[null]] == [[null]]` had been refused at `vl
  check` for a different reason, and closing that refusal let the program get as far as emit.
  A grid whose 2-D nullable rows used a bare `null` as their second value therefore reads 8
  cells as `loud check` → `loud emit`; with a non-null value the same 8 rows are `loud check`
  → `runs`. The probe VALUE decided which of those two a reader would have seen, which is why
  both were run.
* Reachable neighbourhood: the array-literal element seed. `exprArray` pins an empty `[]` from
  its annotation and the 1-D nullable forms are seeded correctly; the NESTED case is where the
  outer annotation's element type is not pushed into the inner literal's own pin. The same
  emitter floor is reached by several unrelated shapes (`per-rep-ladder-audit`,
  `rep-fuzz-findings`, and #1806's `u8[] | null`), so a fix here should be scoped to the
  literal seed rather than to the floor's message.
* **CLOSED, AND THE SEED IS WHERE THE ROW PREDICTED — but the missing complement is one
  function earlier than "the array-literal element seed" suggests.** The inner literal's
  build kind is not threaded at all; what is missing is its RECORDED TYPE.
  `assignableExpr` short-circuits on `assignable(srcTy, dstTy)` before the literal-aware
  adoption block, and `null[][]` IS covariantly assignable to `(K | null)[][]`, so the
  inner `[null]` keeps its self-inferred `null[]`. `recordElemRepArrayLit` is the
  function that exists to run ABOVE that short-circuit for exactly this reason — its own
  header says so — and it already DESCENDS into an ObjLit's FIELD values for the sibling
  container (`{f: [null]}` against `{f: (K | null)[] | null}`). The ARRAY destination has
  the identical short-circuit and never grew the matching ELEMENT-wise descent. Adding it
  (same `depth - 1` bound, same `tyDeeperThan` recursion guard as the field-wise walk) is
  the whole fix, and it serves every storage class at once because `assignableExpr` is
  the one seam a binding / argument / return / field / element all flow through.
* **THE MECHANISM SENTENCE, WITH THE TABLE THAT PROVES IT.** Instrumented at the reject —
  every seed in `emitNullLitNode`'s null-rep table plus the ref-list ELEMENT row the outer
  literal resolved:

      (K | null)[][]        PLK=0 PLU=0 PNLU=0 PNB=0 PSI=-1  [rslot=0 nest=4 nul=0 nm=i32[]]
      (boolean | null)[][]  PLK=0 PLU=0 PNLU=0 PNB=0 PSI=-1  [rslot=0 nest=4 nul=0 nm=i32[]]
      (string | null)[][]   PLK=3 PLU=0 PNLU=0 PNB=0 PSI=-1  [rslot=0 nest=6 nul=0 nm=string[]]
      (K | null)[][][]      [rslot=1 nest=9 nm=(K|null)[][]] [rslot=0 nest=4 nul=0 nm=i32[]]

  The element row is interned under its REP name, so `i32[]` FOLDS the three i32-backed
  inner lists (`i32[]`, `(boolean|null)[]`, `(K|null)[]`) onto element kind 4 and
  `string[]` folds two more onto kind 6 — and `elemNest` is all the seed at
  `emitArr`'s ref-lit element loop reads. The row's arena sidecar `rlElemTyIx` still knows;
  seeding from the RECORDED TYPE upstream means nothing here has to.
* Graduates to `tests/cases/arrays/nested-niche-all-null-inner-literal.vl` — the three
  niches, the inline and EXPANDED (`"a" | "b" | null`, a `TyUnion` rather than a
  `TyNullable`) litunion spellings, depths 2 and 3, five storage classes, and the two
  BOX/struct controls that ran on master and must keep running.

---

### D88 — [CLOSED 2026-08-26] an ARM-VALUED MAP handed to a hand-written GENERIC
**CLOSED 2026-08-26 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-26 as D87's own closing residue — 20 of that row's 96 cells · pre-existing on `933e2cbf` and `764ad0dd` with the same sentence, so NOT a regression from the change that filed it · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D112**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function idg<T>(x: T): T { return x }
    function thru(x: {[string]: Circle}) { return x }
    function mk(n: i32) {
      const c = Map()
      c["k"] = { r: n }
      return idg(thru(c))
    }
    print(idg(((mk(7))["k"] ?? { r: 0 }).r))
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)
    // (The offset moves with the seed — 1234 on `933e2cbf`, 1236 on the branch that filed
    //  this. The sentence is the identifier.)

* **THE GENERIC HOP IS THE AXIS AND IT IS THE ONLY ONE.** Three controls, all measured on
  the tree this was filed from, and the two that would place it in a neighbouring row are
  both INERT:

      delete `idg`, call `thru(c)` directly       RUNS           <- the axis
      delete `type Dot` (the layout twin)         still silent   <- NOT the twin family
      annotate the local `: {[string]: Circle}`   still silent   <- NOT D87's channel

* **SO IT IS NEITHER OF ITS NEIGHBOURS, AND THAT IS WHY IT IS ITS OWN ROW.** D75/D82 is a pin
  resolved onto a layout twin's `sNames` row — no twin is needed here. D87 is an
  un-annotated map local that never saw its destination's annotation — annotating it does
  not help here. What is left is the MONOMORPHIZER meeting an arm-valued map:
  `monoArgTyName`'s map arm names the argument by its `{[K]: V}` spelling (`nodeTyMapName`),
  and the instance it mints does not agree with the caller about the VALUE's heap type. That
  is the same layer D75/D82 were fixed in, one container out, and the fix there was an
  un-called complement — so the first question to ask is whether the map layer has one too.
* Reachable neighbourhood: `monoArgTyName`'s `nodeTyMapName` arm, and the mv-slot resolvers
  the instance's parameter is typed through.
* Pinned as `tests/cases/soundness/xfail-miscompile-arm-valued-map-through-generic.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.

#### The close (2026-08-26, #D88)

**THE PIN RENDERS THE ARM STRUCTURALLY, AND THE COMPLEMENT WAS ALREADY WRITTEN ONE CONTAINER
OVER.** `monoArgTyName`'s map arm names a generic's argument with `nodeTyMapName`, which is
`tyToEmitName` of the CHECKER's recorded type — and that renderer's nominal-first rung is
`structNameOfTy`, which a declared union ARM cannot satisfy, because `collectS` SKIPS a
`type X = {…}` that is a union member and the arm has no `sNames` row. So an instance whose
every other channel calls the parameter `{[string]: Circle}` was cloned with the annotation
`{[string]:{r:i32}}`.

**PROBED AT BOTH ENDS RATHER THAN REASONED TO** — at `collectA`'s map arm and at the mv mint,
on the filed witness:

    {[string]:Circle}   armTy=40  slot=0     MINT slot=0 name=Circle   armH=0
    {[string]:{r:i32}}  armTy=68  slot=1     MINT slot=1 name={r:i32}  armH=-1

Arena index 68 is the RENDER's own fresh anonymous resolution, not `Circle`'s 40, so
`variantRowOfTy` correctly answers -1 ("resolved, and NOT an arm"), `mvArmKeyName`'s re-key
to the arm's own name never fires, and `collectA` mints a SECOND mv slot. Disassembled, the
module carries two map structs — the caller's vals list `(ref null $uVarHeap[Circle])` and
the instance's `(ref null ${r:i32})` — which is what "expected (ref $type), found (ref
$type)" is hiding: two different heap types behind one placeholder.

**THE MISSING COMPLEMENT IS A CONTAINER, NOT A RUNG.** `shapeNominalOfTy` is the arm-aware
nominal ladder — banked struct row, then `variantRowOfTy` by DECLARATION identity, then two
field-set scans — and it already recurses through `TyArray`, so a LIST element that is a
declared arm is spelled `Circle` wherever a consumer asks (`arrElemNominalOfTy` is that
consumer, written for D40). **The MAP is the one container the ladder never grew.**
`nodeMapArmNominalName` is that twin.

* **`variantRowOfTy` AND NOTHING ELSE**, which is the narrowing to keep. The ladder's two
  FIELD-SET rungs are structural, and a map value that is a plain declared struct is ALREADY
  correct — `tyToEmitName` finds its `sNames` row and spells `{[string]: Dot}` — so a
  structural rung here could only re-decide a cell that already works, which is the D33/D75
  collapse this seam is nominal to prevent. Measured: with the value spelled `Dot` instead of
  `Circle` the same program RAN on master.
* **THE KEY HALF IS SUBSTITUTED, NOT REBUILT.** Only the VALUE text changes; the key comes
  off `tyToEmitName`'s own render through the map grammar's home cut (`mapSpellKeyName`), so
  the pin is character-for-character the spelling an annotated `{[K]: Circle}` parameter
  carries — `monoScalarAnnName`'s exact-name safety property, which is what puts the instance
  on a path a NON-generic function already lowers end to end rather than beside it.
* **NOT AN ORDER (D58's pattern), AND THAT WAS CHECKED EXPLICITLY** because the row involves
  a generic: `collectU` is the FIRST entry in the pass table and `monomorphize` runs long
  after it, so `uVarTyIx` is populated and `variantRowOfTy` answers at the pin.
  `shapeNominalOfTy` is already consulted at this point in the pipeline
  (`nominalizeFnTypeOfTy`, D33) — the same rung reaching the same table one container over.
* **THE ROW'S OWN THREE CONTROLS RE-RUN ON `764ad0dd`, and the fourth is the one that
  fires.** Delete `idg` → ran even before (the axis). Delete `type Dot` → still silent (NOT
  the twin family). Annotate the local → still silent (NOT D87's channel). **Delete
  `type Shape = Circle | Sq` → RUNS** — the ARM-ness is the requirement, which is what
  `tyToEmitName`'s nominal-first rung says it should be.
* **24 GRID CELLS, every one `check-clean invalid wasm` → `runs`, 0 in any other direction**
  — `cont=mapval` x `route=gen` x `src=declname` x `decl` in {`arm`, `armtwin`, `armdiff`} x
  {`param`, `paramlocal`} x both annotations x both declaration orders. That `armdiff` moves
  is the twin control again: the twin is not required.
* **AND IT TAKES THE 9,450-CELL D52 GRID TO ZERO SILENT CELLS — 50 moved, 0 backward** — the
  first time that population has been empty. Master `764ad0dd` grades 50 silent there, which
  reproduces D87's own closing number exactly; all 50 are `decl=arm` x `cont=mapval` x
  `cons=pass` x `route=gen`. The 3,144-cell D75/D81/D82 grid moves **0 cells** (0 outcome, 0
  message), so the fix is inert wherever it is not the answer.
* Its pin is DELETED and graduates to
  `tests/cases/unions/arm-valued-map-through-generic.vl`; `INVALID_MODULE_SRC` moves to D112
  below, the first specimen in that genealogy with no declared type in it.


### D111 — [CLOSED 2026-08-27] an INLINE-SHAPE LOCAL beside a declared struct of that layout: D53's question at a THIRD resolver
**CLOSED 2026-08-27 — the repro RUNS and prints `7`. Was: loud emit reject · found 2026-08-26 by MESSAGE-diffing the D100 close, not by an outcome-class count — 18 cells move from a positionless sentence to this anchored one · pre-existing and LOUD on master `764ad0dd` at every cell, on both sides**

Repro:

    type Circle = { r: i32 }

    function mk(n: i32) {
      const c: { r: i32 } = { r: n }
      return c
    }

    print(mk(7).r)
    // vl check rc 0 — but NOT diagnostic-free: it emits the redundant-annotation HINT
    //   `c` is inferred as `{r: i32}` — remove it to lean on inference
    // which is the checker telling the author to write the exact spelling that RUNS.
    // vl run rc 1:
    //   emitProgram: binding's inline-shape type has an unsupported field

* **THE ONE-LINE CONTROL IS THE DECLARATION, exactly as in D53.** Delete `type Circle` and
  the program prints 7; spell the local `c: Circle` and it prints 7. The inline shape is
  supported — it is `annShapeIndexOf`-deduped onto `Circle`'s row — and the guard that
  rejects it is named for the case where it is not.
* **IT IS D53's MECHANISM AT A THIRD RESOLVER.** `internInlineShapeTy` ends in
  `annShapeIndexOf`, which dedups the inline shape onto the declared row and pushes NO
  `sNames` entry for `{r:i32}`, leaving `structIndexByName("{r:i32}")` with nothing to find.
  D53 taught `paramStructIndex` to fall through to `repSlotOfTy`'s structural→declared
  bridge. `letAnnIsUninternedShape` — the LOCAL-annotation twin, and a SOUNDNESS GUARD whose
  false side rejects — still ends in `structIndexByName(nm) < 0` and nothing else.
* **WIDER THAN D100, WHICH IS WHY IT IS ITS OWN ROW AND NOT THAT CLOSE'S RESIDUE.** Graded
  per `decl` level it fires at `plain` (ONE declared claimant) as readily as at `plaintwin`
  (two) and `armtwin`; it RUNS at `nodecl`, at `arm` (no plain struct of the layout) and at
  `armdiff`. D100's axis is the SECOND claimant; this row's axis is the first.
* **THE OBVIOUS WIDENING IS MEASURED AND IT IS REFUSED — this is the row's most useful
  content.** Falling through to `repSlotOfTy(nodeRepTyIxOf(d.letType))`, i.e. the same
  complement D53 called, was built and swept against the 2,850-cell D88/D100 grid: **64 cells
  move `loud emit reject` → `runs` and 19 move `loud emit reject` → `check-clean invalid
  wasm`.** All 19 are `route=gen` ∧ `ann1`, every one of them. So the guard is doing real work
  beyond the un-internable-field case it is named for: with it lifted, the local becomes a
  struct local whose row disagrees with the pin `monoArgTyName` mints for the same binding —
  D88's shape in the STRUCT container instead of the map one.
* Reachable neighbourhood, in the order the measurement implies: fix the mono PIN for an
  inline-shape-annotated local FIRST (the `{r:i32}` spelling resolving to a fresh anonymous
  index is the same divergence D88 closed one container over), then the guard's fall-through
  is inert in the generic route and the 19 become part of the 64. Doing the guard alone is a
  loud→silent trade and is not licensed.
* **NOT REACHABLE FROM D53's THREE GUARDS.** `annIsSpelledInlineShape` already establishes a
  literal `{…}` spelling, so the variant namespace is unreachable and no shape guard is
  needed; the generic-original guard does not apply either, because the binding here is not
  in a generic original at all — the generic is the CONSUMER.
* **CLOSED IN THE ORDER THIS ROW NAMED, AND THE ABLATION CONFIRMS THE ORDERING RATHER THAN
  ASSUMING IT.** The reachable-neighbourhood bullet above says "fix the mono PIN for an
  inline-shape-annotated local FIRST … then the guard's fall-through is inert in the
  generic route". Measured on a 1,710-cell grid (shape source x storage class x annotation
  depth x probe value x route x element type x declaration order), one compiler per
  candidate:

  | candidate | moved | -> `runs` | BACKWARD to silent |
  |---|---|---|---|
  | the mono PIN rung alone      |  8 |  8 | 0 |
  | the guard fall-through alone | 24 | 16 | **8** |
  | both                         | 32 | 32 | 0 |

  The two solo MOVED sets are DISJOINT and their union with D117's is set-identical to the
  full branch's (8 + 24 + 40 = 72). **So the composition is a DIRECTION and not a cell
  count** — which is exactly what a "union of the singles" check cannot say on its own. The
  full branch disagrees with the guard-alone compiler on precisely the 8 cells that compiler
  sends to `invalid_wasm`: `ann1` x `local` x `gen`, at every `decl` level that declares the
  layout at all, `armdiff` included. The pin's own 8 are `ann2` x `global` x `gen` — a
  MODULE-SCOPE nullable inline shape, where the guard, a `LetDecl` LOCAL classifier, never
  fires.
* **THE PIN'S COMPLEMENT IS ONE LINE BELOW WHERE IT WAS MISSING.** `monoAnnPinName`'s
  `monoCompositeListAnnName` rung claims a shape ELEMENT (`{r: i32}[]`, its
  `nameIsBraceSpanEnds` arm) and nothing claimed the bare `{r: i32}` one container in —
  the same `P` / `P[]` pair `monoStructAnnName` holds BOTH rungs of, missing its first.
  `isSName` cannot answer for the bare shape BY CONSTRUCTION, which is this row's own
  premise. The pin is the caller's OWN spelling, and it lands on a path that already
  works: `paramStructIndex`'s inline-shape rung is D53's fix.
* **DISASSEMBLED, NOT INFERRED FROM THE MESSAGE.** `type Circle = { r: i32 }` +
  `const c: { r: i32 } = { r: n }` + `return idg(c)`, one seed apart:

      guard alone   (func (param i32) (result i32))          ... return_call 4
      both          (func (param (ref 0)) (result (ref 0)))  ... return_call 4

  `struct.new 0` is the DECLARED `Circle` heap type on BOTH — the inline shape really is
  deduped onto that row, which is the row's premise in bytes — and with the guard alone
  `mk` `return_call`s a `(result (ref 0))` frame into an `i32`-returning instance.
* Graduates to `tests/cases/structs/inline-shape-local-beside-declared-twin.vl`, whose
  `gen` rows are the composition cells and whose `mkNominal` row is the one-line control.
  The grid, the ablation and the two re-graded populations are
  `scripts/silent-sweep/d111/` — regenerated from source, never carried over.

---

### D112 — a NESTED MAP whose INNER value is an ANONYMOUS object shape
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-26 as the smallest surviving silent cell of the D88/D100 grid, while re-specimening `INVALID_MODULE_SRC` · pre-existing and byte-identical on `764ad0dd` and on the D88/D100 branch, same sentence · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D124**

Repro:

    function mk(n: i32) {
      const i0 = Map()
      i0["k"] = { r: n }
      const c = Map()
      c["o"] = i0
      return c
    }
    print((((mk(7))["o"] ?? Map())["k"] ?? { r: 0 }).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **NOT ONE DECLARED TYPE IN IT, and that is why it was chosen as the specimen.** Every axis
  the last five `INVALID_MODULE_SRC` specimens turned on is absent: no union, no ARM, no exact
  layout twin, no hand-written generic, no import, no lambda, no list, no declaration order.
  Eight lines.
* **THE MESSAGE DIFFERS IN NULLABILITY, NOT IN HEAP TYPE** — `expected (ref null $type),
  found (ref $type)` — which is the tell that it is a vals-CELL nullability seam and not the
  two-heap-types family every recent specimen came from. Worth stating because the family
  resemblance of the sentence is what made three earlier rows get grouped wrongly.
* **TWO CONTROLS BRACKET THE AXIS, both run verbatim on `764ad0dd` and on the branch.** One
  nesting level less RUNS (`{[string]: {r:i32}}` built and read the same way prints 7); the
  same nested map with a MONO inner value RUNS (`{[string]: {[string]: i32}}` prints 7). So
  the trigger is the inner map's REF value cell reached through the outer map's read, not
  nesting as such and not the anonymous shape as such.
* **IT IS THE LARGEST REMAINING SILENT FAMILY ON THE D88/D100 GRID** — 570 of the 1,169
  not-`runs` cells are `cont=nestedmap`, spread across every route, every delivery and both
  declaration orders. Sized rather than guessed, and the size is the argument for ranking it.
* Pin GRADUATED to `tests/cases/maps/nested-map-anon-shape-value-coalesce-default.vl`
  (`@run`), which keeps the witness and all three bracketing controls in one file;
  `INVALID_MODULE_SRC` moves to D124.

**THE CLOSE (2026-08-27), AND THE FIRST THING IT DID WAS REFUTE THE BULLET ABOVE IT.**

* **THE NULLABILITY IN THE MESSAGE WAS A RED HERRING, and the "vals-CELL nullability seam"
  reading was wrong.** Disassembled, the module says `expected (ref null $12), found (ref
  $11)` — TWO DIFFERENT MAP STRUCTS behind one `$type` placeholder, `$12` the inner map's
  own struct and `$11` the mono one — and the `ref null` is the vals ARRAY ELEMENT's own
  type, which every mv slot has. It is the two-heap-types family after all. Probed at the
  site rather than read off the sentence:

      D112PROBE mslot=1 valKind=6 valName={[string]:{r:i32}} rlSlot=1 elemKind=3
                isMap=T innerShape=0 elemHeap=12 valsWrap=8
                ctxMapSlot=-1 pendingMapSlot=-1 nullable=F
                innerMapTypeIdx=12 monoMapTypeIdx=11

  `isMap=T` and `innerShape=0` say the two questions the fix needs were ALREADY answered
  here; `ctxMapSlot=-1` / `pendingMapSlot=-1` say nothing seeded the constructor;
  `nullable=F` says the slot is not nullable at all. Grading a specimen by its message has
  now misled three times running.
* **THE PATTERN IS "COMPLEMENT ALREADY WRITTEN AND NEVER CALLED", and the complement is one
  line away in the same file.** `emitMapValDefault` — the `??` DEFAULT boundary for a
  ref-valued map slot — carries an arm for every value kind it lowers (scalar, union box,
  struct list, string/f64/i64/f32 list, struct, nullable niche) and had none for a NESTED
  MAP, so `emitMapNew` read the ambient `pendingMapSlot` (-1) and built the mono struct.
  `mvValIsMap` / `mvInnerMapShape` is the map STORE's own pair (`emitMapSetV`), already
  exported and already imported into `wasmEmit.vl`. Seven `Map()` boundaries had each been
  taught this separately — let, global-init, return, struct field, variant field,
  assignment, store — and the `??` default is the one nobody came back for. The assignment
  boundary's own comment records this row's exact sentence, `type mismatch: expected (ref
  null $type), found (ref $type)` with `vl check` clean, for its own half of the family.
* **RUNG 2 CAME OUT OF THE NEIGHBOURHOOD SWEEP, not out of the row.** `mvInnerMapShape` did
  not peel one `| null`, while its ref-list twin `rlElemMapShape` always had. A
  `{[K]: {[K2]: V} | null}` value rides the SAME vals element as its non-null twin, so both
  its callers — the STORE and the `??` DEFAULT — were wrong together, and one line fixed
  both. Pinned at `tests/cases/maps/nullable-nested-map-value-map-ctor.vl`.
* **452 of a purpose-built 1,114-cell grid and 430 of the 2,850-cell D88/D100 grid, every
  one `check-clean invalid wasm` → `runs`, 0 backward, 0 to a silent class, 0 same-class
  message changes.** The generator is `scripts/silent-sweep/d112/gen112.py`; its axes are
  nesting depth (1/2/3) x leaf value kind x declaredness (claimant count 0/1/2 and arm-ness)
  x how the annotation spells the leaf x which levels are annotated x nullability of the
  crossed value cell x how the read is spelled (`?? Map()` / `?? <named>` / `.get(k) ??` /
  `?.`) x declaration order.
* **THE TWO OLD GRIDS BOTH STAYED AT ZERO.** The 9,450-cell D52 grid and the 3,144-cell
  D75/D81/D82 grid each move 0 cells, 0 backward, and each still grades 0 silent — the fix
  is inert everywhere it is not the answer.
* **IT DID NOT EMPTY THE CLASS, and this row's own grid is what says so** — see D123 and
  D124, which are 61 of the 1,114 cells and 100 of the 2,850, in two families and neither
  of them this one.

---

### D123 — two mv slots that interned ONE vals ref-list slot are ONE map struct
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 in D112's closing residue, by re-grading the D88/D100 grid rather than by reading the inventory · pre-existing on `7b600b57`, same sentence**

**THE TITLE AND THE REPRO ARE BOTH RE-FILED, AND THE MEASUREMENT IS WHY.** The row was
filed as "the ARM-NOMINAL map rung is a ONE-LEVEL special case, not a rung in the recursive
`shapeNominalOfTy` ladder", and a probe at the mint REFUTED that for its own witness: the
object literal's recorded arena type is a FRESH anonymous `TyObj` (`armTy=58 vrow=-1`), so a
`TyMap` rung inside `shapeNominalOfTy` would decline it exactly as every existing rung does.
The row's 100 D88 cells are TWO mechanisms, separated by whether the two spellings interned
the same vals ref-list slot: 56 did (this row) and 44 did not (**D139**, where the layout
twin gives the render a struct-table row of its own and the two heaps are genuinely
different). The originally-filed witness is in the 44, so it is now D139's, and the repro
below is the `arm x mapval x std x param` cell this row closes. See "WHAT THE ORIGINAL
FILING GOT WRONG" below for the full accounting.

Repro:

    import { reverse } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function thru(x: {[string]: Circle}) { return x }
    function mk(n: i32) {
      const c = Map()
      c["k"] = { r: n }
      return reverse([thru(c)])[0]
    }
    print(((mk(7))["k"] ?? { r: 0 }).r)
    // was: vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **IT IS D88's MECHANISM ONE CONTAINER FURTHER IN.** D88 taught the emitter to spell a map
  VALUE that is a declared union ARM nominally (`nodeMapArmNominalName`), because
  `tyToEmitName` renders an arm structurally — an arm has no `sNames` row, since `collectS`
  SKIPS a `type X = {…}` that is a union member. But `nodeMapArmNominalName` asks
  `variantRowOfTy(t.mVal)` of ONE `TyMap` and stops. It is not a rung inside
  `shapeNominalOfTy`, which is the ladder that DOES recurse (through `TyArray`), and
  `shapeNominalOfTy` has no `TyMap` arm at all. So a map nested in a map, or a map nested in
  a list, falls back to the structural render and a second mv slot is minted for one layout.
  Disassembled on the repro, `mk`'s inner local `i0` is the anonymous row's map struct while
  the outer map's vals element is typed to `Circle`'s — two heap types behind one `$type`.
* **SIX CONTROLS, EVERY ONE BUILT AND RUN AGAINST THIS TREE. Two of them refuted the first
  draft of this row**, which had been written from a NEIGHBOURING program:

  | change to the repro | outcome |
  |---|---|
  | (none — the repro as filed) | check-clean invalid wasm |
  | delete `type Shape = Circle \| Sq` | **RUNS** |
  | delete `type Dot` (the exact layout twin) | **LOUD emit reject** |
  | `type Dot = { q: i32 }` instead (a non-twin) | **LOUD emit reject** |
  | annotate the inner local `i0: {[string]: Circle}` | **RUNS** |
  | one nesting level less (`{[string]: Circle}`) | **RUNS** |
  | replace the whole read with `print(7)` | check-clean invalid wasm |

  So ARM-NESS is the requirement (as in D88), the `??` read is NOT (the last row is silent
  without it — the failure is the STORE `c["o"] = i0`, not the read), and at this route the
  EXACT LAYOUT TWIN is required, without which the same program is loud. The first draft of
  this row claimed the opposite on both of the bolded rows because it was measured on the
  `decl=arm` program, which is a different program.
* **THE TWIN REQUIREMENT IS ROUTE-DEPENDENT, and the grid is where that shows.** The
  100 surviving cells of the 2,850-cell D88/D100 grid, all `src=declname`:

      decl      cont        route  n
      arm       mapval      std     6
      arm       nestedmap   gen    10
      arm       nestedmap   std    12
      armdiff   mapval      std     6
      armdiff   nestedmap   gen    10
      armdiff   nestedmap   std    12
      armtwin   bare        std     2
      armtwin   mapval      std     6
      armtwin   nestedmap   gen    12
      armtwin   nestedmap   none   12
      armtwin   nestedmap   std    12

  `route=none` appears at `armtwin` ONLY — matching the control table above — while `gen`
  and `std` reach it at `arm` and `armdiff` too, so the generic and std hops do not need the
  twin. The two `armtwin x bare x std` cells are the one coordinate this sentence does not
  cover and should be re-derived before they are assumed to belong here.
* **BOTH CONTAINERS ARE THE SAME ROOT.** The `route=std` cells reach it through a LIST
  (`reverse([thru(c)])[0]` over `{[string]: Circle}[]`), where `shapeNominalOfTy`'s
  `TyArray` arm recurses into a `TyMap` and finds no arm; the `cont=nestedmap` cells reach
  it through a map. One missing `TyMap` rung explains both, and the list form reproduces at
  ONE nesting level — so depth is not the axis, the container walk is.
* **28 of the 1,114 D112-grid cells too**, at `decl` in {`arm`, `armtwin`}.
* **NOT REACHABLE FROM D112's FIX, and that was measured, not assumed.** D112's seed DID
  change these cells' wasm — the `?? Map()` site moved from the mono struct to the typed one
  — and the failure simply relocated to `c["o"] = i0`. `cmp` across the fix, then
  disassemble; the outcome class never moved.
* **THE OBVIOUS WIDENING IS NOT COSTED YET.** Adding a `TyMap` arm to `shapeNominalOfTy`
  that recurses on the value is the shape the mechanism implies, but this seam is NOMINAL by
  ruling (`DECISIONS.md`: the variant/struct-TABLE seam stays nominal) and D111 records a
  neighbouring widening at this same layer that moves 64 cells to `runs` and 19 to SILENT.
  Sweep it against the D112 and D88 grids BOTH before landing it.

**THE CLOSE (2026-08-27), AND THE FIRST THING IT DID WAS REFUTE THE ROW'S OWN TITLE.**

* **A PROBE AT THE MINT, NOT A READING OF THE MESSAGE.** The two mv slots for one map value
  were dumped with their kind, canonical id, vals ref-list slot and wrapper, beside the
  ref-list table itself. On the `arm x mapval x std x param` cell:

      slot=0 name=Circle   kind=1 canon=1 rl=0 rlwrap=9 rep=0
      slot=1 name={r:i32}  kind=1 canon=1 rl=0 rlwrap=9 rep=1
      rl=0 nm=Circle k=1 heap=1 wrap=9

  ONE ref-list slot, ONE wrapper, and `rep=1` — a refusal to merge two map structs that are
  byte-identical by construction. On the `armtwin` sibling the same dump reads `rl=0
  nm=Circle heap=1 wrap=9` against `rl=1 nm=Dot heap=0 wrap=11`: two rows, two heaps, and
  the refusal is correct there. That single column is the whole partition.
* **THE PATTERN IS "COMPLEMENT ALREADY WRITTEN AND NEVER CALLED", and it is called ONE
  BRANCH DOWN.** What decides whether two mv slots emit one map struct is the vals list
  WRAPPER, and `rlSlotsLayoutTwin` is the ref-list table's own pairwise equivalence for
  exactly that — exported, imported, and already the kind-6 arm's guard inside the same
  function. The kind-1 arm asked a PROXY instead: D34's arm-identity split
  (`(mvValVariantOf(a) >= 0) != (mvValVariantOf(b) >= 0)` → refuse), which is stricter than
  the layout wherever the two slots interned the same ref-list row. The rung is ADDITIVE and
  asked first; D48's arm-TWIN merge stays as the fall-through, because two arms of two
  different unions over one field set are DISTINCT ref-list rows that only the variant layer
  can equate.
* **RUNG 2: THE VALUE-ROW COLUMNS HAD TO FOLLOW THE MERGE, and it measures ZERO alone.**
  With the slots merged, `mvValVariantIdx` / `mvValStructIdx` are still recorded at the MINT
  off the ONE spelling that minted the row, so its ELEVEN call sites — the map STORE seed,
  the `??` DEFAULT seed, the `?.` field read, two `structIndexOfExpr` map arms,
  `forInRefArrayStructIdx` and its variant twin, and four sibling variant resolvers — kept
  answering with the render's inline row. Disassembled on the nested cell: the
  store emitted `struct.new 0` (the inline `{r:i32}` row) into an array of `(ref null 1)`
  (`uVarHeap[Circle]`), and a later field read emitted `struct.get 0 0` over a `(ref 1)`
  receiver. Both columns now read through `mvCanonRepOf`, the chokepoint the heap mint, the
  union-box tag and the arm-slot guard already share; `mvValVariantRawOf` is the one raw
  reader, and it is structural — `mvCanonRepOf` calls the comparator, so the comparator
  cannot canonicalize.
* **TWO EDITS, ONE ROOT, AND THE ABLATION IS WHAT SAYS SO.** Over the 2,850-cell D88/D100
  grid: the comparator rung alone moves **8** cells, the value-row read alone moves **0**
  (and **0** of 2,312 corpus modules change a byte), and the two together move **56**. A
  union of singles far smaller than the pair is the shape a COMPOSITION has and a shared
  root does not — the same reading #1957's D39/D40/D41 ablation used.
* **THE PAIRING AXIS FOUND THE SECOND RUNG'S REAL SIZE.** With only the store/`??`/`?.`
  seeds converted, each grid cell passed ALONE and two of them in ONE FILE did not: the
  field-read resolvers (`structIndexOfExpr`'s two map arms, `forInRefArrayStructIdx`) still
  read the raw column, so their D34 "an arm value has no `sNames` row — decline" gate never
  fired for an arm-valued slot spelled structurally. A one-program-per-cell grid
  structurally cannot see that, which is the warning `scripts/silent-sweep/d87/README.md`
  already carries about its own `arm2` level.
* **56 of the 2,850-cell D88/D100 grid, every one `check-clean invalid wasm` → `runs`, 0
  backward, 0 to a silent class, 0 same-class message changes.** The moved cells are
  `decl` in {`arm`, `armdiff`} x `src=declname` x {`mapval x std`, `nestedmap x gen`,
  `nestedmap x std`} x {`param`, `paramlocal`, `retann`}.
* **AND 0 OF THE 1,114-CELL D112 GRID, WHICH IS WHAT SEPARATES IT FROM D124.** The two rows
  are disjoint on both grids: D124's peel moves 49 D112 cells and 0 D88 cells, this row's
  pair moves 56 D88 cells and 0 D112 cells, pairwise intersection 0 on each.
* **WHAT THE ORIGINAL FILING GOT WRONG, stated so the next reader does not inherit it.**
  (a) The mechanism sentence — a missing `TyMap` rung in `shapeNominalOfTy` — does not
  explain any of the 100 cells; the mint never reaches a nominal question, because the
  literal's arena type is anonymous at every one of them. (b) "28 of the 1,114 D112-grid
  cells too, at `decl` in {`arm`, `armtwin`}" double-counts with D124's "33 … all `depth=3`
  x `nul` x `ann=outer`": those two sets overlap, the D112 grid's 61 survivors are 49 D124
  cells + 12 D139 cells, and this row owns none of them. (c) The `armtwin x bare x std`
  pair the row flagged as "the one coordinate this sentence does not cover" is indeed not
  covered — it is D139's, along with every other `armtwin` cell.
* **THE FOUR OLD GRIDS ALL STAYED AT ZERO, RE-MEASURED ON MERGED MASTER `89d01c97`** (not
  inherited from `89f88840`; every ablation compiler was rebuilt on that base and every
  number above re-run, with 0 cells differing from the pre-merge measurement on either
  grid). The 9,450-cell D52, the 3,144-cell D75/D81/D82, the 1,710-cell D111/D117 and
  #1962's own 1,732-cell D131 grid each move **0** cells and each still grade 0 silent.
  2,314 corpus modules are byte-identical except the six map files whose duplicate map
  structs this deletes (all shrink) and the two fixtures this change adds.
* **AND THE AXIS NO GRID IN THIS FAMILY VARIES WAS SWEPT TOO** — where the map is BOUND
  (`scripts/silent-sweep/d139/`). 12 of 36 cells move, **4 at each of `local`, `global` and
  `callres`**, 0 backward: this fix is storage-class independent. That is worth a grid
  rather than an assumption, because the same axis is exactly what separated D139's
  residue and what #1962 needed for D131.

---

### D124 — a `{[K]: V | null}` value spelling mints a SECOND map slot for a layout that already has one
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 in D112's closing residue, on the depth-3 nullable axis of that row's own grid · pre-existing on `7b600b57`, same sentence · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D139**

Repro:

    const z = Map()
    z["z"] = 1
    const l2 = Map()
    l2["a"] = z
    const c: {[string]: {[string]: {[string]: i32} | null}} = Map()
    c["k"] = l2
    print(7)
    // was: vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **SEVEN LINES, ONE ANNOTATION, AND NO `??` AT ALL** — no function, no union, no generic,
  no import, no lambda. The whole program is two map builds and a store.
* **THE NULLABILITY IS IN THE SENTENCE AND IS NOT THE MECHANISM — for the third specimen
  running.** Disassembled, the two `$type`s are `$11` and `$12`, whose struct definitions
  are BYTE-IDENTICAL:

      (type $11 (struct (field (mut (ref $9))) (field (mut (ref $5))) … ))
      (type $12 (struct (field (mut (ref $9))) (field (mut (ref $5))) … ))

  `$11` is `l2`'s INFERRED `{[string]: {[string]: i32}}` and `$12` is the annotation's
  `{[string]: {[string]: i32} | null}` value. One map layout, two heap types, and
  `c["k"] = l2` stores across them. `mvTwin` exists for exactly this ("twins share ONE
  `mvMapTypeIdx`") and does not merge these two.
* **THE AXIS IS THE SECOND SPELLING, not the nullability and not the nesting. Three
  controls, all run verbatim.** Drop the `| null` from the annotation → RUNS. Make the inner
  map MONO (`{[string]: i32}`, whose struct is the shared one, so there is no second slot to
  mint) → RUNS. Annotate `l2` with the outer's own nullable-valued spelling → RUNS. It needs
  one layout named twice, once bare and inferred, once `| null` and annotated.
* **NOT D112's ROOT, and the wasm diff is the proof.** D112's fix moved the first of these
  cells' two `?? Map()` sites to the right struct (`struct.new $10` → `$12`) and left the
  store-side twin mismatch, so every one of them stayed `check-clean invalid wasm` while its
  module changed underneath. A partial fix inside one outcome class is invisible to the
  grader of that class; only `cmp` found this.
* **33 of the 1,114 D112 cells**, all `depth=3` x `nul` x `ann=outer`, and the LEAF value
  kind does not matter (`anon`, `scalar`, `str`, `list` and `monomap` all appear) — which is
  what says this is the map-slot identity and not the value's rep.
* Pinned as `tests/cases/soundness/xfail-miscompile-nullable-map-value-spelling-twin.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.

**THE CLOSE (2026-08-27), AND FOR ONCE THE ROW'S OWN READING SURVIVED IT.**

* **THE RULE WAS ALREADY WRITTEN, IN THE HEADER OF THE FUNCTION WHOSE PEEL THE MINT ALREADY
  TAKES.** `nulRefMapValInnerOf` states the contract in full: a `{[K]: V | null}` value
  "resolves its struct/map identity — and keys its vals ref-list slot — through the single
  non-null member, so the slot SHARES the vals rep (AND THE HEAP DEDUP) with the non-null
  twin". `mvShapeOfValNameArmTy` honours the first half — it peels to `bare` before
  `structIndexByValName` and before `ensureRefElemTy` — and the second half was never wired:
  `repMapValSlotsTwin` keyed on `mvValCanonId`, which reads the value's OWN arena index, and
  a `TyNullable`'s `repCanonId` is by construction not its inner's. So the comparator refused
  a pair whose vals slot the mint had itself made identical.
* **PROBED AT THE MINT, NOT READ OFF THE MESSAGE.** On this row's own witness:

      slot=0 name={[string]:i32}      kind=6 canon=2 rl=0 rlwrap=5 rep=0
      slot=1 name={[string]:i32}|null kind=6 canon=3 rl=0 rlwrap=5 rep=1

  The SAME vals ref-list slot and the SAME wrapper — which is why `$11` and `$12` came out
  field-for-field equal — and `canon` is the only column that differs. `rep=1` is the
  refusal. One line: the comparator asks `mvValTwinCanonId`, which peels the niche the same
  way `mvSlotNullable` asks it and otherwise is `mvValCanonId` unchanged.
* **THE MERGE IS INTERLOCKED RATHER THAN TRUSTED.** `mAssignTypeIndices` already fails
  LOUDLY when two claimed twins resolve different vals wrappers ("map-value layout twins
  resolved different vals wrappers"), so an over-merged kind 1/2/6/14 pair is a compiler
  error and never a silent alias.
* **49 of the 1,114-cell D112 grid, every one `check-clean invalid wasm` → `runs`, 0
  backward, 0 to a silent class.** Every moved cell is `depth=3` x `nul` x `ann=outer`, at
  every leaf kind (`anon` 37, `list`/`monomap`/`scalar`/`str` 3 each) — which is what says
  it is the map-slot identity and not the value's rep, exactly as filed. **0 of the
  2,850-cell D88/D100 grid**, so it is disjoint from D123 on both grids (pairwise
  intersection 0 each way).
* **TWO SAME-CLASS MESSAGE CHANGES, and they are progress rather than noise.** Two
  `d3 x armtwin x nul x coalvar` cells stayed `check-clean invalid wasm` and their engine
  message moved from `function[N]::mk` to the start function — the in-`mk` mismatch is gone
  and the module-scope one is not. Those two are D139 cells; no outcome-class count can see
  the difference, which is the instrument the D112 close named and this one re-ran.
* **THE ROW'S OWN CELL COUNT WAS 33 AND THE MEASURED FIGURE IS 49.** The filing counted
  `depth=3 x nul x ann=outer` cells that were silent AND not attributed elsewhere; the peel
  also reaches 16 cells D123's filing had claimed at `decl` in {`arm`, `armtwin`}. The two
  rows' filed cell sets overlapped; their MOVED sets do not.

---

### D139 — an ARM-valued map beside a standalone struct of the arm's EXACT layout
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 as the residue of D123/D124 · pre-existing on `89f88840`, on merged master `89d01c97` and on `54780e0b`, same message · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D155**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) { return x }
    const c = Map()
    c["o"] = { r: 7 }
    thru(c)
    print(7)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **NINE LINES, no import, no generic, no lambda, no `??`, ONE nesting level.** And note the
  message has NO `ref null` in it: after three specimens running whose sentence named
  nullability over a two-heap-type mechanism, this one does not even look like a nullability
  defect. It is the same mechanism as those three.
* **IT IS D123's OTHER HALF, AND ONE COLUMN SEPARATES THEM.** D123 merges two mv slots that
  interned the SAME vals ref-list slot. Here they did not:

      slot=0 name=Circle   kind=1 canon=1 rl=0 rlwrap=9   (rl=0 nm=Circle heap=1)
      slot=1 name={r:i32}  kind=1 canon=1 rl=1 rlwrap=11  (rl=1 nm=Dot    heap=0)

  With `Dot` declared, `structIndexByValName("{r:i32}")` finds it before anything asks
  whether an arm of that layout exists, so the render gets a struct-table row of its own and
  the two slots hold two genuinely different heaps — `uVarHeap[Circle]` and `sHeapIdx[Dot]`,
  which `DECISIONS.md` keeps in two namespaces on purpose. Merging them would be WRONG, and
  `rlSlotsLayoutTwin` correctly declines (its struct tail refuses a row whose
  `rlElemStructRow` is -1, which is every registered variant — D32's gate).
* **THE DECIDING INFORMATION EXISTS AND IS NOT AT THE MINT — this is D39's CHANNEL problem
  at the map-VALUE position.** `thru`'s annotation says the value is `Circle`; the literal's
  own recorded arena type is a FRESH anonymous `TyObj` (`variantRowOfTy` = -1,
  `structIndexOfTy` = -1, probed), so nothing the mv layer is handed can pick between
  `Circle` and `Dot`. D39's own sentence applies verbatim: "an anonymous `{ r: n }` has two
  nominal claimants and only the CONTEXT separates them." The two shapes that already carry
  a context to an un-annotated binding — `synthRetPinAnn`, `synthEmptyListAnn` — do not
  reach a map's value cell.
* **A LOUD FLOOR IS NOT THE ANSWER AND THAT IS MEASURED, not argued.** D93's header records
  the experiment at this exact layer: a `-3` refusal at the mint scored 866/148/10 against
  894/112/18, buying 8 fewer silent cells for 28 fewer working programs, six of them
  `correct` on master. The number that decides a floor is the count of `correct` cells LOST.
* **SIX CONTROLS, ALL BUILT AND RUN against master and against the D123/D124 branch,
  same answers on both:**

  | change to the repro | outcome |
  |---|---|
  | (none — the repro as filed) | check-clean invalid wasm |
  | delete `type Dot` | **LOUD emit reject** (`unsupported map value type`) |
  | `type Dot = { q: i32 }` (a non-twin) | **LOUD emit reject** (same message) |
  | delete `type Shape = Circle \| Sq` | **RUNS** |
  | annotate `c: {[string]: Circle}` | **RUNS** |
  | wrap the two statements in a function | **RUNS** — but see below: NOT because the split is absent |
  | the same program at TWO nesting levels | check-clean invalid wasm, `ref null` sentence |

  So the EXACT layout twin is required (both non-twin controls are loud, not silent), the
  union is required, and at ONE level only MODULE scope reaches it — the function-scope
  sibling is `armtwin x mapval x none x param` on the D88 grid and it runs.
* **AND THE PASSING CONTROL WAS INTERROGATED RATHER THAN COUNTED (#1962's lesson).** "Wrap
  it in a function and it runs" does NOT show the slot split is absent there. Probed, the
  two programs intern the SAME two mv slots over the SAME two ref-list rows —
  `rl=0 nm=Circle heap=1 wrap=9` and `rl=1 nm=Dot heap=0 wrap=11` — and emit BYTE-IDENTICAL
  type sections, both carrying the `Circle`-vals map struct AND the `Dot`-vals one. What
  differs is which of them the BINDING's `Map()` constructor resolves: `struct.new 15` at
  function scope, `struct.new 16` at module scope. Read as "the mint is scope-dependent"
  this control would be agreement by accident; read correctly it says the residue is a
  binding-RESOLUTION problem as much as a mint one, and it names the cheapest next probe —
  why does the module-scope binding resolve the render's slot where the local resolves the
  arm's?
* **THE AXIS NEITHER GRID VARIES IS WHERE THE MAP IS BOUND, and it now has a grid of its
  own** (`scripts/silent-sweep/d139/`, 36 cells over `decl` x `bind` x `cont` x `route`).
  Every cell of the D88/D100 and D112 grids, and every filed control on D88/D100/D112/D123/
  D124, builds the map as a function LOCAL. Measured: D123's fix is storage-class
  INDEPENDENT (12 cells moved, 4 at each of `local` / `global` / `callres`, 0 backward),
  while D139 is NOT — at `armtwin x mapval x route=none` the LOCAL runs and the GLOBAL and
  CALL-RESULT bindings are silent, on base and branch alike. That is the same shape D131's
  close found by varying its receiver's storage class after four filed controls had agreed.
* **THE RESIDUE IS ONE FAMILY ON BOTH GRIDS.** D88/D100: all 44 survivors are `decl=armtwin`
  x `src=declname` — `bare x std` 2, `mapval x std` 6, `nestedmap x gen` 12, `nestedmap x
  none` 12, `nestedmap x std` 12. D112: all 12 are `armtwin` x `declname` x `leaf=anon` x
  `read=coalvar`, 6 at depth 2 and 6 at depth 3.
* **THE CLOSE — the channel diagnosis CONFIRMED, the guess about the fix REFUTED.** The row
  said "your fix is most likely a third member of the `synthRetPinAnn` / `synthEmptyListAnn`
  family". The third member EXISTS: `synthDstPinAnn` (D81), which pins an un-annotated
  binding from the annotation of every destination it is delivered to, whose `armPinLitInit`
  already accepts a bare `Map()` and whose `armPinAnnName` already accepts an arm-valued map
  annotation. What it was missing is a CALLER. `synthDstPinAnns` walks `fnStmts`; the module
  has no `fnStmts` row and `collectLocals` never sees a global either, which is the same
  structural gap `synthGlobalEmptyListAnns` exists to close one family over.
  **Pattern 1 (a complement already written and never called), not pattern 2.**
* **THE PROBE THAT SAID SO, verbatim** (a compiler carrying a dump at the foot of
  `emitProgram` plus a note at `letMapShapeOf` and `emitMapNew`; both programs on
  `54780e0b`):

      MODULE SCOPE (the repro)              FUNCTION SCOPE (the control that runs)
      letMapShapeOf ix=18 fn=-1 letType=-1  letMapShapeOf ix=18 fn=30 letType=37
                                              letType spelling={[string]:Circle}
      globalStartFn map: shape=1            localLet map: stmt=18 fn=30 shape=0
      emitMapNew: pendingMapSlot=1          emitMapNew: pendingMapSlot=0

      -- IDENTICAL ON BOTH SIDES --
      mv slot=0 name=Circle  kind=1 sidx=-1 twin=0 mapTy=15 rl=0 rlnm=Circle rlheap=1 rlwrap=9
      mv slot=1 name={r:i32} kind=1 sidx=0  twin=1 mapTy=16 rl=1 rlnm=Dot    rlheap=0 rlwrap=11
      struct row=0 name=Dot heap=0
      variant row=0 heap=1   variant row=1 heap=2

  Two heaps, exactly as filed, and merging them is still wrong. The mint is identical on both
  sides; ONE column differs and it is the binding's annotation. That is what "the residue is
  a binding-RESOLUTION problem as much as a mint one" turned out to mean.
* **THE FIX, three edits and one behaviour.** `plScanStmt` grows a `Program` arm so
  `parentLetOf` can resolve an identifier in module scope (no existing caller passes a
  `Program` node, and there is no `FuncDecl` arm, so a function's own locals cannot leak into
  the module's map); `runEmitPass` threads `rootIx`; `synthDstPinAnn`'s body is extracted as
  `dstPinAnnIn(letIx, bodyIx, retIx)` and called a second time over `globalStmts` with the
  program node as the scope and `-1` for the result annotation. The destination scan, all
  four legs and the disagreement gate are SHARED rather than copied — a copy would be the
  second place the gate could drift. **Position: inside the existing `synthDstPinAnns` pass,
  which is already ordered before `monomorphize`** — D81's requirement, and no pass-table row
  changes.
* **MEASURED, FOUR INSTRUMENTS.** Its own 36-cell grid (`scripts/silent-sweep/d139/`) moves
  **3 of 36, 0 backward**: `armtwin x mapval x none x global` silent to runs, and
  `arm x mapval x none x global` + `armdiff x mapval x none x global` **loud emit reject to
  runs** — the D93 number that decides a floor, moving in the right direction. The D88/D100
  (2,850) and D112 (1,114) grids move **0 outcome and 0 message** — every cell of both builds
  the map as a function LOCAL, so neither population contains this row at all, which is why
  the storage-class axis had to exist. Re-graded and all still 0 moved / 0 backward:
  D52 (9,450), D75/D81/D82 (3,144), D111/D117 (1,710), D131 (1,732).
* **THE ABLATION BASE IS PROVEN.** The single-candidate compilers are produced by STRIPPING
  candidates out of the branch source; stripping all of them reproduces `54780e0b`'s
  `compiler/emit_{base,collect,sections}.vl` textually and compiles to 1,452,568 bytes
  byte-identical to the base seed. The A-only compiler the stripper builds is byte-identical
  to the hand-built branch (1,452,766).
* **THREE OTHER CANDIDATES WERE BUILT AND MEASURED AND ARE NOT IN THE COMMIT.** See D156: the
  nested-map peel moves 70 D88 cells forward and **four D112 cells BACKWARD**, and the peel
  ALONE (without its leg-4 half) moves 4 D88 cells backward and nothing forward. A composition
  that is net-positive is not thereby shippable.
* The old pin GRADUATED to `tests/cases/soundness/arm-valued-map-beside-struct-twin.vl`,
  `@run` + three `@log 7` (the former specimen verbatim, plus a read-back and the
  function-scope sibling). The specimen is now D155's.

---

### D155 — an arm-valued map that comes back from a CALL
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 in D139's closing residue, on the `bind=callres` level of that row's own grid · pre-existing on `54780e0b` and on `1559d80c`, same message at the same offset · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D157**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) { return x }
    function mkm() {
      const c = Map()
      c["o"] = { r: 7 }
      return c
    }
    thru(mkm())
    print(7)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **TWELVE LINES, no import, no generic, no lambda, no `??`, one nesting level** — D139's
  program with one change: the map is returned from a call instead of bound where it is used.
* **IT IS D139's CHANNEL WITH THE CONDUIT ONE HOP FURTHER OUT.** `thru(mkm())` is a
  destination for `mkm`'s RESULT, not for the binding `c`, and `dstPinSrcIs` only crosses a
  call whose signature makes it an identity conduit (`dstPinFwdArg`: the result annotation
  names one of the callee's own type parameters and some parameter is annotated with the same
  one). `mkm` is not that; it is an ordinary function with an inferred result.
* **SEVEN CONTROLS, BUILT AND RUN against `54780e0b` and against the D139 branch, same
  answers on both except where marked:**

  | change to the repro | outcome |
  |---|---|
  | (none — the repro as filed) | check-clean invalid wasm |
  | delete `type Dot` | **LOUD emit reject** |
  | `type Dot = { q: i32 }` (a non-twin) | **LOUD emit reject** |
  | delete `type Shape = Circle \| Sq` | **RUNS** |
  | annotate `const c: {[string]: Circle}` | **RUNS** |
  | annotate `function mkm(): {[string]: Circle}` | **RUNS** |
  | bind the map directly (D139's own repro) | **RUNS on the branch**, silent on `54780e0b` |
  | wrap the call site in a function | check-clean invalid wasm |

* **THE RESULT-ANNOTATION CONTROL IS THE ONE THAT NAMES THE CHANNEL** — the deciding
  information exists and the pin cannot see it — and **THE LAST CONTROL IS WHAT SEPARATES
  THIS ROW FROM D139.** D139 was storage-class DEPENDENT (its function-scope sibling ran);
  this one is silent at BOTH scopes, so `scripts/silent-sweep/d139/`'s `bind` axis does not
  discriminate it and the axis that does is where the ANNOTATION sits.
* **THE CHEAPEST NEXT PROBE WAS NOT WHAT ANSWERED, AND THE PIN'S OWN DUMP WAS.** The row
  proposed asking whether `computeRetInference` already knows `mkm` returns a
  `{[string]: Circle}`. It does not need to. A compiler carrying a dump of every
  `dstPinAnnIn` decision answered in one line on `1559d80c`:

      D155 (the repro)               `function mk(n) { … return thru(c) }`, which RUNS
      DPA let=18 name=c ret=-1 n=0    CA callee=thru j=0 pty=<{[string]:Circle}>
                                                        pushed=<{[string]:Circle}>
                                      DPA let=20 name=c ret=-1 n=1 [0]=<{[string]:Circle}>

  `n=0` — not a WRONG destination, no destination AT ALL. `mkm`'s result is un-annotated, so
  `dstPinRetDest` is never called (`retIx = -1`), and the four legs find nothing inside
  `mkm`'s body because the only nominal claim in the program is at a call site in another
  scope. The pin declines on `dstN.length == 0` and the binding reaches the mv layer bare.
* **THE FIX — ONE RUNG AND ONE SCAN, both inside the pass that already carries this
  context.** `dstPinSrcIsAt` grows a rung: an ordinary call to a callee whose result is
  UN-ANNOTATED is transparent to the binding that callee hands back (`dstPinCalleeRetLet`,
  which asks `retLocalLetOfBlock` of the CALLEE's body — the same "which binding actually
  supplies this value" walk `synthRetPinAnn` and `dstPinSrcIsAt` already make of the
  caller's). `dstPinCallerDests` then runs the SAME `dstPinScan` over every other function
  body and over the module root, with each scope as its own `bodyIx` so identifier
  resolution stays local to the scope being walked.
  **THREE GATES KEEP IT FROM BEING A WHOLE-PROGRAM SCAN PER BINDING**: the enclosing
  function's result must be un-annotated, the binding must BE that function's tail value, and
  only a binding that passed both is scanned for elsewhere. A DECLARED result answers -1 and
  is deliberately not a hop — it is the destination, `dstPinRetDest` already records it from
  inside the callee, and a caller must not overrule a nominal claim the callee makes about
  its own result.
* **THE DISAGREEMENT GATE IS UNCHANGED AND IT IS THE SAFETY PROPERTY, measured rather than
  argued.** `thru(mkm())` beside `thrud(x: {[string]: Dot})` pushes two names, the pin
  declines, and the program is check-clean invalid wasm at the SAME message and the SAME
  offset (1316) on `1559d80c` and on this tree — untouched, not "fixed differently".
* **MEASURED, FOUR INSTRUMENTS, IN ORDER.** Corpus `cmp` FIRST — every one of the 2,316
  `tests/cases/**.vl` modules built with both seeds and sha256-compared: **1 differs**, and
  it is the `@run` fixture this change graduates (the new `@no-instantiate` specimen is
  byte-identical on both sides, as it must be). Then the grids, then the message diffs, then
  disassembly of the moved cells. `scripts/silent-sweep/d139/` moves **3 of 36, every one forward, 0 backward,
  0 to a silent class**: `armtwin x mapval x none x callres` check-clean invalid wasm →
  runs, `arm x mapval x none x callres` and `armdiff x mapval x none x callres` loud emit
  reject → runs. There is also **1 same-class MESSAGE move**, at
  `armtwin x mapval x std x callres` — the pin now fires there and D163 keeps the cell
  silent, which is the "same class, different message" disguise caught by the instrument
  rather than by the outcome count. **All six earlier grids re-graded and all six move 0
  cells, 0 messages, 0 backward, 0 silent**: D52 (9,450), D75/D81/D82 (3,144),
  D88/D100 (2,850), D111/D117 (1,710), D131 (1,732), D112 (1,114).
* **THE ABLATION BASE IS PROVEN.** The single-candidate compilers are produced by STRIPPING
  candidates out of the branch; stripping all three reproduces `1559d80c`'s
  `compiler/emit_collect.vl` textually and compiles to **1,452,766 bytes byte-identical to
  the base seed**, and the stripper's full build is byte-identical to the hand-built branch
  (1,454,620). Per candidate, over the three grids that could see anything:

  | candidate | D139 (36) | D88/D100 (2,850) | D112 (1,114) |
  |---|---|---|---|
  | A — the caller-destination scan + callee-return rung (this row) | **3 moved, 0 backward** (+1 message) | 0 | 0 |
  | C1 — an open generic position is one whose spelling MENTIONS a type param (D157) | 0 | 0 | 0 |
  | C2 — `dstPinSrcIs` crosses an indexed element-preserving conduit (D157) | 0 | 0 | 0 |
  | C1 + C2 | 0 | 0 moved, **4 same-class MESSAGE moves** | 0 |
  | A + C1 + C2 | 3 moved (+1 message) | 0 moved, 4 message moves | 0 |

  Pairwise intersection **0** every way; A alone is set-identical to the composed branch on
  the only grid that moves. **C1 and C2 are a COMPOSITION that still moves nothing** — each
  alone changes not even a message, together they change four — and they are NOT in the
  commit. See D157.
* **THE SCAN'S COST IS MEASURED, NOT ASSUMED.** Its shape is quadratic if the three gates
  ever stop biting, so it was timed on the largest program in the tree: self-compiling
  `compiler/entry.vl` is **10.6s with the change and 10.9s without**, i.e. inside the noise.
* **A LOUD FLOOR WAS NOT CONSIDERED AND DOES NOT APPLY**: two of the three moved cells were
  ALREADY loud and moved to `runs`, so the `correct`-cells-lost number D93 records is 0 in
  the good direction.
* The old pin GRADUATED to `tests/cases/soundness/arm-valued-map-from-a-call-result.vl`,
  `@run` + four `@log 7` (the former specimen verbatim, a read-back, the call site inside a
  FUNCTION — the control that separated this row from D139 — and two AGREEING call sites).
  The specimen is now D157's.
---

### D156 — a NESTED arm-valued map, and the naive peel that closes 70 cells and breaks 4
**[CLOSED 2026-08-28] the repro below RUNS and prints `7` — see THE CONTESTED HALF, CLOSED at the foot of this row; the close is D280's variant⇄struct HEAP MERGE and not a carrier. Was: check-clean invalid wasm for the repro below, and deliberately, because it declares the layout twin, which is the CONTESTED half, filed as D171. The UNCONTESTED half SHIPPED 2026-08-27: the peel, gated on the arm having no declared layout twin, plus the `synthDstPinAnns` fixpoint. 92 cells across three grids move `loud emit reject` → `runs`, 0 backward, 0 to a silent class, silent populations unchanged at 44 / 12 / 66 · found 2026-08-27 in D139's closing residue · 36 of the 44 surviving D88/D100 cells · pre-existing on `54780e0b`, on `1559d80c` and on merged master `ff04d74b`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: {[string]: Circle}}) { return x }
    function mk() {
      const i0 = Map()
      i0["k"] = { r: 7 }
      const c = Map()
      c["o"] = i0
      thru(c)
    }
    mk()
    print(7)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)
    // (the module-scope sibling — the same statements at top level — is silent too)

* **THE IMMEDIATE CAUSE IS A ONE-CUT PEEL, AND FIXING IT IS NOT ENOUGH.** `armPinAnnName`'s
  map rung is `mapValNameOf(name)` — ONE cut — so `{[string]: {[string]: Circle}}` answers
  `{[string]:Circle}`, which the variant table can never claim, and the rung returns `""`.
  `dstPinPushAnn` records that `""` as a destination DISAGREEMENT, so a nested-map delivery
  VETOES the pin every other delivery agrees on. Leg 4 (`dstPinMapValue`) has the same one-cut
  gate on the value it cuts.
* **BOTH WERE BUILT. MEASURED PER CANDIDATE, ON THE PROVEN BASE:**

  | candidate | D88 (2,850) | D112 (1,114) |
  |---|---|---|
  | B1 — `armPinAnnName` peels every level | 4 moved, **all 4 BACKWARD** (`runs` to loud emit reject) | 0 moved |
  | B1+B2 — and leg 4's gate with it | 70 moved (44 loud→runs, 26 silent→runs), 0 backward, 8 same-class MESSAGE moves | 18 moved (12 loud→runs, 2 silent→runs), **4 BACKWARD** (`runs` to check-clean invalid wasm) |

  Pairwise intersection with D139's fix is **0** on both grids and the union of the singles is
  set-identical to the composed branch. **B1 alone is NEGATIVE and only becomes a gain in
  composition** — the mirror of the D111 finding that a composition can be a direction rather
  than a cell count.
* **THE FOUR BACKWARD CELLS ARE A SECOND DEFECT, AND THE mv DUMP IS WHAT SAYS SO — not the
  pin's incompleteness.** They are `d3 x anon x armtwin x declname x ann=outer x nonul x
  {coal,getm}`: a depth-3 chain whose outer map is user-annotated. A FIXPOINT LOOP WAS BUILT
  FIRST, on the hypothesis that the pin was order-dependent; it pins the whole chain
  (`PIN ix=24 name=l2 -> {[string]:{[string]:Circle}}`, `PIN ix=14 name=l1 ->
  {[string]:Circle}`) and the cell still fails, while the SAME program written with those two
  annotations BY HAND runs. The dumps are not the same:

      hand-annotated (RUNS)                      pinned (invalid wasm)
      mv 0 Circle                      mapTy=17  mv 0 {r:i32}                     mapTy=19 h=0
      mv 1 {[string]:Circle}   rl h=17 mapTy=18  mv 1 {[string]:{r:i32}}  rl h=19 mapTy=20
      mv 2 {[string]:{[string]:Circle}} rl h=18  mv 2 {[string]:{[string]:Circle}} rl h=20
                                                 mv 3 {[string]:Circle}  twin=1 mapTy=20 rl=1
                                                 mv 4 Circle                      mapTy=22 h=1

  `{[string]:Circle}` (slot 3) TWINS ONTO `{[string]:{r:i32}}` (slot 1) and shares its
  ref-list row, whose element heap is the `{r:i32}`/`Dot` map struct — while `l1`, pinned
  `{[string]:Circle}`, builds `mapTy=22` over the `Circle` VARIANT heap. **That is D123's
  "two mv slots, one vals slot" at kind 6, over two leaf heaps that are the arm's and the
  twin's** — the same nominal seam one container up. The pin only EXPOSES it by producing a
  program in which both spellings are live.
* So the order is: close the kind-6 twin first, then land the peel. Landing the peel alone
  trades 4 working programs for 26 silent ones, and the standing rule is that a
  `runs` to check-clean-invalid-wasm move is a blocker whatever the net.
* The fixpoint loop is NOT in the tree: it moves 0 cells on every grid measured and its
  hypothesis was refuted. It is recorded here so it is not re-derived.

**THE CLOSE (2026-08-27, on merged master `ff04d74b`). TWENTY-THREE ABLATION COMPILERS
AND ELEVEN PROBE
BUILDS, FOUR GRIDS, AND THE ROW'S OWN
PRESCRIPTION IS REFUTED.**

* **THE FILED ATTRIBUTION OF THE 4 BACKWARD CELLS IS WRONG, and the ablation is what says so.
  They are B2's ALONE, not the composition's.** Re-measured with one compiler per candidate, the
  two halves separate completely (on `1559d80c`, the base the candidate was filed against):

  | candidate | D88 (2,850) | D112 (1,114) |
  |---|---|---|
  | B1 — `armPinAnnName` peels every level | 0 fwd / **4 back** | 0 / 0 |
  | B2 — leg 4's gate accepts a map-valued value | 46 / 0 | 14 / **4** |
  | B1+B2 | 70 / 0 | 14 / **4** |

  So B1's four backward cells are REPAIRED by B2 (`0 + 46 != 70`, and `-4 + 0 != 0`) — the
  composition is a DIRECTION and not a count in BOTH columns — while B2 carries the D112
  regression on its own. The row read the sum and attributed the loss to the pair.
* **THE ROW'S PRESCRIBED ORDER IS REFUTED.** "Close the kind-6 twin first, then land the
  peel" assumes the conflation is a defect standing between the peel and its win. Built and
  measured, it is the opposite: the arm/twin conflation at the mv and ref-list layers is what
  every chain the pin CANNOT complete is riding on, so removing it first moves cells
  backward with nothing forward. `repElemId` taught the arm a nominal key (D173) is **0
  forward / 56 backward on D88 and 0 / 6 on the position grid, entirely on its own**; the
  un-hinted-find repair (D172) is **0 / 16 on D112 and 0 / 18 on the position grid**. The
  correct order is the reverse — complete the chain first, and the twin question becomes
  reachable only where it is.
* **THE AXIS THAT SPLITS THE PEEL IS THE LAYOUT TWIN, and the split is TOTAL.** On the new
  1,188-cell annotation-POSITION grid (`scripts/silent-sweep/d156/`), the UN-GATED peel plus
  the fixpoint against merged master `ff04d74b`:

      notwin:  loud emit reject -> runs  36      notwin:  runs -> anything     0
      twin:    invalid wasm     -> runs  20      twin:    runs -> invalid     16

  Not one cell crosses. Every cell the peel moves in either direction is `leaf=arm`; the
  `anon` / `struct` / `scalar` / `map` leaves are untouched, which is what says the seam is
  variant⇄struct and not shape-versus-name.
* **WHAT SHIPPED**: `armPinAnnName`'s map rung and `dstPinMapValue`'s leg-4 gate both grow a
  DEEPER rung (`mapLeafValName`, the transitive closure of `mapValNameOf`) that fires only
  where `armLayoutContested` is false — no declared struct row of the arm's exact layout —
  and `synthDstPinAnns` runs to a FIXPOINT. Measured on `ff04d74b`: **D88/D100 +44, D112 +12,
  D156 +36 — 92 cells, every one `loud emit reject` → `runs`, 0 backward, 0 to a silent class,
  0 same-class message moves on two of the three grids and 4 on D112.** Every moved cell is
  `leaf=arm` x `twin=notwin`, at four of the six annotation POSITIONS (`dest` 16, `bindann` 8,
  `delivery` 8, `retann` 4).
* **THE FIXPOINT MOVES 0 CELLS ALONE AND IS LOAD-BEARING.** The gated peel alone is +18 /
  **-4** on the position grid (four `bindann x param x arm x notwin` cells); the fixpoint
  alone is 0 / 0 on all three; together +36 / 0. The union of the singles is 74 and the
  composition is 92 — a candidate whose own column is all zeroes is exactly the one an
  ablation that only sums would drop.
* **THE ABLATION BASE IS PROVEN, BY STRIPPING.** Each candidate compiler is produced by
  stripping candidates OUT of the branch source and self-compiling from `ff04d74b`'s own seed;
  stripping BOTH reproduces `ff04d74b`'s `compiler/emit_collect.vl` and
  `compiler/emit_classify.vl` TEXTUALLY and compiles to a seed byte-identical to it at
  1,453,528 bytes, while stripping NEITHER is byte-identical to the branch tree's own build at
  1,453,931.
* **THE FIXPOINT'S ROUND BOUND IS 32 AND THE NUMBER IS DERIVED.** A round is consumed per
  level of the pin dependency chain, and TRUNCATING the loop is exactly the half-pinned chain
  D171 is about. The deepest chain the gates can pin is bounded by `mapLeafValName`'s own
  8-cut cap, so 32 puts the loop's ceiling far above the rung's; the `dstPinFired == 0` exit
  fires on round 2 for every cell of all seven grids, and the bound-8 variant measures
  IDENTICALLY on all of them (it is the one this row's numbers were first taken on).
* **ALL SIX EARLIER GRIDS RE-GRADED against `ff04d74b`, 0 moved and 0 backward on every one**:
  D52 (9,450), D75/D81/D82 (3,144), D111/D117 (1,710), D131 (1,732) — and D88/D100 (2,850)
  and D112 (1,114) are the two the change is measured ON, both +44 / +12 forward with 0
  backward. D112's 1,114 was treated as a GATE and not a re-grade, which is what the earlier
  candidates failed. **Every number in this row was RE-TAKEN on `ff04d74b` after #1965 landed
  in the same file**; the rejected candidates below keep the commit they were measured on.

**THE CONTESTED HALF, RE-MEASURED 2026-08-27 ON MERGED MASTER `a19a3db7` (seed 1,457,262).
IT IS REACHABLE — AND BOTH HALVES OF D171's PRESCRIPTION ARE REFUTED.**

* **THE GATE IS THE WHOLE OF WHAT IS LEFT, AND LIFTING IT CLOSES THIS ROW'S OWN WITNESS.** On
  top of the D157/D163 composition, deleting `armLayoutContested` from
  `pinArmDeepUncontested` (candidate **U**) makes the repro above **RUN and print `7`**, and
  D171's witness — which is this repro verbatim — with it. Cell-matched against the stripped-
  all base:

  | candidate (all over E+C1+C2) | D88/D100 (2,850) | D112 (1,114) | D156 (1,188) | D139 (36) |
  |---|---|---|---|---|
  | — (the shipped composition) | 8 fwd / 0 back | 0 / 0 | 0 / 0 | 4 / 0 |
  | **P** — the ARGUMENT→PARAMETER hop (D171's named carrier) | 6 / 0 | 0 / 0 | 2 / 0 | 4 / 0 |
  | **U** — the peel un-gated | 34 / 0 | 2 / **4** | 16 / **16** | 8 / 0 |
  | **P + U** | 34 / 0 | 2 / **4** | 18 / **16** | 8 / 0 |
  | **P + U + N** (N = the arm-nominal element key, D173) | 30 / **46** | 4 / **20** | 18 / **14** | 8 / 0 |
  | **P + U + R + N** (R = D158's read leg) | 30 / **46** | 8 / **20** | 42 / **14** | 8 / 0 |

* **D171 NAMES THE WRONG CARRIER, AND THE ABLATION IS WHAT SAYS SO.** That row states: "what
  would close it is a carrier the pin family does not have — the ARGUMENT→PARAMETER hop". It
  was BUILT (`synthArgParamAnns`, inside the `synthDstPinAnns` fixpoint so a parameter pinned
  this round creates destinations for the same round's binding walk). It does **not** close
  this repro on its own, and — the decisive number — it **does not remove a single one of U's
  backward cells**: `U` and `P + U` have the IDENTICAL 4-cell D112 and 16-cell D156 backward
  sets. The carrier is real and it is not the thing the gate is standing in for.
* **AND THE INVERTED ORDER IS REFUTED TOO.** D171's own correction of D156's original
  prescription reads "complete the chain, THEN make the arm honest". With the chain complete
  (P) the arm-nominal element key is **46 backward on D88 and 20 on D112** — WORSE than
  D173's own 40 / 0 re-measurement without it. Completing the chain does not make the key
  safe; it moves the conflation's load onto a wider population.
* **THE COMPOSITION THAT CLOSES ALL FOUR ROWS EXISTS AND IS REFUSED, WITH A PRICE.**
  `E + C1 + C2 + P + U + R + N` makes **every one of the seven witnesses in this family run** —
  D156, D157, D158, D163, D171, and both refutation pins D172 and D173. It costs **80 `runs`
  cells across the three grids** (46 + 20 + 14), every one of them `arm` or `armdiff` at an
  UN-ANNOTATED position, which is D171's "the conflation is load-bearing" measured from the
  other side. `runs` is the win direction and a `runs` → not-runs move is a blocker whatever
  the net, so it is recorded here and not committed. Its own refutation pin is **D236**.
* **WHAT IS ACTUALLY LEFT IS ONE SEAM, NOT A CARRIER.** Every candidate above either leaves the
  chain incomplete or completes it onto a ref-list layer that gives `{[string]: Circle}` and
  `{[string]: {r:i32}}` ONE row. Probed on `P + U + R`, this row's own dump reappears with the
  chain fully pinned: `PIN let=24 -> {[string]:{[string]:Circle}}`,
  `PIN let=14 -> {[string]:Circle}`, and `MV slot=3 name={[string]:Circle} twin=1` twinning
  onto slot 1 `{[string]:{r:i32}}`, whose ref-list row is the only one either spelling has.
  The residue of this row is D173's key, and D173 is not shippable — measured twice now.
* **THE RESIDUE, NAMED.** After the D157/D163 composition the D88/D100 grid's silent
  population is **36 cells, every one `armtwin x declname x nestedmap`** (the 44 it had at
  `a19a3db7` minus this PR's 8), and the D139 grid's is **4, every one
  `armtwin x nestedmap`**. That is this row's contested half and nothing else.

**THE CONTESTED HALF, CLOSED 2026-08-28 ON `28425535` (base seed 1,461,851; shipped seed
1,463,065). IT IS NOT A CARRIER AND IT IS NOT THE GATE. IT IS ONE HEAP TYPE.**

* **THE GATE WAS NEVER THE QUESTION.** Every candidate this row and D171 measured — the peel
  un-gated (U), the argument→parameter hop (P), the read leg (R), the arm-nominal element key
  (N) — asked *which carrier can complete the pin chain*, and each traded `runs` cells because
  a half-named chain crosses two heap types. `armLayoutContestedAt(vi)` is literally
  `repSlotOfTy(uVarTyIx[vi]) >= 0` — "does a declared struct row carry this arm's layout" — so
  the gate that shipped is exactly the predicate that DETECTS the two-heap pair. The fix is to
  stop declining on it and make the pair ONE heap. Filed as **D280**, with a seven-line witness
  that has no map, no list, no pin and no conduit in it at all.
* **WHAT SHIPPED — three rungs, and each was graded ALONE by stripping.** `uVarSTwin`, the
  cross-table twin column (**X1**); the BOX an already-merged payload still needs (**X2**,
  filed as **D281**); and the ref-list / map-value pairwise twin relations learning the
  cross-table equivalence (**X3**). Stripping all three reproduces `28425535`'s compiler
  sources BYTE-FOR-BYTE (`diff -r`, and the seed builds to 1,461,851, master's own fixpoint).
* **THE TRADE, cell-matched on FOUR populations, and `runs` LOST is zero on every one.**

  | population | forward | `runs` LOST | → silent |
  |---|---|---|---|
  | D88/D100 (2,850) + D112 (1,114) + D156 (1,188) + D139 (36) = 5,188 | **106** (+36/+12/+54/+4) | **0** | **0** |
  | the distilled census corpus, 1,477 reps for **250,310** cells + 72 curated | **62 classes / 2,108 cells** | **0** | **0** |
  | census block B, 28,590 cells | **341** | **0** | **0** |
  | `tests/cases` corpus, 2,338 modules | 1 gained, 30 byte-DIFF | **0 lost** | — |

  The grids' silent population goes 112 → 6: ZERO on D88/D100 (was 36), on D112 (was 12) and
  on D139 (was 4), and 60 → 6 on the D156 position grid; block B's silent population goes 1,475 → 1,134
  (5.16% → 3.97%) with its two loud columns unmoved at 9,621 and 7,756.
  **The standing price to beat was D236's 80 `runs` cells. This loses none**, and all three
  refutation pins (D172, D173, D236) still RUN on the shipped seed.
* **BLOCK B ALSO MOVED 7 CELLS WITHIN THE SILENT CLASS, and they are reported rather than
  netted away**: `expected (ref null $type), found (ref $type)` → `... found (ref null $type)`
  on 7 cells that were silent before and are silent after. That is the nullable-niche residue
  D224 sits on, surfacing in a message; no cell left a loud class for it.
* **THE ABLATION IS WHAT SAYS ALL THREE RUNGS ARE LOAD-BEARING, AND IT SAYS SO IN TWO
  DIFFERENT DIRECTIONS.** X2 moves **0** cells on all 5,188 grid cells, **0** classes on the
  distilled corpus and **0** on block B, so no population this programme owns can price it —
  and strip it from the shipped composition and D281's program goes from `runs` to check-clean
  invalid wasm while every one of those instruments still reads 106 forward / 0 backward. That
  is the direction check for a rung that scores zero. X3 gets the opposite one: WITHOUT X1 it
  is not neutral, it is a catastrophe — 81 behavioural classes / **1,907 census cells**
  `runs → not-runs` and 42 `runs` cells lost on the grids — because it claims a cross-table
  twin whose heaps have not been merged. X1 and X3 are ONE landing, not two cuts.
* **A FOURTH RUNG WAS BUILT AND IS REFUSED, WITH THE NUMBER (D224).** Re-asking D219's
  `armLayoutAmbiguousAt` of the HEAP rather than of the layout closes D224's witness and moves
  **0 cells in either direction on all four per-row grids** — and **207 census-block-B cells
  from a `loud emit reject` into `check-clean invalid wasm`**. See D224.
* **AND IT DOES NOT TOUCH WHAT D172, D173 AND D236 PIN.** The arm gets no nominal element key;
  `repElemKeyGo` and `repElemIdGo` are untouched, and `armLayoutContested` still gates
  `pinArmDeepUncontested` exactly as it did. D173's finding stands as filed: the conflation IS
  load-bearing, so the arm must NOT be given its own key — and the way to make the arm honest
  without one is to make the twin share its heap, which is the opposite move.
* **THE RESIDUE.** Six cells of the position grid, all `read x param x arm x notwin x
  d{1,2,3} x {norm,rev}` — the annotation at a CONSUMPTION with no twin declared anywhere.
  That is D158's coordinate with neither mechanism applicable; filed as **D282** and pinned as
  the new `@no-instantiate` specimen.

---

### D157 — an element-preserving LIST CONDUIT between the binding and its destination
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 in D139's closing residue · 4 of the 44 surviving D88/D100 cells (`bare x std x retann` 2, `mapval x std x retann` 2) · pre-existing on `54780e0b`, on `1559d80c` and on merged master `a19a3db7` · RE-FILED 2026-08-27: TWO ROOTS, and the four cells the row also claimed at `mapval x std x {param,paramlocal}` are D163's alone · was THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, now swapped to D158**

Repro:

    import { reverse } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mk(n: i32): Circle {
      const c = { r: n }
      return reverse([c])[0]
    }
    print((mk(7)).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **IT IS NOT A MAP ROW AT ALL** — the container is a `Circle[]` round trip — which is why it
  is filed apart from D155/D156 even though it shares their grid coordinate. Delete the
  `reverse(...)` and `return c` runs: the destination is the declared result `: Circle` and
  `dstPinRetDest` finds it.
* **THE TITLE IS RE-FILED: "std" WAS THE GENERATOR'S SPELLING, NOT THE AXIS.** A HAND-WRITTEN
  `function rv<T>(xs: T[]): T[] { return xs }` in place of `reverse` — nine lines, NO import —
  fails identically. What the conduit has to be is ELEMENT-PRESERVING: a callee whose result
  annotation is spelled exactly as one of its parameters' and whose spelling mentions a type
  parameter, read back with an index. The D88 grid's `route=gen` level spells its conduit
  `idg(x)` (a WHOLE-value hop, which `dstPinFwdArg` already crosses), which is why no `gen`
  cell is in this row's population and why the axis reads as "std" from that grid alone.
* **EIGHT CONTROLS, BUILT AND RUN, IDENTICAL ON `1559d80c` AND ON THIS TREE:**

  | change to the repro | outcome |
  |---|---|
  | (none — the repro as filed) | check-clean invalid wasm |
  | `return c` (delete the conduit) | **RUNS** |
  | annotate `const c: Circle` | **RUNS** |
  | delete `type Dot` | **RUNS** |
  | `type Dot = { q: i32 }` (a non-twin) | **RUNS** |
  | delete `type Shape = Circle \| Sq` | **RUNS** |
  | a hand-written `rv<T>(xs: T[]): T[]` conduit | check-clean invalid wasm |
  | bind the list first: `const xs: Circle[] = [c]` | **RUNS** |

  The EXACT LAYOUT TWIN is required (controls 4 and 5 both RUN — the opposite of D139/D155,
  where both twin-free spellings were LOUD), and **the last control is the one that names the
  SECOND root**: annotating the LIST makes it run, so what the emitter is missing is the list
  literal's element row, not only the pin.
* **ROOT ONE — THE PIN. TWO HALVES, BOTH BUILT, AND THEY ARE A COMPOSITION.**
  * **C1** — `dstPinCallArgs` treats a parameter as an open generic position only when its
    spelling IS a type parameter (`dstPinIsTyParam`). `reverse`'s `xs: T[]` therefore read as
    a CONCRETE destination: `armPinAnnName("T[]")` cuts the element `T`, `variantIndexOf("T")`
    declines, and the position pushed `""` — a destination DISAGREEMENT that VETOED the pin
    the declared result was carrying. The rule the narrow test was reaching for is the one
    that leg's own header states, and `monoAnnHasTyParam` is the monomorphizer's own
    predicate for it.
  * **C2** — `dstPinSrcIs` recognises exactly one transparent hop (`dstPinFwdArg`, a
    whole-VALUE identity conduit). `reverse([c])[0]` is an `Index` over a `Call` over an
    `ArrayLit`, and `dstPinPushAnn`'s ArrayLit arm looks at the delivered expression, not
    through an index into a call's result. Widening `dstPinFwdArg` to `T[] -> T[]` would be
    WRONG — it would claim a `Circle` destination for a `Circle[]` value — so the element hop
    needs its own predicate (`dstPinElemFwdArg`) that only an `Index` may consume.
* **THE PROBE THAT SAID SO, verbatim** (a compiler carrying a dump of every `dstPinAnnIn`
  decision and of every `dstPinCallArgs` push; the repro on `1559d80c` and on C1+C2):

      1559d80c   CA callee=reverse j=0 pty=<T[]> pushed=<>
                 DPA let=913 name=c ret=909 n=1 [0]=<>          <- a VETO, not a miss
      C1 + C2    DPA let=913 name=c ret=909 n=1 [0]=<Circle>    <- the pin fires, correctly

* **ROOT TWO IS D163, AND IT IS WHY C1+C2 MOVE ZERO CELLS.** Disassembled on the A+C1+C2
  compiler (the type indices below are that build's, 2,239 bytes) with the pin firing,
  `mk$m0` builds `struct.new 1` (the `Circle` variant heap) into local 2 declared `(ref 1)` —
  correct — and then `array.new_fixed 8 1` into type 8, `(array (mut (ref null 0)))`, the
  `Dot` struct heap. The list literal's ELEMENT ROW still comes from the checker's structural
  record. Against the hand-annotated sibling (`const c: Circle`) built by the SAME compiler,
  which RUNS, the two modules are the same size and differ in exactly TWO LINES: type 8's
  element and one local in `reverse$m0`. That is D163.
* **MEASURED PER CANDIDATE, ON THE PROVEN BASE** (stripping every candidate reproduces
  `1559d80c` byte-for-byte at 1,452,766):

  | candidate | D139 (36) | D88/D100 (2,850) | D112 (1,114) |
  |---|---|---|---|
  | C1 alone | 0 moved, 0 messages | 0 moved, 0 messages | 0 |
  | C2 alone | 0 moved, 0 messages | 0 moved, 0 messages | 0 |
  | C1 + C2 | 0 moved, 0 messages | 0 moved, **4 same-class MESSAGE moves** | 0 moved, 0 messages |

  The four are `armtwin x declname x {bare,mapval} x std x retann x ann0 x {norm,rev}` — this
  row's own population, exactly. **NEITHER HALF ALONE CHANGES EVEN A MESSAGE**: C1 lifts the
  veto but leaves no destination to collect, C2 finds the destination but the veto still kills
  it. A composition, and its composed effect is still 0 cells.
* **C1 AND C2 ARE NOT IN THE TREE**, for D156's reason and by its precedent: a candidate that
  moves 0 cells and changes 4 messages is not a fix, and shipping it would spend ~90 lines and
  five changed diagnostics for nothing measurable. They are recorded here so they are not
  re-derived: C1 is one line (`dstPinIsTyParam` → `monoAnnHasTyParam` in `dstPinCallArgs`'s
  `open` test, plus the import); C2 is an `Index` arm in `dstPinSrcIsAt` plus
  `dstPinElemFwdArg` / `dstPinElemIsAt`. **LAND THEM WITH D163, NOT BEFORE IT.**
* **THE ROW'S OWN THIRD BULLET IS REFUTED.** It said that with the (D156) peel applied, the 8
  `nestedmap x gen x {param,paramlocal}` cells "become the same class with a different
  message", and claimed them plus 2 `nestedmap x std x retann` as this row's residue. Measured
  here, C1+C2 move NOTHING on any `nestedmap` cell and 0 messages there; the `nestedmap`
  population is D156's, and the 4 `mapval x std x {param,paramlocal}` cells this row also
  claimed are D163's alone — the pin ALREADY fires for them on `1559d80c`
  (`DPA let=917 name=c ret=-1 n=1 [0]=<{[string]:Circle}>`), so no conduit rung can be their
  answer.
* **THE CLOSE (2026-08-27, against merged master `a19a3db7`, seed 1,457,262). C1 AND C2 SHIP
  WITH D163, AND THE ORDER IS MEASURED RATHER THAN OBEYED.** The row said "LAND THEM WITH
  D163, NOT BEFORE IT" and that instruction is now a reading of a grid instead of a deduction
  from one disassembly. One compiler per candidate, produced by STRIPPING candidates out of
  the branch source; stripping all reproduces `a19a3db7`'s `compiler/*.vl` textually and
  compiles to a seed **byte-identical to it at 1,457,262 bytes**, and the stripper's full
  build is byte-identical to the hand-built branch. Cell-matched on the 2,850-cell D88/D100
  grid:

  | candidate | D88/D100 (2,850) | D112 (1,114) | D156 (1,188) | D139 (36) |
  |---|---|---|---|---|
  | C1 — an open generic position is one whose spelling MENTIONS a type param | 0 moved, 0 messages | 0 | 0 | 0 |
  | C2 — `dstPinSrcIs` crosses an INDEXED element-preserving conduit | 0 moved, 0 messages | 0 | 0 | 0 |
  | C1 + C2 | 0 moved, **4 same-class MESSAGE moves** | 0 | 0 | 0 |
  | E — the element row off the element's COMMITTED rep (D163) | **2 moved**, 0 backward | 0 | 0 | **4 moved** |
  | E + C1 + C2 | **6 moved**, 0 backward | 0 | 0 | 4 moved |

  **The union of the singles is 2 and the composition is 6**, and the four extra cells are
  EXACTLY C1+C2's four message cells (`armtwin x declname x {bare,mapval} x std x retann x
  ann0 x {norm,rev}` — this row's own filed population). Pairwise intersection is 0 every way.
  So the composition is a DIRECTION and not a count, in the shape #1972 warns about: a summing
  ablation would have dropped both halves of the pin as inert, and they are the reason four of
  the six cells move at all.
* **THE FOUR INSTRUMENTS, IN ORDER, AND `cmp` FOUND A REAL REGRESSION THE GRIDS DID NOT.**
  Corpus `cmp` FIRST — all 2,327 `tests/cases/**.vl` built with both seeds and sha256-compared:
  the FIRST build of this change differed on **5** modules and one of them,
  `tests/cases/arrays/inferred-union-element-literal.vl`, went from `runs` to
  `emitProgram: unknown variant field in field access`. `const xs = [c, d]` over two ARMS of
  ONE union is a union-BOX list, and the committed-rep rung read only the FIRST element. Two
  positions fixed it — the rung moved BELOW the checker-typed union element, and the bank now
  requires EVERY element to commit to the same name — and the grids moved not one cell either
  way across that fix, which is the whole argument for running `cmp` first. The shipped
  composition differs on **3**: the fixture this change graduates, plus two that RUN
  identically on both sides and were interrogated rather than counted (below).
* **THE TWO REMAINING CORPUS DIFFERENCES ARE INTERROGATED, NOT COUNTED (#1962's lesson).**
  `maps/arm-valued-map-slot-layout-twin-of-its-render.vl` prints `7 7 7 7` on both sides and
  its disassembly differs in **LOCAL INDICES ONLY** — same line count, and no line present on
  one side once integers are normalised. `unions/anon-objlit-into-arm-typed-destination.vl`
  prints `7` nine times on both and its module is **two lines SHORTER**: one
  `(array (mut (ref null N)))` backing and its three-field wrapper struct are no longer
  minted, because the literal's element row now resolves the annotation's existing row instead
  of interning a duplicate. That is the change's intended effect, read off the bytes.
* **RE-GRADED AND CLEAN EVERYWHERE ELSE**: D112 (1,114), D156 (1,188), D111/D117 (1,710),
  D131 (1,732), D181 (1,200) — **0 moved, 0 backward, 0 message moves on every one**. The
  census subsets named below likewise: **0 moved of 720 + 4,302**.
* The pin GRADUATED to `tests/cases/soundness/arm-literal-through-a-list-conduit.vl`, `@run` +
  five `@log 7` (the former specimen verbatim, the hand-written `rv<T>(xs: T[]): T[]` conduit,
  the annotated-list control that always ran, D163's own map-valued witness, and the
  DISAGREEING two-arm literal that the corpus `cmp` above caught). The specimen is now D158's.

---

### D163 — a LIST LITERAL keys its element row off the checker's shape, not off the element's committed rep
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 measuring D157 · 4 of the 44 surviving D88/D100 cells (`armtwin x declname x mapval x std x {param,paramlocal} x ann0 x {norm,rev}`), and the second root under all 4 of D157's · pre-existing on `54780e0b`, on `1559d80c` and on merged master `a19a3db7` · the `paramlocal` half needed one more rung and is filed as D235**

Repro:

    import { reverse } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) { return x }
    function mk(n: i32) {
      const c = Map()
      c["k"] = { r: n }
      return reverse([thru(c)])[0]
    }
    print(((mk(7))["k"] ?? { r: 0 }).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE PIN IS NOT THE PROBLEM HERE AND THE DUMP SAYS SO.** On `1559d80c`, un-patched, the
  destination pin already fires for `c` and already picks the right spelling:
  `CA callee=thru j=0 pty=<{[string]:Circle}> pushed=<{[string]:Circle}>` then
  `DPA let=917 name=c ret=-1 n=1 [0]=<{[string]:Circle}>`. The binding is annotated and the
  program is still check-clean invalid wasm — which is what separates this row from D157,
  whose pin is vetoed.
* **THE FAILING INSTRUCTION, DISASSEMBLED** (`wasm-tools validate`: `func 15 failed to
  validate … at offset 0x67a`; the module is 3,644 bytes, built with `--no-validate` on the
  `1559d80c` seed — the offset and every type index below are that seed's):

      (;@67a ;) array.new_fixed 12 1        <- the one-element list `[thru(c)]`

      (type (;9;)  (array (mut (ref null 1))))   1 = Circle's VARIANT heap
      (type (;11;) (array (mut (ref null 0))))   0 = Dot's STRUCT heap
      (type (;21;) (struct (field … (ref 9)) …)) the Circle-valued map struct
      (type (;22;) (struct (field … (ref 11)) …)) the Dot-valued map struct
      (type (;12;) (array (mut (ref null 22))))  the LIST the literal builds
      (func (;14;) … (result (ref 21)))          thru$m0 returns the Circle-valued map

  `array.new_fixed 12 1` pushes a `(ref 21)` into an `array (mut (ref null 22))`. One map
  layout, two mv slots again — but the disagreement is between the LIST LITERAL's element row
  and the element EXPRESSION's committed rep, one container further out than D123's.
* **THE MECHANISM.** `arrLitElemName` names a literal's element row from its FIRST element
  when that element is an object or list literal, and otherwise from the checker's recorded
  `TyArray.aElem` (`arrLitNominalElemName` → `shapeNominalOfTy`, or `arrLitMapElemName`).
  That record is a STRUCTURAL shape, and `shapeNominalOfTy` asks the struct table before the
  variant table — so with an exact layout twin declared it answers `Dot`, exactly the two
  nominal claimants D39 filed, at the list-element position. The element expression's own
  committed rep — a pinned binding's `letType`, or a callee's declared parameter/result — is
  never consulted.
* **IT IS D39's CHANNEL PROBLEM AT A REP-INTERNING KEY, WHICH IS WHY IT IS NOT A PIN.** The
  three sites that must agree per slot say so in their own headers: `arrLitElemName` (the
  key), `arrLitElemKind` (the wrapper) and `arrLitElemHintTy` (the row) are "one home for the
  rule … the two must agree per slot", and `arrLitElemHintTy`'s nominal arm DECLINES on
  purpose ("a declined hint is a parse, a wrong hint is a silently wrong rep key"). Any fix
  here is a rep-key change and takes `scripts/rep-fuzz-check.sh` with it.
* **THE CONTROL THAT ISOLATES IT**: bind the list to an annotated local first
  (`const xs: Circle[] = [c]` / `const xs: {[string]: Circle}[] = [thru(c)]`) and it RUNS —
  the source annotation gives the CHECKER the element type, so the same code path answers
  correctly. The pin cannot do that: it is an emit-time synthesis, and `nodeTyIx` is written
  by the checker and has no emit-side writer.
* **WHY IT IS FILED SEPARATELY FROM D157** rather than as its second bullet: it has a
  MASTER-reproducible witness of its own (above) in which no pin is missing, it gates 4 cells
  D157 does not, and its fix is in a different file at a different layer (`emit_classify`'s
  ref-list keying, not `emit_collect`'s pin).
* **THE CLOSE — the mechanism CONFIRMED by probe, and the fix is a BANK rather than a rung.**
  A compiler carrying a dump at the ref-list intern site answered in one line, on `a19a3db7`:

      D163's repro (`[thru(c)]`)          D157's repro (`[c]`)
      ALEN name=<{[string]:{r:i32}}>      ALEN name=<Dot>
           kind=3 hint=-1                      kind=1 hint=-1
           cen=<{[string]:{r:i32}}>            cen=<{r: i32}>
           mapn=<{[string]:{r:i32}}>           nom=<Dot>

  — the checker's structural record at both, through `arrLitMapElemName` at one and
  `arrLitNominalElemName` at the other. And the two spellings do NOT collide at the key: the
  same probe printed `repElemIdOfNameTy("{[string]:{r:i32}}") = 4` against
  `repElemIdOfNameTy("{[string]:Circle}") = 5`, with a ref-list row for the first and NONE for
  the second. So the row was not merged — it was never asked for.
* **WHY A BANK AND NOT A RUNG, and it is forced rather than stylistic.** The three classifiers
  (`arrLitElemName` / `arrLitElemKind` / `arrLitElemHintTy`) must "agree per slot" and are
  called from TWO places with different information: `collectA`'s ARENA WALK, which has no
  enclosing scope, and `wasmEmit`'s literal lowering, which has one. A rung asking
  `parentLetOf` would answer at the second and decline at the first, and ONE literal would key
  TWO rows — this row's own defect, in the other direction. `scanArrLitCommit` resolves the
  committed name ONCE, with scope, into a per-ArrayLit-node sidecar (`arrLitCommitName`,
  `annRlSlot`'s idiom), and all three classifiers read the bank.
* **FOUR SOURCES, EVERY ONE AN ANNOTATION** — a bound local's (the destination pin's included),
  a PARAMETER's, a callee's DECLARED result, and a callee's inferred result read through the
  binding that supplies it (`fnRetExprOf`, the hop `dstPinCalleeRetLet` already makes). Never
  an inference: an inference IS the structural record this row exists to stop trusting.
* **THREE GATES, and the second was bought by a corpus regression.** The banked name must
  reach a union ARM (D39's contested seam — everything else keeps the classification it had);
  EVERY element must commit to the SAME name; and the rung sits BELOW the checker-typed UNION
  element, which is a stronger claim than any one element's. Without the last two,
  `const xs = [c, d]` over two arms of one union keyed the list under the first arm and
  `tests/cases/arrays/inferred-union-element-literal.vl` went from `runs` to
  `emitProgram: unknown variant field in field access`. See D157's close for the instrument.
* **POSITION: BEFORE `monomorphize`, and it is the requirement `synthDstPinAnns` has** — the
  destination pin runs there, so the committed name must be read AFTER it. Node indices are
  the originals; a body the monomorphizer clones is simply not banked, which is a decline and
  the conservative direction at a rep key. The HINT still declines (-1) for this arm, for the
  reason `arrLitElemHintTy`'s own header states: its name is a spelling the ELEMENT committed
  to, never a row this function looked up, so there is no faithful arena twin to hand over.
* **MEASURED**: 2 of the 4 filed cells move (`param x {norm,rev}`), 4 more on the 36-cell D139
  grid, 0 backward anywhere, 0 into a silent class. The other 2 filed cells (`paramlocal`)
  needed the conduit to cross an un-annotated intermediate alias and are **D235**, closed in
  the same commit. Full ablation, instruments and re-grades in D157's close.
* Not pinned as a fixture of its own: the graduated
  `tests/cases/soundness/arm-literal-through-a-list-conduit.vl` carries this row's witness as
  its program 4.
---

### D158 — the deciding annotation is at the READ site, not at any delivery
**[CLOSED 2026-08-28 for the repro below — it RUNS and prints `7`] and the close is NOT this row's: it is **D280**'s variant⇄struct heap merge, which no candidate graded against this row was looking for. This row's own count — "EIGHTEEN candidate compilers, NOTHING moves the witness" — was true and was measuring the wrong axis: all eighteen were CARRIERS (a pin, a hop, a read leg, an element key) and the defect was a TABLE. "Stable against every candidate so far" is evidence about the candidates, not about the specimen. All 12 of its D112 cells are `runs` on the shipped seed. **THE POSITION SURVIVES WITHOUT THE TWIN**: the same annotation position with NO layout twin declared anywhere is still check-clean invalid wasm, filed as **D282** and now the `@no-instantiate` SPECIMEN in this row's place. Was: check-clean invalid wasm · found 2026-08-27 in D139's closing residue · all 12 surviving D112 cells · pre-existing on `54780e0b`, on `1559d80c`, on merged master `ff04d74b`, on `a19a3db7` and on `322c07f2` · OPEN, and ABLATED AWAY FROM D156: two roots, not one · ITS CARRIER IS NOW BUILT AND MEASURED (2026-08-27) — see the close below: the leg is complete and correct, and the two things under it are D156's contested gate and D173's key · THE SPECIMEN — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mk(n: i32) {
      const l1 = Map()
      l1["k1"] = { r: n }
      const c = Map()
      c["k2"] = l1
      return c
    }
    const d1: {[string]: Circle} = Map()
    print(((((mk(7))["k2"] ?? d1))["k1"] ?? { r: 0 }).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **NOTHING INSIDE `mk` IS A DESTINATION.** `l1` is delivered to `c["k2"]` and `c` is
  un-annotated; `c` is returned from an un-annotated function. The only nominal claim in the
  program is `d1`'s annotation, and it sits at the `??` DEFAULT of a read three statements and
  one function away. The pin family reads DELIVERIES, and this is a CONSUMPTION.
* **`read=coalvar` IS THE WHOLE COLUMN** — all 12 are at it, 6 at depth 2 and 6 at depth 3 —
  and that level exists in the D112 grid precisely as the control that RAN before D112's own
  fix. It is the coordinate the D112 close named as "the one that says the trigger is the bare
  `Map()` and not the `??`", now on the other side of that fix.
* **DO NOT GROUP IT WITH D156** on the strength of both being nested maps: D156's deliveries
  exist and are vetoed, D158's do not exist. The measurement agrees — B1+B2 moves 2 of the 12
  and breaks 4 elsewhere, so the peel is not this row's answer either.
* **ABLATED, 2026-08-27, AND IT IS TWO ROOTS.** FOURTEEN candidate compilers, plus the base,
  were graded against this row's witness (the repro above, verbatim) and against its 12 filed
  cells — the fourteen on `1559d80c`, and the four that survived rebasing re-run on
  `ff04d74b`. NOTHING moves the witness: not the peel, not the peel plus the fixpoint, not the
  un-hinted-find repair (D172), not the arm-nominal element key (D173), not any composition of
  the four. The only cells of the 12 that any candidate moves are the two whose container
  carries an `ann=outer` annotation — a DELIVERY, which is D156's channel reaching into this
  row's population, not this row's own. **The SHIPPED change moves 0 of the 12.** Two roots,
  and the row's warning was right.
* **AND ITS AXIS NOW HAS A GRID.** `scripts/silent-sweep/d156/` varies annotation POSITION
  (`none` / `dest` / `delivery` / `retann` / `read` / `bindann`) where D88/D100 and D112 vary
  only which LEVEL is annotated. On merged master `ff04d74b` the silent class is monotone in
  that axis — `none` **0** of 216, `bindann` 4, `retann` 6 of 108, `dest` 8, `delivery` 18,
  **`read` 30**
  — so the position where the deciding annotation sits is the strongest single predictor of
  the class in this family, and `read` is its worst coordinate. That is the shape of a
  CHANNEL defect measured rather than argued, and it is the population any future carrier for
  this row has to move.
* **THE CARRIER IS BUILT, IT IS CORRECT, AND IT IS NOT WHAT IS MISSING (2026-08-27, on
  `a19a3db7`).** `dstPinMapRead` — LEG 5, the coalesced map READ — is the shape this row asks
  for, and it is the first leg of the five that is a CONSUMPTION rather than a delivery. The
  direction is inverted and that is the whole leg: a delivery says "the value goes somewhere
  spelled A, so spell it A"; a read says "something spelled A comes OUT of this map at this
  key, so the map's VALUE is A" — the claim is one container further IN and the binding's own
  spelling is the claim WRAPPED, not cut, which is why it cannot be a rung of
  `dstPinPushAnn`, whose two shapes both cut.
* **AN ABSENT CLAIM IS NOT A DISAGREEMENT AT A READ**, and that is the second way the leg
  differs from the other four. A DESTINATION with no nominal claim genuinely constrains the
  binding, so `dstPinPushAnn` pushes `""` and the pin declines. A read constrains nothing —
  `m["k"] ?? Map()` is legal whatever the value spelling is — so a read whose default commits
  to nothing is SILENT rather than a veto. Two reads that each claim, and claim differently,
  still disagree and still decline.
* **THE PROBE, VERBATIM, AND IT NAMES THE BLOCKER EXACTLY.** A compiler carrying a dump of
  every `dstPinCallerDests` gate and every `dstPinMapRead` rung, on this row's own repro:

      CD let=24 fn=33 ret=-1
      CD  rx=30 rll=24
      CD  GATES PASSED, scanning other scopes
      MR let=24 coalesce at ix=46
      MR  left is Index
      MR  key is StrLit; srcIs=1
      MR  dn=<{[string]:Circle}>
      MR  wrapped=<{[string]:{[string]:Circle}}> gate=0      <- armLayoutContested
      DPA let=24 n=0

  The leg reaches the read three statements and one scope away, crosses `mk`'s un-annotated
  result through `dstPinCalleeRetLet`, reads `d1`'s annotation off the `??` default, and
  computes **exactly the right pin**. It is then refused by `armLayoutContested` — D156's
  contested gate, and D171's. The row's "two roots" is right and the second root is now
  NAMED: it is not a missing carrier, it is the gate.
* **AND LIFTING THE GATE IS STILL NOT ENOUGH — the THIRD root, measured.** With the peel
  un-gated the leg fires, the gate passes, and the WHOLE CHAIN PINS: `PIN let=24 ->
  {[string]:{[string]:Circle}}` and `PIN let=14 -> {[string]:Circle}`. The program STILL
  fails, and the same dump says why — `MV slot=3 name={[string]:Circle} twin=1`, twinning onto
  slot 1 `{[string]:{r:i32}}`, because the ref-list interner gave the two map spellings ONE
  row. That is D173, one container out, exactly as D171 describes it. Adding D173's rung makes
  this row's repro **RUN** — and costs 46 `runs` cells on the D88 grid and 20 on D112, so it
  is refused. **Eighteen candidate compilers have now been graded against this witness** (the
  fourteen this row already records, plus the committed-rep element row, the pin's two conduit
  halves and the argument→parameter hop); the only two that move it are the two that are
  refused, and the composition that closes it is filed as **D236**.
* THE SPECIMEN, from this PR: pinned as
  `tests/cases/soundness/xfail-miscompile-read-site-annotation-nested-map.vl`,
  `@no-instantiate`, kept byte-for-byte identical to `INVALID_MODULE_SRC` below its header.
  It was chosen for STABILITY and not only for liveness — its program has NO delivery
  anywhere, so the whole pin family misses it by construction rather than by omission, which
  is what the five swaps in one day recorded in that file's genealogy were missing.

* **RE-GRADED ON `322c07f2` AND STILL EXACTLY AS FILED (2026-08-27), and this row now carries
  a PROGRAM-level ablation of its own ingredients rather than only a compiler-level one.** The
  eighteen candidate compilers above vary the FIX; these four vary the WITNESS, one
  declaration at a time, every one built and run:

  | change to the repro | outcome on `322c07f2` |
  |---|---|
  | (none — the filed repro) | **check-clean invalid wasm** |
  | delete `type Dot = { r: i32 }` (the layout twin) | **loud emit reject** — `unsupported map value type (no rep for a union-member struct …)` |
  | delete the union (`Circle`/`Dot` both plain structs, no `Shape`) | **runs**, prints 7 |
  | delete both (`Circle` alone) | **runs**, prints 7 |

  **BOTH ingredients are load-bearing and neither alone produces the class.** Without the twin
  the same program takes the LOUD floor, so the twin is not incidental colour — it is the row
  the emitter keys instead of `Circle`, which `collectS`'s union-member skip left with no
  `sNames` row at all. Without the union `Circle` has its own row and the two sides agree. That
  is D171/D173's seam stated as a property of the PROGRAM, and it is why this row's answer is
  the arm-nominal element key and why that key is priced at 80 `runs` cells (**D236**).

* **NOT MOVED BY D208's CLOSE, NOR BY EITHER D209 CANDIDATE, and that is measured rather than
  assumed (2026-08-27).**
  D209 is a sibling adoption defect at the same resolver, so the question had to be asked. It
  is a different root: probed on this row's own repro the single-match arm reports
  `SIO1 first=0 nm=Dot noderow=0 tyname={r: i32}` — the checker's recorded type and the adopted
  row AGREE here (both name the twin's row), where D209's whole content is that they disagree.
  Graded: **0 of `d156`'s 1,188 cells move in any direction** — including all 60 of its silent
  ones — and this row's witness is byte-identical under the two compilers on the corpus `cmp`.

  **AND THE MECHANISM, WHICH IS STRONGER THAN THE GRID'S ZERO.** A counter build of the
  merged compiler, run on this row's own filed repro, reports `c=0 cdec=0 r4=0 r4ans=0`:
  the read rung is not even REACHED (no code-16 field read exists in the program) and
  `rlElemStructRow` never reaches its restored rung. **Neither changed line executes on
  D158's program at all**, so the row cannot move under this change for a reason that does
  not depend on the population a grid happened to sample.

---

### D235 — the element-preserving conduit whose body hands its parameter back through an UN-ANNOTATED ALIAS
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 in D163's closing residue · the 2 `paramlocal` cells of D163's own filed 4 (`armtwin x declname x mapval x std x paramlocal x ann0 x {norm,rev}`) · pre-existing on `54780e0b`, on `1559d80c` and on merged master `a19a3db7`**

Repro (the D88/D100 grid cell `armtwin_declname_mapval_std_paramlocal_ann0_norm`, verbatim):

    import { reverse } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) {
      const y = x
      return y
    }
    function mk(n: i32) {
      const c = Map()
      c["k"] = { r: n }
      return reverse([thru(c)])[0]
    }
    print(((mk(7))["k"] ?? { r: 0 }).r)

* **IT IS D163's REPRO WITH ONE LINE ADDED, and the line is `const y = x`.** D163's committed-
  rep walk crosses an un-annotated CALLEE result by asking which binding supplies it
  (`fnRetExprOf`, the hop `dstPinCalleeRetLet` already makes) — and then stopped, because
  `alcCommitName`'s `Ident` arm answered `""` for a binding with no annotation of its own.
  `y` has none; `x` has the one that decides the program.
* **AN UN-ANNOTATED BINDING IS A LINK IN THE CHAIN, NOT THE END OF IT.** That is
  `dstPinLocalDest`'s own stated rule — "recorded as a destination it would answer `""`
  through `armPinAnnName` and veto the pin the link exists to carry" — and
  `retLocalLetOfBlock` is the family's shared implementation of it. The fix is the same rule
  at the committed-rep walk: an un-annotated binding recurses into its INITIALIZER. An alias
  RE-NAMES a value; it does not re-rep one.
* **MEASURED AS ITS OWN RUNG, on the proven ablation base.** Over the D157/D163 composition it
  is **+2 on the 2,850-cell D88/D100 grid and 0 everywhere else, 0 backward, 0 into a silent
  class, 0 message moves** — D111/D117 (1,710), D131 (1,732), D181 (1,200), D112 (1,114),
  D156 (1,188), D139 (36) all unmoved, and the corpus `cmp` is byte-identical to the
  composition without it on all 2,327 modules.
* **WHY IT IS FILED RATHER THAN FOLDED INTO D163**: it has a master-reproducible witness of its
  own, it gates 2 cells D163's own fix does not, and D163's row published those 2 cells as its
  population — a close that quietly moved only half of a filed set would be the
  one-directional staleness this document exists to prevent.
* Not pinned as a fixture of its own: the graduated
  `tests/cases/soundness/arm-literal-through-a-list-conduit.vl` carries the conduit class.

---

### D236 — A REFUTATION PIN: the composition that closes all four rows of this family costs 80 working programs
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-27 closing D157/D163 · the witness below is one of 80 `runs` cells that redden under `P + U + R + N`, the only composition measured that makes D156, D157, D158, D163, D171, D172 and D173 all run · the composition is REFUSED, so this program is the tripwire on it**

Repro (the D88/D100 grid cell `arm_declname_mapval_std_local_ann1_norm`, verbatim — eleven
lines, NO layout twin declared, prints `7` on this tree):

    import { reverse } from "std:array"
    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function mk(n: i32) {
      const c: {[string]: Circle} = Map()
      c["k"] = { r: n }
      const d = c
      return reverse([d])[0]
    }
    print(((mk(7))["k"] ?? { r: 0 }).r)
    // vl run on this tree: 7
    // vl run under `E + C1 + C2 + P + U + R + N`:
    //   Invalid input WebAssembly code at offset 1589:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **WHY A PIN AND NOT A DEFECT REPRO.** There is no twin in this program and no ambiguity in
  it at all: `c` is annotated, `d` aliases it, and the list round-trips through a generic
  conduit. It is well-typed at the wasm level only because `Circle` and the anonymous
  `{r:i32}` share ONE ref-list row — the conflation D171 records as load-bearing. Give the arm
  its own key (D173's rung) and the two stop meeting, and this program stops emitting. **This
  is D173's own finding at a WIDER population**: D173 measured 40 backward on this grid with
  the chain incomplete; with the chain COMPLETE (the argument→parameter hop, the un-gated
  peel and the read leg) it is **46**.
* **THE WHOLE PRICE, cell-matched against `a19a3db7` (stripped-all seed 1,457,262).** 80 `runs`
  cells lost: **46** on the 2,850-cell D88/D100 grid, **20** on the 1,114-cell D112 grid, **14**
  on the 1,188-cell D156 position grid; 0 on the 36-cell D139 grid. Every one of the 46 is
  `arm` or `armdiff` at an UN-ANNOTATED position (20 `arm x declname`, 20 `armdiff x declname`,
  6 `armtwin x declname`). Against 30 + 4 + 42 forward — a net that is positive on the count
  and negative on the only number that decides a floor (D93's rule: the count of `correct`
  cells LOST).
* **WHAT IT PINS, precisely.** The day someone lands the arm-nominal element key — with or
  without the chain completed — this program flips, and the flip is the signal that the
  variant/struct ref-list seam has moved without the un-annotated positions being carried
  first. D172 and D173 pin the same seam from the un-gated peel's side; this one pins it from
  the FULL composition's side, which is the only side on which every witness in the family
  runs.
* Not pinned as a fixture: the grid file above regenerates from
  `scripts/silent-sweep/d88/gen88.py` and a corpus copy would freeze one cell of a population
  the grid re-derives in full.
* **THE FAMILY CLOSED WITHOUT PAYING THIS (2026-08-28, D280). THE PIN HELD AND IT IS WHY.**
  D156, D157, D158, D163 and D171 all RUN on the shipped seed, at **106 forward / 0 backward**
  across 5,188 grid cells and **0 `runs` lost across 250,310 census cells** — against this
  composition's 80 `runs` cells lost. This program is one of the 80 and it still prints `7`.
  What the three pins (D172, D173, this one) were collectively saying is that the arm must not
  be given its own ELEMENT KEY, because the un-annotated positions ride the conflation; they
  were read as "so the family cannot close". The unexamined third option is that the arm and
  the twin become ONE HEAP, at which point there is no conflation left to be load-bearing.
  This row stays a pin: `repElemKeyGo` and `repElemIdGo` are untouched and `P + U + R + N`
  costs exactly what it cost.

---

### D179 — [CLOSED 2026-08-27] a COMPILER TRAP: `for-in` over an undeclared list whose element field holds a union arm
**now a loud emit reject · was `compiler trap` on `a19a3db7` · found 2026-08-27 by the CENSUS grid (`scripts/silent-sweep/census/`), block D · the ONLY `compiler trap` the inventory's live population ever had, and the first program-level witness that column ever got**

Repro (MINIMISED at the close — see the correction below; the originally filed nine-line
program had a `Sq2` arm and an `if zz.r is Cir2` body, and neither is load-bearing):

    type Cir2 = { c2: i32 }
    type Shape2 = Cir2 | i32
    const c = [{ r: { c2: 1 } }]
    let hit = 0
    for zz in c {
      hit = 7
    }
    print(hit)
    // `811f8102`: vl check rc 0 with NO diagnostics; vl run AND vl build:
    //   wasm trap: out of bounds array access   (inside the COMPILER)
    // `vl build -o` wrote NO module, which is what separated this from a program trap.
    // Now: emitProgram: ref valtype with no interned shape — the SAME message the index
    // spelling of this program has always given, so the two spellings finally agree.

* **THE ROW'S ORIGINAL REPRO OVERSTATED ITS OWN SHAPE, AND THE CORRECTION IS THE FINDING.**
  As filed it read *"NINE LINES … the only declarations are the union the payload's field is
  an arm of"*, with the trap demonstrated through `if zz.r is Cir2`. Building the controls
  showed **the `is` is not load-bearing at all** — delete that line, leave a body of
  `hit = 7`, and the compiler traps identically, same backtrace, same frame. The second arm
  `Sq2` is not load-bearing either; `Cir2 | i32` is enough. The trap is in the loop's
  BINDING, not in any read of the element, so the witness above is the true minimum at seven
  lines. The original program still traps — it is a superset — but it pointed at the wrong
  half of itself.
* **THE COMPILER'S OWN ARENA READ IS OUT OF BOUNDS**, so this is not an emitted-program
  defect at all — it is `emitFail does not halt` territory: a recorded failure followed by
  continued emission over a parallel table. The third `vl build` stage is what says so; the
  run stage alone cannot tell a compiler trap from a program trap.
* **ELEVEN CONTROLS, each one change from the MINIMISED repro above**, every one built and
  run rather than reasoned:

  | change | outcome on `811f8102` |
  |---|---|
  | (none — the minimised repro) | **compiler trap** |
  | put the `if zz.r is Cir2 { hit = 7 }` body back, and a second arm `Sq2` | **compiler trap** (the originally filed nine-line program) |
  | wrap the statements in `function rd() { … }` and call it | **compiler trap** (both scopes) |
  | `if c[0].r is Cir2 { … }` instead of `for-in` | loud emit reject (`ref valtype with no interned shape`) |
  | build the container as a map and read `c["k"] ?? …` | loud emit reject (same message) |
  | declare `type Circle = { r: Shape2 }` and annotate `const c: Circle[]` | RUNS |
  | `type Inner = { q: i32 }` field instead of a union arm | RUNS |
  | `const c = [{ c2: 1 }]` — the arm directly, not nested in a struct | RUNS |
  | delete the `type` lines (no union declared anywhere) | RUNS |
  | declare `Cir2` but NOT the union (`type Cir2 = { c2: i32 }` alone) | RUNS |
  | add any second, unrelated ref list (`const pad: Other[] = [{ o: 1 }]`) | loud emit reject |

* **WHAT IS LOAD-BEARING, since the `is` is not.** The payload's inner layout must match an
  arm of a DECLARED union. That is `collectS` skipping a union member again — `Cir2`
  gets no `sNames` row, so nothing interns the nested shape.

* **THE `for-in` CONTROL IS THE ONE THAT NAMES THE SITE.** The index read reaches a guarded
  path that refuses loudly; `for-in` reaches the same shape through a lowering that does not
  consult the guard, and the unguarded read is the trap. That is the same asymmetry Root B
  records for the map view, one container out.

* **THE SITE, from a SYMBOLIC backtrace.** `vl build --names` embeds the wasm name section, so
  building the compiler with that flag and running the repro under `--compiler` prints
  `forInElemKind ← declareForInLocals ← collectStartLocals ← emitStartFnCode` in place of
  `<wasm function 1861>`. The read is `rlElemKindTbl[rslot]` in `forInElemKind`. Worth knowing
  generally: any compiler trap in this inventory can be localised this way in two commands.

* **THE MISS SENTINEL IS `0`, NOT -1, AND THAT IS THE WHOLE DEFECT.** `refListSlotOfExpr`
  CLAMPS a miss (`const s = rlSlotByName(nm); if s < 0 { return 0 }`), so a receiver with no
  interned ref-list slot is indistinguishable from slot 0 and **no `< 0` test at any of its 32
  call sites can ever find it**. With no ref list interned anywhere in the module
  `rlElemKindTbl` is EMPTY, and `rlElemKindTbl[0]` is an out-of-bounds array access inside the
  compiler. Control 11 is the proof: intern any other ref list and index 0 is in bounds, the
  ladder proceeds, and the program takes a loud reject instead. This is D211's mechanism and
  D221's — a "no answer" sentinel that collides with a real value — one table over.

* **PATTERN 1, THE COMPLEMENT ALREADY WRITTEN AND NEVER CALLED — AND THE TREE HAD ALREADY
  WRITTEN THE MECHANISM DOWN.** `forInIterUnionElemName`, one screenful down the same file,
  asks THIS resolver the same question about the same slot and has carried the exact guard
  since it was written: `if slot < 0 || slot >= rlElemKindTbl.length { return "" }`. The fix
  is that line, in `forInElemKind`, falling through to `return null`. It is not a guard anyone
  had to reason out: `emit_classify.vl` line 29328 already says it in full, verbatim —

  > `refListSlotOfExpr` falls back to slot 0 for an UN-INTERNED element name (the ref-list
  > tables can be empty when the only ref-array-shaped type is never interned — e.g. a
  > nullable array-of-map field of a union arm). Bound-check before the read, the idiom the
  > sibling ref-list classifiers already use — else `rlElemKindTbl[0]` on an empty table is a
  > compiler-internal OOB trap. (Same guard added to the `.pop()` twin above.)

* **A STATIC CENSUS OF THE FAMILY: 22 OF 32 CALL SITES ALREADY BOUND-TEST.** Of
  `refListSlotOfExpr`'s 32 call sites in `emit_classify.vl`, 22 carry the
  `slot >= 0 && slot < rl*.length` idiom inline; the rest hand the slot straight to a callee.
  Both closure-side callees bound-test internally (`cloArrSlotSigKey` and `cloArrSlotRetName`
  each open `if slot < 0 || slot >= rlElemName.length { return "" }`). **`rlElemVariantRow`
  does NOT** — it reads `rlElemName[slot]` on its first line — but its only for-in caller,
  `forInRefArrayVariantIdx`, runs solely under `fiEk == "variant"`, and after this fix
  `forInElemKind` cannot answer `"variant"` on an empty table, so that leg is gated rather
  than guarded. `forInElemKind` was the one site that indexed the table raw. The defect was
  therefore never a missing idea — it is one site that never got the idiom the file had
  already standardised around it, which is why it survived to be found by a 250,238-cell grid
  rather than by review.

* **THE FIX CANNOT MOVE A WORKING PROGRAM, BY CONSTRUCTION.** `rslot` is never negative (the
  clamp), and any `rslot > 0` came from `rlSlotByName` and is therefore in bounds — so the new
  guard fires **iff `rlElemKindTbl` is empty**, which is exactly and only the state in which
  every read below it already trapped. The census is what confirms it rather than the argument.

* **THE LOUD MESSAGE WAS ALREADY RECORDED; THE TRAP ONLY PREVENTED IT BEING PRINTED.** The close
  reports `ref valtype with no interned shape`, not the `unsupported for-in iterable` that
  `declareForInLocals` raises on a `null` element kind — `fbValtype`'s guard had already
  recorded its failure in an earlier section, and `emitFail` records without halting. That is
  the discipline's exact shape: a recorded failure, emission continuing, and one unbounded
  table read downstream reaching the process first.
* Population in the census: 2 cells (both spellings of the same program), out of 250,238 —
  **both in block D, and block D is the only block that has one**: block A was graded in full
  at `a19a3db7` (150,224 cells) and contains **zero** `compiler trap` cells, which is what
  makes block D the right target for a cheap re-grade rather than a guess.

* **THE CLOSE, MEASURED — census block D re-graded cell-matched, 9,000 cells, on the current
  base: `811f8102` (seed 1,461,131) → this branch merged (seed 1,461,174):**

      0 runs → not-runs · 0 → silent · 2 compiler trap → loud emit reject
      8,998 of 9,000 unchanged · compiler trap column 2 → 0 · SILENT TOTAL 55 → 53

  **THE TWO TRAP CELLS SURVIVED #1973 AND #1975**, which is why this was re-measured at each
  base rather than inherited — both of those landings changed list-literal element handling,
  the same neighbourhood as this row's root. Measured three times, on three bases, with the
  identical result **0 / 0 / 2** every time:

  | base | seed | branch seed | block D result |
  |---|---|---|---|
  | `a19a3db7` | 1,457,262 | 1,457,305 | 0 / 0 / 2 · silent 67 → 65 |
  | `75eb1f17` (after #1973) | 1,457,423 | 1,457,466 | 0 / 0 / 2 · silent 55 → 53 |
  | `811f8102` (after #1975) | 1,461,131 | 1,461,174 | 0 / 0 / 2 · silent 55 → 53 |

  #1973 moved block D's `check-clean invalid wasm` 65 → 53 and its `runs` 7,157 → 7,187
  (D180/D183); **#1975 moved no block-D cell at all**; and neither touched either
  `compiler trap` cell. Same two cells throughout, same coordinates —
  `cont=forin, rep=arm, declness=nodecl, twin=none`, D179's exactly.

  The FULL census after-pass is NOT run on this branch — `CLAUDE.md` item 6 now has the
  integrator run it once on the merged result. Block A's base grade, block D's matched pair
  and the corpus `cmp` are what this row rests on; **blocks B, C and E are ungraded on the
  branch side and this row does not claim them.**

* **CORPUS `cmp`, THE INSTRUMENT A GRID CANNOT SUBSTITUTE FOR.** Every `tests/cases` program
  built with both seeds and the MODULES compared byte-for-byte: **2,332 files, 0 byte
  differences, 0 rc differences**, 1,898 byte-identical modules and 432 identical failure
  messages. The only two files that move are this row's own fixture and D227's, each
  `compiler trap` → loud emit reject. #1975 is why this is stated separately from the grids:
  its own corpus `cmp` caught a `runs` → loud regression (`[c, d]` over two arms of one union)
  that **none of its grids moved a single cell on**.

---

### D180 — [CLOSED 2026-08-27] a nested list built through un-annotated intermediate locals, with NOTHING declared
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`; ONE ROOT WITH D183, and the root is a missing rung in `arrLitIsRef`. Was: check-clean invalid wasm · found 2026-08-27 by the CENSUS grid, block D and block C · the first row in this inventory with no `type` declaration, no union, no map and no object anywhere in the program**

**THE ROOT: `arrLitIsRef` classifies a list literal from its FIRST ELEMENT'S NODE, and its
nested arm is gated on `e0 is ArrayLit`.** `const c = [lv1]` where `lv1` is a `string[]` LOCAL
puts an IDENT there — no object literal, no nested literal, no lambda, no map, no declared
shape — so every rung declined, no ref-list row was interned, the literal built on the i32
backing, and a `(ref $strlist)` element went into an `(array (mut i32))`. That is the identical
hole the UNION, MAP and NOMINAL rungs each closed for their own element kind ("a checker-typed
element the first-element probes cannot see — an IDENT (`[c]`) or a CALL"), at the last element
kind that still had it.

**THE PREDICATE WAS ALREADY WRITTEN AND CALLED FROM ONE PLACE.** `arrLitNestedElemName` /
`arrLitNestedElemKind` were added for the EMPTY-literal half of this same hole
(`const outer = []` + `outer.push(inner)`) and are asked only inside
`collectA`'s `nd.arrElems.length == 0` branch. Reading them as the fourth last rung of
`arrLitIsRef` / `arrLitElemName` / `arrLitElemKind` — arm for arm, as those three require —
closes the non-empty half; `collectA`'s existing `arrLitIsRef` branch then interns the row and
flips the same wrapper/backing flags with no change of its own.

**THE LOUD FLOOR HAD NO RUNG EITHER, WHICH IS WHY THIS WAS SILENT AND THE `i32` CONTROL WAS
NOT.** The i32-list fallback's floor ladder refuses an array element (`exprArray` /
`exprRefArray`), a struct element, a union-ARM element and a MAP element — and has nothing for
a `string[]` / `f64[]` / `i64[]` element. `exprArray` claims the i32 case, which is exactly why
`i32` elements were the loud control and every other leaf was silent.

**BOUNDED BY `tyNestedArrLeafSupported`, deliberately.** An `f32[]` leaf and a doubly-nested
`string[][]` leaf still decline, because that predicate's header records the set where
`arrLitNestedElemKind` and `refArrElemKind(<elem>[])` agree; outside it the two disagree and the
outer backing would be typed against the wrong wrapper. Both declined leaves keep the LOUD
outcome master gives them, re-measured on this tree: `const c: f32[] = [1.5]  const dd = [c]`
is `emitProgram: index receiver is not an array or string` and the depth-3 all-inferred
`[[["seven"]]]` chain is `emitProgram: nested arrays are not supported`, before and after.

Fixture: `tests/cases/arrays/nested-list-elem-from-ident.vl` (this repro, D183's, the
hand-written generic conduit, depth 3, the f64 leaf, and the two controls that already ran).

Repro:

    function rd() {
      const lv1 = ["seven"]
      const c = [lv1]
      const g0 = c
      if g0.length > 0 {
        const g1 = g0[0]
        if g1.length > 0 {
          if (g1[0]) == "seven" { print(7) } else { print(0) }
        } else { print(0) }
      } else { print(0) }
    }
    rd()
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected i32, found (ref $type)

* **THE WHOLE PROGRAM IS A LIST OF LISTS OF `string`.** There is no nominal identity in it to
  get wrong, which is why no grid in this programme could contain it: every one of them
  declared a shape in order to have a shape to twin.
* **THE DECIDING AXIS IS *WHICH* LEVEL CARRIES THE ANNOTATION, and no earlier grid varied it.**
  `annpos` (this inventory's axis) only ever annotated the OUTERMOST binding. The census's
  `annpat` axis annotates intermediate levels, and at depth three it is the MIDDLE one that
  matters:

  | depth-3 spelling (`string[][][]`, outer always annotated) | outcome |
  |---|---|
  | no intermediate annotation | **check-clean invalid wasm** |
  | innermost annotated (`lv2: string[]`) | **check-clean invalid wasm** |
  | middle annotated (`lv1: string[][]`) | RUNS |
  | both annotated | RUNS |
  | one nested literal `[[["seven"]]]`, no intermediates | RUNS |

* **AT DEPTH TWO THE ROW IS THE UN-ANNOTATED SPELLING**, and the controls invert:

  | depth-2 spelling | outcome |
  |---|---|
  | nothing annotated (the repro) | **check-clean invalid wasm** |
  | `lv1: string[]` only | **check-clean invalid wasm** |
  | `c: string[][]` only | RUNS |
  | both | RUNS |
  | one nested literal `[["seven"]]` | RUNS |
  | the same at MODULE scope | loud emit reject (`nested arrays are not supported`) |
  | `i32` elements instead of `string` | loud emit reject (same message) |

* **THE LAST TWO CONTROLS ARE THE ROW'S BOUNDARY AND ALSO ITS WARNING.** `nested arrays are
  not supported` is the loud refusal this shape is meant to get; it fires at module scope and
  for `i32`, and does not fire for a `string` element inside a function. So the refusal
  exists and has a hole in it, and the hole is a miscompile — the same relationship Root A
  records between the seven narrowing forms.
* Census population: the `expected i32, found (ref $type)` cluster is **552 cells whose only
  two constants are `declness=nodecl` and `rep=string`** — this row's own signature — plus
  120 more in the monomorphized variant of the same message. Across the WHOLE census the
  subset with nothing declared and no twin, union or alias is **120 silent cells of 7,105**.

---

### D181 — [CLOSED 2026-08-27] a container type ALIAS plus one value of it, with no twin and no union
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. Was: check-clean invalid wasm · found 2026-08-27 by the CENSUS grid, blocks A and C · the `claimant count` axis firing ALONE, which D88's grid could not show because its claimant levels were entangled with arm-ness**

Repro:

    type Box1 = {[string]: i32}[]
    const _sp1: Box1 = []
    const lv1 = Map()
    lv1["k0"] = 7
    const c: {[string]: i32}[] = [lv1]
    function rd() {
      const g0 = c
      if g0.length > 0 {
        const g1 = (g0[0])["k0"] ?? 0
        if (g1) == 7 { print(7) } else { print(0) }
      } else { print(0) }
    }
    rd()
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

**THE ROW'S OWN TITLE IS REFUTED, AND THE REFUTATION WAS BUILT RATHER THAN REASONED.** The
claimant COUNT is not the ingredient and the second declaration decides nothing. The
ingredient is the ALIAS BODY — an ARRAY whose leaf element is a MAP — and this six-program
control table separates the two readings:

| program | on merged master `e04b1567` |
|---|---|
| `type Box1 = {[string]: i32}[]` declared and NEVER annotated onto anything | **runs** |
| …annotated onto a binding that is then READ (`const c: Box1 = [m]; print(c.length)`) | **LOUD check reject** — `field 'length' is not on every member of Box1` |
| …annotated onto a PARAMETER that is read | **LOUD check reject**, same message |
| …annotated onto a RETURN that is read | **LOUD check reject**, same message |
| …annotated onto an UNREAD binding (`const _sp1: Box1 = []`), beside a structurally-spelled `{[string]: i32}[]` that carries the reads | **check-clean INVALID WASM** |
| the repro as filed | **check-clean INVALID WASM** |

So the alias must be USED for anything to happen at all, and it must be used at a binding
nobody READS for the failure to be silent rather than loud — the same LID
`tests/cases/types/array-alias-return-unread.vl` records for the scalar-leaf arm: *remove the
read and the silent miscompile is what is left*. `_sp1` is silent because a `_`-prefixed
binding is one the language forbids reading. Read the row's `keep type Box1 = …, delete
const _sp1 | RUNS` line below as **"the alias must be used"**, never as "two claimants of one
layout"; and the census's `claim` axis is the only spelling in that grid that USES a
container alias, which is why the rescue set reads as a claimant count.

**THE MECHANISM, OFF THE DISASSEMBLY RATHER THAN OFF THE CLASS.** `singleAliasMemberTyIx`'s
`TyArray` arm carried exactly two leaf tests, each named for the renderer that is faithful
for its leaf — `arrSpineIsScalar` (`TyPrim`, faithful under `tyToEmitName`) and
`arrSpineIsNominal` (declared struct, faithful under `tyToNominalName`). A **MAP** leaf
answered neither, so the alias stayed OPAQUE, and `collectU` minted it a one-variant union
ROW: `uDeclared` set, the shared `{tag: i32, value: anyref}` box minted, and `isUName("Box1")`
claiming every `Box1`-annotated cell for that box while the initializer lowered a list
wrapper. Both halves of the mismatch sit in one line of the witness's `wasm-dis` — the CELL's
declared heap type and its INITIALIZER's, printed side by side (`$1` is the union box,
`$6` the i32-list wrapper, `$10` the list-of-map wrapper):

* on `e04b1567`: `(global $global$2 (mut (ref $1)) (struct.new $6 …))`
* on the branch: `(global $global$2 (mut (ref $10)) (struct.new $10 …))`

`$10` is the SAME heap type the program's own `{[string]: i32}[]` globals carry, so after the
fix there is ONE heap type where there were two wrong ones. The cell got the union box from
the annotation ladder and the value got the i32-list catch-all from the `[]` literal; NEITHER
was the list-of-map wrapper the program needed. There was no pair of legitimate heaps to keep
apart, so this needed no KEY (#1959) and no CHANNEL (D39): the complement was already written
(#1963's pattern). The bare `TyMap` member is claimed one arm below with **no gate at all**,
and D-ALIASMAP's header states the reason in a sentence about the MAP and not about the
wrapper — *"a map alias has no nominal route to lose because a map name is never a route"*.

**Fixed by `arrSpineIsMap`** (`compiler/typecheck.vl`), the third `arrSpineIs*` twin, plus
the same nominal-render leg `arrSpineIsNominal` already takes in
`transparentMemberEmitName` (D187 is the refutation pin for that leg). Fixture:
`tests/cases/types/array-alias-map-element.vl`.

* **THE PAYLOAD IS `i32`.** No object shape, no union, no twin, no `Circle`, no arm — so the
  nominal-identity story that D155–D158 share cannot be this row's, and the ingredient is
  the SECOND DECLARATION OF THE SAME CONTAINER LAYOUT.  *(Read this bullet against the
  refutation above: what it correctly reports is that BOTH the alias and a use of it are
  needed; what it mis-attributes is the "second declaration" — the first is the alias body,
  not a claimant.)*
* **BOTH HALVES ARE REQUIRED, AND EACH ALONE IS HARMLESS:**

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | delete the alias AND the spare | RUNS |
  | keep `type Box1 = …`, delete `const _sp1` | RUNS |
  | keep `const _sp1: {[string]: i32}[] = []`, delete the alias | RUNS |
  | a SECOND identical alias and spare (`Box2`) | check-clean invalid wasm (same) |
  | annotate `const lv1: {[string]: i32}` | check-clean invalid wasm (does NOT rescue) |
  | drop the list layer — a bare `{[string]: i32}` with its own alias and spare | RUNS |

* **THE LIST-OF-MAP LAYER IS PART OF IT.** The same alias-plus-spare over a bare map runs;
  it is the map inside a list that makes the second declaration of the layout decide a
  different rep for the same cell.
* Census population: **2,254 cells whose ONLY one-step rescue is `claim=0`**, all at
  `cont=list_of_map` — the largest single rescue-set family in the census.
* **RE-GRADED ON BOTH LEGS OF MERGED MASTER `e04b1567`, ALL 250,238 CELLS.** The family was
  re-derived from this tree's own grading of the merged base rather than read from any
  published run — same 2,254, same witness — and **every one of the 2,254 now RUNS**.
  Census-wide: silent **15,183 → 10,701**, all **4,482** moved cells `check-clean invalid
  wasm` → `runs`, **0 backward and 0 lateral — both loud columns identical to the cell in all
  five blocks**, and `runs but wrong value` / `trap_loads` are 0 on both legs. The adjacent
  `claim,cont` family is **1,430** on the merged base (it GREW from 1,296 because #1969
  rescued `cont` siblings and this family's key is the SET of rescuing axes) and **all 1,430
  close too**. The 320-cell residue measured inside it on `1e81b0f3` was filed as D189 and is
  closed by #1969's `letMapDestShape`; D189 is now the refutation pin for that pair. Numbers,
  the per-axis spread and the per-coordinate interaction with the two landings:
  `scripts/silent-sweep/d181/README.md`.

---

### D182 — [CLOSED 2026-08-27 by D203] a struct with a NULLABLE FIELD, stored in a container and read back
**check-clean invalid wasm, closed 2026-08-27 by D203's destination rung · found 2026-08-27 by the CENSUS grid, all blocks · `pval=nullfield` is the highest-rate level of any axis level in the census (3,724 of 8,448 cells in block A alone)**

Repro:

    type Circle = { r: i32 | null }
    type WS1 = { f: {[string]: Circle} }
    const lv1 = Map()
    lv1["k0"] = { r: null }
    const c: WS1 = { f: lv1 }
    const g1 = (c.f)["k0"] ?? { r: null }
    if g1.r != null { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)
    // (the correct answer is `0` — the field IS null)

* **NO TWIN, NO UNION, NO ALIAS, NO CALL, NO CONDUIT.** Seven lines. The nullability is on
  the STRUCT FIELD, not on the container's value cell, and the container is a struct whose
  field holds a map.
* **FIVE CONTROLS:**

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | annotate `const lv1: {[string]: Circle}` | RUNS |
  | `type Circle = { r: i32 }` and store `{ r: 7 }` | RUNS |
  | drop the struct wrapper — a bare `{[string]: Circle}` | RUNS |
  | a list of maps instead of a struct of a map | check-clean invalid wasm (same) |

* **IT IS THE UN-ANNOTATED INTERMEDIATE MAP AGAIN**, the same ingredient as D180's
  intermediate locals and D181's inner map — but here the trigger is the nullable FIELD,
  not the container's depth: the identical program with a non-nullable field runs.
* Do NOT group it with D19 or the nullable-value-cell rows: the map's value type here is
  `Circle`, not `Circle | null`, and the read is a hit, not a miss.

---

### D183 — [CLOSED 2026-08-27] a `string[]` round-tripped through `reverse([c])[0]`, inside a function
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`; the SAME ROOT as D180 and the ablation is what says so. Was: check-clean invalid wasm · found 2026-08-27 by the CENSUS grid, block A · D157's conduit at a coordinate with NO nominal shape anywhere in the program**

**IT IS NOT THE CONDUIT, IT IS `[c]`** — and the row's own `reverse(c)` control said so before
the root was found. The wrapping list is a list literal whose element is a `string[]` delivered
by IDENT, which is D180's coordinate exactly; `arrLitIsRef` declined it, and `reverse$m0`'s
parameter came out `(ref $i32list)` while a `(ref $strlist)` was handed to it. The engine
message filed on this row (`expected (ref $type), found (ref $type)`) is stale — re-run
verbatim on `a19a3db7` it is **`expected i32, found (ref $type)`**, byte-for-byte D180's, which
is the tell the two rows share a root.

**THE ABLATION, on the 2,224-cell list grid described under D180's fix:** the one rung moves
338 cells and this row with them, and the D184 rung beside it moves 9 disjoint cells and moves
neither this row nor D180 (`R1 ∩ R3 = 0`, set-identity of the union against the whole).

Fixture: `tests/cases/arrays/nested-list-elem-from-ident.vl` — this repro as `d183()` plus the
hand-written-generic sibling `d183Gen()`, which was silent for the same reason and which the
row's `idg(c)` control (no wrapping list) could not see.

Repro:

    import { reverse } from "std:array"
    function rd() {
      const c = ["seven"]
      const dd = reverse([c])[0]
      let hit = 0
      for zz in dd {
        if zz == "seven" { hit = 7 }
      }
      print(hit)
    }
    rd()
    // vl check rc 0 with NO diagnostics; vl run:
    //   wasm[0]::function[N]::rd$m0 … type mismatch: expected (ref $type), found (ref $type)

* **THE FAILING FUNCTION IS THE MONOMORPHIZED INSTANCE `rd$m0`**, which is the "same class,
  different message" disguise D157's second half names — except D157's repro declares
  `Circle`, `Sq`, `Shape` and `Dot`, and this one declares nothing at all.
* **THE UNION AND THE DESTINATION WERE BOTH IN THE CENSUS CELL AND NEITHER IS REQUIRED.**
  The cell the census produced (`a007648`) carried an unrelated `type Shape = Ua | Sq` and a
  `sink(c)` destination; deleting each in turn leaves the program silent. That refutation is
  recorded because the first draft of this row was written around the union.

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | annotate `const c: string[]` | check-clean invalid wasm |
  | annotate `const dd: string[]` | check-clean invalid wasm |
  | `if dd[0] == "seven"` instead of `for-in` | check-clean invalid wasm |
  | `reverse(c)` — no wrapping list | RUNS |
  | `idg(c)` with `function idg<T>(x: T): T` instead of the std call | RUNS |
  | `const dd = c` — no conduit | RUNS |
  | the same statements at MODULE scope | loud emit reject (`nested arrays are not supported`) |
  | `i32` elements | loud emit reject (same) |

* **THE `reverse(c)` CONTROL SEPARATES THE CONDUIT FROM THE WRAPPING LIST.** It is not the
  std export: it is `[c]` — a list built around a list, handed to a generic, indexed back
  out — and the generic spelling of the same hop runs, so the std instance and the
  hand-written one do not monomorphize alike.
* Census population: **759 silent cells whose failing function carries the `$m0` suffix**,
  spread over 7 containers and 5 reps.

---

### D184 — [CLOSED 2026-08-27] a LIST of lists of a declared union arm with an exact twin
**CLOSED 2026-08-27 — the repro now RUNS and prints `7`. ONE CUT: the ELEMENT arm of `dstPinPushAnn` was asking rung ONE of `armPinAnnName` where it needed rung TWO. Was: check-clean invalid wasm · found 2026-08-27 by the CENSUS grid, block C · D156's ingredients in a LIST container, which no grid in this programme has ever built**

**THE DIAGNOSIS WAS VERIFIED BY PROBE, NOT INHERITED.** An instrumented compiler
(`emitFail` at the end of `synthDstPinAnns`, accumulating one line per rung reach) prints for
this repro exactly one line: `ELEM ann=Circle[][] rae=Circle[] raf=1 en=`. So the WHOLE-VALUE
branch is never taken — `armPinAnnName` is not called at all on this program — and gate B
(`dstPinPushAnn`'s ELEMENT arm) is the one and only cut the row reaches.

**THE CUT.** `retRefArrElemName(Circle[][])` is `Circle[]`; the arm arm asks
`variantIndexOf("Circle[]")`, the variant table holds `Circle`, so the lookup declined and `en`
came back `""`. `dstPinAnnIn` records `""` as a destination DISAGREEMENT, so that one delivery
vetoes the pin the binding would otherwise get. Un-pinned, `lv1` resolves through
`structIndexOfObj` — which finds the layout twin `Dot`, since a union member has no `sNames`
row for `Circle` to claim — while the annotated destination declares `uVarHeap[Circle]`.
`pinArmListName` is that question asked by NAME (`arrLeafNameOf` then `variantIndexOf`), which
is the form the element arm can call: it holds a STRING, not a node, which is why it
hand-inlined rung 1 in the first place.

**THE `armPinAnnName` HALF WAS BUILT AND THEN DECLINED ON MEASUREMENT.** Widening that
function's OWN ref-list rung to `pinArmListName` is reachable — a reach probe (the rung
replaced by an `emitFail` marker, run over 10,882 files: every `tests/cases`, `std` and `bench`
program plus every census cell in blocks C and D containing a `[][]` spelling) fires on three
corpus fixtures. It moves NOTHING: 0 of the four filed witnesses, 0 corpus bytes (1,989 modules
re-built and `cmp`-identical against the rung below it), and **0 cells either way on the
2,224-cell list grid** (`R2` column of the lattice, `moved=0`). Its callers explain why:
`dstPinAnnIn` and `synthRetPinAnn` both require `armPinLitInit`, whose widest producer is an
ArrayLit with an OBJECT-LITERAL first element — a value of depth ONE, which the existing
`variantIndexOf` rung already claims. It is recorded as a decline on the rung itself rather
than shipped.

Fixture: `tests/cases/unions/arm-list-of-lists-dst-pin-element.vl` (this repro, the flat
`Circle[]` control, and the in-function sibling).

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    const lv1 = [{ r: 7 }]
    const c: Circle[][] = [lv1]
    const g0 = c
    if g0.length > 0 {
      const g1 = g0[0]
      if g1.length > 0 {
        if g1[0].r == 7 { print(7) } else { print(0) }
      } else { print(0) }
    } else { print(0) }
    // `322c07f2`: vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)
    // Now: 7

* **EVERY EARLIER GRID FOR THIS CLASS USED A MAP.** `d52`, `d88`, `d94`, `d111`, `d112`,
  `d131` and `d139` all build the container as `Map()`; the list spelling of the same
  coordinate was never generated, and it is silent.
* **ALL THREE NOMINAL INGREDIENTS ARE REQUIRED, AND SO IS THE UN-ANNOTATED INNER LOCAL:**

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | delete `type Dot` | RUNS |
  | `type Dot = { q: i32 }` (same arity, different field) | RUNS |
  | delete `type Shape = Circle \| Sq` | RUNS |
  | annotate `const lv1: Circle[]` | RUNS |
  | one nested literal `[[{ r: 7 }]]` | RUNS |
  | a flat `Circle[]` | RUNS |

* Census population: **144 cells rescued only by `{twin, union, pval, cont}`, all at
  `cont=listlist`**, plus a further 457 at `listlist` with the full ingredient set.

---

### D185 — [CLOSED 2026-08-27 by D203] a struct field over a map of a union arm: LOUD without the twin, SILENT with it
**check-clean invalid wasm, closed 2026-08-27 by D203's destination rung · found 2026-08-27 by the CENSUS grid, block C · a `loud emit reject` → `check-clean invalid wasm` move produced by ADDING a declaration, which is the direction this programme treats as a blocker**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    type WS1 = { f: {[string]: Circle} }
    const lv1 = Map()
    lv1["k0"] = { r: 7 }
    const c: WS1 = { f: lv1 }
    const g1 = (c.f)["k0"] ?? { r: 0 }
    if g1.r == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **DELETING `type Dot` MAKES THE PROGRAM LOUD, NOT CORRECT.** That is the row:

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | delete `type Dot` | **loud emit reject** — `unsupported map value type (no rep for a union-member struct…)` |
  | `type Dot = { q: i32 }` (a non-twin) | **loud emit reject** (same message) |
  | delete `type Shape = Circle \| Sq` | RUNS |
  | delete both the twin and the union | RUNS |
  | annotate `const lv1: {[string]: Circle}` | RUNS |

* **THE REFUSAL EXISTS AND THE TWIN ROUTES AROUND IT.** `unsupported map value type` is the
  emitter's own statement that it has no rep for a union-member struct in a map value; with
  an exact layout twin present it stops firing and the module is emitted anyway. Whatever
  closes D156's peel must be graded against this control, because a peel that only widens
  what the pin accepts will widen the hole rather than the refusal.
* Census population: 1,154 silent cells at `cont=structfield` with the full ingredient set
  and 404 with twin+union but no alias; the paired loud population is larger.

---

### D186 — [CLOSED 2026-08-27 by D203] a list of maps whose value is an UNDECLARED struct over a union arm
**check-clean invalid wasm, closed 2026-08-27 by D203's destination rung · found 2026-08-27 by the CENSUS grid, block D · the `list_of_map` container is the census's hottest, silent in 20–45% of cells at every nominal-ingredient combination including the empty one**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    const lv1 = Map()
    lv1["k0"] = { r: { c2: 1 } }
    const c: {[string]: {r: Shape2}}[] = [lv1]
    const g0 = c
    if g0.length > 0 {
      const g1 = (g0[0])["k0"] ?? { r: { s2: 1 } }
      if (g1).r is Cir2 { print(7) } else { print(0) }
    } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **THE STRUCT THAT HOLDS THE ARM IS NEVER DECLARED** — it is spelled `{r: Shape2}` inline at
  the one annotation the program has — and DECLARING it does not help:

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | `type Circle = { r: Shape2 }` and annotate with the name | check-clean invalid wasm (does NOT rescue) |
  | annotate `const lv1: {[string]: {r: Shape2}}` | RUNS |
  | drop the list layer — a bare `{[string]: {r: Shape2}}` | RUNS |
  | `i32` map values instead of the arm-holding struct | RUNS |

* **THE DECLARED-NAME CONTROL IS WHAT SEPARATES IT FROM D155/D156/D184.** In those rows the
  nominal name is the thing the pin cannot find; here supplying the name changes nothing and
  only the INNER MAP's annotation does. Group it with D181 (the inner map of a list of maps)
  before grouping it with the arm rows.
* It may share a root with D179: both hold an anonymous struct whose field is a union-arm
  value, and both are rescued by the same annotation. They are filed apart because one is a
  compiler trap through `for-in` and the other invalid wasm through a list of maps, and no
  measurement here ties them.
* Census population: **the `list_of_map` container carries 3,439 of block A's 12,673 silent
  cells (27%)** on 8.5% of its cells, the highest of the twelve containers.

---

### D187 — the array-of-map alias must render NOMINALLY; the structural render is a loud reject at a union member
**runs today and must keep running (REFUTATION PIN) · filed 2026-08-27 out of D181's ablation · the candidate it refuses is "claim the map leaf in `singleAliasMemberTyIx` and leave `transparentMemberEmitName` alone", which was BUILT and measured**

Repro:

    type Cat = { n: i32 }
    type LC = {[string]: Cat}[]
    function mk(): LC {
      const m: {[string]: Cat} = Map()
      m["k"] = { n: 7 }
      return [m]
    }
    function which(x: LC | i32): i32 {
      if x is i32 { return 0 }
      return 3
    }
    print(which(mk()))
    // PRINTS 3

* **THREE COMPILERS, ONE PROGRAM.** On merged master `e04b1567` it is **check-clean invalid wasm** (the
  alias is opaque, so `LC` is a union row and the `LC | i32` parameter takes the box).
  With the claim alone it becomes a **LOUD EMIT REJECT** — `emitProgram: array value does not
  match any array member of the union (leaf-scalar widening across a nested array is
  unsupported)` — because `tyToEmitNameAt` re-renders the element and spells the member
  `{[string]:{n:i32}}[]`, dropping the `Cat` the union's array member is keyed on. With the
  nominal-render leg it **RUNS and prints 3**, and the render is `{[string]:Cat}[]`, which is
  the direct spelling character for character.
* **THE LEG MOVES 0 CELLS ALONE** — built as its own compiler (`arrSpineIsMap` defined and
  called only from `transparentMemberEmitName`), it is inert on all 1,088 cells of the
  alias-vs-inline twin table, because that renderer is only reached for a member
  `singleAliasMemberTyIx` has already claimed. It is nonetheless load-bearing: the claim alone
  is +446 / **−3** on the alias leg and the pair is +447 / **0**, and alias/inline parity goes
  540/544 → **544/544**. A composition is a DIRECTION, not a cell count — #1966's finding, in
  the same shape.
* **THE THREE CELLS ARE THE UNION-MEMBER POSITION AND NOTHING ELSE**, across all four alias
  bodies (`{[string]:Cat}[]`, `…[][]`, `{[string]:Cat[]}[]`, `{[string]:{[string]:Cat}}[]`).
  Every other position in the table — binding, param, return, struct field, `| null`, array
  element, map value, index read, `push`, `for-in`, closure param, closure result, empty
  literal, generic argument, two-claimant — is unmoved by the leg.
* This pin reddens the day someone simplifies the array arm of `transparentMemberEmitName`
  back to `arrSpineIsNominal(smt)` alone.

---

### D188 — an array alias whose LEAF is an INLINE OBJECT SHAPE is loud in every position where the direct spelling runs
**loud check reject · filed 2026-08-27 out of D181's leaf census · the FOURTH array-spine leaf kind, unmoved by D181's fix and at parity between merged master `e04b1567` and the branch**

Repro:

    type L = {n: i32}[]
    const c: L = [{ n: 7 }]
    print(c[0].n)
    // vl check rc 1:
    //   [ERROR]: cannot assign {n: i32}[] to 'c' of type L

* **THE CONTROL IS ONE CHARACTER SET SHORTER AND RUNS**: `const c: {n: i32}[] = [{ n: 7 }]`
  prints `7`. The alias spelling is a dialect of its own here, which is the exact condition
  D-ALIASARR, D-ALIASARRNOM and D-ALIASARRMAP each removed for one other leaf kind.
* **THE LEAF LADDER, MEASURED RATHER THAN READ OFF THE SOURCE.** Thirteen leaf kinds, each
  spelled once through a `type L = <leaf>[]` alias and once inline, on `e04b1567` and on the
  branch:

  | array-spine leaf | `e04b1567` alias | branch alias | inline control |
  |---|---|---|---|
  | `i32`, `string` | runs | runs | runs |
  | declared struct (`Cat`) | runs | runs | runs |
  | litunion alias (`K0`), numeric litunion alias (`Z`), declared union (`U1`) | runs | runs | runs |
  | **map** (`{[string]: i32}`), **map of struct**, **array of map** | **check-clean invalid wasm** | **runs** | runs |
  | **inline object shape** (`{n: i32}`) | **loud check reject** | **loud check reject** | **runs** |
  | `i32 \| null`, `Cat \| null`, `(i32) => i32` | loud check reject | loud check reject | loud check reject (parity) |

* **IT IS LOUD IN ALL FOUR POSITIONS, WITH FOUR DIFFERENT MESSAGES** — including the one
  spelling that is SILENT for the map leaf. `cannot assign {n: i32}[] to 'c' of type L` at a
  binding · `cannot index non-array L` at a parameter · `return type mismatch: expected L,
  got {n: i32}[]` at a return · and **`cannot assign _[] to '_sp1' of type L` at the UNREAD
  `const _sp1: L = []` binding**, which is exactly D181's silent spelling. So this leaf has
  no silent form at all: the assignability check refuses the empty literal before any
  emitter sees it, where for a map leaf the same line was accepted and mis-repped. That is
  why D188 is a LOUD row and D181 was a silent one, and it is the reason the leaf ladder had
  to be measured rather than read off the diff — the two leaves fail at different layers.
  Declaring a struct of the same shape beside it does NOT rescue it.
* **A TWO-DEEP INLINE-SHAPE BODY IS A PARSE ERROR**, not this row: `type L = {n: i32}[][]` is
  `expected an expression but found RBRACK` — the same bound `scripts/silent-sweep/census/README.md`
  records under *What the census could NOT reach*.
* Why it is filed rather than fixed here: the leaf test would be "the leaf is a `TyObj` with
  no declared name", and `transparentMemberEmitName`'s object arm is `isPlainAliasRef`-gated
  precisely so a canonicalized intersection keeps its named-struct route. That gate's
  interaction with an ARRAY spine is a second population and wants its own twin table.

---

### D189 — a SECOND binding of the same list-of-map layout, over a union ARM with a declared twin
**runs today and must keep running (REFUTATION PIN) · filed 2026-08-27 as a LIVE `check-clean invalid wasm` row out of D181's census re-grade on `1e81b0f3`, and CLOSED BY #1969 before that branch could merge — it is kept as the control both fixes must hold, because it is the coordinate where the `claim` axis really does fire and the one this programme kept mis-attributing**

Repro:

    type Circle = { r: i32 }
    type Dot = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    const _sp1: {[string]: Circle}[] = []
    const lv1 = Map()
    lv1["k0"] = { r: 7 }
    const c: {[string]: Circle}[] = [lv1]
    const g1 = (c[0])["k0"] ?? { r: 0 }
    if g1.r == 7 { print(7) } else { print(0) }
    // PRINTS 7

* **NO ALIAS ANYWHERE, AND THAT WAS THE FINDING.** The census reaches this coordinate through
  its `claim` axis, which spells the second claimant as `type Box1 = {[string]: Circle}[]` plus
  `const _sp1: Box1 = []` — so on `1e81b0f3` it was entangled with D181 and the two had to be
  separated by hand. Deleting `type Box1` leaves the STRUCTURAL spelling above, and on
  `1e81b0f3` that reproduced the same class, the same message and the same byte offset (1189):
  D181 was the alias, this was the claimant.
* **TEN CONTROLS, ALL MEASURED ON `1e81b0f3` AND ALL IDENTICAL ON D181's BRANCH THERE** — which
  is what said the two rows were different roots:

  | change | outcome on `1e81b0f3` |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | delete `const _sp1` (the second claimant) | RUNS |
  | delete `type Dot` (the layout twin) | **loud emit reject** — `unsupported map value type (no rep for a union-member struct…)` |
  | `type Dot = { q: i32 }` (a NON-twin) | **loud emit reject** (same message) |
  | delete `type Shape` (keep `Sq`) | RUNS |
  | delete the union entirely | RUNS |
  | a NON-EMPTY spare (`[mmz]`) | check-clean invalid wasm (same) |
  | a THIRD claimant as well | check-clean invalid wasm (same) |
  | annotate `const lv1: {[string]: Circle}` | RUNS |
  | drop the LIST layer — a bare `{[string]: Circle}` spare beside a bare map | RUNS |

* **THE LAST-BUT-ONE CONTROL IS WHY #1969 OWNS IT.** `lv1` is an un-annotated `Map()`, and
  annotating it rescued the program on `1e81b0f3` — which is `letMapDestShape`'s whole subject.
  D203's fix gives that binding the DECLARED destination it is stored into, and this coordinate
  falls out with it: on `e04b1567` the repro prints `7`. The twin and the union are not the
  root; the un-annotated intermediate map is, exactly as D203 measured for five other
  containers.
* **AND THE `claim,cont` FAMILY IS NOW EMPTY.** Re-derived on `e04b1567`, that family is 1,430
  coordinates (it was 1,296 on `1e81b0f3` — #1969 rescued `cont` siblings, which moves cells
  INTO a family whose key is the SET of rescuing axes), and D181's fix closes **all 1,430**.
  There is no residue left to file, which is why this row is a pin rather than a defect.
* **IT IS KEPT BECAUSE IT PINS TWO FIXES AT ONCE.** Restoring D203's blindness reddens it, and
  so does any future change that re-introduces a second claimant's slot into the list-of-map
  layout. The row that was going to be filed as this programme's fourth "the claimant count is
  the ingredient" story is the one place where a second claimant genuinely mattered — and even
  there the root was one container in.

---

### D203 — [CLOSED 2026-08-27] an un-annotated `Map()` never saw the DECLARED destination it is stored into
**check-clean invalid wasm · found 2026-08-27 by the CENSUS grid's `cont`-only rescue family (1,992 cells) · closed by the destination rung in `letMapShapeOf` (`letMapDestShape`)**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    const lv1 = Map()
    lv1["k0"] = { r: { c2: 1 } }
    const c: {[string]: {[string]: Circle}} = Map()
    c["k0"] = lv1
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? { r: { s2: 1 } }
    if (g1).r is Cir2 { print(7) } else { print(0) }
    // before: vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref $type), found (ref $type)

* **THE ROOT IS ONE DIRECTION OF INFERENCE.** `const lv1 = Map()` takes its VALUE type from
  the checker at the FIRST key write, and that inference never looks forward:
  `lv1["k0"] = { r: {c2: 1} }` pins the object literal's own type, `{r: {c2: i32}}`. The
  destination `c` then declares `{[string]: Circle}`, the checker accepts the store (the
  literal's field type is a strict SUBTYPE of `Shape2`), and the emitter is left with two map
  structs for one map — the binding's cell keyed on the render, the destination's vals element
  on the declaration.
* **THE CONTAINER AXIS IS NOT ABOUT CONTAINERS.** Every silent cell in the census's
  `cont`-only family has an UN-ANNOTATED MAP holding the payload: `nestedmap`, `map3`,
  `list_of_map`, `structfield`, `structfield2`. The five containers that RUN — `bare`,
  `list`, `listlist`, `mapval`, `map_of_list`, `forin` — either have no map at all or have the
  map at the OUTERMOST binding, where `annpos=binding` annotates it. `annpat=inner` (annotate
  the innermost intermediate level) rescues every one of the five, and `annpat=mid` rescues
  none: the discriminator is the annotation on the map binding, not the container's shape.
* **THE CONTAINER-BY-CONTAINER TABLE IS WHAT SHOWS IT IS ONE ROOT AND NOT EIGHT.** Asked of
  each `cont` level, "which rung answers the payload's rep/nominal identity for an
  INTERMEDIATE binding, and does it consult the destination":

  | `cont` | layers | intermediate binding | rung that answers the payload's identity | base, `rep=arm` |
  |---|---|---|---|---|
  | `bare` | — | none | the binding's own annotation | runs |
  | `list` | L | none | `arrLitElemName` → `structIndexOfObj` | runs |
  | `listlist` | L,L | inner `ArrayLit`, INLINE | `arrLitElemName`, nested arm | runs |
  | `list3` | L,L,L | — | — | loud (`nested arrays are not supported`) |
  | `mapval` | M | none — the map IS the annotated binding | `letMapShapeOf`, annotation arm | runs |
  | `forin` | L | none | `arrLitElemName` | runs |
  | `map_of_list` | M,L | inner `ArrayLit`, INLINE | `arrLitElemName` under the outer map's annotation | runs |
  | `nestedmap` | M,M | **an un-annotated `Map()`** | `letMapShapeOf` → `mapFindShapeOfNodeTy` | **silent** |
  | `map3` | M,M,M | **two un-annotated `Map()`s** | same | **silent** |
  | `list_of_map` | L,M | **an un-annotated `Map()`** | same | **silent** |
  | `structfield` | S,M | **an un-annotated `Map()`** | same | **silent** |
  | `structfield2` | S,S,M | **an un-annotated `Map()`** | same | **silent** |

  Two rungs, not eight. `arrLitElemName` answers with `sNames[structIndexOfObj(elems[0])]` —
  the row the literal is BUILT as — and `mapFindShapeOfNodeTy` answers with
  `tyToEmitName` of what the CHECKER inferred. **The list is not immune, it is lucky**: its
  destination's element slot is keyed by the same `structIndexOfObj` adoption, so the two
  sides agree by construction. Where a list has no destination either, the luck runs out —
  that is D209 (still OPEN — two candidate fixes built and both refuted; see that row).
* Census population: **2,032 cells whose ONLY one-step rescue is `cont`**, re-graded on
  `1e81b0f3` (the census filed 1,992 on `1559d80c`), witness `cellsB/b024546.vl` at 226
  bytes — the smallest in the family. Blocks B/C/D/E, 100,014 cells, move **2,644, every one
  `check-clean invalid wasm` → `runs`**: 0 into a silent class and 0 `runs` lost, silent
  8,854 → 6,210.
* **THE REP AXIS DECIDES LOUD vs SILENT, AND IT IS THE SUBTYPING STEP.** Over the 192-cell
  `rep × cont` matrix at `pval=single`, the five containers fail at exactly three reps — the
  three where the literal's inferred field type is a strict subtype of the declared one:
  `arm` (`{c2: 1}` against `Shape2`) is check-clean invalid wasm, `nul` (`7` against
  `i32 | null`) and `i64` (`7` against `i64`) are the LOUD `-3` floor
  ("unsupported map value type … interned no mv slot"). At `rep=i32` the two coincide
  structurally and every cell runs.
* **THE FIX IS A FIND, NOT A MINT** (D-MAPNODETY's rule). Every slot `letMapDestShape`
  returns was already interned by the DESTINATION'S OWN annotation walk, so the rung can only
  land the binding on a slot that exists; it interns nothing and skips no mint.
* **AND IT REFINES AN ANSWER RATHER THAN SUPPLYING A MISSING ONE.** The destination is
  consulted only where the initializer's own resolution already named a slot — the rung
  corrects WHICH slot, which is this silent half. The LOUD `-3` half is D207, and the bound
  is measured there rather than argued here.
* Fixture: `tests/cases/maps/inferred-map-destination-shape.vl` (all five containers, both
  reps, plus the nothing-annotated control).

---

### D204 — [CLOSED 2026-08-27] the same root through a LIST-OF-MAPS destination
**check-clean invalid wasm, closed 2026-08-27 · found 2026-08-27 by the CENSUS grid, block C · D203's second destination SPELLING, which no single rung covers**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    const lv1 = Map()
    lv1["k0"] = { r: { c2: 1 } }
    const c: {[string]: Circle}[] = [lv1]
    const g0 = c
    if g0.length > 0 {
      const g1 = (g0[0])["k0"] ?? { r: { s2: 1 } }
      if (g1).r is Cir2 { print(7) } else { print(0) }
    } else { print(0) }
    // before: vl check rc 0; vl run: type mismatch: expected (ref $type), found (ref $type)

* **THE DESTINATION IS AN ARRAY LITERAL UNDER A REF-ARRAY ANNOTATION**, not an index store,
  so D203's `dst[k] = m` arm cannot see it. The rung reads the annotation's ref-list slot
  (`letAnnRefListSlot`), checks the element kind is a MAP (`rlElemKindTbl == 3`), and takes
  that element's own value slot.
* Filed apart from D203 because the two arms are independently ablatable and each moves its
  own cells: deleting this arm alone leaves `cont=list_of_map` silent while `nestedmap`
  runs.

---

### D205 — [CLOSED 2026-08-27] the same root through a STRUCT FIELD destination
**check-clean invalid wasm, closed 2026-08-27 · found 2026-08-27 by the CENSUS grid, block B (`b024546`, the family's smallest witness at 226 bytes) · D203's third destination SPELLING**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    type WS1 = { f: {[string]: Circle} }
    const lv1 = Map()
    lv1["k0"] = { r: { c2: 1 } }
    const c: WS1 = { f: lv1 }
    const g1 = ((c).f)["k0"] ?? { r: { s2: 1 } }
    if (g1).r is Cir2 { print(7) } else { print(0) }
    // before: vl check rc 0; vl run: type mismatch: expected (ref $type), found (ref $type)

* **A STRUCT-FIELD DESTINATION IS ALWAYS ANNOTATED** — an object-literal struct binding must
  name its type (`gencensus.py` records this as a structural entanglement) — which is why
  `structfield` / `structfield2` are the only two containers in this family that are silent
  even at `annpat=none`: their outer binding carries an annotation whatever the axis says.
* The rung reads `letAnnStructIdx` for the annotated let, `sFieldIndex` for the field the
  binding is written into, and takes the field row's recorded (KEY, VALUE) through
  `sFieldMapShape` — the same column the CONSTRUCT and the type section read.

---

### D206 — [CLOSED 2026-08-27] the same root at depth THREE, where the middle map is un-annotated too
**check-clean invalid wasm, closed 2026-08-27 · found 2026-08-27 by the CENSUS grid, block C · the deepest cell of the family and the last one a KEY-level fix could not reach**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    const lv2 = Map()
    lv2["k0"] = { r: { c2: 1 } }
    const lv1 = Map()
    lv1["k0"] = lv2
    const c: {[string]: {[string]: {[string]: Circle}}} = Map()
    c["k0"] = lv1
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? Map()
    const g2 = (g1)["k0"] ?? { r: { s2: 1 } }
    if (g2).r is Cir2 { print(7) } else { print(0) }
    // before: vl check rc 0; vl run: type mismatch: expected (ref $type), found (ref $type)

* **TWO UN-ANNOTATED MAPS IN A CHAIN**, and the rung resolves them in order: `lv1`'s
  destination is `c`'s declared value, and `lv2`'s destination is `lv1` — whose shape the
  rung has just decided. The recursion is the existing `mapShapeOfExpr` one, so no new
  descent was written.
* **THIS IS THE CELL THAT REFUTED THE KEY-LEVEL FIX.** A first cut re-keyed the mv table
  entry from the render to the adopted struct row's name; on this program it re-keyed the
  middle map's value while the outer slot's parallel arrays were mid-push and the COMPILER
  TRAPPED out of bounds on seven of the fourteen `rep`s at `cont=map3`. See D210.

---

### D207 — the LOUD half of the same root: the `-3` map-value floor, DELIBERATELY not taken
**loud emit reject · found 2026-08-27 by the CENSUS grid's `rep × cont` matrix · the same seam as D203 reported through the mv layer's unsupported-value sentinel instead of through invalid wasm — and the half D203's rung is BOUNDED away from, measured**

Repro:

    type Circle = { r: i32 | null }
    const lv1 = Map()
    lv1["k0"] = { r: 7 }
    const c: {[string]: {[string]: Circle}} = Map()
    c["k0"] = lv1
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? { r: 0 }
    if (g1).r != null { print(7) } else { print(0) }
    // before: vl run:
    //   emitProgram: unsupported map value type (no rep for a union-member struct, a
    //   nullable list over an unnamed element rep, or a nullable litunion-result closure;
    //   any other value type here interned no mv slot)

* **THE MESSAGE'S OWN TAIL CLAUSE NAMES IT CORRECTLY**: "any other value type here interned
  no mv slot" — a compiler gap, not a language limit. `structIndexByValName("{r:i32}")`
  refutes `Circle`'s row (the render's field code is 0, the row's is the union box), so the
  layer has no kind at all for a value it lowers perfectly well under the destination's name.
* **D203'S RUNG COULD ANSWER IT AND IS BOUNDED AWAY FROM DOING SO, ON A MEASUREMENT.** The
  destination is consulted only where the initializer's own resolution already named a slot,
  so the rung corrects WHICH slot and never supplies a missing one. Un-bounded it takes this
  half too — 2,254 loud cells of census block C to `runs` — at the cost of **620 cells moving
  from a loud reject to check-clean invalid wasm**, every one at `cont=list_of_map` with
  `claim >= 1`: a container ALIAS plus a spare value of it, which is D181, still open, and
  reached only because the map now resolves while the alias's second claim on the same layout
  does not. Block B is the same shape at 85 cells and block E at 184.
  **Closing D181 is what unblocks this row**, and the bound is the one line to delete when it
  is: `letMapShapeOf`'s `if ish >= 0`.
* **THE SMALLEST WITNESS NEEDS NO CONTAINER AT ALL** and is worth keeping separate, because
  it shows the adoption is upstream of every container:

      type Circle = { r: i32 | null }
      const lv1 = Map()
      lv1["k0"] = { r: 7 }
      print(lv1.size)

  Delete the `type Circle` line and it runs. `structIndexOfObjCtx` adopts the literal onto
  Circle's row through `anonValueFitsField`'s union-box leniency, which also SUPPRESSES the
  `#anon` row `collectAnonShapes` would have minted (its gate is `structIndexOfObj(ai) < 0`),
  and the mv layer then asks under a render that names nothing. **That witness is filed as
  D209** — D207 closes only the half with a destination. D209 is still OPEN (both of its
  candidate fixes were built and refuted, 2026-08-27); re-run against D208's shipped resolver
  rung, this `mapval` spelling is UNMOVED, still the same loud reject, because its failure is
  the mv layer's missing slot and not the element row that rung resolves.
* Census population: this rep half is the `loud emit reject` column of the family — 24 of
  the 36 cells an UNBOUNDED D203 moves in a 770-cell `annpat × cont × rep` probe, against 12
  `SILENT → runs`. The shipped rung takes the 12.

---

### D208 — [CLOSED 2026-08-27] an un-annotated map of LISTS, with nothing annotated anywhere
**closed 2026-08-27 — the filed repro RUNS and prints `7` · was `check-clean invalid wasm` · found 2026-08-27 by the CENSUS grid's `annpat` axis · IT IS D209's ADOPTION ONE CONTAINER OUT, and the row's own "the destination rung cannot reach it" was right for the wrong reason: it needs no destination at all, it needs the resolver rung that was deleted from one of two twins**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    const lv1 = [{ r: { c2: 1 } }]
    const c = Map()
    c["k0"] = lv1
    const g0 = (c)["k0"] ?? []
    const g1 = g0
    if g1.length > 0 {
      if (g1[0]).r is Cir2 { print(7) } else { print(0) }
    } else { print(0) }
    // `322c07f2`: vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)
    // Now: 7

* **NO ANNOTATION EXISTS ANYWHERE IN THE PROGRAM**, so D203's rung correctly declines: there
  is no declared destination whose shape could be adopted. The two identities that disagree
  are both inferred — the LIST's element (which `arrLitElemName` resolves through
  `structIndexOfObj` to `Circle`'s row) and the map's VALUE (which the checker renders
  `{r:{c2:i32}}`).
* **THIS IS THE `arrLitElemName` SIDE OF THE SAME ADOPTION.** The array-literal element name
  is `sNames[structIndexOfObj(elems[0])]`, i.e. the row the literal is BUILT as; the map value
  name is `tyToEmitName` of what the CHECKER inferred. D203 aligned the map with a
  destination; nothing aligns these two with each other.
* Reached at exactly 3 of 770 cells in the `annpat × cont × rep` probe — `annpat=none ×
  cont=map_of_list × rep ∈ {arm, f64lit, numlit}` — and unmoved by the D203 fix in either
  direction. **The close moves 12 of census block D's 9,000, and the constants across all 12
  are exactly that coordinate** (`cont=map_of_list, annpat=none`, four storage/scope spellings
  × the three reps) — the filed population, re-found by a wider grid.

* **THE CHAIN, PROBED END TO END rather than argued** (a compiler carrying a dump of the
  ref-list slot table, on this row's own repro):

      SIO1 ix=14 nf=1 first=0 nm=Circle repty=45 noderow=-1 tyname={r: {c2: i32}}
      RL 0 nm=Circle         kind=1 row=0  heap=0 twin=0 wrap=9  sig=h:0  sitn=0
      RL 1 nm={r:{c2:i32}}   kind=1 row=-1 heap=0 twin=1 wrap=11 sig=u:1  sitn=0
      RL 2 nm={r:{c2:i32}}[] kind=9 row=-1 heap=11 twin=2 wrap=13 sig=9:1 sitn=-1

  1. `structIndexOfObjCtx` adopts `Circle` for `{ r: { c2: 1 } }` (D209 — the union-BOX field
     accepts every atom, and it is the ONLY match, so no resolver above it ever runs).
  2. The adoption SUPPRESSES the `#anon` row: `collectAnonShapes`' gate is
     `structIndexOfObj(ai) < 0`, so `{r:{c2:i32}}` is never interned as a struct row.
  3. `rlElemStructRow(slot 1)` therefore declines on all THREE of its rungs — arena identity,
     nominal name, canon key — **correctly**, because the row genuinely does not exist.
  4. `mAssignTypeIndices` writes `rlElemHeap[1] = 0` for an unresolved element. **That
     sentinel is also a real type index**, and in this program type 0 IS Circle's heap, so the
     backing comes out well-formed — while `rlTwin`'s signature for the same slot stayed
     `u:1`, the never-merged degenerate.
  5. Two slots, ONE element heap, TWO wrappers (`wrap=9` and `wrap=11`). That is exactly the
     invariant `rlTwin`'s own header states — *"two ref-list slots emit byte-identical
     (backing, wrapper) pairs iff they resolve to the same element heap"* — violated because
     the signature pass and the heap pass disagreed about whether the element resolved at all.
     The map's vals list (`RL 2`) then keys `wrap=11` while the value delivered is `wrap=9`:
     `expected (ref null $type), found (ref $type)`.

* **THE CLOSE IS ONE RUNG, AND IT WAS ALREADY WRITTEN — on the OTHER copy of this ladder.**
  `structIdxOfElemName` is `rlElemStructRow`'s SLOT-LESS twin, "same three rungs, same order",
  and it ends with a fourth: `structIndexOfTypeName`, the `shapeFieldTypeCompat`-tightened
  field-name-set scan. `rlElemStructRow` DELETED that rung, on a measurement that was true and
  whose population could not contain this case: *the answering rung 0 times over 1,243 corpus
  files and 100,800 fuzz programs*. `sitn=0` in the dump above is that rung answering — and
  answering with **exactly the row the literal was BUILT as**, because it is the NAME-keyed
  twin of the very fieldset scan that adopted it. Restored as rung 4, after the three that
  decline, i.e. reached only where the alternative is the `rlElemHeap = 0` sentinel.

* **THE VARIANT NOMINAL FLOOR IS UNTOUCHED and stays ahead of every rung** (`bn < 0 &&
  variantIndexOf(ln) >= 0 → -1`), so D32 and `DECISIONS.md`'s "the variant⇄struct-TABLE seam
  stays nominal" are unaffected: this rung can only resolve a name the STRUCT table owns.

* **MEASURED, AND THE RUNG SHIPS ALONE.** Base `cd44be39` (seed **1,461,831**, a
  self-compilation fixed point, and re-derived by STRIPPING this rung out of the final tree —
  which reproduces it **byte-for-byte**, so the base column is proved rather than assumed);
  branch **1,461,851**, this rung and nothing else.

  | population | cells | `runs` LOST | into silent | forward |
  |---|---|---|---|---|
  | the **DISTILLED census** — 1,477 representatives standing for every cell of blocks A–E | **250,238** | **0** | **0** | **+116** — `a031791` (104 cells, block **A**) and block D's four classes (12) |
  | census **block D** (`annpat × cont × rep`), cell-matched IN FULL | 9,000 | **0** | **0** | **+12**, every one at `cont=map_of_list, annpat=none` — this row's filed coordinate |
  | census **block C** (`rep × cont` fully crossed × the core quartet), cell-matched IN FULL | 43,200 | **0** | **0** | 0 — 100.00% unchanged |
  | the **union-box READ grid** (`fld × read × cont × annpat`, built for D209) | 1,260 | **0** | **0** | 0 — *nothing moves* |
  | the **adoption grid** (`fld × cont × annpat`) | 140 | **0** | **0** | **+1**, `arm_map_of_list_none` — this row's own cell, and the ONLY one |
  | `d156` · `d88`/`d100` · `d112` | 1,188 · 2,850 · 1,114 | **0** | **0** | 0 — *nothing moves* |
  | corpus `cmp`, byte-for-byte | 2,346 modules | — | — | **2,345 identical**; the one mover is this PR's own new fixture |

  Blocks C and D were ALSO graded cell-matched in full against `322c07f2` before the rebase,
  with the identical answer; the distilled corpus is what carries blocks **A, B and E**, which
  no earlier reading of this rung covered — and block A is where the largest forward move is.

* **273 CELLS KEEP THEIR CLASS AND CHANGE THEIR MESSAGE, and that is the row's OTHER HALF
  showing rather than noise.** Six distilled classes stay `check-clean invalid wasm` while the
  diagnostic moves from *expected `(ref null $type)`, found `(ref $type)`* to *expected
  `(ref $type)`, found `(ref $type)`*. That is precisely what this rung is supposed to do and
  no more: with the `rlElemHeap = 0` sentinel gone the SIGNATURE and the HEAP stop disagreeing
  about the element, so the wrapper's nullability stops disagreeing — and what remains is the
  box-vs-plain disagreement of the ADOPTION itself, which is D209 and is still open. A rung
  that closed the adoption would have taken these to `runs`; this one is not that rung, and the
  message is what says so.

  **THE COUNTERS SAY WHY THE CORPUS CANNOT MOVE, so the byte-identity is a mechanism and not
  a coincidence.** A counter build of this branch, over the whole corpus: `rlElemStructRow`
  **reaches** rung 4 **133 times across 104 files** and rung 4 **answers 2 times, in exactly
  one file** — this PR's new fixture. On the pre-existing corpus it answers **zero** times,
  which is the original deletion measurement reproduced from the other side: the rung is free
  everywhere the deletion was measured, and load-bearing exactly on the shape that measurement
  could not contain. On D209's own program the counter reads `r4=0 r4ans=0` — the rung is not
  even reached — which is why closing this row does not close that one.

  Nothing here is ungraded by the old scheduling rule: `scripts/silent-sweep/distilled` (#1977)
  replaced the 35-minute after-pass, and the row above quotes it for all five blocks.

---

### D271 — A REFUTATION PIN: the destination one un-annotated binding away, which the RESOLVER-side fix for D209 reddens
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-27 while attempting D209 · it printed `7` on `322c07f2` and prints `7` now; it goes check-clean INVALID WASM under the candidate that declines D209's adoption at `structIndexOfObjCtx` · its sibling pin for D209's OTHER candidate is D272**

Repro (three lines, and the third is the whole pin):

    type Circle = { r: i32 | null }
    const lv1 = [{ r: 7 }]
    const c: Circle[] = lv1
    print(c.length + 6)

* **WHY A PIN AND NOT A DEFECT REPRO.** Nothing here is wrong: `lv1`'s literal genuinely IS a
  `Circle`, because a declared destination three tokens later says so, and the emitter builds
  it boxed for exactly that reason. The program is well-typed at the wasm level only because
  `structIndexOfObjCtx` adopted Circle's row for an un-annotated literal — the same adoption
  D209 records as a defect when no destination exists.
* **IT IS D209'S WITNESS WITH ONE LINE ADDED, and no per-node key can tell the two apart.**
  Probed with a dump of the resolver's single-match arm, the defect and this pin produce
  **byte-identical** output: `SIO1 nf=1 first=0 nm=Circle noderow=-1 tyname={r: i32}`. The
  checker records `{r: i32}` in BOTH, because `recordRepTyAdopt`'s walk has a `Paren` arm, an
  `ObjLit` arm and an `ArrayLit` arm — and no `Ident` one — so the adoption never crosses the
  un-annotated binding that separates the literal from its destination.
* **WHAT IT PINS, precisely.** The day someone tightens the adoption at
  `structIndexOfObjCtx` — by canon-id disagreement, by field-code disagreement, or by any
  other property of the literal's own node — this program flips, and the flip is the signal
  that the tightening went in without the destination first being carried to the literal. The
  `Circle[][]` spelling (`const c: Circle[][] = [lv1]`) is the same pin one container out and
  flips with it; the two ANNOTATED controls (`const lv1: Circle[] = …` and
  `const c: Circle[] = [{ r: 7 }]`) do NOT flip, which is what says the missing input is the
  `Ident` hop and not the tightening itself.
* **NOT MOVED BY D209's CLOSE (2026-08-28), and that is a mechanism rather than a grid's
  zero.** The close is a READ-side channel; a counter build of it reads `reach=0` on this
  program — its predicate is not even reached, because nothing here READS the adopted field.
  The pin's fixture is one of the three corpus modules the close's `cmp` moves, and it still
  prints all six of its `7`s.
* Pinned as a fixture: programs 2 and 3 of
  `tests/cases/soundness/anon-literal-adopted-by-a-declared-box-field.vl` (the `Circle[][]`
  spelling and the `Circle[]` one).

---

### D272 — A REFUTATION PIN: the box read whose CONSUMER wants the box, which the READ-side fix for D209 reddens
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-27 building D209's SECOND candidate, as 72 of a 1,260-cell read-form grid · it printed `7` on `322c07f2` and prints `7` now; it goes check-clean INVALID WASM under the candidate that unboxes an un-narrowed code-16 field read on the CHECKER's recorded atom · its sibling pin for D209's OTHER candidate is D271**

Repro (four lines, and the third is the whole pin):

    type Circle = { r: i32 | null }
    const v = { r: 7 }
    const q: i32 | null = (v).r
    if q is i32 { print(q) } else { print(0) }

* **WHY A PIN AND NOT A DEFECT REPRO.** Nothing here is wrong. `structIndexOfObjCtx` adopts
  `Circle`'s row for the un-annotated `{ r: 7 }` — D209's adoption, exactly — so `r` is stored
  BOXED; and the consumer three tokens later is a union slot that WANTS the box.
  `emitUnionCoerce` opens with `if exprUnion(exprIx, fnIx) { return emitExpr(…) }`, the
  pass-through that is right for precisely this reason, and the program has run on every
  compiler this repo has shipped.
* **WHAT IT PINS, precisely.** The day someone unboxes a code-16 field read at the READ site
  on the strength of the checker's recorded type, this flips. The checker types `(v).r` as
  `i32` here — the SAME asymmetry D209 files as a defect — so a rung keyed on that type fires
  on this program too, and pushes a bare `i32` into a `(ref $uBox)` slot: `vl check` rc 0,
  `expected (ref null $type), found i32`. The read site cannot see its consumer; that is the
  whole content of the pin.
* **THE SECOND CONSUMER, and why ONE pin is not enough.** `const w: Box2 = { s: (v).r }` into
  another code-16 field flips with it and takes a DIFFERENT emitter path — an object-literal
  field store rather than a binding init — so a fix that repairs the binding init alone still
  reddens this one. Both are pinned.
* **THE POPULATION IT STANDS FOR, and what could not see it.** Under D209's read-side
  candidate, **72 of the union-box READ grid's 1,260 cells go from `runs` to not-runs, and 36
  of the 72 land in a SILENT class** (36 into `check-clean invalid wasm`, 36 into a loud emit
  reject). They are exactly `read ∈ {tounion, tofld}` × `fld ∈ {i32|null, i64|null, f64|null,
  i32|string}`, 18 apiece, across every container and every annotation pattern. **Zero of them
  are visible to census block C (43,200 cells), census block D (9,000), the 140-cell adoption
  grid, `d156` (1,188), `d88` (2,850) or `d112` (1,114)** — 57,492 cells, every one of which
  reads the field BARE. The corpus `cmp` cannot see it either: it is byte-identical because
  the corpus holds no program of this shape.
* **D209 CLOSED 2026-08-28 AND THIS PIN STILL RUNS — all 72 of them.** The close pairs the
  read-site unbox with `exprUnion` and with the coercion's atom pick, so the read delivers the
  atom and the consumer boxes it again; disassembled, `global.set` here now receives
  `struct.new $uBox (i32.const 0) (struct.new $vbI32 (struct.get $vbI32 0 (ref.cast …)))` where
  master passed the box through. The whole 1,260-cell grid moves **+24 `check-clean invalid
  wasm` → `runs`, 0 lost, 0 into silent**. The counter build reads
  `reach=4 ans=4 readfire=1 exprdecl=2 coercefire=1` on this program: all three ends fire on the
  program that refuted the last candidate, and it runs.
* Pinned as a fixture: programs 4 and 5 of
  `tests/cases/soundness/anon-literal-adopted-by-a-declared-box-field.vl`. The grid is
  `scripts/silent-sweep/d272/gen272.py` and the 72 cells are named in `runs-lost.txt` beside
  it; re-grade THAT set against any new D209 candidate before rebuilding anything. **Its
  successor is `scripts/silent-sweep/d290`**, which adds the axis this grid holds fixed — the
  literal PAYLOAD beside the field spelling — and found 8 cells this one could not.

---

### D209 — a declared struct CAPTURES an anonymous literal the checker never widened
**[CLOSED 2026-08-28] the filed repro RUNS and prints `7` · was `check-clean invalid wasm` · found 2026-08-27 while minimising D203 · the ROOT the whole family sits on, reachable with no container at all · closed by THREE rungs on ONE predicate, and all seven partial compositions were built and graded — the row's own predicted two-rung close (read site + `exprUnion`) is measurably NOT sufficient, and the 8 cells it costs are pinned as D290 · the i64/f64 sub-family is DELIBERATELY not closed and is filed as D291 · both refutation pins (D271 resolver-side, D272 read-side) still run · **IT WAS THE SPECIMEN** (`tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, pinned as `xfail-miscompile-declared-struct-captures-anon-list-element.vl`, chosen 2026-08-28 because it DECLARES NO UNION and the variant⇄struct family's mechanisms were therefore structurally inapplicable to it — a property that HELD; the close came from the code-16 READ, which that family does not reach). That pin is deleted here, the program graduated to `tests/cases/soundness/adopted-box-field-read-is-a-channel.vl`, and the slot is re-pointed at **D291**, chosen because a re-run of all 136 rows' own filed programs makes it the ONLY live member of the class.**

Repro:

    type Circle = { r: i32 | null }
    const lv1 = [{ r: 7 }]
    print((lv1[0]).r)
    // `f6fda728`: vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected i32, found (ref $type)
    // Now: 7

* **DELETE THE `type Circle` LINE AND IT PRINTS 7.** The declaration is not used, not
  annotated onto anything, and not mentioned by the binding — its mere presence changes how
  the literal is emitted. `structIndexOfObjCtx` resolves `{ r: 7 }` by field-name set with
  `anonValueFitsField`'s refutation-only widening (a union-BOX field accepts every atom), so
  the literal takes Circle's row and its `r` is emitted BOXED. The CHECKER meanwhile types
  the binding `{r: i32}[]` — provable in one line: `if (lv1[0]).r != null { … }` is a LOUD
  "cannot compare i32 with null".
* **THE ADOPTION ALSO SUPPRESSES THE ROW THAT WOULD HAVE AGREED.** `collectAnonShapes`
  interns an `#anon` row only `if structIndexOfObj(ai) < 0`, so the shape the checker named
  is never interned at all and no downstream layer can find it.
* **NOT CLOSED BY D203, and the reason was written here before it was measured.** Tightening
  the adoption is a behaviour change at a resolver every literal in every program passes
  through; the direction that makes this witness run (build the literal at its OWN inferred
  shape) breaks the currently-RUNNING program `const c: Circle[][] = [lv1]` over the same two
  lines, where the annotation makes Circle the right row. The two directions need a
  destination, which is what D203 supplies for maps and what the list element has no rung for.
  **That prediction was then built and confirmed — candidate 1 below, pin D271.**
* The list is incidental — a `mapval` spelling of the same two lines is the D207 witness's
  smaller sibling and is a LOUD reject rather than invalid wasm. **Re-run under D208's shipped
  rung and under both refused candidates: STILL that loud reject, unmoved in either
  direction.**

* **CANDIDATE 1 — THE RESOLVER SIDE. BUILT, AND REFUSED BY A PROGRAM IT REDDENS (pin D271).**
  The bullet above predicted this and it is now measured rather than reasoned. A candidate
  that declines the single-match adoption on a PROVEN canon-id disagreement
  (`repRowDisagreesWithNode`: both sides resolve a `repCanonId` and the two differ) closes
  this repro and moves these:

  | program | `322c07f2` | resolver-side candidate |
  |---|---|---|
  | this row's repro | check-clean invalid wasm | **runs** |
  | `const c: Circle[][] = [lv1]` after the same two lines | runs | **check-clean invalid wasm** |
  | `const c: Circle[] = lv1` after the same two lines | runs | **check-clean invalid wasm** |
  | `const lv1: Circle[] = [{ r: 7 }]` (annotated binding) | runs | runs |
  | `const c: Circle[] = [{ r: 7 }]` (annotated container) | runs | runs |

  The split is exact and it names the missing input: where the annotation is on the literal's
  OWN binding or its own container the checker ADOPTS and `nodeRepTyIxOf` already agrees with
  the row, so the candidate correctly declines to decline. Where the destination is one
  UN-ANNOTATED binding away, `recordRepTyAdopt` never reaches the literal — its walk has a
  `Paren`, an `ObjLit` and an `ArrayLit` arm and no `Ident` one — and nothing about the
  literal's own node differs between the two programs. Probed, and this is the whole finding:
  the dump is **identical** for the defect and for the control that must keep running —
  `SIO1 nf=1 first=0 nm=Circle noderow=-1 tyname={r: i32}` in both. **A per-node key is
  provably unable to separate them**, which is D93's rule at this resolver. Pinned as **D271**.

* **CANDIDATE 2 — THE READ SIDE. BUILT, IT FIXES THE WITNESS, AND IT LOSES 72 RUNNING
  PROGRAMS (pin D272).** `emitMem`'s plain-struct arm already calls
  `emitUnionFieldNarrowUnbox` for a code-16 field, and that function's header says *"an
  un-narrowed read yields the box unchanged, so a `""` atom emits nothing"*. The candidate
  adds a second rung: where the read is un-narrowed and `unMemAtomKind(nodeTyIxOf(memIx))`
  names a concrete value ATOM, unbox to that atom. It works on this row's program —
  disassembled, `struct.get $Circle 0` handed `(ref $uBox)` straight to `__print_i32__`
  before, and after it is `struct.get $Circle 0` · `struct.get $uBox 1` ·
  `ref.cast (ref $vbI32)` · `struct.get $vbI32 0`, the same three instructions the narrowed
  read already emits. **And it is wrong**, for a reason its own header argued it could not be:

      type Circle = { r: i32 | null }
      const v = { r: 7 }
      const q: i32 | null = (v).r          // runs today, prints 7
      if q is i32 { print(q) } else { print(0) }

  The claim was *"a program whose box read is CORRECT is typed by the checker as the union,
  so `unMemAtomKind` answers -1"*. It does not. **The checker types this read `i32` — the
  same adoption asymmetry the row is about — while the CONSUMER is a union slot and the box
  is the CORRECT rep.** `emitUnionCoerce` opens with
  `if exprUnion(exprIx, fnIx) { return emitExpr(…) }`, a pass-through that is right precisely
  because the member read yields the box; unbox it and a bare `i32` lands in a `(ref $uBox)`
  slot: `vl check` rc 0, `expected (ref null $type), found i32`. So the consumer decides, the
  read site cannot see the consumer, and **the read site is the wrong place** — the mirror of
  candidate 1, where the literal site could not see the destination.

* **THE READ-SIDE CANDIDATE, MEASURED — and the four populations that CANNOT see it.** All
  of this was graded against `322c07f2`, where the candidate was built (seed 1,461,174, base
  re-derived by stripping and `cmp`-proved byte-identical to master's own build).

  | population | cells | `runs` LOST | into silent | forward |
  |---|---|---|---|---|
  | the **union-box READ grid** (`fld × read × cont × annpat`, below) | 1,260 | **72** | **36** | +24 silent→runs, +18 silent→loud |
  | census **block C** (`rep × cont` fully crossed × the core quartet) | 43,200 | 0 | 0 | 0 — 100.00% unchanged |
  | census **block D** (`annpat × cont × rep`) | 9,000 | 0 | 0 | 0 (block D's +12 are D208's rung, not this one) |
  | the **adoption grid** (`fld × cont × annpat`) | 140 | 0 | 0 | +19 silent→runs, +18 silent→loud |
  | `d156` · `d88`/`d100` · `d112` | 1,188 · 2,850 · 1,114 | 0 | 0 | 0 |
  | corpus `cmp`, byte-for-byte | 2,342 modules | — | — | 2,341 identical |

  **53,502 cells across four grids read ZERO backward, and the class is real.** Every one of
  them holds the READ FORM fixed: the census's `rep` axis varies the field's TYPE and reads it
  bare, and the 140-cell adoption grid reads every cell bare too. The 72 lost cells are
  exactly `read ∈ {tounion, tofld}` — the two consumers that WANT the box — at
  `fld ∈ {i32|null, i64|null, f64|null, i32|string}`, 18 apiece, across every `cont` and every
  `annpat`. This is `CLAUDE.md`'s *"a grid holds constant the axes it was not chasing"* caught
  in the act, and the corpus `cmp` cannot substitute: it is byte-identical because the corpus
  contains no program of this shape at all.

* **THE UNION-BOX READ GRID** — 1,260 cells, and the axis is the one nothing else varies:
  `fld` (the code-16 field's union spelling — `i32|null`, `i64|null`, `f64|null`,
  `boolean|null`, `string|null`, `i32|string`, a declared arm union, a litunion, `i32[]|null`)
  × `read` (**bare** un-narrowed · **isnar** `is <atom>` · **nullcmp** `!= null` · **tounion**
  the read stored into a union-typed binding · **tofld** the read stored into ANOTHER code-16
  field) × `cont` (bare, list, listlist, mapval, map_of_list, list_of_map, forin) × `annpat`
  (none, bind, dest, destdeep). Every cell prints `7`. `tounion` and `tofld` are the two
  levels that earn it: they are the consumers that want the box, and no grid before this one
  had either. Regenerates from `scripts/silent-sweep/d272/gen272.py`, and the 72 cells the
  candidate loses are NAMED in `runs-lost.txt` beside it — so the next attempt at this row
  re-grades that set in ~72 invocations instead of rebuilding the grid.

* **WHAT WOULD CLOSE IT, and why it is not one rung — the prediction, kept verbatim, and it
  was HALF RIGHT.** Both candidates fail on the same missing input — the read's REP claim and
  the checker's TYPE for it disagree, and each fix patches one end while the other end still
  believes the old answer. A close has to move them together: `exprUnion` (the classifier every
  box consumer asks) and the read site would both have to answer from the checker's recorded
  type, so that a read typed as a bare atom unboxes AND re-boxes at the coercion. That is a
  channel decision at a classifier with 28 call sites, not a rung, and it wants its own grid —
  with `read` on it.

  **THE GRID WAS BUILT AND THE PAIRING IS NOT ENOUGH.** `read site + exprUnion` — exactly the
  two ends named above — loses **8 running programs** on the 714-cell channel grid below, every
  one at `string | i32`. Re-boxing "at the coercion" is not a consequence of `exprUnion`
  answering false: `emitUnionCoerce`'s atom ladder classifies the EXPRESSION, and every arm of
  it still reads an un-narrowed code-16 member as the box and declines, so the value fell to the
  ladder's numeric default and `struct.new $vbI32` was applied to a string ref. The coercion's
  ATOM PICK is a third end of the same channel. Pinned as **D290**.

* **THE i64/f64 SUB-FAMILY, where THREE atoms disagree.** `type Circle = { r: i64 | null }`
  beside the same `const lv1 = [{ r: 7 }]`: the field's declared member is i64, the emitter
  stores the payload as i64 (tag 3, `struct.new $vbI64`, `print` routed to `__print_i64__`),
  and the CHECKER types the read i32. Under the read-side candidate those 18 cells become a
  loud `narrowed union field atom has no value box (kind 0)` rather than running, because the
  i32 value box the read would ask for was never minted. Any future close has to pick which of
  the three sources wins; the row above is why picking at the read alone is not available.

* **ABLATION BY STRIPPING.** Two candidates were built against this row: `C` (the read rung)
  and `G` (the resolver rung this row's D208 half needs). Stripping BOTH reproduces
  `322c07f2` byte-for-byte at **1,461,174** — proved by `cmp` against master's own
  `build/vl-compiler.wasm`, not assumed. `G` alone is 1,461,194, `C` alone 1,461,415, `C + G`
  1,461,435, and the sizes are additive. (The SHIPPED rung was then re-derived on the rebased
  base `cd44be39`: stripping it out of the final tree reproduces that base byte-for-byte at
  **1,461,831**, branch **1,461,851**, and every population above was re-graded there with the
  same answer.)

  | compiler | D209 | D208 | D272's pin |
  |---|---|---|---|
  | base | invalid wasm | invalid wasm | runs |
  | `C` alone | **runs** | invalid wasm | **check-clean invalid wasm** |
  | `G` alone | invalid wasm | **runs** | runs |
  | `C + G` | **runs** | **runs** | **check-clean invalid wasm** |

  Set-identity on the 140-cell adoption grid: `C` moves 36 cells, `G` moves exactly 1
  (`arm_map_of_list_none`, D208's own coordinate), **the two sets are DISJOINT and their union
  is exactly the 37 cells `C + G` moves**, with no cell where the pair's class differs from
  the single's. No interaction in either direction — which is what licenses shipping `G`
  alone. **`G` shipped; `C` did not.**

* **THE CLOSE — THREE RUNGS ON ONE PREDICATE (2026-08-28).** `memReadUnboxAtomKind(memIx, fnIx)`
  answers *the value ATOM an un-narrowed code-16 field read is DELIVERED as*, or -1 for "the box
  unchanged". Three sites ask it and none of them re-derives it, which is the whole point — the
  two refused candidates each moved one end while the others kept believing the old answer:

  | rung | site | what it does |
  |---|---|---|
  | **R** | `emitUnionFieldNarrowUnbox` (`wasmEmit`) | the read UNBOXES to that atom — `struct.get $uBox 1`, `ref.cast`, `struct.get`, the same three instructions the NARROWED read already emits |
  | **X** | `exprUnion`'s `Member` arm (`emit_classify`) | the read is no longer a union VALUE, so every box consumer knows it must box |
  | **B** | `emitUnionCoerce`'s `cak` ladder (`wasmEmit`) | the box's atom comes from the predicate, not from re-classifying an expression the ladder cannot see |

  **THE PREDICATE HAS THREE CONDITIONS AND THE THIRD IS THE ONE THE REFUSED CANDIDATE LACKED.**
  (1) the read is UN-narrowed — the narrowed path has its own unbox and `exprUnion` already
  declines for it; (2) the CHECKER banked a primitive value atom at the read node — the D209
  asymmetry itself; (3) **the box can actually HOLD that atom** (`unionHasAtom` over the field's
  own member set). Condition 3 is why `C` lost 72 cells and `R` loses 36: without it the
  i64/f64 sub-family unboxes to an atom the store never boxed. See D291.

* **MEASURED — FOUR INSTRUMENTS, and the corpus `cmp` first.**

  | instrument | population | `runs` LOST | into silent | forward |
  |---|---|---|---|---|
  | corpus `cmp`, byte-for-byte | **1,909 modules built** of 2,341 files | — | — | **1,906 identical, and ZERO pre-existing modules move.** The three movers are all this change's own: its new fixture, D271/D272's pin fixture (bytes change, behaviour does not — still six `7`s), and the `--codegen` specimen pin it deletes |
  | the **d272 READ grid** — the axis that refuted the last candidate | 1,260 | **0** | **0** | **+24** `check-clean invalid wasm → runs` |
  | the **d290 CHANNEL grid** (`shape × cons × cont × annpat`), built for this cut | 714 | **0** | **0** | **+25** `check-clean invalid wasm → runs` |
  | the **DISTILLED census** (1,477 representatives for 250,703 cells) + its `named/` half (380 curated, incl. D272's 72, D224's 207, D282's 36 and D300's 65) | 1,857 | **0** | **0** | 0 — *no cell changed class* |

  **THE DISASSEMBLY, in this row.** On this row's own repro, `base` hands
  `struct.get $C1 0` — a `(ref $uBox)` — straight to `__print_i32__`. After:
  `struct.get $C1 0` · `struct.get $uBox 1` · `ref.cast (ref $vbI32)` · `struct.get $vbI32 0`.
  On **D272's pin** the same read unboxes and the consumer RE-BOXES it —
  `struct.new $uBox (i32.const 0) (struct.new $vbI32 (struct.get $vbI32 0 (ref.cast … )))` where
  base passed the box through. That round trip is the landing's whole cost, and it is one
  allocation at an adopted read whose consumer wants a box.

  **THE COUNTERS, which is why the corpus `cmp` is a mechanism and not a coincidence.** A
  counter build over the whole corpus: the predicate is **REACHED 502 times across 81 files**
  and **ANSWERS 27 times in exactly THREE files** — and those three are, cell for cell, the
  three modules `cmp` moves. The rung answers nowhere else in 2,341 files, so the byte-identity
  is a consequence rather than a coincidence. Per program: this row's repro `reach=1 ans=1 readfire=1 exprdecl=0 coercefire=0`;
  **D271's pin `reach=0`** — the predicate is not even reached, so this close provably cannot
  move that row; D272's pin `reach=4 ans=4 readfire=1 exprdecl=2 coercefire=1`, all three ends
  firing on the program the last candidate reddened; the i64 spelling `reach=1 ans=0` — reached
  and DECLINED by condition 3, the guard proving itself.

* **ABLATION BY STRIPPING — all seven compositions, and both direction checks.** Stripping all
  three rungs reproduces master `f6fda728` **byte-for-byte at 1,463,129**, `cmp`-proved against
  the tree's own build rather than assumed.

  | compiler | bytes | d272 →runs | d272 runs LOST | d290 →runs | d290 runs LOST |
  |---|---|---|---|---|---|
  | base (strip all) | 1,463,129 | — | — | — | — |
  | `R` alone | 1,463,690 | +24 | **36** | +15 | **60** |
  | `X` alone | 1,463,667 | 0 | **36** | 0 | **60** |
  | `B` alone | 1,463,675 | 0 | 0 | 0 | 0 |
  | `R + B` | 1,463,714 | +24 | **36** | +15 | **60** |
  | `X + B` | 1,463,691 | 0 | **36** | 0 | **60** |
  | `R + X` | 1,463,706 | +24 | **0** | +25 | **8** |
  | **`R + X + B`** (shipped) | **1,463,730** | **+24** | **0** | **+25** | **0** |

  **DIRECTION CHECK 1 — a rung that scores ZERO on every population and is still load-bearing.**
  `B` alone moves **0 of 1,974 cells in either direction** on the two grids, AND its corpus is
  byte-identical on **1,907 of 1,907** buildable modules — a complete no-op on every population
  this change measures. Strip it from the landing and 8 cells redden. A per-rung "it moves
  nothing" is not a reason to drop a rung; it is a reason to ask what it holds up.

  **DIRECTION CHECK 2 — one alone is a catastrophe.** `X` alone loses 60 cells and gains
  **nothing**: the classifier stops calling the read a union while the read still emits the box,
  which is the refused read-side candidate with the sign flipped.

  **IT IS NOT A BUNDLE, AND THAT IS THE SAME TEST D224 FAILED — WITH THE OPPOSITE SIGN (D300 /
  #1985).** The failure mode there was a composition priced as a unit whose parts were
  separable: its two rungs' movers intersected in **0** cells and *the union of the singles WAS
  the pair, cell-identical*, so the 199 was really 134 + 65. Run the identical check here:

  * **No strict subset is loss-free.** Over both grids together `R` loses 96, `X` 96, `R+B` 96,
    `X+B` 96, `R+X` 8, `B` 0-but-moves-nothing; only the whole of `{R, X, B}` loses 0. The
    minimal loss-free composition IS the landing.
  * **`R+B`'s moved set is CELL-IDENTICAL to `R`'s, and `X+B`'s to `X`'s** (60 = 60 and 36 = 36
    on d272; 87 = 87 and 60 = 60 on d290). So `B` is not an independently priceable part — it
    is provably inert until both of the other two are present, which is the mechanical form of
    direction check 1.
  * **The union of the singles is NOT the pair.** `|R ∪ X|` is 60 on d272 and 87 on d290 while
    the PAIR moves 24 and 33 — the two rungs' movers overlap in 36 and 60 cells respectively,
    and those are cells each single BREAKS and the other REPAIRS. D224's bundle was additive;
    this is strongly interactive in the opposite direction, which is exactly why no partial
    landing is available.

* Fixture: `tests/cases/soundness/adopted-box-field-read-is-a-channel.vl` — seven programs, and
  it passes ONLY on the three-rung composition (base, `R`, `X` and `R + X` all fail it).
  D271/D272's own fixture is unchanged and still runs.
* The grid is `scripts/silent-sweep/d290/gen290.py`; the 60 cells any partial composition costs
  (8 of them under the two-rung pairing) and the 25 the close buys are named in
  `runs-lost.txt` beside it, in `scripts/silent-sweep/census/d290-channel-price.json`, and whole
  in `scripts/silent-sweep/distilled/named/` — so `scripts/gate.sh` re-grades them.

---
### D290 — A REFUTATION PIN: the STRING atom through the adopted read, which D209's own predicted TWO-RUNG close reddens
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-28 closing D209, as 8 of a 714-cell channel grid · it printed `7` on `474b6a1b`, on `f6fda728` and prints `7` now; it goes check-clean INVALID WASM under the composition `read site + exprUnion` that D209's row named as the close**

Repro (four lines, and the difference from D272's pin is one atom):

    type Circle = { r: string | i32 }
    const v = { r: "7" }
    const q: string | i32 = (v).r
    if q is string { print(q) } else { print(0) }

* **WHY A PIN AND NOT A DEFECT REPRO.** Nothing here is wrong. The adoption boxes `r` as the
  string arm, the consumer is a union slot, and the program has run on every compiler this repo
  has shipped. D209's close makes the READ deliver the bare string ref and the CONSUMER box it
  again, and the round trip is transparent — *provided the consumer knows the atom is `string`*.
* **WHAT IT PINS, precisely.** `emitUnionCoerce`'s `cak` ladder classifies the EXPRESSION
  (`exprString`, `exprIsI64`, `exprIsBool`, …), and every one of those arms reads an un-narrowed
  code-16 member as the BOX and declines. With `exprUnion` no longer claiming the read, the value
  falls past the whole ladder to its numeric default `cak = 0` and `struct.new $vbI32` is applied
  to a string ref: `vl check` rc 0, *expected i32, found (ref $type)*. **The day someone moves the
  read site and `exprUnion` without moving the coercion's atom pick, this flips.**
* **IT IS THE SAME SHAPE AS D272, ONE CLASSIFIER FURTHER OUT, and that is the finding.** D272 said
  the read cannot see its consumer. This says the consumer, having been told the value is not a
  box, still cannot see *what atom it is* — because the only place that knows is the predicate the
  read used. Three sites, one answer, or a cell reddens; two of the three is not "most of the way".
* **THE POPULATION IT STANDS FOR.** Under `read + exprUnion`, **8 of the channel grid's 714 cells
  go from `runs` to `check-clean invalid wasm`**, all 8 in a silent class: `shape=string|i32` ×
  `cons ∈ {tounion, tofld, arg, ret}` × `cont ∈ {bare, list}` × `annpat=none`. **Zero of them are
  visible to the 1,260-cell d272 grid** — its `unis` level is `i32 | string` with the payload
  pinned at `7`, so every one of its cells exercises the i32 default that happens to be right —
  nor to census blocks C or D, nor to the corpus `cmp`, which is byte-identical because the corpus
  holds no program of this shape.
* **AND THE WIDER SET: 60 cells that ANY partial composition costs.** `R` alone, `X` alone, `R+B`
  and `X+B` each take the same **60** cells from `runs` to check-clean invalid wasm — the 8 above
  plus `shape ∈ {i32|null, i32|string, i32|i64, boolean|i32, f64|string}` at the same five
  box-wanting consumers. All 60 run under the shipped three-rung composition. They are named in
  `scripts/silent-sweep/d290/runs-lost.txt` and `scripts/silent-sweep/census/d290-channel-price.json`,
  and kept whole in `scripts/silent-sweep/distilled/named/`.
* Pinned as a fixture: programs 3 and 4 of
  `tests/cases/soundness/adopted-box-field-read-is-a-channel.vl` (the binding consumer and the
  union-PARAM one, which take different emitter paths).

---

### D291 — the i64/f64 sub-family of the adopted read, where THREE sources disagree
**check-clean invalid wasm · found 2026-08-27 inside D209, left OPEN by its close 2026-08-28 and deliberately so · 36 of the d272 grid's 1,260 cells and 0 of the d290 grid's (its `shape` axis declines them by construction) · pre-existing on `322c07f2`, on `474b6a1b`, on `f6fda728` and after D209's close, with the module BYTE-IDENTICAL across it (274 bytes) · **THE SPECIMEN as of 2026-08-28** — `tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`, pinned as `tests/cases/soundness/xfail-miscompile-adopted-read-three-source-atom.vl`**

Repro (D209's repro with ONE token changed — `i32` becomes `i64`):

    type Circle = { r: i64 | null }
    const lv1 = [{ r: 7 }]
    print((lv1[0]).r)
    // vl check rc 0 with NO diagnostics; vl run:
    //   Invalid input WebAssembly code: type mismatch

* **THREE SOURCES, NOT TWO.** D209 is a disagreement between the emitter's rep (a box) and the
  checker's type (`i32`). Here a third joins: the field's DECLARED member is `i64`, so the store
  boxes the payload as tag 3 / `struct.new $vbI64`, and the checker still types the read `i32`.
  Whichever of the three the read is made to believe, one of the other two is wrong — unbox to
  i32 and the `ref.cast $vbI32` faces an `$vbI64` payload; unbox to i64 and `print`, typed `i32`
  by the checker, gets an i64.
* **D209'S CLOSE DECLINES IT ON PURPOSE, AND THE DECLINE IS MEASURED.** The channel predicate's
  third condition — the box can actually hold the checker's atom — is exactly this test, and a
  counter build reads `reach=1 ans=0` on this program: the rung SEES the read and refuses. Drop
  the condition and the composition becomes the refused candidate `C`, which lost 72 cells: the
  36 `nuli64`/`nulf64` cells of the d272 grid are the half condition 3 rescues (`R` alone loses
  36, not 72).
* **SO THE FIX IS NOT AT THE READ EITHER, and this row is where that is recorded.** Closing it
  means picking which source wins, and the only source that can be made right for all three is
  the STORE — i.e. the adoption, which is D271's refused resolver side. This row is the residue
  D209's close leaves behind, filed so the family's remaining surface is not carried in prose
  inside a CLOSED row.
* The `f64 | null` spelling is the same row (`const lv1 = [{ r: 7 }]` under
  `type Circle = { r: f64 | null }`), unmoved in either direction by D209's close.

* **IT IS THE `--codegen` SPECIMEN, AND THE PROPERTY IT IS CHOSEN ON IS A CENSUS RATHER THAN AN
  ARGUMENT.** The slot had turned over twice in one day — D282 → D209 (#1984) → D224 (recorded,
  then CLOSED by #1985 before it could be taken) — so this time the successor was picked by
  RUNNING every row in this document rather than by reasoning about families. All **136** rows'
  own filed programs were graded against `f6fda728`'s seed; exactly **ONE** is `check-clean
  invalid wasm`, and it is D209, which this commit closes. **This row is the only live member of
  the class that remains**, and the corpus agrees: after D209's pin is deleted, the
  `@no-instantiate` directive appears on no file at all. So it is not chosen over alternatives —
  it is what is left, which is the one selection rule that cannot be wrong about the population.
* **THE PROPERTIES, ALL CHECKABLE, ALL RE-RUN AT THE SWAP RATHER THAN INHERITED.** `vl check` rc 0
  with **ZERO diagnostics**; `--codegen` rc 1 with `not valid wasm` + `type mismatch: expected
  i32, found (ref $type)`; `--codegen --no-validate` rc 0; `vl build` writes the `.wasm` and exits
  1; NO `emit error` marker; the module is byte-identical across this change at 274 bytes. It
  DECLARES NO UNION, so it inherits the structural property #1984 chose D209 for — `uVariants` is
  empty and the whole variant⇄struct family (D33 / D139 / D156 / D158 / D171 / D224 / D280 / D282)
  is inapplicable to it.
* **AND THE HONEST CAVEAT, because the last two selection rules each failed within a day.** This
  specimen is NOT out of reach of the mechanism that just closed its sibling: the channel
  predicate SEES it and declines, counted at the site as `reach=1 ans=0`. Drop the predicate's
  third condition and this row closes — and 36 d272 cells redden, which is exactly the `R alone`
  column of D209's ablation. It survives on a MEASURED refusal, which is the same class of
  evidence D224 had when its 199-cell price turned out to be a bundle. Read the price, not the
  silence. **If it closes and nothing replaces it, the class is empty**: set `INVALID_MODULE_SRC =
  null` and let the announced-inactive path in that file do its job, rather than reaching for a
  program that is not really in the class.
* **AND IT HAS A `runs but wrong value` FORM, which is the worse half.** The d290 grid's four
  `f64nul_eqlit_*` cells — `if (v).r == 7 { print(7) } else { print(0) }` over the same
  adoption — LOAD and print `0`, on master and after the close alike. The store widened the
  payload to f64 and the compare is emitted against the checker's i32, so the union `==`
  silently answers false: no diagnostic, a valid module, a wrong answer. Any close for this row
  has to move that cell too, and a fix graded only on `check-clean invalid wasm` would not see
  it.

---

### D210 — the nothing-annotated nested map that a value-NAME-keyed fix reddens
**runs today and must keep running · a REFUTATION PIN, measured 2026-08-27 against the first cut of D203's fix**

Repro:

    type Cir2 = { c2: i32 }
    type Sq2 = { s2: i32 }
    type Shape2 = Cir2 | Sq2
    type Circle = { r: Shape2 }
    const lv1 = Map()
    lv1["k0"] = { r: { c2: 1 } }
    const c = Map()
    c["k0"] = lv1
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? { r: { s2: 1 } }
    if (g1).r is Cir2 { print(7) } else { print(0) }

* **THIS IS D203'S WITNESS WITH THE ANNOTATION DELETED, AND IT RUNS.** Both maps key on the
  checker's render, they agree with each other, and the program is correct. That is the floor
  any fix for D203 has to clear.
* **THE FIRST CUT OF THE FIX DID NOT.** It re-keyed the mv slot from the render
  (`{r:{c2:i32}}`) to the DECLARED row the layer's own `structIndexByValName` already
  resolves (`Circle`) — a pure function of the value NAME, so mint and find compute it
  identically. It closed 11 silent cells and moved **9 cells from `runs` to check-clean
  invalid wasm**, every one of them at `annpat=none` over `nestedmap` / `map3` /
  `list_of_map` at `rep ∈ {arm, f64lit, numlit}`. A gated variant (fire only when the
  caller banked a value type) traded that for a corpus regression instead —
  `tests/cases/maps/infer-in-object-literal-field.vl` went from running to
  `emitProgram: map value type has no interned slot`, because the mint and the find no
  longer computed the same key.
* **WHY NO KEY CAN SEPARATE THEM.** D203's witness and this pin differ in exactly one place:
  whether a THIRD binding carries an annotation. Nothing about this map's own value — its
  render, its arena type, its row, its canon id — differs between the two programs, so a
  key computed per value is provably unable to tell them apart. That is D93's "a property of
  the PAIR that a mint minting one slot at a time cannot see", and it is why D203's fix reads
  the DESTINATION instead.

---

### D211 — [CLOSED 2026-08-27] the nullable-field nested map that D156's peel turned from a LOUD refusal into invalid wasm
**closed 2026-08-27 — the filed cell RUNS · 8 of the 12 run, the 4 at `twin=armtwin` are D224 · was `check-clean invalid wasm` · 12 cells of block A's 150,224 · a LOUD→SILENT move introduced by `1e81b0f3` (#1966, D156), live from `1e81b0f3` through `e44ef5e6`, found by block A's after-pass**

Repro (census block A cell `a008328`, verbatim — the graded cell, not a retyping):

    type Circle = { r: i32 | null }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function sink(_x: {[string]: {[string]: Circle}}) { }
    const lv1 = Map()
    lv1["k0"] = { r: null }
    const c = Map()
    c["k0"] = lv1
    sink(c)
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? { r: null }
    if (g1).r != null { print(7) } else { print(0) }
    // NOW PRINTS 0 — `r` is null, so the else arm is the right answer.
    // vl check rc 0 with no diagnostics, at all four seeds below.
    // 1559d80c: vl run -> emit error  emitProgram: ref valtype with no interned shape
    // 1e81b0f3: vl run -> Invalid input WebAssembly code at offset 2213:
    //                     type mismatch: expected i32, found (ref null $type)
    // 88f21245: byte-identical to 1e81b0f3
    // e44ef5e6: byte-identical to 1e81b0f3 — still live on the census's own merge

* **THE MOVE, MEASURED AT FIVE SEEDS, EACH BUILT FROM ITS OWN COMMIT'S SOURCE AND EACH PROVED A
  SELF-COMPILATION FIXED POINT** (so the byte size identifies the commit rather than being
  asserted about it):

  | seed bytes | commit | what is in it | outcome for all 12 |
  |---|---|---|---|
  | 1,452,766 | `1559d80c` | the census's published base | **loud emit reject**, `ref valtype with no interned shape` |
  | 1,453,528 | `c55269c9` | **the census's MERGE commit** — #1965 (D155) already in | **loud emit reject** — unchanged |
  | 1,453,931 | `1e81b0f3` | #1966, the D156 peel | **check-clean invalid wasm** ← THE MOVE IS HERE |
  | 1,455,395 | `88f21245` | #1969, D203–D206 | check-clean invalid wasm, message byte-identical |
  | 1,456,293 | `e04b1567` | #1968, D195–D198 | check-clean invalid wasm |
  | 1,456,371 | `16d5c6e7` | #1970, D181 — **current master** | check-clean invalid wasm — **STILL LIVE**, message byte-identical |

* **ATTRIBUTION IS #1966, NOT #1969, AND THE OBVIOUS READING IS WRONG.** The witness is
  textbook D203 shape — an un-annotated `Map()` with a DECLARED destination (`sink`) — so the
  natural story is that #1969's `letMapDestShape` rung supplied a shape the emitter then
  mis-lowered. It did not: all 12 cells are already invalid wasm at `1e81b0f3`, one commit
  BEFORE that rung existed, and the validator message does not change across #1969. The shape
  of a defect is not evidence of which change caused it; the seed ladder is.
* **AND THE RIGHT BASE IS `c55269c9`, NOT `1559d80c`.** The census PUBLISHED its numbers against
  `1559d80c` but MERGED as `c55269c9`, with #1965 (D155) landing in between and editing
  `emit_collect.vl` — so `RESULTS.md`'s figures were already one compiler change stale on the
  day they merged. Pinning the middle rung matters: without the `c55269c9` seed the 12 cells
  could equally have been #1965's, and "the census's base" is an ambiguous phrase that names two
  different compilers. They are loud at `c55269c9`, so #1965 is cleared and #1966 is not.
* **#1965 IS CLEARED OVER THE WHOLE CENSUS, NOT JUST OVER THESE 12.** Grading every block at
  `c55269c9` as well makes each merge separable cell-by-cell: **#1965 moves 356 cells (222 in A,
  134 in B, zero in C/D/E), all forward; #1966 moves 1,350, of which these 12 go backward;
  #1969 moves 5,746, all forward.** Without the block-A-at-`c55269c9` pass, a cell that #1965
  moved backward and #1966 moved forward again would have been invisible inside the combined
  `1559d80c` → `1e81b0f3` span — the same net-hides-the-move error one level up. There are
  none, but that is a measurement here rather than an assumption.
* **RE-CONFIRMED LIVE ON `16d5c6e7` (#1970, D181).** #1970 moved 4,482 census cells
  `invalid wasm → runs`; none of them is one of these 12, whose class AND validator message are
  byte-identical to `e04b1567`. Re-checked with the 12-cell subset directory rather than a
  census run — ~10 `vl` invocations — which is the cheap standing check a named backward set
  earns. **The seed-ladder rows above are spans between FIXED commits and are unaffected by
  later merges; only this liveness line needs re-running as master moves.**
* **THE FAMILY IS A FULL 2 × 3 × 2 CROSS** — `store ∈ {global, callres}` × `twin ∈ {none,
  samearity, armtwin}` × `union ∈ {unused, used}` = exactly 12, with nine axes held constant:
  `escope=mod`, `declness=byname`, `claim=0`, `cont=nestedmap`, `annpos=dest`, `deliv=direct`,
  `pval=nullfield`, `order=norm`, `rep=nul`. Every cell that satisfies those nine moved; no
  cell outside them did. The deciding ingredients are the NULLABLE FIELD (`r: i32 | null`
  written as `{ r: null }`) and the nested un-annotated map with a declared destination.
* **MINIMISING THE WITNESS DESTROYS IT.** Deleting the never-referenced `type Sq` / `type Shape`
  gives a program invalid at `1559d80c` too, so the reduced program is a different, pre-existing
  defect. **Unused declarations that are inert to the program and load-bearing to the regression**
  is the trap: the two type aliases are never mentioned again, so every instinct says strike
  them, and striking them moves the cell from `union=unused` to `union=nounion` — a coordinate
  that was ALREADY silent at the base. The minimised program still reproduces "check-clean
  invalid wasm", which is what makes it dangerous: it looks like a successful reduction and it
  is a different defect. The instinct to minimise a witness is otherwise correct and would have
  produced a wrong row here. This row is therefore filed with the graded cell verbatim, and the
  check that catches the mistake is cheap — **run the reduced witness against the BEFORE seed as
  well, and require it to be loud there.**
* **WHY IT COUNTS AS BACKWARD THOUGH NO WORKING PROGRAM WAS LOST.** `runs` is untouched — this
  cell never ran. What changed is that a DIAGNOSED refusal became an undiagnosed invalid
  module: `vl check` is clean and `vl run` produces a validator error naming wasm offsets
  instead of a compiler message naming the construct. That is precisely the transition the
  census exists to count, and it is why `0 runs lost` is not on its own a sufficient after-pass
  result.
* **HOW IT SURVIVED, WHICH IS THE PART WORTH FIXING.** #1966 reported "0 backward" and that was
  TRUE of the grids it ran — its own 1,188-cell position grid and the D112/D131/D88 grids. The
  census existed by then (it merged as `c55269c9`, one commit earlier) and was not re-graded, so
  a population that contained these 12 cells was never consulted. Nothing in the gate ladder
  required it. The same shape appears in #1952's and #1954's reports. The standing check this
  argues for is in `scripts/silent-sweep/census/README.md` under *Grading a MERGED change*.
* **CLOSED FORWARD, NOT BY REVERTING #1966 — AND ITS THREE RUNGS ARE ALL INNOCENT.** Ablated by
  stripping, each of #1966's rungs ALONE restores the loud floor, and two different messages
  separate them: strip the `armPinAnnName` peel and the program stops at `ref valtype with no
  interned shape` (the pre-#1966 message), strip the `dstPinMapValue` peel or the
  `synthDstPinAnns` fixpoint and it stops at `unsupported map value type`. Only all three
  together reach the silent state — because together they complete the pin chain CORRECTLY, and
  what the completed chain reaches is a field read the classifier ladder had no rung for. The
  root has no map in it at all: `type Circle = { r: i32 | null }` beside a `type Shape` and
  `if g.r != null` is a loud emit reject at every storage class, five lines, no annotation.
  That is **D219**, and closing it moves these 12 cells to `runs` while #1966 keeps all 92 of
  its own.
* **D171 IS THE NEIGHBOURING ROW AND IS STILL OPEN, WHICH IS NOW LOAD-BEARING.** It is filed as
  PRE-EXISTING on `ff04d74b`, its witness carries a non-nullable `Circle = { r: i32 }`, and it
  is the CONTESTED half — a declared struct twin of the arm's layout. D219's fix is GATED on
  `armLayoutContested` for exactly that reason: un-gated it moved 384 census cells from a loud
  emit reject into check-clean invalid wasm, all at `declness=byname, pval=nullfield, rep=nul`,
  because the rep layer still conflates arm and twin one container out. The nullable field is
  what separates this row from D171; the layout twin is what separates what could be fixed from
  what could not. Two more gates followed from the same re-grade and are listed under D219 —
  an ARM twin (block B, 66 cells) and a ref-list ELEMENT receiver (block E, 96 cells, D223) —
  and none of the three was visible to the 1,664-cell position grid, which reported 0 backward
  for all of them.
* **EIGHT OF THE TWELVE RUN; THE OTHER FOUR ARE THE ARM-TWIN QUARTER, AND THEY ARE D224.**
  The cross splits exactly on `twin`: all four `twin=none` cells and all four
  `twin=samearity` cells now run and print `0`; the four `twin=armtwin` cells keep the class
  they had on `e44ef5e6` (`check-clean invalid wasm`, message byte-identical), because R10's
  arm-twin gate declines for them. They are not a regression of this change — they are the
  part of this family that lives in D171's contested territory, and they get their own row so
  that "D211 is closed" cannot be read as covering them.

---

### D171 — the CONTESTED half of D156's peel: a half-pinned chain is worse than an un-pinned one
**[CLOSED 2026-08-28] the repro below RUNS and prints `7` — and NOT by any carrier this row names. A half-pinned chain is worse than an un-pinned one because the two halves cross TWO HEAP TYPES for one checker type; **D280** merges them and the distinction disappears. **THIS ROW'S OWN CONCLUSION IS CONFIRMED, NOT OVERTURNED**: "the conflation is load-bearing" is exactly what rules the fix OUT of the element key and INTO the heap, and `repElemKeyGo` / `repElemIdGo` are untouched. The peel is still gated on `armLayoutContested`, unchanged. Was: check-clean invalid wasm · found 2026-08-27 in D156's ablation · D156's own filed witness, plus 12 cells of the 1,188-cell position grid and 4 of the 1,114-cell D112 grid · pre-existing on merged master `ff04d74b`**

Repro (D156's own, verbatim — it declares the layout twin, which is what makes it contested):

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: {[string]: Circle}}) { return x }
    function mk() {
      const i0 = Map()
      i0["k"] = { r: 7 }
      const c = Map()
      c["o"] = i0
      thru(c)
    }
    mk()
    print(7)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **RE-GRADED 2026-08-27 ON `a19a3db7`, AND THE CLAUSE BELOW IS REFUTED. The pin now DOES
  close it.** Deleting the `!armLayoutContested(leaf)` conjunct from `pinArmDeepUncontested`
  — the whole of the gate, nothing else — and self-compiling (1,457,432 bytes) makes this
  row's own filed witness RUN and print `7`. So the carrier is complete after all; what
  finished it is the FIXPOINT loop and the merges since this row was written (#1965, #1966,
  #1969, #1968, #1970, #1971, #1972), and the numbers below were taken on `1559d80c`, before
  all of them.
* **WHAT STILL REFUSES IT IS D172's PIN, MEASURED ON THE SAME BUILD.** Under the un-gated peel
  D172's witness — a program that RUNS on master — goes to `check-clean invalid wasm`. That is
  the refutation pin doing exactly its job, and it is the one thing standing between this row
  and closure. **D172's own filed COUNTERFACTUAL message has moved with the tree**: it records
  `expected array type at index 0, found (struct (mut i32))` under the un-gated peel and the
  build above produces the ordinary `expected (ref null $type), found (ref $type)`. D173's pin
  is unaffected (it pins a different change) and keeps running.
* **AND D172's OWN PRESCRIBED COMPLEMENT DOES NOT RESCUE IT — BUILT, NOT REASONED.** Adding the
  name-side arm hint at `mvShapeOfValNameArmTy`'s two FIND rungs (`mvArmSigOfName(valName, 8)`,
  taken ONLY over `MV_ARM_NOHINT` and only when it resolves an arm, so it is strictly narrower
  than the variant D172's row measured) composed with the un-gated peel: 1,457,464 bytes, D171
  runs, D173 runs, **D172 still `check-clean invalid wasm`**. So "complete the chain, THEN make
  the arm honest" is now half-verified — the chain IS complete — and the remaining work is
  D172's pass-ordering root (`mvMapTypeIdx` pushed as 0 at a mint that postdates
  `mAssignTypeIndices`), not the hint.
* **The clause this replaces, kept for the record and now known to be stale:** "the pin works
  and the program still fails … what is left is not the carrier".
* **A HALF-PINNED CHAIN IS MEASURABLY WORSE THAN AN UN-PINNED ONE, and the un-pinned one is
  riding a CONFLATION.** On master an arm-valued map spelling and its layout twin's render
  resolve the SAME ref-list row and the SAME mv slot at every level, so a chain that is
  un-pinned end to end is internally consistent by accident. Pin the OUTER level and the
  chain is consistent nowhere: the pinned level asks for `uVarHeap[Circle]` and the un-pinned
  one builds `sHeapIdx[Dot]`. Where the pin can reach every level (one function, the fixpoint)
  the chain is consistent again; where it cannot — across an un-annotated PARAMETER, across a
  CALL — it is not, and those are exactly the 12 backward cells: 8 `bindann x param`, 2
  `bindann x global`, 2 `dest x local x d3`.
* **SO THE CONFLATION IS LOAD-BEARING, AND THAT INVERTS D156's PRESCRIBED ORDER.** Removing it
  is D172 and D173, and both are pure regressions on their own (0 forward / 56 backward and
  0 / 16 respectively). The order is: complete the chain, THEN make the arm honest.
* **WHAT WOULD CLOSE IT** is a carrier the pin family does not have — the ARGUMENT→PARAMETER
  hop, so `fill(c, 7)` over a module-scope `c` pinned `{[string]: {[string]: Circle}}` reaches
  `fill`'s un-annotated parameter before `dstPinMapValue` reads it. `dstPinCallArgs` already
  walks a call's arguments and reads the CALLEE's parameter annotations; the reverse direction
  is the missing half, and it is a signature change, which is why it is filed rather than
  guessed at. `synthParamAnnots` does the same job from the checker's recorded types and runs
  AFTER `monomorphize`, which is too late for this seam.
* The gate that ships instead is `armLayoutContested` — no declared struct row of the arm's
  exact layout — and it is a MEASURED boundary, not a soundness argument: the peel's forward
  and backward halves fall on opposite sides of it with nothing crossing.
* **THE NAMED CARRIER WAS BUILT AND IT IS NOT THE ANSWER (2026-08-27, on `a19a3db7`).**
  `synthArgParamAnns` — an un-annotated PARAMETER pinned from the committed spelling every call
  site's argument offers, inside the `synthDstPinAnns` fixpoint, gated on all sites agreeing
  and on the spelling reaching an arm — moves 2 cells of the 1,188-cell position grid and 0 of
  the other three, does NOT close this row's witness on its own, and **does not remove one of
  the 12 backward cells the gate exists to prevent**: the un-gated peel with and without it
  has the IDENTICAL backward set. What DOES close this witness is lifting the gate, and what
  is under the gate is D173's ref-list key, re-measured at **46 backward on D88** once the
  chain is complete. Full table and the seven-witness composition: D156's close, and D236.
* **RE-RUN 2026-08-28 ON THE D280 SEED (1,463,065): THE WITNESS RUNS, AND THIS ROW'S FINDING IS
  WHAT CHOSE THE FIX.** "The conflation is load-bearing" is CONFIRMED and is the constraint that
  ruled the element key out and the heap merge in: if the arm may not have its own key, then the
  only way to make a half-named chain consistent is for the arm and the twin to SHARE the heap
  the key already conflates them onto. Measured on the ablation ladder, this row's witness is
  still check-clean invalid wasm under the heap merge ALONE (X1) and under the merge plus the box
  rung (X1+X2); it needs X3 — the ref-list and map-value pairwise relations learning the
  cross-table equivalence — which is the layer this row's own dump named
  (`MV slot=3 name={[string]:Circle} twin=1` onto `{[string]:{r:i32}}`). D156's family closed at
  106 forward / 0 backward on 5,188 grid cells and 0 `runs` lost on 250,310 census cells.

---

### D172 — an mv slot minted AFTER `mAssignTypeIndices`, so its map struct is heap type 0
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-27 in D156's ablation · the defect is REACHABLE ONLY UNDER THE UN-GATED PEEL, which is refused (D171), so the witness below is the program that must stay `runs` while the gate stands — it flips to a silent miscompile the day anyone lands the peel un-gated · when it does flip, the engine sentence names a STRUCT where an ARRAY was expected, a DIFFERENT MESSAGE from every other row in this family**

Repro (the D112 grid cell `d3_anon_armtwin_declname_outer_nonul_coal_norm` — prints `7` on
this tree; the commented outcome is what it produces under D156's UN-GATED peel):

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mk(n: i32) {
      const l1 = Map()
      l1["k1"] = { r: n }
      const l2 = Map()
      l2["k2"] = l1
      const c: {[string]: {[string]: {[string]: Circle}}} = Map()
      c["k3"] = l2
      return c
    }
    print(((((((mk(7))["k3"] ?? Map()))["k2"] ?? Map()))["k1"] ?? { r: 0 }).r)
    // vl run, un-gated peel:
    //   Invalid input WebAssembly code at offset 586: expected array type at
    //   index 0, found (struct (mut i32))

* **THE MESSAGE IS THE TELL AND IT IS NOT A NULLABILITY SENTENCE.** Every other row in this
  family says `type mismatch: expected (ref null $type), found (ref $type)`; this one names a
  STRUCT where an ARRAY was expected, because the map's `struct.new` is emitted against heap
  type **0**.
* **`mvMapTypeIdx` IS PUSHED AS 0 AT THE MINT AND FILLED BY `mAssignTypeIndices`**, so a slot
  minted after that pass keeps the 0. Probed with a trace at the mint and at the assignment
  boundary, on the cell above:

      MINT slot=0 name={r:i32}                    kind=1
      MINT slot=1 name={[string]:{r:i32}}         kind=6
      MINT slot=2 name={[string]:{[string]:Circle}} kind=6
      MINT slot=3 name={[string]:Circle}          kind=6
      ASSIGN boundary: mvValName.length=4
      MINT slot=4 name=Circle                     kind=1     <- one line too late

  The hand-annotated sibling that RUNS mints `Circle`, `{[string]:Circle}` and
  `{[string]:{[string]:Circle}}` in that order and all three before the boundary.
* **THE ROOT IS AN UN-HINTED FIND, AND THE COMPLEMENT IS ALREADY WRITTEN.**
  `mvShapeOfValNameArmTy`'s two FIND rungs take their arm hint from `mvArmHintOfTy(armTy)` —
  the caller's recorded TYPE and nothing else — so a caller with no type hands
  `MV_ARM_NOHINT`, which matches a slot of ANY arm parity, and the kind-6 recursive intern
  (`mvShapeOfMapName(bare)`, which passes -1) lands on the layout twin's slot and mints
  nothing. The later HINTED caller refuses that slot and mints the arm's own, too late. The
  MINT twenty lines below already has the second source the finds lack —
  `mvArmSigOfName(valName, 8)`, whose own header says "the NAME-side twin of the rung above,
  **for the mint's fallback**" — and no find calls it. Pattern 1.
* **AND FIXING IT IS A REGRESSION ON ITS OWN, WHICH IS WHY IT IS FILED AND NOT SHIPPED.**
  Adding the name-side fallback at the two find rungs (only from `MV_ARM_NOHINT`, never over a
  caller's resolved -1, so the find can only DECLINE more) moves the message on the cell above
  to the ordinary `ref null` mismatch — instrument 4, same class, different bytes — and
  **0 forward / 16 backward on the 1,114-cell D112 grid and 0 / 18 on the 1,188-cell
  position grid** (measured on `1559d80c`, the base this candidate was built against). It is
  D171's conflation being removed before the chain is complete.

---

### D173 — the ref-list ELEMENT key conflates a union ARM with its declared layout twin, one container out
**A REFUTATION PIN: it runs today and must keep running · found 2026-08-27 in D156's ablation · the kind-6 half of D123, LOCATED — and the conflation is LOAD-BEARING, so the witness is a program that runs BECAUSE of it and that reddens the moment the arm gets a nominal element key**

Repro (the D156 grid cell `bindann_param_d1_arm_notwin_norm` — ten lines, NO layout twin
declared, prints `7` on this tree):

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function fill(c, n: i32) {
      c["k1"] = { r: n }
    }
    const c = Map()
    fill(c, 7)
    const m: {[string]: Circle} = c
    print((((m)["k1"] ?? { r: 0 })).r)
    // vl run on this tree: 7
    // vl run with the arm rung added to BOTH rep-key walks:
    //   Invalid input WebAssembly code — WebAssembly translation error in function[5]

* **WHY A PIN AND NOT A DEFECT REPRO.** `fill`'s parameter is un-annotated, so nothing pins
  `c`'s value cell; the map's element resolves the ANONYMOUS `{r:i32}` row while `m`'s
  annotation names the ARM. That program is only well-typed at the wasm level because the two
  spellings share ONE ref-list row — the conflation this row is about. Give the arm its own
  key and the two stop meeting, and this program, which has no twin and no ambiguity in it at
  all, stops emitting. **The conflation is load-bearing, which is the whole finding**, and it
  is why D156's prescribed order (twin first, peel second) is refuted.
* **MEASURED ON THIS TREE, not carried over.** The rung was rebuilt on the shipped compiler
  (`c4-E2`, 1,454,291 bytes) and re-graded: **0 forward, 40 backward on the 2,850-cell D88
  grid, 10 backward on the 1,188-cell position grid, 0 either way on D112** — every backward
  cell `arm x notwin x param`, i.e. exactly the un-annotated positions that were riding the
  conflation. Twenty same-class MESSAGE moves come with it, which is what says the rung DOES
  fire and is not inert.

* **D156's dump said "`{[string]:Circle}` twins onto `{[string]:{r:i32}}` and shares its
  ref-list row" and read that as `repMapValSlotsTwin`'s kind-6 arm. It is one layer lower.**
  That arm is `rlSlotsLayoutTwin(mvRlSlot[a], mvRlSlot[b])`, and it answers 1 for the trivial
  reason: `a == b`. The two mv slots were handed the SAME ref-list row by the interner.
* **`repElemKeyGo`'s `TyObj` arm keys a DECLARED STRUCT nominally (`repSlotOfTyDecl` →
  `S<slot>`) and expands everything else structurally. A union ARM is neither** — it is not a
  struct-table row — so `Circle` keys `{r:i32,}`, byte-identical to the anonymous shape. At
  the LEAF that is invisible (the kind-1 mint interns `sNames[vsi]` or the arm's own name, two
  different spellings, two rows). ONE CONTAINER OUT the `TyMap` arm composes the leaf key:
  `{[string]: Circle}` and `{[string]: {r:i32}}` both key `M[string:{r:i32,}]`.
* **AND THE STRING KEY IS NOT THE ONE THAT KEYS THE TABLE — this cost a whole build.** Adding
  the arm rung to `repElemKeyGo` changed nothing at all: `rlInternNameTy` keys on
  `repElemIdOfNameTy`, which is `repElemId` → `repElemIdGo`, a SEPARATE structural walk with
  its own `HC_*` tags. Probed with both patched in the same compiler and only the string one
  live, `repElemKey(78)` printed `M[string:V0]` while `RLI hit name={[string]:Circle} ty=78
  key=4` still landed on the twin's row. Build twins ARM FOR ARM.
* With both walks given the rung (`HC_VSLOT`, elem key only — the mv-value key's arm component
  is `mvValArmSig`, a separate column) the rows separate and D156's four D112 backward cells
  RUN. It is **still not shippable**: 0 forward / **56 backward** on the 2,850-cell D88 grid
  and 0 / 6 on the position grid (measured on `1559d80c`), all of them un-annotated positions that were riding the
  conflation (D171). The memo needs a fourth generation term (`uVarTyIx.length`) with it,
  since the key now depends on a table `repElemMemoSync` did not watch.


---

### D195 — an un-annotated binding of a CLOSURE-VALUE call whose result is a union ARM
**CLOSED (this PR) · found 2026-08-27 from the census's own `union`-rescued cluster witness `cellsA/a038675.vl` · the arm's LAYOUT TWIN is what makes it silent; without one the same root is a loud emit reject**

Repro (the census cell `scratch-silent/census/cellsA/a038675.vl`, verbatim — on `1e81b0f3`
this is `vl check` clean and `Invalid input WebAssembly code … type mismatch: expected (ref
null $type), found (ref $type)`):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: string }
    type Circle = { r: string }
    const c: Circle = { r: "seven" }
    const lamc = (x: Circle) => x
    const dd = lamc(c)
    if (dd).r == "seven" { print(7) } else { print(0) }

* **`exprVariantIndex`'s `Call` arm had ONE callee form: a DECLARED function
  (`fnRetVariantIndexSid` → `fnIndexOfSid`).** Its NULLABLE twin `nulVariantIdxOfExpr` — whose
  header tabulates the correspondence arm by arm — has carried THREE for as long as it has
  existed: the declared function, a CLOSURE VALUE (`calleeCloSigKeySid` + `sigKeyRetSlot`),
  and a closure-valued FIELD (`fieldClosureFeOfRecv`). This is the twelve-times-proven
  pattern: **the complement was already written, arm for arm, and never called from the
  non-null side.**
* **-1 HERE IS NOT "UNKNOWN", IT IS THE WHOLE KIND DECISION.** `globalKind`'s variant arm
  *is* `exprVariantIndex(initIx, -1) >= 0`, and `letIsVariant`'s header says "THE INIT'S REP
  IS `exprVariantIndex`'S ANSWER, AND NOTHING SECOND-GUESSES IT" — so one -1 decides the
  module-global cell, the local slot, and `globalCellStructIdx`'s companion slot together.
  The fall-through is `exprStruct` / `structIndexOfExpr`, which names the STANDALONE struct
  table — a table a union arm has no row in, because `collectS` skips a `type X = {…}` that
  is a union member (D57's root).
* **THE PROBE, and it is what settles that the two heaps must stay two.** Instrumenting
  `mAssignTypeIndices` and the un-annotated leg of `globalCellStructIdx` on the cell above:

      sRow 0 name=Dot  heap=0 sTwin=0 tyIx=42
      uRow 0 name=Circle heap=1 uTwin=0
      uRow 1 name=Sq   heap=2 uTwin=1
      gcsi let=24 globalKind=struct exprVariantIndex=-1 nulVariantIdxOfExpr=-1 structIndexOfExpr=0

  `Circle` has **no `sNames` row at all**; the struct resolver answers **Dot's** row 0 and the
  variant resolver answers -1. **The claimants differ in the output** — heap 0 and heap 1 are
  distinct wasm types — so this is the #1959 shape (two heaps), not #1957's (one).
* **DELETE THE UNION AND THE SAME PROBE EXPLAINS THE RESCUE.** `Circle` re-enters the struct
  table as `sRow 2 name=Circle heap=1 sTwin=1`, a structural twin of `Dot` **sharing its
  heap**, so the wrong row still yields the right heap. That is exactly why `union=nounion`
  is the census's only one-step rescue for this cluster — and exactly why suppressing the
  variant row is NOT the fix (`DECISIONS.md` keeps `uVarHeap` and `sHeapIdx` in two
  namespaces on purpose).
* **THE TWIN DECIDES THE DISGUISE, NOT THE DEFECT.** Drop `Dot` and the struct scan answers
  -1, `fbValtype`'s bounds guard fires, and the same root is the LOUD `emitProgram: ref
  valtype with no interned shape`. A grader reading only the loud half would call the silent
  half absent.
* **AND IT WAS RE-DERIVED A THIRD TIME, ON THE MERGED BASE, BECAUSE #1969 LANDED IN
  ADJACENT TERRITORY.** Re-grading the same 1,518 cells against master `88f21245`: **220 of
  them now RUN** — closed by #1969 — and the merged branch runs **400**, so this fix adds
  **180 on top**, with **0 overlap and 0 lost in either direction**. The two are strictly
  complementary and their coordinates do not touch: #1969's 220 are
  `cont=structfield2`/`nestedmap` × `deliv=calleedeliv`/`structread` × `annpos=readsite`,
  and these 180 are CONSTANT at `cont=bare` × `deliv=closurearg` × `annpos=binding`. **The
  number did not move** — it was 180 before the merge and is 180 after — which is a
  measurement, not a coincidence: both roots end at "the emitter has a different type for
  this cell than the checker does", and they are still different holes.
* **THE CLUSTER, RE-DERIVED RATHER THAN QUOTED.** `RESULTS.md` reports 1,896 cells rescued
  only by `union=nounion`, measured at `1559d80c`. Re-running the whole census against
  `1e81b0f3` and re-deriving `rescue.py`'s grouping gives **20,804 silent coordinates (not
  21,436) and 1,518 in that cluster (not 1,896)** — 378 had already closed with D155/D156.
  Against that baseline the branch moves **180 of the 1,518 to `runs`, 0 to loud, 0
  backward**, and the split is a COORDINATE rather than a fraction: the 180 are CONSTANT at
  `deliv=closurearg` while varying over every `store` (all five), every `escope` (all four),
  `twin`, `union` and `claim` — and `deliv=closurearg` does not appear in the 1,338-cell
  residue at all, whose own levels are `std`/`boundlocal`/`structread`/`calleedeliv` and
  whose containers are `map_of_list` and `annpos=readsite` (D157/D158 territory). Across
  EVERY union-containing cluster (6,496 cells) the branch moves 192, of which 12 are the
  whole of the `deliv,union` cluster; the `twin,union` (1,436) and `cont,union` (890)
  neighbours move 0, so they are different roots.
* **THE `store=capture` POSITION IS A DIFFERENT, LOUD LIMITATION AND NOT THIS ROW.** Calling a
  captured closure BINDING from a nested lambda is `emitProgram: call to unknown function` —
  and it rejects identically with no union, no struct and no twin anywhere (`function
  outer2() { const lamc = (x: i32) => x; const inner = () => { print(lamc(7)) }; inner() }`).
  The union-arm spelling of that program looks like a member of this family and is not; it is
  loud on both compilers, so the silent census cannot grade it at all.
* Fixture: `tests/cases/unions/arm-through-closure-value-call.vl` (lambda binding, function
  value, lambda-with-no-parameter, and the same at function scope).

---

### D196 — a union ARM named inside a function-TYPE ANNOTATION keys the `$fnsig` off its layout twin
**CLOSED (this PR) · found 2026-08-27 by ablating D195 (its fix moved 7 of 21 hand cells and left 6 standing) · the `$fnsig` half of the same root**

Repro (on `1e81b0f3`: `vl check` clean, `Invalid input WebAssembly code … type mismatch`
inside `via`):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    function via(f: (Circle) => Circle, c: Circle) {
      const dd = f(c)
      print(dd.r)
    }
    const c0: Circle = { r: 7 }
    via((x: Circle) => x, c0)

* **`sigKeyOfTy` walks the arena spine and classifies each LEAF with `paramTokOfTy` /
  `retTokOfTy`, falling back to RENDERING the leaf and asking the name classifier.** Both
  arena readers declined every object type by design; the render then reaches
  `annParamKind`, whose last rung is `structIndexOfTypeName` — a FIELD-SET match, which
  claims the arm's plain-struct layout twin.
* **THE PROBE NAMED IT IN ONE LINE.** Dumping the interned key set for the program above:

      sigKey 0 key=cV0;>v   repFe=0
      sigKey 1 key=V0;>V0;  repFe=1     ← the lambda's OWN functype: the variant heap
      sigKey 2 key=s0;>s0;  repFe=-1    ← synthesized from the ANNOTATION: Dot's struct heap

  Two `$fnsig`s for one signature. The `call_indirect` casts through the second and the
  callee is declared with the first — `expected (ref $type), found (ref $type)`.
* **THE QUESTION IS NOMINAL AND ONLY THE ARENA CAN ANSWER IT.** `variantRowOfTy`'s own header:
  "NO STRUCTURAL RUNG. Two variants with the SAME FIELD SET are different variants … SO
  VARIANTS ARE NOMINAL, like unions and unlike structs." Fixed by giving `paramTokOfTy` and
  `retTokOfTy` a `TyObj → variantRowOfTy` arm — index-only, so it cannot claim a plain struct
  (declines, name path unchanged) nor an INLINE `{r: i32}` spelling (its own arena row), and a
  `TyUnion` never reaches it, so a `(Shape) => …` annotation keeps its `u` box token.
* **BOTH HALVES OR NEITHER**: a `(Circle) => Circle` annotation keys both, and half a key is a
  `$fnsig` that still disagrees on the other half.
* Fixture: `tests/cases/unions/arm-in-closure-annotation-fnsig.vl`.

---

### D197 — the closure-FIELD callee rung: `holder.go(c)` returning a union arm
**CLOSED (this PR) · the third rung of D195's `Call` arm, missing entirely rather than merely narrow**

Repro (on `1e81b0f3`: `vl check` clean, invalid wasm):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    const c: Circle = { r: 7 }
    const holder = { go: (x: Circle) => x }
    const viaField = holder.go(c)
    print(viaField.r)

* `exprVariantIndex`'s `Call` arm tested `callee is Ident` and nothing else, so a `Member`
  callee fell straight past. `nulVariantIdxOfExpr` reads `fieldClosureFeOfRecv` →
  `cloRetValKind` / `cloRetValSlot` for exactly this shape. Same gate, same slot, the other
  column.
* Kept as its own fixture (`tests/cases/unions/arm-through-closure-field-call.vl`) because a
  `{ go: … }` literal beside a SECOND lambda in the same union program is a different,
  still-open hole — folding them would make this fixture pin that one instead. That hole,
  in full, because it has no row of its own:

      type Shape = Circle | Sq
      type Sq = { s: i32 }
      type Dot = { r: i32 }
      type Circle = { r: i32 }
      const c: Circle = { r: 7 }
      const lamc = (x: Circle) => x
      const viaLambda = lamc(c)
      print(viaLambda.r)
      const holder = { go: (x: Circle) => x }
      const viaField = holder.go(c)
      print(viaField.r)

  `globalKind`'s `ObjLit` arm is `if structIndexOfObj >= 0 { struct }; if uDeclared
  { union }`, and `{ go: <closure> }` matches no struct row once a SECOND lambda has
  perturbed the anonymous-shape interning — so the literal routes to the union BOX and the
  emitter rejects it for a missing variant field. **Remove the second lambda and the same
  literal interns its own anonymous row and runs**, which is why this row's fixture holds it
  alone. This PR moved that program from `check-clean invalid wasm` on `1e81b0f3` to a loud
  `emitProgram: object literal is missing a union-variant field` — the direction the
  inventory wants, but the program is well-typed and should run.

---

### D198 — the composition: D196 alone moves ONE cell, the floor moves NONE, and six more move only together
**CLOSED (this PR) · this row exists because the ablation's direction check, not its count, is what justified shipping D196**

Repro (`p5_i32arg` — the cell that a per-candidate COUNT calls inert and the composition
calls load-bearing; on `1e81b0f3` it LOADS AND TRAPS, with D196 alone it becomes check-clean
invalid wasm, and only with both does it run):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    function via(f: (i32) => Circle) {
      const dd = f(1)
      print(dd.r)
    }
    const c0: Circle = { r: 7 }
    via((_n: i32) => c0)

* **THE FIVE-COMPILER ABLATION, on a 32-cell hand grid** (each built from `1e81b0f3` with the
  other candidates stripped; stripping ALL THREE reproduces that seed byte-for-byte at
  1,453,931 bytes):

  | compiler | bytes | RUNS | SILENT | LOUD |
  |---|---|---|---|---|
  | none (== `1e81b0f3`) | 1,453,931 | 7 | 15 | 10 |
  | D195/D197 only | 1,454,068 | 15 | 14 | 3 |
  | D196 only | 1,454,017 | 8 | 14 | 10 |
  | the arm-parameter floor only | 1,454,526 | **7** | 12 | 13 |
  | D195 + D196 | 1,454,154 | 22 | 9 | 1 |
  | all three (shipped, 1,454,829 after D199's decline) | 1,454,829 | 22 | **0** | 10 |

* **Pairwise intersections are ALL EMPTY.** D195 moves 8 cells to `runs`, D196 moves 1, and
  the floor moves **0**. **Set identity fails in the useful direction**: the union of the
  singles is 9 and the branch moves 15, so **six cells move only when more than one edit is
  present** — the closure-PARAM and annotated-closure-result shapes, where D196 repairs the
  `$fnsig` and D195 repairs the binding that receives its result. A count would have scored
  D196 at "1 cell" and dropped it.
* **AND THE FLOOR IS THE CASE A COUNT CANNOT SEE AT ALL.** It moves 0 cells to `runs`; its
  whole contribution is the SILENT column. Read as a count it is inert. Read as a
  DIRECTION: **D195+D196 alone push SIX cells of this grid INTO silence** (`v0`, `v3`, `v4`,
  `v6`, `w1`, `w2` — every one a value that reps as the box or as a bare literal meeting an
  arm-typed closure parameter), and the floor takes the grid's silent column to **0**.
* **THE DISGUISE CHANGES UNDER D196 ALONE**: this row's witness moves from `trap_loads` to
  `check-clean invalid wasm` — same defect, different column — which is why the ablation is
  read on all four instruments and never on the outcome count alone.
* **0 `runs` cells lost, 0 cells became silent**, on the shipped branch.

---

### D199 — the `$fnsig` key mints one per variant ROW, but layout-twin arms share ONE heap
**OPEN · loud emit reject on `1e81b0f3` AND on this branch · found by BUILDING D196's first shape rather than reasoning about it, and it is the second refutation of the day**

Repro (`emitProgram: field access but no struct type declared` on `1e81b0f3` and on this
branch — and `wasm trap: indirect call type mismatch`, AFTER printing `7`, under D196's
first shape):

    type A = { v: i32 }
    type B = { v: i32 }
    type U = A | B
    const a0: A = { v: 7 }
    const b0: B = { v: 7 }
    function viaA(f: (A) => A, x: A) { print(f(x).v) }
    function viaB(f: (B) => B, x: B) { print(f(x).v) }
    viaA((p: A) => p, a0)
    viaB((q: B) => q, b0)

* **D196 keyed the arm RAW, so `A` interns `V0;>V0;` and `B` interns `V1;>V1;` — two
  `$fnsig`s — while `buildVariantTwins` gives them ONE `uVarHeap` heap type** (their field
  sets match). The two functypes are then structurally identical at two indices of ONE rec
  group, and **in WasmGC that makes them DISTINCT types**: the `call_indirect` type operand
  and the callee's declared functype disagree, the module VALIDATES, and it traps at run
  time.
* **`loud emit reject` → `trap_loads`, which is a cell moving INTO silence.** No count in
  the ablation would have surfaced it: it moves 0 cells to `runs` in either direction, and
  the whole grid's `runs` column is identical with and without the decline. Only building
  the program found it — the sixth time in this family that a witness refuted a tidy
  explanation.
* **`repSigSlotTokOfKind` ALREADY canonicalises a STRUCT slot** through `repStructSlotRep`,
  for exactly this reason, and passes a VARIANT slot through unchanged. Canonicalising the
  variant slot is the real fix and belongs WITH the other three key producers
  (`cloRetKeySuffix`, `cloParamTok`, `annParamKind`), which key it raw today — **all four
  have to move together or they disagree again**, which is the same arm-for-arm rule D195
  turns on.
* Until then the arena arm DECLINES on a layout-twinned arm (`repVariantSlotsTwin` — the
  pairwise form of `buildVariantTwins`, and deliberately "independent of
  `buildVariantTwins` having run", so it is answerable at `$fnsig` INTERN time). The caller
  falls through to the name classifier, i.e. the behaviour on `1e81b0f3`, so a twinned arm
  is **no worse than it was** and an untwinned one keeps the fix.
* Fixture: `tests/cases/unions/arm-layout-twin-fnsig-decline.vl`, to flip when the four
  producers canonicalise together.

---

### D200 — [CLOSED 2026-08-27 at its filed coordinate] the union-BOX ↔ bare-ARM seam at a CALL boundary, in both directions
**closed · the filed repro RUNS and prints `7` · was `check-clean invalid wasm` on `1e81b0f3` and on `322c07f2` · the residue #1968's probe found and did NOT close: a THIRD struct-only resolver, on the argument-boxing path · direction 2 (the value-call ABI gap) is still floored and now has its own row**

Repro — direction 1, arm value into a union PARAMETER (seven lines; `vl check` clean,
`Invalid input WebAssembly code … type mismatch: expected (ref null $type), found (ref
$type)` at the start function, on both compilers):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    function area(s: Shape) { if s is Circle { return s.r } else { return 0 } }
    const c: Circle = { r: 7 }
    print(area(c))

* **THE SAME SHAPE AS D195 AND THE SAME TWIN GATE, AT A RESOLVER D195 DOES NOT REACH.** The
  argument here is a bare `Ident`, not a call, so `exprVariantIndex`'s `Ident` arm — which
  already has param / declared / capture / global legs — answers correctly; the wrong answer
  is produced further down the boxing path.
* **THE THREE CONTROLS THAT BOUND IT**, each one edit from the repro and each measured on
  this branch:
  * delete `type Dot` (no layout twin) — **runs**;
  * move the binding inside a `function` (a LOCAL, not a module global) — **runs**;
  * pass the literal directly (`area({ r: 7 })`) — **runs**.

  So the coordinate is `store=global × twin=exact × deliv=box-argument`, and it is a genuine
  silent cell that neither of this PR's two arm-resolution edits touches.
* **FOUND BY PROBING THE RESIDUE RATHER THAN BY ASSUMING IT WAS EMPTY.** After D195/D196 the
  eight other consumers of the struct answer were re-run on a closure-delivered arm (struct
  equality, list element, map value, struct field, return position, assignment, `as`, and
  this one). Seven were already correct or moved; this one did not move, and its NAMED-callee
  control is silent too — which is what says it is not D195 wearing a different coat.

**Second witness — direction 2, a BOX value into an arm-typed closure PARAMETER.** Not the
graded program above (a row grades one), but runnable and reproducible, and it is what the
third edit in this PR exists to keep LOUD. On `1e81b0f3` it is `emitProgram: ref valtype
with no interned shape`; with D196 alone it becomes check-clean INVALID WASM; on this branch
it is `emitProgram: value-call union-ARM parameter given a value that is not that arm`:

```vl
type Circle = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
const c = { r: 7 }              // un-annotated in a union program ⇒ reps as the BOX
const lamc = (x: Circle) => x   // an arm-typed closure PARAMETER
const dd = lamc(c)
if (dd).r == 7 { print(7) } else { print(0) }
```

* `emitCallRef` has a `union`-parameter arm (`emitUnionBoxArg`, boxes an un-boxed member) and
  had **no `variant`-parameter arm at all**, so a value that reps as the box was pushed raw
  into a `(ref $uVarHeap[vi])` slot. The DIRECT-call twin handles the same three lines
  correctly — replace the lambda with `function idc(x: Circle): Circle { x }` and it runs —
  so this is a value-call ABI gap, not an arm-resolution one.
* Until D196 the `(Circle) => Circle` key named a struct row that does not exist, so
  `fbValtype`'s bounds guard rejected one stage earlier and this call site was never built.
  **Repairing the key moves the disagreement from the type section to the argument** — the
  D52 half-fix shape — and without a floor exactly ONE census cell of 250,238
  (`cellsB/b000061.vl`) moves `loud emit reject` → `check-clean invalid wasm`. The floor is
  in this PR; the arm-building is not.
* **AN `ObjLit` EXEMPTION WAS BUILT INTO THAT FLOOR AND A WITNESS REFUTED IT** — recorded
  because the refutation is the method. The reasoning was that `exprVariantIndex` has no
  object-literal arm by design, so a bare `f({ r: 7 })` would be rejected needlessly; the
  evidence offered was "the corpus is byte-identical with the exemption in place". **That
  evidence proved nothing** — by this row's own sibling D201 the corpus contains no program
  in this family, so it could not have contained the disagreement. Built as a program,
  `f({ r: 7 })` into an arm-typed closure parameter with NO layout twin went `loud emit
  reject` → `check-clean invalid wasm` under the exemption: a cell falling INTO silence,
  the exact failure the floor exists to prevent. There is no exemption; the witness is
  `tests/cases/unions/arm-param-value-call-objlit-arg-floor.vl`.

* **CLOSED 2026-08-27 — THE THIRD RESOLVER WAS THE ONE STORAGE CLASS WITH NO KIND GATE.**
  The wrong answer is `structIndexOfExpr`'s `Ident` arm, through `globalStructIndexSid`.
  Its three siblings all gate on the CELL's kind before reading a struct row —
  `declaredStructIndex` on `localIsRef[slot]`, `capturedStructIndex` on `capturedKindOf`,
  `paramStructIndex` on the annotation alone — and this reader's own VARIANT twin
  `globalVariantIndexSid` states the contract for the pair in its header: *"gated on the cell
  actually BEING the kind-8 variant so the two never both answer for one binding"*. With only
  one half gated the two DID both answer. `structIndexOfLet`'s arena rung (`structIndexOfTy`,
  whose own header warns it "finds the first row denoting this TYPE, which may be a
  structurally identical TWIN") returned `Dot`'s row for a `: Circle` cell;
  `emitUnionBoxArg`'s layout-twin test then compared `sHeapIdx[Dot]` with
  `uVarHeap[Circle]`, found them different **by construction** — two namespaces on purpose —
  and re-emitted the value field by field FROM `Dot`'s heap type. Disassembled on `322c07f2`:
  `global.get 0` is `(ref $uVarHeap[Circle])` and the next instruction is `struct.get $Dot 0`.
  The fix is one kind gate, in the shape the three siblings already have.
* **THE ROW FILED ONE DESTINATION AND THERE ARE FIVE.** Block Q
  (`scripts/silent-sweep/d243/genbox.py --block Q`, producer × destination × layout twin,
  160 cells) crosses the axis the row's three controls held fixed. At
  `src=global-annotated × twin=exact`, **five** destinations were silent, not one: the union
  PARAMETER this row files, a union-typed module GLOBAL assignment, a union-typed LOCAL, a
  `Shape[]` ELEMENT and a `{[string]: Shape}` VALUE. All five close on the one gate, all five
  are pinned in `tests/cases/unions/arm-global-into-box-position-twin.vl`.
* **MEASURED.** Block Q: the gate ALONE moves **5** cells (`check-clean invalid wasm → runs`),
  **0** `runs` lost, **0** into silence. Block P (3,200 list-container cells): **0** either
  way — it is load-bearing in exactly one of the two populations, which is why the direction
  check matters and a candidate that moves 0 in one block is not thereby inert. Corpus: 0
  bytes attributable to this cut. D202, the refutation pin whose whole content is that a
  plain-struct twin must keep flowing through a closure annotation that names the STRUCT,
  still RUNS — a `: Dot` global is a `struct` cell, so the gate passes it.
* **WHAT IS NOT CLOSED, and it is two roots rather than one residue.** Direction 2 (a BOX
  value into an arm-typed closure PARAMETER) is still the floor `emitProgram: value-call
  union-ARM parameter given a value that is not that arm`; its remaining reachable shapes are
  **D269**. The same five box destinations fed by a CALL rather than by a global are
  **D267**. An INFERRED-result callee returning the struct twin into an arm-typed position is
  **D268**.

---

### D201 — the corpus cannot witness this family at all
**A REFUTATION PIN: it runs today and must keep running · the population note this PR's byte-identity rests on**

Repro (a union arm delivered through a DECLARED function — the one callee form the corpus
does exercise, and the control that proves the corpus channel is live rather than empty):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    function idc(x: Circle): Circle { x }
    const c: Circle = { r: 7 }
    const dd = idc(c)
    print(dd.r)

* **All 2,317 `tests/cases/**/*.vl` build BYTE-IDENTICALLY under `1e81b0f3` and under this
  PR's compiler: 1,889 SAME, 428 neither-builds, 0 DIFF, 0 LOST, 0 GAINED.** That is a
  no-regression reading and **not** a liveness one: the corpus contains no program in the
  D195/D196 family, so agreement there could not have contained the disagreement. Liveness
  comes from the census delta and the hand grid, never from this number.
* The witness above is the nearest corpus-shaped program to the family — same union, same
  arm, same twin, same un-annotated binding — and it runs on both compilers, which is what
  makes "the corpus is silent about this" a measurement rather than an excuse.

---

### D202 — an ARM-typed closure PARAMETER whose ARGUMENT is a plain struct twin
**A REFUTATION PIN: it runs today and must keep running · the control D196's nominal key must not redden**

Repro (the plain-struct twin flowing through a closure annotation that names the STRUCT, in a
program where a union also exists — prints 7 on this tree and on `1e81b0f3`):

    type Shape = Circle | Sq
    type Sq = { s: i32 }
    type Dot = { r: i32 }
    type Circle = { r: i32 }
    function via(f: (Dot) => Dot, d: Dot) {
      const dd = f(d)
      print(dd.r)
    }
    const d0: Dot = { r: 7 }
    via((x: Dot) => x, d0)

* D196 adds a NOMINAL rung (`variantRowOfTy`) ahead of a STRUCTURAL fall-through in the
  `$fnsig` key producer. The failure mode it could introduce is the mirror of the one it
  fixes: claiming the ARM's variant row for a program that means the plain STRUCT of the same
  layout. `variantRowOfTy` matches by arena index only, so it declines here — and this pin is
  what says so by running rather than by argument.

---

### D267 — the same five box destinations fed by a CALL: `structIndexOfExpr`'s CALL arm has no kind gate either
**[CLOSED 2026-08-28 by D280] the repro below RUNS and prints `7` · was: check-clean invalid wasm on `322c07f2`, on `28425535` and on the branch that filed it · D200's cut is the `Ident` arm's gate and this is the arm beside it · found 2026-08-27 by block Q, the producer × destination cross D200's three controls held fixed**

* **NOT CLOSED BY A KIND GATE — the missing piece was one heap type.** Graded across the D280
  ablation ladder: silent on the base seed (1,461,851), `runs` under the cross-table heap merge
  **alone** (`uVarSTwin`, seed 1,462,840), and `runs` on the shipped seed. The destination and
  the producer disagreed because `uVarHeap[Circle]` and `sHeapIdx[Dot]` were two WasmGC heap
  types for one checker type; nothing on the CALL arm changed and no gate was added.
* **OWNERSHIP NOTE.** This row belongs to another agent's landing (#1978). The status is
  corrected because `check-filed-witnesses.py --strict` is a PR gate and a stale row reddens it;
  the MECHANISM recorded below is left exactly as that agent filed it, and whoever owns it should
  decide on its own merits whether the CALL arm still wants its kind gate now that the heap
  question is gone.

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mkc(): Circle { { r: 7 } }
    function area(s: Shape) { if s is Circle { return s.r } else { return 0 } }
    if area(mkc()) == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE SAME SEAM AND THE SAME WRONG ANSWER, ONE ARM OVER.** Disassembled on this branch the
  start function is `call $mkc ; struct.get $Dot 0 ; struct.new $uVarHeap[Circle] ;
  struct.new $uBox` — `mkc`'s functype result is `(ref $uVarHeap[Circle])` and the field is
  read out of it as `Dot`. That is `emitUnionBoxArg`'s layout-twin test again, but the row it
  compares against comes from `structIndexOfExpr`'s **`Call`** arm, which D200's gate does not
  touch: `fnRetStructIndexSid` is kind-gated and declines, and the `nodeTyIsObj` fallback
  ladder below it then resolves the call's recorded `{r: i32}` through `repRowOfTyStruct` to
  `Dot`'s row.
* **THE POPULATION IS FIVE CELLS, the same five D200's own gate closed for a global**: the
  union PARAMETER above, a union-typed module GLOBAL assignment, a union-typed LOCAL, a
  `Shape[]` element and a `{[string]: Shape}` value (block Q `q00027`, `q00059`, `q00075`,
  `q00091`, `q00107`, all `src=call × twin=exact`).
* **THE TWIN IS THE DISGUISE, MEASURED**: delete `type Dot` and every one of the five RUNS,
  which is why no corpus program witnesses this (D201's population note).
* **NOT FIXED HERE, AND THE REASON IS THAT THE GATE HAS NO COLUMN TO READ.** `globalCellKind`
  is the very function that writes the global's cell, so gating on it makes the reader and
  the cell agree by construction; a CALL has no cell, and the candidate discriminator —
  "`exprVariantIndex` already answered from a REP-authoritative source, so the twin test
  cannot be right" — is exactly the claim `letIsVariant`'s header makes about the guard D26
  DELETED, and applying it here would need the population that makes `emitUnionBoxArg`'s twin
  test right in the first place to be named. It is one `if`; it is not one measurement.

---

### D268 — an INFERRED-result callee returns the struct TWIN into an ARM-typed position, with no box anywhere
**[CLOSED 2026-08-28 by D280] the repro below RUNS and prints `7` · was: check-clean invalid wasm on `322c07f2`, on `28425535` and on the branch that filed it · found 2026-08-27 by block Q · NOT D267: there is no union box in the emitted module at all, so `emitUnionBoxArg` is not on the path**

* **AND THAT OBSERVATION IS EXACTLY WHY THE HEAP MERGE IS THE CLOSE.** With no box anywhere,
  the only thing that could disagree was the heap type of the bare struct against the heap type
  of the arm — which is D280. Graded across the ablation ladder: silent on the base seed
  (1,461,851), `runs` under the cross-table merge **alone** (seed 1,462,840), `runs` on the
  shipped seed.
* **OWNERSHIP NOTE.** Another agent's row (#1978); the status is corrected because
  `check-filed-witnesses.py --strict` is a PR gate and a stale row reddens it. The mechanism
  below is left as filed.

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function mkc() { { r: 7 } }
    function idc(x: Circle): Circle { x }
    if idc(mkc()).r == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE DISASSEMBLY IS WHAT SEPARATES IT FROM D267.** `mkc`'s functype is `(func (result (ref
  $Dot)))` and `idc`'s is `(func (param (ref $uVarHeap[Circle])) (result (ref
  $uVarHeap[Circle])))`. Two direct calls, one argument, and no `$uBox` in the module: the
  INFERRED return resolved the anonymous `{ r: 7 }` through the struct table (`Dot`) while the
  consumer's annotation names the arm. D267's module has the box and the field-copy; this one
  has neither.
* **IT IS D39's CHANNEL AT THE INFERRED-RETURN POSITION.** The anonymous shape has two nominal
  claimants and only the CONTEXT separates them; `criClassify`'s inferred-return rung has no
  context, so it takes the struct table's answer. `synthRetPinAnn` is the pin that exists for
  exactly this and it declines here, because `mkc` has no result ANNOTATION to pin from —
  annotate it `: Circle` and the program is D267 instead, which is the control that says the
  two rows are two.
* **THREE CELLS, all `src=callinf × twin=exact`**: the arm-typed PARAMETER above (`q00125`), a
  `Circle[]` element (`q00157`), and an arm-typed parameter whose function RETURNS the union
  (`q00045`). Delete `type Dot` and all three RUN.

---

### D269 — direction 2 of D200: the shapes still under the value-call arm floor
**loud emit reject (`emitProgram: value-call union-ARM parameter given a value that is not that arm`) on `322c07f2` and on this branch · D200's second witness, re-filed as its own row because D244 removed one of its three shapes and the floor's coverage must not shrink silently**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    const lamc = (x: Circle) => x
    function m3(s: Shape) { if s is Circle { lamc(s).r } else { 0 } }
    print(m3({ r: 7 }))

* **THE FLOOR IS THE RIGHT OUTCOME TODAY AND THE ROW IS THE LIFT.** `emitCallRef` has a
  `union`-parameter arm (`emitUnionBoxArg`, which boxes an un-boxed member) and no
  `variant`-parameter arm at all, so a value that reps as the box would be pushed raw into a
  `(ref $uVarHeap[Circle])` slot. Without the floor that is check-clean INVALID WASM, which is
  why the floor was added rather than the reject being called a bug.
* **A NARROW DOES NOT RE-REP A BINDING**, which is what this shape adds over the other two: `s`
  is still the `{tag, value}` box at the call site; the `is` proves WHICH arm rides the
  payload, and the value-call has no arm to hand it to.
* **THE THREE SHAPES THE FLOOR NAMED ARE NOW TWO.** D244 stopped an un-annotated module global
  repping as the box, so `const c = { r: 7 }` + `lamc(c)` RUNS and
  `arm-param-value-call-box-arg-floor.vl` graduated to `@run`. The bare object LITERAL argument
  (`arm-param-value-call-objlit-arg-floor.vl`) and the narrowed binding above
  (`arm-param-value-call-narrowed-arg-floor.vl`, added in the same landing) are still floored,
  and each now has a file so the population is countable rather than prose.
* **THE DIRECT-CALL TWIN OF THESE FIVE LINES RUNS** — replace the lambda with `function idc(x:
  Circle): Circle { x }` — so this is a value-call ABI gap, not an arm-resolution one.

---

### D219 — [CLOSED 2026-08-27] a value-union FIELD of a DECLARED union ARM: the three read classifiers had no rung for the receiver
**closed 2026-08-27 · was `loud emit reject` (`bare null needs a struct-typed context`) on `16d5c6e7` · the ROOT under D211's twelve census cells**

Repro:

    type Circle = { r: i32 | null }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    const g1: Circle = { r: null }
    if (g1).r != null { print(7) } else { print(0) }
    // PRINTS 0 — `r` is null. `16d5c6e7`: emit error, `bare null needs a struct-typed context`.

* **THE GAP IS THE ARM'S OWN TABLE.** `Circle` is a union member, so `collectS` gives it NO
  row in the standalone struct table and `structIndexOfExpr` answers -1 for it at every
  storage class. `memberUnionFieldName` resolved a code-16 field through exactly two rungs —
  that table, and a NARROWED arm (`memNarrowVariantIndex`) — and had none for a receiver that
  is an arm BY DECLARATION, which needs no narrowing to be one. So `exprUnion`,
  `unionNameOfExpr` and `memberUnionReadKind` all answered "not a union field", the `!= null`
  test fell out of `emitNulIsNullTest` past every arm, and the bare `null` reached the scalar
  compare with nothing to type it.
* **DELETE `type Shape` AND IT ALREADY RAN.** That is the whole family's signature and the
  reason D211's twelve census cells are all at `union=used` / `union=unused` and never
  `union=nounion`: the moment `Circle` is not a union member it re-enters the struct table,
  the first rung answers, and only the ARM spelling was ever broken.
* **THE FIX IS `exprVariantIndex` JOINED TO THE VARIANT FIELD TABLES** — the existing answer
  to "which arm is this expression" across all five storage classes, read into the same
  `variantFieldIndex` / `variantFieldTypeAt` / `variantFieldElemName` columns the narrowed
  rung already uses. It ships as `armFieldUnionName`, behind a READ-side composite
  (`memberUnionFieldNameRead`) rather than inside `memberUnionFieldName`, and that split is
  measured: see D220.
* **THREE GATES, EVERY ONE OF THEM FOUND BY THE CENSUS AND NOT BY THE GRID.** The rung as
  first written is right about the classifier and wrong about how far the rep layer can
  follow it, and each gate is a class the position grid could not contain:
  1. **A DECLARED STRUCT TWIN of the arm's layout** (`type Dot = {r: i32|null}` beside
     `Circle`). The rep layer conflates the two ONE CONTAINER OUT — a `Circle[]` element slot
     is typed from the twin's `sHeapIdx` row while this read produces the arm's `uVarHeap`
     one — so naming the field union completes half a chain whose halves disagree. Un-gated,
     block A moved **384 cells** loud → check-clean invalid wasm, all at `declness=byname,
     pval=nullfield, rep=nul`. `armLayoutContested` is #1966's own predicate for this split
     (D171), asked by INDEX through a new `armLayoutContestedAt`.
  2. **ANOTHER ARM of the same canonical layout** (`type DotU = Dot | DotB` where `Dot` is
     `Circle`'s twin). Invisible to (1), because `collectS` skips a union member so there is
     no struct row to find. Block B's **66 cells**, all `twin=armtwin`; `claim` is NOT the
     ingredient — the same witness with its two container aliases deleted still reproduces.
     `armLayoutAmbiguousAt` is (1) plus a `repCanonId` scan of `uVarTyIx`, kept SEPARATE from
     `armLayoutContested` so #1966's peel keeps the predicate its own 92 cells were measured on.
  3. **A REF-LIST ELEMENT receiver** (`xs[i].r`, no binding in between). Block E's **96
     cells**, all `cont=listlist` × `pval=mixed`. This one is a LOUD FLOOR rather than a
     capability gap: the module is already invalid at the outer `array.new_fixed`, and what
     the field read used to do was stop emission before anyone saw it. Filed as **D223**.
* **MEASURED, on a 1,664-cell grid** (4 field unions × arm/no-arm × layout-twin/no-twin ×
  8 receiver storage classes × 13 consumer spellings): **257 cells move, every one forward** —
  164 check-clean invalid wasm → runs, 74 loud emit reject → runs, 19 check-clean invalid
  wasm → loud emit reject (D221's, an improvement). 0 `runs` lost, 0 into a silent class,
  0 output values changed. **And that grid said 0 backward for all three gates above**, which
  is the row's other finding: a grid holds constant the axes it was not chasing, and the
  three classes are a layout twin, an arm twin and a list-element receiver — none of which it
  declared. Only the cell-matched census re-grade saw them.

---

### D220 — [CLOSED 2026-08-27] `is` over a union-typed FIELD read `sHeapIdx[-1]`, which is a COMPILER TRAP, not a message
**now a loud emit reject · was `compiler trap` (`wasm trap: out of bounds array access`) on `16d5c6e7` · found while widening D219's classifier, on a program that already reproduced without it**

Repro (the receiver is PARENTHESISED, which is what made this reachable on master):

    type Circle = { r: i32 | boolean }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function f(v: Shape) {
      if v is Circle {
        if (v).r is i32 { print(7) } else { print(0) }
      }
    }
    f({ r: 5 })
    // `16d5c6e7`: wasm trap: out of bounds array access — the COMPILER dies.
    // Now: emitProgram: field access but no struct type declared (D222 is why it is not `runs`).

* **THE READ IS UNGUARDED.** The `x.y is i32` lowering resolved its receiver with
  `structIndexOfExpr` and then indexed `sHeapIdx[msi]` and `sFieldIndex(msi, …)` with no
  bound test. `structIndexOfExpr` answers -1 for any receiver with no standalone-struct row,
  and `sHeapIdx[-1]` is not a diagnostic — it is an out-of-bounds array access inside the
  compiler. This is the `emitFail` discipline's other half: a table read one line past a
  resolver that is allowed to answer -1.
* **IT IS WHY D219's FIX IS A COMPOSITE AND NOT A ONE-LINE WIDENING.** Widening
  `memberUnionFieldName` itself — the obvious edit, and the first one built — routes the `is`
  push for a DECLARED-arm receiver straight into this read. Graded on a 288-cell grid that
  candidate moves **6 `runs` cells to a compiler trap** and 12 more loud→trap. The read
  classifiers therefore ask a composite and the `is` channel got the guard plus an arm of its
  own (`uVarHeap[avi]`, the same read `emitMem`'s variant arm makes), which is what turns the
  same 18 cells forward instead.
* **THE GUARD AND THE ARM ARE ONE CHANGE.** The guard alone would only move the trap to a
  loud reject; the arm alone is unreachable for the receiver it is written for, because the
  unguarded read claims it first.

---

### D221 — [CLOSED 2026-08-27] `vbHeapIdxOfKind` answered heap type **0** for an UNMINTED value box, and every caller's `< 0` guard was dead
**now a loud emit reject · was `check-clean invalid wasm` on `16d5c6e7` · no union declared anywhere in the witness, so it is not the D219 seam**

Repro:

    type Circle = { r: f64 | null }
    const g: Circle = { r: 5.0 }
    if g.r is i32 { print(g.r) } else { print(0) }
    // `16d5c6e7`: vl check rc 0, then Invalid input WebAssembly code at offset 245:
    //             type mismatch: expected i32, found (ref $type)
    // Now: emitProgram: narrowed union field atom has no value box

* **`vb*Idx` INITIALISES TO 0 AND IS ASSIGNED ONLY WHEN `mAssignTypeIndices` SEES `vb*Used`.**
  A module whose value unions never use a rep therefore answered heap type **0** for that
  rep's box — a real type in every module, and the wrong one. `ref.cast (ref 0)` +
  `struct.get 0 0` shipped where a message was intended.
* **EVERY CALLER ALREADY HAD THE GUARD.** Every site tests `< 0` and takes a loud reject on
  it; none could distinguish "box 0" from "no box", so the guard was dead for exactly the case
  it was written for. `vbHeapIdxOfKind` now reads back the mint's own condition (`vb*Used`)
  and answers -1, and the guards start working.

* **CORRECTION, 2026-08-27 — THERE ARE TEN CALLERS, NOT EIGHT, AND THEY WERE HALF-DEAD RATHER
  THAN DEAD.** This row shipped saying "all eight sites". Counted at `16d5c6e7` (the pre-fix
  commit) and at `a19a3db7` alike, `vbHeapIdxOfKind` has **ten** call sites, all in
  `wasmEmit.vl`, and every one of them tests `< 0`:

  | # | line (`a19a3db7`) | enclosing function | message |
  |---|---|---|---|
  | G1 | 3422 | `emitNarrowedMem` | narrowed union field atom has no value box |
  | G2 | 3596 | `emitOptMemberValue` | `?.` yields a nullable scalar but its union box was not collected |
  | G3 | 3804 | `emitUnionUnboxTail` | narrowed union atom has no value box |
  | G4 | 4440 | `emitUnionCoerce` | union atom has no value box |
  | G5 | 4724 | `emitUnionPayloadUnbox` | union `==` atom has no value box |
  | G6 | 5209 | `emitUnionFieldNarrowUnbox` | narrowed union field atom has no value box |
  | G7 | 6858 | `emitMapGetOrUnionBox` | scalar\|null map value has no value box |
  | G8 | 7092 | `emitMapGetScalarBox` | scalar map read has no value-box type |
  | G9 | 20898 | `emitCoalesce` | union call atom has no value box |
  | G10 | 21035 | `emitCoalesce` | union field atom has no value box |

  The two `emitCoalesce` rows are two distinct sites in one function; G1 and G6 share a
  message, so only **nine of the ten are separable by message alone** from outside the
  compiler.

* **AND "DEAD" WAS TOO STRONG — THE DEAD HALF IS THE VALUE-ATOM KINDS.** Pre-fix,
  `vbHeapIdxOfKind` was `if k == 0 || k == 1 { return vbI32Idx }` … with a trailing `-1`. The
  `-1` fall-through was reachable the whole time — every kind that is NOT one of the four
  boxed scalars (string, null, the five list flavours, closure, and `k == -1` itself) came
  back -1 and fired the guard normally. What could never fire was the guard's *intended* case:
  `k` IS a boxed scalar and its box was never minted. So each of the ten guards had a live leg
  and a dead leg, and the dead leg is precisely the one each was written for.

* **G2 IS THE ONE THAT WAS UNCONDITIONALLY DEAD, AND ITS COMMENT ALREADY CLAIMED THE FIX.**
  `emitOptMemberValue` calls `vbHeapIdxOfKind(0)` — a literal constant, never -1 pre-fix — so
  its `ovb < 0` disjunct could not fire under any program and only `!uDeclared` was doing any
  work. The comment two lines above it read, at `16d5c6e7`, "Both heap types are usage-gated
  (`uDeclared` mints the box, `vbI32Used` its i32 value box), so a program whose collect walk
  never registered the union fails loudly instead of emitting `struct.new` on index 0" —
  describing a `vbI32Used` gate that `vbHeapIdxOfKind` did not consult. The prose documented
  the intended code; #1972 is what made the sentence true. **A comment asserting a guard that
  is not there is worse than no comment** — it is what stops the next reader checking, and it
  sat directly above the one call site whose argument made the guard unfireable.

* **HOW MANY ARE LIVE TODAY: 2 OF 10 HAVE A WITNESS, AND 8 HAVE NONE.** Measured on
  `a19a3db7`, by matching each guard's message across every population available:

  | population | base measured at | programs | cells reaching ANY of the ten guards |
  |---|---|---|---|
  | census block A, graded in full | `a19a3db7` | 150,224 | **0** |
  | census block D, graded in full | `a19a3db7` and again at `811f8102` | 9,000 | **0** both times |
  | the `tests/cases` corpus | `a19a3db7` (2,327) and again at `811f8102` | 2,332 | **0** both times |
  | **total distinct programs** | | **161,556** | **0** |

  The zero is a reading and not a blind spot: the classifier was proved to fire on demand
  against each message text before the sweep, and it correctly declines an unrelated message.
  What the populations do not contain, they do not contain — block A's emit-reject column is
  dominated by `unsupported map value type` (9,545) and `nested arrays are not supported`
  (8,866) and never reaches a value-box path at all.

  **RE-TAKEN AFTER #1973 AND #1975**, both of which changed list-literal element handling:
  block D and the corpus were swept again at `811f8102` and **no guard became reachable**, so
  D228's story is unchanged by either landing. Block A was graded at `a19a3db7` only; the
  integrator's own block-A pass covers `a19a3db7` → `811f8102` and supersedes a branch-side
  re-grade of it. **Two caveats stated rather than buried**: 58 of the 2,332 corpus files hit
  the sweep's 20s timeout, but a guard fire is an EMIT-time failure that returns immediately,
  so a program still executing at 20s has necessarily passed emission and cannot contain one;
  and blocks B, C and E were never swept for this at all.

  For a denominator: block A's silent total is **6,472 at `a19a3db7`** (integrator's
  measurement), against 12,673 published at `1559d80c`. These ten sites reach none of it.

  Two guards were then made to fire by hand-building a program from the guard list:

  * **G6** (`emitUnionFieldNarrowUnbox`) — this row's own filed witness. Which of the two
    same-message sites it is was settled by a THROWAWAY probe compiler that tags G1 and G6
    apart; the answer is G6, and **G1 still has no witness**.
  * **G3** (`emitUnionUnboxTail`) — `const g: f64 | null = 5.0` / `if g is i32 { … }`. That
    program RAN correctly before #1972 and is a loud emit reject after it; it is filed
    separately as **D228**, because its root is a checker hole, not this guard.

  So the honest statement is not "the guards now work" but: **the sentinel is fixed, two of
  the ten guards have been shown to fire, and the other eight remain unwitnessed on every
  population this tree can currently sweep.** A guard that cannot be made to fire is not
  evidence of safety — it is an unmeasured guard, and eight of these still are.
* **THE WITNESS IS THE PLAIN-STRUCT LEG, DELIBERATELY.** `Circle` is not a union member here,
  so this reproduces with no arm seam at all — which is what separates it from D219 and D220
  and is why it is a third row rather than a bullet under either.

---

### D224 — [CLOSED 2026-08-28] D211's ARM-TWIN quarter: the arm rung declined on a pair that `buildVariantTwins` had already merged into ONE heap
**closed 2026-08-28 — the filed cell RUNS · was `check-clean invalid wasm` on `21f48747` · 4 of D211's 12 cells (`twin=armtwin`) · the 199 this row was refused at was a BUNDLE of two independent rungs; only one of them closes this, and its own price is 27**

Repro (census block A cell `a099944`, verbatim — D211's own cell plus one union):

    type Circle = { r: i32 | null }
    type Dot = { r: i32 | null }
    type DotB = { db: i32 }
    type DotU = Dot | DotB
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function sink(_x: {[string]: {[string]: Circle}}) { }
    const lv1 = Map()
    lv1["k0"] = { r: null }
    const c = Map()
    c["k0"] = lv1
    sink(c)
    const g0 = (c)["k0"] ?? Map()
    const g1 = (g0)["k0"] ?? { r: null }
    if (g1).r != null { print(7) } else { print(0) }
    // NOW PRINTS 0 — `r` is null, so the else arm is the right answer.
    // `474b6a1b` (1,463,065) and `21f48747` (1,463,113), byte-identically: vl check rc 0, then
    //   Invalid input WebAssembly code at offset 2217:
    //     type mismatch: expected i32, found (ref null $type)
    // Delete `type Dot` / `type DotB` / `type DotU` and it is D211's cell, which RAN on both.

Regression: `tests/cases/unions/arm-field-read-beside-a-second-unions-layout-twin.vl`.

* **THE DELTA FROM D211 IS THREE LINES AND ONE OF THEM WAS THE DEFECT.** `Dot` has `Circle`'s
  exact layout and is a member of a DIFFERENT union, so `collectS` skips it — there is no
  struct row, and `armLayoutContested` (which asks the struct table) answers false. The
  arm-vs-arm twin is a second ambiguity with the same consequence and its own predicate,
  `armLayoutAmbiguousAt`, whose arm-claimant loop is what D219's rung was gated on.
* **THE FIX IS ONE CONJUNCT, AND THE OLD QUESTION WAS THE WRONG ONE.**
  `repCanonId(uVarTyIx[j]) == key` reads "is there a second ARM of this canonical layout",
  and the rung was written when that implied a second HEAP TYPE. It has not since D48 gave
  the variant layer its twin column: `buildVariantTwins` merges two arms of one canonical
  key and one emitted field layout into ONE heap index, so `Dot`-of-`DotU` and the arm
  `Circle` are already the same heap and the gate was declining on a pair that cannot
  disagree. The loop now asks `repVariantSlotsTwin(vi, j) == 0` — that column's own
  pairwise, timing-independent relation, the same two gates in the same order
  `buildVariantTwins` keys on. **Stripping that one conjunct rebuilds `21f48747`'s seed
  byte-for-byte at 1,463,113**; with it the seed is 1,463,129 and the whole disassembly diff
  is a SINGLE hunk — one `if` condition in one function turned into a short-circuiting
  `(if (result i32) … (call $repVariantSlotsTwin))`.

* **THE 199 WAS THE PRICE OF A BUNDLE. THE TWO RUNGS ARE SEPARABLE, ADDITIVE, AND ONLY ONE OF
  THEM CLOSES THIS ROW.** The refused candidate re-asked BOTH of `armLayoutAmbiguousAt`'s
  rungs of the heap. Built separately on `21f48747` and graded cell-matched on census block B
  (28,590 cells, base seed vs each candidate seed):

  | candidate | seed | block B moved | → runs | runs LOST | → silent | closes D224? |
  |---|---|---|---|---|---|---|
  | **arm rung** (`repVariantSlotsTwin`, shipped) | 1,463,129 | 346 | **319** | 0 | **27** | **yes** |
  | struct rung (`variantStructHeapTwinAt`, D280's merge) | 1,463,127 | 521 | 387 | 0 | 134 | **no** |
  | both (the refused candidate) | 1,463,143 | 867 | 706 | 0 | **161** | yes |

  **Movers intersect in 0 cells; the union of the singles IS the branch, cell-identical — 0 of
  867 disagree with the single-candidate prediction.** So the refusal's number was
  134 + 27, and the 134 buy nothing here: the struct rung cannot close this witness at all,
  because the witness's `Dot` is a union member and `armLayoutContestedAt` answers false for
  it. On the named 207-cell cost set the shipped candidate prints `loud emit reject 142 /
  runs 38 / check-clean invalid wasm 27`; the both-rung candidate prints `runs 46 /
  check-clean invalid wasm 161`. **Three forms of the arm rung were built** — the
  `repVariantSlotsTwin` re-ask, the same question off the banked arena key
  (`variantFieldLayoutEq(vi, j) == 0`), and deleting the rung outright — and all three were
  **cell-identical on all 28,590 block-B cells and byte-identical on the corpus**, so the
  strictest was shipped.

* **THE PRICE IS NOT A LOST REFUSAL, AND IT FELL 65 → 27 IN ONE MERGE WITHOUT THE FIX
  CHANGING.** Measured on `474b6a1b` this cut cost **65**; re-derived on `21f48747` after
  #1984 (D282) it costs **27**, and the 38 that stopped being a price now RUN. Nothing in the
  candidate moved. That is the mechanism, demonstrated rather than argued: every backward cell
  is a cell whose TWIN-FREE spelling is already `check-clean invalid wasm`, so closing the
  twin-free defect retires the price one for one.
* **THE GRID THAT SEPARATES IT, BECAUSE BLOCK B CANNOT.** Block B crosses `twin` only at its
  three CORNERS, so `twin=armtwin` there always carries `claim=2`/`union=used` and the price
  cannot be attributed inside it at all. `scripts/silent-sweep/d224/` builds a **2,484-cell**
  grid — each of the 65 coordinates and D211's 4 armtwin wins, crossed fully against
  `twin × claim × union` with the other nine axes held at that cell's own values:
  1. the change moves **only** `twin=armtwin` cells: 0 at `none`, `exact` and `samearity`,
     and 0 anywhere at `union=nounion`;
  2. all **138** backward cells land on the **byte-identical validator sentence their own
     `twin=none` sibling already produces on `21f48747`** (138 of 138, offsets normalised),
     and the loud message they lose is `emitProgram: bare null needs a struct-typed context`
     — this predicate's own refusal, not a diagnosis of the program;
  3. `claim` is causal for the SIZE and not for the class: 15 backward at `claim=0`, 27 at
     `claim=1` and `claim=2`, and the same counts are already silent at `twin=none`;
  4. the 65 armtwin cells split 38 `runs` / 27 silent under the change and their twin-free
     siblings split 38 `runs` / 27 silent on master — **65 of 65 agree, cell by cell**.

  **The law, in one line: under this change `twin=armtwin` grades identically to `twin=none`
  on 621 of 621 grid cells (and to `samearity` on 621 of 621), where master disagrees on 334
  of each.** A second, unrelated union whose first arm happens to share `Circle`'s field
  layout becomes inert. That is the correct semantics, and what is left of the price is the
  part that was already broken without the twin — filed forward as **D300**.

* **REACHED AND ANSWERING, COUNTED.** A probe compiler that raises a distinct `emitFail` on
  the LIFT branch fires on **348 of the 621** `twin=armtwin` grid cells and on **0 of the
  1,863** others; every one of the 334 cells the change moves is among the 348. On the filed
  witness it fires; on D211's sibling (the same program with the three `Dot*` lines deleted)
  it does not.

* **ZERO ON EVERY POPULATION THE LADDER ROUTINELY RUNS, AND LOAD-BEARING ANYWAY.** The change
  is **byte-identical on 1,906 of 1,906 corpus modules that build on both sides** (the only
  RCDIFF is this row's own new regression case, which master refuses), and moves **0 cells in
  either direction on all four per-row grids** — D88/D100 (2,850), D112 (1,114), D156 (1,188),
  D139 (36). That is the direction check worth keeping: a candidate can score zero on every
  population the gate ladder runs and still be the whole fix.

* **WHY THE FIRST RE-ASK LOOKED LIKE A NON-FIX, AND THE MEASUREMENT ERROR WORTH RECORDING.**
  A build labelled "both rungs" was byte-identical to the struct rung alone — the patcher
  matched its mode string by substring and `"R2" in "R12"` is false — so the arm rung was
  never in it, and the first reading was "the heap re-ask does not lift the arm rung".
  **Two seeds of the same byte size are the same compiler; two seeds of DIFFERENT size can
  still be the same edit.** `md5sum` on the stashed seeds is what caught it.

* **WHAT IS LEFT IS NOT THIS PREDICATE.** The remaining 27 are programs that are check-clean
  invalid wasm on `21f48747` with **no twin declaration anywhere**; see D300. Closing them
  makes this change's price zero, and #1984 already did it for 38 of the original 65.

---

### D300 — D224's price, spelled without the twin: 27 nullable-field arm reads that are invalid wasm with NO twin declaration anywhere
**check-clean invalid wasm · found 2026-08-28 by de-confounding D224's `twin` axis · 27 live of an original 65 census-block-B coordinates — #1984 retired 38 of them · silent on `21f48747` and on D224's branch alike · the population D224's arm-twin gate was an accidental loud floor over, and the exact size of that row's remaining price**

Repro (grid-T cell `t000188` — census block B cell `b008898`'s coordinate with its three
`Dot*` lines deleted, i.e. `twin=none`, which is the point: nothing nominal is contested here):

    type Circle = { r: i32 | null }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Box1 = {[string]: Circle}
    type Box2 = {[string]: Circle}
    type GW = { g: {[string]: Circle} }
    function useShape(s: Shape): i32 { if s is Sq { return 1 } return 0 }
    const sqv: Sq = { s: 1 }
    const _sp1: Box1 = Map()
    const _sp2: Box2 = Map()
    function mkcall() {
      const cc = Map()
      cc["k0"] = { r: null }
      return cc
    }
    function outer() {
      const lam = () => {
        const wv: GW = { g: mkcall() }
        if useShape(sqv) > 99 { print(0) }
        const g0 = (wv.g)["k0"] ?? { r: null }
        if (g0).r != null { print(7) } else { print(0) }
      }
      lam()
    }
    outer()
    // `21f48747` (1,463,113) AND D224's branch (1,463,129), byte-identically: vl check rc 0,
    // no diagnostics, then
    //   Invalid input WebAssembly code at offset 1362:
    //     type mismatch: expected (ref $type), found (ref $type)
    // Put `type Dot = { r: i32 | null }` / `type DotB = { db: i32 }` /
    // `type DotU = Dot | DotB` back and `21f48747` turns LOUD instead
    // (`emitProgram: bare null needs a struct-typed context`) — the declaration the program
    // never mentions again is the only thing diagnosing it, which is D224's whole finding.

* **HOW IT WAS FOUND, AND WHY NO PER-ROW GRID COULD.** D224's candidate moves block-B cells
  from a loud emit reject into check-clean invalid wasm, and the obvious reading is that the
  change breaks them. A 2,484-cell grid that crosses `twin × claim × union` against each of
  those coordinates says otherwise: **all 138 of that grid's backward cells land on the
  byte-identical validator sentence their own `twin=none` sibling already produces on
  master**, 138 of 138 with offsets normalised. The armtwin declaration was not preventing an
  invalid module; it was preventing the module from being WRITTEN, by making a classifier
  decline. Delete it and master emits the same invalid module.
* **THE 1:1 IS MEASURED ACROSS A MERGE, NOT ASSERTED.** On `474b6a1b` 65 of these siblings
  were silent and D224's cut cost 65. #1984 (D282) landed, 38 of them started running, and the
  same unchanged cut now costs 27 — the armtwin cells split 38 `runs` / 27 silent and their
  twin-free siblings split 38 / 27, **agreeing cell by cell on all 65**. Closing the rest
  takes D224's price to zero.
* **THE INGREDIENTS ARE D88/D100's, NOT D219's.** `claim` is causal for the size: 15 of the
  coordinates are already silent at `claim=0`, 27 at `claim=1` and `claim=2`. `Box1`/`Box2`
  are container ALIASES of the same map layout — D88's claimant count — and the sentence is
  ONE sentence across all 27, `type mismatch: expected (ref $type), found (ref $type)`: two
  different heap types behind one placeholder, D39/D100's seam and not this family's
  field-read message. The `union` axis is required (0 cells move
  at `union=nounion`) and `pval=nullfield`, `rep=nul`, `declness=byname`, `order=norm` are
  constant across all of them.
* **THE SET IS NAMED AND IT IS IN THE STANDING GATE.** The coordinates are
  `scripts/silent-sweep/census/d300-twinfree.json` — the `twin=armtwin` half of
  `d224-cost.json` with `twin` set to `none`, one entry per armtwin cell it is the sibling of
  — and all 65 programs are curated into `scripts/silent-sweep/distilled/named/` as
  `d300b*.vl`, so `scripts/gate.sh` re-grades them in seconds on every PR. All 65 rather than
  the live 27: the 38 #1984 closed are `runs` now, which makes them BLOCKING tripwires, and
  losing one would be exactly the regression this row exists to price. That follows the
  standing rule (`CLAUDE.md`, #1982): a derived collapse cannot find these — they are a set a
  GRID named, and what makes them worth keeping is a candidate's price, which nothing reading
  current behaviour can see.

---

### D227 — [CLOSED 2026-08-27] D179's SECOND site: `.slice` / `.filter` read `rlElemName[0]` INSIDE the resolver, where no caller's guard can reach
**now a loud emit reject · was `compiler trap` on `a19a3db7`, `75eb1f17` and `811f8102`, and STILL trapping after D179's own fix · found 2026-08-27 by ablating D179's guard against every other operation that reaches the same resolver**

Repro (FOUR lines, and it needs no `for-in` at all):

    type Cir2 = { c2: i32 }
    type Shape2 = Cir2 | i32
    const c = [{ r: { c2: 1 } }]
    print(c.slice(0, 1)[0].r.c2)
    // `811f8102` AND the D179-only compiler: vl check rc 0, no diagnostics; then
    //   wasm trap: out of bounds array access   (inside the COMPILER)
    // (Re-verified on the merged base: traps on 1,461,131 and on 1,461,158 — D179's rung
    //  alone — and is loud only with both rungs, at 1,461,174.)
    // `vl build -o` writes NO module, which is what separates it from a program trap.
    // Now: emitProgram: ref valtype with no interned shape

* **SAME TWO INGREDIENTS AS D179, DIFFERENT SITE.** An anonymous object literal whose layout
  matches an arm of a DECLARED union (so `collectS` skips the arm and nothing interns the
  shape), plus an otherwise EMPTY ref-list table. `.filter` is the same defect:
  `const d = c.filter((z) => true)` then `d[0].r.c2` traps identically.

* **THE READ.** `refListElemNameOfExpr` (`emit_classify.vl`) ended its `Member`-callee arm
  with `const ms = mfResultSlotOf(exprIx, fnIx)` / `if ms >= 0 { return rlElemName[ms] }`.
  `mfResultSlotOf`'s `.slice` and `.filter` arms hand back `refListSlotOfExpr`'s answer, which
  CLAMPS a miss to `0` — so `ms >= 0` cannot see a miss, and `rlElemName[0]` on an empty table
  is an out-of-bounds read. **It was the only `rlElemName[…]` read in that function with no
  upper bound; the six around it all spell `if rs >= 0 && rs < rlElemName.length`.**

* **IT IS WORSE-PLACED THAN D179's, AND THAT IS THE POINT OF FILING IT SEPARATELY.** The trap
  fires INSIDE `refListElemNameOfExpr`, which `refListSlotOfExpr` itself calls — so it happens
  **before any caller has a slot to bound-test**, and no caller-side guard, D179's included,
  can cover it. Three independent routes reach the same frame: `startFnDetectScratch →
  exprHasStrOp → … → structIndexOfExpr`; `globalPromotable → globalCellKind → exprNulClosure
  → refListSlotOfExpr`; and `collectStartLocals → declareForInLocals → forInElemKind →
  refListSlotOfExpr` — i.e. through D179's own fixed function.

* **THE DISCRIMINATORS, each one change from the repro** (all run, all verbatim):

  | change | outcome on `a19a3db7` |
  |---|---|
  | (none — the repro as filed) | **compiler trap** |
  | `.filter((z) => true)` bound to a local, then `d[0].r.c2` | **compiler trap** |
  | `c[0].r.c2` — drop the `.slice` | loud emit reject |
  | `.map((z) => z)` instead of `.slice` | loud emit reject |
  | add `type Other = { o: i32 }` + `const pad: Other[] = [{ o: 1 }]` | loud emit reject |
  | delete the two `type` lines | RUNS, prints `1` |
  | declare `Cir2` but NOT the union | RUNS, prints `1` |
  | `[{ c2: 1 }]` — the arm directly, not nested | RUNS, prints `1` |

* **THE COMPOSITION IS LOAD-BEARING IN BOTH DIRECTIONS, MEASURED.** On a 288-cell grid
  (`op × decl × shape × pad × store`) master has **8 compiler-trap cells, every one at
  `decl=armunion, shape=nested, pad=nopad`** and nothing else. D179's guard alone fixes **2**
  (`op=forin`); this one alone fixes **3** (`op=slice` ×2, `op=filter/fn`); together they fix
  **8**. **The union of the singles is 5 and the whole is 8** — the three extra are
  `sliceforin/mod`, `sliceforin/fn` and `filterforin/fn`, which reach BOTH sites in sequence,
  so guarding either one alone just moves the trap to the other. Neither rung is droppable,
  and a solo count would have understated both.

  Re-measured on the merged base after #1973, and again after #1975, **identical on every
  cell both times**: 8 traps at `811f8102` (1,461,131), 6 with R1 alone (1,461,158), 5 with
  R2 alone (1,461,147), **0 with both** (1,461,174); `runs` 228 and `check-clean invalid
  wasm` 8 unchanged across all four. Stripping both rungs reproduces `811f8102`
  **byte-for-byte at 1,461,131**. #1973 and #1975 both changed list-literal element handling,
  which is why this was re-taken rather than inherited — and neither moved a single cell of
  this family.

---

### D228 — `is i32` is the ONE non-arm spelling the checker admits, and #1972 turned the program it admits from `runs` into a loud emit reject
**loud emit reject · live on `a19a3db7`, `75eb1f17` and `811f8102` · RAN and printed the right answer on `16d5c6e7` — a `runs` → not-runs move introduced by #1972's D221 rung, on a program no census cell contains**

Repro (TWO lines):

    const g: f64 | null = 5.0
    if g is i32 { print(g) } else { print(0) }
    // `16d5c6e7`: runs, prints `0` — which is the CORRECT answer (`g` holds 5.0, not an i32).
    // `a19a3db7`, `75eb1f17` and `811f8102`: vl check rc 0, then
    //   emitProgram: narrowed union atom has no value box
    // Add `const h: i32 | null = 3` anywhere in the module and it RUNS again, printing `0`.

* **THE CHECKER HAS A ONE-SPELLING HOLE, AND THAT IS THE ROOT.** On the same `g: f64 | null`,
  three of the four non-arm spellings are a loud CHECK reject —
  ``​`is` check type 'i64' is not a variant of f64 | null``, and the same for `boolean` and
  `string`. **Only `i32` passes.** A literal union rejects it too (`type K = 1 | 2`, `k is i32`
  → ``​`is` check type 'i32' is not a variant of K``). So the emit-time guard is a SECOND ERROR
  CHANNEL doing the checker's job, and the row that should exist is a check reject.

* **WHAT #1972 ACTUALLY CHANGED, AND WHY IT LOOKS LIKE A REGRESSION.** Pre-#1972
  `vbHeapIdxOfKind(0)` answered heap type **0** for the unminted i32 box, so the arm emitted
  `ref.cast (ref 0)` on a branch the tag test never takes. The module was VALID and the
  program printed the right answer — it worked BY LUCK, because the nonsense cast sat on dead
  code. #1972 made the sentinel -1, the `< 0` guard woke up, and the program stopped building.
  **#1972 was right to stop emitting nonsense; it is the checker hole that makes the program
  reach emit at all.**

* **THE MINT IS THE DISCRIMINATOR, WHICH IS WHAT PROVES THE MECHANISM.** `vbI32Idx` is
  assigned only when `mAssignTypeIndices` sees `vbI32Used`. A module with no i32 value union
  mints no i32 box, so `vbHeapIdxOfKind(0)` answers -1 and the guard fires. One unrelated
  `const h: i32 | null = 3` sets the flag and the SAME `g is i32` line runs again. The class is
  therefore `f64 | null` + `is i32` + *no i32 value box anywhere in the module* — not
  "nullable scalar union" generally: `const g: i64 | null = 5` with `g is i32` RUNS on both
  compilers.

* **NOT FIXED HERE, DELIBERATELY.** The fix belongs in the checker's `is`-variant test, which
  the literal-union path shares, and a checker change that turns emit rejects into check
  rejects needs a census pass this branch was explicitly descoped from running. Filed with the
  witness set rather than landed unmeasured.

* **NO CENSUS CELL CONTAINS IT**, which is why #1972's all-blocks after-pass reported 0
  `runs` → not-runs truthfully. Measured: across **150,224** block-A cells, **9,000** block-D
  cells and **2,332** corpus files — 161,556 programs — **not one** reaches any of
  `vbHeapIdxOfKind`'s ten guards. The class had to be constructed by hand from the guard list.
  Re-swept at `811f8102` after #1973 and #1975: still none. **This row is the first regression
  found this session OUTSIDE the census population, which is a standing limit on what item 6
  can promise** — a full cell-matched after-pass can report 0 `runs` → not-runs truthfully and
  still miss a two-line program, because the grid has no cell shaped like it.

---

### D223 — an un-annotated list literal of DISAGREEING anonymous shapes mints a BOX list, and the outer annotation's construction is already invalid
**loud emit reject · live on `e44ef5e6` and after D219 · the module was ALWAYS invalid; only an unrelated floor stopped emission first**

Repro (census block E cell `e002074`, verbatim):

    type Circle = { r: i32 | null }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function rd() {
      const lv1 = [{ r: 7 }, { r: null }]
      const c: Circle[][] = [lv1]
      const g0 = c
      if g0.length > 0 {
        const g1 = g0[0]
        if g1.length > 0 {
          if (g1[0]).r != null { print(7) } else { print(0) }
        } else { print(0) }
      } else { print(0) }
    }
    rd()
    // emitProgram: bare null needs a struct-typed context — the floor that has always
    // masked it, and which D219 keeps here on purpose.

* **THE TWO ELEMENTS ARE DIFFERENT ANONYMOUS SHAPES.** `{ r: 7 }` is `{r: i32}` and
  `{ r: null }` is not, so the un-annotated `lv1` is minted over the union BOX rep (element
  kind 2) rather than over `Circle`. The `Circle[][]` annotation one container out then wants
  a list of Circles, and the mismatch lands on the outer `array.new_fixed`:
  `expected (ref null $type), found (ref $type)` at the CONSTRUCTION, before any read.
* **ONE WORD MOVES IT, IN EITHER DIRECTION.** Annotate the inner list (`const lv1: Circle[] =
  …`) and it runs; make the two elements agree (`[{ r: 7 }, { r: 8 }]`) and it runs. Both are
  checked and both print `7`.
* **IT IS FILED BECAUSE D219 HAD TO DECLINE FOR IT.** `armFieldUnionName` refuses a ref-list
  ELEMENT receiver precisely so that this program keeps the loud floor it has today — the
  read is the only stage that stops emission, and an emitter that has recorded a failure keeps
  emitting, so removing the read's floor writes the invalid module instead of diagnosing it.
  96 census cells of block E are this shape. **Closing this row is what lets that decline come
  off**, and it is worth a measurement: the decline costs 354 of block A's 1,062 forward cells,
  720 of block C's 1,320 and 1,248 of block E's 2,232 — every one of them reverting to the loud
  reject it already had, none of them to a silent class.

---

### D222 — a narrowed union receiver in PARENTHESES resolves no variant, and the read floors
**loud emit reject · live on `16d5c6e7` and after D219/D220/D221 · one paren is the whole difference**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function f(v: Shape) {
      if v is Circle { print((v).r) }
    }
    f({ r: 7 })
    // emitProgram: field access but no struct type declared.
    // Delete the parentheses — `print(v.r)` — and it PRINTS 7.

* **`memIsNarrowed`, `memNarrowVariantIndex` AND `emitNarrowedMem` ALL READ `m.memObj` RAW.**
  Every one of them does `P.nodes[m.memObj]` and tests `is Ident`, so a `Paren` receiver is
  not an Ident and not a Member, and all three answer "not narrowed". The rest of the emitter
  unwraps parens everywhere (`unwrapParen` appears at the head of most classifier arms), so
  this is a missing call, not a design position.
* **IT IS THE REASON D220's WITNESS IS LOUD RATHER THAN `runs`.** With the paren removed that
  program runs on `16d5c6e7` too; with it, the receiver reaches the `is`-on-a-field lowering
  as an un-narrowed member and used to index `sHeapIdx[-1]`. Fixing D222 is a separate change
  — `unwrapParen` at three sites, plus whatever the narrowed VALUE read then needs — and it is
  filed rather than folded in because it moves a different population and this one was already
  measured against a 1,664-cell grid it does not appear in.
* **NOT A SILENT ROW.** The outcome is a diagnosed refusal at every spelling probed, which is
  why it is filed with a `loud emit reject` status: it is a capability gap standing next to a
  silent one, and the value of filing it is that the two share a receiver shape.

---

## 3. Shared-root analysis

### Root A — one floor, seven callers, four of which do not stand on it
**D3** (silent invalid wasm) and the loud `narrowed union binding is not a local or global`
family are the SAME decision site: `emitUnionBoxPush`, `compiler/wasmEmit.vl:3123`. Its
comment states the invariant it means to hold — *"a clean reject, not invalid wasm"* — and
the measurement says the invariant holds for three of the seven narrowing forms that reach
a captured box read (`is`, `match`, `??`) and fails for four (`!= null`, `== null`-else,
`&&`-guard, `while`-guard). The `null`-comparison forms narrow through a different
classifier that never consults the box path at all. **This is the highest-value grouping in
the inventory: one predicate away from turning 86 silent cells into 86 loud ones**, which is
strictly better even before anyone wires the capture.

Evidence that it is one root and not two: the loud and the silent forms are the same
program with one operator changed, on the same binding, at the same position, for the same
five reps; and the rep that is loud in ALL seven forms (`(string | i32) | null`) is exactly
the rep whose narrowed read has no second path.

### Root B — the map-view for-in lowering reads its receiver twice
**D2** (double evaluation) and **D5** (narrowed nullable map → invalid wasm) are the same
lowering. D2 shows the receiver expression is emitted twice; D5 shows that when the
receiver is a RECOVERED non-null temp, the second emission does not see the recover and
pushes the nullable wrapper. A single-emission receiver temp closes both. Both are specific
to `.keys()` / `.values()`: `.size`, index get, `.slice`, `.map`, `.filter` and a plain
list `for-in` are all correct at one evaluation (measured), so the shared site is the view
iterable, not for-in generally.

This grouping is the one to be most careful about, because the two rows have **no message
in common** — one has no message at all. They were grouped by the receiver-shape axis, not
by text.

### Root C — the forward reference, four consumers
**D1**'s four symptoms — a boolean printing `1`, a litunion printing its atom id, invalid
wasm, and `Type Ch1 is never` — are one unresolved field type read by four different
consumers (the print classifier, the atom widener, the emitter's field rep, the
never-folding check). The tell that it is one root is that swapping two declaration lines
fixes all four, and that the reps whose print is the DEFAULT classification are unaffected.

The `cannot assign {f: i32?} to 'w' of type {f: i32?}` message — a type reported as not
assignable to a type rendered identically — is the fifth consumer, the assignability check,
reached when the forward alias also carries `| null`. It is **158 cells**, and every one of
them is at (alias spelling, struct-field position), which is precisely the forward-declaration
axis: independent confirmation that Root C and this message are one site.

### Root D — "bare null needs a struct-typed context" is a GENERIC FALLTHROUGH and must not be used to group
192 cells carry that message across at least **three unrelated axes**: the capture storage
class (D9), the map-index-read nullable (D10), and a nullable-niche map VALUE type. They are
grouped here as three separate rows on purpose.

**BOTH DIRECTIONS OF THIS WARNING WERE RE-MEASURED WHILE CLOSING D9, AND ONE OF THE TWO
EXAMPLES ON THIS LINE WAS WRONG.**

* The one-axis-many-messages direction HOLDS and is now exact, not anecdotal: D9's single
  decision site (`emitNulIsNullTest`'s niche disjunction returning 0) reports `bare null
  needs a struct-typed context` from the `==`/`!=`/`while` callers, 96 cells, and `` `is`
  test but no union type declared`` from the `is`/`match` caller, 48 cells. One site, two
  messages, one fix, verified by an in-compiler probe at the site rather than by the text.
* **The example this paragraph used for it did NOT reproduce.** `S[] | null` at a capture
  does not report `ref valtype with no interned shape`: `exprNullableRefArray` already
  carried the capture arm, and that rep was CLEAN at the capture position before D9's fix as
  well as after. The claim was inherited, not re-run.
* The many-axes-one-message direction also holds and grew a live case: D20's `loopvar` leg
  carries D9's exact message from a DIFFERENT site (`forInElemKind`'s missing nullable arms).
  D9's fix moved 144 cells and 0 of them at `loopvar`, which is the cheapest possible proof
  that the two are not one root.

Message identity and root identity are independent in this compiler, in both directions —
and so is INHERITED evidence for either. Re-run the example before quoting it.

### Root E — the map-index read's implicit `T?` has no rep for the numeric reps
**[BOTH CLOSED — D10 by #1901/#1903/#1904, D6 on 2026-08-25.]**
**D6** (invalid wasm, numeric litunion) and **D10** (loud, `i32`/`i64`/`f64`/`f32`) are one
site with two severities. The evidence is the shared control: declaring the map's value type
as `T | null` fixes both, and `??`/`.values()` on the same map are correct in both. So the
defect is not the numeric rep and not the narrowing — it is that the type the index read
SYNTHESISES is not the type `T | null` interns to.

**THE GROUPING WAS RIGHT AND THE SAME RUNG CLOSED BOTH, one release apart, which is the
useful part of the record.** D10's fix (`emitMapGetScalarBox`) made the read's box
conditional on the probe; it then EXCLUDED the numeric litunion from its own predicate, on a
claim that a nullable numeric litunion rides the `-1` sentinel. It does not — the `-1` niche
is the STRING litunion's, whose rep is an interned atom ID with every negative spare, while a
numeric litunion reps as THE NUMBER and `1 | 2 | null` is the value-union box. Admitting the
family at the base scalar's atom is the whole of rung 1 of D6's fix. **The exclusion that
survives a fix is the part of it worth re-reading**: this one was written into three headers
and one corpus fixture, all four of which asserted the false half.

### Not shared, though it looks it
`f32[] | null` (D14) is NOT part of Root A or D despite also being a nullable niche: its
failure is in the typed-IR read path (`exprF32Array`, audit R2) and it failed at every
position including the ones where the other niches are clean. Filed separately — and
**CLOSED 2026-08-25** on its own, without touching either root, which is the separation
confirmed rather than merely asserted.

## 4. NOT A DEFECT

Everything in this section was probed on this tip and behaves correctly, is a documented
deliberate decline, or was **my own probe error**. It is here so no agent is spent on it.

### 4a. The orchestrator's stale list — every item confirmed WORKING

| shape | probe | result |
|---|---|---|
| a value-union box as a for-in LOOP VAR, narrowed by `is` | `for v in xs { if v is string … }` over `(string \| i32)[]` | `aa` / `7` — correct |
| `1 \| 2 \| null` with `if p != null` | `type N3 = 1 \| 2` ; param `N3 \| null` | `1` / `2` / `N` — correct |
| `.map`/`.filter` over `i32[] \| null`, and `boolean \| null` / `f64 \| null` reads | narrowed then `.map`, `.filter` | `2/2/true/1.25` and four `N` — correct |
| a litunion ATOM captured by a nested function, no narrowing | `type K4 = "p" \| "q"` ; capture `k` ; `print(k)` | `p` / `q` — correct |
| `let` + null initialiser + later `p = null` | `let p: string \| null = null` … `p = "aa"` … `p = null` | `true`/`aa`/`true` — correct |
| `mapkeys` over `boolean \| null` and `i32 \| null` map values | `for k in m.keys()` | `k`/`j`/`a` — correct |
| map-value reads with `is` and `!= null` | `{[string]: K \| null}` | `p`/`p` — correct **for this value rep**; see D10 for the numeric value rep, which is the live half |
| `exprIsF32` / `exprIsBool` member-union reads | `{a: f32, b: boolean}` reads | `true`/`true` — correct |

### 4b. Audit row R1 no longer reproduces
`per-rep-ladder-audit.md` R1 is filed as *"a DECLARED alias over a nullable niche … check-clean
INVALID WASM"* with this reaching program:

    type B = boolean | null
    const xs: B[] = [true, null]
    const a = xs[0]
    if a == null { print("N") } else { print(a) }

On this tip it prints `true` — **rc 0, correct, identical to the inline control**. The
alias-vs-inline axis was then measured properly (Leg E, 2,916 cells, 15 reps × 2 spellings ×
9 positions × 5 constructs × 2 inputs): the alias spelling has the **same** silent cell set
as inline (invalid wasm 4 vs 4 per numeric rep, 6 vs 6 for the numeric litunion) and **zero**
silent cells the inline spelling does not also have. What remains of R1 is LOUD: the alias
spelling loses 40–58 cells per construct to check rejects the inline spelling accepts, and
its most striking spelling is the forward-declaration case now filed as D1. **R1 as filed —
a silent alias/inline divergence — is closed; do not brief it.**

### 4c. Deliberate declines, confirmed by reading the message
* `print` of an un-narrowed nullable REF or numeric box — `print of {w: i32}? is type-valid
  but not yet supported by codegen — print the elements/fields individually`, and
  `print of a union value (i32?) … narrow it first`. Documented, helpful, and correct.
  470 cells of the sweep's loud check rejects are this.
* `print` of `string | null`, `boolean | null`, `K | null` **does** work and prints `null` —
  consistent with audit C4, and not to be confused with the above.
* `match` over a literal union — `match over a union with literal members is not supported —
  compare them with '==' in an if-chain`. 90 cells. Deliberate, names the fix.
* `?.length` / `?.size` on a nullable list/string/map — declines because `?.` reaches struct
  fields only. The message's "non-object" wording is filed under D12; the decline is not a
  defect.
* An i32-keyed Map/Set outside its supported positions — `emitProgram: an i32-keyed Map/Set
  is supported as a binding / parameter / return / '| null' / an ARRAY element`. A floor that
  names its own domain. (Its gap is the capture storage class, filed as D4.)

### 4d. MY OWN PROBE ERRORS — 136 cells of the sweep, excluded from every defect count
* **A nullable CLOSURE alias needs parentheses and my generator omitted them.**
  `type A = (i32) => i32 | null` parses as *a function returning `i32 | null`*, so 54 cells
  reported `return type mismatch: expected (i32) -> i32?, got null` and
  `cannot compare (i32) -> i32? with null`. The parenthesised form
  `type F = ((i32) => i32) | null` is **correct** (`print(src() == null)` → `true`;
  `if f != null { print(f(3)) }` → `4`). Had I filed the 54 cells I would have filed the
  parser's correct behaviour as a defect.
  **CORRECTION — the same probe error also hid 17 REAL silent cells, and they are now
  CLOSED.** The 54 cells above are the ones the unparenthesised spelling made LOUD. The
  residue — `read=call`, `con=is_t`, all seven positions, both the inline and the alias
  spelling — reached `vl check` rc 0 and a module that does not validate
  (`type mismatch: expected i32, found (ref $type)`), so it was never among the 136 and
  never in a defect count either. The mechanism is not the parse: `v is (i32) => i32` over
  a `v: (i32) => (i32 | null)` was gated on `assignable(tested, receiver)`, which accepts by
  RETURN COVARIANCE, so the THEN branch bound `v` at the unboxed-result type while the value
  repped boxed. A closure carries no runtime type tag, so the narrow could never have been
  true. `fnSlotAssignable` now enforces the rep invariance its own header already stated,
  all 17 cells grade `loud_check_reject`, and the `correct` column over the 322 closure
  cells is unchanged at 43. Pinned by
  `tests/cases/closures/error-is-functype-slot-rep-reject.vl` and — for the shape those
  cells were AIMED at, which works at every one of the seven positions —
  `tests/cases/closures/nullable-closure-is-narrow-positions.vl`.

  The lesson survives with its sign flipped: a probe-error SPELLING is not automatically a
  probe-error CELL. The 54 loud cells were the parser being right; the 17 silent ones were
  a real defect standing behind it, and excluding the family wholesale on the spelling is
  what kept them unfiled.
* **A nested `is Cat` inside `is Cat`.** My plain-leg `is_t` construct wrapped a read that
  was itself an `is` chain, making the inner else arm unreachable and correctly typed `Cat`;
  82 cells reported `no field 'd' on {c: i32}`. That is the checker being right.
* **A union rep's second value legitimately fails the `is` arm.** My first grader expected
  the read output where the else arm was correct, producing 10 false `wrong_value` cells for
  `vubox`. Fixed by recording, per rep, which value indices satisfy the `is` base; the
  count went to 0 and the four real silent columns were unaffected.
* Type declarations inside a function body are not statements
  (`emitProgram: unsupported statement in body`) — a probe error, not a defect.
* `.entries()` does not exist on a map (`unknown property 'entries'`) — a probe error.

### 4e. Cosmetic, recorded without a slice
A `T | null` map VALUE type read by index renders as `T??` in diagnostics
(`print of a union value (i32??) …`) rather than collapsing to `T?`. One `!= null` narrows it
correctly and the value is right, so this is a rendering/idempotence nit, not a behaviour
defect. 90 cells show the doubled render.

## 5. Grader discipline — what was proven, and how

### Sabotage, with the counts predicted before the run
30 cells were injected whose outcome is known by construction. The prediction was stated
before running and every leg hit exactly:

| injected | predicted | measured |
|---|---|---|
| programs printing a value the manifest does not expect | 12 `wrong_value` | **12** |
| programs whose callee runs twice, value lines still correct | 8 `wrong_evalcount` | **8** |
| programs with a list index out of bounds | 6 `trap` | **6** |
| clean controls that must not move | 4 `correct` | **4** |

So the two columns that read ZERO on the live population — `wrong_value` outside D1, and
`trap` — are zero because the population is clean there, not because the column is dead.

**Extended for the scope axis (2026-08-26).** The grader had never been shown to fire on a
program whose reading statements sit at module top level in the shape `--scopes mod` builds,
so 8 further cells make every column fire again there: 3 `wrong_value`, 2 `wrong_evalcount`,
2 `trap`, 1 `correct`. Predicted before the run and measured exactly — **15 / 10 / 8 / 5**
over 38 cells. `sabotage.py --legacy` still emits only the original 30 and still reports
**12 / 8 / 6 / 4**, so the published counts remain directly checkable. The module-scope
`correct` control and one of its `wrong_value` cells are the SAME PROGRAM under different
manifests, which is what proves the grader reads the expectation rather than the output.

### The fourth silent column was proven against an independent validator
`invalid_wasm` fires 97 times on the live population, and one instance was checked outside
the harness:

    vl build … -o c00254.wasm
      -> "not a valid WebAssembly module — it was written, but it cannot instantiate
          (this is a compiler emit bug)"
    wasm-tools validate --features all c00254.wasm
      -> "error: func 6 failed to validate … type mismatch: expected i32, found (ref $type)"

`compiler_trap` fires 4 times and was separated from `trap` by a measurement, not a guess:
the third `vl build` stage records whether a module was written (0 bytes → the compiler
trapped; >0 bytes → the program trapped).

That separation is the only reason D4 exists as an entry, and it was later re-proved LIVE
rather than merely reachable: on a 608-cell grid built for the class, a deliberate
out-of-bounds arena read injected into `checkFuncDeclNode` and gated on a function NAME
appearing in exactly 44 of those cells moved **44 cells** into `compiler_trap` and **0** into
`program_trap` or `invalid_wasm` (predicted 44 before the run), and the grid returned to its
pre-sabotage classification on all 608 cells after restoring the compiler from a saved,
`md5sum -c`-verified artefact.

### The WITNESS CHECKER's vocabulary was proven the same way (2026-08-26)
`check-filed-witnesses.py` grades this document's own rows, and it had one column doing two
jobs: a module the engine REFUSES and a module the engine LOADS whose PROGRAM then traps both
graded `silent_invalid_wasm`. That is not a naming nit — it sends the reader to the emitter
when the miscompile is in what the emitted code DOES, and D19 sat behind it for a day with a
status line worded to grade as filed while its prose said the truth.

The split now uses the same marker vocabulary `grade.py` separates its `invalid_wasm` and
`trap` columns with, and `--self-test` makes it fire on demand — three specimens whose outcome
is known by construction, predicted in source ahead of the run:

    python3 scripts/check-filed-witnesses.py --self-test
      want runs        got runs        ok
      want check_reject got check_reject ok
      want trap_loads  got trap_loads  ok

The third specimen (`print(xs.length)` then `print(xs[9])`) is the proof the state is a real
distinction rather than a rename: it emits a VALID module that prints `2` and then traps, and
the pre-change classifier routed it `silent_invalid_wasm`. **Re-grading all 24 rows under the
sharper classifier found no other row hiding behind the conflation** — D22, D23 and D24 stay
`silent_invalid_wasm`, which is now measured rather than assumed.

### Structural guarantees
* **One result file per cell.** `runcell.sh` writes `<cell>.res` and never appends to a
  shared file, so nothing can tear under `-P4`.
* **`records == cells` asserted on every run** — printed by `grade.py` as
  `cells=9126 result_files=9126 MATCH=OK` and `cells=219 result_files=219 MATCH=OK`.
* **Graded on the run value, never the build verdict.** D1's boolean cell is check-clean,
  run-clean, rc 0 — a build-verdict grader scores it a pass. It is the top row here.
* **Not a dead grader.** The 9,345 cells spread over 6 outcome columns with 21 distinct
  representations contributing and 17 positions contributing; the largest single column is
  69.5%, not 100%.
* **Harness-suspicion rule.** Any (position, construct) pair failing identically across ALL
  reps and both inputs was read by hand before being filed. That rule is what caught all
  five items in §4d — the `optchain` construct's 0-of-132 and the closure-alias 54 both
  tripped it.

### D131 — [CLOSED 2026-08-27] a nested-struct FIELD read RETURNED from an UN-ANNOTATED function
**CLOSED 2026-08-27 — the repro now RUNS (prints `7`). Was: check-clean invalid wasm · found 2026-08-27 as the ENTIRE `invalid_wasm` residue of the D111/D117 grid — 24 of 1,710 cells, unmoved by every one of that change's five ablation compilers · pre-existing and byte-identical on master `7b600b57`, on master `e67347aa` after #1960, and on the D111/D117 branch before and after that merge — the SAME 24 cells by name and the same sentence at each · CLOSED by TWO edits whose moved sets are DISJOINT, and neither is a variation of the other**

Repro:

    type Holder = { h: { r: i32 } }

    function mk(n: i32) {
      const o: Holder = { h: { r: n } }
      return o.h
    }

    print(mk(7).r)
    // vl check rc 0 with NO diagnostics at all; vl run:
    //   Invalid input WebAssembly code at offset 176: type mismatch: expected i32,
    //   found (ref null $type)
    // (The offset moves with the seed — 176 for this spelling on `7b600b57`, 183 with the
    //  local hop below. The sentence is the identifier.)

* **IT IS NOT THE INLINE SHAPE, WHICH IS THE CONTROL WORTH RECORDING BECAUSE THE GRID FOUND
  IT NEXT TO D111.** Spelling the field NOMINALLY reproduces it exactly:
  `type Circle = { r: i32 }` + `type Holder = { h: Circle }` + the same body is the same
  sentence at the same offset. It is not the twin axis either — it fires at `decl=nodecl`,
  with no second claimant for the layout anywhere in the program.
* **THE AXIS IS THE RETURN, AND THREE ONE-LINE CONTROLS SAY SO.** `return o.h.r` (read the
  scalar out first) RUNS. The identical read at MODULE scope (`const c = o.h; print(c.r)`)
  RUNS. Binding through a local first (`const c = o.h; return c`) is the SAME reject, so the
  local hop is not the axis — the un-annotated function's RESULT type is. The callee's
  functype says `i32` and the body pushes the field's `(ref null $S)`.
* **AN EXPLICIT RETURN ANNOTATION DOES NOT FIX IT, IT MOVES THE SENTENCE** —
  `function mk(n: i32): { r: i32 }` gives `expected (ref $type), found (ref null $type)`, the
  NULLABILITY rather than the kind. So there are plausibly two rungs here: the inferred
  result KIND (which reads i32) and the nested-struct field's `(ref null)` nullability at a
  non-null result. Both are `vl check` rc 0.
* **WHAT ELSE IS IN THAT RESIDUE, AND WHICH KIND OF THING IT IS** — recorded because a
  documented DECLINE and an unfiled DEFECT read identically in a residue paragraph, and
  one of them is a row somebody owes. Besides these 24, the grid's final tree holds 16
  `loud emit reject` cells (`ann2` x `std`) and 513 `loud check reject` cells, and
  **every one of the 529 is a DELIBERATE REFUSAL, not a row**:
  - the 16 are `emitProgram: a nullable-{r:i32} list element has no rep; use a non-null
    element type`, reached by the grid's own `std` harness line
    (`const xs: ({r:i32} | null)[]`). `collectA`'s kind-2 arm rejects it on purpose —
    its header says why in full (*"has no list rep: the box lowering would emit the
    element's raw value (invalid wasm). Reject cleanly"*) and the message carries the
    remedy. A DOCUMENTED DECLINE.
  - 189 of the check rejects are `cannot compare X with null` on the grid's `bare`
    (non-nullable) control rows — the checker correctly refusing a `null` in a
    non-nullable list, i.e. the grid's own assertion that it still does.
  - 108 are `'mk' infers the nullable return type {r: i32} | null`, the checker's own
    documented decline for an inferred nullable inline-shape return, and the reason
    `ann2` x `ret` never reaches the emitter at all.
  - The `loud check reject` set is **513 on all six ablation compilers, cell for cell**,
    so none of it moved either.
* Reachable neighbourhood: this is D51/D52's family read at a FIELD source — `fRetKind`'s
  inferred tier and `emitOneFuncType`'s `infSlot` ladder are where those two rows added a
  `variant` arm, and a code-15 nested-struct field read is the shape neither added. The field
  row already resolves (`sFieldTgtStructIdx` is the chokepoint and it answers), so this is a
  ROUTE question rather than a resolution one, exactly as D52's was.

**CLOSED 2026-08-27 — TWO ROOTS, AND THE AXIS THE FOUR CONTROLS DID NOT SEPARATE IS THE
RECEIVER'S STORAGE CLASS.** The row's neighbourhood note above was right that this is D51/D52's
family at a FIELD source and right that it is a ROUTE question, and it named the wrong route:
`fRetKind` needed no new tier and `infSlot` no new arm — `"nulstruct"` and its slot were both
already there. What was missing is that nothing could RESOLVE the read.

* **ROOT ONE — the inferred result KIND, and the receiver is the axis.** `exprNullableStruct`'s
  Member arm already classifies a code-15 field read as the `(ref null $S)` it physically is,
  and it ANSWERS for every other receiver storage class: `function mk(o: Holder) { return o.h }`
  (a PARAM), the same read off a module GLOBAL, and the same read off a CALL result all RUN on
  master. It cannot answer for a LOCAL receiver, because it resolves that receiver through
  `structIndexOfExpr`, whose Ident arm reads `declaredStructIndex` — the per-function table
  `buildLocals` fills long AFTER the GLOBAL return pass this classification runs in. That is the
  same blindness `criRetLocalLet` and `retIsMapLocal` were written for, at the one expression
  shape neither covers. The new rung resolves the chain with the receiver's own `let`
  declaration (`retLocalLetOfBlock` + `structIndexOfLet`) and descends by `structIndexOfExpr`'s
  OWN Member rule, so `o.h.g` resolves by the rule `o.h` does.
* **`"nulstruct"` AND NOT `"struct"`, and the local hop is why the ORDER matters.** The lowering
  codes fold `inner: S` and `inner: S | null` onto ONE code-15 hop, so the slot is
  `(ref null $S)` either way and the three receiver shapes that already worked all classify
  `nulstruct`. The rung also has to run AHEAD of the returned-local block: for
  `const c = o.h  return c` that block asks `letIsStruct`, which answers TRUE through
  `exprStruct`'s fall-through to `exprNullableStruct`, so the RESULT was minted `(ref $S)` while
  `collectLocals` — asking the SAME predicate of the same initializer — built the cell
  `(ref null $S)`. Two classifiers, one binding, opposite nullability.
* **ROOT TWO — the RETURN BOUNDARY's missing recover, and it is RECEIVER-BLIND.** This is the
  row's own second sentence, and measuring it refuted the reading that it is the same defect
  under an annotation. A kind-9 read deliberately stays the raw `(ref null $S)` and the USE site
  recovers — `emitCapturedReadRecover`'s header states the rule in as many words — and a field
  access, a call ARGUMENT, an annotated `let` initializer and a nested-struct field STORE all do
  and all run on master. The RETURN into a non-null struct result never grew it. Its own control
  contains **no field read at all**: `function pick(p: Circle | null, d: Circle): Circle
  { if p != null { return p } return d }` is `vl check` rc 0 and `expected (ref $type), found
  (ref null $type)` on master, and it fires at a PARAM receiver where root one never does.
* **DISASSEMBLED RATHER THAN INFERRED, both of them.** Root one: on master `mk` is
  `(func (param i32) (result i32))` over a body ending `struct.get 1 0` / `return`, with
  `Holder` = `(struct (field (mut (ref null 0))))`; on the branch the functype is
  `(result (ref null 0))`, the BODY is byte-identical, and the CALLER grew the
  `ref.as_non_null` its field read already knew how to emit. Root two: the functype
  `(param (ref 1)) (result (ref 0))` is unchanged, the caller is byte-identical, and the delta
  is one instruction inside the callee — `struct.get 1 0` / `ref.as_non_null` / `return`.
* **THE GRID (`scripts/silent-sweep/d131/`), 1,732 cells**, axes read depth x executing body x
  return annotation x field type x RECEIVER STORAGE CLASS x claimant count x declaration order.
  Base is master `89f88840` and **stripping both patches out of the branch reproduces its
  1451224-byte fixpoint BYTE-FOR-BYTE**, which is what makes the base column provable.

  | compiler | bytes | runs | loud emit | loud check | invalid wasm | moved | to `runs` | to SILENT |
  |---|---|---|---|---|---|---|---|---|
  | `base` master `89f88840` | 1451224 | 692 | 376 | 304 | 360 | — | — | — |
  | `A` the classifier rung  | 1452172 | 812 | 376 | 304 | 240 | 120 | 120 | 0 |
  | `B` the return recover   | 1451493 | 932 | 376 | 304 | 120 | 240 | 240 | 0 |
  | `FULL` both              | 1452441 | 1052 | 376 | 304 | **0** | 360 | 360 | 0 |

  Pairwise intersection **EMPTY**; 120 + 240 = 360 = |FULL moved|, set-identical; FULL disagrees
  with neither single on a cell that single moves. **The axis split IS the mechanism**: A's 120
  are `ann=none` x `recv in {local, hop}` and nothing else — `param` and `global` are ABSENT
  because they already ran — while B's 240 are `ann=nonnul` spread EVENLY over all four receiver
  storage classes (60 each). The `leaf` (`o.h.r`) and `mod` (module-scope) rows move **zero** on
  every compiler, which is two of the row's own controls still holding, and `claim=c0` moves 24
  under A, which is the third.
* **THE 24-CELL D111/D117 RESIDUE THIS ROW WAS FILED OUT OF GOES TO ZERO, UNDER ROOT ONE ALONE.**
  Re-run on the same four compilers: base 1157 runs / 24 invalid wasm, A and FULL 1181 / **0**,
  and **B moves 0 cells on that grid** — each patch is inert where it is not the answer.
* **RE-GRADED POPULATIONS, both inert.** D52's 9,450 cells: 7620 runs / 1830 loud emit / **0
  silent** on base AND branch, **0 moved**. D87's 3,144 cells: 3126 / 18 / **0 silent** on both,
  **0 moved**. **Corpus: 2,312 files, 2 differ in emitted-module sha256 and both are the
  fixtures this change adds; 0 differ in `vl check` diagnostics.** Every loud bucket on both
  grids is set-identical AND message-identical across all four compilers, so there are no
  same-class message moves hiding behind the outcome counts.
* **RESIDUE, filed rather than left.** The grid's 376 `loud_emit_reject` are every `field=arm`
  cell: `emitProgram: only i32 / boolean / string / array struct fields are supported` — a
  struct field whose type is a union ARM has no supported lowering and the message says so, a
  DOCUMENTED DECLINE. Of the 304 `loud_check_reject`, 208 are `'mk' infers the nullable return
  type … — not yet supported by codegen; annotate the return type` (the checker's own documented
  decline, the same one D111's residue lists) and 96 are `return type mismatch: expected Circle,
  got Circle | null` — the checker correctly refusing a nullable field read into a non-null
  annotated result, i.e. the grid's own assertion that it still does.
* Pins: `tests/cases/structs/nested-field-read-returned-from-unannotated-fn.vl` (root one, with
  the two running controls and both already-working receiver shapes beside it) and
  `tests/cases/structs/nullable-slot-value-returned-into-nonnull-result.vl` (root two, with the
  no-field-read narrowed control). Grid + ablation reader kept at `scripts/silent-sweep/d131/`.

---

### D93 — [CLOSED 2026-08-27] a NESTED arm-valued map beside its layout twin collapses onto one mv slot
**CLOSED 2026-08-27 — the repro now RUNS (prints `7` / `9`). Was: check-clean invalid wasm · found 2026-08-26 by the D47/D50 grid (12 of its 1,024 cells: `nestedmap` x `arm_twin` x pairing=1, across all four spellings) · PRE-EXISTING on `8bf0f20f` at the ALIAS spelling (4 of the 12, byte-identical message and offset) · D47's convergence brings the other 8 to the alias's verdict — D49's accounting, and the two rows it produced that way were D63 and D64 · NO generic, NO import · D48's shape ONE CONTAINER OUT · CLOSED by #1959 — the mv key goes NOMINAL at every depth and the sixth typed find takes D48's hint, and neither half is the answer alone**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    type IMA = {[string]: Circle}
    type NMA = {[string]: IMA}
    type IMB = {[string]: Dot}
    type NMB = {[string]: IMB}

    function reader() {
      const imA: IMA = Map()
      const cA: Circle = { r: 7 }
      imA["k"] = cA
      const nmA: NMA = Map()
      nmA["a"] = imA
      const qA = nmA["a"]
      if qA != null {
        const gA = qA["k"]
        if gA != null { print(gA.r) } else { print(-1) }
      } else { print(-1) }
      const imB: IMB = Map()
      const cB: Dot = { r: 9 }
      imB["k"] = cB
      const nmB: NMB = Map()
      nmB["a"] = imB
      const qB = nmB["a"]
      if qB != null {
        const gB = qB["k"]
        if gB != null { print(gB.r) } else { print(-1) }
      } else { print(-1) }
    }

    reader()
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 2870:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE PAIRING IS THE TRIGGER AND ONE UNIT ALONE RUNS** — pairing=0 and pairing=2 are
  `correct` at all four spellings, on master and on the D47/D50 branch alike. So is
  `arm_namediff` (`type Dot = { q: i32 }`), and so is deleting `Sq`/`Shape`. Only the EXACT
  layout twin collapses, which is D48's condition at the nested-map value row.
* **IT IS THE *OUTER* SLOT THAT COLLAPSES, NOT THE INNER ONE, and that is what makes it a
  different root from D47.** With D47's arm key in place the two INNER maps key `Circle` and
  `Dot` and are correctly two slots. The two OUTER maps both render their value as
  `{[string]:{r:i32}}` — `tyToEmitName` drops the arm at EVERY depth, not just the top —
  and D48's tri-state arm hint reads `variantRowOfTy` of the outer VALUE, which is a
  `TyMap` and so answers -1 for both. One outer slot, one vals element heap, and whichever
  inner map struct loses gets stored into a field typed for the other.
* **A CANDIDATE FIX WAS BUILT AND REFUTED BY MEASUREMENT.** Recursing `mvArmHintOfTy`
  through a `TyMap` value — so the outer hint carries the inner arm — separates these 8 and
  costs far more elsewhere: the same 1,024-cell grid goes 701 → 609 `correct` and 17 → 57
  `invalid_wasm`. Reverted unmeasured-widening-first, and recorded here so the next attempt
  does not re-derive it.
* **A SECOND CANDIDATE WAS BUILT AND REFUTED, and it is the one worth recording, because it
  is the obvious one: hold the LOUD floor instead of fixing the collapse.** Guard at the mv
  mint — refuse (`-3`) a kind-6 value whose transitive value is a declared arm with an
  exact-layout DECLARED twin (`mvDeepArmOfTy` + a `structIndexOfTypeName` twin test gated on
  `nameIsStructDecl`, so an inline-shape row minted from the arm's own render cannot answer).
  Measured over the same 1,024 cells: **866 `correct` / 148 loud / 10 silent**, against the
  branch's 894 / 112 / 18 and master's 529 / 486 / 9. It buys 8 fewer silent cells for **28
  fewer working programs**, and **6 of those 28 are `correct` on MASTER** —
  `arm_twin` x `nestedmap` x `alias` at pairing 0 and 2, which are SINGLE-unit programs where
  no collapse is possible at all. It also LEAKS: 4 of the 8 cells it exists to hold
  (`inferred` index/values at pairing 1) still go silent.
* **AND THAT REFUTATION GENERALISES, WHICH IS THE REASON THIS ROW IS NOT CLOSED BY A FLOOR.**
  The condition that would be correct is *"two distinct inner map value types would collapse
  onto one mv slot"*, and that is a property of the PAIR, not of any one map's shape. Every
  shape-level approximation available at the mint fires on single-unit programs, because
  `mvShapeOfValNameArmTy` mints ONE slot at a time and cannot see whether a second,
  differently-armed value will later claim it. The place both claimants exist is the FIND
  rung — and making the find rung discriminate is the first refuted candidate above (57
  silent). A floor here is a NEW DIALECT (`type Dot = {r:i32}`, declared and never mentioned,
  would decide whether a nested arm-valued map compiles) traded for a smaller one.
* **THE GENERAL STATEMENT IS A RENDERER, NOT A HINT.** "The nominal identity the render
  dropped" is exactly what `tyToNominalName` computes — D49's note calls it "already
  written, already documented correct, with no consumer in emitted output at all" — but
  swapping the mv layer's value renderer is the change D-MAPNODETY refused with 128 measured
  slot moves. That is the shape of the fix and the reason it is its own row.

**WHAT CLOSED IT, AND THE BULLET ABOVE IS RIGHT ABOUT THE RENDERER AND WRONG ABOUT THE
SCOPE.** The fix IS `tyToNominalName`, and it is not a renderer SWAP: it is the mv table's
KEY, rewritten only where the render drops a DECLARATION. `mvArmKeyName` — D47's rewrite,
which answered only for a value that IS an arm — grows two rungs, both gated on the map's
TRANSITIVE value being declared (`mvDeepArmOfTy` for an arm, `mvDeepDeclOfTy` for a struct
row). A genuinely anonymous `{[string]: {r:i32}}` reaches neither and keeps the render it
has always keyed, so the 128 slot moves the wholesale swap measured do not happen.

**AND A KEY IS WHY THE PAIR NEVER HAD TO BE OBSERVED.** Both refuted candidates above had
to answer "will a second, differently-armed value later claim this slot?" — a property of
the PAIR that a mint minting one slot at a time cannot see, which is why every shape-level
approximation of it fired on SINGLE-UNIT programs. A key is computed per claimant from what
already distinguishes them; mint and find compute it the same way; a single-unit program
merely gets its slot under a different name. No refusal, no floor, no new dialect.

**THREE MORE THINGS WERE NEEDED AND EACH ONE IS THE SAME SENTENCE ONE RUNG DOWN.**

* **The typed FINDS must key what the mint keyed.** `mapAnnShape` (every function
  boundary) and `mvSlotOfMapValNameOrMonoKTy` (the routed op find) both hold the rendered
  name AND the recorded type, so both now call `mvArmKeyName` themselves. A find that keys
  a different name from the mint's is a miss, and a miss lands on whichever twin-valued map
  DID key the render.
* **The slot's ARM component had to widen to an ARM SIGNATURE.** D48 made "is this value a
  declared arm" the third component of a slot's identity; for a nested map the value is a
  `TyMap` and `variantRowOfTy` answers -1 on both sides. `mvValArmSig` is a SECOND column
  beside `mvValVariantIdx`, not a widening of it — that one's readers are the map-store
  seed, the `??` default seed, the optional-chain field resolver, the kind-1 dedup guard
  and six classifiers, and every one reads `>= 0` as "the VALUE is an arm".
* **The SIXTH typed find was un-hinted, and it is what made the row DECLARATION-ORDER
  dependent.** `mvSlotOfTyK` took the map value's arena type and passed `MV_ARM_NOHINT`, so
  it matched a slot of any arm parity. With the slots correctly separated,
  `rlElemMapValMvSlot` still asked it for the map ELEMENT of a nested map's vals list and
  got whichever same-canon inner slot was minted FIRST: the arm-valued nested map worked
  when the arm was declared first and emitted the twin's map struct when the twin was.
  Measured, the residue was exactly the 12 `order=b` cells of the grid below. The
  un-hinted two-argument form is DELETED rather than deprecated — every one of its six
  callers held the type, so the hint is a pure function of an argument they already had.

**THE ABLATION, and it is a COMPOSITION rather than three roots.** One compiler per
candidate, all swept against one 300-cell grid, master `8d1670aa`:

| compiler | what it adds | runs | loud emit | invalid wasm | moved |
|---|---|---|---|---|---|
| master | `8d1670aa`                                  | 252 | 15 | 33 | — |
| `LA` | D94's element-declaration preference          | 258 | 15 | 27 |  6 |
| `LB` | the nominal mv KEY + the slot's ARM SIGNATURE  | 267 | 15 | 18 | 15 |
| `LD` | the sixth typed find's hint                    | 252 | 15 | 33 | **0** |
| `LBD` | `LB` + `LD`                                   | 279 | 15 |  6 | 27 |
| `LB'` | `LBD` MINUS the declared-STRUCT half of the key | 261 | 15 | 24 |  9 |
| full | all three                                      | **285** | 15 | **0** | 33 |

Every pairwise intersection is EMPTY, the union of `LA` and `LBD` is set-identical to the
full branch's 33 and the full branch agrees with each on every cell it moves. **`LD` moves
ZERO cells alone and is not redundant**: `LBD` − `LB` is 12 cells that need BOTH, so this is
the D39/D40/D41 shape (a composition) and not D48/D63/D64's (three disjoint roots). 33
cells moved, every one to `runs`, **0 backward and 0 message-only**.

**BOTH SIDES OF THE KEY ARE LOAD-BEARING, and `LB'` is the row that says so.** Rewriting
only the ARM side separates the two outer mv slots and then the last mile fails: the twin's
key stays the RENDER, that render re-resolves through `resolveAnnot`, and the arena — which
dedups a `TyObj` structurally — hands back the very index the ARM's declaration owns. The
render does not merely fail to name `Dot`; it RESOLVES to `Circle`, so no filter downstream
can undo it. **18 cells**, which is the difference between `LB'` and `LBD`.

**THE CLAIMANTS ARE TWO HEAP TYPES, NOT ONE — D100's discriminator, taken on master
`8d1670aa` before anything was built.** D100 was filed as a channel case and refuted by
exactly this measurement, so it was run here first:

    HEAP mv slots Circle(0,k1,ty17) {[string]:{r:i32}}(1,k6,ty18) {r:i32}(2,k1,ty19)
    HEAP rl slot 0 Circle heap=1   ·   HEAP rl slot 2 Dot heap=0

Three mv slots for FOUR maps — the twin's outer map has no slot of its own — and the two
inner values sit in two different element heaps. So there was a pair to observe, D100's
"one heap type, therefore ask for heap uniqueness" shortcut does not apply here, and the
answer had to make the two claimants key differently rather than make a predicate smarter.

**TWO FURTHER CANDIDATES WERE BUILT AND ARE RECORDED BECAUSE THEY ARE THE OBVIOUS ONES.**

* **The rep-key VARIANT rung at the map-value position** — `repElemKey` / `repMvValKey` /
  the shared hash-cons walk keying a declared ARM `V<n>` where they key a declared struct
  `S<n>`. It is a real asymmetry (an arm has no `sNames` row, so it fell into the structural
  expansion and is character-for-character an anonymous `{r:i32}`), and it moves **0 cells
  alone and 0 in composition** with everything above. Dropped as speculative.
* **The same rung in the `TyObj` arm itself**, where the heap argument applies just as
  well. That version DOES close the 12 order-b cells on its own — and it REDDENS a working
  corpus program: `generics/mono-callback-bound-arm-beside-layout-twin.vl` becomes
  `emitProgram: function-value call arity has no interned signature`. **Filed as D105 with
  its own witness, and the first diagnosis of it was WRONG** — see that row. It is not a
  twin-canonicalisation gap in `repSigSlotTokOfKind`; it is this same family's disease at
  the `$fnsig` layer, and the arm's ref-list slot is found today only because its rep key
  happens to BE the render. A widening that must be swept on its own before it rides along.

Regression fixture: `tests/cases/maps/nested-arm-valued-map-beside-layout-twin.vl` (both
declaration orders plus the single-unit function-boundary control the refuted floors
reddened).

---

### D94 — [CLOSED 2026-08-27] an UN-ANNOTATED struct literal beside two layout-twin declared rows whose field elements differ in arm-ness
**CLOSED 2026-08-27 — the repro now RUNS (prints `7` / `9`). Was: check-clean invalid wasm · found 2026-08-26 by the D47/D50 grid (6 of its 1,024 cells: `structfield` x `inferred` x `arm_twin` x pairing=1) · PRE-EXISTING on `8bf0f20f` at **5 of the 6** — every construct and both declaration orders except `forin`/order-a, where D50's floor fired first and hid it · NO generic, NO import · D64's shape at the LITERAL'S ROW PICK rather than at the field-code dedup · CLOSED by #1959 — the field ELEMENT's declaration identity, PREFERRED rather than refuted, at the rung the ambiguity arm already falls to**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    type BoxA = { xs: Circle[] }
    type BoxB = { xs: Dot[] }

    function reader() {
      const cA: Circle = { r: 7 }
      const xsA: Circle[] = [cA]
      const bA = { xs: xsA }
      print(bA.xs[0].r)
      const cB: Dot = { r: 9 }
      const xsB: Dot[] = [cB]
      const bB = { xs: xsB }
      print(bB.xs[0].r)
    }

    reader()
    // vl check rc 0; vl run:
    //   Invalid input WebAssembly code at offset 320:
    //   type mismatch: expected (ref $type), found (ref $type)

* **ANNOTATE EITHER BINDING AND IT RUNS.** `const bA: BoxA = { xs: xsA }` /
  `const bB: BoxB = { xs: xsB }` — the `inline`, `alias` and `direct` spellings of this
  exact coordinate are all `correct` on master. Only the un-annotated literal fails, which
  is what says the layer is the literal's ROW PICK and not the struct-row dedup D64 fixed.
* **IT IS NOT D64.** `structFieldCodesEq`'s referenced-layer guard (#1952) declines to merge
  `BoxA` and `BoxB`: their code-5 field elements are `Circle` and `Dot`, `Circle` has no
  struct row at all (`collectS` skips a union member), and the `ra < 0 || rb < 0` leg
  refuses. The two rows stay apart. What collapses is one rung earlier —
  `structIndexOfObj`/`structIndexOfObjCtx` matches the literal's field-NAME set `{xs}`
  against the table and both declared rows answer, so both literals bind the same row.
* **THE CHANNEL EXISTS AND IS UNASKED, which is this family's usual shape**: the literal's
  own element binding is annotated (`xsA: Circle[]`), so the field's element type is on the
  arena at the node the row pick holds. `shapeFieldTypeCompat` is the tightening rung and it
  compares field TYPE TEXT, where `Circle[]` and `Dot[]` differ — so the candidate fix is a
  rung, not a channel. Not attempted here: it is a different resolver from either D47's or
  D50's and no ablation has been run on it.
* **THE ONE CELL THIS CHANGE MOVES ONTO IT** is `forin`/order-a, whose order-b twin and whose
  `index` and `passon` siblings are all already silent on master at the same offset and
  message. Inherited, not created.
* **AND ITS FLOOR IS NOT SEPARABLE FROM D50'S FIX, because the same rung does not decide
  both — D50's rung is not involved at all.** The `index` sibling reaches this defect on
  master with NO `for` in the program, which is the proof: the wrong row is picked when the
  literal is bound, before any loop exists. Holding the one cell loud would mean refusing a
  variant loop var when the receiver is a struct field of an un-annotated literal — a
  condition on the failing CELL, not on the loop. D50's floor was masking this, not guarding
  it.

**WHAT CLOSED IT, AND THE ROW'S OWN "the candidate fix is a rung, not a channel" IS
CORRECT — the rung is one further down than the row names.** `shapeFieldTypeCompat` is
never reached: `fieldCodeForMatch({xs: Circle[]}'s field)` answers **5**, so the scan takes
its `want >= 0` leg, the row's code is 5 too, and the code-15 canon tightening that lives
in the `else` leg cannot fire. Probed at the site on master, both literals:

    PROBE sioc obj=27 matches=2 first=1 strictC=2 nodeTyIsObj=T repRow=-1 fieldSet=1
    PROBE sioc obj=47 matches=2 first=1 strictC=2 nodeTyIsObj=T repRow=-1 fieldSet=1

`repRow=-1` is **D64's guard doing its job** — `repRowOfTyStruct` declines because the two
canon-key twins have divergent emitted layouts — and `fieldSet=1` is the first-match GUESS
that follows it, handed to BOTH literals. So the layer is `structRowOfObjFieldSet`, whose
per-field tightening had a rung for code 15 and none for the named-heap codes beside it.

**THE CHANNEL IS ON THE ARENA AT THE NODE THAT RUNG ALREADY HOLDS**, and it is NOMINAL, not
canonical. The query field's element type resolves to a DECLARATION — `structIndexOfTy` for
a struct, `variantRowOfTy` for an arm, the two rungs `shapeNominalOfTy` pairs and D33 is the
row for pairing them — and the row side has the same fact in `sFieldElemTyIx` /
`sFieldElemName`. Canon would answer the wrong question: `Circle` and `Dot` are ONE canon
key and TWO declarations. `declNominalOfTy` is those two arena rungs lifted out of
`shapeNominalOfTy` WITHOUT its two field-set scans, which would re-enter this resolver.

**A PREFERENCE, NOT A REFUTATION, and that is the whole safety argument.** A conflicting row
stays a match and is merely outranked, so the scan can never return -1 where it returned a
row — and a -1 here sends the caller on to `firstSi`, a strictly worse guess than the
conflicting row it just declined. With no conflict anywhere `first` IS `firstExact` and the
answer is byte-identical.

**THE CLAIMANTS ARE TWO HEAP TYPES, NOT ONE** (D100's discriminator, master `8d1670aa`):

    HEAP struct rows BoxA(1) BoxB(2) canonEq=1 codesEq=0 twin=0 sTwin=1/2

`repStructSlotsTwin` already answers **0** and is already CALLED — through
`repRowOfTyStruct`'s decline. Unlike D100 the pairwise predicate was not the missing piece;
the missing piece is that the rung the decline falls through to had no element test at all.

**GRID: 6 cells, every one `check-clean invalid wasm` → `runs`, 0 in any other direction**,
disjoint from D93's 27 (see D93's ablation table). All 6 are `structfield` x `inferred`,
which is the coordinate the row names, at both declaration orders.

Regression fixture: `tests/cases/structs/unannotated-literal-beside-arm-elem-field-twins.vl`
(both declaration orders plus the two-arms-of-two-unions control a future tightening of this
rung into a refutation would move).

### D105 — a union ARM's ref-list `$fnsig` digit is found only because its rep key IS the render
**runs today and must keep running · found 2026-08-27 while closing D93, as the measured cost of a WIDER candidate · NOT a defect on master — the witness below prints `1` on `8d1670aa` and on the D93/D94 branch alike · filed as the REFUTATION PIN for the rung D93's close deliberately did not take, and because the first diagnosis of it was wrong**

Repro:

    import { sorted } from "std:array"

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }

    function byR(a: Circle[], b: Circle[]) { return a[0].r < b[0].r }

    function cell() {
      const p: Circle[] = [{ r: 2 }]
      const q: Circle[] = [{ r: 1 }]
      const xss: Circle[][] = [p, q]
      const out = xss.sorted(byR)
      return out[0][0].r
    }

    print(cell())
    // vl run: 1   — on master and on the branch
    // under the WIDER rep-key rung (see below):
    //   emitProgram: function-value call arity has no interned signature

* **THE CANDIDATE THIS PINS.** `repElemKey` / `repMvValKey` key a declared STRUCT nominally
  (`repSlotOfTyDecl` → `S<n>`) and have no VARIANT rung, so a union ARM — which has no
  `sNames` row at all, `collectS` skipping a union member — falls into the structural field
  expansion and is character-for-character an anonymous `{r:i32}`. Giving that arm `V<n>` is
  the obvious complement, the heap argument is sound (an arm's elements live in
  `uVarHeap[vi]`), and it closes the 12 `order=b` cells D93 needed a second rung for. It
  also turns this program into a loud emit reject, so it was DROPPED.
* **THE FIRST DIAGNOSIS WAS WRONG AND A PROBE IS WHAT SAID SO.** It read: two ref-list slots
  that are LAYOUT TWINS get two different `$fnsig` digits, because `repSigSlotTokOfKind`
  canonicalises a struct slot digit through `repStructSlotRep` while "other slot kinds
  (reflist / variant / map) index their OWN tables and pass through unchanged". Plausible,
  and it names a real asymmetry — but it is not this. Dumping the ref-list table on BOTH
  compilers for this program says so directly:

      master 8d1670aa:  RL0 Circle key=1 wrap=9 heap=1 · RL1 Dot key=2 wrap=11 heap=0
      wider rung:       RL0 Circle key=2 wrap=9 heap=1 · RL1 Dot key=3 wrap=11 heap=0
      call site keys [r1;r1;>i] · interned [r0;r0;>i]

  `Circle` and `Dot` are **already two slots on master**, with different wrappers and
  different heaps — they are NOT layout twins and the wider rung does not split them. All it
  changes is `Circle`'s rep KEY, from the structural `{r:i32,}` to `V0`.
* **WHAT ACTUALLY HAPPENS IS THIS FAMILY'S DISEASE AT THE `$fnsig` LAYER.** The comparator
  `byR(a: Circle[], b: Circle[])` interns its signature with `r0;`, the arm's own slot. The
  CALL SITE resolves its element through a rung holding a RENDER, and the render of a union
  arm is `{r:i32}` — its layout twin's spelling. On master that render IS slot 0's rep key,
  so the lookup lands on the arm's slot **by accident**; make the arm's key nominal and the
  render no longer matches it, the rung falls through, and the render resolves to `Dot`'s
  row: `r1;`, a signature nothing interned. So the program is correct today for the same
  reason D47's alias spelling worked before it was fixed — an incidental key collision.
* **WHICH IS WHY IT IS A PIN AND NOT A "TODO".** The fix is not a canonicalisation of the
  reflist digit; it is finding the call-site rung that holds a render for a `$fnsig`
  reflist element and giving it the nominal channel, exactly as D47 did for the mv key and
  D94 for the field element. Until that rung is found and measured, the wider rep-key rung
  cannot land — and this row is the thing that will say so loudly rather than in review.
* Pinned in the corpus by `tests/cases/generics/mono-callback-bound-arm-beside-layout-twin.vl`
  (its `receiverSorted` leg), which is the program this repro minimises; no new fixture,
  because the guard already exists and already fires.

---

### D243 — [CLOSED 2026-08-27] the ELEMENT scan of `dstPinPushAnn` is ONE list level deep, so a `Circle[][][]` destination pins nothing
**closed · the filed repro RUNS and prints `7` · was `check-clean invalid wasm` on `322c07f2` · found 2026-08-27 while closing D184, by asking the SAME question one container further out · the rung D184 added answers for this spelling and never sees it, so this is the SCAN's depth and not the predicate's**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    const lv1 = [{ r: 7 }]
    const c: Circle[][][] = [[lv1]]
    if ((c[0])[0])[0].r == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **IT IS D184 WITH ONE MORE `[]`, AND D184's FIX DOES NOT REACH IT.** `dstPinPushAnn`'s
  element arm iterates `av.arrElems` of the destination's initializer and asks
  `dstPinSrcIs(bodyIx, av.arrElems[i], letIx)` of each. For `[[lv1]]` the single element is
  the ArrayLit `[lv1]`, which is not the binding, so the loop finds nothing and no
  destination is recorded at all. `pinArmListName` — which would answer `true` for the
  element spelling `Circle[][]`, since `arrLeafNameOf` peels to the leaf — is never called.
* **SO THE CUT IS THE SCAN, NOT THE PREDICATE**, and that is why it is filed rather than
  folded into D184: the element arm would need to RECURSE into a nested ArrayLit element,
  tracking how many `[]` it has descended so the pinned spelling matches the depth the
  binding actually holds. D184's own fix is one cut and needs no such bookkeeping.
* Boundary, both re-measured on `a19a3db7` and on this PR's seed: the depth-2 form
  (`const c: Circle[][] = [lv1]`) is D184 and now RUNS; the depth-3 form above is unchanged
  in both directions, so this row is neither caused nor moved by that change.

* **CLOSED 2026-08-27 — the scan became a DEPTH.** `dstPinPushAnn`'s element arm is now
  `dstPinElemDepthAt`, which answers *how many list levels below the destination the binding
  sits*, and `dstPinElemAnnName`, which cuts the destination's annotation that many times
  (`retRefArrElemName` takes the first cut, which has a node to read; `arrElemNameRaw` — the
  one home of the string cut — takes the rest). The pinned SPELLING has to match the level or
  the pin is a different program, which is why it is a depth and not a boolean.
* **THE SECOND WAY DOWN A LEVEL HAD NO GRID BEHIND IT.** A nested `ArrayLit` (`[[lv1]]`) is
  the one this row was filed on. The other is an UN-ANNOTATED BINDING whose initializer is a
  list literal (`const mid = [lv1]` … `const c: Circle[][] = [mid]`) — `dstPinLocalDest`'s
  `letType >= 0` guard already kept such a binding from recording a `""` DISAGREEMENT, so it
  also contributed no destination and the binding it links had **none at all**. That is the
  same "an un-annotated binding is a LINK in the chain, not the end of it" rule the
  whole-value alias walk has always applied, asked one container out. 18 of the 69 cells this
  cut moves are that shape and no earlier grid generated one.
* **MEASURED.** Block P (3,200 cells, `scripts/silent-sweep/d243/genbox.py --block P`): the
  cut ALONE moves **69** cells, all `check-clean invalid wasm → runs`, **0** `runs` lost and
  **0** into silence. Block Q (160): 0 either way. Corpus: 2,330 of 2,332 modules
  byte-identical (the two that move are the two floor fixtures the PR graduates, neither
  from this cut). Fixtures: `tests/cases/unions/arm-list-elem-pin-at-depth.vl`, whose three
  cells are generated cells `p01102` (this repro), `p01194` (depth 4 — a bound at 3 cannot
  tell "fixed" from "fixed one level further out") and `p01154` (the binding conduit).
* **#1973's DROPPED GATE A STILL HAS NO WITNESSES, re-measured against this deeper cut.**
  Widening `armPinAnnName`'s own ref-list rung to `pinArmListName(rae)` — dropped by #1973 as
  reachable but inert — moves **0 of 3,200** block-P cells, **0 of 160** block-Q cells and
  **0 of 2,332** corpus modules with A+B+C in place. The reason it stays inert is now
  written down at the rung: this cut lands on the ELEMENT side (`dstPinElemAnnName`, which
  carries `pinArmListName` already), and gate A is the WHOLE-VALUE side, whose producer set
  (`armPinLitInit`) is unchanged.

---

### D244 — [CLOSED 2026-08-27] an ARM-shaped object literal bound to a local and put in a list, with NOTHING annotated and NO twin
**closed · the filed repro RUNS and prints `7` · was `check-clean invalid wasm` on `322c07f2` · found 2026-08-27 by the LIST-CONTAINER grid built for D184 (block N), at a coordinate with no annotation anywhere in the program · six lines, and the arm is the ONLY claimant**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    const iv = { r: 7 }
    const c = [iv]
    if (c)[0].r == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THERE IS NO ANNOTATION AND NO LAYOUT TWIN, so neither the pin family nor the
  arm/twin conflation is in it.** `arrLitIsRef`'s nominal rung claims `[iv]` (the checker
  typed the element as the ARM `Circle`), the literal builds a kind-1 ref list, and the
  element the reader gets is the wrong heap. The un-annotated LOCAL between the object
  literal and the list is load-bearing: `const c = [{ r: 7 }]` — the literal written inline
  — RUNS, which is `arrLitElemName`'s object arm reaching `objVariantName` where the IDENT
  arm reaches `arrLitNominalElemName` instead.
* **IT IS NOT D40 AND THE CONTROL SEPARATES THEM.** D40's fixture
  (`unions/arm-element-list-from-ident-or-call.vl`) is this shape WITH the result
  annotation that makes the pin fire; strip the annotation and the program is this row.
* Grid population: 12 of the 18 cells still silent in the 640-cell block N after this PR,
  all `elem=bare`, module scope, at every one of the four nominal-ingredient levels.

* **CLOSED 2026-08-27 — AND THE ROW'S OWN MECHANISM CLAIM WAS HALF RIGHT.** `arrLitIsRef`'s
  nominal rung does claim `[iv]` and the literal does build a kind-1 arm list; what the row
  called "the element the reader gets is the wrong heap" is, disassembled, the PRODUCER's
  heap: `iv` is a module GLOBAL whose cell is the `{tag, value}` BOX, and `array.new_fixed`
  pushes that box into an `(array (mut (ref null $uVarHeap[Circle])))`. The un-annotated LOCAL
  the row identified as load-bearing is load-bearing for that reason — **`escope` is the
  axis**, and the function-scope twin of these six lines has always RUN.
* **THE CUT IS THE THIRD STORAGE CLASS OF A RULE THE OTHER TWO ALREADY CARRIED (D51).**
  `collectLocals` asks `structIndexOfLet < 0 && letObjLitVariantIdx >= 0` and binds the kind-8
  ARM; `criClassify`'s return rung asks it of a function result. `globalKind`'s `ObjLit` arm
  asked neither and fell to `if uDeclared { return "union" }`. It now asks the same question
  through the same helper (`objLitVariantIdxNoStructRow`, whose header already states the
  precondition that makes a field-set claim safe: the struct table has NO row for the shape,
  so the arm is the only nominal claimant), and `globalCellStructIdx`'s un-annotated leg reads
  the SAME helper so the cell's kind and its slot cannot drift. **Where a layout twin IS
  declared nothing moves** — `structIndexOfObj` answers first and the cell stays a `struct`,
  which is D39's own ruling.
* **MEASURED.** Block P: the cut ALONE moves **12** cells (`check-clean invalid wasm → runs`),
  **0** `runs` lost, **0** into silence. Block Q: **2** more, one of them `loud emit reject →
  runs`. **9 of the 12 block-P cells are ALSO closed by D243's cut alone** — at depth ≥ 3 the
  program runs either because the producer stops repping as the box or because the pin names
  the arm — and the two compose without cancelling (`|A ∪ B| = 72 = |A+B+C|`, set-identical).
* **IT LIFTS TWO FLOOR PINS, both of which asked to be flipped in their own headers**:
  `tests/cases/unions/arm-param-value-call-box-arg-floor.vl` ("flip this file to `@run` when
  the value call learns to build the arm" — it is now handed one instead) and
  `variant-fieldset-twin-anon-shape-floor.vl` ("flip it when the floor lifts"). The
  load-bearing `collectAnonShapes` guard whose deletion reddens 7 `@run` corpus rows is
  **untouched**: the repair gives the CELL the variant context, not the anon pass. The first
  floor's other two shapes are still floored and now have a file each — the ObjLit argument
  (pre-existing) and the `is`-NARROWED union binding
  (`arm-param-value-call-narrowed-arg-floor.vl`, added so the floor's coverage could not
  shrink silently). Regression fixture:
  `tests/cases/unions/arm-objlit-global-cell-no-twin.vl` (generated cell `p00192`, its
  function-scope control, and the LOUD disguise of the same root).

---

### D245 — [CLOSED 2026-08-27 — see the re-grade note] a LIST whose element is an arm-valued MAP delivered through a parameter
**closed · the filed repro RUNS and prints `7` · was `check-clean invalid wasm` · found 2026-08-27 by the LIST-CONTAINER grid built for D184 (block N) · the map/list CROSS that no grid had: the seven earlier grids build the container as a map and read it directly, never as the ELEMENT of a list**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    function thru(x: {[string]: Circle}) { x }
    const iv = Map()
    iv["k"] = { r: 7 }
    const c = [thru(iv)]
    if (((c)[0])["k"] ?? { r: 0 }).r == 7 { print(7) } else { print(0) }
    // vl check rc 0 with NO diagnostics; vl run:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE PARAMETER IS THE CARRIER AND IT IS D171's HOP.** `thru`'s annotation is the only
  place `Circle` appears as a map value, and it reaches `iv` through the ARGUMENT→PARAMETER
  direction D171 records as the missing half. Without the `thru` hop
  (`const c = [iv]`) the same program is a different cell.
* **IT IS THE `list_of_map` CONTAINER WITH A NOMINAL VALUE**, which is the cross the census's
  own block C covers by rep but not against the arm/twin ingredients, and which no per-row
  grid built at all.
* Grid population: 6 of the 18 cells still silent in block N after this PR, all `elem=map`,
  module scope, `deliv` ∈ {param, ident, call}.

* **RE-GRADE NOTE, 2026-08-27 (#1974) — THIS ROW WAS ALREADY STALE ON `811f8102`, ITS OWN
  MERGE COMMIT.** `check-filed-witnesses.py --strict` run against **master's own copy of this
  file** and **master's own seed** (`811f8102`, 1,461,131 bytes, proved fixpoint) reports it
  MOVED: the repro above runs and prints `7`. So the staleness predates #1974 and is not
  caused by it — #1974's own two rungs are bound tests on an EMPTY ref-list table and this
  program interns one.

  **The mechanism was NOT investigated here**, deliberately: this is #1975's row, filed in the
  same landing that closed D157/D163, and the likeliest reading is that the row was written
  against a pre-fix measurement and its own PR then closed it. Someone who owns that landing
  should confirm which rung did it and whether the block-N population figure above still
  holds. The status is corrected so the gate reflects the tree; the causal claim is left open
  rather than guessed.

  This is the inventory going stale one-directionally *inside a single PR*, which is a
  sharper version of the failure `CLAUDE.md` already warns about — the doc was accurate when
  the row was drafted and wrong by the time it merged.

---

### D280 — a union ARM and a declared STRUCT of its exact layout are TWO WasmGC heap types, and the checker says they are ONE type
**[CLOSED 2026-08-28] the repro below RUNS and prints `7`. Was: check-clean invalid wasm on `28425535` and on every generation before it · SEVEN LINES — no map, no list, no generic, no pin, no conduit · found 2026-08-27 by asking D156's family what its GATE was a proxy for · the ROOT of D156, D158, D171 and D224's half, and the ingredient D157's own control table already isolated ("the EXACT LAYOUT TWIN is required")**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    const d: Dot = { r: 7 }
    const c: Circle = d
    print(c.r)
    // `28425535`: vl check rc 0 (one redundant-annotation HINT, no errors); vl run:
    //   Invalid input WebAssembly code at offset 180:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **THE CHECKER SAYS THEY ARE ONE TYPE AND IT SAYS SO OUT LOUD.** `vl check` on the repro emits
  ``redundant type annotation: `c` is inferred as `Dot` `` — on a binding annotated `Circle`.
  That is the acceptance `DECISIONS.md` derives the struct layer's whole slot-dedup discipline
  from: "`type A = {v:i32}` and `type B = {v:i32}` are THE SAME type (the checker accepts a `B`
  wherever an `A` is expected), so they MUST share one heap type. Minting a distinct heap type
  per declared alias was an active soundness bug."
* **FOUR LAYERS CLOSED THAT BUG AND THE FIFTH SEAM WAS CHARTERED OPEN.** `sTwin` (struct),
  `rlTwin` (ref-list), `mvTwin` (map-value) and `uVarTwin` (variant) each dedup WITHIN their
  table. `DECISIONS.md` records the exception: "The variant⇄struct-TABLE seam (a declared struct
  twin in a variant-arm position) stays nominal — chartered as repOf item (e)". **That charter's
  REASON is about RESOLVER RUNG ORDER** — "a NOMINAL question must not be settled by whichever
  STRUCTURAL rung happens to fire first", which D32 and D33 correctly fixed by ordering rungs —
  **and it was silently read as licensing two HEAP TYPES.** Those are different claims: the
  resolvers must stay nominal (they still are; nothing here touches `rlElemStructRow`'s D32
  floor, and `uVarHeap` / `sHeapIdx` remain two namespaces), and the two nominal answers must
  nevertheless land on ONE heap, exactly as `type A` / `type B` do.
* **THE DISASSEMBLY IS THE WHOLE DIAGNOSIS.** On the base the rec group carries THREE identical
  `(struct (field (mut i32)))` — `$1` is `Dot`'s struct row, `$2` is `Circle`'s variant heap,
  `$3` is `Sq`'s — and the module reads

      (global $global$0 (mut (ref $1))      (struct.new $1 (i32.const 7)))
      (global $global$1 (mut (ref null $2)) (ref.null none))
      (global.set $global$1 (global.get $global$0))     ;; (ref $1) into a (ref null $2) cell

  On the shipped seed the rec group carries TWO, `global$1` is `(mut (ref null $1))`, and the
  identical `global.set` is well typed. One heap type fewer, and nothing else in the module moves.
* **FOUR CONTROLS, each one change from the repro, all built and run:**

  | change | outcome |
  |---|---|
  | (none — the repro as filed) | **check-clean invalid wasm** |
  | `const d: Dot = c` (the reverse direction) | check-clean invalid wasm |
  | `function takeC(x: Circle)` and `takeC(d)` (across a parameter) | check-clean invalid wasm |
  | delete `type Shape = Circle \| Sq` — two plain twins `A`/`B` | **RUNS** (this is `sTwin`) |
  | the same pair as a map VALUE (`{[string]: Dot}` into `{[string]: Circle}`) | check-clean invalid wasm |

  The fourth row is the control that makes this a SEAM and not a general defect: the identical
  program with the union deleted has always run, because that pair is inside ONE table.
* **PATTERN 4 — A KEY THAT NEED NOT SEE THE PAIR.** `uVarSTwin[vi]` is computed per claimant from
  `repSlotOfTy(uVarTyIx[vi])`, the bridge `armLayoutContestedAt` already asks, plus a
  field-storage layout guard. The MINT (`mAssignTypeIndices`) and every pairwise FIND
  (`rlSlotsLayoutTwin`, `repMapValSlotsTwin`) evaluate the same function of `vi` and agree
  without either observing the other — which is what keeps it TIMING-INDEPENDENT, the property
  `rlSlotsLayoutTwin`'s header requires of anything it consults. No channel was needed and none
  was added.
* **THE LAYOUT GUARD DECLINES A REF-BEARING FIELD OUTRIGHT** (codes 5 / 15 / 28 / 19 / 29) rather
  than descending into the referenced layer the way `variantFieldLayoutEq` does. Never-merged is
  the safe degenerate; the whole of this family is fixed-storage arms; and the narrow guard is
  also what keeps the compiler's own hundreds of variants out of the change, which is why the
  self-compile fixpoint holds at the first rung. Widening it is a separate measurement.
* **THE TRADE, and `runs` LOST is ZERO on every population measured**: 106 forward / 0 backward /
  0 same-class message moves on 5,188 per-row grid cells; **62 behavioural classes / 2,108 census
  cells forward, 0 `runs` lost, 0 → silent** on the distilled corpus standing for 250,310 cells;
  341 forward / 0 `runs` lost / 0 → silent on census block B (28,590), with 7 same-class message
  moves inside the silent class; and **0 corpus modules LOST, 1 GAINED, 30 byte-DIFF** over 2,338
  `tests/cases` files. The standing price to beat was D236's 80 `runs` cells; this loses none, and
  D172, D173 and D236 all still run.
* **THE COUNTER SAYS THE BYTES MOVED FOR THIS REASON AND NO OTHER.** Across the 30 byte-DIFF
  corpus modules the emitted struct heap types go **322 → 255 (−67)**, and **30 of the 30** lose at
  least one. Not one module moved bytes without losing a heap type.
* Pinned as programs 1–3 of `tests/cases/soundness/arm-and-its-layout-twin-share-one-heap.vl`
  (`@run`, four `@log 7`), whose program 1 is the graduated D158 specimen verbatim.

---

### D281 — the BOX a merged heap still needs: one test read as two questions
**[CLOSED 2026-08-28, in the same landing that created it] the repro below RUNS and prints `7` · A REGRESSION THIS PR'S OWN FIRST RUNG CREATED AND ITS SECOND REMOVED, filed because the latent defect is older than the rung that exposed it and because NO GRID AND NO CENSUS COULD HAVE FOUND IT**

Repro:

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    type Dot = { r: i32 }
    const d: Dot = { r: 7 }
    const s: Shape = d
    if s is Circle { print(7) } else { print(0) }
    // `28425535`: runs, prints 7.  With D280's heap merge and WITHOUT this rung:
    //   vl check rc 0, then type mismatch: expected (ref null $type), found (ref $type)

* **THE FUSED TEST.** `emitUnionCoerce` asked `sHeapIdx[rbSsi] != uVarHeap[rbVi]` and used the
  answer for two different questions: *must the PAYLOAD be rebuilt onto another heap type* and
  *is this value already box-shaped*. Its own comment states the intent — "Gated on the heaps
  DIFFERING so an already-deduped shape keeps the byte-identical raw pass" — and the
  fall-through it guards is a RAW PASS with no box at all.
* **IT WAS UNREACHABLE, WHICH IS WHY IT WAS WRONG AND INVISIBLE.** `sHeapIdx` and `uVarHeap` never
  cross-deduped, so for any arm-matching struct row the heaps ALWAYS differed and the equal branch
  could not be entered. D280 makes it reachable, and the raw pass drops a bare `(ref $arm)` into a
  `(ref null $uBox)` cell.
* **THE DISASSEMBLY, three ways.** Master rebuilds then boxes —
  `struct.new $4 (i32.const 0) (struct.new $2 (struct.get $1 0 (global.get $global$0))))`. The
  merge WITHOUT this rung emits `global.set $global$1 (global.get $global$0)` — no box at all.
  The shipped composition emits `struct.new $3 (i32.const 0) (global.get $global$0))` — the box
  and no rebuild, which is also one allocation fewer than master.
* **THE FIX IS THE COMPLEMENT ALREADY WRITTEN THREE HUNDRED LINES AWAY** (pattern 1).
  `emitUnionBoxArg`'s own fall-through is exactly the three instructions the merged case wants —
  `i32.const <tag>` / the expression / `struct.new uBoxIdx` — because the payload needs no
  REBUILD, only the BOX. `emitUnionBoxArg` was already correct for this; only `emitUnionCoerce`
  fused the two questions.
* **NO GRID AND NO CENSUS COULD HAVE FOUND IT, AND THAT IS THE REASON THIS ROW EXISTS.** The rung
  moves **0 cells on all four per-row grids (5,188)**, **0 classes on the distilled corpus
  (250,310 census cells)** and **0 on census block B (28,590)** — none of those populations boxes
  a plain declared struct into a union. It was found by a hand probe built to ask what the heap
  merge changed, and it is the direct measurement behind "a candidate moving 0 alone can be
  load-bearing": strip this rung from the shipped composition and every instrument still reads
  106 forward / 0 backward / 0 `runs` lost while this program goes silent.
* **AND IT NOW HAS A PRICE, MEASURED THE NEXT DAY BY A POPULATION BUILT FOR A DIFFERENT QUESTION
  (D282).** The 324-cell D282 grid carries a `use=boxarm` axis — read a value back out and box it
  into the union — which is exactly the shape the sentence above says no population had. Strip
  this rung from MASTER and **30 of those 324 go `runs` → check-clean invalid wasm**, every one at
  `use=boxarm × claim=decl`. Six MORE go with them under D282's own merge
  (`mapparam × boxarm × claim=none`), which is that merge making this arm reachable at six new
  coordinates. All 36 are kept whole at `scripts/silent-sweep/distilled/named/d282_*.vl`, so the
  gate can now score a rung every derived population reads as zero. The claim above is unchanged
  and is now dated: no grid that EXISTED could have found it.
* Pinned as program 4 of `tests/cases/soundness/arm-and-its-layout-twin-share-one-heap.vl`.

---

### D282 — the read's `??` DEFAULT is the only nominal claim, and the container was filled through an un-annotated PARAMETER
**[CLOSED 2026-08-28] the repro below RUNS and prints `7`. Was: check-clean invalid wasm on `474b6a1b` and on every generation before it · 6 of the 1,188-cell position grid (`read x param x arm x notwin x d{1,2,3} x {norm,rev}`) and the WHOLE of that grid's surviving silent population · it was THE SPECIMEN (`tests/vl_check_codegen_test.ts`'s `INVALID_MODULE_SRC`), re-pointed at D209 — and re-pointed TWICE more the same day, at D224 when D209 closed and at **D291** when D224 closed too; the slot's genealogy now records THREE selection rules that each failed within a day of being written, and the fourth is a census rather than a choice**

Repro (ten lines, and NO layout twin is declared anywhere):

    type Circle = { r: i32 }
    type Sq = { s: i32 }
    type Shape = Circle | Sq
    function fill(c, n: i32) {
      c["k1"] = { r: n }
    }
    const c = Map()
    fill(c, 7)
    const dleaf: Circle = { r: 0 }
    print((((c)["k1"] ?? dleaf)).r)
    // `474b6a1b`: vl check rc 0 (one redundant-annotation HINT, no errors); vl run:
    //   Invalid input WebAssembly code at offset 1258:
    //   type mismatch: expected (ref null $type), found (ref $type)

* **IT IS D280's ARGUMENT AT AN ANONYMOUS CLAIMANT, AND THE FILING'S OWN "no second claimant is
  declared" WAS THE MISTAKE.** That sentence is true and it is not the question. `Circle`'s
  layout has a second claimant here: the interned `#anonN` row `collectAnonShapes` mints for
  `{ r: n }` inside `fill`, where no context can name it. `variantStructHeapTwinAt` keys on
  `repSlotOfTy(uVarTyIx[vi])`, and that bridge answers only for a DECLARED row — its cache scan
  is gated `sRowDecl[si] == 1` — so the anonymous claimant is invisible to it and the arm mints a
  SECOND heap type for a checker type that has one. The checker says they are one type OUT LOUD,
  exactly as it did on D280: ``redundant type annotation: `dleaf` is inferred as `{r: i32}` `` on
  a binding annotated `Circle`.
* **THE COMPLEMENT WAS ALREADY WRITTEN — pattern 1, for the sixth time in this family.**
  `repRowOfTyStruct` is the SAME double gate (`slotCanonId` key + `structFieldCodesEq` layout)
  lifted to a whole-table scan keyed on an ARENA TYPE instead of a second slot, its header says
  so, and `slotCanonId`'s arena rung (`sTyIx` → `repCanonId`) covers precisely the `#anon` rows
  the name path cannot resolve at all. It declines a genuinely AMBIGUOUS bucket (two canon-key
  twins whose emitted layouts differ) rather than guessing — the same never-merged degenerate
  `variantStructHeapTwinAt`'s own field-code guard takes. **ONE confirm-only line**, second, so
  the declared answer is untouched: the widening can only turn a -1 into a row.
* **THE DISASSEMBLY IS THE WHOLE DIAGNOSIS.** On the base the rec group carries THREE identical
  `(struct (field (mut i32)))` — `$0` the `#anon` row the map's value slot uses, `$1` `Circle`'s
  variant heap, `$2` `Sq`'s — and the module reads

      (global $global$2 (mut (ref $1)) (struct.new $1 (i32.const 0)))   ;; dleaf, at Circle
      (local $17 (ref null $0))                                        ;; the `??` result
      (else (local.set $17 (global.get $global$2)))                    ;; (ref $1) into (ref null $0)

  On the shipped seed the rec group carries TWO, `global$2` is `(mut (ref $0))`, and the
  identical `global.get` is well typed. One heap type fewer, and nothing else in the module moves.
* **THE COUNTERS SAY THE LINE IS REACHED AND ANSWERS**, probed at the site
  (`entries / declAnswered / anonReach / anonAnswered / merged`):

  | program | counters |
  |---|---|
  | this row's repro | `2 / 0 / 2 / 1 / 1` — the declared bridge answers ZERO times; the new rung answers once |
  | D280's repro (a DECLARED twin) | `2 / 1 / 1 / 0 / 1` — inert; the new rung is not reached for that arm |
  | the same program with the parameter ANNOTATED (no `#anon` row is minted) | `2 / 0 / 2 / 0 / 0` — reached, correctly DECLINES |
  | with `type Shape` deleted (no union at all) | `0 / 0 / 0 / 0 / 0` |
  | **the whole of `tests/cases` (1,954 files that reach the emitter)** | **1,075 / 73 / 1,002 / 304 / 321** |

  The declared rung answers 73 times over the corpus and the anonymous one 304 — **4.2x** — which
  is the size of the half D280 could not see.
* **THE TRADE, and `runs` LOST is ZERO on every population measured**: **6 of 1,188** on the D156
  annotation-position grid, cell-matched, all six `check-clean invalid wasm → runs` and all six
  the cells this row names; **24 of 324** on the purpose-built D282 grid
  (`scripts/silent-sweep/d282/`), every one `prod=mapparam × claim=none`; **7 behavioural classes
  / 312 census cells forward, 0 `runs` lost, 0 → silent** on the distilled corpus standing for
  250,517 cells; and **0 corpus modules LOST, 0 GAINED, 135 byte-DIFF** over 2,338 `tests/cases`
  files. D209, D224, D271, D272 and D173 all still behave exactly as filed.
* **THE ABLATION SAYS THIS IS A COMPOSITION, NOT A RUNG — and it is the first population to
  PRICE D281.** Four compilers, each a distinct size (1,463,065 base · 1,463,113 shipped ·
  1,463,046 this rung with D281's stripped · 1,462,998 base with D281's stripped), all four
  cell-matched on the 324-cell grid:

  | compiler | silent | `runs` lost vs base |
  |---|---|---|
  | base (`474b6a1b`) | 24 | — |
  | **base with D281's rung STRIPPED** | **54** | **30** |
  | **this rung ALONE, D281's stripped** | **36** | **36** |
  | shipped (both) | **0** | **0** |

  **Direction one — a candidate that scored 0 on every population when it landed is load-bearing
  here.** D281's rung moved 0 cells on all four per-row grids (5,188), 0 classes on the distilled
  corpus and 0 on census block B when it shipped, and its own row says why: *"none of those
  populations boxes a plain declared struct into a union."* This grid's `use=boxarm` axis does,
  and stripping that rung from MASTER loses 30 running programs — all 30 at
  `use=boxarm × claim=decl`. **Direction two — either half alone is a catastrophe.** This rung
  alone is strictly WORSE than the base (24 silent → 36): it fixes its 24 and breaks 36, of which
  30 are D281's and **6 are new** — `mapparam × boxarm × claim=none`, the coordinates where only
  the anonymous merge makes `emitUnionCoerce`'s equal-heap arm reachable. Stripping this rung
  reproduces the base **byte for byte at 1,463,065**.
* **THE 36 ARE A NAMED SET AND THEY ARE NOW IN THE GATE.** Coordinates at
  `scripts/silent-sweep/census/d282-d281-price.json`, materialised by
  `scripts/silent-sweep/d243/mkset.py` (36 `vl` invocations; the histogram must read `runs 36`
  and nothing else — it reads `check-clean invalid wasm 36` on the ablated compiler), and the
  cells kept WHOLE at `scripts/silent-sweep/distilled/named/d282_*.vl`, where `regress.py`
  exits 1 with `36 behavioural class(es) stopped running` against that compiler. They are the third instance of the shape #1979 and #1981 were landed for, and the
  first reached from an ABLATION rather than a refusal: no derived rule can score a rung that
  every derived population reads as zero.
* Pinned as programs 1–4 of `tests/cases/soundness/arm-and-an-anon-row-of-its-layout-share-one-heap.vl`
  (`@run`, four `@log 7`), whose program 1 is this repro verbatim, program 2 is the six new
  D281 coordinates, program 3 is the depth-2 sibling and program 4 is the inertness control.
  `xfail-miscompile-read-default-annotation-through-unannotated-param.vl` is DELETED, which is
  that file's own written instruction for the day it starts passing.
* **THE SPECIMEN MOVED TO D209**, and the selection rule moved with it. The previous rule
  ("choose against both mechanisms of this family") held on every one of its three facts —
  `armLayoutContested` false, `variantStructHeapTwinAt` -1, `uVarTwin` with no second arm — and
  the close came from making `variantStructHeapTwinAt` ANSWER where it had answered -1. Choosing
  against the mechanisms a family HAS is choosing against the candidates again, one level up. The
  successor therefore leaves the family by a CHECKABLE property rather than an argued one: D209
  declares no union at all, so `uVariants` is empty and this whole seam is counted at `entries=0`.

  **AND THAT RULE FAILED TOO, WITHIN A DAY — the property HELD and the row closed anyway.**
  `uVariants` stayed empty on D209 and nothing in this family touched it; what closed it was a
  three-rung CHANNEL at the code-16 READ (D209's own row), which this family does not reach.
  Leaving a family is not leaving the reach of every future argument. The slot's fourth rule
  stops choosing: every one of this document's rows now has its OWN filed program run against the
  tree at each swap, and the successor is whichever row is the only remaining member of the class
  — a census, which cannot be wrong about the population even when it is uninformative about
  durability.

---

## 6. Coverage gaps — axes not built, and why

Stated plainly rather than reported as a silent zero.

* **MODULE-SCOPE EXECUTION — was the largest of these, and is now BUILT** (2026-08-26, see
  "THE SCOPE AXIS"). Every cell used to run inside `function reader()`; the `global` position
  varied where the BINDING sat and never where the READ executed. Crossing it found 38 silent
  cells against a function-scope 0 on the same coordinates. The only combination still not
  covered is `pos=param` (780 coordinates), which has no module-scope spelling at all.
* **A MAP READ AT A MISSING KEY over a DECLARED-nullable value type — was not in the
  population, and is now** (`mapval_miss`). `mapval` only ever read a key it had just stored,
  so D19's own coordinate was absent from the grid that reported 0 silent; 31 of the 38 cells
  above live at the new position. **Read the generator before quoting a zero**: a coordinate
  that is not generated and a defect that is not present produce the same number.
* **Sets** (string-key and i32-key) — not built. The rep vocabulary in the audit lists them
  as reps a ladder must answer for, and the i32-keyed map defect (D4) suggests the i32-keyed
  SET is worth the same probe. No syntax for a set literal was located in the time budget.
* **Newtypes / brands** (`type EntityId = new i32`) — not built. Given D1, the interaction
  worth measuring is a `new` alias declared AFTER its user.
* **Nested arrays** (`i32[][]`) — not built beyond audit R7's existing note.
* **Generics / monomorphised positions** — not built. Audit R8 (`monoArgTyName` has no
  `nulmap` arm) has a reaching program already and was not re-derived here.
* **`flat` records** — not built.
* **A nullable CLOSURE as an ALIAS inside the generated grid** — generated with a parse
  error (§4d) and therefore NOT measured by the grid. It was measured by hand instead
  (correct), so the gap is in the grid's coverage, not in the finding.
* **Multi-module / import positions** — every cell is a single file.
* **`-O` / `wasm-opt` output** — every cell was graded on the unoptimised module. A silent
  defect that only appears after `wasm-opt` would not be visible here.
* **Struct-field ASSIGNMENT** as a position (`w.f = src()`) — only field *construction* and
  field *read* were built. D8's field leg shows assignment is a distinct axis with its own
  behaviour, so this is a real gap.
* **Deeper capture chains** — two levels were probed by hand (invalid wasm, consistent with
  D3); three or more were not.
* **Evaluation counts under `is` / `match` / place-narrowing constructs** — these mention the
  access expression more than once by construction, so their expected count is not 1 and they
  were graded for value only. A double evaluation *within* one syntactic mention of an `is`
  arm would not be caught. Given D2, this is the gap most likely to hold another
  wrong-evaluation-count cell.

## 7. Where the population disagrees with the audit's score

`per-rep-ladder-audit.md` records "check-clean SILENTLY WRONG output, reached: 0 + 26 (C4),
all closed" and states plainly that the 0 is its own scans' blind spot. This sweep is a
different population — programs by rep × position × construct × input, rather than ladders
by scan shape — and it finds **2 silently-wrong-value cells and 4 wrong-evaluation-count
cells** that no ladder scan would reach:

* D1's root is a declaration-ORDER dependency. No per-rep ladder is incomplete; the ladder is
  consulted before its table is populated. A scan for missing arms cannot see it.
* D2's root is an expression emitted twice. There is no rep, no arm and no fallthrough
  involved, and the cell is value-correct — only a side-effect counter distinguishes it.

Both are arguments for keeping the program-population sweep alongside the ladder audit
rather than in place of it.
