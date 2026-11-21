# IR: node-keyed coercions as `RCoerce` (2026-11-21, lane IR-N2)

`pre-path coercion` was 215 corpus functions at 4c186c33. Split by coercion kind
(`coerceKindAt`), over the corpus and `tests/cases`, alone:

| kind | functions |
|---|---:|
| `mapRetag` | 130 |
| `listCopy` | 128 |
| `recCopy` | 11 |
| `fnClo` | 9 |
| `mapUnbox` | 3 |

These are the node-keyed rows of I8's design note (`2026-11-16-ir-i8-coercion-ops.md`). They need
no seat. Legacy's `emitCoerced` sets `coerceHeld` to the node, emits the value (whose `emitExpr`
then skips the coercion), and writes the kind's tail: `emitListCopyTail` for a copy, and
`emitMapRetagTail` for a retag when the value is a box.

## The change

- **Legacy, bytes unchanged.**
  - `exprPrePathWhy`'s checks past the coercion are their own export, `exprPrePathPastCoerce`.
  - The two kinds' tails are one shared `coerceTail`, which `emitCoerced` now calls for them.
- **IR.**
  - `exprAt` sends a `pre-path coercion` node to `coerced`. That builds the value through
    `exprAtPre` with the pre-path past the coercion, as legacy builds it under `coerceHeld`, then
    appends `RCoerce { cvV, cvAt }`.
  - A list copy's temp is at the type it delivers (`listCopyAtNode`, at the instance). A retag's
    is at the box's own type, and the retagged box must be at it.
  - The lowering writes the operand, then `coerceTail`.
  - A kind it does not take misses by name: `pre-path coercion recCopy`, `… fnClo`, `… mapUnbox`.
- **No held seat in the builder.** The value is built through `exprAtPre`, not under a module
  global saved and restored around the build, so phase-state's hidden count does not rise.

Stacked on `ir-box-closure-arm`.

## Witness

`tests/cases/unions/coerced-list-copy-and-box-retag.vl`: a `Circle[]` delivered into `Shape[]`, and
an `f32 | f64` field read delivered into a generic. Under the merge-base seed both stop at
`pre-path coercion`; after, both are covered and matched. Row file
`tests/ir-shadow-rows/coerced-list-copy-and-retag.vl`.
