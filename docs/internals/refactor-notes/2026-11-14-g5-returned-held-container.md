# A returned held container of functions is built at its result's row (G5), 2026-11-14

Lane B, the G5 group of the un-annotated-function census: D15753, D15755, and D16136's
no-`if` spelling. Stacked on #8025 (D16124).

## What changed

- `fn_ret_shadow.vl` `frsMintRetLits`: a `const` whose initializer holds functions, returned by
  name, has its initializer's list literals minted before the result's token is read. The
  binding's slot fact then has a row, `frsValuesBuiltTy` takes it, and the result columns name
  the ref list the binding is built at instead of `i32`.
- `emit_classify.vl` `inferredRetMapSlotCore`: an open-typed tail is read at `mapShapeOfExpr`,
  the shape it is built at.
- `wasmEmit.vl` `retStorageMismatch`: a map is compared against `cloRetValSlot`, the slot the
  function's signature carries, not the return column.

A first cut minted every `const` reached under a returned value and lost five corpus cells
(`d592_nest_obj_*`, `d007023`: a generic's `xs[0][0]`, a returned list of maps). Narrowed to a
binding returned directly whose initializer holds functions, it loses none.

## Evidence

- Fixpoint: the third `refresh-compiler.sh` is `cmp`-identical to the second.
- `regress.vl` against #8025's fixpoint seed: no cell moves.
- 79 `matrix/*` templates naming a hole or function and a return, delivery or map, `--before`
  #8025's seed: one cell moves, `value-join-of-maps-of-hole-fns` `return_inferred` annotated,
  emit refuses → RUNS; 0 runs → not-runs; the silent cells are the same before and after.
