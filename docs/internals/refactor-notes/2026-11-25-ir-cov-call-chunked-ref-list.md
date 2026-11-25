# COV-CALL: a ref list literal past the chunk cap (2026-11-25)

Lane COV-CALL, class `array ref`, part (a) of the coordinator's split. It waited on COV-START's chunk
writer (#10141).

## Mechanism

`emitArrRef` builds a ref list past `allocLitChunk()` (256 elements in a function body) in chunks.
The IR's ref arm knew only short slots, so it missed on `array ref`.

- **`arrLitRefLongSlot`** (emit_plan_list.vl) is the chunked twin of `arrLitRefShortSlot`: the plain
  slot and the union-box slot, each element as is or boxed by its own record, past the cap. The
  short forms keep their cap; both share one body (`…SlotAt(…, long)`).
- **`arrLitVariantLongSlot` and `arrLitUnionLongSlot`** (wasmEmit.vl, IR-only) drop their cap, so a
  long variant list and a long numeric-union list build per element too.
- **Lowering:** `refLitSlot` picks the slot once. A literal past the cap opens, steps and closes
  through `arrLitChunkPlanOf("ref", slot)`; within it, the short tail as before.
- **Builder:** a chunked list whose elements open a valued `if` is a named miss, `chunked list
  valued element`. The chunk flush lands between elements, and an `if`'s out waiting below later
  elements cannot cross it.

## Census (`CENSUS_CLASS=classes/array-ref.txt`, rows)

| row | before | after |
|---|---:|---:|
| `array ref` | 3 | 0 |

## Proof

- **Q58 sweep:** `tests/cases/arrays/ref-list-chunked-positions.vl` has 260-element literals at a
  local, a return value, an argument, a module `const`, a `for` iterable, a numeric literal union's
  list (function and module) and a variant list.
  - On master the IR leaves 6 of its functions and the start body uncovered on `array ref`.
  - With this change all are claimed and match, except the variant list, which misses as
    `chunked list valued element`.
- Every class program builds under `VL_IR_STRICT=1 VL_IR_SHADOW=6` to the base seed's bytes.
