# IR: a captured hole parameter is read at its capture slot's row (2026-11-26, COV-CALL)

This is part of the records part of the "place reads at storage" series: D17578, routed from SOUND
by the coordinator.

**Mechanism.** `g(y)` is keyed at its hole binding `{ f: null }` with `#r.0` = `J`. So legacy declares
the capture slot of `y`, in a closure inside `g`, at `J`'s row (`captureValStructIdx`). The IR's
capture rep (`capTyOf`) took `y`'s checked type, `{ f: null }`. Its valtype check compares only the
first byte, so the two structs passed as one. The capture was then read at the wrong record, and the
closure's call `takeAny(y)` found no conversion (`convert record -> record`).

`capSlotRowTy` now holds a record capture at its slot's declared row (`declRowTy`) where that row's
rep differs. This applies only to a hole parameter: one whose source parameter is unannotated. An
instance's copy carries its key's annotation, so the source node (`nodeSrc`) is the one checked.

**Census.** `VL_IR_SHADOW=5` probe rows over 29,560 programs (tests/cases, distilled, the capability
probes and 5,164 witnesses filed `runs`), merge-base `711da8cec`'s probe against the branch.

The first version moved every record capture to its slot row. It gained 3 programs and lost 4:

- `inner` in distilled `b000009` and in `closures/captured-binding-struct-call-init`, both `let`
  captures;
- `__lambda_*` in `soundness/union-record-narrowing-survives-unrelated-writes` and
  `unions/arm-struct-ref-list-field`, both annotated-parameter captures.

The rule was narrowed to hole parameters, and the rerun showed:

| arm | `fnc` | `fnu` | `fail` |
| --- | --- | --- | --- |
| merge-base | 168,550 | 287 | 0 |
| branch | 168,551 | 286 | 0 |

The one move is D17578's `__lambda_1`, now claimed. Nothing is newly missed.

**Q58.** `tests/cases/closures/captured-hole-param-read-at-its-capture-row-positions.vl` reads the
capture three ways:

- as another hole function's argument (a lambda);
- in a nested function;
- in a field test.

| build | result |
| --- | --- |
| merge-base probe | misses `viaNested` (`closure env capture`), `inner` and the field-test lambda (`convert record -> record`) |
| branch, `VL_IR_REQUIRE_CLAIM=1` | builds and prints `true` three times |
| branch, claims off and `VL_IR_SHADOW=6` | prints the same |

**Not covered.** A closure that returns the capture (`() => y`) builds invalid wasm on master and on
this branch alike: the closure's result row is not the capture's. It is filed as D17676.
