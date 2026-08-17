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
| **B2** TRANSP residue | #1373 | shipped; found a THIRD down-cell the filing lacked |
| **B3** mint column | #1372 | **BLOCKED-REP behind B5** — 206 of 220 mint |
| **B4** `recordMvValTyIx` | #1366 | shipped; 725 calls, 0 parses, 0 mints |
| **B9a/B9b** routings + endpoint | #1375 | shipped; the endpoint row was **mis-identified**, divergence deliberate |
| **B9** W13 floor | #1372 | re-derived: **12, not ~60** |
| **C1** union box melt | #1363 | shipped; 1.36x default / 1.68x `-O` |
| **C6** `match` binding in value position | #1367 | shipped; unblocked `if` too |
| **C9** webcraft doc staleness | #1351 | shipped |
| **C10** names section | #1351 | **resolved** — consumer passes `--names`; default flip costs the seed +5.3% |
| **D1** litunion alias `is` | #1353 | shipped |
| **D2** numeric literal unions | #1365 | shipped; a fourth rep with its own lowering |
| **D5** storage-vs-identity exemption | #1362 | shipped; 6 UP, 0 DOWN |
| **E1** generic fn as a value | #1364 | shipped; closed a live invalid-wasm emit |
| **E2** inferred map VALUE type | #1359 | shipped; the axis was the value, not the key |
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

**Cycle scorecard: 8 filed claims refuted or corrected by measurement**, five of
them numbers or units, three of them framings. Two were the orchestrator's own.

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

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| ~~**B1**~~ | ~~Checker-side parse census~~ | `destringify-types-program.md` D-CHECKPARSE | **CLOSED — measured negative.** 3,093 of 17,834; **17,832 of 17,834 are TREE walks**; `nameToTy` entered **54 times corpus-wide**, **0** over the compiler's own source | **CLOSED** | — | — |
| **B1a** | **`is` triple resolution** — `collectThenNarrows` / `collectElseNarrows` / the if-chain scan each re-resolve what the `is` node already banks in `isVarTyIx` | family c9+c10+c11+c13 | **6,574 = 36.9%** of checker parsing (**87.9%** on the compiler's own source). Bank covers 4,427 of 4,429 readers; **2,530 of 2,530 index-identical, 0 disagreements** | **PARTLY TAKEABLE** — the other **1,897 MINT a duplicate arena entry**, so skipping renumbers (#1331's gate) | M | med |
| **B2** | **TRANSP residue** — add `genAppNameOfTy` under `structNameOfTy` so `type Y = Box<i32>` renders `Box<i32>` | `typecheck.vl:8945`; blocker `emit_classify.vl:11474 fieldTypeCode` | rung is **BUILT and MEASURED**: B2 20→11, B3 120→111, moves nothing on the six-channel corpus, costs ONE cell | OPEN — both halves of the old filing REFUTED | M+S | med |
| ~~**B3**~~ | ~~1a-v `pushFieldRow` — per-field-CODE peel table~~ | `destringify-types-program.md` D-FIELDROWMINT | **MEASURED NEGATIVE.** Re-derived at **3,583 CALLS** (2,510 empty-name guard · 185 rung 1 · 215 rung 2 · **673** `resolveAnnot` reaches) / **220 parses** (11.5% of the emitter's 1,915) / **206 of the 220 MINT (93.6%)**, and on the subset `pushFieldRow` can actually reach, **83 of 84 (98.8%)**. The 14 mint-free are 6 generic re-applications + 8 `#anon` failures, 13 of them outside `pushFieldRow` | **BLOCKED-REP** — behind **B5** | — | — |
| ~~**B4**~~ | ~~`recordMvValTyIx` routing~~ | `destringify-types-program.md` B4 | **SHIPPED.** Re-derived at **725 CALLS** (40 rung-1 · 274 rung-2 · **411** `resolveAnnot` reaches) / **0 parses** / **0 arena mints**; dual-write **725 of 725 index-identical**, corpus A/B 1,743 files × 7 channels **0 rows moved**, **+25 B**. The filed 685 reconciles as `725 − 40 − 274`: the row grew, the CHOKEPOINT moved | **CLOSED** | — | — |
| **B5** | **Mono-clone `nodeTyIx`** — clone banks the generic's type while `tyName` carries the substituted spelling | `emit_collect.vl:3413`, `:3868`; `emit_mono.vl:1430` | disagrees on **59 of 1,328**; a guard cuts 59→8 but costs 109 agreements, **not shipped**; **1,335 reaches wait on it** | OPEN — blocks B3/B6 | L | **HIGH** |
| **B6** | **Arena-index threading** (D-INLINESHAPETY / D-REPELEMTY) — relocate parses to callers holding the index | — | population quoted as **18 of 1,064** in three places but the measuring table sums to **14 / 1,050** | OPEN, **re-derive first** | M | med |
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
| **C1** | **P1.3 — union box must melt when the payload is READ** | `unboxed-union-rep-design.md:856`; `emitUnionIfValue` / `emitVariantIfValue` / `emitNullableIfBinding` omit `ctrlEnter`/`ctrlLeave` | phase 1 **#1322** (78 sites over 76 functions; **wash** at plain `vl build`, **1.76× at `-O`**); if-expr **#1337** (1.67× at `-O`); a `let` on two branches **unmoved at 4 → 4** | OPEN — **highest consumer value** | M | med |
| **C2** | **P1.4 follow-on — backing-pointer LICM** for view descriptor fields | ROADMAP `:949` | two views of one width costs **3.5×** (1.713 vs 0.493 ns/elem); the fence is **11%** of the excess, the per-element field reload **89%** | OPEN | L | med |
| **C3** | **P1.3 — optimization defaults** | ROADMAP `:353` | three-rung sweep separates `OPT-LOSES` (7 rows) from `O3-WORSE-THAN-O` (`sort-heap` 854/**648**/837) | **OWNER RULING** `O-release-rung-default` | S in code | moves published guidance |
| **C9** | **webcraft doc staleness** — P1.2, the `wasm-opt` soft-no-op clause, `match` phase 2 | `webcraft-requirements.md` :309/:371-396, :446, :806 | three blocks describe shipped capability as open | IN FLIGHT | S | none |
| **C10** | **Names section** — the ask says "keep emitting"; it is **opt-in and off by default** | `emit_sections.vl` `gEmitNames`; `--names` | default build **167 B, no names**; `--names` **258 B**. Flipping the default costs the seed **+60,297 B (+5.3%)**: 1,137,213 → 1,197,510 | **Resolution: consumer passes `--names`.** Do NOT flip the default | S (doc) | none |
| **C5** | **A16 — litunion correctness in MIXED unions** | `webcraft-requirements.md:823` | **81 of 244 grid cells broken, 42 silent wrong answers, all `vl check`-clean** | **BLOCKED**, 2 owner rulings | M | — |
| **C6** | **`match` residuals** — a binding arm cannot be a `const` INITIALIZER | ROADMAP `:1196` | was `emitProgram: if-expression arm is not a single value`; the grid says the BINDING broke value position, not `match` (statement + tail already lowered it, the `if` twin failed identically) | **DONE** — the if-expression arm gained a PRELUDE, so `match` AND `if` both lower in binding-init and `return` position; argument position + a TOP-LEVEL binding stay loud rejects | S–M | low |
| **C7** | **B15a — default / optional params** | ROADMAP `:991` | neither `p?: T` nor `p: T = e` parses | OPEN, sequenced after the `$fnsig` wave | M | — |
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
| **D1b** | **`string` receiver tested against a litunion** — `function f(s: string) { if s is A … }` | same section | `vl check`-clean, answers a constant FALSE. Same rep and same lowering as D1; a different receiver POPULATION | OPEN, measured | S | low |
| **D2** | **Numeric literal unions** — `tyIsLitUnion` requires every member `litKind == "str"` | `typecheck.vl:18621`, `:19019` | the litunion machinery is **string-only by construction** while VL models str/flt/int literals | OPEN — **do NOT bundle with D1** | M | med |
| **D3** | **ROOT A** — `emitIs` compares ONE tag | `wasmEmit.vl:1877`, `:1832` | **49 of 64 cells**, but **not re-derived since #1343/#1341** — treat as an upper bound | OPEN | L | med-high |
| **D4** | **Generic alias application as a union member** — `type U = Box<Box<i32>> \| i32; const u: U = { v: 5 }` is ACCEPTED | suspect `typecheck.vl:9054` | three controls localise it exactly; **defect confirmed, mechanism NOT** | OPEN, mechanism blocked on W9 | M–L | med |
| **D5** | **Struct arms differing only in a shared STORAGE code** — `{a:i32} \| {a:boolean}` | `emit_collect.vl:4498 variantFieldCodesEq` | `boolean`/`i32` share a storage code, so the pair is treated as the layout-equal twin the exemption exists for | OPEN, pinpointed | S | low-med |
| **D6** | **Function-type union arms** — 4 cells | — | **UNPROBED** — flag as unmeasured, not clean | OPEN | ? | ? |
| **D7** | **`%` with a FLOAT operand emits invalid wasm** — `vl check` clean, then `type mismatch: expected i32, found f64` at instantiate | `emit_base.vl:552 binOpcodeF64` / `:591 binOpcodeF32` return **−1** for `%` (wasm has no `f64.rem`); the consumer `wasmEmit.vl:15514` guards `if opcF >= 0` and **falls THROUGH** the f64 and i64 slices to the i32 tail, which emits `i32.rem_s` (0x6f) over f64 operands | **MEASURED, re-verified here.** Fails with BOTH operands annotated, so it is an EMITTER gap, not inference: `f64 % f64`, `f64 % i32`, `i32 % f64`, `f32 % f32` (annotated `const`s) and the bare-literal `5.5 % 2.0` all check clean and emit invalid wasm. In the 352-cell nested-capture grid below it is the **only** residue left in either spelling, in all four annotation variants. A sibling grid measured **24 of 1,320** (2 pairs × 12 spellings) — that is a FLOOR: it omits `i32 % f64` and the f32 family | OPEN | S (loud reject) / M (lower as `a − trunc(a/b)*b`) | low — the fall-through is the defect; a `-1` opcode must never reach the i32 tail | 
| **D8** | **Nested function that CAPTURES** — the env FIELD and the READ out of it were typed by different answers | `emit_classify.vl` `capturedKindOf` / `exprIsF64`·`exprIsI64`·`exprIsF32`; the residual i32 arm is `emitClosureValue`'s value floor (`wasmEmit.vl:1404`), ROADMAP B15 | **CLOSED — and the filed MECHANISM was wrong.** Filed as the function-value ABI's un-annotated-param i32 default; re-gridded at **4 operand types × 11 operators × 2 spellings × 4 annotation variants = 352 cells**, which says otherwise: annotating the NESTED param leaves the f64 half **11 of 11** broken in BOTH spellings, annotating the OUTER binding fixes it, and the capture-only spelling `function o(a, b) { function g() a OP b; g() }` fails identically with **everything annotated** (`joinCaps` over two `string` params → `(result i32)` around a string-ref body). Real cause: `captureValKind` types the env field while the classifiers type the read, the scalar classifiers had no capture arm, and `capturedKindOf` was gated on `fnEnvIdx` — minted by `mAssignTypeIndices`, i.e. after every classification pass, so return inference saw no captures at all. Capture-only spelling **12 → 1** invalid-wasm cells in every variant (now annotation-neutral); param-taking spelling **11 → 1**; both residues are `f64 %` = **D7**. 150 running cells match their fully-annotated twin. Each scalar arm measured failing with it removed | **CLOSED** except the i32 arm | — | — — the remaining i32 arm is the value floor's LOUD reject (a nested fn whose OWN param is un-annotated), correct as-is |

### 3b. Inference — the design aim

| id | item | witness | status | eff | risk |
|---|---|---|---|---|---|
| **E1** | **An un-annotated function cannot be taken as a VALUE** — `const f = add` errors *"annotate them"*, while `add(1,2)` works | ROADMAP `:1006` | **OPEN, live.** The largest visible violation of the stated aim — inference turns off exactly where callbacks are written | M–L | med (`$fnsig` seam) |
| **E2** | **Inferred i32 map key does not lower** — `m.set(1,"x")` errors while the annotated `{[i32]: string}` twin runs | — | **OPEN, live, UNFILED.** Pure premise-drift: a CHANGELOG constraint B6a removed. The annotated path is an exact oracle | S–M | low |
| **E3** | **`never` for divergent recursion** + an `unconditional-recursion` lint that fires even when the return IS annotated | ROADMAP `:851` | OPEN (current message is a stopgap) | (a) M (b) S | low |
| **E4** | **A13 — operators over holes defer concretization to the call site**, which re-validates under substitution (`binOpDefinedFor`) | `arith-hole-operand-reject.vl`, `equality-hole-operand-reject.vl` | **CLOSED for the binary operators.** The equality arm was the last cell — it returned true for every pair, so `cmp(1,"x")` over `a == b` checked clean and emitted invalid wasm. REMAINING under A13: the *stored-closure* operator case (`vec + vec` via a `"+"` field), blocked on B13 | — | — |
| **E5** | **Return-context inference** — inference flows only forward | `return-context-inference-design.md` | **DESIGN ONLY.** The hard part is the join across `is`-guard arms | L | med-high |
| **E6** | **ONE annotation makes a valid string comparison unwritable** — `function f(a, b: string) { a < b }` called `f("a","b")` is REJECTED *"comparison expects numeric operands, got any and string"*, while the fully un-annotated twin ACCEPTS and prints `true` | `typecheck.vl:20493` — the string-ordering fast path needs `isStringTy` on BOTH sides, so a hole on either side falls to `isNumeric`, which refuses. The hole/hole case defers to A13's call-site re-validation and never reaches this arm | **OPEN, live, MEASURED HERE: 8 of 28 cells** — the four ordering ops (`<` `<=` `>` `>=`) × the two HALF-annotated spellings (`a, b: string` and `a: string, b`). All 8 bare/both-annotated twins ACCEPT; `==`, `!=` and `+` accept in all four spellings. Annotating MORE should never lose a program. ⚠️ the fix **LOOSENS** the checker, so it is reject-parity work (playbook "Reject-parity"), not a ride-along on a soundness fix | S–M | med — loosening |
| **E7** | **The checker renders an inference HOLE as `any` in user-visible diagnostics** — *"got any and string"*, *"cannot assign (any, any) -> any"* | `docs/guide/soundness.md:25,30` states the opposite in as many words: "An un-annotated parameter or `let` is a hole, not a dynamic value" and "**No `dynamic` / no implicit `any`.** There is no type that silently accepts every value" | **OPEN, live, UNFILED.** A user-visible contradiction of a documented guarantee — the one word most likely to teach a reader VL has an `any`. Surfaced by E6 but independent of it. NOT free: the `any` spelling is directive-pinned as a TYPE in **5** corpus files (the four `soundness/generic-fn-*-reject.vl` plus `soundness/hole-is-guard-alternative-reject.vl`), so a rename edits those directives in the same change | S | low |

### 3c. Performance — compile time

Standing baseline: `__str_eq__` **25.19% self**; the whole string layer **33.6%**;
self-compile 1,950 ms / 510.8 MB. The `__str_eq__` split is **19.10% identifiers vs
6.08% type names** — which is why *destringify is a correctness programme, not a
speed one*: the profile has not moved across slices since `8d2471e`.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **F1** | **Checker scope chain** — sid-indexed cell + undo log | `perf-program.md §9.7` | **2.83% self**; phase 3 gave **−4.5%** and 2,466,975 → 479,079 probes | **BLOCKED on coverage** | M | med-high — deleting the chain deletes the self-compile's only exerciser of two emitter arms. **Build `tests/cases` coverage FIRST** |
| **F2** | **TOKKIND enumeration** — `kind: string` → i32 code | `perf-program.md §10.6` | **1.5–1.9% of a self-compile for ~570 sites over 7 files**; only 47 `.kind` READS; `tok.kind` never crosses the wasm boundary | OPEN | L | med — must mint the string FROM the code in `mkTok`, never both |
| **F3** | **`modRenamed` sid-index** | `driver.vl:2622` | **1.82%**, went UP as a share | OPEN | M | med |
| **F4** | **`fnStmtsPosOf` index at the writers** | `emit_classify.vl:9166` | **2.27% self** — three quarters of the original 5.54% was ONE un-hoisted call site, already removed | OPEN | M | med |
| **F5** | **`modScan` re-scan + `coalesceMixOp`** | `driver.vl:1798`, `parser.vl:1232` | 7.0 + 1.1 samples/run | OPEN, sized | S–M | low |
| **F6** | **`vl check` allocates MORE than `vl build`** | — | **649.5 MB vs 510.8 MB**. ⚠️ this class of number was once wrong via cumulative `RUSAGE_CHILDREN` — **re-derive first** | OPEN | S | none |

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
| **G1** | **P7b — cache a string's hash** (the landscape now splits **P7a** shipped / **P7b** open) | filed at **up to 4.6× on long keys**; clears 3 of 4 Python red alerts; `__str_hash__` is also 4.75% of a self-compile | OPEN, **site not pinned**, and **RE-PRICE FIRST**: both figures predate #1342's unroll (P7a, **1.135×**, which halved the per-code-point walk to 1.10 ns) and neither has been re-measured. P7a's own bound: at short keys the whole walk is ~11 ns of a ~63 ns probe | L | med-high |
| ~~**G2**~~ | ~~**P2 follow-on (a)** — hoist the closure unpack out of loops~~ | **re-derived 1.12×**, not 10.6× | **CLOSED, measured, not taken.** The 10.6× was the FUNCREF libcall, which P2 (#1326) already deleted — the ladder row and the shipped row are one saving counted twice. Residual is two ordinary field loads, **0.26 ns/call** measured against 0.29 predicted; `wasm-opt -O` already does the hoist wherever the closure is scalar-replaceable, and the `.map` variant is inside the noise floor. `perf-program.md §13.7` | M | low |
| **G3** | **P12 — UTF-8 bytes for `string`** | **27.7×** on the compare; VL's `string` is 4 bytes/code point | OPEN | XL | high — `memory-gc-design.md §2.2` argues 4× denser but strictly *less* scannable under WasmGC |
| **G4** | **P13 — linear-memory backing for scalar arrays** | **3.41×** on matmul's kernel | OPEN | XL | high |
| **G5** | **P10 — `const` → immutable global** | one line; **measure whether an immutable cell lets binaryen fold the loop bound BEFORE writing the patch** | OPEN, correctly parked | XS | low |
| **G6** | **P6 — fuse `a/b` and `a%b`** | **1.99×** | **BLOCKED on a sign/edge grid** — `rem_s(INT32_MIN,-1)` returns 0 while `div_s` **traps** | S + grid | high as filed |

**REFUTED — do not re-file.** P4b BMH (refuted on three of its own numbers: table
build is 295 ns not 88; the gate is wrong; at its own 3.13× it still loses to
CPython by 1.43×; and `array.fill` has no emitter at all). P11 (**ruled upstream
#1325**; bare `wasm-opt -O` carries `mixed-width` identically). P9 (5.6% at the
default rung, **exactly zero at `-O` and above**; two supporting claims refuted
in-file). `flat` records as a compiler perf lever (targets the wrong half). **G2**
(the closure-unpack loop hoist: filed at 10.6×, re-derived at **1.12× / 0.26 ns per
call**, because the 10.6× was P2's own funcref libcall read a second time —
`perf-program.md §13.7`).

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
