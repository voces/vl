# IR object field: an explicit `null` for a nullable map field (2026-11-25, lane COV-IS)

- **The miss**: `object field explicitNull typed null` is a struct field given an explicit `null`
  with no null of its own (`fieldNullOwnOf`). The builder took only a typed reference's null
  (`fieldTypedNullHas`).
- **Legacy**: its explicit-null arm writes the null through `emitOmittedFieldNull`, which also
  writes a nullable map's null as its map struct's `ref.null`.
- **Scope**: CENSUS's list at `165d853b` holds 10 programs with this miss, 6 of them start bodies.
  A probe printing the check's two halves showed 9 of the 10 are a nullable map field at a nullable
  destination. The tenth (`generics/generic-application-struct-field.vl`) is a record destination,
  and stays the named miss.

## What landed

- **The predicate**: `fieldTypedNullWrites` (`wasmEmit.vl`) names what `emitOmittedFieldNull`
  writes as its heap's `ref.null`: a typed reference or a nullable map.
- **Its askers**: the writer itself (byte-neutral), the builder's field check
  (`structFieldWhy`), and `fieldExplicitNullTyped`.

## How it was measured

- **The class**: 9 of CENSUS's 10 programs now claim every function and start body, and all match
  under `VL_IR_SHADOW=2`.
- **Legacy identity**: the 713 programs under `tests/cases/{structs,records,maps,sets}` build
  byte-identical under a compiler built from `origin/master` and under this one.
- **Q58 position sweep** (`tests/cases/records/explicit-null-nullable-map-field-positions.vl`,
  new): the record built with `m: null` as a `let`, an argument, a return, a nested record's field,
  a list element and an assignment's value. On master the 6 functions are this miss; here all 68
  functions match and it prints its 7 lines.
