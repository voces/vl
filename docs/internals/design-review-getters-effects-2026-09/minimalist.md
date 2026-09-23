# Minimalist review: getters, the checked contract, the budget, pragmas, `pure`, effects

**Persona.** I review in the Go / Lua / Zig tradition. A feature pays for itself in four places:
the spec, the compiler, the docs, and every reader's head. I want one obvious way to do each
thing. Special cases, knobs (budgets, severities, suppression markers) and "contextual" keywords
all look free when they are proposed and cost something forever after. My test for a mechanism is
what it lets you *delete*. "It solves one caller's problem" does not pass that test.

Probes are in `persona-review/minimalist/p*.vl`. All were run with `dist/vl` at `31ea77721`
(master, getters v1 and std:simd's `get x/y/z/w` included). The outcomes I cite are quoted.

---

## The weight on the scale

The feature being weighed saves two characters: `v.x` instead of `v.x()`. property-access §A2
measures zero performance difference at `-O`/`-O3`, and the doc says so itself: "a getter is not
a performance feature in VL". Here is what the language carries to buy those two characters,
counting built work plus what is ruled or proposed:

- a declaration keyword (`get`, contextual) and a fourth member-lookup rung;
- a checked body contract: a 6-row refusal table, a rep-type rule, an intrinsic allow-list and an
  operator cost list. The user guide needs ~25 lines for this alone;
- (ruled) constant-range loops, a named budget of **64**, transitive through calls, plus
  sub-rulings I13 (which consts count) and I15 (format-bounded helpers count 0);
- (proposed) a per-site suppression pragma, a std-vs-user severity split, a `readonly` bound
  form, a `pure` keyword, a 10-fact effect summary, and `std-effects-baseline.json` to police it.

A reader who meets `v.x` must now know whether `V` is a getter type. That was not true last week,
when every `.` on a value was a load (§A1). Everything below comes back to this question: does
each of these pieces pay for its share of those two characters?

---

## Q1. A hard error, or warning + std-only error + `// vl-allow getter-cost`?

**Verdict: keep it a hard error. Reject the lint-plus-pragma proposal outright.**

The proposal replaces one rule with three mechanisms:
1. a lint;
2. a severity that depends on *which directory the file is in*, which makes std a dialect;
3. VL's **first per-site suppression syntax**.

The third is the expensive one, and it would arrive through the side door. VL today has `_`
prefixes, a global `--severity` floor and `--exclude`. None of them is a comment that changes
what the compiler says. Once `// vl-allow X` exists for one lint, every lint author will ask for
it (Go's `//nolint` is not a language feature and has still become a culture of its own; ESLint's
`eslint-disable` accounts for a large share of real-world config). Adding suppression is a
language-wide decision, and it deserves its own ruling. It should not ride in on getters.

The deeper problem is that a suppressible contract guarantees nothing. §E2's argument for the
contract is that "a guideline nothing checks would not survive the first user getter that
allocates", and the plumb/veldt/sunsuz consumers need "`.` is cheap" to be *true*. A warning with
a pragma is exactly a guideline nothing checks, plus syntax. If the guarantee is not worth an
error, it is not worth a lint either: delete the contract and put one sentence in the guide, the
way C# and Python do. **Hard error, or nothing. The middle option is the worst of the three.**

"VL refuses nothing else purely for performance" is true, but it misframes the rule. The rule is
not a performance rule. It is the definition of what the `get` form *is*: "straight-line code
over `self`". Zig refuses hidden control flow on the same grounds, and nobody calls that a
performance lint. The lack of precedent is fine. The contract has no precedent because no other
language made a getter a *different kind of thing* from a method, and VL did.

## Q2. Constant-bounded loops, budget 64, transitive

**Verdict: disagree. Un-rule the loop amendment and keep v1 "loop-free".**

The invariant ("worst-case cost computable at compile time, never data-dependent") is a sound
stopping rule for *which category* of loop gets in. It is **not** a stopping rule for complexity.
The budget is a knob, and the doc already expects it to move ("only the budget number may
change"). Precedent for this path is exact:

- **C++ `constexpr`**: C++11 allowed one `return`; C++14 added loops; C++20 added transient
  allocation; C++23 relaxed "no constant path". Each step was "relax only", and each was
  reasonable. The endpoint is that `constexpr` means very little.
- **Rust `const fn`**: loops arrived in 1.46, and the list of permitted features has grown in
  nearly every release since.
- **Zig `@setEvalBranchQuota`**: this is a budget knob, and users bump it constantly. A budget
  invites the "just raise it" PR.

The amendment has already generated I13 (which consts?), I15 (helpers count 0, a number nobody
can see), a transitive sum formula, and a std baseline file that records bounds *as numbers* so
that a std edit cannot push a user getter over 64. That last point is the tell. **A transitive
budget makes a user getter's acceptance depend on the body of a function in another module.** The
effects doc's own principle says acceptance "must be local and stable". v1's closed call set
(intrinsics plus getters, no loops) is local: every getter is Bounded(0), and sums of zeros never
cross a budget.

And **the amendment's own motivating example does not compile, inside a getter or outside one**.
§D3a-contract gives "a four-lane reduction written as `for i in 0 until 4`" as the tier-2 case.
The loop variable is `i32`:

```
p13.vl  for i in 0 until 4 { s = s + v.lane(i) }
        → argument 1: expected Lane4, got i32
p11.vl  for i in 0 until 4 { s = s + __extract_lane_f32x4__(v as! v128, i) }
        → __extract_lane_f32x4__ requires a compile-time lane index literal in 0..3
```

std already exports `reduceAddF32x4`. The only loop that could fit is a byte loop over linear
memory (`__load_u8__(base + i)` four times), and writing that out by hand costs four lines. **So
the rule was made with no consumer that runs.** Revert it to "loop-free". If a real getter ever
needs a loop, that getter is the evidence, and by my reading it should be a method.

## Q3. Setters narrowed to "none on value types"?

**Verdict: agree with F7 as ruled ("none"). Do not narrow it.**

"Setters on reference-backed brands, not on value-backed ones" makes the legality of `v.x = 1`
depend on the receiver's *representation*. The effects doc rejects exactly that kind of
acceptance rule in §C3 ("neither local nor stable"). It is also CS1612 reintroduced, as a
per-type rule the reader has to remember. Besides, a reference-backed brand over a struct
**already has writable fields** (§A3). The case where a setter would add something, a
*validating* write, is a method: `v.setX(1)`. One way to assign (to a field), one way to run
code (a call). Nim needed special `` `x=` `` syntax for setters, and nobody misses it in Go.

## Q4. Should getters satisfy a read-only structural contract `{readonly x: f32}`?

**Verdict: not now, and never through witness tables. Build `{readonly x}` only if `readonly`
fields earn it on their own.**

Witness tables or adaptors at non-specialised positions would be a **second dispatch mechanism**
in a language whose whole emitter assumes monomorphization. That is weeks of work, and it creates
a positional split: works in a generic, fails in a list. That split is the defect class this repo
spends most of its effort on. The only honest reason to add the bound is `readonly` *fields*
(F6), which the §A5 / G2 view hole needs anyway. If that lands, `{readonly x: T}` means
"readable, never written" for fields; admitting getters at specialised positions is then one
extra rung, and a loud refusal at the direct spelling everywhere else.

What should be done *now* is to face the cost honestly. **Today a getter satisfies nothing at
all**, and the guide's workaround is wrong (Finding 1).

## Q5. Is getter-eligible rightly not `pure`?

**Verdict: agree on the distinction, and question whether `pure` exists yet.**

The two predicates really are different: a getter reads mutable receiver state and linear
memory, and a `pure` function may loop and allocate. Using one word for both would be worse. My
objection is to the *second* word. Nothing that is built reads `pure`: compile-time evaluation,
parallel workers and F-C are all unbuilt. The only proposed consumer, the std boundary, is also
covered by the std baseline file (I8(b)). **Two mechanisms guard one boundary.** Keep one: the
baseline, which needs no syntax. Reserve `pure` as a word (as E2 already does) and build it with
its first real consumer (concurrency step 6). A keyword with no reader is exactly the
"speculative" that the std rubric is supposed to catch.

## Q6. The effect summary

**Verdict: the analysis is designed with care, and most of it is speculative. Build only the
facts a *built* consumer reads.**

The summary has W, R.let, R.heap[param|const], R.mem, H(+S), X, A, B (a number), T and U: ten
facts plus five derived predicates, an operator cost table, a freshness rule, hover output,
chain diagnostics and a baseline file. Here are its consumers, graded by whether they exist:

| consumer | built? | what it needs |
| --- | --- | --- |
| getter check | yes, as a syntactic walk that already works | nothing more under v1 |
| D1510 reorder | yes, but the doc: "**not the reason to build this**" (14 of 82 literals, 272 bytes) | effect-free + terminating |
| hoisting | no. binaryen's `--generate-global-effects --licm` exist and were **never measured** | nothing on the VL side, first |
| compile-time eval | no | `pure` |
| concurrency §4/§5 | no | H/S, W, reads |
| `U` | no exceptions | nothing ("reserved") |
| `T` | "optimizer-only", with no VL optimizer | nothing |

**Recommended smallest version:** (1) measure binaryen's two flags in the release profile. That
is zero VL lines, and it may settle hoisting. (2) Defer the summary until concurrency step 6.
When it is built, start from **three** facts, `effect-free`, `allocates` and `terminating`, and
add a fact when a consumer that reads it lands. Do not reserve `U` and `T` slots now. A slot with
no reader is a field nothing reads, the same thing CLAUDE.md forbids in corpus files ("Do not add
a field nothing reads").

One structural worry: a single summary that serves both acceptance (it must be local and stable)
and optimization (it may be global) is one data structure with two semantics. F-B already has to
say "allowed here, forbidden there". Every future fact must then be sorted into the right half.
Keep them apart.

On function values: (A) pessimistic is right and costs nothing. Nim's rule (A+) is the best idea
in the doc, because it needs no syntax. Reserving `pure` in *type* position is fine, since
reserving costs nothing.

---

## Findings beyond Q1–Q6 (ranked)

### 1. A getter is strictly less composable than the method it replaces, and the guide's workaround is false

`type Color = new i32` with the same body, spelled two ways:

| use | `function r(self: Color)`, called `c.r()` | `get r(self: Color)`, read `c.r` |
| --- | --- | --- |
| un-annotated `function f(a) { a.r… }` | runs (p7: `18`) | `expected {r: _}, got Color` (p5) |
| bound `<T: { r(): i32 }>` | runs (p7) | `Color does not satisfy {r():i32}` (p1) |
| bound `<T: { r: i32 }>` | n/a | `Color does not satisfy {r:i32}` (p2) |
| function value `cs.map(r)` | runs (p7) | `undeclared identifier 'r'` (p4) |
| lambda `cs.map((k) => k.r…)` | (not probed) | runs (p8) |

`docs/guide/getters.md` says: "Generic code that wants 'anything with a readable `x`' asks for
the method `{ x(): f32 }` instead." **p1 shows the getter type does not satisfy that bound.** A
getter drops its type out of every generic mechanism VL has. The only way to compose one is to
wrap it in a lambda. Choosing `get` over `function` is therefore a choice with a large, unpriced
cost, and std's `x/y/z/w` have already made it for good. At minimum, fix the guide sentence
(it is the §G3 message defect again, in the guide). Also state the tax plainly: a getter is for
concrete code only.

p1's refusal message repeats G3's false fix: "the bound needs a field of that type or a
`r(self: Color, …)` function in scope". A getter is neither of those, and the message does not
name the getter.

### 2. Inferred parameters cannot reach type-bound members, getter or method

```
p14.vl  import { F32x4, f32x4 } from "std:simd"
        function hx(v) { return v.x }        → expected {x: _}, got F32x4
        function hl(v) { return v.lane(1) }  → expected {lane: _}, got F32x4
```

VL's pitch is that types are hidden by inference. For std's vector type, though, the natural
un-annotated helper fails for *both* spellings, and adding `v: F32x4` "fixes" it. A newcomer will
read that as a bug, and a learnability trap it is. This is not a getter defect as such (the
type-bound UFCS rung has the same hole), but getters make it the headline case, because `v.x` is
the first thing a graphics user writes.

### 3. The loop amendment has no consumer that runs

See Q2 (p11, p13). This is a measured case of the "speculative" criticism that std review
exists to catch, applied here to a language rule.

### 4. Getters are a second function colour, and relaxing it makes acceptance non-local

A getter may call only intrinsics and getters (p3: a helper `byte(x, s)` is refused). So a packed
format with shared bit-twiddling has to repeat it in every getter, or chain getters. That is
tolerable *because* getters are meant to be one-liners. The proposed relaxation ("may call any
getter-eligible function") swaps a closed, one-sentence rule for "whatever the summary says about
a body in another module". It then needs the baseline file to keep std from breaking users. Keep
the closed set. A getter that wants a helper has outgrown the getter form.

### 5. Two spellings for a zero-argument computed member, chosen forever in std

VL now has `v.x()` and `v.x`, with disjoint capabilities (Finding 1), and `v.x()` on a getter is
refused. B6 gives the rule: parenless means O(1). But nothing tells a std author *when* an O(1)
member should be a getter rather than a method, and the choice is permanent. Propose one sentence
for the std rubric: **a getter is only for a named part of an opaque scalar or vector brand** (a
lane, a packed field, a flat-row column). Anything else is a method. That matches §E2's own
use-case list, and it stops `get` spreading to every cheap accessor.

### 6. Spec surface from contextual keywords

`get`, `pure`, `readonly` (bound position), `flat` and `new`: each is "only a keyword there".
Every contextual keyword is a rule a reader has to learn about *where* a word is special. Lua has
22 reserved words and no contextual ones. VL should count these as a budget of its own, the way it
counts seed bytes.

---

## Adopt / warn away

**Adopt.**
- **Go:** one way to run code on a value, which is a call with `()`. Where VL has deviated for
  `.x`, keep the deviation as narrow as it is today.
- **Zig:** "no hidden control flow". This is the real justification for a hard, closed getter
  contract, and a better one than performance. Say it that way in the guide.
- **Lua:** mechanisms, not policies. A contract that is part of a form's definition is a
  mechanism. A severity that depends on the directory, plus a pragma, is policy.
- **Nim:** charge a callback's effects to its call site (F-A+). It is the one effects idea here
  that needs no syntax.

**Warn away from.**
- **The C++ `constexpr` / Rust `const fn` ratchet.** "Relax only" relaxes forever. Q2 is its
  first step.
- **D's attribute soup.** Ten inferred facts shown in hover, plus `pure`, plus a future cost
  word, plus a trusted extern marker, is the same soup, only inferred.
- **Suppression comments as a language feature.** If VL ever gets them, the ruling should come
  from the lint system as a whole, never from one lint.
- **TypeScript's #13347.** The doc already avoids this, correctly.

**Smallest coherent design.** Getters stay exactly v1 as built: nominal, read-only, loop-free,
closed call set, hard error, no setters, no structural participation. The loop amendment is
reverted. There is no pragma and no std/user split. The guide's `{x(): f32}` advice is corrected,
and std adopts a one-line rule for when `get` is allowed. The effect summary waits for its first
unbuilt consumer, and binaryen's flags get measured first. `pure` stays reserved and unbuilt.
