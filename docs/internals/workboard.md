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

| item | where | state |
|---|---|---|
| B1 checker-side parse census | agent, worktree | running |
| D7 W8 `modTypeRenamed` quote skip | agent, worktree | running |
| C9 webcraft doc staleness | agent, worktree | running |

Recently landed: **#1344** (brand-only union arms rejected — owner-confirmed
narrowing), #1345 (`vl test` scheduling witness), #1348 (comment policy), #1349
(dependabot high, dev-only transitive).

---

## Band 1 — destringify types

**State of the programme.** The EMIT side is at its floor: **1,846 `annotResolve`
parses**, and the whole name-shortcut route is **EXHAUSTED as of #1334**. All three
surviving emitter rows are mint-bound — row 4 is 425 of 426 minting, row 2 is 402
of 402, and row 1's arena-neutral remainder is 111 of 126 the `FView`-refuted rung.
There is no fourth rung to add.

The counter-datum worth keeping in view: lowering the compiler's own 39k lines,
**the entire emitter parses 24 type spellings and the checker 49**. Measured in
parses, the disease is already near-zero on the largest real program; the open
populations are corpus-wide aggregates over 1,727 small files.

| id | item | anchor | measured | status | eff | risk |
|---|---|---|---|---|---|---|
| **B1** | **Checker-side parse census** — bucket by caller × mint × text, as #1327/#1331/#1332 did for the emitter | `destringify-types-program.md` ~:39312 | **16,145 reaches · 13,167 memo hit · 2,963 PARSES · 18.4%**, over the 1,727-file corpus | IN FLIGHT | S | low |
| **B2** | **TRANSP residue** — add `genAppNameOfTy` under `structNameOfTy` so `type Y = Box<i32>` renders `Box<i32>` | `typecheck.vl:8945`; blocker `emit_classify.vl:11474 fieldTypeCode` | rung is **BUILT and MEASURED**: B2 20→11, B3 120→111, moves nothing on the six-channel corpus, costs ONE cell | OPEN — both halves of the old filing REFUTED | M+S | med |
| **B3** | **1a-v `pushFieldRow`** — per-field-CODE peel table | `emit_collect.vl:4271`; `emit_rep.vl:1226`, `:1241` | **887 reaches / 256 parses = 8.4% of all emitter parsing**; `recordUFieldElemRow` densest at 77.6% | OPEN — "all 256 mint" is **BRIEFED, unverified since #1331** | M | high if they mint |
| **B4** | **`recordMvValTyIx` routing** | `emit_rep.vl:799` | **685 reaches, 0 parses** — the one row with a *proof* of arena neutrality | OPEN | S–M | **LOW** |
| **B5** | **Mono-clone `nodeTyIx`** — clone banks the generic's type while `tyName` carries the substituted spelling | `emit_collect.vl:3413`, `:3868`; `emit_mono.vl:1430` | disagrees on **59 of 1,328**; a guard cuts 59→8 but costs 109 agreements, **not shipped**; **1,335 reaches wait on it** | OPEN — blocks B3/B6 | L | **HIGH** |
| **B6** | **Arena-index threading** (D-INLINESHAPETY / D-REPELEMTY) — relocate parses to callers holding the index | — | population quoted as **18 of 1,064** in three places but the measuring table sums to **14 / 1,050** | OPEN, **re-derive first** | M | med |
| **B7** | **W9 — canon `renderEmit(ty, ctx)`** | `typecheck.vl:9524`, `:7985`, `:6723` | **B2 = 176 / 7,201 = 2.44%**; gate 4b admits **4 distinct spellings corpus-wide** | **DESIGN-BLOCKED** — canon is name-in/name-out by contract | L | high |
| **B8** | **W10 — `nameToTyReal`**, the checker's second descent | `typecheck.vl:6184` | a SOURCES problem; the "~150 ops" headline **predates the #1327 unit correction** | OPEN, **re-derive** | L | high |
| **B9** | **W13's ~60 single-writing floor** — never re-derived | — | *"an assumption in a table, never a measurement"* | OPEN census | S | none |
| **B10** | **Latent defect** — only the NEGATIVE memo carries `cUserTypesVer`, so a positive entry survives a `cUserTypes` rewrite | `emit_rep.vl:1147` → `:1198` | **4 disagreements in 976** memo-HIT reaches; inert only because rung 2 answers 0 times in 237 | OPEN | S | med (mint reorder) |

**EXHAUSTED / REFUTED — do not schedule.** The name-shortcut route entire (#1334);
row 2 `sTyIxOfNameTy` (0 of 402 arena-neutral, 282 distinct spellings for 402
parses); row 1 `repElemKeyOfNameTy` (residue 15 parses = 0.8%); row 4's canon
recorder (refuted twice, most recently on REP grounds — every disagreement but two
is a `TyLit` read as its `TyPrim` base); the primitive-ARRAY rung (70 of 70 mint);
1a-i's two NODE-holding mints (refuted twice); `nameIsRefArray`; bucket 3 (shipped
#1336); the G class (closed by #1274); LINSOFT (closed); W1–W8, W12, W14.

**Standing soundness rule.** A newtype over a struct separates arena-index identity
from rep identity; any future rung here must be graded against it. **The fuzzer is
structurally blind to it** — the grammar emits no `new` type (820 covered fuzz
reaches, 0 key disagreements), so fuzz agreement is not evidence for this class.

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
| **C6** | **`match` residuals** — a binding arm cannot be a `const` INITIALIZER | ROADMAP `:1196` | hits `emitProgram: if-expression arm is not a single value` | OPEN — unblocks let-init for `match` AND `if` | S–M | low |
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
| **D1** | **Litunion ALIAS resolution** — `u is A` over a union of two litunion aliases always answers FALSE | `overlapping-arm-defects.md:220`; gate `typecheck.vl:19617` | isolating probe: `u is "x"` ✅ / `u is A` ❌ on the identical value; folds to `i32.const 0`. Disjoint arms fail identically; **both** arms answer FALSE | **OPEN — readiest slice**. Fails CLOSED | S–M | **LOW** |
| **D2** | **Numeric literal unions** — `tyIsLitUnion` requires every member `litKind == "str"` | `typecheck.vl:18621`, `:19019` | the litunion machinery is **string-only by construction** while VL models str/flt/int literals | OPEN — **do NOT bundle with D1** | M | med |
| **D3** | **ROOT A** — `emitIs` compares ONE tag | `wasmEmit.vl:1877`, `:1832` | **49 of 64 cells**, but **not re-derived since #1343/#1341** — treat as an upper bound | OPEN | L | med-high |
| **D4** | **Generic alias application as a union member** — `type U = Box<Box<i32>> \| i32; const u: U = { v: 5 }` is ACCEPTED | suspect `typecheck.vl:9054` | three controls localise it exactly; **defect confirmed, mechanism NOT** | OPEN, mechanism blocked on W9 | M–L | med |
| **D5** | **Struct arms differing only in a shared STORAGE code** — `{a:i32} \| {a:boolean}` | `emit_collect.vl:4498 variantFieldCodesEq` | `boolean`/`i32` share a storage code, so the pair is treated as the layout-equal twin the exemption exists for | OPEN, pinpointed | S | low-med |
| **D6** | **Function-type union arms** — 4 cells | — | **UNPROBED** — flag as unmeasured, not clean | OPEN | ? | ? |

### 3b. Inference — the design aim

| id | item | witness | status | eff | risk |
|---|---|---|---|---|---|
| **E1** | **An un-annotated function cannot be taken as a VALUE** — `const f = add` errors *"annotate them"*, while `add(1,2)` works | ROADMAP `:1006` | **OPEN, live.** The largest visible violation of the stated aim — inference turns off exactly where callbacks are written | M–L | med (`$fnsig` seam) |
| **E2** | **Inferred i32 map key does not lower** — `m.set(1,"x")` errors while the annotated `{[i32]: string}` twin runs | — | **OPEN, live, UNFILED.** Pure premise-drift: a CHANGELOG constraint B6a removed. The annotated path is an exact oracle | S–M | low |
| **E3** | **`never` for divergent recursion** + an `unconditional-recursion` lint that fires even when the return IS annotated | ROADMAP `:851` | OPEN (current message is a stopgap) | (a) M (b) S | low |
| **E4** | **A13 — arithmetic over holes defers concretization without re-checking**; `add(1,"x")` checks and runs | `xfail-arith-hole-operand.vl` | OPEN — the only entry in soundness.md's "Known-unsound corners" | M | med |
| **E5** | **Return-context inference** — inference flows only forward | `return-context-inference-design.md` | **DESIGN ONLY.** The hard part is the join across `is`-guard arms | L | med-high |

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

⚠️ **`perf-landscape.md` §1/§3/§4 are pre-`1d3a8559`** and understate VL by up to
4.3× on headline rows (`str-eq` 14.02x → **6.88x**; `lambda-hot` 11.07x → **2.55x**;
`dispatch-table` 3.34x → **1.00x, off the loss list**). Current distribution is
**16 WIN / 15 PAR / 7 LOSS / 7 PRIORITY-LOSS**. Quote `bench/results/summary.md`.

| id | item | measured | status | eff | risk |
|---|---|---|---|---|---|
| **G1** | **P7 (the real one) — cache a string's hash** | **up to 4.6× on long keys**; clears 3 of 4 Python red alerts; `__str_hash__` is also 4.75% of a self-compile | OPEN, **site not pinned**. ⚠️ the shipped #1342 was a 4-wide unroll worth **1.135×** — *not* this item | L | med-high |
| **G2** | **P2 follow-on (a)** — hoist the closure unpack out of loops | **10.6×** where it applies (1072.7 → 101.5 ms) | OPEN. Note the self-hosted compiler does not exercise this path at all | M | low |
| **G3** | **P12 — UTF-8 bytes for `string`** | **27.7×** on the compare; VL's `string` is 4 bytes/code point | OPEN | XL | high — `memory-gc-design.md §2.2` argues 4× denser but strictly *less* scannable under WasmGC |
| **G4** | **P13 — linear-memory backing for scalar arrays** | **3.41×** on matmul's kernel | OPEN | XL | high |
| **G5** | **P10 — `const` → immutable global** | one line; **measure whether an immutable cell lets binaryen fold the loop bound BEFORE writing the patch** | OPEN, correctly parked | XS | low |
| **G6** | **P6 — fuse `a/b` and `a%b`** | **1.99×** | **BLOCKED on a sign/edge grid** — `rem_s(INT32_MIN,-1)` returns 0 while `div_s` **traps** | S + grid | high as filed |

**REFUTED — do not re-file.** P4b BMH (refuted on three of its own numbers: table
build is 295 ns not 88; the gate is wrong; at its own 3.13× it still loses to
CPython by 1.43×; and `array.fill` has no emitter at all). P11 (**ruled upstream
#1325**; bare `wasm-opt -O` carries `mixed-width` identically). P9 (5.6% at the
default rung, **exactly zero at `-O` and above**; two supporting claims refuted
in-file). `flat` records as a compiler perf lever (targets the wrong half).

### 3e. Hygiene

| id | item | status |
|---|---|---|
| **H1** | **F5 — settle VL vs Vital** | OPEN, real. ~13 live sites; `lsp/package.json` `displayName` is a published surface |
| **H2** | **F9 — perf baseline vs the NATIVE binary** | OPEN. `scripts/p7-time.sh` is the closest reusable rig (CPU ms, output-equality asserted); not regression-gated |
| **H3** | **F-tiers residue** | OPEN but the row is **STALE** — `SELFHOST_DENO_RUN` no longer exists; the real residue is `cases_wasm_test.ts` executing under V8 |
| **H4** | **Close F4 / F6 / F7 / F9b** | **MOOT or STALE.** F7's only occurrence of `paramater` is the ROADMAP line filing it; F4's `m.validate()` is a binaryen-JS API the emitter no longer uses; F6 names a `deno task build` that does not exist |
| **H5** | **Doc corrections** | `perf-landscape.md` §1/§3/§4 stale; P7 must be split (1.135× shipped vs 4.6× open); ROADMAP Track A's `A-infer-null` and `A-infer-empty` Map/Set rows describe shipped work |

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
