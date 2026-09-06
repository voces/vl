# The wording count is a floor, and here is the population under it — 2026-09-05

`scripts/goal-scoreboard.py` counts the compiler's capability refusals by their WORDING: the
message literals whose sentence concedes the refused program was type-valid. CLAUDE.md already
says that number is a lower bound (D964). This file measures the gap between the bound and the
thing it bounds, on the population the bound cannot see.

**Headline.** Re-derived today, the compiler has **533** emit-side refusal sites and the
wording predicate matches **16** of them — **517 sites (97%) say nothing about whether the
refused program was legal**, and a `vl check`-clean program that reaches any of those is a
clause-2 violation the scoreboard never counted. A reproducibly-seeded sample of 48 of the 517
grades **21 LIVE · 20 UNREACHABLE · 7 UNDECIDED**, which puts **≈226–302** of them reachable
(43.8% – 58.3%, 95% envelope **159 – 368**).

**And the count is pointed the wrong way round.** The 2026-09-02 audit in
`scripts/capability-probes/README.md` witnessed fourteen of the literals the wording predicate
DOES match and found **thirteen of the fourteen already RUN** — the wording count is largely
made of floors. The sites it cannot see are where live-ness is.

The durable output is `scripts/capability-probes/live-sites.json`: **21 refusal literals with a
probe each**, all 21 invisible to the wording count. `goal-scoreboard.py` now prints that number
beside the wording one and labels the wording one as the floor it is.

Everything below is a measurement with a date on it. `python3 scripts/emit-refusal-sites.py`
re-derives §1 and §2 from the tree; re-run it before quoting.

---

## 0. Why now: a refusal is not obliged to admit it is a gap

`emitProgram: fromCodePoints argument must be a named i32[] binding` fired on a `vl
check`-clean program — a literal argument — for as long as it existed. It reads like a design
rule. #2665 built the spill that closed it, and **`--sites` did not move by one in either
direction**, because the sentence never matched the phrase list going in and does not now.

That is D964's rule with a second worked instance, and it is what makes a wording-keyed count
structurally unable to be the measurement: the predicate asks whether the compiler CONFESSED,
and the compiler is under no obligation to. Only a witness settles which sites count.

## 1. The population, re-derived

`emitFail` / `emitFailAt` (`compiler/emit_bytes.vl`) are the only emit-side failure channel.
`scripts/emit-refusal-sites.py` extracts every call by BALANCING PARENTHESES across lines, then
reduces each call's first argument to a template — literal chunks kept, non-literal chunks
replaced by `{}`.

| population | 2026-09-05 | the 2026-09-02 doc |
| --- | ---: | ---: |
| `emitFail` / `emitFailAt` CALL SITES | **533** | 504 |
| distinct MESSAGE TEMPLATES | **466** | 434 |
| templates with no interpolation (a whole message) | 397 | 383 |
| templates with at least one `{}` hole | 69 | 51 |
| distinct ≥12-char literals inside an argument | 519 | 472 |

Per file: `wasmEmit.vl` 441, `emit_collect.vl` 27, `emit_bytes.vl` 22, `emit_sections.vl` 21,
`emit_mono.vl` 13, `emit_classify.vl` 9.

**THE 504 IS NOT REPRODUCIBLE, AND THE DERIVATION IS A SCRIPT NOW.** Run against a `git
archive` of the tree the 2026-09-02 doc measured (`5cf0a37e0`), this script reads **521** sites,
not 504 — and the per-file split differs in BOTH directions (`emit_sections.vl` 17 against the
doc's 19, `wasmEmit.vl` 437 against its 425), so it is not one filter one side applied and the
other did not. Which hand-derivation was right cannot be settled from the numbers; what can be
settled is that neither was reproducible, which is the third time this population has failed
that way (CLAUDE.md records "511 literals" from an 8-line WINDOW grep, and "40 / 26 / 23" from
counting lines). So the like-for-like growth since 2026-09-02 is **521 → 533, +12 sites**, and
the derivation is committed rather than described.

## 2. What the wording predicate does not match

517 sites, 453 distinct templates. Grouped by the verb or noun the refusal reaches for — most
specific pattern first, so each template is filed once. Regenerate with
`python3 scripts/emit-refusal-sites.py --groups`; every template is listed in the appendix.

| group (the verb/noun the refusal reaches for) | sites | templates |
| --- | ---: | ---: |
| supports only / is supported as | 7 | 7 |
| has no rep / no representation | 2 | 2 |
| has no \<thing\> | 48 | 44 |
| must be / must have | 15 | 10 |
| only … supported / allowed | 5 | 3 |
| unsupported \<noun\> | 18 | 14 |
| not supported / not a supported | 16 | 11 |
| cannot | 4 | 4 |
| unknown / unresolved / not found | 12 | 10 |
| not interned / no slot / no index | 7 | 5 |
| out of range / overflow / too long | 3 | 3 |
| expected \<x\> | 46 | 40 |
| missing / empty | 11 | 10 |
| requires / needs / takes | 45 | 44 |
| is not / are not / does not | 76 | 64 |
| … but \<state\> (internal invariant) | 109 | 101 |
| bare `no <noun>` | 46 | 42 |
| whole message from a helper | 7 | 1 |
| other | 40 | 38 |
| **total** | **517** | **453** |

**Three of these groups read like capability gaps in plain English and match no phrase.**
`supports only …` (7 sites) names a supported list and refuses everything else — the exact
shape CLAUDE.md says to grade one member per row. `only … supported / allowed` (5) is the same
sentence in the other word order. `has no rep / no representation` (2) and much of `has no
<thing>` (48) concede a missing lowering without using any of the eight conceding phrases.
**They are deliberately NOT added to the predicate.** CLAUDE.md's rule stands: a phrase earns a
place only if it admits the refused program was legal, and `supports only` is also the wording
of a genuine DESIGN rule (`Map`/`Set` keys must be `string` or `i32`). Widening the regex would
trade a floor for a number that is wrong in a new direction. The answer is a witness, not a
wider grep — and §3 shows the wording is not even a useful prior: of the 21 LIVE sites, only
one is in a "sounds like a gap" group.

**The largest group is an internal invariant.** `… but <state>` — `index access but list type
not collected`, `string literal but array type not collected` — is 109 sites, 21% of the
unmatched population, and its sentences describe the emitter's own bookkeeping. **Seven of the
sample's eleven such sites are LIVE or UNDECIDED**, and five of the seven are one mechanism: a
collect-time flag that a generic or an indirectly-delivered callback hides the rep from.

## 3. The sample

**Frame**: all **517** wording-unmatched sites, sorted by `(file, line)`. Nothing is held out —
the 33 of them a `tests/cases/**` `@emit-error` fixture already proves live stay in, so the
estimate answers "what share of the sites the wording count cannot see is reachable" with no
depletion correction.

**Draw**: `random.Random(20260905).sample(frame, 48)`, reproducible with
`python3 scripts/emit-refusal-sites.py --sample 48`.

**Representativeness** — the draw's group mix against the population's. The largest single
deviation is `bare no <noun>` (2.1% drawn against 8.9%); every other stratum is within 4 points.

| stratum | sample | population |
| --- | ---: | ---: |
| … but \<state\> | 22.9% | 21.1% |
| is not / are not / does not | 16.7% | 14.7% |
| has no \<thing\> | 12.5% | 9.3% |
| expected \<x\> | 6.2% | 8.9% |
| requires / needs / takes | 6.2% | 8.7% |
| missing / empty | 6.2% | 2.1% |
| not supported / not a supported | 6.2% | 3.1% |
| unsupported \<noun\> | 4.2% | 3.5% |
| bare `no <noun>` | 2.1% | 8.9% |
| other | 4.2% | 7.7% |
| (nine groups at ≤ 2.1% each) | 12.5% | 12.0% |

**Grading protocol.** Write the plainest program the site's guard admits; `vl check` must
return 0 and the build must report **that site's own message**. `emitFail` keeps the FIRST
failure only, so a program that fires the target while reporting a different message is not a
witness. `UNREACHABLE` requires an argument read off the source naming the guard no check-clean
program satisfies; `UNDECIDED` is the honest answer where the ten-minute box ran out. No
instrumented build was permitted — an instrumented compiler poisons the seed — so a shared
template had to be attributed from the source, which it was in all six cases where it arose
(the diagnostic's COLUMN settled one, `emitFailAt` anchoring at the field node rather than the
statement). Every LIVE verdict below was re-run independently of the agent that found it.

The harness was validated against a control that must fire
(`tests/cases/statements/error-discarded-bare-null.vl` → check rc 0 then its declared message)
and one that must pass, before anything was graded.

### The per-site table

| # | site | group | verdict | witness / argument |
| ---: | --- | --- | --- | --- |
| 1 | `emit_bytes.vl:1006` | has no \<thing\> | UNREACHABLE | `mvRlSlot` has one push site; kinds 2/6/14 return −1 only for an empty name, and `mvValKindOfName("")` cannot answer 2/6/14 |
| 2 | `emit_collect.vl:2978` | unsupported \<noun\> | **LIVE** | `for m in xs` over `{[string]: i32}[]` — `for-in-over-map-list.vl` |
| 3 | `emit_collect.vl:3546` | is not | UNREACHABLE | `LetDecl.letType` can only index a `TypeRef`: every producer in the tree routes through `mkTypeRef` |
| 4 | `emit_collect.vl:3551` | is not | UNREACHABLE | `checkLocalI32`'s one caller passes the same index its own `s is LetDecl` block narrowed; the arena is not rewritten during emit |
| 5 | `emit_collect.vl:3560` | missing / empty | UNREACHABLE | `checkExprI32`'s one caller sits after a block that always returns when `letInit < 0` |
| 6 | `emit_collect.vl:3564` | only … supported | UNREACHABLE | a `StrLit` initialiser is claimed by `letIsString` before the `else` that reaches this arm; the sibling `:3541` is what fires |
| 7 | `emit_collect.vl:4616` | other | UNDECIDED | needs two mv slots merged with different `rlWrapIdx`; the merge relation ignores the wrapper, so the window is real — 8 spellings all deduped |
| 8 | `emit_collect.vl:4698` | supports only | **LIVE** | `tests/cases/maps/error-i32-keyed-position-union-member.vl` (an `@emit-error` fixture) |
| 9 | `emit_collect.vl:9630` | helper message | **LIVE** | a union arm self-recursive through its own field — `self-recursive-union-arm-field.vl` |
| 10 | `emit_collect.vl:10009` | not supported | **LIVE** | a map arm of a union spelled under a function type — `map-union-member-under-fn-type.vl` |
| 11 | `emit_mono.vl:2657` | requires / needs | **LIVE** | `T.size` in a lambda where no parameter binds `T` — `flat-layout-const-unbound-type-param.vl` |
| 12 | `emit_mono.vl:4043` | unsupported \<noun\> | **LIVE** | `function f<T>(_x: T \| null)` pinned at `string` — `generic-nullable-union-param-pin.vl` |
| 13 | `emit_sections.vl:5112` | has no \<thing\> | UNREACHABLE | the loop runs `0..9` and `fsIntrinsicArity` is non-negative for every one of those |
| 14 | `wasmEmit.vl:1078` | other | **LIVE** | `tests/cases/closures/error-nested-lambda-field-collision.vl` (an `@emit-error` fixture) |
| 15 | `wasmEmit.vl:1094` | not interned | UNREACHABLE | the type section's strictly wider guard on the same slot fires first, with the same text |
| 16 | `wasmEmit.vl:1303` | missing / empty | **LIVE** | an omitted `u8[] \| null` field — `omitted-nullable-u8-list-field.vl` |
| 17 | `wasmEmit.vl:1827` | missing / empty | **LIVE** | an arm annotation consumed by the initialiser's call argument — `arm-annotation-consumed-by-call-argument.vl` |
| 18 | `wasmEmit.vl:2883` | … but \<state\> | UNREACHABLE | a code-16 field registers its union unconditionally and `markValueUnionAtoms` sets `aUsed` for every kind-2 arm |
| 19 | `wasmEmit.vl:2930` | is not | UNDECIDED | needs a `?.` receiver resolving to a struct row lacking a field `vl check` accepted; every rung is name- or field-set-keyed. 9 spellings |
| 20 | `wasmEmit.vl:5980` | … but \<state\> | UNREACHABLE | five routes, each closed; every litunion spelling forces `aUsed`, measured with a module carrying no `StrLit` at all |
| 21 | `wasmEmit.vl:6269` | not supported | UNDECIDED | the i64 arm needs an `i64[]` annotation the checker then uses to reject the nested literal; the mixed-box escape is excluded by `arrLitBoxElem`. 11 candidates |
| 22 | `wasmEmit.vl:6570` | not supported | **LIVE** | a struct pinned into a generic's array literal — `generic-pin-struct-array-literal.vl` |
| 23 | `wasmEmit.vl:9238` | … but \<state\> | UNDECIDED | needs `exprNulStrArray` with `slUsed` false; every route reserves the rep. 8 spellings, two masked by a neighbouring site |
| 24 | `wasmEmit.vl:9291` | … but \<state\> | **LIVE** | a `.map` callback delivered as a parameter, f64 result — `map-callback-param-f64-result-index.vl` |
| 25 | `wasmEmit.vl:9315` | … but \<state\> | UNDECIDED | needs an `Index` receiver all five `scalarListElemKind` arms decline, in a module with no i32 list. 9 spellings |
| 26 | `wasmEmit.vl:9378` | is not | UNREACHABLE | `emitArrLen`'s one caller gates on an 8-way disjunction, every disjunct claimed by an earlier arm |
| 27 | `wasmEmit.vl:9872` | expected \<x\> | UNREACHABLE | `emitStrAccAppend`'s one caller gates on `strAccAppendOk`, whose body is character-for-character this conjunction |
| 28 | `wasmEmit.vl:10279` | bare `no` | UNREACHABLE | the caller's `cls == 4` is reachable only through `eqgElemHasEqRow(slot)`, and the floor's guard is its negation on the same slot |
| 29 | `wasmEmit.vl:10638` | has no \<thing\> | UNREACHABLE | `eqCoreKindOfBin`'s complete range leaves only −1 unhandled, and −1 needs a bare `NullLit` the checker refuses at every rep |
| 30 | `wasmEmit.vl:10776` | expected \<x\> | UNREACHABLE | `emitNulStructEq`'s one caller narrows `is BinExpr` on the index it passes |
| 31 | `wasmEmit.vl:11118` | … but \<state\> | UNREACHABLE | `collectA` sweeps the whole field tables and sets `aUsed` for exactly codes 3 and 20, twice, after every shape-interning pass |
| 32 | `wasmEmit.vl:11721` | is not | UNREACHABLE | `emitStrBytes`'s one caller gates on `exprIsStrBytes`, which requires `callFn is Member` on the same index |
| 33 | `wasmEmit.vl:12018` | requires / needs | **LIVE** | `print(if true { 1 })` — `if-expr-no-else-argument-position.vl` |
| 34 | `wasmEmit.vl:12061` | expected \<x\> | UNREACHABLE | both call sites of `emitIfExprAs` narrow `is IfStmt` on the index they pass |
| 35 | `wasmEmit.vl:13569` | cannot | UNDECIDED | needs a boxed union with a value-atom kind > 6 that `print` accepts; the checker refuses each at the direct spelling and every narrowing resolves the box away. 8 spellings |
| 36 | `wasmEmit.vl:13695` | requires / takes | UNREACHABLE | the seven load widths are declared at arity 1, redefinition is a check error, and every shadowing binder is what `identNameIsUserBound` reports. 8 dodges measured |
| 37 | `wasmEmit.vl:14117` | has no \<thing\> | **LIVE** | a union-taking closure through a generic's function-value parameter — `value-call-generic-union-param.vl` |
| 38 | `wasmEmit.vl:14140` | is not | **LIVE** | a union-ARM parameter given a struct-field read — `value-call-arm-param-struct-field-read.vl` |
| 39 | `wasmEmit.vl:14585` | … but \<state\> | **LIVE** | a `.map` callback bound to a `const`, i64 result, indexed assign — `map-callback-binding-i64-indexed-assign.vl` |
| 40 | `wasmEmit.vl:14801` | … but \<state\> | **LIVE** | an if-expression as a field-assignment target — `if-expr-as-field-assign-target.vl` |
| 41 | `wasmEmit.vl:16081` | … but \<state\> | **LIVE** | a `.map` with a ref-returning callback inside a generic — `generic-map-ref-result-over-scalar-list.vl` |
| 42 | `wasmEmit.vl:16231` | has no \<thing\> | UNREACHABLE | the guard runs only after `rlWidenVariantOf` accepted, which requires both slots inside a table of equal length |
| 43 | `wasmEmit.vl:16236` | has no \<thing\> | UNREACHABLE (shadowed) | the `if` one statement earlier tests the character-equivalent condition on tables grown as adjacent pushes |
| 44 | `wasmEmit.vl:16629` | … but \<state\> | UNDECIDED | reduces to `!lUsed` with an i32 `.map`/`.slice` receiver; every direct spelling forces it and the `.map`-result producer was not pinned |
| 45 | `wasmEmit.vl:18031` | is not | **LIVE** | `fs[0](3)` as a statement — `fn-value-call-statement-nonvoid.vl` |
| 46 | `wasmEmit.vl:18233` | must be | **LIVE** | `step -2147483648` — `for-range-step-min-i32.vl` |
| 47 | `wasmEmit.vl:21132` | … but \<state\> | **LIVE** | `__array_new__` with an i64 fill inside a generic — `generic-array-new-i64-fill-hidden-result.vl` |
| 48 | `wasmEmit.vl:22216` | is not | **LIVE** | a `.map` callback delivered as a parameter, struct result, `?.` read — `map-callback-param-struct-result-optchain.vl` |

**Tally: 21 LIVE · 20 UNREACHABLE · 7 UNDECIDED.**

## 4. The estimate

Sample `n = 48` from a frame of `N = 517`, nothing held out. UNDECIDED is the interval's width
rather than a verdict:

| quantity | value |
| --- | --- |
| live fraction, lower (all UNDECIDED unreachable) | 21/48 = **0.438**, Wilson 95% [0.307, 0.577] |
| live fraction, upper (all UNDECIDED live) | 28/48 = **0.583**, Wilson 95% [0.443, 0.712] |
| **LIVE sites among the 517 the wording count cannot see** | **≈ 226 – 302** (95% envelope 159 – 368) |
| as a share of the 517 | **44% – 58%** |
| plus, at most, the 16 the wording count does see | ≈ 226 – 318 of all 533 |

**UNDECIDED still leans one way, and the same way as in 2026-09-02's sample.** A ten-minute box
favours UNREACHABLE-by-argument, which a careful read can produce quickly, over LIVE, which needs
a program nobody has written. Five of the seven blockers are of the form "every route I found
sets the flag" — a statement about search effort, not about the compiler — and two of the seven
were *nearly* closed. The lower bound is soft upward.

**Two directions this could be wrong, both stated rather than corrected.** A site is not a
defect: the 21 LIVE sites are fewer than 21 mechanisms — four of them (rows 24, 39, 41, 48) are
one hole, `collectMapFilterUse` classifying a `.map` result only when the callback resolves to a
lifted function. And an UNREACHABLE verdict is an argument off the source, not a proof; three of
the twenty are "shadowed by a guard that fires first", which is a claim about `emitFail` keeping
the first message and would fall the day the neighbour is narrowed.

## 5. Durable output

**`scripts/capability-probes/live-sites.json` — 21 refusal literals, one probe each.** Nineteen
are new (the 19 LIVE sites whose witness is a program written for this measurement, minus one
whose literal was already listed) and three were already in the directory, refusing on today's
seed and matching no phrase: `ref valtype with no interned shape` (D1627), `function-value call
arity has no interned signature` (D1474), `monomorphize: unsupported argument type for`
(D1596). **All 21 are invisible to the wording count.**

    python3 scripts/capability-probes/run.py --live-sites   # re-grade every row
    deno test -A --no-check tests/vl_live_sites_test.ts     # the structural half, in ms

The list is a one-way ratchet. A row may only be added with a probe that exists and whose header
quotes the literal; a row comes off when its witness RUNS, in the PR that closed the gap.
`--live-sites` also reds on a witness that drifted onto another message, and on a literal that
has left `compiler/*.vl`.

The two fixture-proven LIVE sites (rows 8 and 14) get NO row: their witness is a `tests/cases`
`@emit-error` fixture, which is already gated, and duplicating it as a probe would make the list
double-count. **That is worth naming as a tension, not just an exclusion** — 51 `@emit-error`
directives PIN 34 emit-side refusal sites as expected behaviour, while under clause 2 every one
of them is a violation with a test defending it.

The probe runner moved **155 of 158 run · 3 refuse** → **155 of 180 run · 25 refuse**. Every new
GAP is a program the type system accepts and codegen will not build.

### Three clause-1 findings, verified — D1667, D1668, D1669

Found while hunting witnesses. Each is `vl check` rc 0 followed by an INVALID MODULE (exit 70),
each was re-run independently, and each has a probe and a filed row:

* **`?.` over a call through a function VALUE** — `unknown local 0: local index out of bounds`.
  `mk()?.y` runs, and `const t = g(); t?.y` runs; the inline call under `?.` through a value
  binding is the ingredient, and a struct-field closure receiver reproduces it.
  `optchain-over-fn-value-call-result.vl`, D1667.
* **An if-expression as an ARRAY-LITERAL element, beside a union declaration** — `type mismatch:
  expected i32, found (ref $type)`. Deleting the union makes it run. No `arrLitIsRef` rung claims
  an if-expression element, and `emitArr`'s own loud floor misses it the same way.
  `if-expr-array-element-beside-a-union.vl`, D1668.
* **`__array_new__` with an i64 fill, bound to a local and returned as `T[]` from a generic** —
  `type mismatch: expected i32, found (ref $type)` inside the instance. The i32 and f64 pins run,
  returning the call directly runs, and annotating the local runs.
  `generic-array-new-i64-fill-returned-list.vl`, D1669.

### Side-findings, not folded into the estimate

* A `{[string]: u8[]}` map value is a clause-2 refusal while `f32[]`, `i32[][]`, a closure list,
  a closure and a nested map all run.
* `.get receiver must be a named list binding` is LIVE on `xs.map(f).get(0)?.w ?? 0`.
* `emit_collect.vl:9630`'s sentence names `.filter`, and `.filter` provably cannot reach it —
  only a `.map` can. The message should say `.map`.
* Binding an if-expression over union arms is `ref valtype with no interned shape`; a union arm
  with a `{[string]: u8[]}` field is `map value type has no interned slot`; a union arm with an
  inline-shape field whose leaf is another union's arm is `nested-struct field element type is
  not interned`.

## Appendix — every unmatched template, grouped

Regenerate with `python3 scripts/emit-refusal-sites.py --full`. Line numbers are deliberately
omitted: they drift with every compiler edit, and the template is the unit that reaches a user.

### supports only / is supported as — 7 sites
* `emitProgram: `?.` chain supports only i32/boolean leaf fields`
* `emitProgram: `?.` over a list .get supports only i32/boolean fields`
* `emitProgram: `?.` over a map read supports only i32/boolean fields`
* `emitProgram: `as {}` is supported for a value-union arm or a struct-variant arm; this arm is neither — write the explicit `if x is {} { … }` ladder for it`
* `emitProgram: `as? {}` is supported for a value-atom arm, a struct-variant arm and a sub-union; this arm is none of those — write the explicit `if x is {} { … }` ladder for it`
* `emitProgram: a standalone `?.` supports only i32/boolean and string leaf fields — read it through `?? d` or a `!= null` guard`
* `emitProgram: an i32-keyed Map/Set is supported as a binding / parameter / return / `| null` / an ARRAY ELEMENT / a closure result — not inside '{}'. A STRING-keyed map lowers in every position; otherwise bind the i32-keyed map on its own and pass it where you need it.`

### has no rep / no representation — 2 sites
* `emitProgram: a nullable-{} list element has no rep; use a non-null element type`
* `emitProgram: a standalone `?.` has no rep for this result type — read it through `?? d` or a `!= null` guard`

### has no <thing> — 48 sites
* `emitProgram: `as? {}` has no value box — the `{} | null` row was never registered`
* `emitProgram: `is` over a literal union needs a re-readable receiver (each member re-reads it; a call / optional-chain receiver has no membership lowering)`
* `emitProgram: `{}` over this operand rep has no compare core`
* `emitProgram: a discriminant field of this storage has no membership compare`
* `emitProgram: an f32 has no null of its own`
* `emitProgram: an f32[] return must be annotated (`: f32[]`) — the inferred form has no result type`
* `emitProgram: an f64 has no null of its own`
* `emitProgram: an i32 has no null of its own`
* `emitProgram: an i64 has no null of its own`
* `emitProgram: captured call target has no interned signature`
* `emitProgram: extern import has no index or name — the manifest and its readers have drifted`
* `emitProgram: extern row has no arity — the manifest and its readers have drifted`
* `emitProgram: extern row has no name — the manifest and its count have drifted`
* `emitProgram: extern type `{}` has no wasm valtype — the checker's extern type set and this writer have drifted`
* `emitProgram: fs import is used but has no index or name — the slot tables have drifted`
* `emitProgram: fs import slot has no arity — the slot table and the arity table have drifted`
* `emitProgram: fs import slot has no name — the slot table and its count have drifted`
* `emitProgram: function has no block body`
* `emitProgram: function-value call arity has no interned signature`
* `emitProgram: map value slot has no minted map struct type`
* `emitProgram: map value slot has no resolved struct shape`
* `emitProgram: map value slot has no resolved vals backing`
* `emitProgram: map value slot has no resolved vals ref-list`
* `emitProgram: map value slot has no resolved vals wrapper`
* `emitProgram: map value type has no interned slot`
* `emitProgram: module global has no initializer`
* `emitProgram: monomorphize: `flat type {}` (bound to `{}`) has no field '{}' — its layout members are `.size` and one offset per declared field`
* `emitProgram: monomorphize: `{}` is bound to `{}`, which is not a `flat` type, so it has no byte layout`
* `emitProgram: narrowed ref-array arm has no reflist slot`
* `emitProgram: narrowed union atom has no value box`
* `emitProgram: narrowed union field atom has no value box`
* `emitProgram: narrowed union place ref-array arm has no reflist slot`
* `emitProgram: operator '{}' has no f32 form`
* `emitProgram: operator '{}' has no f64 form`
* `emitProgram: recursive generic type `{}` is not supported — its expansion has no finite type name`
* `emitProgram: ref-list widening slot has no interned backing`
* `emitProgram: ref-list widening slot has no interned wrapper`
* `emitProgram: scalar map read has no value-box type`
* `emitProgram: scalar|null map value has no value box`
* `emitProgram: union `==` atom has no value box`
* `emitProgram: union atom has no value box`
* `emitProgram: union call atom has no value box`
* `emitProgram: union field atom has no value box`
* `emitProgram: value-call union parameter has no resolvable union name`

### must be / must have — 15 sites
* `emitProgram: .get index must be a literal or a name`
* `emitProgram: .get receiver must be a named list binding`
* `emitProgram: for-range step must be a constant integer`
* `emitProgram: for-range step must be an i32 integer literal`
* `emitProgram: for-range step must not be zero`
* `emitProgram: map values must be i32 / boolean`
* `emitProgram: one un-annotated list literal is bound to TWO declared destinations whose elements are stored differently (a union-box element list and a plain-struct element list); a list value has one element storage, so annotate the literal at the type it must be, or build a second literal for the second destination`
* `emitProgram: union must have at least one variant`
* `emitProgram: {} receiver must be a local or struct field`
* `emitProgram: {} receiver must be a local, struct field, or index`

### only … supported / allowed — 5 sites
* `emitProgram: only an identifier assignment is a value expression`
* `emitProgram: only i32 locals are supported`
* `emitProgram: only i32[] arrays and struct/union element arrays are supported`

### unsupported <noun> — 18 sites
* `emitNullForRet: unsupported nullable return rep`
* `emitProgram: array value does not match any array member of the union (leaf-scalar widening across a nested array is unsupported)`
* `emitProgram: binding's inline-shape type has an unsupported field`
* `emitProgram: monomorphize: unsupported argument type for `{}` in a call to `{}``
* `emitProgram: unsupported .map/.filter callback`
* `emitProgram: unsupported .map/.filter element type`
* `emitProgram: unsupported binary operator`
* `emitProgram: unsupported expression`
* `emitProgram: unsupported for-in iterable`
* `emitProgram: unsupported map value type (no rep for a union-member struct, a nullable list over an unnamed element rep, or a nullable litunion-result closure; any other value type here interned no mv slot)`
* `emitProgram: unsupported statement in body`
* `emitProgram: unsupported struct field type in equality`
* `emitProgram: unsupported unary operator`
* `emitProgram: unsupported variant field type in equality`

### not supported / not a supported — 16 sites
* `emitProgram: .map/.filter receiver is not a supported list`
* `emitProgram: .slice receiver is not a supported list`
* `emitProgram: a closure-array struct-field literal is not supported`
* `emitProgram: a map union member is not supported — use a struct member instead`
* `emitProgram: a map value is not a supported union member — use a struct member instead`
* `emitProgram: list concat over this element kind is not supported`
* `emitProgram: map array elements are not supported in this position`
* `emitProgram: nested arrays are not supported`
* `emitProgram: nested struct fields are not supported`
* `emitProgram: struct array elements are not supported`
* `emitProgram: union-arm array elements are not supported in this position`

### cannot — 4 sites
* `emitProgram: a multi-field struct value from a call cannot be boxed into a variant-box union (rebox scratch slot unreserved)`
* `emitProgram: print of a union value whose arms the tag dispatch cannot classify`
* `emitProgram: union `{}` cannot be discriminated — variants `{}` and `{}` have the same field names but different field types`
* `emitProgram: union field read stored at an atom the checker's atom cannot be recovered from`

### unknown / unresolved / not found — 12 sites
* `emitProgram: call to unknown function`
* `emitProgram: captured variable not found in enclosing frame`
* `emitProgram: union variant names an unknown struct type`
* `emitProgram: unknown pass in the pass table: {}`
* `emitProgram: unknown struct field in field assignment`
* `emitProgram: unknown variant field in field access`
* `emitProgram: unknown variant field in field assignment`
* `emitProgram: unknown variant field in narrowed field access`
* `emitProgram: unknown variant field in narrowed field assignment`
* `{}unknown struct field in field access{}`

### not interned / no slot / no index — 7 sites
* `emitProgram: .map/.filter callback signature is not interned`
* `emitProgram: nested-struct field element type is not interned`
* `emitProgram: nullable ref-list field element type is not interned`
* `emitProgram: ref {} element heap not interned`
* `emitProgram: ref-list field element type is not interned`

### out of range / overflow / too long — 3 sites
* `emitProgram: float literal overflows f32: {}`
* `emitProgram: float literal overflows f64: {}`
* `emitProgram: u8 array literal is too long for one array.new_fixed`

### expected <x> — 46 sites
* `emitProgram: __array_copy__ expects list (T[]) operands`
* `emitProgram: emitArrayCopyIntr expected an __array_copy__ call`
* `emitProgram: emitArrayNewIntr expected an __array_new__ call`
* `emitProgram: expected a .clear call`
* `emitProgram: expected a .map/.filter call`
* `emitProgram: expected a .pop or .get call`
* `emitProgram: expected a .push call`
* `emitProgram: expected a `==`/`!=` for the compare core`
* `emitProgram: expected a `==`/`!=` over a nullable niche`
* `emitProgram: expected a call expression`
* `emitProgram: expected a field access`
* `emitProgram: expected a length access`
* `emitProgram: expected a list .get call`
* `emitProgram: expected a list .pop call`
* `emitProgram: expected a nullable-struct equality`
* `emitProgram: expected a string accumulator append`
* `emitProgram: expected a string bytes call`
* `emitProgram: expected a string charCodeAt call`
* `emitProgram: expected a string concatenation`
* `emitProgram: expected a string cpAt call`
* `emitProgram: expected a string cpLen call`
* `emitProgram: expected a string equality`
* `emitProgram: expected a string indexOf call`
* `emitProgram: expected a string isCharBoundary call`
* `emitProgram: expected a string literal`
* `emitProgram: expected a string ordering`
* `emitProgram: expected a string ordering operator`
* `emitProgram: expected a string slice call`
* `emitProgram: expected a struct equality`
* `emitProgram: expected a union if-expression`
* `emitProgram: expected a variant if-expression`
* `emitProgram: expected an `is` expression`
* `emitProgram: expected an array literal`
* `emitProgram: expected an array slice call`
* `emitProgram: expected an assignment expression`
* `emitProgram: expected an if expression`
* `emitProgram: expected an index access`
* `emitProgram: expected an object literal`
* `emitProgram: expected an optional-chain member access`
* `emitProgram: monomorphize: expected an array argument for `{}` in a call to `{}``

### missing / empty — 11 sites
* `emitProgram: empty arena (root index < 0)`
* `emitProgram: empty block in tail position`
* `emitProgram: empty struct alias shape`
* `emitProgram: missing expression`
* `emitProgram: missing local initializer expression`
* `emitProgram: missing statement`
* `emitProgram: object literal is missing a struct field`
* `emitProgram: object literal is missing a union-variant field`
* `emitProgram: struct value is missing a union-variant field`
* `emitProgram: {} is empty, so it yields no value`

### requires / needs / takes — 45 sites
* `emitProgram: .delete takes exactly one argument`
* `emitProgram: .get takes exactly one argument`
* `emitProgram: .has takes exactly one argument`
* `emitProgram: .map/.filter takes exactly one callback argument`
* `emitProgram: .push takes exactly one argument`
* `emitProgram: __array_copy__ takes exactly five arguments`
* `emitProgram: __load_i32__ takes exactly one argument`
* `emitProgram: __log__ takes exactly two arguments`
* `emitProgram: __memory_grow__ takes exactly one argument (the page count to add)`
* `emitProgram: __store_i32__ takes exactly two arguments`
* `emitProgram: __trap__ takes an optional string message`
* `emitProgram: `?.` needs a re-readable receiver (a name, or a field chain of names)`
* `emitProgram: `?.` needs a struct-valued map`
* `emitProgram: `??` over an atom-valued map needs a member-literal (or atom) default`
* `emitProgram: `as {}` needs a BOXED union operand — a niche-repped one carries no tag to test`
* `emitProgram: a ref-element list op needs its receiver's element type known before the body is lowered; a union arm narrowed to a ref-element list is not yet reached by that pass`
* `emitProgram: bare null needs a struct-typed context`
* `emitProgram: extern {} takes exactly {} argument(s), got {}`
* `emitProgram: fromCodePoint takes exactly one argument`
* `emitProgram: fromCodePoints takes exactly one argument`
* `emitProgram: if-expression requires an else arm`
* `emitProgram: literal-union atom narrowing needs a re-readable receiver`
* `emitProgram: literal-union atom narrowing needs a staging slot that was not reserved`
* `emitProgram: local declaration needs an initializer`
* `emitProgram: map .get takes exactly one argument`
* `emitProgram: map delete takes exactly one argument`
* `emitProgram: map set takes exactly two arguments`
* `emitProgram: monomorphize: `{}.{}` needs `{}` bound by a parameter — a layout constant is per-instance`
* `emitProgram: monomorphize: wrong number of arguments calling `{}``
* `emitProgram: print takes exactly one argument`
* `emitProgram: set add takes exactly one argument`
* `emitProgram: string .charCodeAt takes exactly one argument`
* `emitProgram: string .cpAt takes exactly one argument`
* `emitProgram: string .indexOf takes exactly one argument`
* `emitProgram: string .isCharBoundary takes exactly one argument`
* `emitProgram: string .slice takes exactly two arguments (start, end)`
* `emitProgram: union if-expression requires an else arm`
* `emitProgram: {} takes at least one argument`
* `emitProgram: {} takes exactly one argument`
* `emitProgram: {} takes exactly one argument (the byte address)`
* `emitProgram: {} takes exactly three arguments (the byte count is the last)`
* `emitProgram: {} takes exactly two arguments (the byte address and the value)`
* `emitProgram: {} takes exactly {} argument(s)`
* `emitProgram: {} takes exactly {} argument(s), got {}`

### is not / are not / does not — 76 sites
* `emitNullForRet: not a function`
* `emitProgram: .clear receiver is not a list`
* `emitProgram: .get receiver is not a scalar list`
* `emitProgram: .keys() receiver is not a map`
* `emitProgram: .length receiver is not an array or string`
* `emitProgram: .push receiver is not a list`
* `emitProgram: .slice receiver is not a member access`
* `emitProgram: .values() receiver is not a map`
* `emitProgram: `?.` field is not on the list's element struct`
* `emitProgram: `?.` field is not on the map's value struct`
* `emitProgram: `?.` field is not on the struct`
* `emitProgram: `?.` receiver is not a struct chain`
* `emitProgram: `?.` yields a nullable scalar but its union box was not collected`
* `emitProgram: `?.` yields a nullable string but the string array type was not collected`
* `emitProgram: `break` label does not name an enclosing loop`
* `emitProgram: `continue` label does not name an enclosing loop`
* `emitProgram: `is` names a type that is not a union variant`
* `emitProgram: `is` receiver is not a union value`
* `emitProgram: a function-value call statement yields a value the tail-value ladder did not claim`
* `emitProgram: assignTags: union `{}` gives `{}` and `{}` one tag while their literal discriminant at field `{}` is laid out two ways — `unifyMixedLitRepArms` re-lays a mixed pair onto one rep and did not reach this one, so this is a compiler bug rather than something to change in the program`
* `emitProgram: assignment target is not a parameter, local, or global`
* `emitProgram: assignment target is not a simple name`
* `emitProgram: callee is not a function name`
* `emitProgram: collectLocalsIf: not an if statement`
* `emitProgram: emitIfTail: not an if statement`
* `emitProgram: field-assignment receiver is not a struct`
* `emitProgram: i32-keyed map but its map struct was not collected`
* `emitProgram: identifier is not a parameter, local, or global`
* `emitProgram: if-expression arm is not a block`
* `emitProgram: if-expression arm is not a value`
* `emitProgram: index receiver is not an array or string`
* `emitProgram: indexed-assignment target is not an array`
* `emitProgram: list compare frame was not reserved for this rep`
* `emitProgram: list concat frame was not reserved for this rep`
* `emitProgram: local type is not a type name`
* `emitProgram: map key is not a string`
* `emitProgram: map op receiver is not a map`
* `emitProgram: monomorphize: a return type parameter of `{}` is not bound by any parameter`
* `emitProgram: monomorphize: pin type column is not parallel to the pins`
* `emitProgram: named argument does not match a parameter`
* `emitProgram: narrowed union binding is not a local or global`
* `emitProgram: non-ASCII name is not encodable: {}`
* `emitProgram: not a function declaration`
* `emitProgram: not a local declaration`
* `emitProgram: object literal field count does not match struct`
* `emitProgram: parameter type is not a type name`
* `emitProgram: root node is not a Program`
* `emitProgram: string .bytes receiver is not a member access`
* `emitProgram: string .charCodeAt receiver is not a member access`
* `emitProgram: string .cpAt receiver is not a member access`
* `emitProgram: string .cpLen receiver is not a member access`
* `emitProgram: string .indexOf receiver is not a member access`
* `emitProgram: string .isCharBoundary receiver is not a member access`
* `emitProgram: string .slice receiver is not a member access`
* `emitProgram: this list read yields a nullable scalar but its value box was not collected`
* `emitProgram: union if-expression arm is not a block`
* `emitProgram: union-valued map read binding's init is not an index read`
* `emitProgram: value-call union-ARM parameter given a value that is not that arm — a value call does not yet build one (annotate the binding as the arm, or call it as a named function)`
* `emitProgram: value-union closure RESULT is not yet representable`
* `emitProgram: variant if-expression arm is not a block`
* `emitProgram: {} receiver is not a list`
* `emitProgram: {} receiver is not a list local`
* `emitProgram: {} takes a u8[] but the u8 list type was not collected`
* `{}field access receiver is not a struct{}`

### … but <state> (internal invariant) — 109 sites
* `emitProgram: '{}' is called but no import was reserved for it — the use scan and the call lowering have drifted`
* `emitProgram: .clear but list type not collected`
* `emitProgram: .filter result is a ref list but ref list type not collected`
* `emitProgram: .filter result is u8[] but the packed byte list type not collected`
* `emitProgram: .get but list type not collected`
* `emitProgram: .keys() but string list type not collected`
* `emitProgram: .map result is f32[] but f32 list type not collected`
* `emitProgram: .map result is f64[] but f64 list type not collected`
* `emitProgram: .map result is i64[] but i64 list type not collected`
* `emitProgram: .map/.filter but list type not collected`
* `emitProgram: .map/.filter over a ref list but ref list type not collected`
* `emitProgram: .map/.filter over f32[] but f32 list type not collected`
* `emitProgram: .map/.filter over f64[] but f64 list type not collected`
* `emitProgram: .map/.filter over i64[] but i64 list type not collected`
* `emitProgram: .map/.filter over string[] but string list type not collected`
* `emitProgram: .map/.filter over u8[] but the packed byte list type not collected`
* `emitProgram: .map/.filter result but list type not collected`
* `emitProgram: .map/.filter result is string[] but string list type not collected`
* `emitProgram: .pop but list type not collected`
* `emitProgram: .push but list type not collected`
* `emitProgram: .slice but list type not collected`
* `emitProgram: .slice over a ref list but ref list type not collected`
* `emitProgram: .slice over f32[] but f32 list type not collected`
* `emitProgram: .slice over f64[] but f64 list type not collected`
* `emitProgram: .slice over i64[] but i64 list type not collected`
* `emitProgram: .slice over string[] but string list type not collected`
* `emitProgram: .slice over u8[] but the packed byte list type not collected`
* `emitProgram: Map() but map type not collected`
* `emitProgram: __array_copy__ f64 lists but f64 list types not collected`
* `emitProgram: __array_new__ f64 fill but f64 list types not collected`
* `emitProgram: __array_new__ i64 fill but i64 list types not collected`
* `emitProgram: __array_new__ string fill but string list types not collected`
* `emitProgram: __array_new__ struct fill but ref list types not collected`
* `emitProgram: __array_new_default__ f32 element but f32 list types not collected`
* `emitProgram: __array_new_default__ u8 element but u8 list types not collected`
* `emitProgram: `is` test but no union type declared`
* `emitProgram: array intrinsic but list types not collected`
* `emitProgram: array literal but list type not collected`
* `emitProgram: discriminant string test but array type not collected`
* `emitProgram: extern '{}' is called but no import was reserved for it — the manifest and the call lowering have drifted`
* `emitProgram: f32 .push but f32 list type not collected`
* `emitProgram: f32 array literal but f32 list type not collected`
* `emitProgram: f32 indexed assignment but f32 list type not collected`
* `emitProgram: f64 .push but f64 list type not collected`
* `emitProgram: f64 array literal but f64 list type not collected`
* `emitProgram: f64 indexed assignment but f64 list type not collected`
* `emitProgram: field assignment but no struct type declared`
* `emitProgram: fromCodePoint but array type not collected`
* `emitProgram: fromCodePoints but array/list types not collected`
* `emitProgram: i32[] field equality but list type not collected`
* `emitProgram: i64 .push but i64 list type not collected`
* `emitProgram: i64 array literal but i64 list type not collected`
* `emitProgram: i64 indexed assignment but i64 list type not collected`
* `emitProgram: index access but array type not collected`
* `emitProgram: index access but list type not collected`
* `emitProgram: indexed assignment but list type not collected`
* `emitProgram: literal-union atom narrowing but array type not collected`
* `emitProgram: literal-union string widening but array type not collected`
* `emitProgram: map op but map type not collected`
* `emitProgram: narrowed string union field read but array type not collected`
* `emitProgram: object literal but no struct type declared`
* `emitProgram: print of a union with a string arm but no string scratch frame`
* `emitProgram: print of a union with an f32 arm but no __print_f32__ import`
* `emitProgram: print of a union with an f64 arm but no __print_f64__ import`
* `emitProgram: print of a union with an i64 arm but no __print_i64__ import`
* `emitProgram: ref .clear but ref list type not collected`
* `emitProgram: ref .push but ref list type not collected`
* `emitProgram: ref array literal but ref list type not collected`
* `emitProgram: ref index access but ref array type not collected`
* `emitProgram: ref indexed assignment but ref list type not collected`
* `emitProgram: ref {} but ref list type not collected`
* `emitProgram: string .clear but string list type not collected`
* `emitProgram: string .push but string list type not collected`
* `emitProgram: string `is` test but array type not collected`
* `emitProgram: string array literal but string list type not collected`
* `emitProgram: string bytes() but the packed byte-list types were not collected`
* `emitProgram: string charCodeAt but array type not collected`
* `emitProgram: string concat but array type not collected`
* `emitProgram: string cpAt but array type not collected`
* `emitProgram: string cpLen but array type not collected`
* `emitProgram: string equality but array type not collected`
* `emitProgram: string field equality but array type not collected`
* `emitProgram: string index access but string list type not collected`
* `emitProgram: string indexOf but array type not collected`
* `emitProgram: string indexed assignment but string list type not collected`
* `emitProgram: string isCharBoundary but array type not collected`
* `emitProgram: string literal but array type not collected`
* `emitProgram: string ordering but array type not collected`
* `emitProgram: string slice but array type not collected`
* `emitProgram: string {} but string list type not collected`
* `emitProgram: the union-variant field-span tables do not cover every variant — {} variants but {} field starts / {} field counts`
* `emitProgram: this program exports a function named 'memory', but a program that uses linear memory exports the memory itself under that name — rename the function`
* `emitProgram: u8 .push but u8 list type not collected`
* `emitProgram: u8 array literal but u8 list type not collected`
* `emitProgram: u8 for-in but u8 list type not collected`
* `emitProgram: u8 indexed assignment but u8 list type not collected`
* `emitProgram: union string `==` but array type not collected`
* `emitProgram: union-valued map read but no mv slot resolved`
* `emitProgram: {} but list type not collected`
* `emitProgram: {}: union-variant {} is outside the parallel field-span tables — {} variants but {} field starts / {} field counts / {} field names / {} field types`
* `{}field access but no struct type declared{}`

### bare `no <noun>` — 46 sites
* `emitProgram: '{}' is a declared load width with no opcode — the intrinsic-name list and the opcode table have drifted`
* `emitProgram: '{}' is a declared store width with no opcode — the intrinsic-name list and the opcode table have drifted`
* `emitProgram: .clear takes no arguments`
* `emitProgram: .keys() takes no arguments`
* `emitProgram: .pop takes no arguments`
* `emitProgram: .values() takes no arguments`
* `emitProgram: __array_new__ fill names no element rep, and its destination names none either`
* `emitProgram: __memory_size__ takes no arguments`
* `emitProgram: `?.` over a nested-struct field names no struct row`
* `emitProgram: `?.` yields a nullable struct whose field names no struct row`
* `emitProgram: `as {}` names no union arm this cast can test`
* `emitProgram: `as? {}` names a variant with no interned shape`
* `emitProgram: `is` names a declared union member with no interned arm representation (deferred value-union composition)`
* `emitProgram: a discriminant field with no literal members`
* `emitProgram: a float '%' reached the emitter with no __f64_rem__ helper reserved`
* `emitProgram: discriminant test on an arm with no heap type`
* `emitProgram: function value with no lifted function`
* `emitProgram: list compare over an element rep with no core`
* `emitProgram: literal `is` over a union with no arm of the literal's rep`
* `emitProgram: literal `is` over a union with no recorded members`
* `emitProgram: literal-union atom narrowing with no members`
* `emitProgram: literal-union string widening with no members`
* `emitProgram: narrowed field-assignment receiver names no variant`
* `emitProgram: narrowed receiver names no union variant`
* `emitProgram: nested struct field equality with no interned shape`
* `emitProgram: object literal matches no union variant`
* `emitProgram: print of a literal-union atom whose type carries no member texts`
* `emitProgram: print of a union arm with no scalar sink`
* `emitProgram: ref array literal with no interned element type`
* `emitProgram: ref null with no interned shape`
* `emitProgram: ref valtype with no interned shape`
* `emitProgram: ref-list widening asked for an element pair with no union arm`
* `emitProgram: ref.null with no interned shape`
* `emitProgram: scalar-list widening asked for an element pair with no convert`
* `emitProgram: string .bytes takes no arguments`
* `emitProgram: string .cpLen takes no arguments`
* `emitProgram: struct-element compare with no interned shape`
* `emitProgram: struct-element compare with no stashed root`
* `emitProgram: the exported generic function `{}` is never instantiated, so there is no concrete signature to export (a wasm export names one functype and `{}` names none) — call it in this module, or export a concrete wrapper`
* `emitProgram: union box atom test on a union with no recorded members: {}`
* `emitProgram: {} ends in a statement, which yields no value`
* `emitProgram: {} ends in a void call, which yields no value`

### whole message from a helper — 7 sites
* `{}`

### other — 40 sites
* `emitProgram: .keys() scratch frame not reserved`
* `emitProgram: .map/.filter scratch frame not reserved`
* `emitProgram: .slice scratch frame not reserved`
* `emitProgram: .values() scratch frame not reserved`
* `emitProgram: __array_copy__ dst and src must share one element type`
* `emitProgram: __array_copy__ supports i32/boolean/f64 lists natively`
* `emitProgram: `?.` over a nullable struct has no `if` blocktype for this field's rep`
* `emitProgram: `as% {}` wraps a number, and this operand is a union — take the numeric arm first`
* `emitProgram: `as% {}` wraps between integer widths, and this cast names a float — use `as!` or `as?``
* `emitProgram: `break` outside a loop`
* `emitProgram: `continue` outside a loop`
* `emitProgram: a bare `return` in a function the emitter classified non-void — the checker owed this diagnosis`
* `emitProgram: a call statement's callee is neither a name, a member, nor a function value`
* `emitProgram: a lambda field value resolved to a non-closure field slot`
* `emitProgram: a lambda field value resolved to a non-closure variant field slot`
* `emitProgram: an if-expression arm that declares a local is supported only as a binding initializer inside a function`
* `emitProgram: char literal must denote exactly one code point`
* `emitProgram: closure ref-list result element twin (deferred value-ABI composition)`
* `emitProgram: emitDiscrimFieldEq: field {} is outside union-variant {}'s {} fields`
* `emitProgram: function literal not lifted`
* `emitProgram: i32-keyed map indexed with a string key`
* `emitProgram: malformed inline union-variant shape`
* `emitProgram: malformed parameter`
* `emitProgram: malformed struct field`
* `emitProgram: malformed union-variant field`
* `emitProgram: map-value layout twins resolved different vals wrappers`
* `emitProgram: named arguments require a declared function`
* `emitProgram: only i32, i64, f64, f32, boolean, struct, union, array, or string parameters are supported`
* `emitProgram: parameter `{}` still names an unsubstituted type parameter — a lambda declared inside a generic body keeps the enclosing `T`, so its signature is interned at the unsubstituted type; give the lambda a concrete parameter type or take the value from the enclosing scope`
* `emitProgram: pass {} ran before a prerequisite (pass table reordered)`
* `emitProgram: promoted top-level binding read outside the top-level statement list`
* `emitProgram: promoted top-level binding written outside the top-level statement list`
* `emitProgram: ref-list compare frame not reserved`
* `emitProgram: struct equality over a non-struct operand`
* `emitProgram: the locals vector desyncs from the frame layout at the {} frame — `fbBeginFunc` reserved a different slot count than `fbEmitLocalsVec` declared`
* `emitProgram: the reassigned function binding `{}` is called at more than one argument type — one binding holds one closure signature, and the values written to it want two. Annotate the parameters, or bind a separate value per type`
* `emitProgram: the two operands of this list `+` do not resolve to one list rep`
* `emitProgram: the two operands of this list `{}` do not resolve to one comparable list rep`

