# IR: a closure-call argument already of its union-arm parameter's arm, 2026-11-22

Lane IR-N6, a slice of `call of a non-declaration`. A closure whose parameter is one arm of a
union, holding a lambda over the wider union, is called with a value already of that arm: for
example `f({ k: "a", v: 5 })` with `f: (p: A) => i32` holding `(p: A | B) => …`. Legacy's
`emitCallRefArg` takes the `armUnbox` arm. Its plan (`armUnboxPlanOf`) is `asIs` there, and it
writes the argument with `emitExpr` alone. `callRefArgPlain` admitted only the `unbox` plan (#9442),
so the IR refused the call.

## The change

- The plan is one exported decision, `callRefArmUnboxPlan(ckey, i, a, fnIx)`, which is
  `armUnboxPlanOf` at the key's parameter slot. Three places ask it:
  - `emitCallRefArg`'s `armUnbox` match;
  - `callRefArgPlain`, which admits every plan but `crossTag`;
  - `closureCallAt`, which builds `asIs` as it stands. The argument must already be at the
    closure's parameter rep (`closureParamRep`).

The new row `tests/ir-shadow-rows/closure-call-arm-arg-as-it-stands.vl` has covered and matched
floors of 5 (base: 4).

## Readings (base: master `898b840d8`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 68,120 | 68,134 (+14) |
| armed `tests/cases` covered / matched | 68,120 / 68,119 | 68,134 / 68,133 |
| `tests/cases` `call of a non-declaration` (any / alone) | 52 / 43 | 37 / 29 |
| corpus functions with no blocker | 45,028 | 45,032 (+4) |
| corpus `call of a non-declaration` (any / alone) | 7 / 6 | 3 / 3 |
| self-compile functions with no blocker | 19,751 | 19,751 |
| L2 self-compile fuel | 110,309,262,427 | −0.01% |

On both seeds the armed fail and mismatch rows are the same three.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,611 |
| `--claimless` | 14,018 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,331 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (249 passed).
