# An arm cell's rowless record literal is held at its variant row (2026-11-24, lane IR-N5)

A `let` whose cell kind is `variant` (`letIsArmCell`), bound to a record literal whose own type has
no row (`{ r: null }`, `{ r: 7 }`) that is stored at a union arm's row (`Circle = { r: i32 | null }`
or `{ r: i64 }`), is held by legacy at that variant row: `emitVariantCoerce` builds the literal
there, boxing the `null` or widening the `i32`, and the binding's local is the row's struct. The
IR typed the binding at the literal's own type, so `objLitAt`'s field kid was `null` / `i32` and
the variant field arm missed (`object variant field box`, `object variant field i64`); the maker
returning the binding also missed as `return coercion`.

## The change

- `rowlessLetTy`: where the declared slot names no struct row and the binding is an arm cell, the
  rowless type is held at the variant row's arm type (`rowlessStoredTy` over `uVarTyIx`). The
  literal is then built at the row's rep, and `return cc` returns at the row as legacy does.

Corpus: b000017, b000057, b000058 and b000418 are matched; b000498 keeps `array element
coercion` (D1's).

New test case: `unions/rowless-literal-at-variant-arm-in-each-position.vl` (a binding returned in
the `null`, value and `i64` arms, a direct return, an argument, a list element, a record field, a
`let`, a reassigned binding, a captured one, one delivered at a nullable arm).

## Not in this change

- A maker whose result reaches no arm consumer keeps `return coercion`.
- A captured arm cell returned through its lambda (`return g()`) misses as `tail coercion`, on
  master too.
