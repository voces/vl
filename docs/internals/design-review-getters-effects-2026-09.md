# Nine-lens adversarial review of getters and function effects — synthesis (2026-09)

Nine persona reviews were run against two designs: the getters design
(`docs/internals/property-access-design.md`, built as v1 in #3031, with the loop amendment in
#3039) and the function-effects design (`docs/internals/function-effects-design.md`, #3023,
unmerged). The personas were Swift, C#/Kotlin, Rust/systems, TypeScript, an optimizing-compiler
engineer, a game/performance programmer, a beginner, a type theorist and a minimalist. Each was
asked for a verdict on six open questions (Q1–Q6) and for its own ranked findings, and each ran
small probes against `dist/vl` at master `31ea77721`. This page is the synthesis, not a tenth
review. The nine reviews are kept verbatim under
[`design-review-getters-effects-2026-09/`](design-review-getters-effects-2026-09/). Their probe
files lived in a session scratchpad and are not committed; every probe a claim below depends on
is either reproduced as an inventory row (D2060–D2067) or marked **re-verified** where the
synthesis re-ran it on `dist/vl`.

## 1. Summary

- **Q1: keep the body contract a hard error.** Six lenses say so outright; the other three
  (TypeScript, compiler-engineer, type-theory) split it into a semantic half that stays an error
  and a cost half that becomes a lint. **No lens supports a use-site suppression comment**, and
  five object to an error-for-std, warning-for-users split because it makes two dialects of `.`.
- **The contract that is built does not hold its own promise, and it also refuses the wrong
  things.** It admits a loop-free getter DAG that does 2^n calls (D2061), a string `is "lit"`
  that lowers to a looping helper (D2062), and a data-dependent f64 `%` (D2063). It refuses
  `sqrt`, `abs`, `popcnt` and the other one-instruction intrinsics, and the message calls them
  "not pure" (D2064). Five of the six lenses that argued for keeping the error tied it to
  fixing these; only the minimalist's verdict is unconditional.
- **Q2: the invariant ("never data-dependent") is the right line; the unit is wrong.** The budget
  counts loop trips, so calls are free. Four lenses want a step count (calls cost 1 plus the
  callee, branches take the max). Three found that the amendment's own example does not
  type-check (D2065). The minimalist wants the amendment reverted until a consumer runs.
- **Q3: no setters, 8–1.** Game-perf dissents: narrow "none" to "none that write to `self`",
  because a setter that stores *through* a handle (a flat-row `RowAddr = new i32` storing into
  linear memory) has no write-back problem, and `units[i].hp -= dmg` is the data-oriented use.
  The majority attached conditions: Swift wants any future setter to be value write-back via
  `withX`; TypeScript and C# want private backing fields first; type-theory bars setters from
  assignment narrowing; Rust objects to hidden calls on `+=`.
- **Q4: a getter type is sealed off from every generic and un-annotated caller today, and the
  guide's workaround is false (D2066).** Eight lenses want `{ readonly x }` at specialised
  positions. Five reject witness tables and adaptors outright, TypeScript and compiler-engineer
  would refuse them until a consumer asks, and type-theory admits a snapshot coercion only for a
  getter that reads nothing mutable; none wants them now. Type-theory found that records are unsound
  underneath it: a mutable field is accepted covariantly and a check-clean program traps
  (D2060, independent of getters).
- **Q5: getter-eligible is not `pure`.** Nine of nine agree on the distinction; the beginner
  disagrees on the vocabulary and the minimalist questions building `pure` yet. The vocabulary is already tangled:
  the shipped message says "pure intrinsic", and the effects doc cites Koka's `pure` wrongly.
- **Q6: the summary's shape is right**: inferred, kept out of types, with one checked marker.
  Three corrections recur: the checker already has an interprocedural write analysis
  (`fnWriteEffects`) that the doc says does not exist; acceptance should be summarised per
  DECLARATION with residual obligations, not per instance; and `hoistable` omits ¬allocates.

## 2. Per-question tally

Verdict keys: **keep** / **split** / **agree** / **modify** / **disagree**, as each review
headed its own section.

### Q1. Should the getter body contract be a hard error?

| lens | verdict | the reason it gives |
| --- | --- | --- |
| Swift | keep | refuses a *spelling*, not a program: the escape is `()`; `String.count` shows that guidance fails |
| C#/Kotlin | keep | twenty years of the FDG guideline and CA1024 did not keep `.` cheap; what chafes is the callee rule, not the cost rule |
| Rust | keep | `const fn` precedent: opt-in syntax, checked, free escape; but "a checked guarantee with holes is worse than a lint" |
| TypeScript | split | semantic half (¬W ¬H ¬X, no `let` reads) an error; cost half (loops, budget, allocation) a warning for users and an error for std |
| compiler-engineer | split | the semantic half licenses reordering, so it must be an error; no pass reads the cost half |
| game-perf | keep, for everyone | the compliance cost is two characters; "std only" is the wrong boundary |
| beginner | keep, conditionally | fair only if it stops refusing `sqrt` and every message names the escape |
| type-theory | split | semantic half makes a getter an *observation* (reorder, CSE, narrowing); cost half is a warning |
| minimalist | keep | "hard error, or nothing"; the middle option is the worst of the three |

**Where they converge.** Nobody wants the proposal as written. No lens wants the
`// vl-allow getter-cost` comment at the read site. Swift, Rust, game-perf, beginner and
minimalist reject it outright. TypeScript, compiler-engineer and type-theory would allow an
opt-out, but only on the *declaration*, and TypeScript wants `@ts-expect-error` semantics (an
unused suppression is itself a diagnostic). The minimalist's objection is procedural: VL's first per-site suppression
is a language-wide decision and should not ride in on one lint. Five lenses (Swift, Rust,
game-perf, beginner, minimalist) name the std/user split as two dialects. A getter copied out of
std would compile under different rules.

**Where they genuinely split.** The three "split" lenses agree with each other on where the seam
is. Effects (writes, host calls, unknown calls, `let` reads) and termination stay an error,
because a transformation relies on them. Cost (the number, allocation, the rep rule) is
lint-shaped. The compiler-engineer adds the uncomfortable fact that **today the compiler uses
neither half**. `getterRewriteSites` turns every getter read into a `Call` before emit, so
`exprEffectFree` answers false, and the semantic half licenses nothing yet.

**Recommended resolution: keep one hard error for everyone, with no suppression, and make it
true and precise first.** The six "keep" lenses and the three "split" lenses both hold that the
effect half must be an error, so that is settled. The disputed part is cost. Keeping it an error
is right *while the escape is free*: moving from a getter to a method is one keyword and
`()`, and every lens agreed on that. Two things decide it:

1. The keep-lenses made their verdict conditional on the contract holding (Rust) and on it not
   refusing obvious cases (beginner, C#, game-perf). D2061–D2064 are exactly those failures.
   Close them before any severity change. If the error still chafes after that, revisit.
2. The split-lenses' strongest point is that cost is not a semantic property. That is true, but
   the one consumer of the cost half is the reader of `v.x`. A lint the author can silence gives
   the reader nothing (C#, game-perf), and making the reader able to trust `.` is the only
   reason getters exist in VL (minimalist: the feature saves two characters).

If the owner prefers the split anyway, take the three splitters' version: the error/lint seam
between effects and cost, a declaration-site opt-out only, and an unused opt-out reported. Do
not split by directory.

### Q2. Constant-bounded loops within a budget of 64: is the invariant a sufficient stopping rule?

| lens | verdict | the point |
| --- | --- | --- |
| Swift | agree / modify | a category line, so a real stopping rule; but the example does not type-check; call the unit "iterations" |
| C#/Kotlin | agree with loops, disagree it is sufficient | bounds iterations, not work: 26 loop-free getters, 1,000 reads = 58.9 s CPU |
| Rust | modify | measure abstract steps; branches are summed where the tier text says max; I15's f64 `%` exemption is false |
| TypeScript | agree invariant, disagree transitive budget as an error | action at a distance; per-body for user code if it stays an error |
| compiler-engineer | agree invariant, metric wrong | static WCET over structured control flow; `max` at joins |
| game-perf | modify | budget should be 16 (widest lane count); example broken; unroll or type the loop variable |
| beginner | agree | messages must say *why* (`for x in self.a` has a run-time count) |
| type-theory | agree, formula has a hole | add a call term; rule on `0 until i` with `i: Lane4`; `step -1`; I13 |
| minimalist | disagree | revert to loop-free; the rule has no consumer that runs, and "relax only" is the `constexpr` ratchet |

**Converge.** All nine accept "never data-dependent" as the right *category* line, including
the minimalist, who calls it "a sound stopping rule for which category of loop gets in" and
disagrees only because the budget is a knob. C#/Kotlin, Rust, compiler-engineer and type-theory
deny that it is *sufficient*, because of the unit (below). The category line is syntactic, and the next step (a data-bounded loop) breaks it rather than moving a number. The
precedents cited independently are WGSL (no recursion), HLSL `[unroll]`, the eBPF verifier and
Zig's branch quota.

**The unit is wrong, and that is a defect in v1 as well as the amendment.** The formula scores
straight-line code as `Bounded(0)` and a call as its callee's bound, so calls cost nothing. C#,
Rust, compiler-engineer and type-theory each built a getter DAG that passes and does 2^n calls
(D2061, **re-verified**: depth 30 read three times, 5.6 s). Swift and game-perf reached the
same point without a probe ("64 back-edges says nothing about cycles"). Rust and
compiler-engineer also note that §C1a *sums* loops across exclusive branches while tier 2
promises "the longest path".

**The example does not run.** Swift, game-perf and minimalist found that "a four-lane reduction
written as `for i in 0 until 4`" fails `argument 1: expected Lane4, got i32` (D2065,
**re-verified**). A constant loop cannot index a lane, which was the one place a lane getter
would want one. The remaining use, a byte loop over `__load_*`, stays a real loop at `-O3`
because binaryen does not unroll (game-perf).

**Recommended resolution.**

- Keep the invariant as the stopping rule, and write it in the "never" list by name, including
  type-theory's refinement case `for k in 0 until i` with `i: Lane4`. Its worst case is computable
  but its trip count is data-dependent, and "never data-dependent" should govern.
- **Change the metric to steps**, in v1 as well: each call costs 1 plus its callee, loops multiply,
  branches take the max, and a compiler helper is charged its true worst case. This closes D2061
  and D2063 with one rule, and it is still computable from source.
- **Do not build the loop half until a consumer runs.** The minimalist's revert and the
  Swift/game-perf fix meet here. The ruling can stand, but its first implementation should ship
  with typing a constant range's variable as the literal union of its values
  (`for i in 0 until 4` gives `i: 0|1|2|3`), which game-perf and Swift both proposed and which
  makes D2065's example check. Without that, the relaxation admits only code that is slower than
  the hand-unrolled form.
- **The number.** Pick it in steps, not trips, once the metric changes. Game-perf's 16 was a
  trip count for lane shapes; a step budget of a few hundred (Rust) and a trip budget of 16 cover
  the same getters. Record the number in DECISIONS.md with the consumer it was sized for.
- TypeScript's action-at-a-distance concern is real but acceptable inside one program (C# makes
  the same call). The std baseline must record the step measure, or a std edit can raise a user
  getter's cost while its recorded bound stays 0 (type-theory).

### Q3. Setters: narrow "none" to "none on value types"?

| lens | verdict |
| --- | --- |
| Swift | agree none; if ever, value-type write-back from `withLane` (`v.x = 1` means `v = v.withLane(0, 1)`) |
| C#/Kotlin | agree none; `readonly` fields and privacy first |
| Rust | agree none on any receiver; `a.x += 1` becomes two hidden calls |
| TypeScript | agree none; a setter protects nothing without private fields |
| compiler-engineer | agree none; compound assignment is D1510's ordering class again |
| game-perf | **modify**: allow a setter that never assigns `self` (a store *through* a handle); known consumer `RowAddr` flat rows |
| beginner | agree none; the message should name `withX` |
| type-theory | agree; a validating setter breaks PutGet, which `writeReNarrowTy` relies on |
| minimalist | agree none; the proposed narrowing makes legality depend on representation |

**Tally: 8–1 for "none".** Game-perf is the dissent, and it is a real one, not a wording
change. The rule that avoids CS1612 is "the setter's body never assigns `self`", not "value
type versus reference type". A handle brand such as `RowAddr = new i32` writes *through* its
receiver into linear memory, so there is nothing to write back. Its hot path,
`units[i].hp -= dmg`, reads today as `units[i].setHp(units[i].hp - dmg)`, which computes the
address twice at `-O0`. Game-perf also raises the spelling question any such setter must
answer: `-=` has to evaluate the receiver place once.

**The majority's "none" is conditional, and the conditions differ:**

- Swift: if setters ever come, they are value-type write-back derived from a `withX` function
  (`v.x = 1` means `v = v.withLane(0, 1)` on an assignable place), never reference-type method
  sugar.
- TypeScript and C#/Kotlin: validation and reactivity setters need private backing fields (or
  `readonly` fields) first, or they guard a door beside an open window.
- Type-theory: a setter place must never take part in assignment narrowing, because a
  validating setter breaks PutGet and `writeReNarrowTy` relies on it.
- Rust (and compiler-engineer): `a.x += 1` becomes two hidden calls, get then set, which is
  hidden control flow on the left of `=` and D1510's ordering class again.

**Recommended resolution: keep F7 ("none") for now, and do not narrow it to "none on value
types".** Nobody but game-perf wants setters now, and the proposed narrowing is the one shape
no lens asked for. Record in DECISIONS.md that game-perf's **store-through-handle setter** is
the one credible narrow exception, to be designed if a flat-row consumer needs it. It would
satisfy every majority condition except Rust's. Its body never assigns `self` (the CS1612
point), there is no backing field to protect, and it can stay out of narrowing (PutGet).
Rust's hidden-call objection is what it would have to answer, with a receiver-once `-=` and a
cost contract like the getter's. Swift's `withX` write-back stays the other recorded shape.

### Q4. Should getters satisfy read-only structural contracts?

| lens | verdict | position rule |
| --- | --- | --- |
| Swift | agree, urgent | specialised only (Swift's `some`); annotated positions refuse |
| C#/Kotlin | agree, urgent | specialised only; reads through `{ readonly x }` never narrow |
| Rust | modify | monomorphised yes; erased positions refuse; never an adaptor |
| TypeScript | agree, with two changes | an annotated `{ readonly x }` *parameter* is sugar for a bound; infer read-only rows for un-annotated functions |
| compiler-engineer | agree, costs more than stated | needs a per-member access mode (interprocedural), emit-time lowering per instance, structural parameters as implicit type parameters |
| game-perf | modify | bound-only in the grammar; never a value type |
| beginner | yes, sooner | "the missing half of getters" |
| type-theory | modify, bound first | `{x} <: {readonly x}` one way; mutable fields invariant; **fix D2060 first** |
| minimalist | not now | build only if `readonly` *fields* earn it; never witness tables |

**Converge.** No lens wants witness tables or silent adaptors now, but that is not nine flat
no's. Five reject them outright: Swift, C#/Kotlin, Rust, game-perf and minimalist, all citing a
visible `dyn` or `any` against an invisible one. TypeScript and compiler-engineer would refuse
those positions loudly until a consumer asks (compiler-engineer sketches the eventual witness,
`{anyref obj, funcref getx}`). Type-theory makes the annotated position a checker refusal in
v1, but admits a *snapshot* coercion for a getter that reads nothing mutable (every `F32x4`
lane) and a live witness later. The beginner does not address it. Eight of nine: yes at
specialised positions (the minimalist says not now). Plain `{ x: f32 }` must never accept a getter (TypeScript #13347,
cited by five).

**Urgency comes from D2066.** Today a getter type satisfies no field bound, no method bound, and
no inferred row. The guide says generic code "asks for the method `{ x(): f32 }` instead", and
that is false (**re-verified**, `Color does not satisfy {r():i32}`). The refusal still names the
§G3 false fix. The un-annotated `function red(t) { return t.r }` is refused as
`expected {r: _}, got Color` (**re-verified**). Six lenses found this independently.

**Recommended resolution.** Fix the guide sentence and the message now (D2066); these are wrong
under any answer to Q4. Rule `{ readonly x: T }` as **bound-only** (`<U: { readonly x: T }>` and
inferred rows) for its first build. That covers game-perf, type-theory and Swift, and
TypeScript's "annotated parameter is sugar for a bound" is a compatible later step. Sequence it
after D2060 (type-theory: `readonly` gets its meaning from being the covariant one of the pair)
and after an access-mode-per-member analysis (compiler-engineer). That analysis is the same
per-parameter write summary `fnWriteEffects` already computes, so Q4 and Q6 should share it.

### Q5. Is getter-eligible rightly not `pure`?

Nine of nine agree on the distinction. Two qualify it: the beginner disagrees on the vocabulary,
and the minimalist questions building `pure` at all yet. The refinements:

- **Vocabulary.** The shipped message says "neither a pure intrinsic nor a getter" (beginner,
  **re-verified**). The guide says "effect-free". The effects doc says a getter is not `pure`.
  Beginner and C# want getter diagnostics never to say "pure" or "getter-eligible". TypeScript
  wants hover never to show `pure` on a getter.
- **Citation.** Type-theory: VL's `pure` admits `R.heap[param]`, so it is Fortran `PURE` or D's
  weak `pure`, not Koka's (where reading a `ref` is an effect). Fix §E2's citation.
- **Stated rationale.** Swift and type-theory: "a getter describes its receiver" is not what the
  rule enforces. It admits all of linear memory and a module `const`'s mutable heap, so the same
  receiver can give two answers. Say "no reads of a named mutable module binding".
- **Minimalist:** agree with the distinction, but `pure` has no built consumer and the std
  baseline already guards the boundary. Reserve the word and build it with its first reader.

### Q6. Is the effects summary the right shape?

| lens | verdict | additions or cuts |
| --- | --- | --- |
| Swift | agree / modify | an escape fact per function-typed parameter before Nim's rule; say where a generic `pure`'s error lands; the `S` bit must not stay inference-only if suspension becomes observable |
| C#/Kotlin | agree / modify | resolve the rep-boxing contradiction with the getter doc; a call term in `B`; hover shows the chain to the first reason; drop `S` |
| Rust | agree / modify | a step unit; inferred facts are API (auto-trait leakage); an always-safe-to-inline fact; `R.heap` root split excessive for v1 |
| TypeScript | agree | the "why" chain in the editor; an isolated-declarations story before separate compilation; hover shows at most three facts |
| compiler-engineer | agree / modify | compute per DECLARATION with residual obligations; `hoistable` needs ¬A; check the operator cost table against the emitter; replace `getterReaches`' per-getter BFS |
| game-perf | agree / modify | split `W` by location like `R`; type/field alias classes; loop-rotation-guarded LICM; an `@nogc`-style test-time assertion on frame roots |
| beginner | agree / modify | plain-language hover (`no loops`, not `bound 0`); two user-facing words at most; a `debugPrint` escape |
| type-theory | agree / 4 corrections | `fnWriteEffects` already exists; freshness rule unsound on nested paths; `hoistable` needs ¬A; per-instance `pure` on a generic is non-local |
| minimalist | mostly speculative | measure binaryen's `--generate-global-effects --licm` first; defer to concurrency step 6; start from three facts; reserve no empty slots |

**Converge.** Inferred, never in types, pessimistic at unknown calls, with Nim's rule later:
no lens objects to any of these, and the minimalist, who would defer building most of the
summary, calls Nim's rule the best idea in the doc. The four corrections that more than one lens reached independently are listed in
§3. The genuine split is scope. The minimalist wants three facts and a deferral. Game-perf wants
*more* precision (`W` split, alias classes). The compiler-engineer wants a different computation
unit.

**Recommended resolution.** Take the compiler-engineer and type-theory architecture: one summary
per declaration, built on `fnWriteEffects` rather than beside it, with residual obligations for
type parameters and function-typed parameters resolved at each call. Take the minimalist's scope:
build only the facts a built consumer reads. Today those are the getter check (after S2) and
D1510's reorder, which need effect-free, allocates and terminating (with the step measure).
Measure binaryen's flags before any VL-side hoist. Keep `pure` reserved and unbuilt.

## 3. Convergent findings, ranked by independent hits

Counts are lenses that reached the finding from their own evidence. "(probe)" means with a
program; the rest argued it from the design text.

| # | finding | lenses | status |
| --- | --- | --- | --- |
| 1 | A getter type is readable by no generic or un-annotated code; the guide's `{ x(): f32 }` workaround is false; the refusal repeats §G3's false fix | 6 (probe): Swift, C#, TS, CE, beginner, minimalist | **D2066**, re-verified |
| 2 | The cost measure counts loop trips, not calls, so a loop-free getter DAG is 2^n | 4 (probe): C#, Rust, CE, type-theory; 2 more on the unit: Swift, game-perf | **D2061**, re-verified |
| 3 | The one-instruction math/bit intrinsics are missing from the getter allow-list; derive it from `isNumIntrinsicName`; the message says "not pure" | 4 (probe): Swift, game-perf, CE, beginner | **D2064**, re-verified |
| 4 | Diagnostics: no "make it a method" fix in any contract message, duplicate reports, jargon ("null niche", "representation is boxed", "pure intrinsic") | 5: Rust, TS, beginner, C# (LSP code fix), Swift (duplicate) | **D2067**, re-verified |
| 5 | Error-for-std / warning-for-users makes two dialects of `.` | 5: Swift, Rust, game-perf, beginner, minimalist | design, §2 Q1 |
| 6 | The callee rule ("intrinsics and getters only") is what chafes: extracting a helper breaks a getter; sequence S2 before loops | 4: C#, game-perf (probe), minimalist (probe, argues to keep it closed), beginner | design, §6 |
| 7 | The amendment's `for i in 0 until 4 { v.lane(i) }` example does not type-check; type a constant range's variable as its literal union | 3 (probe): Swift, game-perf, minimalist | **D2065**, re-verified |
| 8 | Getter paths could narrow: the contract makes a getter an observation (Kotlin's refusal assumes unchecked getters) | 3: Rust, CE, type-theory. And 3 want the failed-narrowing message to say "bind it first": TS, game-perf, beginner | design; message re-verified (`member access '.length' on non-object string \| null`) |
| 9 | Per-instance acceptance of `pure` on a generic is non-local; check per declaration with unresolved terms | 3: Swift, CE, type-theory | effects doc, §5 Q6 |
| 10 | The getter doc judges allocation on the rep (F9(a)), the effects doc on the source; "relax only" means S2 would admit `get owner(): i32 \| null` | 3: Swift, C#, game-perf; beginner on the nullable-scalar refusal itself | design, §5 |
| 11 | Always inline getters (or lower them in the emitter's `Member` arm): at the default `-O0` build `.x` is a `call` | 3: Rust, game-perf (probe), CE | design, §6 |
| 12 | The transitive budget makes acceptance depend on another module's body | 3: TS, minimalist, Rust ("inferred facts are API"); C# accepts it | design, §2 Q2 |
| 13 | `hoistable` omits ¬allocates: hoisting `mk()` shares one mutable object | 2: CE, type-theory | effects doc error |
| 14 | Nim's rule needs an escape fact per function-typed parameter (and forwarding) | 2: Swift, type-theory | effects doc gap |
| 15 | §C1a sums loops across exclusive branches; the tier text promises max | 2: Rust (probe), CE | amendment error |
| 16 | No extension getters (the orphan rule) while extension methods are free; say so in the guide | 2: Swift (probe, re-verified), C# | design, say it |
| 17 | The checker already has an interprocedural write analysis (`fnWriteEffects`, `fnWriteFreePaths`); the effects doc says there is none | 1 (probe): type-theory; CE reaches the same analysis from Q4 | effects doc error, confirmed in `compiler/typecheck.vl` |
| 18 | Mutable record fields are depth-covariant: a check-clean program traps | 1 (probe): type-theory | **D2060**, re-verified; clause 1 |
| 19 | `is "literal"` over a string lowers to the looping `__str_eq__`, unseen by the walk | 1 (probe): CE | **D2062**, re-verified with `wasm-dis` |
| 20 | f64 `%` is a data-dependent loop counted as 0 | 1 (probe): Rust | **D2063**, re-verified |
| 21 | Freshness rule (§C2) is unsound on nested paths: `r.inner.x = 1` with `r` fresh writes `p` | 1: type-theory | effects doc error |
| 22 | `?.` does not read getters | 1 (probe): C# | design, re-verified; a checker rung, not a question |
| 23 | No rule in the std rubric for when a member is a getter rather than a method | 1: minimalist; C# ("B6 and the getter contract should be one rule"); beginner (the "when to use which" table) | §6 |
| 24 | Flat-row getters are steered to raw `__load_*` because std's `loadF32` is refused | 1 (probe): game-perf | falls out of S2 |
| 25 | A user `"[]"` overload is a member read with no contract | 1: Rust | noted, not scheduled |

**A reviewer claim this synthesis refuted.** Beginner finding 4 reported that
`get magnitude(self: Delta): i32 { abs(self as i32) }` prints "a bogus `expected i32, got f64`",
and that `abs` on an `i32` runs outside a getter. It does not: prelude `abs` is f64-typed
everywhere (`const k: i32 = abs(-5)` is refused as a lossy conversion), so the second error is
correct. It is noted in D2064 and is not part of any row.

## 4. Real defects versus design choices

### Real defects, filed

Every row's witness is from a persona probe, cut down, and graded
`8 graded · 8 as filed · 0 MOVED · 0 not graded` by `check-filed-witnesses.py --strict` against
a seed built from this tree.

| row | defect | outcome | clause |
| --- | --- | --- | --- |
| [D2060](inventory/D2060.md) | a mutable record field is accepted covariantly in depth; the callee writes a `string` into the caller's `i32` field | loads then traps (`cast failure`) | 1, soundness |
| [D2061](inventory/D2061.md) | the contract counts loops, not calls; `a8` = 4^8 getter calls, accepted | runs; the acceptance is the defect | the contract's own promise |
| [D2062](inventory/D2062.md) | string `is "lit"` in a getter is accepted and calls `__str_eq__`, while `==` is refused | runs; the acceptance is the defect | the contract's own promise |
| [D2063](inventory/D2063.md) | f64 `%` in a getter is accepted as cost 0 and loops by exponent gap | runs; the acceptance is the defect | the contract's own promise |
| [D2064](inventory/D2064.md) | `sqrt`, `abs`, `min`, `popcnt`, … refused in a getter as "not pure intrinsics" | loud check reject | 2, capability |
| [D2065](inventory/D2065.md) | a constant-range loop variable is `i32`, so the amendment's lane example fails | loud check reject | design gap in #3039 |
| [D2066](inventory/D2066.md) | a getter satisfies no bound; the refusal offers the §G3 false fix; the guide's workaround is false | loud check reject | message and guide |
| [D2067](inventory/D2067.md) | one string `+` reports twice; a nullable result reports twice; no message names the method escape | loud check reject | diagnostics |

The three "runs" rows use `runs today and must keep running` in the sense that the grader
reports them as MOVED the day the contract closes. There is no outcome word for "accepted but
the design says refuse".

### Real defects in the unmerged design docs (no witness to file)

These go to the PR authors of #3023 and #3039 as review comments:

- **#3023 §A1** says the checker has no call graph and no effect analysis. It has `fnWriteEffects`
  and `fnWriteFreePaths` (`compiler/typecheck.vl`), a transitive per-parameter write summary that
  already decides acceptance through `callInvalidatesReal` (type-theory probe `p8`). `W` must
  subsume it at the same precision, or narrowing regresses.
- **#3023 `hoistable`** omits ¬allocates (compiler-engineer, type-theory).
- **#3023 §C2 freshness** asks about the root, not the written object (type-theory).
- **#3023 §E2** cites Koka for `pure`; the correct precedent is Fortran `PURE` or D's weak `pure`
  (type-theory).
- **#3023 §C3/§C4** keys acceptance on the emitter's instance table, which makes acceptance
  depend on rep, the thing §C3 itself rejects (compiler-engineer).
- **#3039 §C1a** sums exclusive branches; the tier text says max (Rust, compiler-engineer).
- **#3039 I15** justifies f64 `%` at cost 0 by "bounded by the float format"; bounded is not
  data-independent (Rust; D2063).
- **`docs/guide/getters.md`** states the false `{ x(): f32 }` workaround (D2066), and relies on
  terms no guide page defines: nominal, brand, orphan rule, intrinsic, null niche (beginner).

### Design choices the review endorsed

The nominal-only receiver; resolution by receiver type, never lexically; the orphan rule
(D1984 immunity); no setters; a getter never satisfies a plain `{ x: f32 }`; "no narrowing
through a getter" for v1; the non-boxing result rule *as a v1 rule*; effects inferred and kept
out of types; pessimism at unknown calls. Each was challenged by at least one lens and defended
by more. The orphan rule and the narrowing refusal were each asked to be *explained in the guide*
rather than changed.

## 5. Owner decisions

Each lists options, who holds which, and the synthesis recommendation.

**D-Q1. Severity of the getter body contract.**
(a) keep one hard error for everyone, no suppression (Swift, C#, Rust, game-perf, beginner,
minimalist); (b) split by seam: effects an error, cost a warning for users and an error for std,
with a declaration-site opt-out that reports when unused (TypeScript, compiler-engineer,
type-theory); (c) the proposal as written: the whole contract a warning for users, an error
for std, and a per-site comment. No lens holds (c): the three splitters keep the effect half an
error everywhere, and none puts the opt-out at the read site.
**Recommend (a)**, conditional on closing D2061–D2064 first. Rule out (c) explicitly. Rule
separately, if ever, whether VL gets per-site suppression at all (minimalist).

**D-Q2. The loop amendment, its metric and its number.**
(i) Keep constant-bounded loops ruled? Recommend **keep the ruling, do not build it** until it
ships with a literal-union loop variable (D2065), so a consumer runs. The alternative is the
minimalist's revert to loop-free.
(ii) Metric? Recommend **steps, not trips**: a call costs 1 plus its callee, branches take the max,
helpers are charged their worst case. This applies to v1 as well and closes D2061/D2063.
(iii) Budget? Recommend choosing it in steps once (ii) lands, sized to a named consumer and
recorded in DECISIONS.md. Game-perf's 16-trip figure is the reference point.
(iv) Refinement-bounded loops (`0 until i`, `i: Lane4`)? Recommend **never**, by name.

**D-Q3. Setters (8–1, game-perf dissenting).**
(a) keep "none" (eight lenses, most with a condition: Swift's `withX` write-back, TS and C#'s
private fields first, type-theory's no-narrowing, Rust's no hidden calls on `+=`); (b) narrow to
"none on value types", which permits reference-type setters (no lens); (c) narrow to "none that
write to `self`" (game-perf).
Recommend **(a) now, and rule out (b)**. Record game-perf's **store-through-handle setter** in
DECISIONS.md as the one credible narrow exception, to be designed if a flat-row consumer needs
it. Its design must answer the receiver-once `-=` spelling (`units[i].hp -= dmg` evaluates
`units[i]` once), stay out of assignment narrowing (PutGet), and carry a cost contract like the
getter's so the store cannot hide other effects. Record Swift's `withX` write-back as the other
admissible shape.

**D-Q4. `{ readonly x }` and getters.**
Build it bound-only at specialised positions? Recommend **yes**, sequenced after D2060 and after
S2's per-declaration write summary. Urgency: fix D2066's guide sentence and message **now**, and
build the bound in the next getters slice, not "later". No adaptors or witness tables now:
five lenses reject them outright, TypeScript and compiler-engineer want them only with a
consumer, and type-theory's snapshot coercion for immutable-receiver getters is the one
exception worth keeping in view. TypeScript's parameter-sugar and inferred-read-only-row extensions are compatible
follow-ups.

**D-Q5. `pure` and getter-eligible.** Recommend **keep them separate** (nine of nine), strip "pure"
from getter diagnostics (D2067/D2064), fix the Koka citation, and state the no-`let`-read
rationale honestly. On building `pure` at all, the minimalist and the effects doc's own staging
agree: reserve it, and build it with its first reader.

**D-Q6. The effects summary.**
(i) Per instance or per declaration? Recommend **per declaration, with residual obligations**
resolved at the call (compiler-engineer, type-theory; Swift raises the same problem).
(ii) Build or defer? Recommend **build only S2's slice** (getter callees by summary), on
`fnWriteEffects`, with the minimalist's three facts (effect-free, allocates, terminating by
steps). Defer the rest to concurrency step 6. Measure binaryen's `--generate-global-effects
--licm` before any VL hoist.
(iii) Nim's rule: when built, with an escape fact and forwarding (Swift, type-theory).
(iv) Rep versus source for allocation: decide before S2, because "relax only" would admit
nullable-scalar getters. Recommend judging on the **source** for acceptance (the effects doc,
C#, Swift), plus game-perf's test-time `--deny-alloc` assertion over emitted instances for the
rep-level truth.

**D-Q7 (raised by the review). A std rule for when a member is a getter.** Recommend adopting the
minimalist's sentence into `std-api-review.md`: *a getter is only for a named part of an opaque
scalar or vector brand (a lane, a packed field, a flat-row column); anything else is a method.*

## 6. Recommended build order

1. **Docs, today, no compiler change.** Correct the guide's `{ x(): f32 }` sentence and say that a
   getter type is for concrete code until F5 (D2066). Add the beginner's "when to use which"
   table, and say that users add methods, not getters, to std types (Swift, C#). Send the
   #3023/#3039 corrections in §4 to their PRs, including dropping or fixing the lane example
   (D2065).
2. **D2060**: invariant depth for mutable record fields. It is a clause-1 trap independent of
   getters, and it blocks F5.
3. **D2064**: derive the getter intrinsic list from `isNumIntrinsicName`. This is a pure
   relaxation in the allowed direction.
4. **D2067 and D2066's message**: one report per mistake, the method escape in every contract
   message, no "pure"/"null niche"/"representation" in user text, and "bind it first" on a failed
   narrowing through a getter.
5. **D2061, D2062, D2063: make the contract true.** Step counting over calls (with max at joins),
   `IsExpr` literal tests costed like `==`, and `%` charged or given a constant-time lowering.
   Add the compiler-engineer's self-check: every emitted getter instance contains no `loop`, no
   allocation, and no helper call outside a leaf list. It catches the next drift the first time a
   fixture hits it.
6. **S2: getters may call getter-eligible functions**, by a per-declaration summary built on
   `fnWriteEffects`. Game-perf and C# rank this ahead of loops. It removes the copy-paste
   pressure and finding 24's raw-`__load_*` steering.
7. **F5, `{ readonly x: T }`, bound-only**, with never-narrowing reads in generic bodies.
8. **Getter lowering**: inline getters, or lower them in the emitter's `Member` arm, so `.x` is a
   load at `-O0` and `exprEffectFree` can use the contract (Rust, game-perf, compiler-engineer).
9. **Constant-bounded loops**, only with a literal-union loop variable and a running consumer.
10. **The rest of the effects summary**, with its first unbuilt consumer (concurrency step 6),
    after measuring binaryen's global-effects flags.

## Per-lens summaries

- **Swift**: keep the error; the refusal of `sqrt` is what will make people demand a warning.
  `{ get }`/`some` versus `any` is the model for F5. Wants an escape fact before Nim's rule.
- **C#/Kotlin**: .NET is the twenty-year experiment in guideline-only getters. The callee rule,
  not the cost rule, is what chafes. Field-to-getter is a source break in VL too, without F5.
- **Rust/systems**: `const fn` precedent; closes two holes (fan-out, f64 `%`); wants a step unit,
  always-inline getters, and explicit erasure.
- **TypeScript**: split the contract at its semantic/cost seam; `@ts-expect-error` semantics for
  any opt-out; #13347 is the hole to avoid; the everyday JS getters (`fullName`, `total`) are
  refused, so the messages must carry the fix.
- **Compiler engineer**: the compiler uses neither half of the contract today; the walk is a fourth
  hand-written "no effect" predicate and has drifted (`is "lit"`, intrinsics); compute summaries
  per declaration; `hoistable` needs ¬A.
- **Game/performance**: keep the error; fix the intrinsics and the callee rule before loops; 16 not
  64; handle setters are the one real setter consumer; `-O0` getter calls matter.
- **Beginner**: the one-sentence rule is good; the messages never say what to type next; the guide
  assumes vocabulary it never teaches.
- **Type theory**: the contract makes a getter an observation, which is worth keeping as an error;
  mutable record fields are depth-covariant (D2060); four corrections to the effects doc.
- **Minimalist**: a getter saves two characters, so every piece must pay for itself; hard error or
  nothing; revert the loop amendment until a consumer runs; build three effect facts, not ten.
