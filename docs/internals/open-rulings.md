# Open owner rulings — the verified index

**This file is the single place a pending owner decision is recorded.** It exists because the
alternative failed measurably: a sweep of every design doc on 2026-08-03 turned up **54 candidate
"pending owner rulings", of which only 14 were real**. The other 22 (after de-duplication) were
already answered — several *in the same file as the filing*, one 350 lines further down, one in
`DECISIONS.md`, and one already SHIPPED in the Rust host. Three separate ROADMAP rows were found
stale in a single day for the same reason.

**So: a doc may FILE a question, but the status of that question lives HERE.** When a ruling is
made, record it here and in `DECISIONS.md`, and edit the filing to point at the answer rather than
leaving it phrased as open.

**Re-derive before quoting.** Every entry below was verified against the tree, not against the
sentence that produced it, and several filings were found to overstate their own blocked population
(A16's "81 of 244 cells" is stale — see its entry). The verification is folded into each entry.

---
## A. Something is BROKEN while these wait

These two are not preferences. In each case the language today accepts or miscompiles a program it should not, and the defect is reproduced in the entry.

Both were re-run by hand at `a36c91e3` rather than taken from the filings:

```vl
// A16 tag collision — SILENT. vl check rc 0, vl run rc 0, prints the WRONG branch.
type K = "aa" | "bb"
const x: K | string = "zz"
if x is K { print("WRONG: zz claimed to be K") } else { print("ok: not K") }
//        -> WRONG: zz claimed to be K
```

```vl
// N5 variance — the CHECKER accepts writing a non-Cat into a Cat[]. vl check rc 0.
type Animal = { name: string }
type Cat = { name: string, meow: i32 }
function stash(xs: Animal[], a: Animal) { xs.push(a) }
const cats: Cat[] = [{ name: "c", meow: 1 }]
stash(cats, { name: "dog" })   // accepted; `cats` now holds an element with no `meow`
```

The first is the worse of the two: a silent wrong answer at rc 0 on both commands. The second is
caught by the emitter in the shape above (`vl run` fails to build), but the CHECKER accepting it is
the soundness hole, and a shape that emits cleanly would be silent too.

### A16-tag-scheme-kind-vs-band

**A16 §7.1 — the litunion tag scheme: a 14th value-atom kind, or a third slot band (an ABI-wide tag re-base)**  
`docs/internals/litunion-compact-rep-design.md:446 (section heading :444; the ruling is stated at :303)`

**The question.** Still the same fork, but option (b)'s advantage is now smaller than §7.1 states, and the filing's own caveat is confirmed: with a declared alias for the flattened set, `K | K2` no longer boxes (verified — `type K/K2/KA` + `function f(): K|K2 { return "aa" }` then `x is K` prints `K`), so (b)'s unique coverage over (a) has shrunk to `K | string` (live, verified) plus the `hasNull`-gated `K|K2|null` niche (gate present: typecheck.vl:5963 `annUnionInnerTy(members, hasNull)`). Accurately: 'Given that flatten already removed the `K | K2` box, is one more atom kind (a) enough, or is the interned member-SET band (b) still worth an ABI-wide tag re-base to close `K | string` and the null-sibling niche?' Two staleness notes for whoever briefs it: ROADMAP.md:450 still says A16 is "blocked on three owner rulings" while ROADMAP.md:830 in the same file records the third as needing none and shipping — the same-file-contradiction pattern again; and #1320's melt finding (see the ref.i31 row) is decision-relevant evidence §7.1's sibling §5 does not carry.

**Options.** (a) 14th kind — `refArrSlotTag` +13→+14 and `mapSlotTag` +16→+17: two constants, 5 and 3 call sites; fixes F1 (atom store), F2 (narrowed read) and the `K | string` half of F3 (kind 13 vs kind 2 discriminate). (b) Third slot band — an interned litunion member-SET table, tags interleaved 3 ways instead of 2; fixes F3 completely but renumbers every union box tag in every program, producing a uniform all-BYTES corpus diff (#1300's calibration: 6 files moved on bytes from ONE vanished union row) that the doc says needs its explanation prepared BEFORE the A/B. (c) Status quo — keep the `string` alias and bolt a litunion leg onto each gate that needs one: rejected in §3 because the cost is proportional to the number of gates forever (7 of 42 `valueAtomKind` sites have the leg, 35 do not) and a missed gate is a silent miscompile. CAVEAT, re-derive before ruling: §7.1 justifies (b) by "Leaves `K | K2` broken and unrejectable", and that consequence is now STALE — slice C (#1306) flattened `K | K2` into a pure literal union that never boxes (§8.1), so (b)'s unique advantage now reduces to the shapes flatten excludes (the `K | K2 | null` niche behind §8.3's `!hasNull` gate). NOTE on "three owner rulings": the doc header (:5) counts §7.1, §7.2 and §7.3; §7.3 (what `K | K2` should MEAN) is NO LONGER live — ROADMAP.md:830 records "that last one needed no ruling and SHIPPED as slice C", so only §7.1 and §7.2 remain.

**Blocked while unruled.** Slice B, the box→atom READ boundary (F2, 16 INVALID-WASM cells) — "This slice should wait for §7's rulings" (:614) — and the compact rep as a whole. Also blocks F3, the `K | string` tag collision (`x is K` is TRUE for a plain `"zz"`), which §4 proves cannot be given a loud reject instead: rejecting the shape moves 12 RUN-OK cells DOWN and rejecting the operation takes another down, so it is not independently fixable.

**Reversible?** Reversible only by paying the renumbering again: picking (a) now and upgrading to (b) later means two ABI re-bases, each a uniform whole-corpus byte diff that is "the hardest kind of A/B to grade". No external ABI consumer is named — every consumer recompiles — so the cost is grading effort and re-baselined goldens, not a stranded artifact.

**Cost if taken.** (a) priced and independently verified: two constants (`refArrSlotTag` +13→+14, `mapSlotTag` +16→+17) over 8 call sites in one file plus arms in `valueAtomKind`/`unMemAtomKind`/`scalarTagOfKind`. (b) unpriced in lines; its stated cost is a whole-corpus uniform BYTES diff, calibrated against #1300 where ONE vanished union row moved 6 files.

**Cost of waiting.** Slice B stays parked by the doc's own instruction (:614) — 16 INVALID-WASM cells that are `vl check`-clean, confirmed live at HEAD by the F2 build. F3's `K | string` tag collision also stays live and SILENT (`x is K` true for `"zz"`), and §4 proves it cannot be given a loud reject instead (12 RUN-OK cells would move down). Note slice A shipped its mirror boundary (#1307, 525 cells UP) without any §7 ruling, so 'blocked on the ruling' is a choice about throwaway work, not a hard block.

<details><summary>verification</summary>

No ruling exists anywhere. `grep -n "RULED\|SHIPPED\|owner" docs/internals/litunion-compact-rep-design.md` → the only SHIPPED/ruled blocks are :476 (§7.3 → slice C #1306), :530 (slice A #1307) and :645; §7.1 at :446 carries no ruling. `git log --oneline -- docs/internals/litunion-compact-rep-design.md` → 1f7b4fc7 (#1305 filing), b7566067 (#1306), 8970dea6 (#1307) — nothing after touches §7. `grep -n "A16" DECISIONS.md` → only :26 and :65, both type-level literal-union entries, no tag-band decision. `git log --oneline -60 | grep -i 'owner\|ruling'` → the last recorded owner ruling in this area is 369c5a6d (#1300 preserve, 2026-07-29), which PRE-dates the filing. The newest doc in the family re-affirms it is live: unboxed-union-rep-design.md:522-525 (shipped #1320) says its phase 3 "re-opens the type-index questions `litunion-compact-rep-design.md` §7.1 hands to the owner". The defects it gates are live at HEAD: F2 witness (`type K = "aa"|"bb"; const x: K|f64 = "aa"; if x is K { const y: K = x }`) → `vl check` rc 0, `vl build` rc 1 `type mismatch: expected i32, found (ref $type) (at offset 0x117)`; F3 witness (`const x: K|string = "zz"; x is K`) → runs rc 0 and prints `K`. Cost claim verified: `grep -rn "refArrSlotTag(\|mapSlotTag(" compiler/*.vl` → exactly 5 + 3 real call sites (wasmEmit.vl:1842,1846,2585,2620,2729,2746,2769,2816) plus the two definitions at emit_classify.vl:14042/14055 — the doc's "two constants, 5 and 3 call sites" is accurate.

</details>

### N5-variance-defaults-and-surface

**N5 — mutable-container variance: what the A8/A9 defaults are, and how much of it is user-visible surface**  
`docs/internals/compiler-code-review.md:55 (section heading :53)`

**The question.** The DEFAULTS half is narrower than filed, because the owner has already written them down: docs/guide/language-todo.md:15-20 (the owner's own language TODO, which is what ROADMAP:780/:782 cites as '(TODO.md)') states 'Parameters should be Inexact by default and values Exact' and 'Readable and Writable … should be applied automatically during parameter inference'. So the live owner call is not 'what are the defaults' but: (i) is the Readable/Writable inference SILENT (no surface) as that note says, or does an author get a spelling to annotate around a rejection; and (ii) what is the policy for the programs that type-check today and would start failing — reject them, or grandfather with a warning? Also note collections-design.md:758-762 and :996-1013 require A9 to be co-designed with the List/Array representation work, so the ruling has a second consumer.

**Options.** The fix is designed, the defaults are the call: ROADMAP.md:780 sketches A8 as "Params Inexact by default (accept excess properties), values Exact" and :782 has A9 "applied automatically during parameter inference" — i.e. no new surface, at the cost of rejections the author cannot see coming or annotate around; the alternative is an explicit readable/writable (or exact) annotation surface the author writes, which is teachable and localizable but adds type-level syntax to the language. Either way the choice decides which programs that type-check TODAY start failing. Note this repo uses "maintainer" and "owner" interchangeably (ROADMAP.md:739 files error-handling-design.md's "Open questions for the owner" as "flagged for the maintainer").

**Blocked while unruled.** The "fully statically sound" claim, and the A8/A9 implementation itself. The hole is live and verified: `Cat[]` → `Animal[]` passes the write checks clean and emits invalid wasm.

**Reversible?** Poorly. Variance defaults are load-bearing for every program that type-checks today; tightening them later rejects previously accepted code, and loosening them later re-opens the soundness hole. The annotation-surface half is additive and therefore cheaper to revisit than the default.

**Cost if taken.** Unpriced — no line/file/PR estimate exists in ROADMAP, DECISIONS, compiler-code-review.md or collections-design.md; every reference is a design sketch. The only sizing signal is negative: it is checker work with no existing scaffolding (zero variance code in compiler/).

**Cost of waiting.** The `Cat[]` → `Animal[]` write hole stays silently accepted and emits invalid wasm (verified above), and it is not even pinned as an xfail — `ls tests/cases/soundness/xfail-*` shows nine xfail fixtures, none about container variance, and docs/guide/soundness.md's 'Known-unsound corners' section lists only the arithmetic hole-operand rule. So the gap is live, undocumented in the soundness corpus, and the 'fully statically sound' claim stays unearned. Readonly-field exports (modules-design §5 point 4, webcraft-requirements:834) stay blocked on it too.

<details><summary>verification</summary>

The hole is live and I reproduced it at HEAD. Witness (`type Cat = {name: string, lives: i32}` / `type Animal = {name: string}` / `function widen(a: Animal[]) { a[0] = {name:"dog"} }` / `widen(cats)`): `vl check` rc 0 (one HINT, no error), `vl build` rc 1 — `type mismatch: expected (ref $type), found (ref $type) (at offset 0x14d)`, i.e. `vl check`-clean invalid wasm exactly as filed. No machinery exists: `grep -rni "inexact\|variance" compiler/*.vl` → zero hits (only 're-readable' false positives). ROADMAP:780/:782 both still ⬜ for A8 and A9. `grep -n "A8\|A9" DECISIONS.md` → only :116 and :250, both of which point AT the open A9 question rather than answering it. Adversarial check on the containing file: docs/internals/compiler-code-review.md IS stale in its neighbors — its 'In flight' N18 wasmEmit split has shipped (compiler/emit_base.vl, emit_classify.vl, emit_rep.vl, emit_sections.vl … all exist) — but N5 itself is not stale; the behavior still reproduces.

</details>

---

## B. Blocks real work, nothing broken

Work is parked on these, but nothing currently misbehaves.

### A16-ref-i31-vocabulary

**Does `ref.i31` enter the emitter's instruction vocabulary?**  
`/workspace/docs/internals/litunion-compact-rep-design.md:461 (also :382, /workspace/ROADMAP.md:831-833)`

**The question.** Same fork, but the case for "yes" is weaker than the filing states and one of option (b)'s premises is gone. The filing says i31 "is the only encoding that does not regress allocations" and that answering no "effectively cancels the feature". Both were written when the compact rep was still a performance change. #1305 §6 already refuted the allocation rationale (the store is one `struct.new`; the payload is a pooled `global.get`), and #1320 refuted the melt rationale ("Nothing melts by changing the payload"; the lever is construction-site count, shipped as #1322/#1337). So cancelling the compact rep costs correctness only, not performance, and the honest question is: is `ref.i31` worth raising the engine-support floor for every VL program in order to close the `K | string` collision and slice B's 16 cells — when a plain 14th tag code in the existing struct/array vocabulary closes the same cells without any new instruction family?

**Options.** (a) Yes — measured available in wasm-tools' shipped set, V8 and wasmtime 47, and it is the only encoding that does not regress allocations; but it is the first non-struct, non-array GC instruction family the emitter would use, raising the engine-support floor for every VL program. (b) No — the alternative `$vbI32` payload box is a measured allocation REGRESSION, so 'no i31' and 'compact rep' are close to mutually exclusive, i.e. answering no effectively cancels the feature.

**Blocked while unruled.** Same population as the tag-scheme ruling: the compact rep and slice B (box→atom READ, 16 cells). It cannot be built without an answer because the encoding choice is the build.

**Reversible?** Yes, at the cost of a second rep migration: dropping i31 later means re-encoding the box again (another emitted-bytes change). Adopting it also permanently widens the engine conformance the toolchain assumes.

**Cost if taken.** Unpriced in lines. Named costs: a new builder pair (`fbI31New`/`fbI31Get`) beside the three existing ones, `atomIsRefKind` (wasmEmit.vl:2414) becoming a three-way payload discipline consumed at 8 unbox sites (from #1320 §5.4). The alternative `$vbI32` route is priced qualitatively as "allocates twice" (an allocation regression).

**Cost of waiting.** Same reduced population as the tag-scheme row: slice B's 16 `INVALID-WASM` cells and the `K | string` silent collision (both re-verified live above). Nothing else. The perf work this ruling was once thought to gate has already been collected by a different route (#1318 `-O3` profile, #1322/#1337 box sink), so waiting no longer costs performance.

<details><summary>verification</summary>

`grep -rn 'i31' /workspace/compiler/*.vl` → zero hits (rc 1), so the vocabulary claim still holds exactly. No ruling in DECISIONS.md or CHANGELOG.md. BUT a LATER design doc the filing does not cite has since surveyed the same instruction family: `docs/internals/unboxed-union-rep-design.md` (#1320, commit 210055bc, master `0ab94642`) evaluates `ref.i31` as candidate (a) and concludes at :528 "**Not recommended at any phase: `ref.i31` (a)** … (a) does not melt", with :254 adding "31 bits cannot hold VL's full-range `i32`" and :453 noting no `fbI31New`/`fbI31Get` builder exists beside `fbStructNew`/`fbStructGet`/`fbRefCast` (emit_bytes.vl:574,580,639). That refusal does not transfer on its merits — A16's i31 would carry an interned ATOM ID (a small dense int), not a full i32 payload — but it is a second, later, measured position by the same project against the same family, and #1320 §6 explicitly re-points at `litunion-compact-rep-design.md` §7.1 as still owner-held, which independently confirms §7.1/§7.2 are unruled.

</details>

### f64-as-i32-out-of-range

**Out-of-range `f64 as i32` — trap, saturate, or wrap**  
`/workspace/ROADMAP.md:748-754`

**The question.** Accurate, with two small corrections. (1) The filing's own example does not compile: `1e30` is `undeclared identifier 'e30'` (verified) — scientific notation does not lex, which ROADMAP already notes as a separate small gap, so any diagnostic work here must use a plain-decimal witness. (2) The backtrace is no longer bare: the trapping frame now symbolizes as `vl!go` and the trap reason prints as `wasm trap: integer overflow`. It still carries no source location, so the diagnostic half of the ask stands, but it is a missing span rather than an unreadable `<wasm function 5>`.

**Options.** (a) Keep the trap (`i32.trunc_f64_s`) — defensible under the 'traps are for bugs' model, but must gain a source-located diagnostic instead of a bare `wasm backtrace: vl!<wasm function 5>`. (b) Saturate (`i32.trunc_sat_f64_s`, Rust's answer, `2147483647`) — total function, no trap, silently clamps a bug. (c) Wrap (JS's answer, `1215752192`) — matches JS-origin ports, silently wrong for everyone else. All three are one opcode/lowering choice; the neighbours genuinely diverge, so no measurement decides it.

**Blocked while unruled.** Nothing is compiled-blocked — the behaviour ships today by accident. What is blocked is documenting the cast semantics at all, the missing diagnostic, and any consumer (e.g. webcraft's determinism-critical numeric code) reasoning about the edge.

**Reversible?** Semi-reversible and asymmetric: trap→saturate later silently changes the results of already-shipped programs; saturate→trap later turns running programs into traps. Cheapest to rule before it is documented and depended on.

**Cost if taken.** Stated as one opcode/lowering choice (`i32.trunc_f64_s` → `i32.trunc_sat_f64_s` at emit_bytes.vl:465, plus the i64 twin at :475). The diagnostic half is unpriced. No line count is given anywhere for the source-located-diagnostic work, which is the larger of the two.

**Cost of waiting.** Nothing is compiled-blocked — the trap ships today. What degrades: the cast's semantics stay undocumented in DECISIONS.md while programs are being written against them, so the trap→saturate direction gets more expensive with every consumer (the filing's own asymmetry argument). Concretely blocked: writing the semantics down at all, the source-located diagnostic, and webcraft's determinism-critical numeric code reasoning about the edge.

<details><summary>verification</summary>

Repro: `const d: f64 = 100000000000.0; const i = d as i32` → `vl run` rc 1, `Error: error while executing at wasm backtrace: 0: 0xc0 - vl!go / 1: 0xca - vl!<wasm function 6>` / `Caused by: wasm trap: integer overflow`. Emitter confirmed trapping-only: `compiler/emit_bytes.vl:463-465` emits `OP_I32_TRUNC_F64_S` with the comment "truncate toward zero (trapping)", :473-475 the i64 twin; the only `trunc_sat` mention in the whole compiler is `wasmEmit.vl:8781`, a comment about opcode-space numbering, not an emission. No ruling in DECISIONS.md. ROADMAP.md:748-754 still reads "REMAINING is a SEMANTICS + DIAGNOSTIC item" with the three-way fork open.

</details>

### O-release-rung-default

**Which optimizer rung IS the release profile — `-O3`, `-O`, or per-program**  
`docs/internals/p9-inlining-notes.md:64 (corroborated at docs/internals/perf-landscape.md:166-172 and :804-808)`

**The question.** Genuinely open as asked, minus one clause: the 'cheap fix that should precede any further -O3-based recommendation' (the -O column + the two distinct flags) already shipped in bench/run.sh, so the question is now 'given a three-rung harness that exists but has not yet produced an authoritative recorded sweep, does -O3 stay the single named release profile, does -O take it, or is the answer per-program?' The melt evidence for keeping -O3 is one fixture (union-box-branch-local 4/4/2), not two.

**Options.** (a) KEEP `-O3` as the release profile — retains its large wins (`lambda-hot` 2.2x better than `-O`, `dispatch-table` 1.43x, `mandelbrot` 1.28x) and keeps the shipped `RELEASE_PASSES`/melt goldens untouched; cost: `arrays/sort-heap` stays 1.32x (landscape §2.4a) to 1.43x (p9) slower than `-O` and a dead heat with the UNOPTIMISED build, and the rung is ~50% slower to produce and ~1.3 KB bigger than `-O` on the 1.1 MB compiler (19.5s/919,547 B vs 13.1s/918,258 B, opt-profile §5). (b) MAKE `-O` THE RELEASE RUNG — recovers sort-heap, cheaper and smaller on large modules; cost: forfeits `-O3`'s wins where they are biggest and loses the melt rows that only the closed-world/repeat rung reaches (`union-box-branch-local` 4→2 and `list-wrapper-push` 4→2 are `-O3`-only, opt-profile §2/§3). (c) SHIP BOTH AND MAKE THE BEST RUNG DISCOVERABLE (add the `-O` column to `run.sh`, publish per-program guidance) — honest to the measurement, but pushes a per-program measurement onto every user and leaves 'the release profile' unnamed. NOTE opt-profile §7.6's ruling does NOT cover this: it adopted (d) report-upstream for the loop-rotation class, and the landscape explicitly separates sort-heap as 'a profile question rather than an upstream one'.

**Blocked while unruled.** Every `-O3` multiple quoted in perf-landscape §3/§4 has to be read as 'versus unoptimised, never versus the best we can do', so no further `-O3`-based recommendation can be made; and P9 (emitter-side inlining) cannot be scheduled or dropped, since it is worth ~5.6% at the default rung and exactly zero at `-O` and above.

**Reversible?** Yes, cheaply in code — the rung is `RELEASE_PASSES` in `scripts/vl-host/src/main.rs` plus goldens in `tests/selfhost_native_release_test.ts`. What does not reverse is guidance already published and artifacts already shipped at the previous rung, and each flip costs a re-pin of the melt and loop-shape tables.

**Cost if taken.** One line: `RELEASE_PASSES` at scripts/vl-host/src/main.rs:1493 (`OPT_PASSES` at :1471 is the other rung). Goldens do NOT need re-measuring — MELT_TABLE (8 fixtures) and LOOP_TABLE (3 fixtures) in tests/selfhost_native_release_test.ts:102-175 already carry none/-O/-O3 columns, so a flip re-labels which column is authoritative. Published guidance would move in docs/internals/cli-design.md:311, opt-profile-design.md (title + §5), webcraft-requirements.md:502-505 and P1.4's 'ship at vl build -O3' decision order. Measured rung deltas on the 1.1 MB compiler (opt-profile §5): -O 918,258 B / 13.1 s vs -O3 919,547 B / 19.5 s.

**Cost of waiting.** sort-heap keeps handing back a 1.32x (perf-landscape §2.4a: 854/648/837) to 1.37x (bench/findings/three-rung-sweep.tsv: 858/602/827) win, and the latest post-P5 sweep still records it only as default 904.0 / -O3 918.9 with no -O column, so the best rung is unrecorded suite-wide. Every -O3 multiple in perf-landscape §3/§4 must be read as 'versus unoptimised'. P9 cannot be scheduled or dropped (5.6% at the default rung, exactly zero at -O and above).

<details><summary>verification</summary>

(1) `git log --oneline -S'RELEASE_PASSES' -- scripts/vl-host/src/main.rs` -> ONE commit, ad9734ac (#1318); `sed -n '1493p' scripts/vl-host/src/main.rs` -> `const RELEASE_PASSES: &[&str] = &["--closed-world","-O3","--gufa","-O3"];` — never changed, so no commit closed it. (2) `grep -rn -i 'ruling' docs/internals/opt-profile-design.md` -> only §7.6, whose text is 'The profile is not wrong as shipped... RELEASE_PASSES and OPT_PASSES are unchanged' for the LOOP-ROTATION class, where both rungs are equally bad; perf-landscape.md:806 separates the sort-heap class explicitly ('That one IS a profile question rather than an upstream one'). (3) `sed -n '352,365p' ROADMAP.md` -> 'Do not answer this ask with a single recommended flag until the per-program split is either fixed or documented as the answer.' — a live instruction, not a ruling. (4) BUT one third of option (c) HAS SHIPPED: `sed -n '318,325p;612,624p' bench/run.sh` -> the harness now builds `vl-build-O` and raises `OPT-LOSES` / `O3-WORSE-THAN-O` as distinct flags (landed in 7f457f27), so perf-landscape §2.4a's headline 'THE HARNESS HAS NEVER BUILT -O' and p9-inlining-notes.md:94 'Adding the -O column is the fix' are STALE against HEAD. (5) The recorded sweep still predates it: `grep -c 'vl -O |' bench/results/summary.md` -> 0; header is `| benchmark | rust | vl | vl -O3 | deno |`. (6) Two filed melt quotes are wrong: MELT_TABLE (tests/selfhost_native_release_test.ts:102-131) reads `list-wrapper-push` none/O/O3 = 6/3/2, not '4 -> 2'; only `union-box-branch-local` (4/4/2) is genuinely -O3-only.

</details>

### O-default-build-optimizes

**Whether the DEFAULT build path optimizes at all (and whether `vl run` gets a rung flag)**  
`docs/internals/perf-landscape.md:874-888`

**The question.** Same question, correctly priced: the §6 '-O3 gap' defect list is now TWO live rows (struct-field 2.92x, lambda-hot 3.01x), not four — and the two that died were closed by option (d), emitter work (#1324 return_call, #1326 closure dispatch). So the honest framing is 'is the remaining two-row gap worth making the default build ~40x slower (9 ms -> ~380 ms) and dependent on a binary whose absence is a silent no-op, when the emitter route has demonstrably burned down half the table in five items?'

**Options.** (a) LEAVE THE DEFAULT UNOPTIMISED — a build stays ~9 ms instead of ~380 ms, there is no hard dependency on a `wasm-opt` binary (which today is a SOFT NO-OP that writes the unoptimised module and exits 0 when missing), and the measured up-to-2.4x rotated-loop penalty is never imposed on anyone; cost: every user and the self-hosted compiler keep paying the documented gaps (`collections/struct-field` 2.90x, `algorithms/map-filter-reduce` 1.80x, `recursion/mutual` 1.23x), which §6 files as a DEFECT against the project's own 'users must not need hacks' law. (b) OPTIMIZE BY DEFAULT — closes those gaps for everyone; cost: ~380 ms per build, a toolchain dependency whose absence is silent, and it hands every tight scalar loop binaryen's loop rotation, measured up to 2.4x SLOWER under wasmtime (an upstream Cranelift defect that opt-profile §7.6 rules is 'not ours' and expects to close from underneath us). (c) WIRE ONLY `-O`/a rung flag INTO `vl run` — partial, and immediately re-raises O-release-rung-default. (d) CLOSE IT IN THE EMITTER (P2 shipped; P9 ~5.6% and default-rung-only) and keep the default unoptimised.

**Blocked while unruled.** P9's disposition — the notes re-file it as 'a default-rung ergonomics fix, and it should be quoted that way or not scheduled', which is only decidable once the default rung is settled; and whether the `-O3`-gap table in §6 is a defect list to burn down or an accepted property of the toolchain.

**Reversible?** Yes — it is a CLI default in `scripts/vl-host/src/main.rs:1355-1372`. But it moves every build's wall clock including CI and the self-compile, so a flip in either direction is felt project-wide immediately, and artifacts already distributed under the old default are not retroactively changed.

**Cost if taken.** (b) is the 4-line dispatch at scripts/vl-host/src/main.rs:2399-2404 plus the soft-no-op path at :1507-1521 becoming load-bearing; (c) is one arm in run_cmd's arg loop (:1637-1651). Wall-clock cost is measured: +220 to +395 ms per build (summary.md compile-time table). No line-level estimate is recorded in any doc; the docs price it only as 'a CLI default'.

**Cost of waiting.** Every default build and every `vl run` (which has no rung flag at all) keeps paying collections/struct-field 2.92x and algorithms/lambda-hot 3.01x, filed at perf-landscape §6 as a DEFECT against the project's own 'users must not need hacks' law. P9's disposition stays undecided, since 'a default-rung ergonomics fix' is only quotable once the default rung is settled.

<details><summary>verification</summary>

(1) Live at HEAD, scratchpad: `vl build t.vl` -> 189 bytes; `VL_WASM_OPT=... vl build t.vl -O` -> 92 bytes; `-O3` -> 91 bytes. The default path does not optimize. (2) `sed -n '2399,2404p' scripts/vl-host/src/main.rs` -> `if args.iter().any(|a| a == "-O3") { optimize_in_place(..., RELEASE_PASSES) } else if ... "-O" ...` — nothing else. `grep -n 'fn run_cmd' -A 25` (:1627-1651) -> the run arg loop matches only `--compiler`, `-e`, `--batch`; no rung flag. NOTE the filing's cite `main.rs:1355-1372` is stale — that range is `run_batch`'s output sink. (3) No ruling: `grep -n -i 'release profile|wasm-opt|optimiz' DECISIONS.md` -> H4/H4.1/H4.5 rule wasm-opt is an OPTIONAL external optimizer and B-validwasm exists so it can be SKIPPED; that constrains toward (a)/(d) but decides nothing about the default. `git log -S'optimize_in_place' -- scripts/vl-host/src/main.rs` -> #282, #430, #1318 only; none flips the default. (4) THE FILING'S PRICING IS HALF DEAD. Against bench/results/summary.md (sweep of 2026-08-03, post P1/P2/P3/P4a/P5): recursion/mutual 829.0 vs -O3 827.2 (was 1560.3/1269.9 = 1.23x — GONE, P1 return_call); algorithms/map-filter-reduce 642.1/575.1 = 1.12x and now a WIN vs deno (was 1.80x); algorithms/lambda-hot O3-GAP-3.01x (was 11.81x, P2); only collections/struct-field holds at O3-GAP-2.92x (was 2.90x). (5) Build-cost claim confirmed: summary.md compile-time table, `vl build` 7.4-14.0 ms vs `vl build -O3` 231-406 ms.

</details>

---

## C. Ergonomics, naming and future extensions — blocks nothing

Genuine decisions, none of them urgent. Several will be forced by a later slice (the error-shape name lands with `std:fs`); the rest can wait indefinitely.

### strings-build-and-interpolation-surface

**OQ-1 — the string-building surface: builder type, interpolation syntax, `std:fmt`, or which mix**  
`docs/guide/strings-design.md:915 (section "## Open questions for the owner" :875)`

**The question.** Accurate as filed, with the residue narrowed by the tree: the perf trap is closed (B7b) and 3 of the 5 core-vs-std method placements are settled by shipping (split/join/repeat in std/fmt.vl; slice/indexOf in core). What remains for the owner is (i) a builder type for the accumulations fusion cannot prove, (ii) whether any interpolation LEXICAL form is adopted at all, (iii) a `std:fmt` `format(...)` — which is the cheapest of the three and needs no ruling beyond 'yes' — and (iv) where `trim`/`replace` live. Do not re-file the O(n²) build trap; it is fixed.

**Options.** A builder/`StringBuilder` type — amortized O(1) append with one final `.toString()`, covering the cases the shipped B7b accumulation fusion cannot see, no new syntax. Interpolation syntax — `f"…{x}"` or backticks, pure ergonomics but a new lexical form and the stickiest commitment. A `std:fmt` `format("Hello {}", name)` — no new syntax, and `std:fmt` already exists. They are explicitly NOT mutually exclusive; the doc recommends builder first, interpolation later, `std:fmt` backing both, and hands the mix and the syntax to the owner. Partly OBE, do not re-file it whole: the perf half is DONE (B7b fusion makes `s = s + e` in a loop O(n)), and the sub-item "also to assign (core vs `std`): split / join / trim / replace / repeat" is already answered for three of five — `split`, `join` and `repeat` ship in std/fmt.vl (:101, :86, :59); only `trim`/`replace` are unplaced.

**Blocked while unruled.** Nothing is broken — the O(n²) build trap was closed by B7b without a surface change. What is blocked is the ergonomic half of the string story (a builder for the cases fusion cannot prove, and any formatting/interpolation surface at all).

**Reversible?** Split. A builder type or a `std:fmt` function is additive and replaceable. An interpolation form is a lexical commitment — once programs are written in it, it cannot be withdrawn, only deprecated.

**Cost if taken.** Unpriced. Rough shape from the tree: `format(...)` is std-only (std/fmt.vl already exists and already does i32/i64/boolean rendering); a builder type is std plus possibly emitter support to beat the shipped fusion; interpolation is lexer + parser + emit, the only one touching the grammar.

**Cost of waiting.** No correctness or perf cost — the O(n²) loop is fused (B7b) and `s = s + e` stays the idiom. What stays absent is any formatting surface at all: a program building a message today writes `+` chains with `std:fmt.toStr`, and `trim`/`replace` have no home. Interpolation is the one option with a one-way cost, so waiting is cheap for it specifically.

<details><summary>verification</summary>

Open, and the filing's own OBE caveats check out. docs/guide/strings-design.md:915-937 carries the question with recommendations and no ruling. `grep -rn "StringBuilder\|interpolation" ROADMAP.md CHANGELOG.md DECISIONS.md` → exactly one hit, DECISIONS.md:314 — 'A builder type + interpolation sugar remain OQ-A's open ergonomic halves. (B7b)' — which re-states the question as open rather than answering it. Perf half DONE, verified: DECISIONS.md:300-314 records B7b, and `ls tests/cases/strings/ | grep accum` → 8 fixtures (accum-basic, accum-empty, accum-adv-reads-s, accum-adv-reset, accum-adv-other-read, accum-seed-chain, accum-serializer, accum-tostring). Method placement verified at the exact cited lines: `grep -n "export function" std/fmt.vl` → toStr:46, repeat:59, padLeft:72, join:86, split:101 — so split/join/repeat ARE placed; `grep -rn "trim\|replace" std/*.vl` → no trim/replace anywhere, and `slice`/`indexOf` are core builtins per DECISIONS.md:316-320. There is no `format(...)` in std/fmt.vl.

</details>

### strings-char-type

**Strings OQ-B — is the `s[i]`-is-an-i32 papercut worth a dedicated `char` type?**  
`/workspace/docs/guide/strings-design.md:941 (the decision sentence at :952)`

**The question.** Restated with the option costs corrected: the filing calls (b) "additive sugar and reversible", and it is not. There is no range/slice-index syntax in VL at all — `grep -rn 'RangeExpr|DotDot|\"\\.\\.\"' compiler/*.vl` finds only path-segment handling in driver.vl:1745 — so `s[0..1]` mints a new expression form, i.e. (b) is a GRAMMAR change just as (c) is a type change, and only (a) is free. And (a) is not merely "keep i32": the string→one-char route already exists as `s.slice(0,1)` (DECISIONS A7, typecheck.vl:12211), so the accurate question is whether the papercut justifies new SYNTAX (b) or a new PRIMITIVE (c) when a method spelling already covers it.

**Options.** (a) Keep `i32`, use the existing `fromCodePoint(c)` idiom — consistent with the already-DECIDED char-literal model, no new type; the papercut stays (`"x" + s[0]` does integer arithmetic, not concatenation). (b) Keep `i32` and add one-char-slice sugar `s[0..1]` yielding a string — the doc's recommendation; small, additive, leaves the decided model intact. (c) A `char`-as-1-char-string type (Swift `Character` flavour) that concatenates directly — the largest change; the doc notes UTF-8 storage tilts against it, since over UTF-8 the element is a decoded code point for which a bare `i32` is the more honest fit.

**Blocked while unruled.** Nothing is blocked; this is a live ergonomic papercut in today's language (`s[i]` is an `i32` today), not a capability gap.

**Reversible?** (b) is additive sugar and reversible. (c) mints a new primitive type in the surface language and is effectively permanent — and it would sit against the already-decided "`'a'`, `s[i]` and a decoded element are all `i32` code points" model, so it is the choice that has to be made deliberately rather than drifted into.

**Cost if taken.** Unpriced. Neither strings-design.md nor DECISIONS.md nor ROADMAP.md carries a line/file estimate for any of the three options; my own reading is that (b) needs lexer + parser + checker + emitter work for a range form that has no other user in the language, but that is my estimate, not a measured one in the tree.

**Cost of waiting.** Nothing is blocked; the papercut is live and unchanged — `"x" + s[0]` does integer arithmetic on a code point rather than concatenating, with `fromCodePoint(s[0])` and `s.slice(0,1)` as the working idioms. One thing does drift: strings-design.md's whole storage story (UTF-8 + ASCII flag) is unimplemented — DECISIONS.md:306 says storage is still `array i32` of code points, "frozen until self-hosting" — so if the storage decision ever executes, the `char` question should be re-derived against UTF-8 rather than against today's i32-array, which is the tilt 1b374374 already recorded.

<details><summary>verification</summary>

The premise holds in today's tree and no ruling exists. `sed -n '1,30p' tests/cases/strings/basics.vl` → `print(s[0])` with the pinned expectation `// @log 104`, i.e. `s[i]` is an i32 code point (the header says "a `string` is a WasmGC i32-array of char codes… `s[i]` (array.get → char code)"). `grep -n '\"char\"' compiler/*.vl` → nothing: there is no `char` type. The already-decided char-literal model is not just decided but load-bearing in the compiler's own source — compiler/lexer.vl:365 `if e == '\''` and :593 `if quote == '\''` compare char literals as i32. `fromCodePoint` exists (typecheck.vl:12591, tests/cases/strings/from-code-point.vl). No later ruling: `grep -n 'OQ-B|char type' DECISIONS.md ROADMAP.md` → nothing; strings-design.md's only later edit anywhere near this is 1b374374 "tilt OQ-B to i32", which is a recommendation, not a ruling.

</details>

### buffer-scalar-arg-accessors

**Per-width scalar-argument accessors (`getF32At(base, length, i)`) — widen `std:buffer`'s public surface, or leave the 3.0x to hand-written loops**  
`docs/internals/buffer-design.md:2120 (section §M4, heading :2071); indexed at ROADMAP.md:424`

**The question.** Accurate as filed. One refinement worth handing over: the measurement now separates the two costs, so the ruling is not 'is the fence too expensive' — §M4 prices six bounds compares at 0.140 ns/element (11%) and the seven descriptor field reloads at 1.095 ns (89%). The accessor would sell the HOISTING, not the fence removal, and the same hoisting is what ROADMAP B6b (backing-pointer LICM) would deliver in the compiler instead — so the honest fork is 'std surface now, or wait for B6b's LICM to make the plain view spelling fast'.

**Options.** Ship it — one function per width, ZERO compiler lines, and it puts the measured fast shape behind the std surface: 3.0x on the fenced two-view kernel, with the bounds fence costing only ~0.023 ns per compare (the field RE-READ, not the check, is 89% of the view spelling's excess). Don't ship it — the same win is reachable today by hand (hoist `byteAddrF32(0)` and `.length`, then bare `__load_f32__`/`__store_f32__`: 0.296–0.500 ns/element at all three optimizer rungs), and `std:buffer` avoids four more public names plus the §L6a size tax. The doc is explicit that this fixes nothing — it is pure surface.

**Blocked while unruled.** Nothing. It is additive, and the measured win is available by hand today; the doc and ROADMAP both file it as "NOT shipped" pending the ruling rather than as a blocked defect.

**Reversible?** Asymmetric. Not adding it is fully reversible. Adding it is close to one-way: a public `std:buffer` name is consumer-visible surface, and removing it later breaks callers.

**Cost if taken.** Priced by the doc and consistent with the code: one function per width, ZERO compiler lines (`getF32At(base, length, i)` + three siblings). Ongoing cost is §L6a's measured size tax — +162 bytes per width family on EVERY program importing `std:buffer`, used or not (bisected: 1076 → 1336 → 1498 bytes), which goes to zero at `-O3 --closed-world` (394 bytes either way). Win: 3.0x on the fenced two-view kernel.

**Cost of waiting.** Nothing degrades. The same 3.0x is reachable by hand today (hoist `byteAddrF32(0)` and `.length`, then bare `__load_f32__`/`__store_f32__`: 0.296–0.500 ns/element at all three rungs), and the shape is already documented for the consumer at webcraft-requirements.md:596-618. Not adding it is fully reversible; adding it is public surface that cannot be withdrawn — the asymmetry argues for leaving it open until a consumer actually asks.

<details><summary>verification</summary>

Unshipped, freshly filed, and not covered by any earlier buffer ruling. `grep -n "export function" std/buffer.vl` → 25 exports (Buffer, bufferMark/Release, load*/store*/store8/store16, fill, copyFrom, f32view/i32view, getF32/setF32/getI32/setI32, the four `"[]"`/`"[]="` operator functions, byteAddrF32/byteAddrI32) — no `getF32At` or any scalar-argument accessor. `grep -rn getF32At std/ compiler/` → zero; the identifier exists only in docs (buffer-design.md:2120, ROADMAP.md:424, webcraft-requirements.md:610). The filing is one day old: `git show --stat 18598d15` → 'docs(vl): webcraft P1.4 … (#1338)', 2026-08-03, and its diff to buffer-design.md is what added §M4's ruling paragraph. Buffer's own owner-question section §D (O1–O7, doc lines 404-570) is fully RULED and shipped in S5 (§J) and does not cover this; no §M5/M6/M7 heading rules it either.

</details>

### collections-list-array-naming

**Collection type NAMES (`List`/`Array`) and whether a representation-forcing annotation exists**  
`/workspace/docs/guide/collections-design.md:1112,1118-1120 (also /workspace/ROADMAP.md:952-953)`

**The question.** Accurate as filed. Worth noting the surrounding decision is already made and recorded, which narrows this: §OQ.1's main question ("`[...]` is the collection literal and `T[]` the type") is marked "**DECIDED this review (no longer open)**" — so this is a genuinely residual sub-point, not an open surface design.

**Options.** (a) Keep `T[]` + inference as the whole surface (today's committed position) — one spelling, no way to pin a representation when the inference is conservative. (b) Expose `List`/`Array` as real type names — familiar and explicit, but they become collidable identifiers and two vocabularies for one concept; the doc also warns `Array<T>` is already double-booked between the safe fixed representation and the future low-level escape (§OQ.7 name clash). (c) Add only a forcing annotation without exposing the names — keeps the surface small but invents a third spelling. Pure naming/surface taste; measurement cannot decide.

**Blocked while unruled.** Any user-facing forcing annotation for representation inference; the §OQ.7 `Array<T>` name clash stays unresolved; the collections chapter cannot be written down as a committed surface.

**Reversible?** Reversible only while uncommitted — the doc keeps the names deliberately unexposed for exactly this reason; once a name is public it is effectively permanent.

**Cost if taken.** Unpriced. Neither doc states lines or a migration cost for exposing the names or for adding a forcing annotation.

**Cost of waiting.** Nothing runs worse. `T[]` + inference is the committed and shipped surface; the only thing blocked is a user-facing way to pin a representation when §VL.7's inference is conservative — and §VL.7's inference itself is unimplemented (ROADMAP.md:950-951 marks representation inference "DECIDED direction; open compiler work"), so there is nothing yet for a forcing annotation to override. Waiting is close to free and, per the doc's own reasoning, is the point: the names stay uncommitted precisely so they stay reversible.

<details><summary>verification</summary>

Genuinely unruled and the cost of option (b) is verifiable: `type List = { a: i32 }` and `type Array = { b: i32 }` declared together compile and run, rc 0 — both names are free user identifiers today, so exposing them as builtin type names is a real source-breaking collision, not a hypothetical. No forcing annotation exists (`collections-design.md:1112-1120` §OQ.1 "Open sub-point (deliberately uncommitted)"; `ROADMAP.md:952-953` "**Naming & forcing surface — UNCOMMITTED**" — the two agree, so no stale-row divergence). The §OQ.7 `Array<T>` double-booking (safe fixed representation vs low-level escape) is still recorded at collections-design.md:1188-1196 with the explicit "**Name-clash warning**", unresolved.

</details>

### collections-value-vs-reference

**Value vs reference semantics, language-wide (reference everywhere vs uniform COW)**  
`/workspace/docs/guide/collections-design.md:1121-1128 (also /workspace/ROADMAP.md:954)`

**The question.** Accurate as filed. The one thing worth sharpening: this is not really pending in the sense the others are — it is a committed v1 default (reference) with a documented alternative, not an unmade choice blocking work. The decision the owner would actually be making is whether to ever REOPEN it, and the doc's own framing ("decided once language-wide", "do not bolt COW onto `List` alone") already says the answer must be all-or-nothing.

**Options.** (a) Reference everywhere — today's v1 default, consistent with VL now and with Python/JS/Java; aliasing surprises remain. (b) Value everywhere via COW (Swift) — nothing is mutated through an alias, cheap via COW, but it must be applied uniformly and it erases the alias-unioning cost in representation inference, so it changes the compiler's analysis model too. Explicitly NOT bolt-on: 'Do not bolt COW onto `List` alone.'

**Blocked while unruled.** Nothing today (v1 ships reference). It gates the co-design of representation inference (whose alias-unioned analysis is 'the part value-semantics would erase') and any coherent COW story later.

**Reversible?** Very hard to reverse — it is a language-wide semantic default; flipping it after programs exist changes the meaning of every mutation through an alias.

**Cost if taken.** Unpriced, and the doc is explicit that it cannot be scoped small: COW must be applied uniformly to structs/objects and collections, and it changes the compiler's analysis model by erasing the alias-unioning in §VL.7 representation inference.

**Cost of waiting.** Nothing today — v1 ships reference and the behavior is verified. The only accruing cost is the one the filing names: §VL.7's alias-unioned representation inference is being designed around aliasing that value semantics would erase, so every hour spent building that analysis is spent on work COW would partly discard. Since that analysis is still unimplemented (ROADMAP.md:950-951), that cost has not yet started accruing.

<details><summary>verification</summary>

The v1 default is confirmed in code by behavior: `const a = [1,2,3]; const b = a; b[0] = 99; print(a[0])` → prints `99`, rc 0 — mutation through an alias is visible, i.e. reference semantics. Filed consistently in both places with no contradiction: `collections-design.md:1121-1128` ("**Value vs reference — language-wide (default reference).**" … "Do not bolt COW onto `List` alone.") and `ROADMAP.md:954` ("**Language-wide, still open** — value-vs-reference (default reference), error model"). No later ruling: `grep -n "copy-on-write|COW" DECISIONS.md` finds no entry. Note the sibling clause on that ROADMAP line — "error model" — HAS since been ruled (error-handling-design.md O1, "RULED (2026-07-26, owner): BLESSED"), so that ROADMAP line is half stale, but the value-vs-reference half is not.

</details>

### eh-error-floor-alias-name

**Does the floor error shape `{ msg: string }` get a blessed name**  
`docs/error-handling-design.md:437 (item O3, under "## Open questions for the owner" :412)`

**The question.** Accurate as filed, with the trigger restated: 'when the first fallible std API is written (std:fs or a parser), does the universal floor shape `{ msg: string }` get a blessed alias name, or stay spelled structurally inline?' It is a naming/convention call, not a semantics call — O3 already ruled the SHAPE and the layering (`IoError` extends the floor), and the structural model means the two spellings are interchangeable to the checker.

**Options.** A named alias — one word in every `T | E` signature, a discoverable convention for third-party fallible APIs to converge on, but a name the whole std must then agree on and one that can collide with user types. Inline `{ msg: string }` — nothing to learn, nothing to collide with, and it matches the structural model the rest of O3 committed to (a caller matching `{msg}` already accepts both the floor and `IoError = { code, msg }`), at the cost of repeating the shape at every fallible signature.

**Blocked while unruled.** Nothing today — std ships only total functions. It is the spelling of `std:fs`'s (and every later fallible std API's) signatures, and the doc explicitly defers it to when `std:fs` lands. IMPORTANT STALENESS NOTE for whoever reads the roadmap: ROADMAP.md:731 and :493 still file the WHOLE error-handling design as "DRAFTED, pending owner review" with "Seven open questions (O1–O7) flagged for the maintainer" (:739) — that is stale. The doc header (:3) records the model as RULED BY THE OWNER 2026-07-26 and O1–O7 are each marked RULED; this naming follow-on and O6(b) are the only live residue.

**Reversible?** Yes while std has no fallible APIs. Cost grows with each one: introducing or renaming the alias later is a source-level edit to every fallible signature already written, and to every user program that spelled the shape by hand.

**Cost if taken.** Unpriced, and cheap by construction: one `type` declaration in std plus the word in each fallible signature. Zero compiler lines — nothing in the checker distinguishes an alias from its structural expansion.

**Cost of waiting.** Nothing today, verified: std ships only total functions and there is no fallible signature to spell either way. The cost is purely future and grows one signature at a time; it is not on any current critical path. The real live cost in this row is documentation drift — two ROADMAP rows tell a reader that seven questions await the owner when all seven are ruled, which is how an agent re-opens settled ground.

<details><summary>verification</summary>

Genuinely unruled, and its own trigger has not fired. docs/error-handling-design.md:412-528: O1, O2, O3, O4, O5, O6(a)/(c), O7 all carry explicit RULED/Clarified/dropped markers; :437's follow-on ('whether the floor alias gets a name (`Err`? `Failure`?) or stays spelled inline') carries none. Trigger check: `ls std/` → array.vl, buffer.vl, embedded.ts, fmt.vl, seed.vl, test.vl — no `fs`; `grep -rn "msg: string\|IoError\|type Err\b" std/` → only std/test.vl:175 `vltAbort(msg: string)` and :311 `fail(msg: string)`, i.e. no fallible signature anywhere in std. Even the ruled prerequisite is unbuilt: `const u: i32 | string = 5; const n = u as i32` → `vl check` rc 1, `as` supports numeric conversions only. THE FILING'S STALENESS NOTE IS CORRECT AND I CONFIRM IT TWICE: ROADMAP.md:731-739 still reads '⬜ Error-handling design — DRAFTED, pending owner review … Seven open questions (O1–O7) flagged for the maintainer', and ROADMAP.md:492-493 repeats 'DRAFTED, PENDING OWNER REVIEW' — both contradicted by the doc header at :3 ('MODEL RULED BY THE OWNER (2026-07-26)') and by the seven RULED blocks.

</details>

### eh-user-defined-cast-functions

**O6(b) — charter user-defined cast functions (`as(self: A): B`)?**  
`docs/error-handling-design.md:496 (section "## Open questions for the owner" :412; sketch at :399)`

**The question.** Accurate as filed, with the sequencing made explicit: O6(b) composes with union-`as` propagation, and that propagation is RULED but NOT BUILT (verified — union-`as` is rejected today). So the ruling cannot be exercised until the O5 implementation lands; asking for it now buys a direction, not an unblock. The substantive content is the part the doc says is unchanged: overload/resolution rules and the ambiguity with builtin numeric casts (`s as i32` when a user cast and a numeric conversion both apply).

**Options.** Charter it — it composes with the already-RULED union-`as` propagation to give extensible fallible parsing with zero extra language machinery (`s as i32` propagates `ParseError` for free, because the user cast's union result feeds straight into the narrow-or-propagate rule); the cost is that resolution/overload rules and the ambiguity with builtin numeric casts are still unspecified. Don't charter it — `as` stays a fixed, readable set of compiler conversions and fallible parsing is ordinary named functions, at the cost of the composition being unavailable. (The two siblings this item was filed with are already ruled: `as!` is CHARTERED, `is?` is DROPPED.)

**Blocked while unruled.** Nothing — it is a filed future extension on no current critical path. It survived an owner pass on 2026-07-26 explicitly unruled rather than being dropped, which is why it is still live.

**Reversible?** Yes, the feature is additive. The overload-resolution rule inside it is not: once user casts exist, changing how `s as i32` resolves silently changes which function a program calls.

**Cost if taken.** Unpriced. The feature itself is additive; the expensive part named by the doc is the resolution rule, and the tree gives one relevant datum: VL has no ad-hoc overloading (DECISIONS 'One binding per name per scope'), so `as` overloads would be the second dispatch-by-receiver-type mechanism after `self`-functions and the `"[]"`/`"[]="` operator functions already in std/buffer.vl:463-469.

**Cost of waiting.** Nothing — it is on no critical path, and its composition partner is unimplemented anyway. The only forward-dated cost is the one the filing names: once user casts exist, changing how `s as i32` resolves silently changes which function a program calls, so the resolution rule (not the feature) is the part that must not be decided twice.

<details><summary>verification</summary>

Explicitly left open by the owner pass and unimplemented. docs/error-handling-design.md:496-501 — '(b) user-defined casts — still open, and its framing SURVIVES … Open sub-questions are unchanged: resolution/overload rules, ambiguity with builtin numeric casts' — the two siblings in the same bullet are resolved ((a) `as!` CHARTERED, (c) `is?` dropped), so this one was passed over deliberately, not missed. `grep -rn "user-defined cast\|as(self" compiler/*.vl docs/ ROADMAP.md CHANGELOG.md` → three hits, all in error-handling-design.md (:399, :400, :496); zero compiler code. Live at HEAD: a file declaring `function as(self: string): i32 { 7 }` parses (it is reported only as an UNUSED function) and `"5" as i32` errors ``as` supports numeric conversions only` — so `as` is a closed compiler-defined set and a user `as` is inert. The prerequisite it composes with is also unbuilt: `const u: i32 | string = 5; const n = u as i32` gives the same 'numeric conversions only' error, so O5's ruled union-`as` propagation has no implementation yet.

</details>

### j3-scripts-vl-vs-node

**Do the load-bearing build scripts port to `.vl` (dogfood) or to Node (faster)**  
`/workspace/ROADMAP.md:1473`

**The question.** Two premises need correcting. (1) It is not on the `vl` build path: `std/embedded.ts`'s own generated header says who consumes it — 'the LSP checkers via `withStd`, the playground — and who does NOT (the CLI and the Rust host read the `std/` dir directly)', which I confirmed at `main.rs`'s `std_dir()`. So 'removes the last JS from the build path' overstates it; its consumers are exactly the JS tooling Track J keeps on Node. A `.vl` port would also have to EMIT TypeScript source for those consumers. (2) The stated gate is weaker than filed: the error-handling review `std:fs` hung on was RULED 2026-07-26 (O1/O5, and O7 explicitly re-scoped `std:fs` to proceed on the measured-working shapes). What blocks (a) today is simply that `std:fs` has not been written — `ls std/` has no `fs.vl`.

**Options.** (a) Port to `.vl` — dogfoods the language on a real non-compiler program and removes the last JS from the build path, but is gated on VL having the file I/O it needs (which is itself gated on the `std:fs` / error-handling chain) and is slower to get done. (b) Move to Node — faster and unblocked today, but keeps a JS toolchain dependency in the build path that Track J otherwise exists to remove. This is a priority/values call (dogfooding vs speed), not a measurable one.

**Blocked while unruled.** J3's completion, and with it part of the J6 teardown; `gen-std.ts` is currently the only remaining `scripts/*.ts` and is load-bearing (a std edit needs `deno task gen-std`).

**Reversible?** Yes — one script; either direction can be redone later at small cost.

**Cost if taken.** (b) Node: rewrite 60 lines off `Deno.readTextFile`/`Deno.writeTextFile` and move the task to `package.json` — small and unblocked today. (a) `.vl`: the same 60 lines, but gated on `std:fs` existing (unwritten) plus emitting TS text from VL.

**Cost of waiting.** `deno.json` + `deno.lock` + `setup-deno` survive for one 60-line script, so J6's teardown stays blocked on it; and every `std/*.vl` edit still needs `deno task gen-std` or `tests/std_embedded_test.ts` fails and the LSP/playground serve a stale std.

<details><summary>verification</summary>

`ls scripts/*.ts` → `scripts/gen-std.ts` only, 60 lines; `deno.json` task `"gen-std": "deno run -A scripts/gen-std.ts"`. Still load-bearing: `std/embedded.ts` is imported by `lsp/src/moduleGraph.ts:34` (`import { STD_SOURCES } from "../../std/embedded.ts"`) and its freshness is gated by `tests/std_embedded_test.ts` ('std/embedded.ts is stale — `std/*.vl` changed without regenerating'). No later ruling: `grep -n -i 'gen-std' ROADMAP.md docs/internals/deno-deprecation.md` shows the same two open framings and nothing that closes them.

</details>


---

## Dismissed — filed as owner rulings, verified NOT open

Kept so the same 22 are not re-swept. `ALREADY-RULED` = the answer exists elsewhere; `SHIPPED` = the code already does it; `STALE-PREMISE` = the question rests on something no longer true; `NOT-AN-OWNER-CALL` = ordinary work, or a measurement settles it.

| id | status | why |
|---|---|---|
| `strings-core-vs-std-line` | **STALE-PREMISE** | The doc's load-bearing claim — `split` "a very common operation with no home yet" (strings-design.md:938-941) — is false. `grep -rn "function split\|function join\|function repeat" std/*.vl` → `std/fmt.vl:101 export function split(s |
| `std-OD1-release-packaging` | **ALREADY-RULED** | The fork is decided in the shipped Rust host, and the losing branch has no code path at all. `scripts/vl-host/src/main.rs:70-77`: `out.push(exe_dir.join("std"))` under the comment "// The release layout — std ships beside the bina |
| `param-skip-syntax` | **STALE-PREMISE** | Two load-bearing premises of the doc are measurably false at b232a357. (1) `docs/guide/lambda-param-skip-design.md:8` — "Status: **design only, not yet buildable**" — and :20-22 "Self-host lambdas / closures + HOFs don't exist yet |
| `collections-map-filter-return-type` | **STALE-PREMISE** | The surface answer already ships. Verified at b232a357: `const ys = xs.map((x: i32) => x * 2); ys.push(99); print(ys.length); print(ys[3])` → `4` then `99`, rc 0; and `const ys = xs.filter((x: i32) => x > 2); ys.push(99); print(ys |
| `J2-js-side-test-runner` | **NOT-AN-OWNER-CALL** | The doc self-gates on a precondition that is measurably unmet, so nothing is decidable today either way: `docs/internals/deno-deprecation.md:79` — "Pick once `vl test` has absorbed the behavioral corpus and the residual TS test co |
| `J3-scripts-vl-vs-node` | **NOT-AN-OWNER-CALL** | Population verified: `ls scripts/*.ts` → exactly one file, `scripts/gen-std.ts` — the doc's "down to ONE file" is accurate. Option (a)'s blocker is real and verified: VL has no file I/O or host ABI for scripts — `grep -rn "readFil |
| `modules-cross-module-init-order` | **STALE-PREMISE** | The cycle half of the question cannot arise, and the doc's own supporting claim is refuted. Import cycles are a HARD PARSE ERROR, unconditionally: two modules each importing a top-level `let` from the other → `vl run` rc 1, `parse |
| `N31-formatter-wrap-architecture` | **STALE-PREMISE** | Two of the three pieces of evidence the filing cites as "New evidence for the pile" fail to reproduce at b232a357, and the parking condition names something that does not exist. (1) "`fmt --check` on wasmEmit.vl OOMs a ~3 GB null- |
| `O8-dead-string-intrinsic-declarations` | **SHIPPED** | (1) `grep -n 'declare("__store_string__"\\|declare("__log_string__"' compiler/typecheck.vl` → 2388, 2389: both still declared. (2) `sed -n '2555,2584p' compiler/typecheck.vl` → `nameIsUnimplementedIntrinsic` names exactly these two |
| `O9-memory-min-pages-and-max` | **ALREADY-RULED** | (1) The ruling is further down the SAME file — `grep -n 'O9' docs/internals/buffer-design.md` → 562 (the filing) and 913: "Not needed: any host change for the export itself, and any change to the memory section's `min 1` (O9's pro |
| `O-p12-utf8-string-rep` | **ALREADY-RULED** | (1) `sed -n '258,262p' docs/guide/strings-design.md` -> '### Storage: UTF-8 (`array i8`) — DECIDED direction / **Decision.** A VL string is stored as a packed WasmGC **`array i8` of UTF-8 bytes**, replacing the `array i32` of code |
| `O-p13-linear-memory-scalar-arrays` | **ALREADY-RULED** | (1) The disposition is already stated in the SAME file, below the item row the filing cites: `sed -n '810,815p' docs/internals/perf-landscape.md` -> '### Not ours — track, do not chase inside `compiler/**` ... Until it lands, **~3 |
| `O-union-box-per-rep-phase3` | **NOT-AN-OWNER-CALL** | (1) Not shipped, as filed: `grep -rc uBoxIdx compiler/*.vl` -> wasmEmit.vl 65, emit_bytes.vl 10, emit_state.vl 10, ... — one module-wide box. (2) But the doc's own gate on it is a MEASUREMENT, and it has not been taken: unboxed-un |
| `litunion-ref-i31` | **ALREADY-RULED** | The filing's premise verifies: `grep -rn "i31" compiler/ > /tmp/i31.txt; echo rc=$?; wc -l < /tmp/i31.txt` → rc=1, 0 lines — the emitter still has zero i31. But the question was answered elsewhere, one day before this verification |
| `buffer-scalar-arg-accessors` | **NOT-AN-OWNER-CALL** | Not shipped, verified: `grep -rn "getF32At\|getF64At\|getI32At\|getI64At" std/ compiler/ tests/ bench/` → a single hit, and it is a COMMENT (bench/buffer-view-bounds/axpy-fencedhoist.vl:14, "…which is what a `getF32At(base, length, i |
| `modules-cross-module-let-init-order` | **ALREADY-RULED** | A ruling exists in the repo's canonical decision record, and the behavior SHIPS. DECISIONS.md:490-494, in the H0 modules entry: '(b) modules merge in dependency-first (import topological) order so a dependency's top-level initiali |
| `litunion-ref-i31-vocabulary` | **ALREADY-RULED** | A later, measured doc rules on exactly this instruction family: `docs/internals/unboxed-union-rep-design.md` §6 is headed '## 6. THE RULING' and states 'Not recommended at any phase: `ref.i31` (a), multi-value (b), local scalariza |
| `buffer-O8-dead-declarations` | **STALE-PREMISE** | Both declarations are still there — `compiler/typecheck.vl:2388-2389` `declare("__store_string__", …)` / `declare("__log_string__", …)`, and both still listed by `nameIsUnimplementedIntrinsic` (`:2581-2582`) — so neither option wa |
| `lambda-param-skip-syntax` | **STALE-PREMISE** | Two premises are dead at HEAD. (1) There is no later parameter to skip TO: `xs.map((v: i32, i: i32) => v + i)` → `[ERROR]: map callback expects 1 parameter, got 2`, and `xs.filter((v: i32, i: i32) => v > i)` → the same for filter; |
| `collections-naming-and-forcing-surface` | **ALREADY-RULED** | The ruling is 'stay uncommitted', recorded in two places in the words of a decision, not a question: `collections-design.md:1118` — '**Open sub-point (deliberately uncommitted):** the *names* `List` / `Array` and any *forcing* ann |
| `std-OD1-release-packaging` | **SHIPPED** | The Rust host implements option (a) and says so in a comment: `scripts/vl-host/src/main.rs:57-79`, `fn std_candidates()` — `$VL_STD` first (exclusive when set), then `out.push(exe_dir.join("std"))` under '// The release layout — s |
| `j2-js-test-runner-choice` | **ALREADY-RULED** | `node --test` is the plan of record in both documents, stated four times, and only the trailing summary line calls it open. ROADMAP J2 bullet (:1447-1451): 'TS-infra tests … move to a **Node** test runner (`node --test`) when thei |

---

## Ruled — decisions taken, kept here so they are not re-swept

### `-O`/`-O3` without `wasm-opt` — RULED 2026-08-03, shipped as #1339

**Ruling: it is a HARD ERROR.** `vl build -O3` used to print a note, write the UNOPTIMIZED module and
exit 0. That is reversed: `-O`/`-O3` are never implied, so reaching the optimizer means the caller
typed the flag, and silently handing back an unoptimized module makes every downstream check believe
it got an optimized one. The failed build also removes the output file, so a caller that ignores the
exit status cannot find a misleading artifact either.

**The distinction that makes it safe:** a DEFAULT build never invokes `wasm-opt`, so a toolchain
without binaryen still builds everything that did not ask to be optimized. That inverted control is
now its own test.

This supersedes the "a missing `wasm-opt` stays a soft no-op" clause of webcraft P1.3. The deciding
evidence was that the workaround already existed in TWO places (`bench/run.sh` and the six
`selfhost_native_opt` tests both hand-guard against it) — a default needing to be guarded in two
independent places is the wrong default. It had already produced published `-O3` timings that were
re-runs of the `-O0` module.

### `getF32At(base, length, i)` — RECOMMENDED AGAINST, awaiting the owner's word

Not ruled, but the orchestrator's recommendation is on record so it is not re-analysed from scratch:
**decline it, and fix the reload instead.** Adding per-width scalar-argument accessors is a
hand-workaround for an optimizer gap (binaryen will not hoist immutable `struct.get`s of a view
descriptor out of a loop), and it makes the fast path a second, uglier spelling every kernel author
must learn — colliding with the project's own rule that users must not need hacks for top
performance. The principled fix is ROADMAP B6b's backing-pointer LICM, which webcraft P1.4's
measurement has now PRICED at 89% of the view-kernel excess. See the `buffer-scalar-arg-accessors`
entry above for the full trade-off.
