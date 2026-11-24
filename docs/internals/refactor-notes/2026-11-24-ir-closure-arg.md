# IR coverage: `closure argument coercion`, a `null` at a function value's nullable reference parameter (2026-11-24, lane IR-N8)

`closure argument coercion` on master 89ce9eef: 7 functions (2 non-start, 5 start bodies) over 5
tests/cases programs, none in the distilled corpus. A probe naming the site, arm, parameter kind
and argument rep at both of `closureCallAt`'s sites put all 7 at the second: the general arm, a
`nulclosure` (3) or `nulmap` (4) parameter, and an argument at the `null` rep. Each is a bare
`null` handed to a function value (`gg(null)`, `h(null)`). Legacy's general arm writes it with
`emitNullLitNode`; the IR built the literal at its own rep, which `closureArgRepIs` refuses for a
reference kind.

- **`closureCallAt` (ir_build.vl)**: on the general arm, with no widening and no box parameter, a
  `NullLit` argument is delivered at `closureParamRep(f, i)` through `deliver`, whose null-literal
  path builds the null `nullOwnAt` names at that rep.

The null written is legacy's: decoding the code section, `callFn` and `callMap` in the neighbour
case write `0xD0` with heap type -15 (`none`, the bottom ref) under legacy, under the IR with every
function claimed (`VL_IR_SHADOW=3`) and on the base; the modules are byte-identical.

## Measured

Base master 89ce9eef, head its merge with this branch; both seeds fixpoints.

- The class: all 7 rows leave. `closures/fn-value-nullable-fn-param` (2 fns + start),
  `closures/nullable-map-param-lambda-pin` (start) and `maps/i32-keyed-function-type-parameter`
  (start) match. `closures/fn-value-generic-nullable-fn-param`'s start moves to `argument coercion`
  (N8's direct-call family); `closures/fn-value-nullable-map-null-bool-sig`'s function and start move
  to `call of a non-declaration` (FREE).
- Armed shadow: tests/cases 79646 → 79662 matched, corpus 46798 → 46798; 0 mismatch.
- Covered-fell per program: tests/cases fell 0, rose 5; corpus fell 0.
- L2 self-compile fuel per PR +0.00%.

Neighbours, `tests/cases/closures/fn-value-null-at-nullable-reference-params-runs.vl`: `null` and a
value at a function value's nullable string, record, list, closure and map parameter, the callee
printing which path ran. Closure and map move from `closure argument coercion` to matched, string
from `expression null` to matched; record and list stay at `call of a non-declaration` on both.

Position sweep (Q58), `tests/cases/closures/fn-value-null-arg-positions-runs.vl`: the call in 11
positions (direct call argument at a scalar and a union parameter, nested call argument,
string-concat operand, interpolation hole, `return`, `const` initializer, `if` arm, `??` operand,
record-literal field, and a map parameter). Base: 11 `closure argument coercion`; head: all 80
functions matched under `VL_IR_SHADOW=6`, no order row; `ir-identity --claimless` over the sweep,
the neighbour case and the row: identical 3, differ 0; output identical with and without claims.
Row: `tests/ir-shadow-rows/closure-null-literal-at-nullable-ref-param.vl`.

## Legacy tails the IR calls

None new: `closureParamRep` and `deliver`'s `nullOwnAt` path.
