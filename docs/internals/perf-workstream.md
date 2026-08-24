# Performance workstream — beyond quadratic

Filed 2026-08-23 on master `727c7cc2`. This is a **plan**, not a change: nothing in
`compiler/` was touched to write it.

**Candidate 1 shipped as #1853 while this was being written** — `0dd545f2`, a dense flag
array, **−11.6% user CPU on `vl build compiler/entry.vl`**. §4.1 records the outcome and
what it settled. The rest of the document is written against `727c7cc2` and is unaffected;
the top of the ranking is not.

`perf-program.md` and `perf-landscape.md` own the shipped/rejected ledger — read §9 before
proposing anything, because a third of the obvious ideas are already refuted there with
numbers. This document covers the tier those two do not: not "is anything quadratic" (the
existing discipline catches that) but **which of the compiler's ~200 linear scans are
actually costing anything, and what the right structure is at each one**.

The owner's framing:

> We've been focused on ensuring we don't have quadratic issues but we can be saved from
> log n algos and just probably smarter approaches in a lot of spots. We do need to be
> careful to not over-engineer linear scans that are truly fine, but we need to pull out
> efficient algos & data structures when useful; some of these can also live in std
> (probably should do a pass for existing ones in compiler that can be moved).

Everything below is either **measured** (a counter I ran, quoted with its exact number) or
**labelled unmeasured**. Where a number is arithmetic on a measurement rather than a
measurement, it says so.

---

## 0. The one-paragraph version

I instrumented nine scan sites and ran a self-compile. The result contradicts the intuition
the whole workstream started from: **list length is nearly useless as a triage signal, and
answer distribution is the thing that decides.** `scopeSlotOf` scans a 36-deep stack and
averages **1.72** iterations — a map there is a loss. `isUName` scans an **11**-element list
and averages **11.0**, because it answers NO, and costs 9.2 M string comparisons. The
biggest single item, `cTyIxListHas`, runs **209,097,445** iterations over a **189**-element
list — hot because of the probe count, not the length. The triage rule in §1 is built to
catch all three of those, and it needs a counter, not a reading of the code.

That last one is now settled rather than proposed: #1853 replaced it with a dense flag array
and measured **−11.6%** on a self-compile. Its independently-written instrumentation
reported **1,426,650 probes and 209,097,445 iterations** — digit-for-digit the numbers in
§3, from a different counter written by a different author. §4.1 is what a candidate in this
document looks like once it has been through §8.

---

## 1. The triage rule — is this linear scan fine?

The load-bearing deliverable. It is a **two-stage filter**: a free static stage that narrows
the field, and a cheap dynamic stage that decides. **Stage 1 never decides on its own** —
§4 has a measured counterexample in each direction.

### Stage 1 — static, free, narrows (does not decide)

Three mechanically checkable questions.

**Q1. What resets the backing array?** `grep -n '\bX = \[\]' compiler/*.vl` and read the
enclosing function name. This is the scale class, and it is objective:

| reset lives in | scale class | examples in tree |
| --- | --- | --- |
| `initChecker`, `checkProgramNode`, `collectU/S/A/Fns`, `emitProgram`, `monomorphize`, `modReset` | **program-scale** | `cStructTyIxs`, `unNames`, `uVariants`, `symOccTok`, `monoKeys` |
| `fbBeginFunc`, `emitFuncCode`, `startFnDetectScratch`, `buildLocals`, `loopHoistOpen`, `ufcsAliasReset` | **function-scale** | `liKinds`, `lhName`, `mfSrcKinds`, `fnRefPushSlots`, `localNames` |
| nothing — only `push`/`pop` | **stack / depth-scale** | `scopeNames`, `daUnassigned`, `emitNameSeen` |
| n/a — it is a parameter | **classify at the callers** | `cTyIxListHas(xs, …)`, `capIsBound(bound, …)`, `nameIn(names, …)` |
| n/a — built in the same function from one declaration's fields/args/arms | **source-local** | `variantFieldIndex`'s `uFieldCount[vi]` |

**Q2. What is the key?** Dense small integer into an existing arena → a dense side array.
String → a map. Ordered / range query → sorted + binary search. §5 argues these.

**Q3. What does the predicate usually answer?** A membership test that mostly answers **NO**
always pays the **full** list length. A lookup that mostly **hits early** pays almost
nothing regardless of length. This is the question that actually separated the candidates,
and it is the one the code does not tell you.

Stage 1 output is a *shortlist*, and its rule is: **program-scale or stack-scale, plus a
call site inside a per-node or per-statement walk.** Source-local and function-scale scans
leave the shortlist unless Q3 says the predicate answers NO.

### Stage 2 — a counter, ~90 seconds, decides

Do not profile. Do not reason. Add three lines to the scan and read the numbers. The recipe
is in §8.2 and I ran it three times while writing this; each round cost one 2-second build
and one 6-second run.

    let pbCalls = 0
    let pbIters = 0
    let pbMax   = 0
    // in the function:  pbCalls = pbCalls + 1
    //                   if xs.length > pbMax { pbMax = xs.length }
    // in the loop:      pbIters = pbIters + 1

**The decision statistic is `iters / calls` (the mean), and the size statistic is `iters`.**

| mean iterations per call | verdict |
| --- | --- |
| **< ~4** | **leave it alone.** #1851 measured a hash-comparison replacement for a 1–3-iteration pooled-literal scan at **−0.17%** — nothing. Two `struct.get`s and three branches do not beat three `i32.eq`s. A map here is slower *and* is a second thing to keep in agreement. |
| **~4–10** | measure the replacement before writing it. |
| **> ~10** | convert. The structure question is §5's, not a judgement call. |

The **~4** threshold is *inferred* from #1851's −0.17% at 1–3 iterations, not measured
directly. Treat it as a prior, not a constant.

And the second gate, which is independent: **total `iters` must be large enough to see.**
`variantFieldIndex` has a mean of 1.65 and 133,233 total iterations. Both gates say no. A
scan with a mean of 40 and 900 total iterations is also a no.

### Why Stage 1 alone is not enough — three measured counterexamples

- **Program-scale, string-keyed, 1.6 M calls, and completely fine.** `scopeSlotOf`
  (`compiler/emit_classify.vl:3668`) walks the scope stack innermost-first. Depth reaches
  **36**, mean iterations **1.72** — the binding a lookup wants is almost always the one
  just pushed. Stage 1 flags it; Stage 2 clears it.
- **Eleven elements, and the third-worst offender.** `isUName`
  (`compiler/emit_classify.vl:20005`) scans **11** union-alias names, mean **11.0** — it
  exhausts the list every single time, because the answer is NO. 9,231,474 `__str_eq__`
  calls out of a list you would never look at twice.
- **A list the code calls small, measured at 676.** `capIsBound` / `capHas`
  (`compiler/emit_base.vl:189` / `:198`) — a capture/binding set. Max length **676**, mean
  **15.7**.

And one that Stage 1 flags, Stage 2 clears, and *neither* would have found without running
it: **`nameIn` (`compiler/typecheck.vl:3640`) is called 0 times in a self-compile.**

### The comment corollary

`cTyIxListHas` carried the header *"a small nominal-index set (a handful of struct/variant
decls per program)"*. Measured: **189** elements and **209 million iterations**.

**The precise diagnosis matters, and #1853's is better than the one this document filed.**
The comment was *right* about the size — 60 declared structs, 189 variant members, none of
it growing with the 28,555-entry arena — and wrong about what the size implied. The scan was
hot because of the **probe count**, and because the predicate answers NO: 198,848,340 of the
199,095,246 slots a probe *could* have walked *were* walked, so 99.9% of the work was a
full-list miss. **A comment that states a size is answering a question nobody asked.** The
question is iterations per call and total iterations, and no comment in this tree states
either.

**Assumptions asserted in comments are a category, not a one-off** — the
same shape sits at `compiler/typecheck.vl:5703`, where the diagnostic de-dup scans every
prior diagnostic on every push under the header *"the diagnostic count stays small, so the
scan is cheap"*. On a clean self-compile that is true (zero diagnostics, zero cost). **In
the LSP it is not**: `compiler/` is bundled into the Node LSP server, which recompiles on
every keystroke, and a mid-edit buffer is exactly the state with many diagnostics. That is
an O(d²) path nothing in the self-compile gate can see.

**Rule: when a comment asserts a size, the comment is a claim. Put a counter on it or
delete the claim.**

---

## 2. The census, re-derived

The owner's crude census counted **102** functions comparing against a `string` parameter
(41 in `typecheck.vl`, 33 in `emit_classify.vl`) and flagged it as an over-count. It is an
over-count for the reason given — it cannot separate a program-scale list from a bounded
one — but the shape is right and the total is close.

Re-derived mechanically (script: parse every top-level function, find every `while i <
X.length` / `while k > 0` / `for i in 0 to N` loop whose body compares an element for
equality and exits on a hit):

| | |
| --- | --- |
| top-level functions in `compiler/*.vl` | **3,164** |
| **linear membership/lookup scan sites** | **196** |
| distinct backing arrays | **115** |
| sites whose key is a `string` **parameter** of the enclosing function | **69** |
| sites comparing against a string **literal** | **21** |

By where the backing array is bound: 78 imported module-global, 51 own-file module-global,
37 parameter, 27 local, 3 field. By file: `emit_classify.vl` **61**, `typecheck.vl` **60**,
`emit_base.vl` 14, `emit_mono.vl` 13, `wasmEmit.vl` 9, then a tail.

**The unit that matters is the backing array, not the function.** 196 sites sit over 115
arrays, and the arrays are what Q1 classifies. Running Q1's reset rule mechanically over all
115: **66 program-scale, 10 function-scale, 3 stack/depth-scale, 35 parameters or locals
that must be classified at their callers, 1 unclassified.** That the program-scale bucket is
6× the function-scale one is itself the reason Q1 cannot be the whole rule — it barely
narrows anything.

**None of that ranks anything.** 196 is the size of the *field*, not the size of the
*problem* — nine sites carry effectively all of the measured cost.

---

## 3. What I measured

**Input:** `vl check --codegen compiler/entry.vl` — the whole compiler as one module graph,
**294,901 AST nodes**, **28,555 arena types**. This is the fixed real input; §8.3 says why
nothing else is admissible.

**Method:** a scratch copy of `compiler/` + `std/` (the repo's `compiler/` was never
edited), counters added at nine sites, built with the master seed, then run over the real
`compiler/` source. Counters reported through `tErr` at the end of `emitProgram`. Three
rounds, each ~8 s.

| # | site | file:line | calls | iterations | **mean** | list max | per-iteration cost |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `cTyIxListHas` | `typecheck.vl:23430` | 1,426,650 | **209,097,445** | **146.6** | 189 | `i32 ==` |
| 2 | `repTreeVKind` | `emit_rep.vl:4300` | 1,847,718 | **17,664,170** | 9.56 | 11-arm chain | `__str_eq__` |
| 3 | `tyTopIndexOf` | `tyname.vl:439` | 871,014 | **19,795,037** | 22.7 | — | byte load + branch |
| 4 | `isUName` | `emit_classify.vl:20005` | 839,884 | **9,231,474** | **11.0** | 11 | `__str_eq__` |
| 5 | `capIsBound`+`capHas` | `emit_base.vl:189`/`:198` | 373,548 | **5,860,910** | 15.7 | **676** | `__str_eq__` |
| 6 | `variantIndexOf` | `emit_classify.vl:19896` | 163,371 | **5,742,013** | 35.1 | 48 | `__str_eq__` |
| 7 | `scopeSlotOf` | `emit_classify.vl:3668` | 1,645,275 | 2,826,116 | **1.72** | 36 | `__str_eq__` |
| 8 | `variantFieldIndex` | `emit_classify.vl:20025` | 80,595 | 133,233 | **1.65** | 7 | `__str_eq__` |
| 9 | `nameIn` | `typecheck.vl:3640` | **0** | 0 | — | — | — |

**String comparisons across the six string-keyed sites: 41,457,916.** Their split:
`repTreeVKind` **42.6%**, `isUName` 22.3%, `capIsBound`/`capHas` 14.1%, `variantIndexOf`
13.9%, `scopeSlotOf` 6.8%, `variantFieldIndex` 0.3%.

Two more facts that fell out and change designs:

- **`cTyIxListHas` is an emit-path cost, not a checker cost.** A `vl check` without
  `--codegen` runs it **605** times for **3,057** iterations. That is 0.04% of the traffic.
  The 12.9% is entirely the emitter's `nodeTyIs*` family.
- **These two facts are why #1853's change was an afternoon.** Both were re-derived
  independently by its author and both held.
- **Its two backing sets are frozen before the emitter starts.** At the end of
  `checkProgram`: `cStructTyIxs=60`, `cVariantMemberTyIxs=189`, `cUnionTyIxs=10`,
  `arenaTys=28,554`. At the end of `emitProgram`: **identical**, `arenaTys=28,555` (one type
  added). So a dense side table can be built once and never invalidated — that is a
  measurement, not an assumption, and it is what makes candidate 1 an afternoon.

### Provenance of the profile shares, and one caution

The guest-profile shares in the brief — `__str_eq__` 19.2%, `cTyIxListHas` 12.9%,
`__str_hash__` 0.73%, `tyTopIndexOf` 3.0% — come from a `VL_PROFILE_GUEST` run on current
master. **Every profile number in `perf-program.md`, `perf-landscape.md` and
`identifier-interning-design.md` predates today**: #1848 changed `string` from
`(array (mut i32))` at 4 bytes per code point to UTF-8 bytes, and landed **2026-08-23**,
the same day as this document. Those docs read `__str_eq__` at 25.19% / 27.71%; the
post-#1848 tree reads 19.2%. **They are different representation epochs and must not be
compared.**

**Caution on the 19.2% specifically.** `perf-program.md` §2 splits `__str_eq__`'s old 25.19%
into a SYMBOL/IDENTIFIER consumer class at **19.10%** and a TYPE-name class at 6.08%. The
new total and the old symbol-class share agree to within 0.1 points, which is a coincidence
built to be misread. Before anything is scheduled off it, **re-derive the consumer split
post-#1848** — the correct next profile is not a new total, it is a new split.

---

## 4. Ranked inventory

Ranked by **measured work removed**, not by how bad the code looks. Item 1 has since
shipped; the rest are open as of `727c7cc2`. The projected reductions
are *arithmetic on the measured counters* — they are not runtime claims, and every one of
them needs §8's A/B before it merges.

### 1. `cTyIxListHas` → a dense arena-indexed side table — **SHIPPED as #1853 (`0dd545f2`)**

**Outcome, measured by #1853:** `vl build compiler/entry.vl` **2.16 s → 1.91 s, −11.6% user
CPU** (median of 9 interleaved); `vl check` **+0.0%**, exactly as the census predicted; peak
RSS 636 → 637 MB. `cTyIxListHas` was 12.68% of self time, the largest single item on the
board after `__str_eq__`.

**Two things it settled that this document only proposed.** The structure landed as a
`boolean[]` per set indexed by the arena index, **with the list kept** as a parallel index
rather than replaced — four of the six sets are iterated in order alongside a names/args
array, so the flags are an index *beside* the list. And it is **one shared helper pair**
(`cTyIxSetAdd` / `cTyIxSetHas`), not six hand-rolled structures, because six sets that
differ in structure is how one of them ends up missing an arm. That is the §7 liability
handled at the design level rather than argued about.

**Two things it corrected in this document's own analysis**, both found by its census:

- **The set list is six, not two.** `cUnionTyIxs` (207,768 probes), `cNullableInnerTyIxs`,
  `gaAppTyIxs` and `annPendingVariantTyIxs` also route through `cTyIxListHas`. This document
  named two because two is what the call sites I read used.
- **"A handful" was right about the size.** See §1's corollary — the diagnosis is the probe
  count and the NO-answer, not a stale number.

**And one cross-validation worth keeping.** Two instrumentations, written independently by
two authors on the same day, reported **1,426,650 probes / 209,097,445 iterations** and
**605 `vl check` probes** — identical to the digit. Counters are a *reproducible* instrument
in a way profile shares are not; §8.2 is not a shortcut.

The original filing is kept below, because the reasoning is what §1 is for.

- **Site:** `compiler/typecheck.vl:23430`, over `cStructTyIxs` (`:1924`) and
  `cVariantMemberTyIxs` (`:1931`). Ten call sites, all in the `nodeTyIs*` family.
- **Evidence:** 12.9% of self-time in the guest profile. **1,426,650 calls,
  209,097,445 iterations, mean 146.6, list max 189.** 99.96% of it is emit-path.
- **Why the structure is wrong:** the keys are **arena indices into `T.tys`** — dense
  integers in `[0, 28,555)`. The set is stored as an unsorted list of those integers and
  probed by scanning. A dense array indexed *by the key itself* answers in one load.
- **Proposed structure:** one `i32[]` parallel to `T.tys`, `-1` for "neither", otherwise the
  row's index in the `cStructNames` / variant-member column. That serves both
  `cTyIxListHas` **and** `structNameOfTy` (`typecheck.vl:9751`), which is a second linear
  scan over the same array. Maintained at the four `push` sites plus the reset — O(1) each.
  Cost: ~114 KB against a self-compile peak of ~500 MB.
- **Not** a hash set: hashing a dense integer to index a table you could have indexed
  directly is strictly worse. **Not** a bitset: the callers want the *name column position*,
  not just membership, and a `boolean[]` would leave `structNameOfTy` scanning.
- **Projected:** 209,097,445 iterations → 1,426,650 indexed reads. Arithmetic.
- **Risk:** low. The sets are measured frozen after checking. Build once at the end of
  `checkProgram`, or maintain incrementally — either is provably equivalent.
- **Also fix the header.** — done; #1853 replaced it with the measured table.

**Residue, unmeasured.** `structNameOfTy` (`typecheck.vl:9757`), `unionAliasDeclNameOfTy`
(`:9771`) and one more `cUnionTyIxs` walk (`:23805`) are still linear scans over these same
lists — deliberately, because they want the parallel *name* column, not membership. Their
probe counts are unmeasured. **Do not convert them on the strength of #1853's number**; put
a counter on them first. This is exactly the trap §2 warns about — 196 sites, and the nine
that matter are not the nine that look alike.

### 2. `repTreeVKind`'s literal chain → a named litunion tag — **SHIPPED, #1855, −2.1%**

- **Site:** `compiler/emit_rep.vl:4300`, over `rtKind: string[]` (`emit_rep.vl:3829`).
- **Evidence:** **1,847,718 calls, 17,664,170 `__str_eq__` calls, mean 9.56** of an 11-arm
  chain — the largest single string-comparison source I measured, **42.6%** of the
  41.46 M.
- **Why the structure is wrong:** `rtKind` stores a **closed vocabulary** — the 13 tags
  `repTreeVKind` tests, plus `unsup` — as runtime strings. The function's own return type is `VKind | null`, a *named litunion* —
  it returns an atom and reads a spelling.
- **Proposed structure:** declare `rtKind` as a named-litunion array. **This is not
  speculative: `compiler/emit_state.vl:1523` already declares
  `export type MfKind = "i32" | "f64" | "ref" | "str" | "i64" | "f32" | "u8"` and three
  arrays of it (`mfSrcKinds`, `mfDstKinds`, `liKinds`).** A named litunion reps as an
  interned i32 atom, so every `k == "list"` becomes an `i32.eq` with the source unchanged.
- **Precedent with a number:** `perf-program.md` §10.9 did exactly this to `TokKind`
  (67 members, ~570 use sites): `__str_eq__` from `parser.vl` −83.8%, `parseProgram`
  inclusive −33.0%, self-compile −1.76%, **`vl check` −9.4%**. It was costed at L effort
  over 570 sites and shipped as **S effort over four type annotations and one function.**
- **Projected:** 17,664,170 `__str_eq__` → 17,664,170 `i32.eq`. Combined with candidate 3,
  → 1,847,718 dispatches.
- **Then census the twins.** 21 of the 196 sites compare against a string literal. `rtKind`
  is one of **two** `string[]` columns among fifteen `rt*` tables (`rtReason`, a policy
  reason-code, is the other — also a closed vocabulary). Do the wider census after this
  lands, not before.

**SHIPPED (#1855).** Four annotations, exactly the `TokKind` shape: the `type RtKind`
declaration, `rtKind`'s element type, and the two writers (`rtAlloc`, `rtLeafOf`). Nothing
else moved — atoms widen back to `string` transparently, so `rtInternKeyOf`'s key
concatenation and the `string`-returning accessors (`repTreeKindOf`,
`repTreeListElemName`, which *returns* a tag) compiled unchanged.

- **The vocabulary is 15, not 14.** `repTreeVKind`'s 13 + `unsup` + **`u8`**, which only
  `rtListVKind` / `repTreeListElemName` test. Enumerating the writers (`rtAlloc` ×6 literal
  + `rtLeafOf` ×9 literal, the only two) gives the closed set; the checker then holds it
  closed at every *reader* too — `k == "notamember"` is a type error, not a false branch.
  (`hole` / `neg` are `rtReason` codes, not kinds. They look like tags in a grep.)
- **Measured: `vl build compiler/entry.vl` −2.10% user CPU** (1.837 s → 1.798 s mean;
  medians 1.830 → 1.790). 52 samples per arm, 26 order-balanced A-B-B-A quads against a
  pinned `origin/master` source tree so only the *seed* differs; paired-quad mean +0.0387 s,
  sd 0.0375, t≈5.3. **A 9-pair run first gave −0.63% — inside `%U`'s own 0.01 s
  quantisation.** On a box at load average 3 this size of win needs ~50 samples per arm,
  not ~10.
- **Profile (`VL_PROFILE_GUEST`, 6 warm runs per arm, `$mNN` stripped).** `__str_eq__`
  **21.88% → 19.18% self** of ALL samples (this is the *total* share, not the
  symbol-class share — do not compare it to `perf-program.md` §2's 25.19% without noting
  that baseline predates #1851 and #1853). The mechanism is visible without any share
  arithmetic: **every reader's inclusive share collapsed onto its self share**, i.e. the
  functions stopped calling anything at all.

  | fn | master self / incl | patched self / incl |
  | --- | ---: | ---: |
  | `repTreeVKind` | 0.57 / 2.57 | 0.54 / **0.54** |
  | `repTreeListElemName` | 0.17 / 1.04 | 0.22 / **0.22** |
  | `repTreeNulOf` | 0.29 / 0.59 | 0.49 / **0.49** |
  | `rtListVKind` | 0.09 / 0.37 | 0.23 / **0.23** |
  | `repOfTy` | 0.22 / 8.47 | 0.27 / 5.92 |

- **The call-count estimate over-predicted by ~6×, and that is the transferable lesson.**
  42.6% of all `__str_eq__` *calls* came from this chain, but the chain was only ~3.2% of
  *self-time* inclusive — its comparisons are the cheapest ones in the program (tags are
  1–7 bytes and mismatch on length, and #1851's cached header already made the rest fast).
  **Call counts rank candidates; they do not size them.** Where §1's threshold asks for a
  probe, the probe should be an inclusive-share reading, not a counter.
- **Do NOT infer the total-sample count as a speedup.** The two arms' 6-run sample totals
  were 17,127 vs 14,961 — a −12.6% that is pure scheduler noise (individual runs ranged
  2.0 s to 7.3 s of sampled guest time). Only the *shares* survive that variance.
- **Byte-identity cross-check:** both seeds compile the pinned master tree to the same
  1,375,877-byte wasm, and the patched tree reaches its own fixpoint at 1,376,574 bytes.
  All seven gates match master exactly, rep-fuzz included (`exact`, 1 baselined reject).
- **Residue, not done:** `rtReason` is still a `string[]` of a closed policy vocabulary —
  but it is read almost entirely as a *return value*, not a comparison (`repTreeUnsupReason`
  hands it out), and its two hot comparisons are the `== "litunion:noalias"` pair. Census
  it before converting; the number above is the reason not to assume.

### 3. Litunion dispatch and the `string`→litunion crossing — **(A) before (B), and the ordering is the point**

Two separable items that belong in one entry because **(B)'s value is largely contingent on
(A) existing.** The intuitive ordering is the reverse of the right one.

**(A) `br_table` dispatch for litunion `match` / `is`-chains.** Verified by the owner on
`727c7cc2` (2026-08-23) by disassembling a `match` over a 4-member named litunion
(`node_modules/.bin/wasm-dis`): it lowers to **a chain of `i32.eq`, with zero `br_table`**.
Not independently re-run for this document. The interned-atom rep is real and
working — a litunion comparison is already not `__str_eq__` — but dispatch over it is still
linear in the arm count. No language change, no new surface, no design risk: this is purely
how an existing construct lowers, and it speeds up every litunion `match` in the tree today.
`repTreeVKind`-shaped chains are the target, and candidate 2 creates more of them.

**(B) A runtime `string` → litunion conversion (#1852).** No mechanism exists. `if s ==
"i32"` is rejected (`expected K, got string`); `if s is "i32"` is **`vl check`-clean and
emits invalid wasm** (`type mismatch: expected i32, found (ref $type)`) — narrowing changes
the type without changing the rep. This is what lets `string`-typed code reach the fast path
at all.

**Why (A) ranks above (B), which is the load-bearing part of this entry.** #1851 measured
the thing that would justify (B) standing alone and it came back at **−0.17%**: replacing a
short-string comparison with an integer/hash comparison buys almost nothing, because pooled
literals are 3–7 bytes and the post-length-check scan is 1–3 iterations. *"Atoms compare
faster than strings"* is **measurably almost false at these sizes.** (B) alone converts N
string compares into N integer compares. **The prize is (A): N compares into one dispatch.**

**Candidate 2 revises the size of "N compares into N compares", and #1851 is not the
witness for it.** #1851 made `__str_eq__` itself cheaper (a cached header hash); candidate 2
**deleted the call**. Over 17.66 M comparisons that was worth **−2.10%** of `vl build`,
not −0.17% — an inlined `i32.eq` beats a call to a fast `__str_eq__` by the call, not by
the compare. So the ordering above still holds — (A) is the bigger prize — but **(B)'s
standalone value is ~2% per 17 M comparisons, not ~0%.** Weigh it against the design cost
with that number, and re-measure before quoting either figure again: candidate 2 also showed
the *call count* over-predicting the *time* by ~6×.

Two constraints on (B) that must be in its design or it is pointless:

- **The lookup must be sub-linear.** If string→atom is itself a scan over the member list, it
  moves the cost instead of removing it. A litunion's members are a closed set known at
  compile time — a perfect-hash or first-byte-bucketed table is the shape, not a loop.
- **ROADMAP A5c: only *named* litunions rep as interned atoms.** Un-named / inline ones rep
  as real `(ref $array)` strings. Inference produces un-named types by construction, so an
  inference-driven version of this lands values in the *slower* rep and loses the property
  it is being built for.

**This is symbols/atoms, which is one of the oldest ideas in language design** — Erlang and
Elixir atoms, Lisp/Ruby/Smalltalk symbols, Swift's `enum K: String` with
`K(rawValue:) -> K?`, Java's `Enum.valueOf` and `String.intern()`, Zig's
`std.meta.stringToEnum`. TypeScript is the instructive contrast: the same surface type
(`"a" | "b"`) with **zero** runtime benefit, because types erase. Two notes worth carrying:

- **Elixir splits `to_atom` from `to_existing_atom` because unbounded atom creation from
  untrusted input exhausts the table and kills the VM.** VL sidesteps this by construction:
  a litunion names a *closed* member set, so conversion is a lookup in a fixed set and never
  a creation. Worth stating, because it is a real hazard everywhere else.
- **VL's position is better than the precedents' and the difference is worth naming.** In
  Swift/Rust/Java you convert a `String` into a *different type*. In VL a litunion already
  **is** a string type that happens to rep as an atom — so this is a **narrowing**, not a
  marshalling, which fits the language's structural, inference-shaped aesthetic.

**Connect (B) to destringify, do not parallelise it.** `destringify-types-program.md` has
been doing this exact string→code conversion by hand, site by site, inside the compiler, and
has shipped the technique at least three times (B262 "the comparability vocabulary becomes a
literal union"; B287's param-cell ladder, **17,329 comparisons, 0 disagreements**; the
`TokKind` slice above). **(B) is the language-level version of the programme's own move.**

### 4. `isUName` → a map, or the type-indexed twin — **measured**

- **Site:** `compiler/emit_classify.vl:20005`, over `unNames` (11 entries).
- **Evidence:** **839,884 calls, 9,231,474 iterations, mean 11.0** — it exhausts the list
  every call. 22.3% of the measured string comparisons.
- **Why the structure is wrong:** it is a membership predicate that answers NO, so length is
  cost, not a bound. Eleven pooled-literal compares per call against a hash-and-probe that
  is now **one cached-hash read** (#1851 put the hash in the string header) plus one probe
  plus one confirming compare.
- **Proposed:** `{[string]: i32}` — the language builtin, already used at
  `emit_classify.vl:7352` and `symbols.vl`. Mean 11.0 is well above the §1 threshold; this
  is the case where the map wins and `scopeSlotOf` is the case where it loses. **The same
  reasoning, opposite verdict, from the same rule.**
- **Grep for the type-taking twin first.** `isUnionOfTy(ty: i32)` sits at
  `emit_classify.vl` immediately below `variantIndexOf` and answers the nominal half by
  arena index. Its own header records that a name fallback keeps the string on 99.5% of
  queries — so the twin is a *partial* answer, not a replacement. Check what fraction of
  `isUName`'s 839,884 callers hold a `ty` before choosing.
- **Projected:** 9,231,474 `__str_eq__` → ~839,884 probes. Arithmetic; needs the A/B.

### 5. `variantIndexOf` → a map — **measured**

- **Site:** `compiler/emit_classify.vl:19896`, over `uVariants` (48 entries).
- **Evidence:** **163,371 calls, 5,742,013 iterations, mean 35.1.** 13.9% of the measured
  string comparisons.
- **Proposed:** `{[string]: i32}` built once in `collectU` (which already owns the reset).
  Mean 35.1 is the clearest map case in the set.
- **Projected:** 5,742,013 → ~163,371. Arithmetic.

### Below the line, with their reasons

- **`capIsBound` / `capHas` (`emit_base.vl:189`/`:198`) — 5,860,910 iterations, max 676,
  mean 15.7.** Above the threshold and the list is far bigger than its name suggests, but
  the arrays are **parameters**, so the fix is at the callers and the callers are the
  capture analysis. The interesting option is the one that costs nothing new:
  `compiler/symbols.vl` already mints dense i32 ids for identifiers, so a bound-set becomes
  a sid-indexed `boolean[]`. Per that design's own rule this pays only when the caller
  already holds the sid or feeds two id-keyed lookups; **audit the callers before writing
  it.** Ranked below 4 and 5 only because the call-site work is larger, not because the
  number is smaller.
- **`tyTopIndexOf` (`tyname.vl:439`) — 871,014 calls, 19,795,037 character steps, 3.0% of
  self-time.** This is not a data-structure problem. It is a **parser for type spellings**,
  and the repair is to stop having type spellings to parse. It belongs to
  `destringify-types-program.md`, whose B283 census already re-pointed the programme at this
  family (`nameIsArray` 2.8 M calls, `arrElemNameRaw` 2.1 M, `tyTopIndexOf` 1.37 M per
  corpus pass) after finding the axis it had spent nine entries on was its sixth-largest.
  **Do not open a parallel effort here.** And note `perf-program.md` §3's standing rule:
  *destringification is a correctness programme* — do not sell its slices as speed.
- **The diagnostic de-dup (`typecheck.vl:5703`) — O(d²), zero cost on a clean self-compile,
  unmeasured under the LSP.** Not a compiler-throughput item at all; it is an editor-latency
  item, and the self-compile gate is structurally blind to it. **Measure it with a
  diagnostic-heavy buffer, not with the compiler.**
- **`scopeSlotOf`, `variantFieldIndex` — do not touch.** Means of 1.72 and 1.65. These are
  the control cases and their numbers are the reason §1 has a lower gate.
- **`nameIn` (`typecheck.vl:3640`) — 0 calls.** Dead in the self-compile path. Neither
  optimise nor keep on a list.

---

## 5. Structure choices, argued

The owner flagged "a trie or w/e, IDK" — right instinct, and the answer is that the
structure is dictated by the key, never by the taste of the person writing it.

**Dense small integers → a dense array indexed by the key.** `cTyIxListHas`'s keys are arena
indices in `[0, 28,555)`. Hashing them is pure loss: you compute a function of an integer to
find a slot you could have addressed with the integer. A `boolean[]` if membership is all
you need; an `i32[]` of "position, or −1" if the caller wants the parallel column too — and
here it does, which is why `structNameOfTy` collapses into the same table. **Cost model:**
one bounds-checked load, no hash, no probe, no collisions, and `4 × arenaSize` bytes.

**String keys with a real distribution → a hash map.** `isUName`, `variantIndexOf`. VL's
`{[K]:V}` is a linear-probe open-addressed table with a stored per-entry hash, and since
#1851 the string header caches its own hash — so a lookup is a header read, a probe, and one
confirming `__str_eq__`. That beats 11 or 35 compares and loses to 1.72.

**Never a trie here.** A trie pays for shared *prefixes* and for *ordered/prefix* queries.
Every string key in this compiler is an exact-match membership test over a set of 11 to 676
short identifiers. A trie would add a pointer chase per character to replace one cached-hash
read, and would be slower than the linear scan it replaced on the short-key sets. The one
place prefix structure would ever pay is completion in the LSP, which is not this workstream.

**Closed vocabularies → an enumeration, not an intern table.** Thirteen `rt*` tags, 67 token
kinds, seven `MfKind`s. `identifier-interning-design.md` §4.1 states the rule after measuring
it: *"a CLOSED vocabulary does not need an intern table. It needs an enumeration."* In VL
that enumeration is a named litunion, and it is free at the use sites.

**Ordered or range queries → sorted + binary search.** There are **zero** in the compiler
today: `grep -i 'binarysearch\|lowerBound\|upperBound' compiler/ std/` returns nothing, and
the sorts in tree are insertion sorts over lists that are ordered for *output*, not for
lookup. (This paragraph and §6.1 said **two**; a re-count while implementing §6.2's sort
found **four** — see the corrected row in §6.1.) **Do not add a binary search
speculatively.** If a sorted lookup appears, it appears with a consumer.

**And the structure that is usually right: none.** 196 scan sites, and the measurements put
essentially all of the cost in nine. The other ~187 are correct as written, and each one
converted is a second thing that must agree with the first.

---

## 6. The `std` pass, both directions

### 6.0 The constraint that governs both directions

**The compiler imports zero `std:` modules today** — `grep -rn 'from "std:' compiler/*.vl`
returns nothing — and that is deliberate. `docs/internals/std-design.md` D2: *"For Phase 2
the compiler does not import std (a program that imports nothing compiles byte-identically
to today)"*, with compiler-uses-std *"allowed AFTER the module-system revisit moves the
build off concatenation; not in Phase 2."*

**But the MECHANISM half of that precondition is already met, and this section originally
read as if none of it were — CORRECTED 2026-08-23.** (D1's verdict is two clauses: a
mechanism clause, which is met, and a phase clause, which is not re-ruled. See the
2026-08-23 note under `std-design.md` D1.) D1's bar rested on seed assembly concatenating
`compiler/*.vl` with import lines range-blanked, which would have blanked a `std:` import
out of the seed. That assembly is gone: `refresh-compiler.sh` builds the real module graph
(the very line quoted three paragraphs down) and says *"No sed/cat/rename glue."* The lift
was **measured** while shipping §6.2's sort — patching `compiler/format.vl` to
`import { sort } from "std:array"` builds, and the resulting compiler works — so what
remains is not a mechanism but a PRICE, and one unmeasured risk. See the 2026-08-23 note
under `std-design.md` D1. **Do not cite "the compiler cannot import std" as a law.**

**And the size cost is worse for the compiler than #1839's headline suggests.** #1839's
scoping comment says the +95% figure is dev-build-only and that `-O` tree-shakes the residue
to ~210 bytes per module. But **the shipped seed is built with plain `vl build`** —
`scripts/refresh-compiler.sh:83` is `"$VL" build compiler/entry.vl -o … --compiler "$SEED"`,
no `-O`, and ROADMAP:393 states the seed *"is UNOPTIMISED"*. So the compiler is precisely
the consumer that pays #1839's **raw** cost: 4,992 bytes for `std:str`'s 15 exports, 7,237
for `std:fs`'s 19. **Any "move it to std" proposal for compiler code owes a measured byte
delta on the seed** — and there is now one: importing `std:array` into `compiler/format.vl`
took the seed from **1,376,574 to 1,443,654 bytes, +67,080 (+4.9%)**, for one module. The
second half of the price is **unmeasured**: whether `scripts/native-fixpoint.sh` still
converges with std in the graph, i.e. whether every std edit then perturbs the seed. That
is the question a real proposal has to answer first.

That is not an argument against the direction. It is the reason this section recommends
moving almost nothing.

### 6.1 Direction A — what is inside `compiler/` that is really general-purpose

| candidate | where | verdict |
| --- | --- | --- |
| **Insertion sort, written ~~twice~~ FOUR times** | `cli.cliStableSort` (`cli.vl:682`), `format.fmtSortNames` (`format.vl:673`), `cli.cliSortFiles` (`cli.vl:874`), the edit-order sort in `cli`'s lint-fix path (`cli.vl:1689`) | **One algorithm, four comparators.** Identical stable-insertion body (`while j >= 0 && less(key, xs[j])`), differing only in `cliDiagLess` / `fmtNameLess` / `cliStrGt` / a `pos[]` lookup — and **every one of the four is a boolean less-than**, the multi-key one included, which is what settled the comparator shape in `std:array`'s ordering pair (§6.2). Two of the four sort an **index list** whose comparator reads parallel arrays it closes over. **No copy is measured hot**; the DRY case is real, the perf case is unmeasured. **Migration is NOT scheduled, and the reason is a PRICE, not a bar** (this row first said §6.0's blocker "stands"; §6.0 is corrected — the module-system precondition is met and the import was measured to work). Importing `std:array` into one compiler module costs **+67,080 bytes (+4.9%)** on the unoptimised seed, and the fixpoint cost is unmeasured. Against that, insertion sort is genuinely optimal at these four call sites — lowest constant, stable, **no auxiliary allocation**, lists short by construction — so `std:array.sort` would not make them faster or smaller. The right end state may well be that the four collapse into one internal helper and never import std at all. |
| **`i32ToStr`** | `ast.vl:1540` | Duplicates `std:fmt.toStr(self: i32 \| i64 \| boolean)`. A textbook move — and blocked by §6.0. Leave it and note the duplication. |
| **`indentStr`** | `fmt_util.vl:56` | A memoized `std:str.repeat`. **The memo is the interesting part, not the repeat** — a general `repeat` in std does not carry a per-depth cache, and the cache is what removed the per-line allocation. Do not move; the compiler-specific half is the whole value. |
| **`strutil.cpCount` / `pushCps`** | `compiler/strutil.vl` | **Explicitly must NOT move.** Its header records why: `cpCount` deliberately avoids the `cpLen()` intrinsic because the bootstrap seed that compiles this source predates it, and every function in that file must answer identically under both string representations or `compile(X) == X` stops converging. This is bootstrap-constrained code that *looks* like a std utility. Good example of why this pass has to read headers. |
| **`symbols.vl`'s intern table** | `compiler/symbols.vl` | A genuinely general structure (string → dense id), but its rulings are compiler-specific: whole-program id space minted per compile, ids explicitly **not** stable or orderable, an arena-node side-table carrier. std-design's admission principle keeps out *"anything speculative without a consumer in the tree"* — and the only consumer is the compiler itself, whose rulings are the reason the shape is what it is. **No.** |
| **LEB128 / wasm byte emission** | `emit_bytes.vl` | Format-specific. No. |
| **The ~100 `includes`-shaped scans** | everywhere | **The most tempting and the most wrong.** `std:array` **already exports** `includes<T>`, `indexOf<T>`, `count<T>`. Consolidating ~100 hand-written scans onto it would (a) freeze the wrong data structure into a permanent, undeprecatable std shape, (b) make every one of them invisible to the census in §2, and (c) fix nothing — the scan is still a scan. **These sites are what the workstream is trying to delete, not relocate.** |

### 6.2 Direction B — what `std:` should grow for users, independent of the compiler

Today: `str`, `fmt`, `fs`, `args`, `utf8`, `array`, `buffer`, `test`, `seed`. No `list`, no
`map`, no `set`, ~~no sort~~ (shipped as a pair, below), **no binary search, no priority
queue, no deque.**

- **A sort. SHIPPED, as a PAIR** — `std:array.sort<T>(self: T[], less)` in place, and
  `sorted<T>(self: T[], less): T[]` returning a new list. Both stable, both O(n log n)
  comparisons worst case; a bottom-up merge over runs an insertion sort has already ordered,
  base-case run length **16** picked off a sweep of 8/12/16/24/32 at six sizes rather than off
  folklore (table in the comment above the function). `sort` allocates **nothing** up to n=16
  and one n-element buffer above; `sorted` allocates the returned list always and the same
  auxiliary only above the threshold — n below, 2n above.

  **#1856 shipped only `sorted`, and that was the wrong surface.** In place is the
  convention, not the exception — Rust `slice::sort` (no copying variant in std at all), Go
  `sort.Slice`, C++ `std::sort`, Java `Arrays.sort`; JS `.sort()` has always mutated and
  `toSorted()` is ES2023. Only Python ships both. And the copy taxes precisely the caller the
  O(n log n) is *for*: 2n on the million-element sort, with no way to opt out. The argument
  that carried the first draft — "no std export mutates through `self`" — was really "these
  nine exports are all transformers so far", while `std:buffer` mutates linear memory and
  `std:test` mutates module globals.

  The comparator is a **boolean strict less-than**, which is what all four in-tree comparators
  already are (§6.1). Behaviour under an *inconsistent* comparator is documented rather than
  undefined: the order is unspecified but the result is always a permutation, and — for a
  comparator that merely ANSWERS wrongly — it never traps, because every loop is bounded by
  an index and not by the comparator. (A comparator that MUTATES the receiver is a separate
  failure: under the in-place `sort`, shrinking `self` traps.)

  Generality is **free at the short lengths this tree actually sorts** — n=16 measures
  0.448 us for the merge and for a plain insertion sort alike, n=8 0.176 vs 0.168 us — and it
  is **11.2x** at n=1024 (90.5 us vs 1014.5 us; 10,583 comparisons vs 258,411). `sort` vs
  `sorted` is an ALLOCATION difference and barely a time one: 420 vs 469 ns at n=16, a tie at
  n=1536, 1.3% at n=65,536.

  **The two bodies are duplicated, and that is a compiler limitation.** `sorted` should be
  `copy; sort(out, less); return out`; a generic function cannot pass its own generic-typed
  function parameter to another generic function, in any of four spellings
  (`tests/cases/std/error-generic-closure-forward.vl`). `tests/cases/std/array-sort-agrees.vl`
  runs both exports over every length 0..200 and fails on the first divergence, so the
  duplication is gated rather than merely deprecated.

  What was deliberately NOT added: `sortUnstable` (a second name doing almost the same thing;
  additive later if a measurement demands it), `sortedBy(keyOf)` (a two-line comparator), a
  defaulted `xs.sort()` (no `<` for structs, and no overloading to express the split), and a
  binary search (still zero consumers — the ruling above stands).
- **`std:map` / `std:set` are already planned** (std-design slice 6, gated on slice 5
  `std:list`). Worth noting for scope: `{[K]:V}`, `Map()` and `Set()` are **language**
  builtins, class 1 of the intrinsic floor. What std would add is *algorithms over* them —
  `keys`, `values`, `entries`, `merge` — not the type. That reframes slice 6 as smaller than
  it reads.
- **Binary search / `lowerBound`: no.** Zero occurrences in the tree, no consumer. The
  admission principle excludes it by name.
- **A bitset / dense-int set: no.** Candidate 1 needs exactly this and the right
  implementation is `let has: i32[] = []` with an index — three lines, no abstraction earns
  its place, and a `std:bitset` would be a worse spelling of an array subscript.

**Both directions land on the same summary: `std` should grow a sort, and `compiler/` should
move almost nothing into it.** The general-purpose-looking code in `compiler/` is either
bootstrap-constrained (`strutil`), compiler-specific in its rulings (`symbols`), or the very
structure this workstream is removing (the ~100 scans).

---

## 7. What NOT to do

**Already refuted with numbers — re-reading these is cheaper than re-measuring them.**
`perf-program.md` §3 and `perf-landscape.md` §5 rule out: interning **type** names (6.08%,
and destringify is the right vehicle); `flat` record conversion of compiler tables (emits
byte-identically); a different collector; P4b Boyer-Moore-Horspool `indexOf`; P7b's hash
cache *at the filed size*; P10 immutable globals; the P2/G2 closure-unpack loop hoist
(re-derived at 1.12×, not 10.6×); and UTF-8/i8 strings framed as a compiler change.
ROADMAP A16's *allocation* rationale for the compact litunion rep is also already refuted —
only equality and correctness survive.

**And the lesson that this workstream most needs to inherit is a rejection, not a win.**
#1851 shipped the string-header hash cache — `__str_hash__` 3.59% → 0.73%, 80% of all hashing
removed, **−1.5%** on `vl check`, n=21 interleaved pairs, paired *t* = 3.19, *p* ≈ 0.005. In
the same investigation it **built** the `==` hash short-circuit, **measured** it at
**−0.17%**, and **rejected** it: `__map_probe__` already gates on a stored per-entry hash,
and direct `==` is over 3–7-byte pooled literals whose scan is 1–3 iterations, which two
`struct.get`s and three branches cannot beat.

**A change that is theoretically better and measurably nothing is a maintenance liability**,
and the liability is worst exactly where this plan operates: a side index and its backing
list are two things that must agree, forever, and the cost of them disagreeing is a
miscompile. §16 of `perf-program.md` declined a follow-on worth ≈0.25% for precisely that
reason — *"a miscompile-class invariant for a quarter of a point."*

So: **every candidate in §4 ships with its A/B or it does not ship.** "It has to be faster"
is not a result.

---

## 8. Measurement protocol

### 8.1 User CPU time, never wall clock

`/usr/bin/time -f "%U"`. Wall clock on this box has produced multi-second outliers and
self-contradicting ratios — the same change reading *2.6× faster* and *3.7× slower* on
sibling inputs, because several agents share the machine.

Two supporting facts from this document's own runs: the `vl` host is **multi-threaded** —
my probe runs read `user=12.31 wall=7.23` and `user=10.42 wall=4.99`, i.e. ~1.7 cores — so
`%U` is a **sum across threads** and wall clock is a measure of the scheduler as much as of
the program. `%U` is stable under external load in a way wall clock structurally is not.

`perf-program.md` §17.5 adds the matching trap for the profiler: **the guest profiler samples
on a wall-clock timer**, so its sample counts move with load too. *The timing channel is CPU
milliseconds, not the sample count.*

### 8.2 Counters before timers — the cheapest instrument, and it answers a different question

This is the protocol that produced §3, and it should be the first move on any candidate.

1. `cp -r compiler std <scratch>/` — **never instrument the repo's `compiler/`.**
2. Add `pbCalls` / `pbIters` / `pbMax` to the scan (three lines, §1).
3. Report through an existing channel. The compiler wasm is instantiated with an **empty
   linker**, so it has no `print` import — a `tErr(...)` diagnostic is the working channel,
   and `i32ToStr` (`ast.vl:1540`) is the formatter.
4. Build: `vl build compiler/entry.vl -o probe.wasm --compiler build/vl-compiler.wasm`
   (~2 s user, ~650 MB RSS).
5. Run: `vl check --codegen compiler/entry.vl --compiler <scratch>/probe.wasm`
   (~12 s user, ~880 MB RSS).

**Report at the end of `emitProgram`, not `checkProgram`.** A `tErr` raised during checking
stops the driver before the emitter runs, and I lost a round to it: the first probe reported
`cTyIxListHas` at **605** calls and it looked like the whole 12.9% was a phantom. The real
number is 1,426,650, and all of it is emit-side.

A counter and a timer answer different questions. **The counter tells you whether the work
exists; only the timer tells you whether removing it is worth anything** — see §7.

### 8.3 Never benchmark with a synthetic corpus

A generated 8,000-function file checks *slower* than a 12,000-function one, reproducibly, in
both directions, because map probe cost is collision-bimodal. **The whole compiler is one
fixed real input and it is the only honest instrument.**

### 8.4 The A/B, modelled on #1851

n = 21 interleaved pairs (ABABAB…, never all-A then all-B), user CPU time, a **paired
*t*-test**, and a **stated *p***. #1851 reports −1.5%, *t* = 3.19, *p* ≈ 0.005; that is the
bar. Do not quote a single wall clock. Re-baseline before targeting — half the filed numbers
in `perf-landscape.md` moved between filing and pricing.

### 8.5 Measure the command that exercises the path

`vl check` and `vl build` are not interchangeable and the difference is not small.
`cTyIxListHas` runs **605** of its 1,426,650 probes during checking, so #1853 — worth
**−11.6%** on `vl build compiler/entry.vl` — measured **+0.0%** on `vl check`. A `vl check`
A/B would have read that change as dead and rejected it.

Before the A/B, ask the counter *which command runs the code*. Checker-side work
(`typecheck.vl` proper, scope resolution, annotation resolution) measures on `vl check`;
anything in the `nodeTyIs*` / rep / classify / section families is emit-path and needs
`vl build`. When in doubt, run the counter under both — that is one extra 6-second run.

### 8.6 Three instrument traps already paid for

- **The loop-shape counter in `tests/selfhost_native_release_test.ts` is module-wide** and has
  produced two false positives (P3's and P7a's unroll remainders). Get per-function counts.
- **A cold `.cwasm` sidecar is a constant ~1.85 s, never a ratio** (290× on a one-function
  file, 8.9× on a 22 K-line one). Measure `tiny.vl` as the control; a ~600 MB reading for a
  five-line file means the sidecar was cold.
- **A "regression" is a stale `build/vl-compiler.wasm` until proven otherwise.** One
  already happened this session. `scripts/refresh-compiler.sh` before any measurement that
  follows an edit to `compiler/*.vl`.

### 8.7 Gates

Candidates 1, 4 and 5 change how the compiler *decides*, not what it emits, so the primary
correctness gate is byte-identity of the self-compile plus `scripts/native-fixpoint.sh`.
Candidate 2 touches the rep layer, which makes `scripts/rep-fuzz-check.sh` **mandatory** —
the corpus, the suites and the fixpoint are all blind to REJECT→MISMATCH.

---

## 9. Corrections to the framing this document was commissioned under

Recorded because the brief asked to be corrected rather than agreed with.

1. **`scopeSlotOf` is not a candidate. It is the control case.** It was named first in the
   brief's list of linear-scan sites. Measured mean: **1.72 iterations**. A map there is a
   loss, by #1851's own −0.17% measurement.
2. **`nameIn` is called zero times** in a self-compile. It was on the same list.
3. **`variantFieldIndex`-shaped scans are correct as written** — mean 1.65 over a 7-element
   source-local list. The "bounded by a source-local quantity" half of the proposed rule
   holds up; it just is not the half that finds anything.
4. **"Bounded small list" is not a safe reading of the code.** `capIsBound`'s list measures
   **676**. `isUName`'s measures 11 and still costs 9.2 M string comparisons because the
   predicate answers NO. **Length is a weak signal; mean-iterations-per-call is the strong
   one.**
5. **The `cTyIxListHas` "handful" comment was wrong, but not in the way the brief or this
   document first said.** It was *right* about the size — 60 structs, 189 variant members,
   none of it growing with the arena. It was wrong because size was never the deciding
   quantity: the cost was 1,426,650 probes that nearly always answer NO. **The category
   still holds** (`typecheck.vl:5703` is a second instance, and its assumption is invisible
   to every gate the project runs because it only breaks in the LSP) — but the category is
   *"a comment that asserts a quantity nobody measured"*, not *"a comment whose number went
   stale"*.
6. **The 102-function census over-counts for the stated reason, and the corrected number is
   196 scan sites over 115 backing arrays** — larger, not smaller, because it counts loops
   rather than functions and includes integer keys. Neither number ranks anything: **nine
   sites carry effectively all the measured cost.**
7. **`__str_eq__` at 19.2% needs its provenance stated every time it is quoted.**
   `perf-program.md` §2 reads `__str_eq__` at 25.19% total with a **19.10%**
   SYMBOL/IDENTIFIER consumer class — and that document predates #1848, which changed the
   string representation *today*. The new total and the old symbol-class share agree to
   0.1 points. Both readings are defensible from the numbers in the tree; **re-derive the
   consumer split post-#1848 before scheduling off it.**
8. **`cTyIxListHas` is not a checker cost.** 605 of its 1,426,650 calls happen during
   checking. Anything that reasons about it as type-checker work is reasoning about 0.04%
   of it.
9. **`tyTopIndexOf` is not a data-structure problem** and should not get a data-structure
   fix. It is a string parser for type spellings, it already belongs to an active programme,
   and that programme's own rule is that its slices are not sold as speed.
10. **This document's own §4.1 was incomplete within four hours of being written.**
    `cTyIxListHas` routes **six** arena-index sets, not the two its call sites showed me,
    and #1853's census found the other four. The lesson is the one `CLAUDE.md` already
    states — *re-run a doc's own witness before quoting from it* — and it applies to this
    file from the day it lands. Every number here is dated `727c7cc2`.
11. **#1839's "no cross-module DCE" is true, but its headline number does not apply to the
    compiler — it applies *worse*.** The issue's own scoping comment retires the +95% figure
    for `-O` builds (~210 bytes/module). The compiler seed is built **without** `-O`, so it
    is the one consumer that would pay the raw 4,992–7,237 bytes per std module.

---

## 10. Sequence

1. ~~**Candidate 1** (`cTyIxListHas` → dense side table).~~ **SHIPPED, #1853, −11.6%.**
2. ~~**Candidate 2** (`rtKind` → named litunion).~~ **SHIPPED, #1855, −2.10%** over four
   annotations. The projected `17,664,170 __str_eq__ → i32.eq` happened exactly as written;
   the *time* it was worth was ~6× less than the call count implied. See §2.
3. **Candidate 3(A)** (`br_table` for litunion dispatch). Compounds with 2 and needs no
   language change.
4. **Candidates 4 and 5** (`isUName`, `variantIndexOf` → maps). Small, independent, and
   together they are the honest test of §1's threshold — if either measures like #1851's
   −0.17%, the threshold is wrong and this document should say so.
5. **Re-profile with a consumer split** (§9.7) before anything below this line is scheduled.
6. Then, and only then: `capIsBound`'s callers, the LSP diagnostic path, and the std sort.

**Candidate 3(B)** (`string` → litunion) is a language change gated on 3(A) proving the
dispatch win, on a sub-linear lookup design, and on ROADMAP A5c's named-vs-inferred rep
split. It is also, independently, an invalid-wasm bug (#1852) that should be closed by
rejecting `s is "lit"` on a `string` in the meantime.
