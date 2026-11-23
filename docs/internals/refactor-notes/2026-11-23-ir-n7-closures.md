# IR coverage, batch D: closure list elements, capturing map callbacks, and a cached environment's own captures (2026-11-23, lane IR-N7)

| Mechanism | Change | tests/cases blocker class, functions (any / alone), before → after |
|---|---|---|
| `for` over a list of closures | `forInElemPlain` takes `closure` as a plain element kind, so the builder walks it as `emitForInStmt` does and the lowering calls the same walk helpers | `for in element closure` 37 / 31 → 0 / 0 |
| capturing `.map`/`.filter` callback | `mapFilterWhy` admits a capturing named callback; the builder makes its closure as `emitClosureValue` does (`mapCallbackClo`: `cloEnvOf` at the callback's closure rep, `RMakeClo`) and passes it as the callback operand | `map callback env` 28 / 28 → 0 / 0 |
| cached environment's own capture | `cloEnvOf` reads this frame's own capture as a temp inside a cached environment's slot test, as `emitClosureEnvOf` does, instead of refusing it | `closure env cache copy` 24 / 24 → 0 / 0 |

Moved on, not closed (alone): `for range in a reserve region` 14 → 19, `for in list union` 15 → 16,
`for in map element` 8 → 9.

## Measured

Fixpoint seeds: master 88df143ea and the merged batch head.
- tests/cases functions with no blocker: 78,599 → 78,681; covered = verified = matched (one
  unmatched function is the same on both sides).
- `ir-only-census`: programs fully IR-only, 5,431 → 5,477 of 7,135.
- Before the merge, against master 693fd72cd: corpus 45,405 → 45,412 matched; self-compile
  20,202 → 20,202.

| Predicate the IR asks | Legacy writer it mirrors |
|---|---|
| `forInPlainWhy` / `forInElemPlain` (IR builder only) | `emitForInStmt` |
| `mapFilterWhy` (IR builder only), `mfCallbackFe` (shared reader) | the `.map`/`.filter` arm's `emitClosureValue` |
| `closureValueWhy` | `emitClosureValue`'s own refusal |
| `cloEnvOf` | `emitClosureEnvOf` |

## Legacy tails the IR calls

- `emitForInStmt`'s walk helpers, already called by `SForIn`, now at a closure element.
- `emitEnvCacheOpen` / `emitEnvCacheClose` and `emitClosureIds`, already called by `makeClo`.

## Still open

- `capture binding`, 19 functions alone, in seven shapes: next in the closures class.
- `captured call argument coercion`, 15 functions alone.
