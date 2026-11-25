# IR hoisted loop receiver: a list narrowed out of a union box (2026-11-25, lane COV-IS)

- **The miss**: `hoisted receiver read` is a loop whose hoisted receiver (`irHoistRecv`) is a
  local the builder read through a narrowing unbox, with no `irReadAgain` row to read it with
  again. The narrowed read's atom arm (`identUnboxAtomOf`) recorded none.
- **Where it bit**: `scripts/render-parse-census.vl` (`walkSite`), an I8 ratchet tool, whose
  `u8[] | E` source is narrowed by an early return and walked by a `while` over `.length`.

## What landed

- The narrowed read's atom arm records its `Rhs` in `irReadAgain` when the unbox leaves the read
  at `rep` (`irBUnboxKindRep(ak, rep) == rep`), as the container arm below it already does.

## How it was measured

- **The tool**: `render-parse-census.vl` goes from 243 matched and 1 mismatch (this miss, in
  `walkSite`) to 244 matched under `VL_IR_SHADOW=2`.
- **Legacy identity**: the 1,534 programs under `tests/cases/{unions,narrowing,loops,arrays,lists,null}`
  build byte-identical under a compiler built from `origin/master` and under this one (126 of them
  are refusals that build under neither).
- **Q58 position sweep** (`tests/cases/unions/narrowed-list-hoisted-loop-receiver-positions.vl`,
  new): a `u8[]` split by a separator with an inner loop's condition, an `i32[]` and an `f64[]`
  summed, an element compared in the body, and the error arm's early return. On master the 5
  looping functions are this miss; here all 8 functions match and it prints its 6 lines.
