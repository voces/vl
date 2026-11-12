# Step 7 L6 (step C1): a union box is built into the row its destination type keys to, 2026-11-12

Step C of the union registry's move to type: `emitUnionBoxArg` and `emitUnionBoxOwed` answer
from the type they are handed, not from the name their caller derived. C1 is the entry point;
C2 threads a type to the callers that pass none, and C3 stops the callers that hold one from
deriving a name.

## Changed

`emitUnionBoxArg` (which `emitUnionBoxOwed` delegates to) builds into the row its destination
type keys to (`boxDstName`), named as registered. That happens when the type keys a row and the
caller's name does not already name it in any spelling. Otherwise the caller's name stands.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, classified each entry
over every `tests/cases` file and distilled `cells/` cell (9,202):

| class | `emitUnionBoxArg` | `emitUnionBoxOwed` |
| --- | --- | --- |
| the name is the type's row's name | 30,933 | 22,371 |
| the same row under another spelling | 52 | 900 |
| the name bound to no row (changed here) | 24 in 8 programs | 51 in 19 |
| the name bound to another row (changed here) | 0 | 13 in 6 |
| the type keys no row (value unions such as `i32\|null`) | 362 | 238 |
| no type passed (C2) | 2 | 1,952 in 875 |

## The changed entries' programs

**Bound to another row: these 6 print their `// @log` wants on master.** The names are value
unions (`f64|null` handed in for `f64|i32|null`, `i32|i64` for `W`). A value atom's box tag is
global per atom kind (`scalarTagOfKind`), not a position in a row, so the wrong name builds the
same box. Under this change each still prints its want, and its module is byte-identical:
- `tests/cases/generics/generic-list-result-element-row.vl`
- `tests/cases/generics/match-join-of-nullable-param-keeps-concrete-arm.vl`
- `tests/cases/literal-unions/coalesce-hole-call-litunion-join.vl`
- `tests/cases/literal-unions/mixed-width-litunion-function-boundary.vl`
- `tests/cases/unions/inferred-return-literal-member-union.vl`
- `tests/cases/unions/litunion-mixed-width-arith.vl`

**Bound to no row: under this change each of these 19 prints its `// @log` want, and its module
is byte-identical to master's:**
- `tests/cases/closures/nullable-closure-map-array-union-result.vl`
- `tests/cases/conditionals/if-arm-nested-join.vl`
- `tests/cases/generics/complement-list-record-scalar-and-hole.vl`
- `tests/cases/generics/fn-param-list-union-result-narrowed.vl`
- `tests/cases/generics/generic-param-complement-list-record.vl`
- `tests/cases/generics/list-of-param-arm-narrow-index.vl`
- `tests/cases/generics/list-union-param-dead-test-early-return.vl`
- `tests/cases/generics/list-union-param-narrowed-joined-literal.vl`
- `tests/cases/generics/map-declared-return-flattens-at-pin.vl`
- `tests/cases/generics/pin-inferred-from-union-argument.vl`
- `tests/cases/generics/union-return-pinned-at-two-unions.vl`
- `tests/cases/literal-unions/mixed-width-litunion-coalesce.vl`
- `tests/cases/literal-unions/nullable-mixed-box-eq-across-delivery.vl`
- `tests/cases/types/nullable-alias-composed-with-null.vl`
- `tests/cases/unions/coalesce-declared-union-inferred-binding.vl`
- `tests/cases/unions/coalesce-declared-union-inferred-is-narrow.vl`
- `tests/cases/unions/coalesce-join-box-cell-and-result-name.vl`
- `tests/cases/unions/join-arms-typed-at-destination.vl`
- `tests/cases/unions/print-if-expression-join.vl`

## Proof

- **Local full sweep**, `sweep.vl record` with fixpoint seeds on both sides, against master
  `784c38bf`:

  ```
  same                            23994
  bytes-only movers                   0
  output movers                       0
  runs -> not-runs  (blocking)        0
  new compiler traps  (blocking)      0
  ```
- **Locally:** lint-self, rep-fuzz, `cases_wasm`, the memo-generation, state-audit and scaling
  tests, emitter-state-audit, capability probes (`--live-sites`, `--floor`), splice-scan,
  seed-size, late-demands, and the dead-export and render-parse budgets.
