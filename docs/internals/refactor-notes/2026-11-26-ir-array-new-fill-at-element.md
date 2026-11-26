# Array new fill: delivered at the element rep, boxed where legacy boxes (2026-11-26, lane COV-START)

CENSUS's census (fcf003d9) gave COV-START the coercion family. A scan found one start unit of
`array new fill coercion`, in `intrinsics/array-new-fill-at-union-element.vl`. A scratch build
printed both reps: a `null` fill (`null`) at a `(string | null)[]` element (`?str`). The same
program also missed on `array new fill box`, the IR's named refusal of a fill legacy boxes.

## The mechanism

`arrNew` built the fill with a bare `irBExpr`, at the fill's own rep, and refused a boxed fill
outright. Legacy writes the fill at the element type, as it writes a literal element of the same
value (D16887). The fill is now delivered at the element rep (`deliver`). A fill legacy boxes
(`arrNewFillBoxTy`) is boxed at that union (`boxTempIn` over `unionElemValue`), as a list literal's
union element is.

## Measured

| program | master | head |
|---|---|---|
| `intrinsics/array-new-fill-at-union-element.vl` | start: `array new fill box`; a function: `array new fill coercion` | start and function matched |

- It prints the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/intrinsics/array-new-fill-union-and-nullable-positions.vl` covers a
  function's local, a loop body, a returned list, a module binding read in a function, and two
  record fields. On master its start body and two functions miss; on the head all are matched. Its
  output is the same on legacy and under strict IR.
