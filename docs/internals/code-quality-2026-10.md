# Code quality, October 2026: the consolidated ranking

One ranked list, merged from four read-only area surveys of `origin/master` **5d4cd14dc**
(2026-10-11): front end and checker, emitter, types and reps, tooling/std/host. Lane SC's
function-value flow design (PR #3531, `docs/internals/fn-value-flow-design.md` on its branch)
is folded in where it and the surveys describe the same store. The September ranking it
follows is `code-quality-survey-2026-09/README.md`; its status is the last section here.

`docs/ARCHITECTURE.md` states the contracts these items are measured against. Its "Known
deviations" section links each deviation to an item here.

**How to read the numbers.** Every number names its population and its instrument, and the
caveats the surveys attached are kept: a keyword count is a lower bound on keyword match, not
a mechanism count; a sample extrapolation carries its 95% envelope; UNDECIDED means nobody
measured it. Where two surveys measured the same thing differently, both figures are given
and the difference is explained in [Where the surveys disagree](#disagree). No gate, census or
self-build was run to produce this document. Two probes were re-run on 2026-10-11 against the
`~/vl` `vl` binary (they are the new findings under [L3](#L3)).

## Ranking rule

LARGE items are ordered by

> (inventory rows the mechanism explains) × (how much soundness work it unblocks) ÷ (cost)

using the row estimates the surveys measured. The row population for the type/rep items is the
types-and-reps survey's seeded sample: **100 of the 827 inventory rows D3000–D4000**
(`random.seed(2610)`, each row's own text read and classified by MECHANISM). Its classes:

| class | mechanism | in the sample | of 827 (95% envelope) |
| --- | --- | ---: | --- |
| S | lane SC function-value pins | 23 | ≈190 [126–254] |
| A | the checker's type vs an emitter re-derivation | 19 | ≈157 [98–217] |
| B | per-instance type not carried through monomorphization (non-SC) | 17 | ≈141 [84–198] |
| N | identity by name or spelling; a registry row | 8 | ≈66 [25–107] |
| C | a checker type rule, join, narrowing or ruling | 11 | ≈91 [43–139] |
| M | a single missing arm | 8 | ≈66 [25–107] |
| O | outside the type/rep area | 14 | ≈116 [63–169] |

A + B + N is **44 of the sampled 100** (≈364 of 827, [288–439]); with S it is 67 of 100. Only
65 of the 827 rows use explicit "disagree" language, so a keyword count would have reported a
tenth of this.

Items whose row count was not measured are ranked on unblocking and cost alone, and say so.

## LARGE items

| # | item | rows it explains (population named) | cost | blocked on |
| --- | --- | --- | --- | --- |
| [L1](#L1) | Bank the per-call generic binding in the checker; key mono and SC's flow table on it | class B ≈141 of 827, plus S ≈190 of 827 when SC keys into it | 3–5 weeks | nothing; coordinate with SC |
| [L2](#L2) | Decide a node's rep once, from its type: stop render→parse, then resume RepDesc | class A ≈157 of 827; 30 of 607 clause-1 rows by keyword (lower bound) | ratchet 0.5 d; twins 2–4 d; rep column 2–3 w; RepDesc 4–8 w | two owner rulings for the literal-union and nullable families |
| [L3](#L3) | Move emit-side legality refusals into the checker | 1 live clause-2 site (D4071) and 1 clause-1 site (D4070) of 9 probed; 140 of 676 sites by hand classification | 1–2 days per family | SC for one family |
| [L4](#L4) | One `CheckMark` / `checkRollback` for the checker's quiet probes | 12 inventory rows cite the machinery by name | 2 d + 3–4 d | nothing |
| [L5](#L5) | One pin driver for the checker's solve-and-re-check mechanisms | not measured; time-sensitive (PR #3516 adds a fourth loop) | 3–4 d + 2 d | land before or with #3516 |
| [L6](#L6) | Key registries by structural id; collapse the eight type-equality notions | class N ≈66 of 827 | 2–4 weeks | aligns with the D3870 ruling |
| [L7](#L7) | Retire ambient `pending*` delivery state into `ExpCtx`; one memo module | the D1105 "runs alone, fails in company" family; not counted | 1–2 w + 1 w | nothing |
| [L8](#L8) | `tyquery.vl` shared by checker and emitter; split `emit_classify.vl` | enabler for L2; not counted | 2 d + 1–2 w | self-compile price UNDECIDED |
| [L9](#L9) | Split `typecheck.vl` along its call graph | not counted | first carve 2–3 d; full 2–3 w | L4 first |
| [L10](#L10) | The host `-O` optimizer as one decoded IR (and an owner question about where it lives) | 20 D-ids cited by 9 commits since 2026-10-04 | 4–6 days | owner question |
| [L11](#L11) | Repo lint rules written once, not in VL and Python | 19 of 22 commits were twin edits | ~3 + 1 days | syntax-tree API ruling direction |
| [L12](#L12) | One LSP feature layer for the server and the playground | not counted | ~3 days | nothing |
| [L13](#L13) | The host import surface as a table; errno stated once | not counted | 2–3 days | nothing |
| [L14](#L14) | Type section emitted from the recorded allocation order | not counted | M–L | nothing |

<a id="L1"></a>
### L1. Bank the per-call generic binding in the checker; key mono and SC's flow table on it

*Sources: types-and-reps L1; lane SC #3531; emitter §3 L1 note on `emit_mono`.*

**Problem.** The checker computes the exact binding of every generic call — `bNames`/`bTys` in
`checkCallOnFuncTy` (`compiler/typecheck.vl:50029–50435`, via `bindGenWalk` and
`substTyDeep`) — and then discards it, keeping only `holePinSet`: one pin per hole, keyed by
the string `"!p!" + owner + "!" + tvName` (`holePinKey`, `typecheck.vl:4046`), with `0 - 2`
meaning "the calls disagreed" (`:44929`). An instance shares its leaf nodes with the generic
body, so `nodeTyIxOf` on an instance node answers the GENERIC's type
(`emit_classify.vl:29624` says so; D1693). The emitter then rebuilds the binding:
`bindGenWalk` runs again at `emit_mono.vl:1824, 4345, 5693` and
`emit_classify.vl:32818/32823/32846`; `monoArgTyName` (`emit_mono.vl:1261–1785`) is 525 lines,
76 `return`s in code (81 counting the word in comments), 27 distinct D-ids cited in its body
(comments included), and ends in an `"i32"` catch-all; the pin travels as a spelling
that `nameToTy` re-parses.

Lane SC found the same fact from the other side: its flow table banks per-call type
arguments (`bNames`/`bTys`) to decide which function value a binding holds. Two banks of one
fact would be a new instance of the problem this item removes.

**Measured cost.** Class B, ≈141 of 827 rows [84–198]; class S, ≈190 of 827 [126–254], is the
same disagreement in the function-value domain. Growth over 15 days (types-and-reps, 5eee42758
→ 5d4cd14dc): `Pin` functions outside the fn-value family 95 → 224; emitter functions taking
`(x: i32, fnIx: i32)` 448 → 607; `nodeTyIxOf(` calls in the emitter files (`emit_*.vl` and
`wasmEmit.vl`, `emit_mono` included, comment-stripped) 310 → 630, of 815 in the whole compiler
at 5d4cd14dc; `emit_mono.vl` 6,563 → 14,624 lines.

**Proposed shape.** (a) The checker banks each resolved call's binding in a column keyed by
call node: type-parameter ordinal → arena type id. (b) Mono's instance key becomes the tuple of
type ids, not the pin spellings. (c) Mono writes a per-instance node-type column while cloning,
so `nodeTyIxOf` answers per instance and `monoArgTyName` retires to a fallback, then away.
SC's flow table keys into (a) instead of minting its own binding store; its `identDeclIx`
column (binding = declaring node index) is the other half of the same identity.

**First PR.** A shadow harness shaped like `repShadowOn`: compute the banked binding beside
`monoArgTyName`, off by default, and print every disagreement over `tests/cases` and the
distilled corpus. Byte-identical seed with the harness off. Each disagreement is a latent row
or a hole in the banking, and the list is the measurement.

**Proof at switch time.** Byte-identical seed where the shadow agreed; distilled corpus with no
`runs → not-runs`; a capability matrix with an open type parameter
(`spread-into-generic-rest.matrix.vl` shape, because the defect class is inference doing the
pinning); `scripts/mono-tyaram-grid.sh`; `--prove-fixpoint`.

**Dependencies.** Coordinate with lane SC so #3531's table names this column as its source.
SC's open ruling C (a binding called at two or more signatures) decides the shape of the
instance record for closures, not the existence of the banked binding.

**Cost.** 3–5 weeks: shadow 1 week, banking and key 1–2, retiring the `monoArgTyName` ladder by
D-id 1–2.

<a id="L2"></a>
### L2. Decide a node's rep once, from its type: stop render→parse, then resume RepDesc

*Sources: emitter L1 and types-and-reps L2 (the same defect read from two ends); emitter S1,
S2; types-and-reps §5 "Rep phase".*

**Problem.** The emitter answers questions about a checked type by rendering it
(`tyToEmitName`) and parsing the string with parsers written for annotation spellings. The
destringify campaign had closed this by September; it has come back. Separately, a value's rep
is decided by 708 classifiers reading five kinds of input, and the classifiers that read two
producers for one answer grew in every pair.

**Measured cost.**

- Emitter files (`emit_*.vl` and `wasmEmit.vl`), excluding `emit_mono` unless stated, with
  comments stripped. `tyToEmitName(` calls 24 → 81 (emitter survey, facb9f610 → 5d4cd14dc).
  Render-then-parse, counted at 5d4cd14dc as a call whose first argument is a direct
  `tyToEmitName(` call (`f(tyToEmitName(…))`, a `push(` excluded): **21** outside `emit_mono`
  and **19** inside it (SC territory). The survey's earlier "8 → 29, 9 more in mono" used a
  wider one-expression rule that was not recorded, so it is not reproducible and the trend is
  not restated here. The ten type-string parsers: **338** call sites at 5d4cd14dc; the
  survey's 343 also counted the five parser declarations in these files, and its September
  303 was taken the same way.
- Rep classifiers (`rep-classifier-census --summary`, 2026-09-06 → 5d4cd14dc): 519 / 2,962 →
  708 / 3,553 classifiers / call sites. Inputs: ARENA 204, NAME 137, SPELLING 33, TABLE 157,
  FRAME 277. Two-producer pairs: ARENA+NAME 33 → 37, ARENA+SPELLING 10 → 12, ARENA+TABLE 33 →
  46, NAME+TABLE 40 → 47, ARENA+FRAME 46 → 67.
- Rows: class A, ≈157 of 827 [98–217]. Of the 607 clause-1 rows among the 1,261 filed since
  2026-09-06, 30 say the decision was made by name or spelling and 15 name `monoArgTyName` or a
  rendered name — **a lower bound on keyword match**, not an ablated count; how many of the 607
  a rep-from-type path would have prevented is UNDECIDED.

**Proposed shape.** Three stages, each useful alone.

1. A ratchet on `tyToEmitName(` and the ten parsers outside the renderers and the annotation
   path, as a `vl check --budget` ratchet (the retired `scripts/ratchet.py`'s successor).
2. Type-taking twins for the parsers behind a render: `valueAtomKindOfTy` (the six
   `valueAtomKind(tyToEmitName(…))` sites, `wasmEmit.vl:16056, 16057, 32542, 32598, 32607,
   33056`), `mvValKindOfTy`, `tyIsArray`, `internShapeDeepTy` without its string argument,
   `cloSigTagSlot`, and the existing-but-unused `nulScalarListKindOfNode`
   (`emit_classify.vl:23440`, bypassed at `:3188`). Their home is L8's `tyquery.vl`.
3. One per-node checked-rep column — `repOfTy(nodeTyIxOf(ix))` banked once, per instance after
   L1 — that the `expr*` classifier family reads (`exprRefArray` 71 sites, `exprString` 48,
   `exprStringArray` 32, `exprArray` 31, `exprF64Array` 22, `exprListRep` 14 partial). Then
   resume the RepDesc campaign (`rep-descriptor-campaign.md`) family by family under its
   existing LEFT-ONLY / RIGHT-ONLY oracle; the campaign showed `reflist` LEFT-ONLY falling
   15,872 → 235 where it was applied.

**First PR.** The ratchet (0.5 day), then the six `valueAtomKindOfTy` sites. Proof: byte-identical
seed (`cmp`). A site whose bytes change has found a render/parse disagreement: file it as a row
rather than merging it.

**Proof for stages 2–3.** Byte-identical seed per domain-keeping conversion;
`scripts/rep-fuzz-check.sh` (mandatory: rep layer and interner); `regress.py`;
`scripts/capability-matrix.vl` on the matrices for the touched reps.

**Dependencies.** Stage 3 for literal unions and nullable reps needs the two open rulings
`one-literal-union-rep` and `nullable-rep-rule-stated-once` (`docs/internals/open-rulings.md`,
the sections at lines 918 and 984). The RepDesc campaign stopped at 2026-09-07 waiting on them;
they have been open five weeks. Stages 1–2 need neither. Stage 3 per instance needs L1. L1 and
this item must not both edit `monoAnnPinName`'s callers while SC is in flight.

**Cost.** Ratchet 0.5 day; twins 2–4 days; rep column 2–3 weeks by classifier; RepDesc 4–8
weeks, 1–3 days per family.

<a id="L3"></a>
### L3. Move emit-side legality refusals into the checker

*Source: emitter L4 and §7.*

**Problem.** The pass table's one legality check is the `checkFnParams` row, which calls
`checkParams` (`emit_sections.vl:940`) for every function: it refuses a parameter that still
names an unsubstituted type parameter (`:962`) and any parameter type outside its valtype
ladder (`only i32, i64, f64, f32, boolean, struct, union, array, or string parameters are
supported`). The `checkTopLevel` row is a no-op (`passCheckTopLevel() { 0 }`, `:5895`) kept
only for the ordering edge `collectFns` declares; it enforced the refusal D1080 retired.

`scripts/emit-refusal-sites.vl` reads **676** `emitFail` call sites at 5d4cd14dc
(533 on 2026-09-05). A hand classification of each site's template at 5d4cd14dc (keyword
rules applied by the survey and not recorded as a script, so it is not reproducible as a
regex; a seeded sample of 30 re-read by hand agreed on 27) puts **140 of 676** in LEGALITY (names a contract about the user program), 108
LOWERING, 415 FLOOR, 13 UNDECIDED. Every emit-side legality refusal that a `vl check`-clean
program reaches is a clause-2 violation by construction. The 140 is a class, not a reachability
count: of nine direct-spelling probes, five were refused by the checker first.

**New findings (re-run on 2026-10-11 against the `~/vl` `vl` binary; filed as D4070 and
D4071):**

- Clause 1, [D4070](inventory/D4070.md). An excess field in an object literal is check-clean
  invalid wasm when the destination record has a literal-typed field:

  ```vl
  type U = { k: "a", v: i32 } | { k: "b", s: string }
  const u: U = { k: "a", v: 1, w: 2 }
  if u.k == "a" { print("a") }
  ```

  `vl check` → `no errors`, rc 0; `vl run` → `type mismatch: expected (ref $type), found (ref
  $type)`. The union is not an ingredient: the single record `type A = { k: "a", v: i32 }`
  gives the same invalid wasm. The literal-typed field is: with `k: string`, or no `k`, the
  checker's excess-field rule refuses the literal. So this is the checker's excess-field rule
  skipped for a record with a literal-typed field; where it is skipped is not located. It is
  not explained by the union-variant guard at `wasmEmit.vl:2348`, since the single-record
  spelling fails the same way.
- Clause 2, [D4071](inventory/D4071.md). A value-`if` whose `else` ends in a statement: `const x = if c { 1 } else { let y = 2 }`
  in a function whose `x` is unused. `vl check` reports two warnings and rc 0; `vl run` refuses
  at emit with `if-expression arm ends in a statement, which yields no value`
  (`wasmEmit.vl:16609`). When `x` IS read, the checker already refuses (`print expects a value,
  got i32 | void`), so the checker knows the type; it just does not refuse the binding.

**Proposed shape.** Move three families into the checker: value-`if` arms that yield no value
(6 sites), object-literal shape against a union variant (17 sites),
and the mono function-value one-signature rules (~12 sites in `emit_mono`; lane SC's direction —
coordinate, do not duplicate). `checkParams`'s valtype-ladder refusal was a fourth candidate;
probed on 2026-10-24, no direct spelling reaches it, only a monomorphizer pin defect (D5001), so
the pass row is gone and the floor runs per function in `emitFuncCode` (`paramValtypeFloor`). D4070 is not an emit
refusal at all; its fix is the checker's existing excess-field rule, applied where it is
skipped. Leave the built-in arity family (~45 sites) as floors behind the
checker rule that already exists, and reword them as internal invariants so a reached one reads
as a compiler bug. D411 covariance (7 sites) is a DESIGN refusal and stays.

**First PR.** Close the value-`if` family (D4071): a witness
that now `check reject`s with the same contract; `regress.py` with no `runs → not-runs`;
`check-filed-witnesses.py --strict`.

**Dependencies.** SC for family 3 (the mono rules). **Cost.** 1–2 days per family.

<a id="L4"></a>
### L4. One `CheckMark` / `checkRollback` for the checker's quiet probes

*Source: front-end L3.*

**Problem.** "Check something quietly, then discard what it recorded" is hand-written at seven
sites (`cstrProbeBefore` `typecheck.vl:52047`, `solveUnannotParams` `:43189`,
`inferReturnsPrePass` `:51856`, `globalInitPrePass` `:51984`, `monoRecheckBegin/End`
`:63683/:63766`, `dstTyParamAdapts` `:50538`, `argCstrFitsAt`/`validateCompArgCstr`). The state
they must roll back is 10 `*Cstr` families of **52 parallel columns** (8 / 37 in September),
plus the hole, infer, redun/rcoal/isval, calleeWrite and nj tables. The four truncation lists
disagree: `cstrTablesTruncate` omits bin and print; `monoRecheckEnd` omits arg, let, bm, ret,
mem, ufcs and is; `monoRecheckBegin` stores its marks positionally as `sv[0]`..`sv[20]`.

**Measured cost.** 12 inventory rows cite this machinery by function name: D491, D592, D1400,
D1520, D1566, D2241, D2294, D2802, D3062, D3078, D3402, D3746.

**Measured (A1, 2026-10-12).** The first PR's assertion (`probeRollbackArm`, off by default;
`scripts/probe-rollback-census.ts`) marks 137 tables at each probe's entry and counts every
table whose length moved by its exit. Over 15,287 programs (5,162 `tests/cases`, 1,477
distilled cells, 8,647 named cells, `compiler/entry.vl`), on c722ff637. A family's count is its
busiest column; no table ever shrank. "rolls back" is what the site truncates today.

| probe | ran (runs / programs) | rolls back | left behind (programs) |
| --- | --- | --- | --- |
| `argCstrFitsAt` | 26 / 4 | — | nothing |
| `validateCompArgCstr` | 9 / 2 | — | nothing |
| `dstTyParamAdapts` | 146 / 33 | — | nothing |
| `tpIfRecheck` | 21 / 6 | `cstrTablesTruncate` | nothing: its bin/print omission is never exercised |
| `monoRecheck` | 3,257 / 1,469 | 21 marks | let 150, mem 4, arg 3, ret 1; inside `tpIfRecheck`, let 3 |
| `solveUnannotParams` | 5,259 / 1,968 | diags, redun/rcoal/isval, bin, arg, print, dJoin, holeFlow | holeShape 586, is 289, mem 274, holeAlt 227, holeArrayDemand 186, holeMap 167, let 124, coalHole 117, bm 30, ufcs 15, ret 11 |
| `inferReturnsPrePass` | 5,156 / 5,098 | diags, redun/rcoal/isval | print 376, bin 360, let 231, bm 196, holeAlt 72, arg 22, coalHole 22, mem 13, dJoin 9, inferLet 8, nln 4, ufcs 3, holeShape 2, inferLetNulStr 2, holeMap 1, holeArrayDemand 1, tpIf 1 |
| `globalInitPrePass` | 5,757 / 5,703 | diags, redun/rcoal/isval | bin 262, coalHole 61, let 50, bm 21, arg 1, mem 1, ret 1, dJoin 1, tpIf 1 |
| `cstrProbeBefore` | 58 / 41 | diags, redun/rcoal/isval | the `*Cstr` rows it exists to record (ret 13, let 9, print 5, bin 4, mem 4, arg 3, bm 2), plus holeAlt 7, dJoin 1, holeMap 1 |

So `monoRecheckEnd`'s omission is live for arg, let, mem and ret and never exercised for bm,
ufcs and is; `cstrTablesTruncate`'s is never exercised. Every other row is a table the site
does not roll back at all. Whether a kept row is harmless (the real pass dedups or re-records
it) or a leak is still per-row and unwitnessed; this table is the list to grade, and A2's
default rollback is what makes each one an output change to inspect.

**Proposed shape.** One `CheckMark` record with named fields, `checkMark()` and
`checkRollback(m)`. Rolling back every append-only table is the default; a site that must keep
something reads it before rolling back. Each constraint family becomes a record of columns with
one `truncate(n)`, so a new column cannot miss a site.

**First PR.** A debug assertion behind a flag: after each of the seven probes, every table length
equals its mark, with today's per-site exceptions listed explicitly. That turns the UNDECIDED
list into measured facts without changing behaviour: with the flag off, `vl check` text and
emitted modules are identical. Landed as A1; the result is the table above.

**Second PR (A2).** `checkMark()` / `checkRollback(m, set)` in `typecheck.vl`, with one `RB_*`
bit per family. The ten `*Cstr` families are records of columns (`argCstr.at`, …), each with
one `truncate`. The seven sites keep exactly today's sets, named `RB_PINNED` (`tpIfRecheck`),
`RB_MONO`, `RB_SOLVE`, `RB_PREPASS` (`inferReturnsPrePass`, `cstrProbeBefore`), and `RB_LINT`
alone (`globalInitPrePass`). `cstrTablesMark`'s array and `monoRecheckBegin`'s `sv[0..20]` are
gone. The census above is byte-identical before and after, so every leak in it still stands.

**Per-leak notes for the behaviour-changing PR.** Each is a change to one site's set, graded
on its own output diff:

- `tpIfRecheck`: add `RB_BIN | RB_PRINT`. The omission is never exercised, so expect no
  output change.
- `monoRecheck`: add `RB_ARG | RB_LET | RB_MEM | RB_RET`. These are live in 150 / 4 / 3 / 1
  programs. Grade against D592, D1520 and D2294. bm, ufcs and is are never exercised, so add
  them too.
- `solveUnannotParams`: the hole tables (holeShape, holeAlt, holeArrayDemand, holeMap) may be
  what the probe is *for*. Ask whether the real pass re-derives them before dropping any. The
  constraint rows (is, mem, let, coalHole, bm, ufcs, ret) are re-recorded by the real
  pass. The question there is whether a kept probe row duplicates or pre-empts a diagnostic
  (D3817, D3746).
- `inferReturnsPrePass`: has the widest leak set (print 376, bin 360, let 231, bm 196, …). Its
  diags rollback is skippable (`prbSkip`), which is the census's own control. Grade against
  D1400, D1566 and D2241.
- `globalInitPrePass`: rolls back only the lint notes. It drops diagnostics per initializer by
  hand (`numLitNotesDropFrom`). Its leaks are bin 262, coalHole 61, let 50 and bm 21; grade
  against D3078.
- `cstrProbeBefore`: keeps its `*Cstr` rows by design (D3062). holeAlt 7, dJoin 1 and holeMap 1
  are not part of that design, so they are the candidates to drop.
- Not in any mark: the keyed maps beside the columns (`nestCstrSeen`, `dJoinRelayed`,
  `tpIfJoinAt`, `tpIfOkAt`). Nor are `tpIfReNames`/`tpIfReTys`, which are spans that
  `tpIfReStart` indexes, not rows. A rollback that drops rows leaves the maps pointing past
  the end, so the follow-up decides what each map means after a truncate.

**Proof for the refactor.** Byte-identical emitted modules and `vl check` output identity over
`tests/cases` and the corpus; fuel A/B. Where the new default rolls back more than today, an
output change is a finding to grade against the D3062 / D1520 witnesses.

**Dependencies.** None. L5's `undo` and L9's state module both build on it. **Cost.** 2 days for
the helper and the seven sites; 3–4 more for records of columns.

<a id="L5"></a>
### L5. One pin driver for the checker's solve-and-re-check mechanisms

*Sources: front-end L1 and L4; `compiler/driver.vl` `jwSecondPass`.*

**Problem.** `checkProgram` (`typecheck.vl:58500`) runs independent "solve, write the answer
into the AST, re-check the whole program" mechanisms with no shared driver:

| mechanism | ruling / row | size (front-end census) | write-back |
| --- | --- | --- | --- |
| literal-binding inference | B′, D3246 | `lbi*` 84 fns / 1,347 lines / 46 globals | `lbiApplyPins` rebuilds the `LetDecl` with a synthesised annotation |
| record adoption | D3339 | `recAd*` 26 / 597 / 23 | `recAdApplyPins`; `recAdUndo` re-walks again to roll back |
| uncalled-export params | D3817 | `exp*` 10 / 319 / 5 | annotate, then `checkProgramAgain` |
| width-subtype rewrite | DV-400, PR #3516 (open) | `ws*` | rewrites `f(p: Pos)` to `f<__W0>(p: __W0)` and re-checks |

The loop is `while (lbiPinCand || recAdPinDecl) && passes < LBI_MAX_PASSES` with
`LBI_MAX_PASSES = 3` (`typecheck.vl:15087`), a shared budget named after one of them. The
front-end survey puts the worst case at 8 full checker walks; no gate measures it. Each
mechanism carries its own pin table, refusal queue with its own dedup, hint emitter, and AST
write-back.

The code has a fifth whole-program re-check the survey did not count: `jwSecondPass`
(`driver.vl:1023`) generates VL source for deep-`is` walkers, parses it into the arena, splices
it in, then runs `canonRestoreSpellings` + `initChecker` + `checkProgram` again. It is driven
from the driver, not from `checkProgram`, so a full `checkProgram` run inside it can repeat the
pin loop.

Un-annotated parameter inference is also done twice by different methods: `solveUnannotParams`
(`:43189`) runs the checker quietly and takes the first concrete destination;
`expInferParam` (`:58765`, D3817) is a separate syntactic walk that matches pins by NAME
(`expIsName`, `:59150`) and requires all to agree — a phase re-reading syntax for a fact the
checker already has by binding identity.

**Proposed shape.** One `pinDriver` in a new `check_pins.vl`, with a per-solver interface
`solve(): i32`, `apply()`, `undo(mark)` (an L4 rollback), `report()`; one refusal queue and one
hint queue; a literal-union `PinKind = "lbi" | "recAd" | "expParam" | "width"`; one iteration
budget the driver owns and one `checkProgramAgain`. D3817 becomes a policy over
`solveUnannotParams`'s observations, which deletes the 319-line syntactic walker. Invariant
for every `apply()`: rebuild the node IN PLACE (`P.nodes[d] = {…}`, as `lbiApplyPins` does
today), because SC's binding-identity key is a node index.

**First PR.** Fold #3516's width-subtype rewrite in as the fourth solver rather than a fourth
loop disjunct — the cheapest moment. Proof: emitted-module byte identity over `tests/cases`;
`vl check` text identity (including hint order: keep lbi → recAd forced → recAd → ovUnpinned →
expInf by kind-sorting the shared queue) over `tests/cases` and the corpus;
`--prove-fixpoint`; L2 self-compile fuel A/B. The seed itself is not byte-identical (code
moves).

**Dependencies.** Time-sensitive against PR #3516. L4 makes `undo` a rollback. Whether
`jwSecondPass` joins the driver is a separate decision: it re-checks for generated code, not for
an inferred annotation. **Cost.** 3–4 days (one more if #3516 has landed); 2 days for the D3817
fold.

<a id="L6"></a>
### L6. Key registries by structural id; collapse the eight type-equality notions

*Source: types-and-reps L3.*

**Problem.** The emitter's registries are keyed by strings: 49 `{[string]: i32}` maps against 20
`{[i32]: i32}`; `sNames`, `rlElemName`, `unNames`, `uVariants` are `string[]`. Type equality
has eight public notions — `tyEq` (73 `tyEq(` calls, whole compiler, comment-stripped; 91
counting every mention), `tyEqSameHoles` (17 calls), `tyEqNoneIsMap`, `tySame` /
`tySameAt` ("index equality is construction identity, not type identity"), `tySameSet`,
`tySameSpelled`, `tySameAnonRow` (field names only), and emit_rep's `repCanonId`. The arena is
not hash-consed (one push site), so `emit_rep` runs its own interners: the `hc*` identity
table (`hcIntern`, behind `repCanonId`) and the rep-tree map `rtIntern`, keyed by
`rtInternKeyOf` (`emit_rep.vl:3141`).

**Measured cost.** Class N, ≈66 of 827 [25–107] (D3024, D3110, D3129, D3653). All 8 sampled N
rows are closed: the family is being paid row by row, not by mechanism.

**Proposed shape.** Key the registries by `repCanonId` and keep names only for nominal output
and the host boundary. That is what the structural-records ruling (D3870: same-shape records
are one type) already says, so the ruling and the registry key would finally agree. Collapse
equality to three notions with stated domains — structural (`repCanonId`), render identity
(`tyEq`, for diagnostics), hole-aware (`tyEqSameHoles`) — and make each other one a named
projection.

**First PR.** Registry-by-key steps 1–4b already landed this way (#2426, #2438, #2473); the next
registry follows the same recipe. Proof: byte-identical seed per step; `rep-fuzz-check.sh`;
corpus. **Dependencies.** None; it removes the spelling hop in L1. **Cost.** 2–4 weeks.

<a id="L7"></a>
### L7. Retire ambient `pending*` delivery state into `ExpCtx`; one memo module

*Sources: emitter L2; September row 14.*

**Problem.** Expected type and rep reach `emitExpr` through module-scope `pending*` variables
that the caller sets and the callee consumes or clears. September's `ExpCtx` (#2589, #2596)
unified the four cell-seed ladders, but the delivery functions kept writing the globals.
Separately, `emit_classify.vl` grew hand-written memos, each with its own generation key.

**Measured cost** (emitter survey, September → 5d4cd14dc). `pending\w+ =` writes 417 → 499
(`wasmEmit.vl` 339 → 435); `emitExprExpect(` 47 → 59; `expCtxApply(` 3 → 8. Per delivery
function, writes / `ExpCtx` uses: `emitDirectCall` 38 / 2, `emitAssign` 35 / 10,
`emitLetDeclStmt` 34 / 2, `emitReturnValue` 25 / 1, `emitCallCore` 5 / 0. Module-scope `let`s
across the emitter and mono 530 → 1,152; `emitter-state-audit.py` mutables 563 → 1,139, never
cleared 96 → 209. `emit_classify.vl` module lets 34 → 198, 82 memo-shaped by name. 16 compiler
commits since 2026-09-06 name memo, stale or generation fixes. Rows: the D1105 family; not
counted per row.

**Proposed shape.** Every value delivered to a typed destination goes through
`emitExprExpect(ix, ExpCtx)`; the `pending*` fields become `ExpCtx` fields and the save/clear
blocks become a value. One `memo` module owns the generation counters (arena length, registry
generation, pass epoch); each cache declares which one keys it.

**First PR.** `emitReturnValue` (25 writes, 1 `ExpCtx` use), byte-identical seed. Measure the
remaining genuine "hint to the next node" writes before calling them few.
**Proof.** Byte-identical seed per step; `vl_instance_state_leak_test.ts`; the audit's
never-cleared count as a ratchet. **Cost.** 1–2 weeks (one delivery function per PR) + 1 week
for the memo module. **Unblocks.** Per-instance compilation, which the `vl test` isolation
ruling needs.

<a id="L8"></a>
### L8. `tyquery.vl` shared by checker and emitter; split `emit_classify.vl`

*Source: emitter L3.*

**Problem.** `emit_classify.vl` is 49,071 lines, 2,108 functions, with no seams. The same
structural type step is written under several prefixes (exact-body duplicates):
`tyStepElem`/`tyShapeArrElem`, `tyStepMapVal`/`tyMapValOf` (`emit_rep.vl`),
`tyShapeNulPeel`/`tyPeelNul`, `tyIsNullTy`/`tyIsNullPrim` (both also equal the checker's
`isNullTy`). Four cross-phase twins: `narrowKeyRoot`/`esKeyRoot`,
`fieldNameOrder`/`objFieldNameOrder`, `tyIsNullTy`/`isNullTy`, `nssIsName`/`crIsIdentNamed`.
Sixteen emitter functions exceed 400 lines (`emit_*.vl` and `wasmEmit.vl`, `emit_mono`
included; declaration line to the first column-0 `}`), led by `monoMakeInstanceGo` 1,128
(`emit_mono`), `emitCoalesceGo` 1,009, `emitAssign` 797, `collectA` 689, `emitArr` 663,
`emitCallCore` 629, `emitTypeSection` 619. Outside `emit_mono` it is fourteen (September: 10,
by the emitter survey's count); `monoMakeInstanceGo` and `monoArgTyName` (525) are SC's.

**Proposed shape.** A `tyquery.vl` imported by both phases, holding each structural step once
(the home for L2's type-taking twins); split classify by its banner regions into modules of at
most ~10k lines; split the 400-line functions at seams with few live locals, as #2591 did.

**First PR.** `tyquery.vl` with the four exact type-step twins retired. Proof: byte-identical
seed. **Dependencies.** Whether more modules slow the self-compile is UNDECIDED; price it with
`scripts/self-compile-time.sh` before the first classify split. **Cost.** 2 days + 1–2 weeks.

<a id="L9"></a>
### L9. Split `typecheck.vl` along its call graph

*Source: front-end L2.*

**Problem.** `typecheck.vl` is 74,855 lines, 3,036 functions and 1,288 module-scope bindings (1,000
`let`, 288 `const`): 2.2× in five
weeks (33,705 on 2026-09-05) and 30% of the compiler. The front-end call-graph census: the
largest strongly connected component is 508 functions / 22,803 lines including `checkNode`;
640 functions / 27,617 lines reach `checkNode`; 2,396 functions / 33,763 lines do not. Import
cycles are hard errors (`driver.vl:4337`), so a carve must take a callee-closed set.

**Proposed shape.** Carve callee-closed leaves first, on the model of `const_exact`, `tyname`,
`missing_import`, `extents` (small, prefixed, no function over 120 lines). About eight carves.

**First PR.** One leaf carve. Proof: `vl check` output identity, fixpoint, and a self-compile
fuel A/B, because the cost of cross-module calls in the self-compile is UNDECIDED.
**Dependencies.** L4 first, so the rollback state moves as one unit. Thirteen modules import
`typecheck.vl`. **Cost.** First carve 2–3 days; full 2–3 weeks.

<a id="L10"></a>
### L10. The host `-O` optimizer as one decoded IR

*Source: tooling LARGE-1.*

**Problem.** `scripts/vl-host/src` now holds a wasm optimizer — `inline.rs` 2,863 lines,
`multivalue.rs` 2,390, `flat.rs` 621, plus `-O` code in `main.rs` (10,259 lines, 5,362 in
September), about 6.5k lines in all — while `Cargo.toml`'s header still says the crate "never
parses or types VL itself" and is "only the OS shim". There are 12 `Parser::new(0).parse_all`
sites and duplicated LEB/section helpers. Nine commits on the optimizer files since 2026-10-04
cite 20 D-ids. The Deno and playground hosts cannot run `-O`, so an `-O` build is host-specific.

**Proposed shape.** `vl-host/src/opt/` with one decoded IR that every rung reads, and one
`wasm_bytes` module (which can land alone). Whether the optimizer belongs in the host at all,
or in the VL emitter, is an owner question.

**First PR.** The shared `wasm_bytes` module. Proof: byte-identical `-O` fixtures.
**Dependencies.** The owner question for the full move. **Cost.** 4–6 days.

<a id="L11"></a>
### L11. Repo lint rules written once

*Source: tooling LARGE-2.*

**Problem.** Repo-policy lint rules live in `compiler/lint.vl` (about 2,900 of its 6,662 lines)
and again in the Python census and budget scripts (`comment-budget.py` 483 lines,
`scan-budget.py` 249, `sentinel-census.py` 453, `ladder-census.py` 884). 19 of the 22 commits
touching both were twin edits.

**Proposed shape.** The ratchets read `vl lint --json`; repo rules move into a repo-scoped
`lint_repo.vl` layer, which is the direction of the syntax-tree-API ruling.

**First PR.** One ratchet reading `vl lint --json`, with identical `--check` output.
**Cost.** About 3 days, plus 1 for the move.

<a id="L12"></a>
### L12. One LSP feature layer for the server and the playground

*Source: tooling LARGE-4.*

**Problem.** `lsp/src/server.ts` and the playground each implement the feature ladder; nine
comments say "mirrors server.ts", and they have drifted (for example `effectsAt` is used by
`server.ts:1052` and by the playground nowhere).

**Proposed shape.** One `lsp/src/features.ts` over the shared `WasmChecker`; both hosts become
transport. **First PR.** Move one feature with its tests. **Cost.** About 3 days.

<a id="L13"></a>
### L13. The host import surface as a table; errno stated once

*Source: tooling LARGE-3.*

**Problem.** `register_fs_imports` (`main.rs:4316`) is a ~648-line hand ladder; its `has()`
blocks went 9 → 17. Errno numbers are stated in three places with no check between them
(`wasi_errno`, `main.rs:4023–4053`; inline literals; `std/fs.vl:35`).

**Proposed shape.** A table of imports; one errno source and a test that reads both sides;
retire the dead `wasmtime-host.rs` (done in S-l). **First PR.** The errno test. **Cost.** 2–3 days.

<a id="L14"></a>
### L14. Type section emitted from the recorded allocation order

*Source: emitter L5 and §6.*

**Problem.** `mAssignTypeIndices` (`emit_collect.vl:5344`, 406 lines) allocates type indices;
`emitTypeSection` (`emit_sections.vl:7248`, 619 lines) re-walks the type families in the same
order by construction, and the oracle that checked them (`mAssertIdx`) was deleted in #766.
Every new WasmGC family pays the lock-step tax.

**Proposed shape.** `emitTypeSection` iterates the order `mAllocType` recorded; or, as a first
step, a per-entry index assertion in the style of `fbFrameAt`.
**Proof.** Byte-identical seed, fixpoint, rep-fuzz. **Cost.** M–L.

## SMALL items

Each group is one PR. Proof is a byte-identical seed (`cmp` after `refresh-compiler.sh`) unless
the row says otherwise. Line numbers are at 5d4cd14dc.

| group | finding | where | fix | proof | status |
| --- | --- | --- | --- | --- | --- |
| **S-a: checker duplicates** | `canonTyIxOf` and `canonRewroteNode` are one binary search differing only in the return | `typecheck.vl` `canonTyIxOf`, `canonRewroteNode` at 5d4cd14dc | one `canonClearedSlot(n)` and two projections | seed | done (#3662, `canonClearedSlot`) |
| | 9 identical bounded-column accessors (`nodeTyIxOf`, `isVarTyIxOf`, `asgNarTyIxOf`, `joinHeadOf`, `joinRowTy`, `joinRowNext`, `isParentTyIxOf`, `isParentElseTyIxOf`, `mapUnboxTyOf`) | `typecheck.vl:60214–60380` | one `colAt(col, i)` | seed | done (#3662, `colAt`) |
| | `symDecl` / `symDeclInOuter` share an occurrence tail and diverge: only `symDecl` skips minted `$` names | `typecheck.vl:14507`, `:14569` | `symOccPushDecl`; decide the divergence (UNDECIDED whether a minted name reaches the outer form) | LSP symbol tests + emitted-module identity | done (#3662, `symOccPushDecl`) |
| | `blockHasBareReturn`: 9 call sites, no memo | `typecheck.vl:52718` | memo stamped by generation, not by length (D1655) | fuel A/B | not hot: measured, declined |
| **S-b: named constants** | hole-conflict sentinel `0 - 2` is in-band with arena ids | `typecheck.vl:44929` | `HOLE_PIN_CONFLICT` or a result union | seed | done (#3669, `HOLE_PIN_CONFLICT`) |
| | `LBI_MAX_PASSES` also bounds recAd | `typecheck.vl:15087` | rename (or fold into L5) | seed | stale: no longer reads as filed |
| | positional save vectors: `sv[0]..sv[20]`; `cstrTablesMark`'s 13 indices read out of order | `typecheck.vl:63700–63815`, `:22017–22125` | named-field records (or L4's `CheckMark`) | emitted-module identity | belongs to L4 (`CheckMark`, #3605) |
| | unnamed kind codes: `listOpKindOf` 0/3/4, `eqgElemClass` 1/2/3, `mapValuesResultKind` 2/7, `arrNewIntrKind`, `eqListKindByList` | `emit_classify.vl:10003`, `:10067`, `:21657`, `:10886`, ~`:44530` | literal unions, as `LBK_*` | seed | done (#3678, #3682: `EqCore`, `ArrNewKind`, `MapValuesList`) |
| | four phase booleans (`capCacheOn`, `postMonoShapes`, `anonLeafEmitPhase`, `emitArenaFinal`) on one timeline | `emit_state.vl:363`, `:797`, `:855`, `:861` | one `EmitPhase` literal union advanced by the pass loop | seed | done (#3678, `EmitPhase`) |
| **S-c: front-end tidy** | `./ast` imported in 11 separate blocks | `typecheck.vl` | one sorted block (a precondition for L9) | seed | done (`typecheck.vl` imports `./ast` once) |
| | two `Tok` records (5 fields vs 6) | `lexer.vl:118`, `ast.vl:21` | lexer imports ast's | seed | not done: the lexer `Tok` has no `pos` |
| | operator-function name set spelled 3 times | `ast.vl:2362`, `parser.vl:3395`, `:3413` | one table in `ast.vl` | parser tests + seed | not done: a shared table shrinks the seed, so it is not byte-identical |
| | `await` lexed, no production consumes it | `lexer.vl:347` | remove, or reserve with a diagnostic | parser tests | skipped: a surface decision |
| | `kindTag(k)` is the identity (5 callers); `ErrExpr.errWhat`/`errAt` write-only | `parser.vl:260`; `ast.vl:77`, `:2660` | inline; drop or read | seed | not done: inlining `kindTag` grows the seed; a pos-only `ErrExpr` fails to check |
| **S-d: emitter duplicates** | 11 exact-body duplicate groups (22 functions), e.g. `unRowOfCanon`/`unRowOfCanonId`, `bytesEq`/`monoStrListsSame`, `sScanLim`/`repScanLim` | emitter survey S3 | keep one | seed, or output identity where function order moves | done (#3687) |
| | private membership and index-of scans after `listutil.vl` landed (a 9-member and a 6-member group) | emitter survey S7 | `strListHas` / `i32ListHas` / `strListIndexOf` | seed | done (#3687) |
| | normalised twin pairs, e.g. `spreadWrapIdx`/`spreadBackIdx`, `intIntrOpI32`/`I64`, `letIsNulRef`/`letIsNulVariant` (89 groups / 225 functions in all) | emitter survey S6 | parameterise on the differing operand, a few pairs per PR | seed | partly done (#3697): 115 groups / 321 functions before, 109 / 303 after; the remainder is declined shapes |
| **S-e: builder residue** | ~96 of `wasmEmit.vl`'s 137 literal `wU8(<int>)` have an `fb*` method; 28 more need `fbRefIsNull` / `fbBrOnNull` | `wasmEmit.vl` | convert | seed | done (#3688) |
| | no gate on literal `wU8(<int>)` outside `emit_bytes.vl` (500: sections 363, wasmEmit 137) | — | a `ratchet.py` entry | the ratchet | open: the gate idea is recorded below the table |
| | the builder docs say "not landed"; every phase landed 2026-06-08 (#225–#234) | `codegen-architecture.md:3`, `codegen-builder-migration-plan.md:6` | flip the status lines | docs only | done (#3688) |
| **S-f: emitter frame flags** | `fnUsesMapVals`, `fnUsesU8Push` set in `emitFuncCode` but not `emitStartFnCode` | `emit_sections.vl` | a top-level probe using `.values()` and a `u8` push; a crash proves the bug, otherwise mark the asymmetry deliberate | the probe | done (#3689): deliberate asymmetry, probes ran, no defect |
| **S-g: mono (after SC)** | `recordClonedNodeTyFb` / `recordClonedNodeTyKnown`: identical signatures, opposite precedence | `emit_mono.vl` | one function with a `prefer` literal union | seed | open: waits on lane SC |
| | `monoAnnPinName(tyToEmitName(nodeTyIxOf(…)))` at 8 sites; the `anonLeaf*` triple | `emit_mono.vl`; `emit_collect.vl:9228`, `:9286`, `:9763` | one `monoPinNameOfNode`; the triple goes into SC's flow table | seed | open: the triple goes into SC's flow table |
| **S-h: driver** | `compileSrc` and `checkSrc` duplicate a ~25-line reset prelude and have drifted (`checkSrc` calls `vcEpBank`, `compileSrc` does not) | `driver.vl:1067`, `:1184` | one `pipelineReset()`; state the `vcEpBank` difference | `vl check` / `vl build` output identity | done (#3665, `pipelineReset`) |
| **S-i: CLI** | exit codes as bare literals (25 assignments of 0/1/2/3/70); the exit ladder written twice; flag-parser idioms (5 copies of the value guard, 6 hand-counted prefix slices) | `cli.vl` | a named exit-code union shared with the host; `cliExitCode()`; `cliTakeValue()`, `cliPrefixValue()` | `vl_*` exit and CLI tests | done: `CliExit` and `EXIT_*`, `cliCheckExit` (the ladder once), `cliUsageStop` (11 stop sites), `cliTakeValue` / `cliHasPrefixValue` / `cliPrefixValue`; `tests/cli_host_tables_test.ts` holds the union to the host and `cli-design.md` |
| | `value_flags` duplicates `cliParseArgs`'s value flags; `engineFailOffset` has a Rust twin and no test | `main.rs:233–245`; `driver.vl:3069` / `main.rs:1532` | one table test each | new tests | `value_flags` done (`tests/cli_host_tables_test.ts`): `--budget`, `--budget-why` and `--findings` are missing from it, pinned as a surface question; `engineFailOffset` not started, since the seed does not export it |
| **S-j: LSP twins** | resolver mirror with no agreement test; lexer twin `vlLex.ts` (442 lines); `LEX_CLASS_TOKEN_TYPE` cites a missing path; `moduleGraph.ts` header describes a deleted pipeline | `typeFeatures.ts:1555` vs `driver.vl:3659`; `lsp/src/vlLex.ts`; `typeFeatures.ts:195–200`; `moduleGraph.ts:1–31` | export the resolver from the seed or add a table test; agreement test for the lexer (or replace it, UNDECIDED); fix the citation and header | lsp tests | done (#3696, items 1-4) |
| **S-k: Python instruments** | `read_source` byte-identical in 4 scripts, `sources()` in 5; 6 ratchet `main()` ladders | `ratchet.py` and the census/budget scripts | import from `ratchet`; `ratchet.Ratchet.main` | identical `--check` output | superseded: the owner's no-Python direction removes the scripts instead of refactoring them |
| **S-l: dead scripts and paths** | `scripts/p7-*`, `p7-patch.py`, `wasmtime-host.rs` and other unreferenced scripts; 14 of 734 doc mentions of scripts dangle | `scripts/`, `docs/` | delete or archive; fix the paths | `tests/vl_doc_script_paths_test.ts` | done: `p7-build`/`-eq`/`-gen`/`-probe.sh`, `p7-patch.py` and `wasmtime-host.rs` deleted (`p7-time.sh` kept, cited by five docs); 109 dangling doc mentions repointed or marked historical, and the new test holds the rest at zero |
| **S-m: std (via std-api-reviewer)** | `std:seed` is a test fixture shipped as a module; std has no hex parse/format (glean defines `parseHex` 50×); one test bypasses `isStdKey` | `std/seed.vl`; `std/fmt.vl`; `tests/support/casesWasmOracle.ts:284` | repoint the tests and drop `std:seed`; propose `parseHex`/`toHex`; use `isStdKey` | std tests; std-api review | not started |
| **S-n: tests index** | 194 `tests/*.ts` files named by runner prefix (load-bearing), with no index | `tests/` | a short `tests/README.md` mapping prefix → runner, topic → files | none | done: `tests/README.md`, held to the tree by `tests/tests_readme_test.ts` |

**Gate idea (S-e, row 2).** A `literal-opcode-write` rule under `vl check --budget`: a ratchet on raw opcode bytes written as integer literals (`wU8(<int>)`) in the emitter outside `emit_bytes.vl`, with a baseline that may only fall and `--budget-why` naming what left. It replaces the retired `ratchet.py` entry the row first proposed, and lands after the conversions of row 1 so the baseline starts at the residue.

## September status

The September ranking had 20 rows (`code-quality-survey-2026-09/README.md`).

- **Landed (16):** rows 1–6, 8–11, 13–18.
- **Partly landed (2):** row 7 (`letListBuild` merged; the epoch memo remains, re-priced at
  1.58%) and row 12 (the seven-classifier ladder; 14 sites were refuted, not merged).
- **Ruling pending (2):** row 19 (the seed resolves from the CWD on a development build while std
  resolves from the EXE's tree; `SeedOrigin::Cwd` is still in `main.rs`) and row 20 (100
  delegation wrappers that exist because VL has no default parameter values).

Two landed rows have regrown under new names, which is why they reappear above:

- Row 14's `ExpCtx` landed, and the ambient state it was meant to drain grew past it ([L7](#L7)).
- Row 15's split of `checkFuncDeclNode` landed; `checkFuncDeclNodeReal` is 679 lines again, and
  `initChecker` (row 10 of the front-end first pass) is 665.

From the area passes beyond the 20 rows, still open: the env-param ABI (owner ruling), the table
section sized to the function count, the four phase flags (S-b), the type-string re-parse
([L2](#L2), regressed), `nodeTyIs*` predicates (37 → 42 by the types survey's count), and the
two RepDesc rulings (open since 2026-09-06).

<a id="disagree"></a>
## Where the surveys disagree, and where the code disagreed with them

| topic | figures | why they differ |
| --- | --- | --- |
| `tyToEmitName` call growth | emitter survey 24 → 81; types-and-reps 69 → 128; render-then-parse 29 / 9 by the survey's unrecorded rule vs 21 / 19 by direct nesting ([L2](#L2)) | different baselines (facb9f610 vs 5eee42758) and scopes (emitter files excluding `emit_mono`, comment-stripped tokens, vs a wider set including mono). Both say it roughly tripled or doubled; neither is wrong. |
| type-string parser calls | emitter 303 → 343 (338 call sites once the five declarations are excluded, [L2](#L2)); types-and-reps 329 → 364 | the same baseline and scope difference; types-and-reps counts `typecheck.vl` (43) and `emit_mono.vl` (51) too |
| `nodeTyIs*` predicates | front end: 44, all in the emitter; types-and-reps: 37 → 42 | different name patterns (`nodeTyIs*` alone vs with `nodeArrayElemIs*`); not reconciled |
| re-check mechanisms | front end counts four solve-and-re-check loops | the code has a fifth, `jwSecondPass` (`driver.vl:1023`), which re-runs `initChecker` + `checkProgram` after splicing generated walkers ([L5](#L5)) |
| where `emitProgram` lives | the brief and some survey prose place it in `wasmEmit.vl` | it is `emit_sections.vl:6588`; it runs a declared pass table of 46 rows with dependencies checked by `passNeedsMet`, then `emitModule` |
| builder refactor status | `codegen-architecture.md` and the migration plan say "not landed" | every phase landed 2026-06-08 (#225–#234), per the emitter survey's commit trace (S-e) |
| line totals | emitter survey §1 vs its fork: `wasmEmit.vl` 33,665 vs 33,563; emitter 139,985 vs 137,540 | §1 used `wc -l` on the export; the fork's literal counts stand |
