# IR: a map walk binds its key or value at the rep the map stores it at, 2026-11-24

Lane IR-N6, the class `for in map element` (the queue's ack; a different site from D1's
`for in element <kind>`, which is `forInPlainWhy` refusing a LIST's element kind). The builder's
`forInStmt` refused a map walk (`forInMapRecv` names a receiver) whose element rep was neither an
`i32` nor a string, and the verifier's `SForIn` rule allowed only those two.

## The mechanism

Legacy's walk (`forInLoopAt`, `forInMapStash`, `forInMapList`, keyed by `forInElemKind`) writes a
map walk at any element kind its keys or values list stores; the IR's lowering already calls it.
The new shared helper `mapWalkElemRep(mapRep, vals)` (ir.vl) answers the rep a walk binds: the map's
value rep (`rmVal`) for `.values()`, else its key type's rep (`tyMapKeyOf(repTyOf(map))`), under a
nullable map's inner map. `SForIn` carries `xfVals` (the walk reads values); the receiver's rep is
the operand's, or the global's (`irGlobalRepOf`, which the verifier reaches).

The admission WIDENS, never narrows: the builder and the verifier admit the variable at an `i32` or
a string, as before, or at `mapWalkElemRep`. The first cut admitted only the stored rep, and that
was a narrowing: a set's string values (its map stores `bool`), a nested map's keys and an
i32-keyed map's walks fell, 35 self-compile functions among them. Anything else is
`for in map element rep`, which fires nowhere.

Four keyed self-tests (`walk-map-value-record` 0, `walk-map-value-off-rep` 2, `walk-map-key-i32` 0,
`walk-map-key-off-rep` 2) pin the rule; the existing `walk-pair-map-value-*` cases are keys walks.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, master dbeb64c7)

Each arm is measured with `VL_IR_SHADOW=4 vl check --codegen --compiler <that arm's seed>`, the base
seed built from `git archive dbeb64c7`. Functions with no blocker: tests/cases 80,520 -> 80,535;
distilled corpus 46,828 -> 46,832. `for in map element`: tests/cases 15 sole -> 0, corpus 4 -> 0.
`for in map element rep`: 0. No program loses a function.

| program | change |
| --- | ---: |
| `maps/i64-keyed-value-kinds.vl` | +2 |
| `maps/i64-keyed-walk-mutation-against-reference.vl` | +2 |
| `maps/is-narrower-map-tests-values.vl` | +2 |
| `closures/for-in-closure-array.vl` | +1 |
| `loops/forin-same-named-loop-vars-union-box.vl` | +1 |
| `maps/churn-sliding-window-every-rep.vl` | +1 |
| `maps/for-in-map-element-at-stored-rep.vl` (new witness) | +1 |
| `maps/i64-keyed-in-containers.vl` | +1 |
| `maps/litunion-map-key-every-consumer.vl` | +1 |
| `maps/map-values-bound.vl` | +1 |
| `maps/pair-index-insert-only-against-reference.vl` | +1 |
| `types/recursive-map-value.vl` | +1 |
| corpus `d16565_values_pinned_after`, `d16565_values_pinned_before`, `d2659_rv3189_i64_Rec_o2_global_is`, `d2659_rv3189_i64_Rec_o2_global_match` | +1 each |

The one armed tests/cases mismatch (`unions/empty-list-is-store-back.vl`, `stack value read out of
order`) is the same on both seeds and is not this change.

## Position sweep (Q58)

`scripts/capability-probes/matrix/map-walk-element.matrix.vl`: a loop variable exists only inside
its loop, so each position is a cell delivering it from the loop body (call argument at a scalar and
a union parameter, nested argument, concat, interpolation, `let`, `if` arm, `??`, record field,
`return`), for record values and `i64` keys, plus closure values called in the body. 84 of 84 graded
cells RUN before and after; under `VL_IR_SHADOW=6` covered 1,026 = verified 1,026 = matched 1,026,
nothing uncovered; `ir-identity.sh --claimless` over them is identical 84, differ 0.

Neighbours: `tests/ir-shadow-rows/map-walk-i32-or-string-neighbours.vl` holds the walks the first,
exact-rep-only cut refused (a set's values, a nested map's keys with its value, an i32-keyed map's
keys). Against that cut one of its functions falls to `for in map element rep`, so the row reds on a
narrowing. The programs that fell then: tests/cases `maps/forin-narrowed-nullable-map-views.vl`,
`maps/forin-nested-map-value.vl`, `maps/i32-keyed-alongside-string-keyed.vl`,
`maps/i32-keyed-ref-value-order.vl`, `maps/list-of-maps-scratch-frame-reservation.vl`,
`maps/pair-index-against-reference.vl`, `sets/distinct-type-every-position.vl`; corpus
`d16565_set_values_pinned`, `d2648_rv3189_i32_i32_o6_join_is`, `d2648_rv3189_i32_i32_o6_join_match`.

Witness: `tests/cases/maps/for-in-map-element-at-stored-rep.vl` walks six three-entry maps (`i64`
keys; `string | null`, `i32[]`, record, closure and `f64` values, one value `null`, the closures
called in the body); it prints the same under both seeds, and the candidate covers its walk
(base refuses it at the class). Shadow row `tests/ir-shadow-rows/map-walk-element-at-stored-rep.vl`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
