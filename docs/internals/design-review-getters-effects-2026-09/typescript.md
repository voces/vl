# Persona review: TypeScript / JavaScript

**Who I am.** A senior TS/JS developer. I write `get fullName()`, `get isEmpty()`, lazy
`get data() { return this.#data ??= load() }`, and I use `Readonly<Props>` and `ReadonlyArray`
every day. I also carry the scar of microsoft/TypeScript#13347: a get-only accessor satisfies
`{ x: number }`, `readonly` is ignored for assignability, and `p.x = 1` type-checks and then throws.
I value inference that "just works" on un-annotated helpers, error messages that tell me the fix,
and structural typing that is honest about writes. Probes are in `typescript/` (run with `dist/vl`).

---

## Q1. Hard error for the body contract? **MODIFY: split the contract along its own seam.**

The contract bundles two different kinds of rule, and my background says they deserve different
severities:

- **Semantic rules**: no writes (`W`), no host calls (`H`), no unknown calls (`X`), no module-`let`
  reads. These decide what `v.x` *means*. Two reads with no write between them agree. Reordering
  a getter read is safe (the emitter's `exprEffectFree` premise). The getter describes its receiver.
  Break any of these and the program is *wrong*, not merely slow. **Keep these as hard errors.**
- **Cost rules**: loops, the budget of 64, allocation, the non-boxing type rule. These are
  performance. Break one and the program is *slow*. **Make these a warning lint for user code, and an
  error for std exports** (std's export is permanent, so the proposal on the table is right there).

Why the split, from JS experience:

1. **The everyday getter is a tier-3 getter.** The single most common getter in web code is
   `get fullName() { return `${this.first} ${this.last}` }`. VL refuses it (probe `p1.vl`:
   "concatenates strings, which allocates"). The second most common is `get total()` summing over
   items, and VL refuses that too (`p2.vl`: "contains a loop"). A JS developer reaches for `get`
   *because* the keyword is spelled exactly as in JS, then finds out that almost nothing they use
   getters for is allowed. That is a learnability cliff at the door. A warning would say "this
   allocates on every read; consider a method", which is exactly the ESLint/Kotlin-convention
   experience these developers already trust.
2. **A performance rule as a hard error has no precedent even inside VL**, as the brief says. TS
   itself never refuses for performance. Its nearest analogue is the instantiation-depth limit
   ("Type instantiation is excessively deep and possibly infinite", TS2589), and that limit is
   the most-complained-about magic number in the TS issue tracker. It was raised for tail-recursive
   conditional types in 4.5 precisely because users kept hitting it on legitimate code. A budget of
   64 enforced as an error is the same shape (see Q2).
3. **The perf consumers lose nothing.** plumb, veldt and sunsuz can run `--severity warning` as an
   error floor, which VL already supports. And std, the one boundary that is shared, stays checked.

**On per-site suppression, borrow the *better* of TS's two directives.** `// @ts-ignore` is
abused because it silently outlives the problem. `// @ts-expect-error` (TS 3.9) errors when the
line it covers has *no* error, so a stale suppression cannot rot. If VL adds
`// vl-allow getter-cost`, an unused `vl-allow` should itself be a diagnostic. And scope it to the
**declaration** (`get` line), not the read site. The cost is a property of the getter, and
suppressing at every `v.x` read would spread one decision over every caller.

## Q2. Constant-bounded loops within 64. **AGREE with the invariant; DISAGREE with the transitive budget as an acceptance rule.**

The invariant ("worst-case cost computable from source plus bounded callees, never
data-dependent") is a good stopping rule. It is crisp, a user can predict it, and it lets
`for i in 0 until 4` through. That is exactly the "slippery slope" guard the owner wants. The part
that worries me is the **number, applied transitively, as an error**:

- **Action at a distance.** Under the #3039 amendment, a user's getter that calls std's
  `normalize` fails on upgrade if std's bound grows from 8 to 40 (effects §E4 says this outright).
  In TS terms, that is a dependency's *patch* release breaking your build through an inferred
  property you never wrote down. TS 5.5 added `--isolatedDeclarations` precisely because inferred
  facts crossing a package boundary are brittle. The std baseline ratchet mitigates this for std,
  but it does not help a user module calling another user module.
- **Nobody can compute 64 in their head** across three getters. The diagnostic chain (§D, "costs 80
  iterations, over the budget of 64: 4 × 20 through `row`") is good. But needing it at all tells you
  the rule is not locally predictable.

If Q1 goes my way, the budget becomes a *lint threshold*, and every one of these concerns
softens into a warning. If Q1 stays a hard error, keep the budget **per-body, not transitive**, for
user code: count only the getter's own loops, and treat any callee that is `Bounded` as a unit.

## Q3. Setters. **AGREE with "none", and do NOT narrow it to "none on value types" yet.**

What setters are for in TS: (a) validation on write, (b) reactivity (Vue/MobX, `set value(v) {
this.#v = v; this.notify() }`), (c) keeping a derived pair in sync. Every one of them depends on a
**private backing field**. `set age(v) { if (v < 0) throw …; this.#age = v }` means nothing if
`p._age = -1` is also legal. VL has no private fields (property-access §A3), so a setter on a
reference type protects nothing. It would be a method call dressed as an assignment, with none of
the invariant-keeping that justifies one.

JS also shows what setters cost. `a.x = 5; a.x` can read back something other than `5` (clamping,
normalising), which breaks the most basic reading of `=`. And TS spent 4.3 to 5.1 relaxing the
rule that a getter and a setter have related types, because frameworks wanted
`set style(v: string)` paired with `get style(): CSSStyleDeclaration`. That is a whole axis of design
VL doesn't need yet. **Revisit only after module-private or `readonly` fields exist (F6)**, and
then as "a setter is allowed only where a field of the same name is not writable from outside".

## Q4. Getters satisfying read-only structural contracts. **AGREE, with two changes, and the problem is more urgent than the doc says.**

I am the person who has to say that TypeScript's answer was the wrong one. The mistake in #13347
is not "getters satisfy structural types". It is **"`readonly` doesn't participate in
assignability"**. Swift's `{ get }` and mypy's `@property` protocol members show the fix: put the
read/write distinction *in the requirement*. `{ readonly x: f32 }` done that way is the right
design, **provided** `{ readonly x }` → `{ x }` is refused *everywhere*: in bounds, in inferred
constraints of un-annotated functions, and at every delivery position. VL has clause 1, and TS
does not, so VL can actually close the hole TS left open.

**Why it is urgent: today a getter type has no generic path at all.** Measured:

| probe | program | result |
| --- | --- | --- |
| `p5.vl` | `function big(t) { return t.area > 5.0 }` then `big(r)`, where `r` is a `Rect` with `get area` | `argument 1: expected {area: _}, got Rect` |
| `p6.vl` | `<T: { area(): f64 }>` then `big2(r)` | `Rect does not satisfy {area():f64}: no area(): f64` |
| `p10.vl` | `<T: { readonly area: f64 }>` | parse error (F5 unbuilt, as expected) |
| `p11.vl` | a differently named wrapper `function area2(self: Rect) { self.area }` and the bound `{ area2(): f64 }` | runs |

`docs/guide/getters.md` says "Generic code that wants anything with a readable `x` asks for the
method `{ x(): f32 }` instead". **That advice is false for the getter-bearing type itself (p6).**
And you cannot add `function area(self: Rect)` beside the getter, because the same-name rule
refuses it. So the only escape is a second, differently named function (p11). The first case
(p5) is worse for my persona. VL's pitch is "types are hidden by inference", and the natural way to
write a helper is un-annotated. The first time a TS developer passes a getter type to their own
un-annotated helper, it fails, and the message doesn't mention getters.

The two changes I'd make:

1. **Make an annotated `{ readonly x: T }` *parameter* sugar for a bound**, as Rust does with
   `fn f(x: impl Trait)`. Parameters, which are the common case, are then always specialised, and
   the annotated-vs-generic split the doc fears (§C2) disappears for them. Keep the remaining
   non-specialised positions (struct fields, list elements, function-typed parameters) as a clear
   **refusal** that names the position, not as adaptors or witness tables. Build adaptors only when a
   consumer asks.
2. **Infer read-only constraints for un-annotated functions.** A body that only reads `t.area` should
   infer `{ readonly area: _ }`, and one that writes should infer `{ area: _ }`. Then p5 runs, and a
   writer refuses **at the write site**, with TS's own good message shape: "cannot assign to `area`:
   a getter-backed `Rect` reached `t` through `big(r)` at line 6". The doc's worry about "an
   instantiation-time refusal at a distance" is real. The fix is to name both ends, not to
   refuse the read-only case too.

What must stay NO: a getter never satisfies a plain `{ x: f32 }`. That is the #13347 hole, and the
doc is right.

## Q5. Getter-eligible is not `pure`. **AGREE.**

In JS culture "pure" means React's pure function: same inputs, same output, no side effects. A
getter reading `this.w * this.h` is fine under that reading because `this` *is* an input. VL's
`pure` excludes `R.mem` and `R.heap[const]` for parallel workers, which is stricter, and so a
getter that reads linear memory can't be `pure`. Keeping two names for two predicates is right.
One caution: **hover must never show `pure` on a getter just because its body happens to qualify.**
Users will read "pure" on hover as "getters are pure", and then be confused when an `__load_*`
getter isn't.

## Q6. The effects summary. **AGREE with the shape; two additions, one cut.**

Inferred, never in types, with a checked marker only at the boundary: this matches how TS
developers already live. Nobody writes effect annotations, and hover is where facts surface.
Pessimistic function values in v1, with Nim's rule later, is right. TS has no effect tracking on
callbacks, and nobody misses it for *acceptance*.

- **Add: an explicit "why is this refused" reverse view.** The §D chain is good. Add the same
  chain on **hover of the call site inside the getter**: "`norm` makes this getter unbounded: `while`
  at vec.vl:14". The best TS error UX is "elaboration" (the nested "Type X is not assignable…
  because property y…" chain), and the chain is VL's elaboration. Put it in the editor, not only in
  the CLI.
- **Add: an isolated-declarations story before separate compilation lands.** §E4 already names the
  trigger. Name the mechanism too. When a boundary with invisible bodies exists, exported functions
  should be *required* to carry the declared promise that inference would otherwise supply. That is
  what TS 5.5 did for declaration emit, and it is cheaper to plan now than to retrofit.
- **Cut (or keep strictly internal): `T` and `U` in anything user-facing.** The doc already says
  so. I'd add that hover should show at most three facts (`no writes · bounded · no alloc`), since
  a nine-bit readout is noise to a scripting-feel user.

---

## Findings beyond Q1–Q6 (ranked)

1. **A getter type is sealed off from generic code, and the guide says otherwise.** p5/p6 above.
   Fix the guide sentence now ("a getter does not satisfy `{ x(): f32 }` either; wrap it in a
   differently named function"). This is the strongest argument for building F5 sooner than
   "later".
2. **The refusal for the most common JS getter doesn't offer the fix.** `p1.vl` says the getter
   "concatenates strings, which allocates", followed by the whole contract. It should end "declare it as
   `function fullName(self: Person): string` and call `p.fullName()`". The `v.x()`-on-a-getter
   message (p8: "drop the `()`") shows the tree already knows how to do this well. Also, **p1 prints
   the same diagnostic twice** (same line and column, identical text). That is a small defect worth filing.
3. **Un-annotated inference produces `{area: _}` and never mentions the getter.** The message in
   p5, `expected {area: _}, got Rect`, reads as though `Rect` has no `area`. It does, as a getter.
   Say so: "`Rect.area` is a getter, and `big`'s parameter was inferred as a record with a field
   `area`".
4. **The narrowing refusal doesn't say "bind it first".** `p9.vl`: `if b.parent != null {
   b.parent.v }` gives `member access '.v' on non-object Node | null`. TS narrows through
   property reads (unsoundly, even through getters), so every TS developer writes this line on day
   one. The guide gives the fix (`const p = v.p`). The diagnostic should give it too, because this is
   the first place they will land.
5. **The lazy-cache getter is the other big JS idiom, and the doc never mentions it.**
   `get data() { return this.#cache ??= compute() }` is observably idempotent, but it writes and
   allocates. VL is right to refuse it. But the design and guide should *name* it and point to the
   VL answer (an explicit `data(self)` method, or computing it at construction), because it is the
   second thing a JS developer will try.
6. **No bound-method value, which is fine, but say so in the getter guide.** `const f = v.x` is
   a common JS move (`arr.map(o => o.name)`), and in JS `o.name` on a getter returns the value.
   VL returns the value too, which is consistent. But B14's `c.area` bound-value question is still
   open, and whichever way it goes, `c.area` for a getter must keep meaning "the value". That should be
   pinned in DECISIONS now, before B14 is ruled.

## What I'd adopt, and what I'd warn VL away from

**Adopt from TS/JS:**
- `@ts-expect-error` semantics for any suppression (an unused suppression is an error).
- The TS "elaboration" error chain, in the editor.
- `Readonly<T>`/`ReadonlyArray<T>` as everyday vocabulary: `{ readonly x }` as a structural
  requirement is valuable, and React code is built on it.
- Swift/mypy's version of it, where read-only is **in the requirement and checked for assignability**.
- `--isolatedDeclarations` as the model for when inferred facts must be written down at a boundary.

**Warn VL away from:**
- **TS#13347 itself**: never let a readonly or getter member satisfy a writable requirement, at any
  position, including inferred constraints of un-annotated functions.
- **Class-getter vs object-literal-getter asymmetry**: JS spread invokes an own getter and drops a
  prototype getter, and `JSON.stringify` does the same. VL has no object spread of a newtype today
  (`p4.vl`: the struct can't even be printed or `==`'d to a literal). When spread, structural
  equality or a `toStr` over a nominal struct arrives, rule up front that getters are **not**
  fields for any of them.
- **Magic numbers as hard errors** (TS2589's history): keep the 64 as a lint threshold.
- **Setters before privacy.** They cost a lot of design surface and protect nothing without private fields.
