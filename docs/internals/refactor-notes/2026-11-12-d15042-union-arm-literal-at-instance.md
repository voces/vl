# D15042: a literal whose own type holds the type parameter picks its union arm by that type at the instance, 2026-11-12

This closes D15042, a clause-1 row (check-clean invalid wasm). It took priority over cut 5 by
the orchestrator's ordering.

## Mechanism

In `g<T>`, the checker adopts `{f: t}` (own type `{f: T}`) at the first arm of
`{f: i32} | {f: T}` its field names fit, which is `{f: i32}`, because `T` is open in the generic
body. `unionArmOfLitTy` (`emit_value_sites.vl`) picked the arm by that adoption (`nodeRepTyAt`).
So at the `f64` instance the literal was built into the `i32` arm's struct, and the module failed
to validate. A probe in `unionArmVariantForObj` showed it: the literal's rep was `{f: i32}`, and
the instance's union rows were `{f: i32}` and `{f: f64}`.

## What changed

- **`litInstTy(objIx, fnIx)`** is new: the literal's own type with the instance's bindings
  substituted (`elabInstTyAt`), when that type holds a type parameter they close. Otherwise -1.
- **`unionArmOfLitTy`** matches the arms against that instance type ahead of the adoption.
  Matched that way, it skips `objMatchesVariantIdxOmit`'s field-fit check. That check classifies
  the field value by its generic spelling and refused the `string` instance. The literal's
  instance type is the arm, so there is nothing left for the check to settle.

## Witnesses

The fixture `tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl`
covers:

- the row's `if` at `f64` and at `string`;
- a bare delivery;
- the other arm order;
- the concrete control.

Every spelling of the row's ablation runs. `T := i32`, where the two arms coincide, was a loud emit
reject (`ref valtype with no interned shape`) before this change and is unchanged by it.

D1578's witness was D15042's program, because D1578 is about the invalid-wasm diagnostic. It now
uses D2660's, which is still check-clean invalid wasm.
`check-filed-witnesses.vl --strict`: 4,802 graded, 0 MOVED.

## Measurement

This can move output, so the sweep is CI's under the `sweep` label, per the 2026-11-12 process.
