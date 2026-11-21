# IR coverage: a `??` over a record's value-union field (2026-11-21, lane IR-N1)

`o.v ?? d` over a record field that holds a value union with `null` as a box is legacy's
`emitCoalesceUnionField`: the field's box, its tag tested against `null`, the default, and in the
present arm the record re-read and the field's box kept (`boxed`, where the result is a union or
the default nullable) or its residual scalar unboxed and widened (`unbox`). It is reached past the
boxed and call-niche rungs, and the IR left it inside the miss `coalesce box next`.

## What landed

- **A plan and shared tails.** `coalFieldPlanOf` states the writer's decisions: no field box
  (`none`, the rung passes on), the refused `ambiguous`, `narrowed` and `noKind`, and the `boxed`
  or `unbox` write with the field's heap, kid, receiver unwrap, result coercion and kinds.
  `emitCoalesceUnionField` writes from it through `coalFieldBoxOpen`, `coalFieldValOpen`,
  `coalFieldRead` and `coalFieldUnbox`, which the IR's lowering also calls. The bytes are
  unchanged.
- **The IR arms.** `SCoalBox` gains `fieldBox` and `fieldVal`: the record variable, the shared
  open, the default built into the null arm, the else, the record re-read and the shared read or
  unbox. The verifier holds the record a variable and the out a box or a scalar.
- **Named misses.** A receiver legacy unwraps first (`coalesce field cast`: a narrowed box arm, or
  a nullable variant), a record that is not a variable (`coalesce field place`, such as a nested
  field), and a field the plan passes on (`coalesce field none`).

## Coverage

Measured on fixpoint seeds of this branch and of #9437's head `e82c2206`, each building this
branch's source.

| population | #9437 | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,540 | 19,540 |
| corpus with no blocker (45,678) | 44,503 | 44,503 |
| `tests/cases` covered / matched (armed shadow) | 64,932 / 64,931 | 64,970 / 64,969 |

On `tests/cases` `coalesce box next` falls from 194 rows to 92; the field arm's misses are
`coalesce field place` 34, `coalesce field none` 15, `coalesce field cast` 12 and `coalesce field
result rep` 1. The armed shadow adds no fail, differ or mismatch row.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0; `--cases` identical 7,590, differ 0, witnesses same 60;
  `--claimless` identical 14,014, fail under both 3,267, differ 0; `tests/cases` A/B same 8,704,
  differ 0.
- **Fuel:** L2 self-compile 107,237,005,080 against #9437's fixpoint 107,157,810,746 (+0.07%).
