# How many emit-side refusal sites are LIVE? — a measurement, 2026-09-02

`CLAUDE.md` states the open question and says only a witness settles it:

> Measured: **405** distinct `emitFail` literals in `compiler/*.vl`, of which **13** match the
> filter — the rest are mostly unreachable defensive floors, and a floor no check-clean program
> can reach is NOT a violation. So the true site count sits in `[23, 405]` and **only a WITNESS
> settles which**.

This file narrows that interval with a measurement rather than a guess: a re-derived population,
a reproducible random sample of it, and a hand-built witness attempt per sampled site.

**Headline.** The compiler has **504** emit-side refusal sites. Extrapolating the sample, the
number a `vl check`-clean program can reach is **≈ 187 – 328** (95% envelope 129 – 390), i.e.
roughly **a third to two thirds** of them — not 23, and not 405. The rest are defensive floors, and a large share of those
are floors of a specific, recognisable kind: the guard is arithmetically impossible, or it is
shadowed by an identical guard that fires first.

Everything below is a measurement with a date on it. Re-derive before quoting.

---

## 1. The population, re-derived

### 1.1 The unit is a CALL SITE, and the message a user receives is a TEMPLATE

`emitFail` / `emitFailAt` (`compiler/emit_bytes.vl:979` and `:994`) are the **only** emit-side
failure channel: `emitErr` is assigned in exactly one place, inside `emitFailAt`. Three helpers
wrap them (`emitFailNoMembershipRecv`, `ifArmNoValueFail`, `failMapValueType`) but their bodies
are ordinary `emitFail` calls and are counted once each.

Extracting every call by **balancing parentheses across lines** (not by grepping lines) and
reducing each call's first argument to a template — literal chunks kept, every non-literal
chunk replaced by `{}` — gives:

| population | count |
| --- | ---: |
| `emitFail` / `emitFailAt` CALL SITES (the 4 matches inside the two definitions excluded) | **504** |
| distinct MESSAGE TEMPLATES over those sites | **434** |
| templates with no interpolation (a whole message, verbatim) | 383 |
| templates with at least one `{}` hole | 51 |
| templates whose whole message comes from a helper (`fieldTypeRefusalMsg`, `genericFnValueRejectMsg`, `memFloorMsg`) | 1 template / 7 sites, expanded by hand into 5 messages |

Per file: `wasmEmit.vl` 425, `emit_collect.vl` 25, `emit_sections.vl` 19, `emit_bytes.vl` 13,
`emit_mono.vl` 13, `emit_classify.vl` 9.

### 1.2 The 511 / 88 / 423 split is wrong, and wrong in the way CLAUDE.md predicts

The brief's starting point was *"511 distinct `emitFail` string literals of ≥12 chars; 88 appear
verbatim somewhere on record; 423 appear nowhere."* Re-derived:

| derivation | count |
| --- | ---: |
| ≥12-char literals on a **line** mentioning `emitFail` (the naive grep) | 200 |
| ≥12-char literals within **8 lines after** an `emitFail` mention (a window grep) | 493 |
| ≥12-char literals inside an `emitFail` **argument**, multi-line aware — **the honest literal count** | **472** |
| of those, verbatim on record | **105** |
| of those, on record nowhere | **367** |
| of those 472, literals that are a **FRAGMENT** of an interpolated message and can never be a whole message | **91** |

So the corrected split is **472 / 105 / 367**, not 511 / 88 / 423. 511 is not reproducible from
any argument-scoped derivation; the closest reproduction is the 8-line **window** grep (493),
which sweeps in literals from neighbouring code. That is `COUNT MESSAGE LITERALS, NEVER
GREP-MATCHING LINES` one level out: **a window is not an argument.**

And the deeper correction is the unit itself. **91 of the 472 literals are fragments** —
`` "` cannot be discriminated — variants `" ``, `` "' has no f64 form" ``, `"(a wasm export names
one functype and `"` — none of which is a message, and 52 of which are "unwitnessed" purely
because no program's output ever contains that substring alone. Counting literals overstates the
message population by about 20%. **The unit that reaches a user is the template; the unit the
question asks about is the site.**

### 1.3 Structural classes

Each site was given a class from the guard that governs it:

| class | what it is | sites | share |
| --- | --- | ---: | ---: |
| `OTHER` | a condition that is neither a table bound nor a collection flag | 231 | 45.8% |
| `GUARD-FLAG` | `!aUsed` / `!uDeclared` / … — a collection flag | 107 | 21.2% |
| `GUARD-TABLE` | `idx < 0 \|\| idx >= tbl.length` — the `fbValtype` parallel-table discipline | 99 | 19.6% |
| `FLOOR-NARROW` | a function's trailing fallthrough after an `x is Y` narrowing block | 67 | 13.3% |
| (cross-cutting) | message text matches `goal-scoreboard.py`'s CONCEDE predicate | 16 | 3.2% |

Only **16 of 504** sites concede in their wording that the refused program was legal — and those
16 are exactly the emit-side rows `goal-scoreboard.py --sites` prints (its other 6 are in
`typecheck.vl` and `driver.vl`). That is the D964 point restated as a ratio: **97% of the
emitter's refusal sites say nothing about whether the program was legal**, so a count keyed on
wording cannot be the measurement.

**These classes are DESCRIPTIVE STRATA, not verdicts, and the heuristic is measurably noisy.**
`FLOOR-NARROW` is detected by walking back for an `x is Y {` in the enclosing function, and it
mislabels: `wasmEmit.vl:22237` (`bare null needs a struct-typed context`) is classified
`FLOOR-NARROW` and is **proven live by two fixtures** — its actual guard is
`if pendingStructIdx >= 0 { … }`, an unrelated `is` earlier in the function is what the walk
found. Two of the 67 `FLOOR-NARROW` sites are already known live. Do not read the class as a
reachability claim.

What the classes *are* good for is a prior. The 35 fixture-proven-live sites are **30 `OTHER`,
2 `GUARD-FLAG`, 2 `FLOOR-NARROW`, 1 `GUARD-TABLE`** — 86% `OTHER` against 46% in the population.
Live-ness concentrates hard in sites whose guard is neither a parallel-table bound nor a
collection flag, which is what the "defensive floor" intuition predicts, now with a number on it.

### 1.4 Sites already PROVEN live, before any sampling

A `tests/cases/**` fixture carrying an `@emit-error` directive is a check-clean program whose
emit refuses — a witness by construction. 60 such fixtures carry 42 distinct texts; matching
them back to templates (longest-common-substring, because a directive is a prefix/substring of
the real message) pins **31 templates covering 35 sites**.

The distilled corpus contributes **nothing** here: `baseline.jsonl` today is 7,564 cells,
**4,620 `runs` and 2,944 `loud check reject`, with ZERO `loud emit reject` and zero silent
cells**. The corpus cannot see any emit-side site at all. That is the `--sites` ZERO-row warning
in its strongest form: `goal-scoreboard.py` prints `total against the goal 0` while 504 emit
refusal sites stand.

---

## 2. The sample

**Frame**: all 504 sites, minus the 35 whose template is already proven live by an `@emit-error`
fixture ⇒ **N = 469** sites (407 distinct templates).

**Draw**: `random.Random(20260902).sample(frame, 40)` over the frame sorted by
`(file, line)`. Generator: `_scratch/frame.py` (kept in the branch's scratch, not committed);
the drawn sample is listed in full in §3.

**Representativeness check** — the draw's structural mix against the population's:

| class | sample | population |
| --- | ---: | ---: |
| `FLOOR-NARROW` | 5 / 40 = 12.5% | 13.3% |
| `GUARD-TABLE` | 9 / 40 = 22.5% | 19.6% |
| `GUARD-FLAG` | 8 / 40 = 20.0% | 21.2% |
| `OTHER` | 18 / 40 = 45.0% | 45.8% |

No stratum is over- or under-drawn by more than 3 points.

**Grading protocol per site.** Write the plainest program the site's guard admits; run
`vl check` and `vl build`; the site is **LIVE** only when `check` returns 0 **and the reported
emit message is that site's own message**. `emitFail` records the FIRST failure only, so a
program that fires the target while reporting a different message is not a witness — several
candidates in §3 failed exactly that way and are recorded as rejected, not as witnesses.
`UNREACHABLE` requires an argument read off the source naming the guard that cannot hold.
`UNDECIDED` is the honest answer where 10 minutes ran out.

---

## 3. The per-site table

`LIVE` = a program with `vl check` rc 0 whose build reports **that site's own message**.
`UNREACHABLE` = an argument read off the source naming a guard no check-clean program satisfies.
`UNDECIDED` = the 10-minute box ran out; the blocker is named.

Every LIVE verdict below was re-run independently after the agent that found it reported it; the
witness files live in the branch's `_scratch/` and the durable copies are the probes named in §5.

| # | site | shape | verdict | witness / argument |
| ---: | --- | --- | --- | --- |
| 1 | `emit_bytes.vl:1089` | GUARD-TABLE | UNREACHABLE | `mvValKind` is pushed in exactly one place (`emit_classify.vl:6494`) from `mvValKindOfName`, whose complete return set is `{1,2,3,6,10,11,13,14}`; `mvValElemHeapOf` has an arm for every one of those before this line. The guard is over a kind no slot can carry. |
| 2 | `emit_bytes.vl:2011` | GUARD-TABLE | UNREACHABLE (shadowed) | `fbRefNullForKind`'s sole caller (`emit_sections.vl:5912`) is preceded one line earlier by `fbValtypeNullable(ck, cs)` on the same pair, whose variant guard is character-for-character this one. `emitFailAt` keeps only the FIRST message, so `:2072` always wins. The site executes; its sentence can never reach a user. |
| 3 | `emit_classify.vl:24617` | OTHER | UNREACHABLE (dead) | Needs `nameFieldCode(tn) < 0` **and** `fieldTypeIsDeferred(tn)`. But `fieldTypeIsDeferred(t)` *is* `nameIsU8Array(t)` (`:19855`), which forces `fieldCodeOfSpelling`'s array block and its first arm `return 35` (`:19951`). The conjunction is unsatisfiable — D1008 gave `u8[]` a container code and left the branch behind. |
| 4 | `emit_collect.vl:10808` | OTHER | **LIVE** | `type U = {} \| { x: i32 }` — D1081 |
| 5 | `emit_mono.vl:4813` | OTHER | **LIVE** | generic `T[]` at a union-element list — D1082 |
| 6 | `emit_sections.vl:3881` | OTHER | **LIVE** | `export type Point = { x: i32, y: i32 }` alone — D1080 |
| 7 | `wasmEmit.vl:4162` | GUARD-TABLE | **LIVE** | `A \| B \| null` narrowed by `!= null`, then `u.k` — D1083 |
| 8 | `wasmEmit.vl:4320` | GUARD-TABLE | UNDECIDED | needs `oCode != 16 && ovb < 0`; every spelling that boxes the `?.` result also declares the union that collects the box |
| 9 | `wasmEmit.vl:4352` | GUARD-FLAG | UNDECIDED | needs `!aUsed`, and `aUsed` is the `(array i32)` heap type that *is* the string rep |
| 10 | `wasmEmit.vl:7180` | GUARD-FLAG | UNDECIDED | two independent collectors set `fa64Used` (the literal scan and the type-name scan); every reachable position is covered by one |
| 11 | `wasmEmit.vl:8038` | OTHER | UNDECIDED | needs the receiver's map slot to resolve to the wrong key parity; three receiver-resolution paths aimed at it, none mis-resolved |
| 12 | `wasmEmit.vl:10635` | OTHER | UNDECIDED | all six receiver kinds `checkIndexNode` admits are handled downstream |
| 13 | `wasmEmit.vl:10806` | FLOOR-NARROW | UNREACHABLE | `emitStrConcat` has one caller (`:22598`) gated on `exprIsStrConcat`, whose first act is `is BinExpr` on the same arena index |
| 14 | `wasmEmit.vl:10908` | FLOOR-NARROW | UNREACHABLE | identical shape via `:22600` / `exprIsStrOrder` |
| 15 | `wasmEmit.vl:11636` | GUARD-TABLE | UNDECIDED | collect and emit call the same `eqCoreKindOfBin` and the same slot pair; no drift found. **The literal is shared with `wasmEmit.vl:11205`**, so the text alone cannot attribute a witness |
| 16 | `wasmEmit.vl:11809` | GUARD-FLAG | **LIVE** | `o?.f == q` over `T\|null` / `S\|null` — D1084 |
| 17 | `wasmEmit.vl:12799` | OTHER | UNREACHABLE | `emitStrBytes` has one caller (`:22070`) gated on `exprIsStrBytes`, which requires `P.nodes[c.callFn] is Member` |
| 18 | `wasmEmit.vl:12891` | OTHER | **LIVE** | a lambda under an `as` cast — D1085 |
| 19 | `wasmEmit.vl:12942` | GUARD-TABLE | **LIVE** | `const x = if true { "hi" }` — D1086. Attribution settled with an instrumented build |
| 20 | `wasmEmit.vl:13116` | GUARD-TABLE | **LIVE** | `const x = if true { true }` — D1086. Attribution settled with an instrumented build |
| 21 | `wasmEmit.vl:13161` | FLOOR-NARROW | UNREACHABLE | `emitBlockValueAs`'s two callers pass `s.ifThen` / `s.ifElse`, and every `parseIf` branch (`parser.vl:2556-2626`) yields a Block or pushes a diag |
| 22 | `wasmEmit.vl:15119` | OTHER | **LIVE** | a parameter named `__memory_size__` — D1087 |
| 23 | `wasmEmit.vl:15226` | OTHER | UNREACHABLE | the checker carries the identical predicate ungated at `typecheck.vl:23960`; the parameter-shadowing trick that opened #22 was measured NOT to work here |
| 24 | `wasmEmit.vl:15453` | OTHER | UNDECIDED | every nullable-struct element list is masked by a collection-time refusal (`emit_collect.vl:6521`); every surviving element family has its producer key pinned to the annotation key by `synthRetAnnots` |
| 25 | `wasmEmit.vl:16128` | GUARD-FLAG | **LIVE** | `xs.map(toF)[0] = v` with an f32 callback — D1088 |
| 26 | `wasmEmit.vl:16437` | OTHER | **LIVE** | `(x) = 5` — D1089 |
| 27 | `wasmEmit.vl:16985` | OTHER | **LIVE** | a struct field named `pop` holding a closure — D1087 |
| 28 | `wasmEmit.vl:17039` | GUARD-FLAG | UNDECIDED | needs `exprArray` true with `lUsed` false; every route that makes `exprArray` true also sets `lUsed`. The text reproduces from the SIBLING site `:17023` — confirmed by instrumented build, so this is not a witness for `:17039` |
| 29 | `wasmEmit.vl:17132` | GUARD-FLAG | UNDECIDED | same unmet condition, tighter (the sole caller already gates on `exprArray \|\| exprRefArray \|\| exprStringArray`) |
| 30 | `wasmEmit.vl:17390` | GUARD-FLAG | **LIVE** | `xs.map(toI).map(idI)` with an i64 callback — D1088 |
| 31 | `wasmEmit.vl:17594` | FLOOR-NARROW | UNREACHABLE | `emitMapFilter`'s only call (`:22138`) is inside `emitCallNode`'s `callee is Member` block; both narrowings hold by construction and every path in the block returns |
| 32 | `wasmEmit.vl:17628` | GUARD-TABLE | UNREACHABLE | `emitRefListWidenTop`'s only call (`:17866`) is one line after `if !rlWidenAllowed(…) { return false }`, and `rlWidenAllowed`'s first line is `if rlWidenVariantOf(srcSlot, dstSlot) < 0 { return false }` — same two arguments. The upper half is closed too: `uTags.length == uVarHeap.length == uVariants.length` at emit time |
| 33 | `wasmEmit.vl:18034` | OTHER | UNREACHABLE | `emitArrSlice`'s only call (`:22052`) is gated on `callIsArrSlice`, which derives `callee` the same way and tests the same `mfRecvKindOf(...) != null` |
| 34 | `wasmEmit.vl:18155` | FLOOR-NARROW | UNREACHABLE | same single entry point; `callIsArrSlice` returns false unless `P.nodes[exprIx] is Call` |
| 35 | `wasmEmit.vl:19738` | OTHER | UNREACHABLE | the checker's map-member block errors unconditionally on `margs2.length != 1` (`typecheck.vl:23496`); a non-map receiver never satisfies the emitter's `exprMap` gate, and UFCS is measurably not consulted for a map receiver |
| 36 | `wasmEmit.vl:21539` | GUARD-FLAG | UNREACHABLE | `emitDestStrToAtom`'s one caller is the statement `.push` lowering, reserved by `pushStagesAtomNarrow`; each of that predicate's four declines is also an emit-side decline, so the guarded arm's precondition implies the bit was set. Value-position `.push` refuses earlier |
| 37 | `wasmEmit.vl:21942` | OTHER | UNDECIDED | `capRecord` drops a name only when it is a global or a function, and the emitter's fallbacks read the same two tables — so dropped captures come out as WRONG CODE rather than as this refusal (see §6) |
| 38 | `wasmEmit.vl:22091` | OTHER | UNREACHABLE | the checker's `mp == "has" \|\| mp == "delete"` arm errors unconditionally on arity for any map-typed receiver (`typecheck.vl:23509`) |
| 39 | `wasmEmit.vl:22569` | OTHER | UNDECIDED | no rep found that the checker admits on compare core 7 and the emitter's `catListKindOfExpr` / `eqgListKindOfBin` pair cannot name; 20+ element types tried, direct and through a generic |
| 40 | `wasmEmit.vl:23363` | GUARD-TABLE | UNDECIDED (leaning unreachable) | `emitCapturedCall` opens by calling `emitClosureValue`, which refuses with a different message whenever the sig key is `""`; the collect pass interns the key for every `fe` in `fnStmts`. The residual window is a target appended after the pool build — six spellings tried, all compile |

**Tally: 13 LIVE · 15 UNREACHABLE · 12 UNDECIDED.**

## 4. The estimate

Sample `n = 40` drawn from a frame of `N = 469`, plus `35` sites already proven live outside the
frame. Treating UNDECIDED as the interval's width rather than as either verdict:

| quantity | value |
| --- | --- |
| live fraction of the frame, lower (all UNDECIDED unreachable) | 13/40 = **0.325**, Wilson 95% [0.201, 0.480] |
| live fraction of the frame, upper (all UNDECIDED live) | 25/40 = **0.625**, Wilson 95% [0.470, 0.758] |
| live sites in the frame | **152 – 293** (95% envelope 94 – 355) |
| **LIVE emit-side refusal sites, total** | **≈ 187 – 328** (95% envelope 129 – 390) |
| as a share of all 504 sites | **37% – 65%** |

**So `[23, 405]` narrows to roughly `[130, 390]`, and the honest point range is 190–330.** The
prior embedded in CLAUDE.md — *"the rest are mostly unreachable defensive floors"* — is **not
supported**. Even the most pessimistic reading of this sample (every UNDECIDED cell unreachable,
bottom of the Wilson interval) puts at least **129** sites inside clause 2, five times the 23 the
wording-based count can see; the point estimate is an order of magnitude above it.

### What would move the number, in priority order

1. **The 12 UNDECIDED cells are the whole width.** Collapsing them to verdicts turns a 200-wide
   interval into something near 40 wide. Each one's blocker is named in §3; several are
   *nearly* closed (#40 has one residual window; #36 has a complete argument for its statement
   path and an unexplored value path).
2. **UNDECIDED is not neutral, and this sample leans it one way.** A ten-minute box favours
   UNREACHABLE-by-argument (which a careful read can produce quickly) over LIVE (which needs a
   program nobody has written). Nine of the twelve blockers are of the form "every route I found
   sets the flag" — a statement about search effort, not about the compiler. If anything the
   lower bound is soft *upward*.
3. **The frame is depleted, not neutral.** It excludes the 35 fixture-proven-live sites, and
   those are 86% `OTHER` against 46% in the population. A stratified estimator would likely put
   the number higher than the unstratified one used here.

### Caveats a reader should carry

* **`n = 40` on `N = 469`.** The Wilson intervals above are the honest width; the point values
  are not precise to better than ±50 sites.
* **A site is not a defect.** Several sites share one mechanism — D1088's two LIVE sites are one
  missing ladder, and D1086's two are one missing `else` lowering. The site count is an upper
  bound on distinct *fixes* by a wide and unmeasured margin. Count fixes by ablation, sites by
  this table.
* **This measures REACHABILITY, not severity.** `(x) = 5` and a declarations-only module are both
  live sites and neither is going to block anyone's day; D1085 (a lambda under `as`) plausibly
  will.
* **The corpus scores none of this.** Every one of the 13 LIVE sites is reached by ZERO corpus
  cells, which is why they all got probes.

## 5. Durable output

Thirteen probes, one per LIVE site, under `scripts/capability-probes/`:

`declarations-only-module.vl` · `empty-inline-union-arm.vl` ·
`generic-array-param-union-element.vl` · `null-complement-narrowed-field-read.vl` ·
`optchain-result-struct-equality.vl` · `lambda-under-as-cast.vl` ·
`if-expr-no-else-string-arm.vl` · `if-expr-no-else-boolean-arm.vl` ·
`intrinsic-name-as-parameter.vl` · `struct-field-named-pop.vl` ·
`parenthesised-assignment-target.vl` · `map-callback-f32-indexed-assign.vl` ·
`map-chain-i64-result.vl`

Runner before: `37 of 41 run · 4 still refuse`. After: **`37 of 54 run · 17 still refuse`** — the
13 new ones all grade GAP, which is the point of a probe.

Ten inventory rows, **D1080 – D1089**, in `docs/internals/silent-class-inventory.md`. Three rows
carry two sites each where the ablation says one mechanism (D1086, D1087, D1088). All ten grade
`as filed`; the doc is `419 graded · 419 as filed · 0 MOVED · 0 not graded`.

## 6. Method notes worth keeping

**An instrumented compiler settles shared-literal attribution, and `OUT=` keeps the seed clean.**
Two sampled sites (#19/#20) carry a byte-identical literal, as do #15/#11205 and #28/#17023. For
#19/#20 the message could not say which site fired, and the verdict differed by a whole sample
cell. Tagging the two literals apart and building with `OUT=_scratch/instr/vl-compiler.wasm`
settled it in one run: `s19_str` → 12942, `s20_modbool` → 13116, both independently live. The same
build showed agent-3's `.pop` witness firing the SIBLING site `:17023`, which correctly kept #28
UNDECIDED rather than banking a false LIVE. `build/vl-compiler.wasm` was `cmp`-verified
byte-identical to a pristine copy before and after, and the source was restored from a backup and
`cmp`-verified. **This is the cheap general instrument for "which of these two fired".**

**The harness was validated against controls that must fire.** Before grading anything,
`probe.sh` was run on two `@emit-error` fixtures whose declared message is known; both returned
check rc 0 and the declared emit message. A probe nobody has seen fire is not an instrument.

**`emitFail` masking is not a footnote, it is the dominant hazard.** Three of the forty cells
turned on it: #19/#20 (shared literal), #28 (sibling site), and D1088's i64 witness, which only
works as one chained expression because binding the inner map lets a different floor record first.
A grading rule of "the message matched" would have banked two false LIVEs and missed one real one.

**A structural class is a prior, not a verdict.** The `FLOOR-NARROW` heuristic mislabels —
`wasmEmit.vl:22237` is classified `FLOOR-NARROW` and is proven live by two fixtures. Use the
classes to aim effort (`OTHER` is where live-ness concentrates), never to conclude.

## 7. Side-findings — not part of the sample, not folded into the estimate

Found while hunting witnesses. Each is verified; none has a filed row yet, because this task was
allocated D1080–D1089 and those are spent.

* **A clause-1 MISCOMPILE.** A `for`-loop variable sharing a spelling with a nested function's
  name, captured by a closure, is **check-clean invalid wasm**: `type mismatch: expected i32,
  found (ref $type)`. Verified at `_scratch/ag4/b/s37_loopfn.vl`:

      function other(): i32 {
        function q(): i32 { 1 }
        q()
      }
      function go(): i32 {
        let s = 0
        for q in 1 to 3 {
          const f = () => q
          s = s + f()
        }
        s
      }
      print(other())
      print(go())

  Mechanism: `capRecord` (`emit_classify.vl:4311`) drops the capture because
  `fnIndexOf(name) >= 0`, while `plScanStmt` (`emit_base.vl:328-372`) records only `LetDecl` and
  never a `ForRange.frVar` / `ForIn.fiVar`. The emitter then resolves the name through
  `fnIndexOfInScopeSid` and emits a closure value where an i32 is wanted. **This deserves a row.**

* **A second clause-1 candidate**: a `.push` inside an if-expression arm can leave an unreserved
  local — `unknown local 5: local index out of bounds`, check rc 0
  (`_scratch/ag4/d/matcharm.vl`); adding one unrelated `xs.push("aa")` above it makes it compile.

* **Additional LIVE sites, outside the sample** (found incidentally, deliberately NOT counted in
  §4 so the estimator stays unbiased): `emit_sections.vl:4394` (a comment-only file),
  `wasmEmit.vl:17023` (`.pop` over an f32 `.map` result), `wasmEmit.vl:5502` (`const x = if true
  { 1 }`), `wasmEmit.vl:4571` (`print(a.pop())`), and the `nested arrays are not supported` family
  (`Box<u8[][]>`).

* **`.clear()` is a capability gap at every non-i32 scalar list rep** (`f64[]`, `u8[]`, and by the
  same ladder `i64[]` / `f32[]`): the statement dispatcher refuses it at `wasmEmit.vl:19709` as
  `unsupported member-call statement` and `emitClear` has no scalar arm — while `.pop()` on the
  same reps compiles. D977 built that ladder for pop only.

* **A stale comment.** `typecheck.vl:37025-37029` states that a record / nullable / union pinned
  into an un-annotated parameter's `T` "reaches the emitter's `index receiver is not an array or
  string` with no rule behind it". Measured 2026-09-02: all three spellings are refused by the
  CHECKER at the pin. The comment describes a compiler that no longer exists.

* **`exprArray` is FALSE for a `u8[]`** (parameter, struct field, and `"abc".bytes()` result) and
  for `f64[]`.
