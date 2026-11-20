# IR: a union-element list literal, 2026-11-20

The `union elem` half of the `array ref` blocker. It waited on IR5's non-null value-union box arm
in `holeBoxPlanOf` (#9193), and it reuses that arm at the list-element position rather than
building a second one.

## Sizing (census on master `13046ac7b`, a probe seed naming the reason)

`array ref` alone was 445 functions on master. By reason:

| reason | functions alone |
| --- | ---: |
| union-element slot, every element owes a box (`boxOwedAt`) | 289 |
| non-null variant element | 63 |

No union-element literal had an element that owed no box. The probe seed was built straight to
the scratchpad, and the real seed was checked byte-identical afterwards.

## The change

- **One decision, `arrLitUnionBoxSlot(arrIx, fnIx, lb)`** (`emit_plan_list.vl`). It answers with
  the union-element slot of a short list literal (within the chunk cap) whose elements all owe a
  box by their own delivery's record, else -1. `arrLitRefShortSlot` is the slot either short arm
  builds at.
- **Legacy:** `emitArrRef` takes the arm first and writes each element through `emitDelivered`.
  That is byte-identical to its union path for these literals: `emitUnionBoxOwed` takes
  `emitDelivered` whenever `boxOwedAt` holds, and a literal within the cap is not chunked.
- **IR:** `arrayLit` takes either short arm. Each element is delivered at the list's element rep,
  so `widenTo` boxes it through `boxTemp` and `holeBoxPlanOf`. `makeList` closes the arm's tail
  at `arrLitRefShortSlot`.
- **The guard the grade found:**
  - A generic lambda's instance can rep the literal at its bound member (`i32[]`) while legacy's
    slot is the box list (D16918, D16924, `maps/ref-list-value-boundary.vl`).
  - There the IR built unboxed elements that passed its element-rep check, and the claimed module
    was invalid.
  - The builder now misses (`array union element rep`) unless the list's element rep is held as
    a box.
- **`tests/vl_ir_shadow_test.ts`:** the union-element literal in the reserved-list test is now
  built and matched. The list reserve stays a named miss.

## Readings (fixpoint seeds, master `13046ac7b` against this change)

| reading | master | this change |
| --- | ---: | ---: |
| corpus functions with no blocker (census) | 37,545 | 37,749 (+204) |
| `array ref` alone | 445 | 148 |
| corpus covered = verified = matched (shadow) | | 37,749 |

Compiler lines: +51 −6, 45 net (`emit_plan_list.vl` +28, `ir_build.vl` +9, `wasmEmit.vl` +8,
`ir_lower.vl` 0), about 4.5 corpus functions per net line.
