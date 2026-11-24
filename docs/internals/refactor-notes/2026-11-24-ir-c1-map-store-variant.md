# `map store value variant bare` (IR-C1)

16 functions in 7 tests/cases programs (master dbeb64c7), all one arm. In `mapSet`, a variant-valued
map's value arm is `variant`, and the IR built only `variantCoerceArmOf == "struct"` (an object
literal at the variant row). Legacy's `emitMapSetValExpr` takes `"variant"` to
`emitVariantCoerce`, whose `bare` arm is `emitVariantPassThrough`: the value as itself, then
`ref.as_non_null` when `exprNullableRefNiche(val) && !readOwesNonNullRecover(val)`.

- **`mapSet`** admits `bare` beside `struct`. The value is built as itself (`mapSetValue`'s plain
  return), and `variantPassValue` checks it lands at the map's value rep (else
  `map store value variant bare rep`, which is 0).
- **The pass-through's own `ref.as_non_null`** is asked with legacy's two predicates. No program
  reaches it: a probe compiler, never committed, found every nullable source in the 7 targets and
  the Q58 sweep to be a niche whose read already recovers (`readOwesNonNullRecover`), which takes no
  pass-through recover. So that case is the named miss `map store value variant bare recover`
  rather than an unwitnessed lowering.
- `ifValue` and `box` (a narrowed union, unboxed) stay their own arms. The sweep's `fromNarrowed`
  is `map store value variant box`, uncovered under both seeds, a class this PR does not touch.

## Q58

`tests/cases/maps/variant-map-store-bare-sources.vl` stores a bare `Circle` from 10 sources: a
`const`, a parameter, a call, a field, an element, a narrowed nullable parameter, local, field,
global and capture. It uses both `m[k] = v` and `m.set(k, v)`, in functions and at module scope.
Each value is read back through `m.get(k)` and its `r` printed. Under `VL_IR_SHADOW=6`, master has
3 covered and 10 uncovered `variant bare`; head has 13 covered = matched. The `--names` module is
byte-identical under both seeds. The five nullable sources are the no-recover witnesses
(`readOwesNonNullRecover`): their `ref.as_non_null` is the read's own, the same bytes on both sides.

## Legacy tails the IR calls

None.
