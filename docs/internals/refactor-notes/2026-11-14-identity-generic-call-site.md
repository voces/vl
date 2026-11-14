# A generic body's `===` is refused at the call, on the argument, 2026-11-14

Lane E. DECISIONS A15: "Generics: a body's `===` is an inferred constraint on `T`, reported at the
call on the offending argument like every operator" (roadmap A13, operator-constraint inference).
Until now a generic or un-annotated instance at a scalar was refused soundly, but at the body's
operator, by the instance's re-check.

## What changed

- **Checker** (`checkBinExprNodeReal`). An identity compare whose operand is a hole or a type
  parameter records a `===`/`!==` constraint with `noteBinCstrAt`, as every other operator's hole
  operand does. A concrete operand is still graded in the template, so `a === 5` is refused in the
  body.
- **Call** (`validateBinCstrs`). An identity constraint is graded by the identity rule
  (`identityCstrRefusal`, compiler/check_identity.vl) at the call's substituted types, through
  `binCstrOpRefusal`. So it carries the operators' head and tail: `argument N:`, "(the call's
  argument types)", "the body of `f` applies '===' to arguments 1 and 2". No operator table
  answers `===`, so it is checked before `binOpDefinedFor`.

## Measured

- **Call-site shapes**, each in both faces (`<T>` and un-annotated):
  - shapes: a direct call, a call through a hole parameter, a nested generic, and a method call;
  - the refusal face is `error-identity-eq-generic-call-site.vl` (seven calls, each refused at the
    call);
  - the run face is `identity-eq-generic-call-sites.vl` (eleven answers at a record or list,
    `!==` included).
  - **Anchor.** The refusal sits on the argument whose type has no identity (`identityArgOf`,
    else the call's own arguments): "argument 1: `===` compares identity, and `i32` has none —
    use `==` (`same` hands it to a body that applies `===`, directly or through a parameter)".
    The constraint binds a parameter, but the value is what the user fixes.
  - **A generic passed as a value** (`viaHole(same, 1, 2)`) is instantiated where it is passed,
    and no table reaches the enclosing call's arguments from there. The refusal stays at `same`,
    and its sentence names the type and the route: "`same` is passed here as a value and
    instantiated at `i32`, where its body applies `===`". The precise anchor is filed as D16110.
- **Regression:** the nine `identity-eq-*` position matrices run 66 of 66, and the identity cases
  pass.
- **Sweep.** SWEEP.
