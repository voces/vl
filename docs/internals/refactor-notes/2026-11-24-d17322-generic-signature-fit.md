# D17322: a generic function value into a binding of another type parameter (2026-11-24, lane N10)

`let b: F = a1` records a `BND_LET` bound, `G fits F`, that `letRule` judges at each call of
`mid`. When `F` is a generic function's type and is called at two types, both sides keep type
variables (`(T) => string` and `(T) => T`), so `tyHasHole` held on both, the bound was only
re-noted, and nothing judged it. `<T>(T) => string` reached emit: D17117's refusal, or invalid
wasm with the value instantiated elsewhere (D17321).

`letRule` now judges a declared binding's row (`row.s != ""`) in that deferred case. It
instantiates the value's signature at the binding's parameters, the binding's variables held
rigid (`genSigFitWhy`). `genSigDecl` takes a side only when every type variable in it is bound
by one generic declaration whose own signature it is, with no inference hole. `genSigMatch`
walks function, list, nullable and map shapes. A variable of the value's declaration binds at its
first use, and a closed part must be `tySame`. A union or nullable destination, a union or record
shape, an arity mismatch and an outer-scope variable all stay deferred, as before. A `void`
result drops the value's. A type parameter that no parameter fixes is refused by name.

`substTyDeep` cannot do the substitution: it skips a variable foreign to the call being solved
(`substSkipsForeignVar`), and the value's variables are foreign to `mid`'s call. The first cut
bound by name and substituted, so every pair compared unequal. That refused 10 tests/cases
programs that run on master, among them written `let`s of generics (D14722, D14785), which a
write's rows (`row.s == ""`) keep to their own rules.

## Legacy tails the IR calls

None: a checker change.

## Witnesses

- `tests/cases/generics/error-generic-fn-value-misfits-other-typaram-binding-result.vl`
  (`<T>(T) => string`), `-binding-nested.vl` (`<T>(T) => T[]`), `-const.vl` (`<T>(T) => i32`,
  `const`), `-two-params.vl` (`<A, B>(A, B) => B` into `<T, U>(T, U) => T`).
- `tests/cases/generics/error-generic-fn-value-type-param-fixed-by-no-parameter.vl`: `T` only
  in the result, refused by name.
- `tests/cases/generics/generic-fn-value-fits-other-typaram-binding.vl`: fitting values run.
  They are the same signature, a renamed type parameter, two type parameters, `const`, and a
  value-returning generic into a `void` one.

## Late tag rows

The fitting control adds 3 late tag rows, `tag G {same}`, `{fst}`, `{inner}`: `mid`'s `G` set,
decided after the elaboration. Master's seed gives the same 3 on this program. The checker change
moves none; the shape is D17117's, a binding of `F` seeded from `G`, which that row's mono fix
owns. Recorded with `late-demands.vl -- --write-baseline` from a fixpoint seed.

## Readings (base 423d7265, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| checker A/B, `vl check --batch --json`, tests/cases + distilled corpus + capability probes (22,271 files) | 5 files differ, the 5 new refusal cells, by the intended refusal; two of them also lose master's `redundant type annotation` hint beside the error; no other file moved |
| `check-filed-witnesses --strict`, both inventories | 5691 as filed, 0 MOVED (D17322 graded `check_reject`) |
| distilled `regress.vl` / goal scoreboard | no runs lost / clause 1: 0, clause 2 emit rejected after check: 0 |
| legacy A/B (tests/cases + probes) | 8,219 programs, 0 moved |
| `ir-identity.sh --names` | identical 9433, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 8145, differ 0, expected divergence 2 |
| `ir-identity.sh --claimless` | identical 14506, differ 0; claimless sha256 `fb3eeaefbbe58059b861c7b0e8ec3f0ab5bef659070715fa41514a7fd2309fc9` at 4ba00390, `compiler/` clean |
| L2 self-compile fuel per PR | +0.04% on 129,252,236,293 |
| late demands / late tag rows / `self ir misses` | 10 (baseline 10) / 315 → 318, the 3 named above / 0 |
