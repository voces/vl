# Callback parameter-skip ergonomics — design

A design note for letting callbacks skip leading parameters without `_` noise —
e.g. reaching the `index` of `map`/`filter` without `(_, i) => …`. Captures the
decision and the dependency chain so it's ready to build when the prerequisites
land. Status: **design only, not yet buildable** (see Prerequisites).

## The problem
Skipping *leading* callback params to reach a *later* one (almost always the
index) forces placeholder noise that worsens with each skip:
`(_, i) =>`, `(_, _, arr) =>`. Trailing omission is already free (a callback may
take fewer args than supplied), so the pain is specifically "I want arg N and
don't care about 0..N-1".

## Prerequisites (why this is downstream, not a quick slice)
1. **Self-host lambdas / closures + HOFs don't exist yet.** `.map`/`.filter`/
   lambdas are in the emitter-coverage gap bucket — the host TS compiler has them,
   the native `vl` does not. `[3,7].map(f)` can't compile natively today regardless
   of skip syntax.
2. **Param names are not part of function types.** Skip-by-name needs function
   types to carry parameter *names* (`(value: T, index: i32) => U`, names
   significant) and the contextual type to flow them into the closure.

So this rides on top of two real features; it is not a standalone parser tweak.

## Options considered

### A. Leading commas — `[3,7].map((, i) => i + 1)` — REJECTED
Explicit and zero type-system cost, but it does **not** solve the stated pain:
`(,, x)` still makes you *count commas*, just without the `_`s; a leading/extra
comma is the easiest token to misread or fat-finger (a missing comma silently
changes arity); and it saves ~1 char per skip over `_`. Marginal, doesn't scale.

### B. Bare name auto-match — `[3,7].map((index) => index + 1)` — REJECTED
Reads great, but the **bare** form is ambiguous and magical:
- `(x) =>` already means "first param". If `(index) =>` instead binds *position 1*
  because the name matches the signature, then the same syntactic form means
  different positions depending on the name — renaming a local silently moves which
  value it binds.
- A typo (`(idnex) =>`) either errors (annoying) or silently falls back to
  position 0 (worse).
- It hard-couples callers to the library's param names with no visible opt-in.

### C. Labeled skip — `[3,7].map((index: i) => i + 1)` — RECOMMENDED
The `:` is the disambiguator and mirrors VL's existing **named args** (`f(x: 1)`):
```
[3, 7].map((i) => i + 1)              // positional: i = value (arg 0) — unchanged
[3, 7].map((index: i) => i + 1)       // skip-by-name: bind the param named `index` to `i`
[3, 7].map((value: v, index: i) => …) // bind both, explicitly
```
- **Unambiguous:** `(i)` is *always* positional; `:` is the explicit opt-in to
  name-matching. (Deliberately drop the bare `(index)` shorthand — that's the
  ambiguous case.)
- **Scales without counting:** `(third: x)` binds the 3rd param no matter how many
  precede it — self-documenting, no comma-counting.
- **Binds only what's listed:** unlisted params aren't in scope (no `_`, no
  unused-lint).
- **Symmetric** with call-site named args (`label: binding` both ways).

Cost: requires Prerequisite 2 (names in function types) and makes library param
names a soft API surface (renaming a param is a breaking change for name-matched
callers — the same tradeoff Python/Swift accept for call-site keyword args, but
opt-in here).

### D. Positional shorthand — `[3,7].map($1 + 1)` — VIABLE CHEAP INTERIM
Swift (`$0/$1`) / Clojure (`%1/%2`) precedent: reference args by position, skipping
earlier ones is free. **No type-system param-name work** (pure parser/emitter),
scales fine. Downsides: a new sigil and it's a bit cryptic (`$1` vs a name). Not
mutually exclusive with C — could ship as an independent ergonomic once lambdas
exist, and add C later.

## Recommendation
Target **C (labeled skip, `(label: binding)`, no bare shorthand)** as the real
feature — most readable and most VL-idiomatic — and **drop leading commas (A)**.
**D (`$1`)** is a reasonable independent cheap add if a low-cost win is wanted
before the type-system work.

## Sliced rollout
1. **Self-host lambdas/closures + `.map`/`.filter`/`.forEach`** (the big
   prerequisite; an emitter-coverage feature in its own right).
2. **Param names in function types** + contextual-type flow (names become
   load-bearing in the type; functype interning must stay name-agnostic for
   WasmGC identity / goldens — names live in the checker's type, not the emitted
   functype).
3. **Labeled skip syntax (C)** in the parser + checker (match `label` against the
   contextual callback type's param names; bind only listed params).
4. *(Optional, independent)* **`$1` shorthand (D)**.

## Open scoping decision (for the maintainer)
Should param names be part of function types **generally** (enabling skip-by-name
for *any* user higher-order function) or **special-cased** for the known std
collection methods (`map`/`filter`/…) first? Recommendation: **general** — the
special-case is throwaway and would be redone; the general feature is the clean
target. But the general version is the larger type-system commitment, so a
std-only first step is a legitimate smaller rung if desired.
