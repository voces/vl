# IR: a boxing spread's rep is its row's box list (2026-11-25, lane COV-CLOS)

COV-START reported this defect in #10090's `spreadBoxedLit`, and the coordinator was copied.

## Defect

A boxing spread (`emitArrSpreadBoxed`'s arm) builds a list of `row`'s union boxes.
`spreadBoxedLit` labelled the result with the rep it was handed. That is the literal's own checker
type: `i32[]`, or `f64[]` after a numeric join. The run and linked-literal groups were built at that
rep too. So the rep misdescribed its elements. Every consumer met a list coercion (`i32[] >>
(i32 | null)[]`) and missed: global initializer, array element, argument, push operand and
declaration coercion. A consumer that took the rep as it stands would have read boxes as `i32`.

## Fix

The result's type is `listTyOfElem(arrRefUnionElemTy(ix, row))`, the list of the row's element.
`listTyOfElem` is a one-line wrapper in `emit_classify.vl` over `mkArrayTy`, which keeps the
checker-import surface flat. Its rep must be a list of boxes, and the build is a miss (`array spread
boxed rep`) otherwise. The run and linked-literal groups are built at that same rep and type. The
verifier now requires a boxing spread's own rep to be a list whose element is a box (`RBox` or a
discipline-4 nullable).

## Census: base (master) → head, over 466 spread programs (tests/cases, distilled, probes)

| | base | head |
|---|---:|---:|
| distinct functions claimed | 3,572 | 3,581 |
| start bodies claimed | 355 | 359 |
| claim fallbacks | 0 | 0 |

No function lost its claim. The consumer classes COV-START listed fall as follows:

| class | base | head |
|---|---:|---:|
| global initializer coercion | 5 | 1 |
| array element coercion | 3 | 0 |
| argument coercion | 3 | 1 |
| store operand coercion | 2 | 1 |
| declaration coercion | 1 | 0 |
| push operand coercion | 1 | 0 |
| ref if arm rep | 1 | 0 |
| coalesce nulRef default rep | 1 | 0 |

One unit moves on to a new miss, `push many run rep`.

`tests/cases/lists/spread-boxed-positions.vl`: all 12 positions are now claimed, against 6 on base,
and the output matches under `VL_IR_STRICT=1`.

## The verifier rule's control

`compiler/ir_selftest.vl` gains two cases, both a boxing spread over an `i32[]` source:
- `spread-boxed-at-box-list` is at a list of `i32 | string` boxes and holds (rule 0).
- `spread-boxed-at-scalar-list` is at `i32[]` and fails rule 2.

`tests/vl_ir_shadow_test.ts` expects both. With the rule taken out, the test fails with
"case spread-boxed-at-scalar-list: want rule 2, got rule 0". With the rule restored, it passes, and
the restored seed is byte-identical to the one built before the control.
