# Workboard — the itemized queue

The ACTIVE queue, ranked. `ROADMAP.md` owns strategy and the long tail; this file
owns what is scheduled, what is in flight, and what was measured away. One line
per item, each with an anchor and a measured population, so nothing here needs
re-derivation before it can be picked up.

**Priority bands, as set by the owner:**

1. **Destringify types** — stop representing types as raw strings; stop parsing or
   building strings to represent them. Efficient, type-safe data structures instead.
2. **Webcraft asks** — the consumer-driven requirements.
3. **Everything else.**

Performance is a standing concern across all three bands, compile time and runtime
both. So is the language's chief design aim: **near-zero annotations, fully typed,
likely-error behaviours blocked**. An item that forces an annotation the inference
could have supplied is a defect against that aim, not an ergonomics nicety.

---

## The rule this board exists to enforce

Every number here carries its denominator, and every claim carries an anchor.
This programme's recorded history is that **three consecutive slices found the
filed unit or number wrong**, and that ranking by the wrong unit inverted the
order (#1327: 80.3% of "reaches" were memo hits, so 15,901 reaches were 3,031
parses). Three classes are kept apart on purpose:

- **MEASURED** — re-derived on a current base, with its denominator.
- **BRIEFED** — filed but not verified since the base moved. Re-measure before scheduling.
- **REFUTED / EXHAUSTED** — measured away. Recorded so it is not re-opened.

A measured negative is a result. "No rung here" closes an item as legitimately as
a fix does.

---

## In flight

Nothing. The queue is empty; pick from the bands below.

## Landed this cycle

| item | PR | result |
|---|---|---|
| **B1** checker-side parse census | #1354 | **CLOSED, measured negative** — 17,832 of 17,834 are tree walks |
| **B1a** `is` triple resolution | — | **SHIPPED** — the mint-free half is exactly the bare-NAME half, so it is separable; 12,931 of 12,931 taken on the compiler's own source, arena unmoved on 1,777 files |
| **B2** TRANSP residue | #1373 | shipped; found a THIRD down-cell the filing lacked |
| **B3** mint column | #1372 | **BLOCKED-REP behind B5** — 206 of 220 mint; B5's blocker is now RE-ATTRIBUTED (canon pass, not mono) and awaits an owner ruling |
| **B4** `recordMvValTyIx` | #1366 | shipped; 725 calls, 0 parses, 0 mints |
| **B9a/B9b** routings + endpoint | #1375 | shipped; the endpoint row was **mis-identified**, divergence deliberate |
| **B9** W13 floor | #1372 | re-derived: **12, not ~60** |
| **C1** union box melt | #1363 | shipped; 1.36x default / 1.68x `-O` |
| **C2** backing-pointer LICM | — | **CLOSED, measured negative** — anchor stale; emitter reaches 1 of 7 reads (2.9%); binaryen's `licm` is top-level-only; the axis is the inlining budget, not the view count |
| **C6** `match` binding in value position | #1367 | shipped; unblocked `if` too |
| **C9** webcraft doc staleness | #1351 | shipped |
| **C10** names section | #1351 | **resolved** — consumer passes `--names`; default flip costs the seed +5.3% |
| **D1** litunion alias `is` | #1353 | shipped |
| **D2** numeric literal unions | #1365 | shipped; a fourth rep with its own lowering |
| **D5** storage-vs-identity exemption | #1362 | shipped; 6 UP, 0 DOWN |
| **E1** generic fn as a value | #1364 | shipped; closed a live invalid-wasm emit |
| **E2** inferred map VALUE type | #1359 | shipped; the axis was the value, not the key |
| **E2r** inferred map through a call / a literal field | — | shipped; **139 of 220 oracle cells fixed, 176/176 byte-identical to the annotated twin, invalid-wasm 36 → 0** |
| **E3** `unconditional-recursion` lint | #1368 | shipped; half (a) left as a language ruling |
| **F5** `modScan` re-scan | #1371 | shipped; **-4% CPU** on the self-compile |
| **G2** closure-unpack hoist | #1374 | **REFUTED** — the filed 10.6x is P2's saving counted twice |
| **H2** perf gate phase 1 | #1370 | shipped; SHAPE_TABLE, 22 → 35 tests |
| **H4/H5** doc truth-up | #1358 | shipped |

Also landed: #1344 (brand-only union arms — owner-confirmed narrowing), #1345
(`vl test` scheduling witness), #1348 (comment policy), #1349 (dependabot),
#1350 (this board), #1355 (four dead agent-environment claims), #1356
(`modTypeRenamed` — behaviour difference REFUTED), #1360 (fourth dead playbook
gate), #1369 (A5b/A5c/A5d literal-inference rows).

**Cycle scorecard: 9 filed claims refuted or corrected by measurement**, five of
them numbers or units, four of them framings. Two were the orchestrator's own.
C2 contributed a framing (the descriptor reload was filed as "two views of one
width, GUFA cannot fold" and is really "the inlining budget did not melt the
descriptor") and a stale anchor.

---

## Band 1 — destringify types

**State of the programme.** The EMIT side is at its floor: **1,846 `annotResolve`
parses**, and the whole name-shortcut route is **EXHAUSTED as of #1334**. All three
surviving emitter rows are mint-bound — row 4 is 425 of 426 minting, row 2 is 402
of 402, and row 1's arena-neutral remainder is 111 of 126 the `FView`-refuted rung.
There is no fourth rung to add.

**AND THE CHECKER SIDE IS NOT A SECOND FRONTIER — the two numbers the programme
ranked against each other were DIFFERENT UNITS (D-CHECKPARSE).** The checker's
population is `tsToTy` walks over the parser's spelling TREE, not string parsing:
**17,832 of 17,834 are tree walks**, the string parser `nameToTy` is entered **54
times corpus-wide (23 outermost)**, and **0 times over the compiler's own 39k
lines**. The emitter's 1,846 are string parses by construction (`root = -1` at
every site). So "2,963 checker parses beats 1,846 emitter parses" compared tree
walks to string parses.

**On the programme's own question — stop representing types as strings — the
checker is already done: it reads 23 type STRINGS across 1,737 files.**

Two instrument findings worth carrying. The published row re-derives at 3,093 (vs
2,963, +4.4%, `neg` identical at 15) — but it is **17.3% of the real population**:
only 4 checker sites use the memoized `resolveAnnotTs`, while **11 more call
`annotResolve` directly, carry no memo, and parse on 100% of their 14,741
reaches**. Every instrument in the programme sat at the memo, so 82.7% of the work
was never in a column. Controls: 0 unattributed records of 31,911, four
independently-built probe binaries agreeing, `T.tys` grew across 0 of 13,736 hits.

The counter-datum this reinforces: lowering the compiler's own 39k lines, **the
entire emitter parses 24 type spellings and the checker 0**. The open populations
are corpus-wide aggregates over small files.

**A THIRD instrument finding, from B4: a scorecard row is a (population,
CHOKEPOINT) pair, and shipping a rung moves the chokepoint without moving the
work.** `recordMvValTyIx` was filed at 685 `resolveAnnot` reaches and re-derives
at 411 — a 40% fall while the row itself GREW, to 725 calls. Its base predates
both rungs under `fieldElemTyIxOfName` (#1331 rung 1, #1332 rung 2), and the
arithmetic closes exactly: `725 − 40 rung-1 − 274 rung-2 = 411`. Any row censused
before those two PRs now under-reads by whatever share of it is a declared name
or a bare primitive. **Re-derive in CALLS as well as reaches** — a rung-1 answer
is still `cUserTypes[nm]`, which is the terminal condition verbatim.

**A FOURTH, from B3: THE TWO RUNGS ATE THE ARENA-NEUTRAL PARSES, so the mint gate
#1331 refuted as a general rule is now true of nine parses in ten.** Mint-free
emitter parses were **1,342 of 3,031 (44.3%)** at #1331 and are **166 of 1,915
(8.7%)** at `6ef19f67`. The fall is the rungs' own documented take (219 + 12 +
803 + 151 = 1,185 parses; `1,342 − 1,185 = 157` against 166 on a 22%-larger
corpus). A rung that skips the first resolution of a declared name or a bare
primitive is arena-neutral BY CONSTRUCTION — somebody else minted that index — so
the shortcut programme has been harvesting exactly the safe parses, and what is
left is by selection the parses that mint. **Any new row claiming arena-neutrality
must name the mechanism; the base rate is 8.7% and falling.**

**A FIFTH, from B1a: WHEN A ROW'S BLOCKED HALF IS DEFINED BY A RUNTIME PROPERTY,
CHECK WHETHER A STATIC ONE PREDICTS IT EXACTLY — that is the difference between a
row filed PARTLY TAKEABLE and a row shipped.** B1a's takeable half was defined as
"the reads that mint nothing", which is only knowable after the call. It is the
same set as "the spelling tree's ROOT KIND is `TS_NAME`" — 2,878 parses, 2,878
mint-free, 0 minting, and 12,931 of 12,931 on the compiler's own source — one
field of a node the caller already holds. **And a call whose measured `ΔT.tys` is
0 needs no mint-ORDER argument at all**: it is not in the mint stream, so removing
it cannot reorder what is. B3's hazard is real only for a population that mints,
and its own is 206 of 220. The cheapest way to price the half you are refusing is
to BUILD it: B1a's take-all control moves `T.tys.length` on **229 of 1,735 files
while moving 0 wasm bytes**, which is both the gate confirmed and the proof the
arena channel was awake.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| ~~**B1**~~ | ~~Checker-side parse census~~ | `destringify-types-program.md` D-CHECKPARSE | **CLOSED — measured negative.** 3,093 of 17,834; **17,832 of 17,834 are TREE walks**; `nameToTy` entered **54 times corpus-wide**, **0** over the compiler's own source | **CLOSED** | — | — |
| ~~**B1a**~~ | ~~`is` triple resolution~~ | `destringify-types-program.md` D-ISBANK | **SHIPPED, and the takeable half was SEPARABLE.** Re-derived: family **7,187 = 37.9%** of checker parsing (**19,398 = 88.0%** on the compiler's own source); the three READERS are **4,851 CALLS = reaches = parses** (25.6% / 58.7%), bank covers **4,849**, **2,912 of 2,912 mint-free reads index-identical, 0 disagreements**, **1,937 of 1,937 minting reads disagree, 0 agreements**. The split is SYNTACTIC — `tsKind[root] == TS_NAME` is **2,878 parses, 2,878 mint-free, 0 minting** (12,931 of 12,931 on the compiler) — so the mint-free half is gated BEFORE the call. Corpus A/B **0 of 1,777 rows on wasm bytes, `T.tys.length` and diagnostics**; the TAKE-ALL control moves `T.tys.length` on **229 of 1,735** while moving **0** bytes. Reaches 18,972 → 16,096 corpus, **22,031 → 9,100** on the compiler. **+99 B** | **CLOSED** | — | — |
| **B2** | **TRANSP residue** — add `genAppNameOfTy` under `structNameOfTy` so `type Y = Box<i32>` renders `Box<i32>` | `typecheck.vl:8945`; blocker `emit_classify.vl:11474 fieldTypeCode` | rung is **BUILT and MEASURED**: B2 20→11, B3 120→111, moves nothing on the six-channel corpus, costs ONE cell | OPEN — both halves of the old filing REFUTED | M+S | med |
| ~~**B3**~~ | ~~1a-v `pushFieldRow` — per-field-CODE peel table~~ | `destringify-types-program.md` D-FIELDROWMINT | **MEASURED NEGATIVE.** Re-derived at **3,583 CALLS** (2,510 empty-name guard · 185 rung 1 · 215 rung 2 · **673** `resolveAnnot` reaches) / **220 parses** (11.5% of the emitter's 1,915) / **206 of the 220 MINT (93.6%)**, and on the subset `pushFieldRow` can actually reach, **83 of 84 (98.8%)**. The 14 mint-free are 6 generic re-applications + 8 `#anon` failures, 13 of them outside `pushFieldRow` | **BLOCKED-REP** — behind **B5** | — | — |
| ~~**B4**~~ | ~~`recordMvValTyIx` routing~~ | `destringify-types-program.md` B4 | **SHIPPED.** Re-derived at **725 CALLS** (40 rung-1 · 274 rung-2 · **411** `resolveAnnot` reaches) / **0 parses** / **0 arena mints**; dual-write **725 of 725 index-identical**, corpus A/B 1,743 files × 7 channels **0 rows moved**, **+25 B**. The filed 685 reconciles as `725 − 40 − 274`: the row grew, the CHOKEPOINT moved | **CLOSED** | — | — |
| ~~**B5**~~ **Mono-clone `nodeTyIx`** | **THE FILED MECHANISM IS REFUTED — it is the CANON PASS, and the item is renamed `canonTyIx`** | `typecheck.vl` `canonEmitTypeNames` (`n.tyName = c`); reader `emit_collect.vl:3593`; `destringify-types-program.md` D-REPELEMTY §3a | **RE-DERIVED off `494adc0d`: 61 disagree of 1,400 covered / 1,407 reaches / 7 uncovered.** All 61 are PARSER nodes in **five files**; **57 sit on a node whose `tyName` `canonEmitTypeNames` rewrote in place** while `nodeTyIx` kept the pre-canon type; the `@<index>` tell is `repElemKeyGo`'s identity arm over UN-WIDENED `TyLit`s, not a `TyVar` from a clone. **0 come from `emit_mono`** (every synthesis routes through `synthTypeRef` → `recordClonedNodeTy`; TYPED-IR P1 already measured 729/729). **STRUCTURAL FIX BUILT AND MEASURED**: a lockstep `nodeTyIx` write at canon closes **55 of 61 losing 0 agreements** (vs the old `repElemKeyPortable` guard's 59→8 at a cost of 109); residue 6 = 2 shared generic-alias declaration nodes (both routes wrong) + 1 `refArrElemName` MIS-CUT where the arena is right. Suites identical both ways (cases_wasm 1,735/0/7; align 1,742/0/0 gated); wasm sha256 **4 of 1,805** move, all four still oracle-clean. **NOT SHIPPED: `T.tys.length` moves on 61 of 1,528 programs** (monotone append, +0.35%, 0 shrink) — owner ruling. Safer variant: a separate `canonTyIx` column instead of overwriting `nodeTyIx` | **ANSWERED — awaiting owner ruling**; B3 and B6's node-bank residue unblock behind it, and D-B6THREAD §2 prices that residue: the same split is **215 of 299 on index / 13 of 299 on key** at `collectAnnShapes`, one peel further out | M | **HIGH** |
| ~~**B6**~~ | ~~Arena-index threading~~ (D-INLINESHAPETY / D-REPELEMTY) | `destringify-types-program.md` D-B6THREAD | **RE-DERIVED, one route SHIPPED, the rest BLOCKED-REP.** The discrepancy was two UNITS of one population: the interner mints **1,064** rows, **14** take the hint and **1,050** reach `resolveAnnot` — `14 + 539 cUserTypes + 1,050 + 130 = 1,733` CALLS. **The "18" is unsourced**: #1334 credits it to #1331, which never censused this site; the only census (D-INLINESHAPETY §1a) says 14, and 14 is what the hint answers on this base. Population left at row 2 = the NODE bank at `collectAnnShapes`: 806 of 874 site-1 mints are node-rooted, **300 uncut**, and threading them MIXES VOCABULARIES — **215 of 299 disagree on index, 13 of 299 on `repCanonKey`** (vs B5's 61 of 1,400 one layer in), 4 witnesses canon-rewritten + 9 `TyLit`-by-index; **132 of 300 MINT**, so it moves the arena too. **SHIPPED instead: the kind-6 vals ref-list slot**, filed blocked on a hoist that does not exist — `vTy` is computed above the whole block. 196 of 200 entries banked, **196/196 key-identical, 196/196 `ΔT.tys = 0`**, both minting entries in the declining 4. `repElemKeyOfNameTy` 3,910 → **3,714 (−196)**, three control rows unmoved; per-file A/B **0 of 1,808 on wasm sha256 AND 0 of 1,808 on `T.tys.length`**; +25 B | **CLOSED** for the shipped route; the node-bank residue stays **BLOCKED-REP behind B5** | — | — |
| **B7** | **W9 — canon `renderEmit(ty, ctx)`** | `typecheck.vl:9524`, `:7985`, `:6723` | **B2 = 176 / 7,201 = 2.44%**; gate 4b admits **4 distinct spellings corpus-wide** | **DESIGN-BLOCKED** — canon is name-in/name-out by contract | L | high |
| **B8** | **W10 — `nameToTyReal`**, the checker's second descent | `typecheck.vl:6184` | a SOURCES problem; the "~150 ops" headline **predates the #1327 unit correction** | OPEN, **re-derive** | L | high |
| ~~**B9**~~ | ~~W13's ~60 single-writing floor~~ | `destringify-types-program.md` D-FLOORREAD | **RE-DERIVED BY READING THE BODIES. It is not 60.** Site population **98 → 38** (five modules at zero); those 38 are **22 distinct operations, 16 copies**; **8 of the 22 re-write a home that exists** — three in files that already IMPORT it (`emit_mono` x2, `emit_classify` x1) — and 2 are declines against one. **Floor = 12**, of which 3 are declines the leaf header records, leaving **9 unhomed grammars with no filed reason**. `tyname.vl` itself is **35 bodies / 16 operations** (the CUT is ten one-line `slice`s) | **CLOSED** | — | — |
| ~~**B9a**~~ | ~~the three FREE routings D-FLOORREAD found~~ | `destringify-types-program.md` D-FREEROUTE | **SHIPPED, and only TWO of the three were free.** `:2194`→`arrElemNameRaw` and `:3438`→`fnRetTextOf` are answer-identical on every input (the second provably: the leading-space skip commutes with the arrow cut). `:2185`→`nameIsArray` ADDS the `']'` conjunct, so it is a strict TIGHTENING; its divergence class (a name ending `[` with no `]`, i.e. a quoted literal such as `"a["`) cannot reach the site — the checker rejects a non-array at a `T[]` param (`expected T[], got "["`), and the tightened reject reuses the site's own message | **CLOSED** | — | — |
| ~~**B9b**~~ | ~~operation 4 is written twice and the two answers DIFFER~~ | `destringify-types-program.md` D-FREEROUTE | **MIS-IDENTIFIED, and the disagreement is UNREACHABLE.** Not one operation written twice: `emit_base.tyGroupWrapsWhole` and `tyname.parenEnclosesWhole` are two NAMED predicates over one ladder, each correct for its own consumers (SPAN tests want never-closes ⇒ TRUE, PEELS want FALSE — a group whose closer does not exist has no final character to give up), and three in-tree headers already say so. The copy was `typecheck.vl:6285`, `parenEnclosesWhole`'s body verbatim; routed to the predicate's home. Reachability: an unclosed paren in a type annotation is a **parse error** (`expected ) but found end of line`) and every synthetic producer wraps balanced text (`"(" + inner + ")"`), so no input reaches either reading of the never-closes case | **CLOSED** | — | — |
| ~~**B10**~~ | ~~Latent defect — only the NEGATIVE memo carries `cUserTypesVer`, so a positive entry survives a `cUserTypes` rewrite~~ | `destringify-types-program.md` D-NWBRANDKEY | **MISDIAGNOSED — closed.** Nothing is stale: `cUserTypes` has FOUR writers, three in pass 0a and one add-only, so no declared name's entry ever changes. The two indices are the newtype BASE and `nwBrand`'s second `addTy` over the same `Ty`, both current, differing in rep key only because only the base owns an `sNames` row. Re-derived at **28 disagreements in 1,034** covered reaches (21/914 memo-HIT), 7 witnesses, all `new` structs; `repRowOfName` reproduces at 0/66, `repNameCanonKey` 0/294. **The proposed stamp, built and run: 0 of 28 moved**, 357 stale hits re-resolved of which **12 re-MINT a structurally identical duplicate** (the arena runaway the memo exists to close), `T.tys` moved on **5 of 1,773** files, wasm bytes **0 of 1,773**. Inertness holds but not for the filed reason — rung 2 answers **225 in 3,083**, yet **0 of 2,607** resolved-key FIND reaches is on a disagreeing name | **CLOSED** | — | — |

**EXHAUSTED / REFUTED — do not schedule.** The name-shortcut route entire (#1334);
row 2 `sTyIxOfNameTy` (0 of 402 arena-neutral, 282 distinct spellings for 402
parses); row 1 `repElemKeyOfNameTy` (residue 15 parses = 0.8%); row 4's canon
recorder (refuted twice, most recently on REP grounds — every disagreement but two
is a `TyLit` read as its `TyPrim` base); the primitive-ARRAY rung (70 of 70 mint);
1a-i's two NODE-holding mints (refuted twice); `nameIsRefArray`; bucket 3 (shipped
#1336); the G class (closed by #1274); LINSOFT (closed); W1–W8, W12, W14.

**Refuted CHECKER-side by D-CHECKPARSE.** `primTyOfName` covers 5,105 with 0
disagreements but buys nothing — `tsLeafTy`'s FIRST LINE already *is* `primTyOfName`,
so there is nothing between caller and answer to skip. `cUserTypes` is refuted much
harder here than at the emitter: **345 disagreements in 3,135 (11.0%)** at 13 of 16
sites, against the emitter's 28 in 1,034, over two mechanisms — the newtype brand and
the transparent alias — plus a **live type-parameter binding** (`tsLeafTy` asks
`tpEnvTyOfName` before `declaredTyOfName`) that the emitter cannot have. The first of
those mechanisms is the emitter's too: D-NWBRANDKEY shows every one of its 28 is a
`new` struct's base-vs-brand pair, not the stale memo B10 filed.

**Standing soundness rule.** A newtype over a struct separates arena-index identity
from rep identity; any future rung here must be graded against it. **The fuzzer is
structurally blind to it** — the grammar emits no `new` type (820 covered fuzz
reaches, 0 key disagreements), so fuzz agreement is not evidence for this class. The
hand-built population is
`tests/cases/memory/newtype-struct-reflist-key-population.vl` (two same-shape
newtypes, their plain declared twin and a bare inline shape, at four ref-list element
positions) plus the `newtype-struct-*` cases in `tests/cases/maps/`.

---

## Band 2 — webcraft asks

**State.** More closed than the requirements doc reads. All of P0, plus P1.1, P1.4,
P1.5, P1.6 shipped; P1.2's fusion half and `T.size` and the `Rows<R,A>` brand
shipped (#1317 / #1329 / #1335); `match` phase 2a and 2b shipped. What remains is
small and concentrated.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **C1** | **P1.3 — union box must melt when the payload is READ** | `unboxed-union-rep-design.md` §12.4 / §12.7 | phase 1 **#1322** (78 sites over 76 functions; **wash** at plain `vl build`, **1.76× at `-O`**); if-expr **#1337** (1.67× at `-O`); binding sink (1.36× default / 1.68× `-O`). The `let`-on-two-branches remainder re-derived: **4/4/4 with the payload READ**, and the blocker is Heap2Local's single-definition requirement, not the emitter | **CLOSED — measured negative.** Three sinkable spellings ship; the fourth needs a REP change (escalated, not done) | M | med |
| **C2** | **P1.4 follow-on — backing-pointer LICM** for view descriptor fields | ROADMAP `:409` (the filed `:949` was STALE — it points into `A-infer-map-value`); `buffer-design.md` §M4 | re-derived: `axpy-view` **1.725 ns/elem at `-O3`** vs a byte-identical hand-hoisted twin **0.573** = **3.01×**; split re-derived on one-axis-apart modules as reload **90.3%** / fence **9.7%** | **REFUTED — measured negative.** Emitter can reach 1 of 7 reads (**2.9%**); binaryen's `licm` moves only TOP-LEVEL loop-body statements; the axis is the INLINING BUDGET, not the view count (`scale-seedtwice`: one view, one column, **3.05×**). Route around = `--always-inline-max-function-size=60` (0 reads, 1.736→0.636 ns) at **+82% size / +127% opt time** on the compiler → belongs to **C3** | L | med |
| **C3** | **P1.3 — optimization defaults** | ROADMAP `:353` | three-rung sweep separates `OPT-LOSES` (7 rows) from `O3-WORSE-THAN-O` (`sort-heap` 854/**648**/837). **C2 (#1403) adds a SECOND knob to the same ruling**: `--always-inline-max-function-size=60` melts the view descriptor outright — `axpy-view` **1.736 → 0.636 ns/elem** with the kernel module 113 B *smaller* — but costs the 1.16 MB compiler module **+82% bytes (955,265 → 1,740,871)** and **+127% wasm-opt time (22 s → 50 s)**. `flexible=60` is the cheap half: 1.199 ns, +28% compiler size. So the rung default and the inline budget trade the same way — a big runtime win for consumer kernels against build cost on large modules — and should be ruled on together, not separately | **OWNER RULING** `O-release-rung-default` | S in code | moves published guidance |
| **C9** | **webcraft doc staleness** — P1.2, the `wasm-opt` soft-no-op clause, `match` phase 2 | `webcraft-requirements.md` :309/:371-396, :446, :806 | three blocks describe shipped capability as open | IN FLIGHT | S | none |
| **C10** | **Names section** — the ask says "keep emitting"; it is **opt-in and off by default** | `emit_sections.vl` `gEmitNames`; `--names` | default build **167 B, no names**; `--names` **258 B**. Flipping the default costs the seed **+60,297 B (+5.3%)**: 1,137,213 → 1,197,510 | **Resolution: consumer passes `--names`.** Do NOT flip the default | S (doc) | none |
| **C5** | **A16 — litunion correctness in MIXED unions** | `webcraft-requirements.md:823` | **81 of 244 grid cells broken, 42 silent wrong answers, all `vl check`-clean** | **BLOCKED**, 2 owner rulings | M | — |
| **C6** | **`match` residuals** — a binding arm cannot be a `const` INITIALIZER | ROADMAP `:1196` | was `emitProgram: if-expression arm is not a single value`; the grid says the BINDING broke value position, not `match` (statement + tail already lowered it, the `if` twin failed identically) | **DONE** — the if-expression arm gained a PRELUDE, so `match` AND `if` both lower in binding-init and `return` position; argument position + a TOP-LEVEL binding stay loud rejects | S–M | low |
| **C7** | **B15a — default / optional params** | ROADMAP `:991` | **the `$fnsig` sequencing constraint was NOT live** — `fnSigKeyOf` keys off the DECLARATION's parameter list, never a call site's arg count; the call normalization runs before mono/collect and classifies its callee with `emitCall`'s own `fnIndexOfInScopeChain` | **DONE** — `p: T = <literal>` and `p?: T` (sugar for `p: T \| null = null`) parse/check/lower; a function VALUE keeps full arity. Literal-only, annotated-only, trailing-only, no type-param mention. UFCS stays exact-arity by ruling | M | none |
| **C8** | **Readonly fields / A9 variance** | ROADMAP `:780`, `:782` | zero variance code exists in `compiler/`; **`Cat[]` → `Animal[]` is `vl check`-clean and emits invalid wasm, not even pinned as xfail** | **BLOCKED** on N5 | L | high |

**Open question for the consumer, not for us.** A16 asks webcraft directly whether
the mixed-union enum pattern is real or hypothetical; it is unanswered and is the
cheapest thing in this band to resolve. Same for the `getF32At` scalar accessors
(**zero compiler lines, 3.0× on the fenced two-view kernel**) — filed RECOMMENDED
AGAINST *until a consumer actually asks*.

**Non-asks — do not build:** exceptions/async, separate compilation, UTF-8 strings,
WASI, std math/trig, in-language GC knobs, SIMD (not requested), branch hinting.

---

## Band 3 — everything else

### 3a. Correctness

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **D1** | **Litunion with no alias of its own** — `u is A` over `A \| B` always answered FALSE | `overlapping-arm-defects.md` "the litunion remainder" | **CLOSED.** The receiver is a member STRING, not an atom (`(param (ref $1))` in the disassembly) — the filed classifier gap did not exist; the string rep had no `is` lowering. Added the string-equality membership ladder | S–M | **LOW** |
| **D1a** | **Narrowed CONSUMPTION of a string-repped litunion** — `if u is K { const r: K = u }`, or passing the narrowed value to a `K` param | same section, "What the cut does NOT reach" | invalid wasm before and after D1: the narrowing rebinds to `K`, whose slot is an ATOM. A valtype-ladder hole, the inline-spelling PARAM/FIELD work | OPEN | M | med |
| **D1b** | **`string` receiver tested against a litunion** — `function f(s: string) { if s is A … }` | same section | **CLOSED.** The filing was a third of it: a 233-cell grid found **82 silently-wrong cells, not 16** — the plain `string` receiver (const FALSE, every origin and every test form), the un-annotated monomorphized param, AND a value-union BOX whose one string-repped arm is not the tested type (`string \| i32`, const **TRUE** — the opposite sign, unfiled). One membership ladder shared with the bare-literal spelling (`emitLitMemberEq`) took **82 → 0**: 77 correct, 5 to the loud non-place floor. Fixture `is-litunion-over-string-receiver.vl` scores 15 wrong lines without it | **CLOSED** | — | — |
| **D1c** | **RAW `string \| null` receiver tested against a litunion** — `function f(s: string \| null) { if s is A … }` | measured beside D1b | **LOUD, not silent**: 16 of 16 cells `vl check`-clean then `emitProgram: `is` names a type that is not a union variant`. Blocked on an owner ruling, not on codegen: the bare-literal twin `(string \| null) is "x"` **TRAPS on a null receiver** (measured), so membership cannot delegate to it without spreading the trap, and answering FALSE for null at both spellings changes shipped `is` semantics. A receiver NARROWED by `!= null` is already correct (D1b) | OPEN — needs a ruling on `is` over a null receiver | S | low |
| **D2** | **Numeric literal unions** — `tyIsLitUnion` requires every member `litKind == "str"` | `typecheck.vl:18621`, `:19019` | the litunion machinery is **string-only by construction** while VL models str/flt/int literals | OPEN — **do NOT bundle with D1** | M | med |
| **D3** | **ROOT A** — `emitIs` compares ONE tag | `wasmEmit.vl:1877`, `:1832` | **49 of 64 cells**, but **not re-derived since #1343/#1341** — treat as an upper bound | OPEN | L | med-high |
| **D4** | **Generic alias application as a union member** — `type U = Box<Box<i32>> \| i32; const u: U = { v: 5 }` is ACCEPTED | suspect `typecheck.vl:9054` | three controls localise it exactly; **defect confirmed, mechanism NOT** | OPEN, mechanism blocked on W9 | M–L | med |
| **D5** | **Struct arms differing only in a shared STORAGE code** — `{a:i32} \| {a:boolean}` | `emit_collect.vl:4498 variantFieldCodesEq` | `boolean`/`i32` share a storage code, so the pair is treated as the layout-equal twin the exemption exists for | OPEN, pinpointed | S | low-med |
| **D6** | **Function-type union arms** — every function-typed arm of a union shares ONE box tag, so `x is F` is a constant TRUE across them | `overlapping-arm-defects.md` "D6 … is MEASURED"; `emit_classify.vl unMemAtomKind` (`if t is TyFunc { return 11 }`), `emit_rep.vl scalarTagOfKind` | **MEASURED, 380 cells + 36 controls: 77 RUN-WRONG, of which 72 are this defect** (filed as 4). Two-fn-arm population 158 cells / 72 wrong / 86 masked (every masked cell's inverted twin moves); **all 11 receiver forms flat**, both spellings flat, **0 CHECK-REJECT**. Every non-function partner arm is CORRECT (161 of 166), and `F[] \| G[]` discriminates — the reflist band keys on the element type, which is what proves the emitter HOLDS the signature and only the bare arm's tag discards it. The filed "separate table" is refuted by the disassembly (both arms emit tag `11`). Silent: `const y: F = x` over a mis-narrowed `G` runs; the trap only comes at the call | OPEN, filed not fixed | M–L (table-index membership, needs a deferred elem-segment patch) / S (loud floor — **0 corpus files** carry a two-fn-arm union) | med — the floor costs the 86 masked cells their compile, so it is reject-parity work |
| ~~**D7**~~ | ~~`%` with a FLOAT operand emits invalid wasm~~ | `emit_base.vl:552`/`:591`, `wasmEmit.vl` | **SHIPPED #1382 — REJECTED, not lowered.** Full grid 272 cells: BROKEN **6 → 0**, CLEAN unchanged at 128, REJECT +6. The filed lowering `a − trunc(a/b)*b` is **not fmod** — it disagrees with Rust's `f64 %` on **86,066 of 200,000** random pairs (43.0%), so shipping it would have traded a loud reject for silent numeric corruption. Exact remainder belongs as a float intrinsic later; rejecting stays correct if that lands | **CLOSED** | — | — |
| ~~**D8**~~ | ~~Nested function that CAPTURES~~ | `emit_classify.vl` scalar classifiers, `capturedKindOf` | **SHIPPED #1383 — and the filed mechanism was WRONG.** Not the value ABI's i32 param default: the env field was already `(struct (field f64))` with the right value, and the only wrong byte was a spurious `f64.convert_i32_s` on the **read**. Re-gridded at **352 cells** (a 4th annotation-variant axis the filing lacked); invalid-wasm **52 → 8**, and all 8 residues were D7's `f64 %`, now also closed | **CLOSED** | — | — |
| **D9** | **`s?.f is T` over an OPTIONAL-CHAIN receiver answers a constant FALSE** where the field is a NICHE nullable or a ref-element array | `overlapping-arm-defects.md` "D9 is FILED"; `emit_mono.vl monoArgTyName`'s final line (a bare `"i32"` catch-all), trusted by `wasmEmit.vl monoStaticIsResult` | **MEASURED, 104 cells (13 field types × 2 builds × 4 receiver forms). The filed mechanism is REFUTED**: the `sFieldTypeAt == 16` gate is in `isStrTagUnionNameOf`, which supplies a NAME to a floor the guard never reaches, and this is NOT #1380's remainder either (a niche tested type reaches no membership arm, so `unionEqOperandOk` never runs). The guard is `i32.const 0` in the disassembly. **D9 proper is 12 cells** — 6 field shapes × 2 chain depths, the chain-depth axis FLAT. The CORRECT column is every BOXED field (`i32\|null`, `i64\|null`, `f64\|null`, `string\|i32`, `i32[]\|string`), where `exprUnion` short-circuits the fold. **The blocker is one layer down**: `s?.f != null` — the sibling lowering a fix would route into — is itself WRONG for the string and litunion niches (a stored `null` answers `yes`) and right only for the struct-ref niche | OPEN, **filed not fixed** | M–L (the niche-leaf chain read, a rep decision across 5 niche kinds) / S (loud floor — **0 corpus files** carry an `is` over a chain with a niche field) | low — fails closed; the floor costs 7 masked cells their compile, so it is reject-parity work |
| ~~**D10**~~ | ~~A bound map read of a niche-nullable value emits INVALID WASM with no `is` in the program~~ | `overlapping-arm-defects.md` "D10 is CLOSED"; `emit_collect.vl mapValIsClosure` + `collectFnValUse` | **SHIPPED — and the `\| null` was a coincidence of the witness.** 300-cell grid (12 value types × nullable/plain × 3 read forms × 3 store states × called/uncalled): **3 INVALID-WASM, all `fn`-valued, and one has no `\| null` and no store at all.** The trigger is *the map's VALUE CELL is a closure and the program constructs no closure*, so `fnValUsed` stays false and the bound local claims a heap index no closure struct occupies. An 18-cell position grid moved 8 (6 INVALID-WASM + 2 loud `no interned signature`), 0 DOWN | **CLOSED** | — | — |
| ~~**D11**~~ | ~~A degenerate ONE-member union (two aliases with the same structure) breaks `is`~~ | `overlapping-arm-defects.md` "D11 is CLOSED"; `wasmEmit.vl monoStaticIsResult`, `typecheck.vl tyRenderSoftensLits` | **SHIPPED — and the union was the witness, not the mechanism.** The fold compared a CANONICAL receiver name against the RAW tested spelling, so a transparent alias never matched itself: `type A = i32; function p(x: A) { if x is A … }` printed `no` with **no union in the program**. The semantics question is answered by `types/struct-union-same-shape.vl` — an alias IS its base, so TRUE. 128 cells **77 UP / 0 DOWN**, plus 4 UP on trivial-`is` probes and 2 on newtype controls; every cross-type brand cell still CHECK-REJECT. Still open on the same grid: the MAP twin (10 of 12, D9's `"i32"` catch-all) and the FUNCTION twin (12 loud, D6's decision) | **CLOSED** | — | — |

| **D12** | **A literal-union → `string` materialisation in a function's TAIL EXPRESSION emits INVALID WASM** — `function f(k: K): string { k }`, where `K` is a literal union, compiles clean and produces a module that will not instantiate: *"unknown local N: local index out of bounds"* | the atom→string lowering (the `select` chain over the union's pooled literals) vs. the tail-expression return path; surfaced by F2, which routes every kind spelling through one such function | **MEASURED, 5 spellings of ONE semantics, on the published seed** — BROKEN: `{ k }`, `{ const s = k \n s }`, `{ const z = 1 \n if z == 0 { print(0) } \n k }`, and the un-annotated `function g() { toks[0].k }` (which also mis-infers `string` rather than the union). CORRECT: `{ return k }`, and `{ if k == "A" { return "aa" } \n k }` — i.e. an earlier explicit `return` in the same function makes the tail spelling work, which is what points at a scratch local the materialisation uses but does not reserve. Not F2's doing: it reproduces on master's seed with a 4-member union and no compiler source involved. F2 works around it (`kindTag` spells the explicit `return`, with the reason at the site) | OPEN, **filed not fixed** | S–M | low — fails LOUD at instantiation, never silently |

| ~~**D13**~~ | ~~**An INFERRED (un-annotated) return of a literal union emits a rep the call site does not consume** — `function F(k: K) { return k }` over a `type K = "A" \| …` is `vl check`-clean and produces a module the engine refuses; adding `: K` fixes it~~ | `typecheck.vl variantBoxUnionRetName` (the `psum` arity guard) + its two name consumers, `emit_collect.vl collectFns`' A20 kind ladder and `wasmEmit.vl emitReturnValue`'s `retUNm` seed | **SHIPPED — and it is NOT D12's remainder: it fails with the `return` keyword, and re-measured on top of #1407 it is unchanged. D12's "5 of 9" was a lower bound by an order of magnitude. Measured 236 cells** (return type × returned value × function form × what the CALL SITE does) **+ 18 shapes**: invalid wasm **61 → 0** and **16 of 18 → 0**. Per axis, inferred cells only: the function-form grid **21 of 42 → 42 of 42 correct**; the returned-value grid's twin-OK denominator **35 of 49 invalid → 45 of 49 correct**; the return-annotation grid's inferred row **5 of 8 → 8 of 8**. The CALL-SITE axis is **FLAT** — all 7 uses (print / `==` / `is` / annotated binding / bare binding / argument / discarded) broke and all 7 are fixed — so the filed "the call site determines whether the mismatch appears" is **refuted**: the callee's functype was already the box, so even an UNCALLED and even a DISCARDED result emits the invalid module. The mechanism is one predicate: `variantBoxUnionRetName`'s `members.length < 2` guard counts ARENA members, i.e. BEFORE its own litunion regroup contracts a run of `TyLit` members into ONE alias atom, so a pure litunion arrived carrying a single atom `K` and was recorded as a variant-box union; from there `isUName("K")` is true (every litunion registers as a union NAME) and the callee `struct.new`'d a `{tag, anyref}` box over an atom→string `select` chain whose scratch local the frame never reserved. **The CHECKER chose wrong, not the emitter** — the annotated twin's disassembly differs by exactly the functype result and that chain. **82 of 106 twin pairs are BYTE-IDENTICAL** modules (and 15 of 18 in the second grid); every non-identical pair is a shape whose inferred type genuinely is `string` (a bare-literal return, an `if`-arm join), not a rep disagreement. The `K \| null` niche shipped with it (same family, byte-identical to its annotated twin; it had never lowered — pre-fix it reached codegen and died at *"bare null needs a struct-typed context"*). **The silently-wrong class was hunted for and is 0 of 236 on this base.** On the pre-#1409 base it was **3 of 236** and none of them were this defect: `const r = F(); r is K` where `F` infers `string`, i.e. **D1b**, which reproduced for an annotated `: string` receiver too and which #1409 closed. Still open on the same grid: the NUMERIC litunion (`type N = 1 \| 2 \| 3`) is a loud reject — its members are `litKind == "num"`, which `tyIsLitUnion` excludes by construction, i.e. **D2**. The remaining 23 rejects and 7 traps are pre-existing and unmoved: the `K \| i32` and `K \| null` PRINT floors, and the shapes whose inferred type is genuinely `string`. `literal-unions/inferred-return-alias{,-forms,-sinks}.vl` + `inferred-nullable-litunion-return.vl` | **CLOSED** | — | — |

### 3b. Inference — the design aim

| id | item | witness | status | eff | risk |
|---|---|---|---|---|---|
| **E1** | **An un-annotated function cannot be taken as a VALUE** — `const f = add` errors *"annotate them"*, while `add(1,2)` works | ROADMAP `:1006`; `emit_mono.vl monoInstanceFor` / `monoCoerceFnValueName`, `wasmEmit.vl emitClosureValue` | **HALF SHIPPED — the ANNOTATED-CONTEXT half is closed; the blocker was the EMITTER, not the checker.** `const f = add` already worked; the real population is a 320-cell grid (8 definition forms × 20 value positions × with/without a by-name direct call), of which **60 carried the value-floor message. 36 closed, 24 left.** The mechanism was two predicates disagreeing about "generic": the floor (`fnHasUnannotatedParam`) fires on ONE hole, the instance materializer (`monoInstanceFor`) required EVERY parameter to be one — so a PARTIALLY annotated function was strictly worse as a value than the same function with no annotations, in every position. Also closed: an if-expression arm, an `=` to a function-typed binding, and ORDER-DEPENDENCE (a generic that was also direct-called lost its value use, because the call path spells an i32 pin as the hole it was). **LEFT, deliberately: the 24 cells whose receiving context declares nothing** — an un-annotated HOF parameter, an un-annotated return, a bare `[add]`, a bare `{op: add}`. Those need the callback type inferred from the HOF's own body (E5 territory), not a boundary read. **Also closed, and it was the WORST cell in the family: an explicit `<T>` generic as a value slipped the floor entirely** (`fnHasUnannotatedParam` is FALSE — `x: T` IS an annotation) and emitted at the un-substituted shape: `vl check` clean, then `wasm trap: indirect call type mismatch`. 5 of 10 positions, now bound from the boundary like any other pin, with a substitute-back post-condition so a `T` the boundary binds two ways declines instead of taking first-use-wins. Reject parity: **0 verdict changes across all 1,742 pre-existing corpus cases**, ignored count unmoved at 7. `functions/generic-fn-value-{partial-annotation,conditional-and-assign,after-direct-call,explicit-type-param}.vl` + 2 `error-…` boundary pins | **OPEN for the un-annotated-context half** | M | med (`$fnsig` seam) |
| **E1a** | **An arrow-`const` HOF's declared parameter type does NOT pin a function value, while a `function`-declaration HOF's does** — `const applyPI = (g: (i32,i32) => i32, …) => g(x,y)` still rejects `padd`, `function applyPI(g: (i32,i32) => i32, …)` accepts it | same anchors as **E1** (`emit_mono.vl monoCoerceFnValueName`) | **MEASURED at E1's integration (#1405), both spellings verified.** PRE-EXISTING: on a pre-E1 compiler **both** forms reject, so #1405 is a strict improvement — but it means E1's stated split ("all closed cells annotated-context, all left cells un-annotated-context") **understates the residue**: this receiving context DOES declare the type and is still refused. The axis is the RECEIVER's definition form, which was not a grid axis in E1's 354 cells | OPEN, live | S–M | low |
| — | **The checker accepts a `<T>` function at a boundary that binds `T` TWO WAYS** — `function pairT<T>(a: T, b: T)` passed to a `(i32, string) => i32` parameter is `vl check`-clean and then `wasm trap: indirect call type mismatch` | `typecheck.vl genericFnAssignable`; surfaced while re-gridding E1 | **OPEN, UNFILED, pre-existing (measured on master).** E1's emit side now DECLINES this shape rather than materializing an instance one position contradicts, which preserves master's verdict; the emit-time value floor cannot upgrade it to a diagnostic, because the monomorphizer's PRUNE has already replaced the un-instantiated template with a no-arg stub by then (and an EXPORTED one is rejected earlier by the export-signature floor). So the fix belongs in the checker: an instantiation that binds one type parameter to two different types is not assignable | S–M | low — tightening |
| ~~**E2**~~ | ~~**Inferred i32 map key does not lower** — `m.set(1,"x")` errors while the annotated `{[i32]: string}` twin runs~~ | `typecheck.vl` — the index-write arm pinned `TyArray.aElem` and had no `TyMap` arm; and the unsupported-key gate read only the ANNOTATION | **SHIPPED, but the row AS WRITTEN is refuted: `m.set(1,"x")` on a bare `Map()` runs today** (#1359 closed it — `maps/infer-i32-keyed-value-kinds.vl` is literally that program). The live population is the OTHER write spelling and it is **key-BLIND**: `m[k] = v` did not pin the hole at all, so the string key was refused exactly as much as the i32 key. **Premise-drift claim: HALF held.** The dead constraint is real but it is in the EMITTER-facing gate, not the checker — an inferred key never met `mapKeyTySupported`, so `m.set(1.5,v)` passed `vl check` and died as `emitProgram: map key is not a string` while its annotated twin was a clean type error; `mapKeyTySupported` itself is still load-bearing and correct (the rep has two hashes). Grid **1,728 cells** (6 key types × 4 creations × 2 write spellings × 6 ops × 6 key origins), each twinned against its annotated oracle: **432 → 288** oracle-backed defect cells, **240** inferred programs newly accepted with stdout **byte-identical to an accepting annotated oracle 240/240**, **464** cells move from a codegen error to the actionable check error, **0** regress, **0** invalid-wasm and **0** silently-wrong-output cells found on either side, reject parity **0 of 251**. Pinned key = the BASE type (`m[1]=…` → `i32`, `m["a"]=…` → `string`), matching `.set`. `maps/infer-from-index-write.vl`, `error-infer-unsupported-key.vl`, `error-infer-index-write-conflict.vl`, `sets/error-infer-add-unsupported-key.vl` | **CLOSED** | — |
| ~~—~~ | ~~**An inferred `Map()` does not lower in TWO composition positions**~~ | EMITTER shape ladder, not the checker. THE SUSPECTED MECHANISM WAS HALF RIGHT: `mapShapeOfExpr`'s `Call` arm does short-circuit, but `fnRetMapShapeSid` already had an un-annotated fall-back — the real cause is one layer down, `mapRetExprShape`, whose EVERY rung reads a SPELLING (a param / `let` / return annotation) and an inferred map has none. It is the ONE chokepoint the functype RESULT valtype, the `return Map()` constructor seed and the caller's receiver shape all read, so the three disagreed together. The literal half was as filed: `anonFieldCode` had no map arm, which un-interns the WHOLE shape | **SHIPPED.** Grid re-derived on extended axes — **220 oracle-backed cells** (10 map positions × 5 value reps × 2 key reps × 2 write spellings, + `Set()` in each position), every cell's annotated twin clean on all three compilers. Correct **21 pre-E2 → 37 at E2 → 176 now**; **139 cells fixed, 0 regress**; all **176/176 emit a BYTE-IDENTICAL module** to their annotated twin. **The filed "both are LOUD rejects" is REFUTED**: `vl check`-clean INVALID WASM was **19 pre-E2 → 36 at E2 → 0 now** (the arrow-const factory, the returned inferred LOCAL, and two call hops — axes E2's grid did not carry). Silently-wrong output **0** throughout. Of E2's diagnostic regression, **34/34 cells on this grid now build and run**. Two follow-ons found the same way: an i32-keyed `Set()` crossing a boundary answered the string-keyed mono, and two same-fieldset literals over different map types collapsed onto one interned shape. `maps/infer-through-call-return.vl`, `maps/infer-in-object-literal-field.vl` | **CLOSED** | — |
| — | **A LIST of inferred maps does not lower** — `const xs = [Map()]` + `xs[0][k]=v` ⇒ `emitProgram: map array elements are not supported in this position`, while the annotated `{[string]: V}[]` twin runs | the ref-list ELEMENT position, untouched by the shape ladder above (`compositionMapReadSlot` resolves the READ; the element's own intern is what is missing) | **OPEN, MEASURED: 22 of the 220 cells above, every one with an `ann=OK` oracle**, all key reps and value reps alike, `Set()` included. A LOUD reject on both sides of the fix — no invalid-wasm or wrong-output cell in the position | S–M | med — rep-adjacent |
| — | **Two anonymous literals with the same field-name SET but different field TYPES emit invalid wasm** — `const a = { v: 1 }` beside `const b = { v: "s" }` is `vl check`-clean and then `failed to parse WebAssembly module: type mismatch: expected i32, found (ref $type)` | `collectAnonShapes` interns one shape per field-name set and `structIndexOfObjCtxGo` matches by NAME, so the second literal builds against the first's rep. The float / i64 / map axes each discriminate; the string-vs-i32 axis does not | **OPEN, UNFILED. Pre-existing and map-INDEPENDENT** — reproduces identically on pre-E2 (`92b5dcfc`), on E2's tip and after this slice. Found while closing the map axis of exactly this collapse, which is the shape of the fix: one more discriminator beside the three that exist. WORST CLASS (`vl check`-clean invalid wasm), narrow population | S | low |
| — | **An inferred `Map()` is not pinned by a write through a PARAMETER** — `const m = Map(); put(m)` where `put`'s body writes ⇒ `cannot infer a type for 'm'` | CHECKER, not the emitter: the E2 index/`set` write pin is intra-procedural, and a param write never flows back to the argument's hole | **OPEN, MEASURED: 22 of the 220 cells above**, every one with an `ann=OK` oracle (annotate either the binding or the param and it runs). The actionable check error, never a codegen one — the only position of the ten that still rejects at the checker | M | low |
| **E3** | **`never` for divergent recursion** + an `unconditional-recursion` lint that fires even when the return IS annotated | ROADMAP `:851` | OPEN (current message is a stopgap) | (a) M (b) S | low |
| **E4** | **A13 — operators over holes defer concretization to the call site**, which re-validates under substitution (`binOpDefinedFor`) | `arith-hole-operand-reject.vl`, `equality-hole-operand-reject.vl` | **CLOSED for the binary operators.** The equality arm was the last cell — it returned true for every pair, so `cmp(1,"x")` over `a == b` checked clean and emitted invalid wasm. REMAINING under A13: the *stored-closure* operator case (`vec + vec` via a `"+"` field), blocked on B13 | — | — |
| **E5** | **Return-context inference** — inference flows only forward | `return-context-inference-design.md` | **DESIGN ONLY.** The hard part is the join across `is`-guard arms | L | med-high |
| ~~**E6**~~ | ~~**ONE annotation makes a valid string comparison unwritable** — `function f(a, b: string) { a < b }` called `f("a","b")` is REJECTED *"comparison expects numeric operands, got any and string"*, while the fully un-annotated twin ACCEPTS and prints `true`~~ | `typecheck.vl` — the string-ordering fast path needed `isStringTy` on BOTH sides, so a hole on either side fell to `isNumeric`, which refuses. The hole/hole case defers to A13's call-site re-validation and never reached this arm | **SHIPPED. The filing said 8 of 28; the true population is 24** — the four ordering ops × the two HALF-annotated directions × **three** string-typed spellings (`string`, a string LITERAL type, a string literal UNION — the last two reach the arm through `softenLitTy`, which the filing's `string`-only grid never exercised). All 24 have bare AND fully-annotated twins that accept and print the same value. Fixed by DEFERRING a concrete-string-vs-hole ordering to A13's existing call-site adjudication (`noteBinCstr` → `validateBinCstrs` → `binOpDefinedFor`, whose ordering rule already admits exactly `string`/`string` and numeric/numeric) — the ordering twin of the deferral `+` already makes for `s + h`. **Newly accepted = exactly those 24 plus the same shape reached through a lambda / a nested generic / a `let` init / a loop condition / an uncalled body; every one has an accepting fully-annotated twin, so parity is exact and no non-parity program was admitted.** Reject-parity measured: **0 of 237 corpus `@error` cases changed verdict**; a non-string binding of the hole (i32, f64, boolean, list, object, `null`, `string?`, and through two generic hops) still rejects — now at the call site, naming the ARGUMENT types instead of the hole, which removes an `any` rendering rather than adding one (E7 unaffected; its 5 pins hold). `soundness/ordering-hole-string-operand-{sound,reject}.vl` | **CLOSED** | — |
| — | **`+` over a string LITERAL type is broken in ALL THREE annotated spellings** — surfaced while re-gridding E6 | same arm's `+` tail: `binOpType`'s concat test is `isStringTy(lt) \|\| isStringTy(rt)`, which is FALSE for a `TyLit`, and unlike the ordering arm the `+` path never applies `softenLitTy` | **OPEN, UNFILED, MEASURED HERE: 6 cells.** `function f(a: "a", b: "a") { a + b }` is rejected *"operator '+' is not defined for string and string"* — a message that names two types it then refuses to add. Same for `"a" \| "b"`, and for both half-annotated directions of each. The BARE spelling accepts, so this is the same annotation-removes-a-capability shape as E6 but a **different arm**, and it is NOT E6-parity work: the fully-annotated twin rejects too, so E6's parity argument says leave it, and closing it needs its own owner ruling on whether `+` should soften | S | med — loosening |
| ~~**E7**~~ | ~~**The checker renders an inference HOLE as `any` in user-visible diagnostics** — *"got any and string"*, *"cannot assign (any, any) -> any"*~~ | `typecheck.vl` — ONE line, `tyToStr`'s `TyVar` arm: a `?fn.N` internal name rendered `any` | **SHIPPED as `_`. The filed count of 5 pinned files is EXACT** — measured over the corpus, 5 of the **239** files that produce any diagnostic (of 1,689 scanned) render a hole, and they are exactly the 5 filed, in **7** messages across **2** templates. **The board's other premise is a measured NEGATIVE: hole and error-type were never conflated** — `tyToStr` already spells `TyErr` `<error>`, no-arena-entry `<none>`, an unhandled arm `<?>`, the depth cap `…`, and those markers appear on a DISJOINT 3 files. The producer is a single site; the *upper bound* on affected messages is the **92 of 196** diagnostic call sites in `typecheck.vl` that interpolate `tyToStr`, of which 4 templates are probe-reachable with a hole (`comparison expects numeric operands…`, `operator '…' is not defined for…`, `argument N: expected…, got…`, `cannot assign…`). `_` chosen by elimination from ROADMAP B17's own shortlist: `?` collides with the nullable suffix the SAME renderer emits (`{bar: ?}` vs `{bar: T?}`), `<hole>` wears the angle-bracket shape reserved for ABSENCE while a hole is PRESENT (and would invite adding it to the LSP's `ABSENT_TYPE_MARKERS`, deleting informative hints from correct code), and every bareword (`unknown`, `unsolved`) repeats `any`'s category error — `unknown` worst of all, being a real TypeScript type name. A restructured sentence cannot generalize: the hole nests inside composites (`(_, _) -> _`), where only a compact token fits. `soundness/hole-renders-as-blank-reject.vl` | **CLOSED** | — |
| **E8** | **Internal absence markers leak into CLI diagnostics** — `<none>` and `<error>` reach users on the diagnostic channel; the LSP's `ABSENT_TYPE_MARKERS` filter guards EDITOR surfaces only | `typecheck.vl` `tyToStr`; LSP filter in `tests/lsp_undisplayable_type_test.ts` | **MEASURED, 3 named files of 240 diagnostic-producing**: `soundness/hole-is-guard-return-join-reject.vl` → *"expected string, got `<none>[]`"*; `sets/error-add-non-boolean-value.vl` → *"unknown property 'add' on `{[<none>]: <none>}`"*; `types/unknown-type-in-map-value.vl`. Surfaced BY E7's census and explicitly out of its scope — E7 measured that hole and error type were never conflated, so this is the *third* marker class, not a regression of that fix | OPEN, live | S | low |

### 3c. Performance — compile time

Standing baseline: `__str_eq__` **25.19% self**; the whole string layer **33.6%**;
self-compile 1,950 ms / 510.8 MB. The `__str_eq__` split is **19.10% identifiers vs
6.08% type names** — which is why *destringify is a correctness programme, not a
speed one*: the profile has not moved across slices since `8d2471e`.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **F1** | **Checker scope chain** — sid-indexed cell + undo log | `perf-program.md §9.7` | **2.83% self**; phase 3 gave **−4.5%** and 2,466,975 → 479,079 probes | **BLOCKED on coverage** | M | med-high — deleting the chain deletes the self-compile's only exerciser of two emitter arms. **Build `tests/cases` coverage FIRST** |
| **F2** | ~~**TOKKIND enumeration** — `kind: string` → i32 code~~ — **SHIPPED, and NOT as a 570-site rewrite. The vocabulary IS a literal union**: `type TokKind = "IDENT" \| …`, whose values the emitter already represents as i32 ATOMS. `Tok.kind: TokKind` makes every one of the ~570 sites an `i32.eq` **with the source text unchanged** — they were already spelled as the union's members. Effort was S, not L | `perf-program.md §10.9` | census re-derived: **561 sites over 8 files** (not 570/7 — 4 of `parser.vl`'s and 4 of `lexer.vl`'s are in COMMENTS, and `fuzzgen.vl`'s 2 are `"NULL"` in generated program TEXT); **44 `.kind` READS** (not 47 — 49 occurrences, 5 of them in comments) over 5 WRITE sites plus the lexer's 84 producers; `tok.kind` crossing the boundary **REFUTED as a value, CONFIRMED as a spelling** — it reaches the host inside `expected …` diagnostic TEXT. Cost re-derived at **1.68%** of a self-compile (structural attribution, 8 interleaved guest profiles/leg). Measured after: `vl build` **−1.76%** median (−1.09…−2.35), `vl check` **−9.4%** (−8.4…−10.4), `vl fmt` **−5.1%** (−3.4…−6.8), floor control flat; `__str_eq__` from `parser.vl` **−84%**, `parseProgram` inclusive **−33%**; 2,815 → 2,385 `call $__str_eq__` sites; seed **+1,721 bytes** | **DONE** | S | low — the checker is a COMPLETE ORACLE (a non-member spelling is a hard type error) and the string is minted from the atom by ONE renderer |
| **F3** | **`modRenamed` sid-index** | `perf-program.md §16` | re-derived 1.80% self / **3.94% inclusive**, plus a SECOND reader (`modRwTsName`, 1.89% incl) the row never named; the merge rewrite **−81.3%**, 12.3M compares → 96K probes | **DONE** | M | med |
| **F4** | ~~**`fnStmtsPosOf` index at the writers**~~ — **no index was built**: 80.3% of its calls ask for the function `emitCodeSection` is lowering, and the rest are classifiers whose callers already spell `fnStmts[fe]` | `perf-program.md §17` | re-derived **3.09% self → 0.01%**; a 1,600-frame ladder **48.9% → 3.7% self, −49.8%** of the compile | **DONE** | S | low |
| **F5** | **`modScan` re-scan + `coalesceMixOp`** | `driver.vl:1798`, `parser.vl:1232` | 7.0 + 1.1 samples/run | OPEN, sized | S–M | low |
| **F6** | ~~**`vl check` allocates MORE than `vl build`**~~ — **the gap is GONE and its SIGN is inverted**; the filed number was not a RUSAGE artifact, it described an engine that was replaced four days later (`36eb2e15` gave `cli_pump` a collecting collector, for an unrelated correctness reason). "The LSP's own path" was also wrong — `lsp/src/wasmChecker.ts` instantiates the seed in V8 and never touches the Rust host | `perf-program.md §18` | re-derived **282.8 MB vs 504.6 MB — check is 56% of build, −221.8 MB**. The ALLOCATION excess is real and untouched (`VL_PUMP_GC=null` → 680.0 MB, **+175 MB**), it is just no longer resident | **DONE** (measured negative) | S | none |
| **F6b** | ~~**the `.cwasm` cache key omits the ENGINE CONFIG**~~ — every cache path now carries an engine tag (wasmtime's own `precompile_compatibility_hash`), so `check`/`fmt`/`test` and `build`/`run` hold SEPARATE sidecars and both stay warm. Distinct paths, not a discriminant inside one file: a discriminant makes a mismatch a miss, and alternating would still recompile every time. The embedded seed's `seed-<VL_SEED_KEY>-<engine tag>.cwasm` is keyed the same way, and `prune_seed_cache` counts SEEDS rather than files so a two-configuration workload cannot evict a live one | `perf-program.md §18.2`, `main.rs` `engine_cache_tag` | one-line program, same box: alternating `check`/`build` **1,853 ms → 6 ms**; the two sidecars (10,596,480 B null-collector / 10,719,368 B pump) now coexist instead of overwriting each other | **DONE** | S | low |

### 3d. Performance — runtime

`perf-landscape.md`'s §1/§3/§4/§6/§7 **now carry the `1d3a8559` sweep alongside the
08-02 tables**, each moved row marked. Current distribution is **16 WIN / 15 PAR /
7 LOSS / 7 PRIORITY-LOSS**; median `vl/deno` **1.00** (was 1.04), median `vl/rust`
**2.29×** (was 2.49×). Quote `bench/results/summary.md`, which labels itself
**PRELIMINARY** — it re-ranks the landscape, it does not settle it.

**The loss COUNT is 14 on both sweeps.** The PRIORITY tier went 9 → 7;
`dispatch-table` (3.34 → 1.00) and `mutual` (2.37 → 1.22) left the loss list,
`map-i32` and `nbody` slid in across the 1.25 threshold. **Not one Python red alert
cleared** — six rows carried the flag on 08-02 and the same six carry it now, which
is the standing argument for G1/G3.

| id | item | measured | status | eff | risk |
|---|---|---|---|---|---|
| **G1** | **P7b — cache a string's hash** (the landscape splits **P7a** shipped / **P7b**) | **RE-PRICED: an ideal zero-cost cache is 1.88× at ~97-char keys, 1.33× at ~33, and 1.00× — nothing — at ~9.** The filed 4.6× was `long-key / short-key` and charged the whole length slope to the hash; measured, only **0.82 of 1.31 ns per code point** is the hash, the rest is `__str_eq__`. `__str_hash__` is **4.06%** of a self-compile (not 4.75%), so the compile-time ceiling is 1.042× | **DESIGN ESCALATION, not started.** "Clears 3 of 4 Python red alerts" is refuted by construction — all four §4.6 benchmarks key on ≤9-char strings, where the ceiling is 1.00×. Site now pinned: `string` IS `aTypeIdx`, and a side table is impossible (WasmGC has `ref.eq` and no reference→integer), so the only homes are a struct wrapper or an in-array header — both rep changes, subsumed by G3/P12. **What the re-pricing DID find and ship**: a map insert hashed its key twice — `map-string` **1.09×**, `set-ops` **1.07×**, insert-dominated **1.55×** long-key / **1.14×** short. `perf-program.md §19` | L/XL | med-high |
| ~~**G2**~~ | ~~**P2 follow-on (a)** — hoist the closure unpack out of loops~~ | **re-derived 1.12×**, not 10.6× | **CLOSED, measured, not taken.** The 10.6× was the FUNCREF libcall, which P2 (#1326) already deleted — the ladder row and the shipped row are one saving counted twice. Residual is two ordinary field loads, **0.26 ns/call** measured against 0.29 predicted; `wasm-opt -O` already does the hoist wherever the closure is scalar-replaceable, and the `.map` variant is inside the noise floor. `perf-program.md §13.7` | M | low |
| **G3** | **P12 — UTF-8 bytes for `string`** | **27.7×** on the compare; VL's `string` is 4 bytes/code point | OPEN | XL | high — `memory-gc-design.md §2.2` argues 4× denser but strictly *less* scannable under WasmGC |
| **G4** | **P13 — linear-memory backing for scalar arrays** | **3.41×** on matmul's kernel | OPEN | XL | high |
| ~~**G5**~~ | ~~**P10 — `const` → immutable global**~~ | **the fold happens WITHOUT it** — binaryen deletes the `(mut i32)` cell and inlines the bound anyway | **CLOSED, measured, not taken.** The mutability bit carries no information binaryen does not already derive: `simplify-globals` reads "no `global.set` anywhere" off the whole module — and VL exports functions and `memory`, never a global, so that view is always complete. Mutable-vs-immutable inputs optimize to **byte-identical** modules at `-O` and `-O3`; at the default rung the CPU A/B on a pair differing in that ONE byte is a wash. `perf-program.md §12.10` | XS | low |
| **G6** | **P6 — fuse `a/b` and `a%b`** | **1.99×** | **BLOCKED on a sign/edge grid** — `rem_s(INT32_MIN,-1)` returns 0 while `div_s` **traps** | S + grid | high as filed |

**REFUTED — do not re-file.** P4b BMH (refuted on three of its own numbers: table
build is 295 ns not 88; the gate is wrong; at its own 3.13× it still loses to
CPython by 1.43×; and `array.fill` has no emitter at all). P11 (**ruled upstream
#1325**; bare `wasm-opt -O` carries `mixed-width` identically). P9 (5.6% at the
default rung, **exactly zero at `-O` and above**; two supporting claims refuted
in-file). `flat` records as a compiler perf lever (targets the wrong half). **G2**
(the closure-unpack loop hoist: filed at 10.6×, re-derived at **1.12× / 0.26 ns per
call**, because the 10.6× was P2's own funcref libcall read a second time —
`perf-program.md §13.7`). **P10** (`const` → immutable global: the fold it was
filed to enable already happens on the MUTABLE cell, because binaryen infers
immutability from the absence of writes and VL never exports a global —
`perf-program.md §12.10`).

### 3e. Hygiene

| id | item | status |
|---|---|---|
| **H1** | **F5 — settle VL vs Vital** | OPEN, real. ~13 live sites; `lsp/package.json` `displayName` is a published surface |
| **H2** | **F9 — perf regression gate vs the NATIVE binary** | OPEN. Design below |
| **H3** | **F-tiers residue** | OPEN, **row RE-SCOPED in `ROADMAP.md`**. `SELFHOST_DENO_RUN` is gone; the residue is **four** tests executing emitted wasm under V8 via `tests/support/runWasm.ts` — `cases_wasm_test.ts` (the sole behavioral corpus oracle; must be re-hosted, not deleted) + `vl_exported_memory` / `vl_global_promotion` / `vl_reexport_abi` |
| ~~**H4**~~ | ~~**Close F4 / F6 / F7 / F9b**~~ | **DONE.** All four closed in `ROADMAP.md` with their evidence: F7's only `paramater` was the filing row; F4 and F9b are moot together (no compile path builds binaryen IR — and `vl build` already runs wasmtime's `Module::validate`, gated by `tests/vl_build_validate_test.ts`); root `deno.json` has no `build` task, and AGENTS.md documents the build |
| ~~**H5**~~ | ~~**Doc corrections**~~ | **DONE.** `perf-landscape.md` §1/§3/§4/§6/§7 re-derived against the 08-03 sweep with the 08-02 tables kept and marked superseded (and §5's P1/P2 rows, still filed as open, closed with their measured-vs-filed deltas); P7 split into **P7a** shipped 1.135x / **P7b** cache open, with a new `perf-program.md` §15; `A-infer-null` and `A-infer-empty` closed as shipped. **One find:** the `A-infer-empty` residue is NOT the surveyed "inferred i32 key" — the key is fine and the VALUE type is the axis, filed as the new **`A-infer-map-value`** row |

---

## Definition of done

From `docs/internals/agent-playbook.md`, which is the authority.

**Every item:** branch → agent works in a worktree and COMMITS but does **not** push
or open a PR → orchestrator integrates, pushes, opens the PR → CI green on all three
checks → merge → **delete the branch and the worktree**.

**Any `compiler/*.vl` change additionally:**

- `scripts/refresh-compiler.sh` after **every** edit — and check `rc` explicitly,
  because its failure tail reads like success.
- **The seed ladder has TWO legs.** A self-built seed only proves it matches its own
  source. CI bootstraps from published `seed-latest`, which is MASTER's compiler, so
  before opening the PR: save the seed, `fetch-seed.sh`, `refresh-compiler.sh
  --prove-fixpoint`. A failure here with a passing self-built ladder is a
  **bootstrap-ordering** problem, not a defect — split the change.
- `REJECT_CASES` must still reject if the checker got more permissive.
- Adding a corpus case ⇒ run `deno test -A tests/cases_wasm_test.ts` and register any
  divergence in `EXPECTED_DIVERGENCES` **in the same PR**, or master goes red on merge.
- Read the **ignored COUNT** before the pass count: the six `vl build -O` tests
  self-ignore silently when `wasm-opt` is missing.
- New `is <Node>` narrowing or a new `ast.vl` helper ⇒ add it to the import list in
  `tests/selfhost_wasm_emit_test.ts` and run it.

**Comments:** state, never diff. No dates, no PR numbers, no "was X" / "now does".
History belongs in git and in the design docs.

**Measurement:** one file per worker in any parallel sweep (a `>>` above `PIPE_BUF`
tears and silently invents or drops records). Probe records need a sequence number —
`tErr` dedupes exact repeats, which silently turns a count into a distinct-value set.

---

## H2 / F9 — the perf regression gate, in two phases

**What exists.** `bench/run.sh` answers *"where does VL sit against Rust, deno and
CPython"* — 46 benchmarks, four runtimes, stdout verified per case, `taskset`
pinning, a noise-floor probe. Its per-case `meta.json` audits are adversarial about
their own numbers (`arith/i32-accum` records that `rustc -O` auto-vectorises the
loop to SSE2 and that the honest scalar gap is ~1.4x against a 5.4x headline).
CI separately carries DETERMINISTIC pins — `MELT_TABLE` and the loop-shape rows
(`loops, rotated, carried`) in `tests/selfhost_native_release_test.ts`.

**What is missing is a GATE, not another harness.** Nothing catches a regression at
PR time, and the cost of that is already on the record: three perf documents drifted
to numbers stale by up to 4.3x, and the filed-vs-shipped P7 split survived unnoticed,
because nothing re-measured.

**The constraint that decides the design.** `bench/README.md` records this box
swinging **up to 2.5x under contention even with `taskset`**, and the sweep labels
itself PRELIMINARY. A wall-clock gate therefore cannot separate a regression from a
busy runner — the identical ambiguity that made the `vl test` parallelism ratio
unusable. Whatever gates in CI must be contention-proof.

### Phase 1 — extend the deterministic pins (no timing at all) — DONE

`MELT_TABLE`'s pattern already gates emitted-code SIZE and LOOP SHAPE per optimizer
rung, and cannot flake because it measures the artifact, not the machine. Extended
across the hot benchmark shapes as `SHAPE_TABLE` in
`tests/selfhost_native_release_test.ts`: 13 rows, one per `bench/<cat>/<name>/main.vl`
— the same sources `bench/run.sh` times — graded at `-O` and `-O3` on module bytes
(banded, `max(3%, 16B)`) plus exact counts of functions, allocation sites,
`call_indirect`, and, where they are the axis, `return_call` and `ref.eq`. Covers
closure dispatch (`lambda-hot`, `map-filter-reduce`, with `dispatch-table` as the
must-stay-indirect control), tail calls (`tailcall`, `mutual`), string equality and
hashing (`str-eq`, `map-string`, `word-freq`), map probes (`map-string`, `map-i32`),
array/struct element access (`fill-sum`, `binsearch`, `struct-aos`) and the tight
scalar loop (`mixed-width`). Union boxing was already the densest area of
`MELT_TABLE` and got no new rows.

Two design points that are load-bearing if this is ever revised:

- **The new rows skip the `none` rung on purpose.** Every counter is module-wide, and
  an unoptimized module carries helpers the program never calls — `LOOP_TABLE`'s
  `none` row has fired twice on exactly that wrong axis (`__str_eq__`'s unroll, then
  `__str_hash__`'s). `-O`/`-O3` run DCE, so at those rungs a module-wide count is a
  reachability-scoped count. VL's own emission is still graded: the optimizer inlines
  VL's output, so extra emitted work lands in the optimized columns.
- **Bytes are banded, not exact.** An exact byte golden on 13 modules reddens on
  instruction-selection noise and then gets muted, which is worse than no pin.

Bounds worth stating: a shape pin cannot see a regression that keeps the loop shape
and adds work per iteration. It is the reliable half, not the whole answer. The one
row where the byte band is fine-grained enough to notice added per-iteration work is
`arith/mixed-width` (203 bytes, one loop, no allocation).

### Phase 2 — a CPU-time baseline

`scripts/p7-time.sh` is the primitive: interleaved min+median of **user+sys CPU
milliseconds**, with stdout equality asserted across modules before any timing.

CPU time is the load-bearing choice. Measured on this box at **load average ~100**
(four compile-heavy agents running), one module over 2 reps:

```
cpu_min=1906ms  cpu_med=1906ms  wall_min=2384ms  cpu=[1926 1906]
```

**1% spread on CPU time while wall clock carried the contention.** That is the
property a gate needs. Interleaving modules within a rep spreads any residual drift
across both sides of an A/B rather than one.

Sequence phase 1 first: it is cheaper, cannot flake, and its failures are exact.
