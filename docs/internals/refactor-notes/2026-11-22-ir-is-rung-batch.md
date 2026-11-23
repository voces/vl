# IR batch: the `litMember` rung, the `boxStash` rung, two slot-after-operand moves (2026-11-22, lane IR-N1)

A batch under the coordinator's rule: two IR mechanisms and the two legacy byte changes they need,
a commit each.

## What landed

- **`litMember`** (`x is "lit"`): one string literal's test is built as the literal arms'
  `memberEq` over that member (`isLitArmsTest`), which `emitLitMemberEq` writes alike. A number
  literal is a named miss (`litMemberIsString`). The lowering's plan check accepts a `memberEq` on the
  `litMember` rung (`litArmsPlanHolds`).
- **`boxStash`** (`l ?? d`): `CoalValArm` gains `boxStash`, an `SCoalBox` in the `box` family. The
  operand is an ordinary value, the default is delivered at the box rep into `cbNull`, and the
  lowering writes the operand, legacy's head (`coalBoxStashOpen`, split from
  `emitCoalesceBoxStash`), the else, the default and the end.
- **Legacy, slot after operand**: `emitCoalesceBoxStash` and `emitListIsAcrossReps` take
  `sharedFieldRecvSlot` after writing their operand, the fourth and fifth sites #9599 named. The
  IR's `listAcross` no longer limits its receiver to an identifier. A sixth site,
  `emitPrintValueUnion`, was #9599's own; it was the reason a `??` inside `print` kept legacy's
  slot first in the first proof.

## Moved programs (Q15)

Over 20,019 programs (`tests/cases` without `@error`, the distilled cells and named sets, the
capability probes), master `a4f254ab` against this branch, each built claimless and shipped:

| program | site |
| --- | --- |
| `closures/shared-let-read-early-traps-union.vl` | boxStash |
| `closures/shared-let-read-early-traps-value-union.vl` | boxStash |
| `closures/shared-let-without-zero-value.vl` | boxStash |
| `literal-unions/coalesce-hole-call-litunion-join.vl` | boxStash |
| `literal-unions/coalesce-litunion-int-default-arith.vl` | boxStash |
| `maps/union-of-maps-read-through-field.vl` | boxStash |

The claimless and shipped sets are the same 6, and no build changes its exit code. The
`listAcross` move alone moves none. Run outputs are identical in both arms of all 6. `wasm-dis` on
the first two shows only two `(local …)` declarations swapping and their `local.get`/`local.set`
indices renumbering.

## Coverage

Fixpoint seeds of this branch and of master `a4f254ab`.

| population | master | this branch |
| --- | ---: | ---: |
| `tests/cases` functions covered / matched (armed shadow) | 70,137 / 70,136 | 70,154 / 70,153 |
| `tests/cases` start bodies covered / matched | 6,168 / 6,167 | 6,177 / 6,176 |
| `coalesce nulRef boxStash` rows, functions / start / fragment | 13 / 9 / 4 | 0 / 0 / 0 |
| `is rung` rows, functions / start | 27 / 12 | 18 / 8 |
| corpus with no blocker (45,678) | 45,302 | 45,320 |
| self-compile functions with no blocker | 19,971 | 19,972 |

- **Byte proof:** mode 3 self-compile identical; `--names` self-compile identical, no differ;
  `--cases` identical 7,647, fail under both 68, differ 0, witnesses same 62; `--claimless`
  identical 14,023, fail under both 3,267, differ 0; `tests/cases` A/B same 8,755, differ 6 (the
  moved list above).
- **Distilled corpus:** no runs lost. **Order check (mode 6):** 0 order rows over 21,065 programs.
- **Stack margin:** 960, 940 and 920 KB pass, on this branch and on master. **Fuel:** L2 +0.03%.
