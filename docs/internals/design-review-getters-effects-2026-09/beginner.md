# Persona review: beginner-to-intermediate learner

**Who I am.** I have written some Python and JavaScript, and VL is my first statically typed
language. I learn from `docs/guide/*.md` and from error messages, in that order, and I copy
patterns from the guide. I know `@property` from Python and `get x()` from JS classes, so I
arrive expecting a getter to be "a method you call without parentheses". What I value: a rule I
can say in one sentence, an error message that tells me what to type next, and no words I have
to look up in a design doc. I don't know what a WasmGC layout, an intrinsic, a null niche or an
orphan rule is.

Everything quoted below was run with `/home/verit/vl/dist/vl run`. The probes are in
`persona-review/beginner/p*.vl`.

---

## The one-sentence rule, and where it breaks

The guide gives a good one-liner: *"A getter reads like a field, so its body must cost like
one."* I understood it straight away, and it answers "when do I write `get x` rather than a
method?": **if it is cheap and only looks at the value, use a getter; otherwise use a
method.** That is a better rule than Python gives me (Python only has style advice). I'd keep it.

The trouble is that the checker's idea of "cheap" doesn't match mine, and the error messages
never tell me what to do instead. See findings 1 and 2.

---

## Q1. Should the body contract be a hard error? **Modify: keep the error, fix what it refuses and what it says.**

From a learner's view, a hard error is fine, because **the escape costs nothing**: change `get`
to `function` and add `()` where I read it. In Python, the "slow `@property`" advice is something
I read once and forgot. A compiler that stops me teaches the field/method distinction at the
moment it matters. A warning I can suppress with `// vl-allow getter-cost` would become a
cargo-cult comment: I'd paste it the first time I got the warning and never learn the rule.
Beginners suppress warnings. They don't read them.

A hard error is only fair, though, if two things hold, and today neither does:
1. **What it allows must match intuition.** `sqrt`, `abs` and `max` are refused (finding 1).
   To a learner that looks arbitrary, and an arbitrary hard error is worse than a warning.
2. **Every refusal must name the escape.** None of the 13 contract messages I triggered says
   "make it a method" (finding 2).

If those two can't be fixed, I'd rather have the warning. The std-only error in the proposal is
a good middle ground, but it creates two rulebooks: a getter I copy out of std's source into my
own file would compile under different rules.

## Q2. Constant-bounded loops, budget 64. **Agree, with a message requirement.**

The invariant is easy to explain to me: *"the compiler must be able to count the loop's steps
by reading the code."* It is a good stopping rule, because each relaxation it permits can be
explained with the same sentence. The subtle part for a learner is this pair:

```vl
for i in 0 until 4 { s = s + self.a[i] }   // allowed once amended: 4 is in the source
for x in self.a     { s = s + x }           // refused forever, even if a always has 4 items
```

I'll write the second one first, because it's what Python taught me. So the refusal must say
*why*: "this loop runs once per element of `self.a`, and that count is only known at run time.
Loop over a constant range (`for i in 0 until 4`), or make `total` a method." Today p01 and p17
(the amended-legal form, which is not built yet) both print only `contains a loop`. "64" is a
magic number to me, but a message like `costs 80 iterations, over the budget of 64` (§D of the
effects doc) is understandable. Keep that wording.

## Q3. Setters. **Agree: none, and don't narrow it.**

"Getters are read-only, always" is one rule. "No setters on value types, but setters on
reference-backed newtypes" asks me to know which of my newtypes are value types, and the guide
never tells me that. p06's message is good: `cannot assign to '.r': it reads the getter 'r' on
Color, and a getter is read-only`. It would be better with a next step: *"to change it, build a
new value (e.g. a `withR(self, r)` function)"*. std's `withLane` shows the pattern, so name it.

## Q4. Should getters satisfy read-only structural contracts? **Modify: yes, and sooner than "build later", because the current workaround in the guide doesn't work.**

This is the most confusing thing I hit. The guide says: *"Generic code that wants 'anything
with a readable `x`' asks for the method `{ x(): f32 }` instead."* I tried it (p18):

```vl
type Pt = new { x: f64, y: f64 }
get x2(self: Pt): f64 { self.x * 2.0 }
function useX<T: { x2(): f64 }>(t: T): f64 { t.x2() }
```
```
p18_method_bound.vl:5:7: Pt does not satisfy `{x2():f64}`: no `x2(): f64` — the bound needs a
field of that type or a `x2(self: Pt, …)` function in scope at this call
```

So a getter satisfies **neither** `{ x2: f64 }` (p10) **nor** `{ x2(): f64 }` (p18). The guide's
advice only works if I delete the getter and write a method (p20 runs). And I can't have both,
because p21 refuses a getter and a method with the same name. So today, **a type with a getter
cannot be used by any generic function that reads that property.** For a beginner that's a trap:
getters look like the nicer choice, and then my generic code breaks.

`{ readonly x: f32 }` (F5) is the right fix, and I'd call it the missing half of getters, not a
later extra. Until it exists, the guide should say plainly: *"a getter cannot be used through a
generic bound yet. If generic code needs the value, declare a method instead."* The p10/p18
message should say *"Pt has a getter `x2`, but a getter does not satisfy a bound"* rather than
suggesting a function that is, in fact, already there in getter form.

## Q5. Getter-eligible is not `pure`. **Agree on the semantics. Disagree on the vocabulary.**

The split is right: a getter reading `self.x` of a mutable struct obviously isn't "pure" in the
compile-time-evaluation sense. But the words are already tangled:
- The shipped message for p03/p13/p23–p26 says `which is neither a **pure** intrinsic nor a getter`.
- The effects doc says a getter is **not** `pure`.
- The guide calls the rule "effect-free".
- The earlier getter doc said "pure by convention".

A learner will conclude that "getters must be pure". Then, when `pure function` ships and a
getter can do what a `pure` function can't (read a `const` table, linear memory) and vice versa
(loop, allocate), I'll be lost. **Rule: getter diagnostics never use the word "pure".** Say
"cheap, side-effect-free" or "field-like". Also, the `const` asymmetry (I14: a getter may read a
`const` lookup table, a `pure` function may not) will surprise anyone from JS. p27 shows
`const xs = [1, 2]; xs.push(3)` runs, so the reason is real, but that is exactly the JS gotcha
("const means the binding, not the contents"), and the guide never states it. It needs one
sentence in the guide before `pure` ships.

## Q6. The effects summary. **Agree with the shape. Modify how it is surfaced.**

I like that I never write effects in types and only meet them through errors and hover. That's
the Python experience with better errors. Two concerns:
- **Hover text**: `pure · bound 0 · no allocation` is cryptic. "bound 0" reads like "bounded by
  zero" or "no bound". Say `no loops` / `at most 20 loop steps` / `loops depend on data`. Don't
  show a number for straight-line code.
- **Too many predicate names reach users.** effect-free, terminating, `pure`, getter-eligible
  and hoistable. The first four can each appear in a message. Keep it to two user-facing words:
  `pure` (the marker) and "getter body". Put the rest in internals.
- Missing for learners: a **`debug` print escape** (I10). The first thing a beginner does when a
  getter returns the wrong number is add `print`. p13 refuses it, and the only fix is to turn
  the getter into a method, debug it, and turn it back. I'd put a `debugPrint` exemption, or at
  least a message saying "to debug, temporarily make it a `function`", ahead of loops in
  priority.

---

## Findings beyond Q1–Q6 (ranked)

### 1. The first getter a learner writes, a vector length, is refused: `sqrt`, `abs`, `min`/`max` aren't allowed
```vl
type Pt = new { x: f64, y: f64 }
get len(self: Pt): f64 { sqrt(self.x * self.x + self.y * self.y) }
```
```
p24_sqrt.vl:2:26: the getter `len` on Pt calls `sqrt`, which is neither a pure intrinsic nor a
getter — …
```
`abs` (p25) and `max` (p26) are refused the same way, and so is `hypotF64` from std:math (p23).
Yet `__sqrt_f32x4__` and `__abs_f32x4__` are on the allow-list (`compiler/typecheck.vl:36528`),
so the vector sqrt is a "pure intrinsic" and the scalar one isn't. `point.length`,
`circle.area`, `temp.fahrenheit` and `range.width` are the textbook getter examples in every
tutorial I've read, and half of them need one of these. **Fix:** allow the scalar math builtins
that lower to a single wasm op (`sqrt`, `abs`, `min`, `max`, `floor`, `ceil`, `trunc`,
`nearest`, `copysign`), and once the effects summary exists, allow std functions it grades
getter-eligible. Until then, the guide's "Allowed" paragraph should list the scalar math
builtins explicitly as *not* allowed, because I'd assume they are.

### 2. No contract error says what to do instead
Every body-contract message ends in the same 110-character tail: *"— a getter body is
loop-free, recursion-free, allocation-free and effect-free, and calls only intrinsics and other
getters"*. It restates the whole rulebook, including in p05, where the problem was the return
**type**, and never gives the one fix that always works. Proposed shape, one line each:
```
p01_loop.vl:4:3: getter `total` has a loop over `self.a`, whose length is only known at run time
  a getter must be as cheap as reading a field; make it a method instead:
      function total(self: Vec): i32 { … }      // read it as v.total()
```
```
p04_strplus.vl:2:32: getter `full` builds a new string with `+`
  a getter must not allocate; make it a method: function full(self: Name): string
```
The `function … // read it as v.x()` suggestion is mechanical (it's the declaration with `get`
replaced by `function`), so it can be generated exactly.

### 3. The nullable-scalar refusal is jargon and has no fix
```
p05_nullable.vl:2:27: the getter `positive` on Cell returns `i32 | null`, whose representation
is boxed (it allocates) — a getter returns a scalar, a literal union, an existing reference or a
null niche
p05_nullable.vl:2:40: the getter `positive` on Cell computes a value of type `i32 | null`, …
```
"Representation is boxed" and "null niche" mean nothing to me, and I get two errors for one
mistake. From my point of view, `i32 | null` is the most natural return type in the language
for "maybe a number". And `string | null` is allowed while `i32 | null` isn't. That distinction
is invisible at the source level. **Fix:** say *"`i32 | null` has to be stored in a new object
each time, so a getter can't return it. Return a sentinel (e.g. `-1`), or make it a method."*
Emit it once, at the return type only. The guide section "The type rule" should give the
learner's version: *"a getter can't return a nullable number; nullable strings, structs and
booleans are fine."*

### 4. Duplicated and cascading diagnostics
- p04: the string-`+` error prints **twice**, identical, at the same position.
- p15: a two-getter cycle reports once per getter. That's fine, but "reads itself through a
  chain of getters" should name the chain (`a → b → a`), as the effects doc promises.
- p25: `get magnitude(self: Delta): i32 { abs(self as i32) }` also prints a bogus
  `expected i32, got f64` at the call. `abs(n)` on an `i32` runs fine outside a getter (p28), so
  the refusal is leaving a wrong fallback type behind. A learner reads the first error, which is
  the bogus one, and goes to fix the wrong thing.

### 5. The narrowing gotcha is documented, but the error doesn't mention it
```vl
if b.label != null { print(b.label.length) }
```
```
p19_ifnarrow.vl:4:36: member access '.length' on non-object string | null
```
The guide explains this ("bind it first"), but the message doesn't mention that `.label` is a
getter, or that the fix is `const l = b.label`. I *just* checked it for null, so to me this looks
like a compiler bug. **Fix:** when the object of a failed narrowing is a getter read, add
*"`.label` is a getter, so each read is a new value and the null check doesn't carry over; bind
it first: `const label = b.label`."* Kotlin's "smart cast is impossible because 'x' is a
property that has open or custom getter" is the precedent, and it's the most-searched Kotlin
error for exactly this reason.

### 6. The guide assumes knowledge it never teaches
getters.md is the only guide page for this feature, and it relies on words that no guide page
defines: **nominal** (first word of the page), **brand**, `type N = new …` (there is no newtype
guide page; the design lives in `docs/internals/newtype-design.md`), **orphan rule**,
**intrinsic**, **linear memory**, **null niche**, **representation**, **UFCS**, and bare
**D2031**. It also doesn't show how to *construct* a struct-backed newtype. I tried
`{ a: [1,2,3] } as! Vec` and got `'as' supports numeric conversions only`. The answer (annotate:
`const v: Vec = { … }`) is in an internals doc. **Fix:** add a short `docs/guide/newtypes.md`
("nominal = has its own name, and two different names don't mix even when the insides match;
structural = two record types with the same fields are the same type"), link it in the first
line of getters.md, and replace the jargon in the table with examples (`"__load_i32__"` means
nothing to me; "the built-in lane and load operations" does).

### 7. The "When to use which" table is missing
The guide says what a getter *is not* but never compares the three options side by side. The
one table I wanted:

| you want | write | read it as |
| --- | --- | --- |
| stored data | a field in the struct | `v.x` (assignable) |
| a cheap derived value, no side effects | `get x(self: T): R` | `v.x` (read-only) |
| anything that loops over data, allocates, prints or calls your functions | `function x(self: T): R` | `v.x()` |
| a value generic code can read through a bound | a field or a method (not a getter, yet) | |

---

## What I'd adopt, and what I'd warn VL away from

**Adopt (from Python/JS/Kotlin):**
- Kotlin's smart-cast message, which names the property and the reason (finding 5).
- Rust/Elm-style diagnostics that end in a concrete, copy-pasteable fix (finding 2).
- Python's `math.sqrt` in a property is the canonical property example. Allow its VL
  equivalent (finding 1).

**Warn away from:**
- **Per-site suppression comments** as the escape from the contract. Learners paste them
  without reading. If Q1 goes to "warning", make the escape "use a method", not a comment.
- **Letting internal predicate names leak into messages** ("pure intrinsic", "null niche",
  "representation is boxed", "getter-eligible", "bound 0"). Each is precise, and each is a word
  I have to leave the editor to look up.
- **Restating the whole rulebook in every error.** It's the same text 13 times, and it hides the
  one clause that actually applies.
- **A feature whose recommended workaround doesn't work** (Q4 / p18). Either build
  `{ readonly x }` or change the guide's advice today.
