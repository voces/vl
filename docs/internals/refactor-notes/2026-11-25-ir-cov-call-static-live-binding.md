# COV-CALL: one static answer to "does a binding shadow this callee" (2026-11-25)

Lane COV-CALL, class `call of a non-declaration: not routed to a closure` (the census splits it out
through `censusPlainWhy`, `scripts/ir-i8-census/probe-patch.sh`).

## Mechanism

`userFnCallRoutesRef`, `numIntrCallReached`, `emitCallCoreUserFn` and `callIsIntegralFloatIntr`
decide whether a call of `w` reaches a parameter, local or capture named `w` or the module
function `w`. They asked `identNameIsLiveBound(name, fnIx)`, which reads legacy's emit-time scope
stack (`scopeSlotOf`). The IR builder asks the same routing question before legacy has emitted the
body, so the stack does not hold the body's locals. A call of a local closure that shadows a module
function then read as the function's, and the builder refused it.

`identNameIsLiveBound` is deleted. All four sites ask `identNameIsBoundAt(name, fnIx, callee)`,
the positioned predicate `emit_classify.vl` already had (D3607). It reads the binder's resolution
(`localIndexOf` through `declaredSlotOf`), parameters, captures and, for a body `let`, whether the
binding's scope covers the read. The builder and legacy now share one producer (R8), and no mirror
exists.

## Legacy is byte-identical

A master seed (`git archive origin/master`) and this branch's fixpoint seed build every program to
the same bytes, with equal exit codes:

| population | programs | differing |
|---|---:|---:|
| `tests/cases` | 9,422 | 0 |
| distilled + capability probes + this class's witnesses | 18,150 | 0 |
| self-compile (this source, master seed vs fixpoint seed) | 1 | 0 |

## Census (class programs, `CENSUS_CLASS=classes/call-of-a-non-declaration.txt`)

| `not routed to a closure` | before | after |
|---|---:|---:|
| functions | 5 | 2 |
| start bodies | 4 | 0 |

Claimed: the two `shadow-closed-block-closure-*` start bodies, D2415's start, D2703's `f`, and the
generic `pr`/`pr$1` of D4304 and `destructured-field-named-like-generic-fn-in-generic-body`.
Left: `G` in the two `hole-guarded-call-through-null-*` cases, a `null`-typed callee. Legacy writes
`unreachable` and prints that value through `__print_i32__`, and the IR picks another print arm. It
is a separate mechanism. No new first miss in any other class, and no claim fallback.

## Proof

- Q58 sweep: `tests/cases/scope/shadow-binding-call-positions.vl`. A shadowing parameter, local,
  alias of a function, loop variable, capture and match-destructured field are each called at
  return, argument, binary operand, condition, record field and list element positions, and at
  module scope. A call after the binding's block closes reaches the module function. With
  `VL_IR_STRICT=1 VL_IR_SHADOW=6` the program builds identical to the master seed, and the IR
  claims 2 more functions than on master.
