# Callback parameter-skip ergonomics — design (options, no pick)

A design note for letting callbacks (and, relatedly, destructuring patterns) skip
leading parameters without placeholder noise — e.g. reaching the `index` of
`map`/`filter` without `(_, i) => …`. This records the candidate syntaxes and
their tradeoffs **without picking a winner** (maintainer is split between the
named and `$#` forms, and partial to leading commas for the consistency reasons
below). Status: **design only, not yet buildable** (see Prerequisites).

## The problem
Skipping *leading* callback params to reach a *later* one (almost always the
index) forces placeholder noise. And it's worse than it looks in VL: because
**a param can't be named `_` twice** (duplicate-name error), skipping two means
inventing distinct dummies — `(_1, _2, arr) =>` — not `(_, _, arr) =>`. So the
pain is both the placeholders *and* having to name them uniquely.

## Prerequisites (why this is downstream, not a quick slice)
1. **Self-host lambdas / closures + HOFs don't exist yet.** `.map`/`.filter`/
   lambdas are in the emitter-coverage gap — the host TS compiler has them, the
   native `vl` does not. `[3,7].map(f)` can't compile natively today.
2. **Skip-by-name additionally needs param names in function types** (`(value: T,
   index: i32) => U`, names significant) flowed into the closure's contextual type.

## Candidate syntaxes (tradeoffs only)

### A. Leading commas — `[3,7].map((, i) => i + 1)`
- **For:** no dummy names at all (sidesteps the `_1, _2` problem entirely); zero
  type-system cost (pure parser/emitter); **consistent with array destructuring**
  if/when we add it (`const [, foo] = pair()` uses the exact same skip), so one
  rule covers both pattern positions.
- **Against:** doesn't scale to *reading* — `(,, x)` makes you count commas; a
  missing/extra comma silently changes arity and is easy to fat-finger.
- Net: ugly but understandable, and the destructuring-consistency story is its
  strongest argument.

### B. Bare name auto-match — `[3,7].map((index) => index + 1)` — (the one clear no)
Reads great but is genuinely ambiguous: `(x) =>` already means "first param", so
`(index) =>` meaning *position 1* (because the name matches the signature) makes
the same syntactic form bind different positions depending on the name — renaming
a local silently moves what it binds; a typo silently falls back to position 0.
Listed only to mark it as the option to avoid.

### C. Labeled skip ("named") — `[3,7].map((index: i) => i + 1)`
- **For:** scales without counting (`(third: x)` regardless of how many precede);
  self-documenting; binds only what you list (no dummies, no unused-lint).
- **Against (likely disqualifying): collides with type-annotation syntax.** In a
  param list `(x: T)` already means "`x` **of type** `T`", so `(index: i)` reads as
  "param `index` of type `i`" — and if `i` is a defined type it is genuinely
  *ambiguous*, not just confusing. Worse, C **double-inverts** the `name : thing`
  shape: normally left = binding name, right = type; C wants left = the
  *signature's* name and right = the binding — so *both* sides flip meaning vs every
  other param list. A different separator (`(index as i)`) dodges the type clash but
  still fights the "left side is the binding" reading and must not clash with a cast
  `as`.
- **Against (also):** needs Prerequisite 2 (param names in function types), and
  makes a library's param *names* a soft API surface (renaming a param breaks
  name-matched callers — the tradeoff Python/Swift accept for keyword args).
- Net: the `:` overload pushes the balance toward A and D, which don't touch type
  syntax at all.

### D. Positional shorthand — `[3,7].map($1 + 1)` (Swift `$0/$1`, Clojure `%1/%2`)
- **For:** skipping earlier positions is free; scales; **no** type-system
  param-name work (pure parser/emitter); established precedent.
- **Against:** a new sigil, and `$1` is less legible than a name; numbered access
  has its own miscount risk (which arg is `$1`?).

### E. (Minimal, orthogonal) allow `_` to repeat
Special-case `_` as a non-binding throwaway so `(_, _, arr) =>` is legal (it is in
Rust/Scala). Doesn't remove placeholders, but removes the "invent `_1`/`_2`"
papercut cheaply, and is independent of whichever of A/C/D is chosen.

## Related: array destructuring + multiple returns
The skip question recurs in **destructuring patterns**, and the cleanest answer
there ties back to A:
```
const [, foo] = pair()      // leading-comma skip — same rule as a param list
```
But note: **returning an array to destructure is the wrong primitive** for
fixed-arity results — prefer **multiple return values**. wasm supports multi-value
natively (standard since ~2020; wasmtime/V8/SpiderMonkey all implement it), so a
`function f(): (i32, string)` lowers to a functype with two result valtypes,
`return (a, b)` pushes both, and `const [a, b] = f()` pops them into two locals —
**no allocation, no array boxing**. So if we add destructuring + multiple returns,
the leading-comma skip (`const [, b] = f()`) and the param-list skip can share one
grammar — which is the main reason A is attractive despite its scaling weakness.

## Open decision (maintainer's call — no recommendation here)
Live candidates: **A (leading commas)** and **D (`$#`)** lead, with **C (labeled
`(name: bind)`)** weakened by its `:` collision with type-annotation syntax (see
C's "Against") — plus **E** as a cheap orthogonal win regardless. Considerations to
weigh: A's destructuring-consistency vs its comma-counting; D's zero type cost vs
the sigil; C's readability vs both the `:`/type ambiguity *and* the names-in-types
cost. If C is somehow pursued anyway, it'd need a non-`:` separator and a scoping
sub-question (param names in function types **generally** vs **special-cased** for
std `map`/`filter`).

(Whichever way: B — bare auto-match — is the one to avoid, and all of this is
gated on self-host lambdas + HOFs landing first.)
