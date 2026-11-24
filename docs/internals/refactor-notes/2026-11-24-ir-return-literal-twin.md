# IR: a returned record literal at its result's row (2026-11-24, lane IR-D1)

`return coercion`, the `d15214` family. Seven distilled cells missed as `return coercion`.

## Population, by origin grid

- `named/d15214_plain_inner.vl`: this mechanism, now matched.
- `named/d15293_bound_returned.vl`: a `const`-bound list of records holding un-annotated
  functions, returned from a generic (list rows differ); its own PRE-REVIEW follows. Its
  non-generic spelling is [D17384](../inventory/D17384.md), a loud emit reject.
- `cells/b000017`, `b000057`, `b000058`, `b000418`, `b000498`: blocked first on
  `object variant field box` / `object variant field i64` (lane N5); their return is a BOUND
  literal (`const cc = { r: null }; return cc`) held at the result's variant row, the next step
  once N5's fix lands.

## Mechanism

Legacy's plain return (`emitReturnPlainValue`) writes a struct literal at its layout row
(`objLitLayoutRowOf`); where that row is the function's result row (`fRetStructIdx`, an inferred
twin result having no `structIndexOfTy`), the literal is the result's value, one wasm struct type.
The builder built it at the row's recorded type, another rep, and no retag rule covered a twin
that differs only in a record field's nullability. `retDelivered` now builds such a literal at the
result's rep and type at that row. A struct literal among its fields at another rep of its own row
(`retLitFieldsAtTheirReps`) would take a retag the verifier refuses, so the return misses as
`return coercion nested twin` ([D17385](../inventory/D17385.md)).

## Readings

READINGS

## Legacy tails the IR calls

None new.
