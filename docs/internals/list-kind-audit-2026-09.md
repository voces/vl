# List-kind audit — why `u8[]` kept breaking, and which refactor stops it

Asked 2026-09-23 after a day of `u8[]` rows (D2201, D2238, D2246 closed; D2239, D2249 open):
are these patch fixes, and would a deep refactor end them? Measured on `b2b56b450` with a seed
built from that tree. No compiler change is made here.

**Answer in three lines.** The kinds are ALREADY a closed type (`VKind`, 32 members,
`emit_state.vl`), so converting strings to a union (option b) would not have caught these bugs.
Every one of them sat in a PRODUCER — a chain of per-kind predicates (`if exprU8Array(e) { return
"u8list" }`) or an integer code table — where there is no kind-typed subject for a `match` to
check. The fix that removes the class is (a): one producer per question, with the per-kind
predicates as projections of it. That is phase 3 of `rep-descriptor-campaign.md` applied to lists.

## 1. The vocabulary, and what the premise got wrong

The list reps are 14 `VKind` members: `list` (i32), `u8list`, `i64list`, `f32list`, `f64list`,
`strlist`, `reflist` (struct, nested list, union and closure elements), and a `nul*` twin of
each. `ladder-census.py` already reads `VKind` ladders: **56 on this tree, 25 with a silent
default**, all deferred as "a handful of a 32-member set" (`kind-ladder-lint.md` §residue).

The same reps are also spelled in at least five other vocabularies, each with its own
translation function, and the integer ones mostly have no `u8` code:

| vocabulary | where | u8 code |
| --- | --- | --- |
| `rlElemKindTbl` element codes (4 i32, 6 str, 7 f64, 8 i64, 9 ref, 10 f32) | `emit_state.vl` | none |
| `scalarListKindOfName` (0 i32 .. 4 f32) | `emit_classify.vl:5362` | none |
| `pendingListKind` / `exprListCellBuildKind` (0..10) | `emit_state.vl:985`, `emit_classify.vl:31463` | 10 is set elsewhere; `exprListCellBuildKind` never returns it |
| field codes (`fieldCodeOfVKind`: 27 = f32 list) | `emit_classify.vl:21567` | declined (`-2`, "ask the spelling ladder") |
| `$fnsig` tokens (`repSigTokOfKind`), union-box `cak` codes, `RtKind` | `emit_rep.vl`, `wasmEmit.vl` | yes |

Where the day's bugs were: D2246 was `ifExprRefKind`'s predicate chain; D2238's fix added the
same `narrowedHoleNulScalarListKind` rung to five `expr*Array` predicates by hand; D2201 was the
union box's `cak` code; D2239 and D2249 are the `u8[] | null` element and field, where the
element-code table has no u8 row. Not one was a consumer `==` chain over `VKind`.

## 2. Census of the classifiers

`list-kind-grid.py --census`: every top-level function in `compiler/*.vl` whose body names a
list-kind literal. **154 functions in 8 files.** 20 name all 14 (the valtype writers, `_`-less
`match`es such as `vkNulNicheOf`, `repSigTokOfKind`); 90 name three or fewer (per-kind
predicates such as `declaredF32Array`); **44 name 4–13**, and the 42 in the emitter are below
(the other two are `typecheck.vl`'s equality ladders). `x` = the literal appears; **`-`** = it
names three or more kinds of that half and skips this one; rows with one pattern are merged.
The `nulScalar*` family's `?i32`/`?ref` holes are by design (not distinct-backing lists).

| function | file:line | i32 | u8 | i64 | f32 | f64 | str | ref | ?i32 | ?u8 | ?i64 | ?f32 | ?f64 | ?str | ?ref |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `retKindIsList`, `mvListValKind`, `annParamKind`, `retTokOfTy`, `pushDestVKind`, `emitDirectCall` | classify, wasmEmit | x | **-** | x | x | x | x | x |  |  |  |  |  |  |  |
| `retAnnKindChain` | classify:971 | x | **-** | **-** | **-** | x | x | x |  |  |  |  |  |  |  |
| `letInitCellKind`, `collectLocals`, `vtKindOfTypeLadder`, `globalCellKindGo` | classify, collect | x | x | x | x | x | x | x | x |  |  |  |  |  | x |
| `retLocalCellKind` | classify:3869 | x | **-** | x | x | x | x | **-** |  |  |  |  |  |  |  |
| `ifExprRefKind` | classify:12276 | x | x | x | x | x | x | x | - | x | x | x | x | x | - |
| `nulScalarListKind` (+`is…`, `…CodeKind`, `exprNul…`, `collectA`) | classify |  |  |  |  |  |  |  | - | x | x | x | x | x | - |
| `optChainLeafNulListKind` | classify:17622 |  |  |  |  |  |  |  | - | **-** | x | x | x | x | - |
| `globalKind`, `fieldCodeVKind`, `criClassify` | classify | x | x | x | x | x | x | x |  |  |  |  |  |  |  |
| `tyPrimLeafListKind` | classify:31577 | x | x | x | x | x | x | - |  |  |  |  |  |  |  |
| `listBuildKindOfVKind` | classify:31618 | **-** | x | x | x | x | x | x |  |  |  |  |  |  |  |
| `tyKindCodeWord`, `tyKindCodeOfVKind` | classify:32966 | x | **-** | x | **-** | x | x | **-** |  |  |  |  |  |  |  |
| `annRetKind` | classify:34924 | x | **-** | x | x | x | x | x | x |  |  |  |  |  |  |
| `paramTokOfTy`, `buildFnMap` | classify, collect | x | **-** | x | x | x | x | **-** |  |  |  |  |  |  |  |
| `repOfArray` / `repOfNullable` | rep:2800 / 2693 | x | x | x | x | x | x | x | x | x | x | x | x | x | x |
| `rtNulVKind` | rep:3643 | x |  |  |  |  |  |  | x | x | x | x | x | x | **-** |
| `emitMapValDefault` | wasmEmit:7652 | **-** | **-** | x | x | x | x | x |  |  |  |  |  |  |  |
| `emitMapSetValExpr` | wasmEmit:8642 | **-** | **-** | x | x | x | x | **-** |  |  |  |  |  |  |  |
| `emitIndex` | wasmEmit:9950 |  | x |  |  |  |  |  | - | x | x | x | **-** | x | - |
| `scalarListElemOfListKind`, `emitFieldListWidenSite` | wasmEmit | x | x | x | x | x | - | - |  |  |  |  |  |  |  |

**A `-` is a candidate, not a bug.** Eight u8 and f32 `-` cells were probed directly
(`h?.b` over `u8[]`, an inferred return of a `u8[]` local, a closure returning and taking
`u8[]`, `m["z"] ?? []` over `{[string]: u8[]}`, `u8[][]` push and literal, the f32 twins) and
**all eight run**: an earlier rung or an upstream arena read covers them. The literal census
names where to look. The sweep in §3 decides what is live.

**The producer family behind the live bugs is the seven `expr*Array` predicates**, and they
disagree about what they can see:

| predicate | arena opener (`nodeTyPinIxOf`) | `IfStmt` arm | `Member` arm | `ArrayLit` arm | refs |
| --- | :-: | :-: | :-: | :-: | --: |
| `exprArray` (i32) | no | no | yes | yes | 35 |
| `exprU8Array` | yes | no | no | no | 20 |
| `exprI64Array` | yes | no | no | yes | 22 |
| `exprF32Array` | **no** | **no** | yes | yes | 23 |
| `exprF64Array` | yes | no | no | yes | 26 |
| `exprStringArray` | yes (`tyKindOf == 7`) | yes | yes | yes | 37 |
| `exprRefArray` | no | yes | yes | yes | 75 |

`exprF32Array` is the only scalar predicate with neither an arena opener nor an `IfStmt` arm,
and that is where the sweep found the new f32 defect (§3). Prediction, to be graded by the fix.

**Type→rep sources that exist today**, and which could be the one source:

* **`repOfTy` / `repOfNode` (`emit_rep.vl`) is the one source.** It is derived from the `Ty`
  arena, `_`-less over it, `vtKindOfType`'s first rung, 20 call sites outside `emit_rep.vl`.
  `repOfArray` covers all seven list reps; `repOfNullable` covers the nullable ones for scalar
  and struct elements and declines a nested-list or union element. One oddity to check: it
  records `nulu8list`'s element as `"u8list"` where every other arm records the element (`"u8"`).
* `nulScalarListKind` (name), `nulScalarListKindOfNode` (annotation), `exprNulScalarListKind`
  (expression): three spellings of one five-kind question, the first two already arena-first.
* `mvListValKind`, `pushDestVKind`: slot → `VKind` translations from the integer tables, only
  as complete as those tables. `ifExprRefKind`, `exprListCellBuildKind`, `refListSlotOfExpr`:
  producers built on the `expr*Array` chain, so consumers of the one source, not candidates.

## 3. The sweep — nine kinds x eight delivery families, every position, both faces

`scripts/capability-probes/list-kind-grid.py` writes 72 `matrix/lk-<family>-<kind>.matrix.vl`
templates and grades them through `matrix.py`. Kinds: `u8 i32 i64 f32 f64 string`, `struct`
(`P[]`), `nested` (`i32[][]`), `nullelem` (`(i32|null)[]`). Families: a typed name (`plain`),
`K[] | null` (`nullable`), `if c { xs } else { null }` (`join-null`) and its `null`-first mirror,
`[]` then push (`empty`), `if c { xs } else { [] }` (`empty-join`), a `{[string]: K[]}` read
(`map-read`), a `K[] | null` record field (`nullable-field`). **4,122 cells graded** (486
skipped, the `is`-positions of a non-union): 3,420 RUNS, 251 SILENT, 2 trap, 440 emit refuses,
9 check refuses. Cell = runs/graded, then S silent, T trap, E emit refuses, C check refuses.

| family | u8 | i32 | i64 | f32 | f64 | string | struct | nested | nullelem |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| plain | 46/46 | 46/46 | 46/46 | 46/46 | 46/46 | 46/46 | 46/46 | 46/46 | 45/46 1E |
| nullable | 51/64 2S 11E | 64/64 | 64/64 | 64/64 | 64/64 | 64/64 | 64/64 | 64/64 | 60/64 4E |
| join-null | 49/64 3S 12E | 62/64 1S 1E | 62/64 1S 1E | 62/64 1S 1E | 62/64 1S 1E | 62/64 1S 1E | 60/64 4E | 62/64 2E | 58/64 6E |
| null-first-join | 0/64 28S 36E | 0/64 37S 27E | 0/64 33S 31E | 0/64 33S 31E | 0/64 33S 31E | 0/64 33S 31E | 0/64 6S 58E | 0/64 6S 58E | 0/64 6S 58E |
| empty | 45/46 1C | 45/46 1C | 44/46 1S 1C | 44/46 1S 1C | 44/46 1S 1C | 44/46 1S 1C | 43/46 1S 1E 1C | 43/46 1S 1E 1C | 45/46 1C |
| empty-join | 46/46 | 46/46 | 46/46 | **29/46 17S** | 46/46 | 46/46 | 45/46 1E | 46/46 | 45/46 1E |
| map-read | 51/64 2S 11E | 64/64 | 64/64 | 64/64 | 64/64 | 64/64 | 62/64 2E | 64/64 | 60/64 4E |
| nullable-field | 52/64 1S 2T 9E | 64/64 | 64/64 | 64/64 | 64/64 | 64/64 | 62/64 2E | 64/64 | 62/64 2E |

**Counted by where the cells came from, not by message** (grouped by family and position; the
unfiled groups each have a minimal witness):

| mechanism | S | T | E | kinds | status |
| --- | --: | --: | --: | --- | --- |
| a join whose first arm is `null` takes the i32 blocktype ([D2227](inventory/D2227.md)) | 221 | | 373 | all nine; also `string \| null`, so not list-only | open |
| **`exprF32Array` has no if-join rung: un-annotated `if c { f32s } else { [] }` binds an i32 local** | **17** | | | f32 only; f64 twin and annotated face run | **unfiled** |
| `u8[] \| null` as a list element or map value ([D2239](inventory/D2239.md)) | 7 | | 36 | u8 only | open |
| `[]` into an un-annotated parameter the body pins ([D2218](inventory/D2218.md)) | 6 | | | i64 f32 f64 string struct nested | open |
| a `null` stored into a `u8[] \| null` record field ([D2249](inventory/D2249.md)) | | 2 | | u8 only (a trap in the PROGRAM; run.py labels it `COMPILER TRAP`) | open |
| `u8[] \| null` as an inferred record field: `ref valtype with no interned shape` | | | 6 | u8 only; f32 twin runs | unfiled, clause 2 |
| `(i32\|null)[]` / `P[]` through an un-annotated parameter or record field | | | 23 | nullelem, struct | not ablated |
| `[]` as an inferred record field: `ref-list field element type is not interned` | | | 2 | struct, nested | not ablated |
| `let g = []` at module scope, un-annotated, assigned later | | | 9 C | all | a design question, not graded |

**Clause-1 cells by kind** (silent plus trap), with D2227's share split out because one fix
moves all of it: u8 38 (9 without D2227), i32 38 (0), i64 35 (1), **f32 52 (18)**, f64 35 (1),
string 35 (1), struct 7 (1), nested 7 (1), nullelem 6 (0). **Outside D2227 the grid holds 32
clause-1 cells, 9 of them u8 and 18 f32.** The two unfiled witnesses:

    function t() { 1 == 1 }
    const src: f32[] = [(7.5 as f32)]
    const v = if t() { src } else { [] }
    print(v[0])
    // vl run: invalid module — expected i32, found (ref $type); local `v` is declared i32

    const src: u8[] | null = [200]
    const w = { f: src }
    print(w.f != null)
    // vl run: emit error — emitProgram: ref valtype with no interned shape

## 4. The options

**(b) Close the kind strings.** Already done: `VKind` is a litunion, `_`-less `match` over it
works, nullable scrutinees work since D1898, and a SUB-domain works too — measured today, a
`type ListRep = "list" | "u8list" | …` is assignable to the full set, a `_`-less `match` over it
reports `non-exhaustive match — missing "f32list"`, and the one gap is that an or-pattern arm
does not narrow its scrutinee (return each literal from its own arm). What (b) would still buy:
a 14-member `ListRep` (or a structured `{ elem, nul }` per open ruling
`nullable-rep-rule-stated-once`), a `listRepOf(k: VKind): ListRep | null` gate, and `_`-less
matches over it at the consumer ladders (`ladder-census.py`: 56 over `VKind`, 25 with a silent
default) — up to 56 byte-identical conversions of the `kind-ladder-lint.md` kind plus the
lint's closed-set table. **It would have caught none of the rows filed today whose mechanism is
located**: those were predicate chains and integer tables, with no kind-typed subject. It does
catch the consumer half of the next new kind (a `v128` list, say) at compile time.

**(a) One producer.** `exprListRep(e, fnIx): VKind | null` answers "which list rep does this
expression produce" once — arena first (`repOfTy(nodeTyPinIxOf(e))`, where the checker recorded a
type), then the syntactic arms as the UNION of what the seven predicates see today (`IfStmt`,
`Member`, map read, empty-literal hole, capture, narrowed hole). Each `expr*Array(e)` becomes
`exprListRep(e) == "<kind>"`, so an arm added for one kind exists for all seven by construction.
Sites: 7 predicates (~238 references), the chains that call them in order (`ifExprRefKind`,
`exprListCellBuildKind`, `letInitCellKind`, `collectLocals`, `globalCellKindGo`), and the three
`nulScalarListKind*` spellings folded to one. The integer tables stay; each translation
(`mvListValKind`, `pushDestVKind`, `scalarListKindOfName`) is where (b)'s `ListRep` pays, as a
`_`-less `match` that makes a missing u8 row a compile error. Risk: order. `ifExprRefKind` tests f32 before f64 because `exprF64Array`'s arena opener claims
an f32 list; a single producer removes that hazard but must reproduce every current answer.
Proof obligation as the campaign states it (`rep-descriptor-campaign.md` §5.1): byte-identical
`tests/cases` and corpus, the two-producer oracle under `$VL_REP_SHADOW`, `rep-fuzz-check.sh`,
and this grid staying green where it is green.

**Recommended order.**

1. File the two unfiled witnesses above and fix D2227, which is 594 of the grid's 693 non-RUNS
   cells in one blocktype decision.
2. (a), `expr*Array` first: introduce `exprListRep` and move `exprF32Array` onto it (the one
   non-byte-identical step: it should close the 17-cell f32 row, graded here), then the other
   six, one byte-identical PR each.
3. Give the integer element-code tables a u8 code through that path (D2239, D2249 and the anon
   field row are its witnesses).
4. (b) last and small: `ListRep` plus the gate, converting consumers as (a) touches them.
   Order matters: converting consumers first leaves the producers that caused the rows unchanged.

Re-run: `list-kind-grid.py --run -j 6` (`--only u8,f32 --family empty-join` narrows it). Not a
gate, so red cells stay in place and a fix shows up as a cell turning green.
