# D17088: a `null` binding's initialiser runs for its effect (2026-11-24, lane S1)

`emitNulNoneLeafPayload` writes the value of a binding or a global of the `null` unit type. It
ran a call and a `??`, and wrote every other leaf as `ref.null none` alone, so `const x = (s =
null)` never stored. It now writes an assignment `asgYieldsNullLit` names as its store, then the
bottom null, and runs any other leaf through `emitNulNoneLeafForEffect` first. A bare `null` or a
name read writes nothing, as before.

The IR's let builder writes the same: `assignTo`, then `RNullOf` with `NULL_OWN_NONE`. The named
miss `#9807` left at such a binding is gone.

## Moved programs

A probe compiler that failed on each new branch, checked first against the witness, swept every
`tests/cases` program, capability probe and distilled cell (21,855 programs). Six reach the change;
none changes output (base: #9807's head `e52f678fd`).

| program | branch | bytes | output (= `@log`) |
|---|---|---|---|
| `unions/deep-is-arm-write-in-expression.vl` | the assignment | moved | unchanged |
| `arrays/record-list-field-copy-widen.vl` | a field read, run and dropped | moved | unchanged |
| `generics/hole-guarded-call-through-null-typed-field.vl` | a field read | moved | unchanged |
| `generics/hole-guarded-call-through-null-field-no-declared-row.vl` | a field read | moved | unchanged |
| `types/optional-member-null-only-receiver.vl` | a `?.` off a name | same | unchanged |
| `closures/null-only-optional-read-and-call.vl` | a `?.` off a name | same | unchanged |

## Left out

The three union-box destinations of a `null` value (a typed binding, an argument, a value `if`)
never reach this writer with an assignment: `exprIsNulNone` does not name one. That is D17090.
