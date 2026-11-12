# step7 inst: D15943 — a list literal of open maps no longer takes slot 0's row

Lane w321, D15943 (clause 1). The program pushes a list literal `[m2, fnMap]` onto
`(({[string]: (a: f64) => f64})[])[]`, where `m2` and `fnMap` are maps of un-annotated
functions. It passed `vl check` and built a module that failed to validate.

## Mechanism (probed)

`wasm-dis -n` showed the literal built as an array of `struct {structref, i32, i32}`, a
function-value row. The holder's element is a list of maps.

- The literal keeps its open type `{[string]: (_) => _}[]`, so `arrLitRowSlotIn` finds no row.
- `arrRefSlotOf` then took slot 0, the first list row interned. That is a guess, and here a
  wrong one.
- D15942's delivery change already closes the maps' slot facts and pins in agreement (probed:
  `et` = `nt` = `{[string]: (f64) => f64}`). What remains is the literal's own row.

## Change (wasmEmit, a containment)

Where `arrRefSlotOf` would fall back to slot 0 for a literal whose first element is a map, it
now refuses with `emitProgram: a list literal of maps whose value type is still open names no
list row`.

The fix is to give the pushed literal the holder's element type, or to mint its list-of-map row.
D15943 stays open as clause 2.

## Grading

- `map-of-hole-fns-pushed-onto-map-list.matrix.vl`, base #7596's head:
  - `array_push` (both faces) and `map_set` (annotated) go from SILENT to a loud refusal;
  - runs → not-runs 0, → silent 0, → program trap 0.
- Neighbouring matrices: see the PR body.
- Probe: `list-literal-of-hole-fn-maps-pushed-onto-annotated-list-of-lists.vl` (GAP).
