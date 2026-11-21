# IR: a closure-call argument into a union-arm parameter, 2026-11-21

Lane IR-N6, the fourth slice of `call of a non-declaration`. Stacked on #9430 (atoms and scalar
lists). A call through a function value whose parameter is one arm of a union took one of two
arms of legacy's `emitCallRefArg`. An argument already of that arm took the `general` arm, which
writes it as it stands. An argument narrowed out of a box took `armUnbox`, which reads the box's
value and casts it to the arm. The IR refused every such call.

## The change

- `callRefArgPlain` (wasmEmit.vl) admits:
  - a `general`-arm argument into a `variant` parameter under the record's rule: no narrowing
    unbox owed, and not nullable;
  - an `armUnbox`-arm argument that is a union with no cross-tag fit, the case legacy writes
    rather than refuses.
- `closureCallAt` (ir_build.vl):
  - builds the former as it stands, and the latter delivered at the closure's parameter rep;
  - refuses either one unless it lands at that rep (`closureParamRep`).

The new row `tests/ir-shadow-rows/closure-call-variant-arg.vl` has covered and matched floors of 8
(base: 6).

## Readings (base: `ir-closure-arg-atom` merged with master `7781e9bd7`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 65,234 | 65,243 |
| armed `tests/cases` covered / matched | 65,234 / 65,233 | 65,243 / 65,242 |
| `tests/cases` `call of a non-declaration` (any / alone) | 377 / 316 | 367 / 306 |
| corpus functions with no blocker | 44,588 | 44,623 (+35) |
| corpus `call of a non-declaration` (any / alone) | 57 / 56 | 21 / 20 |
| self-compile functions with no blocker | 19,546 | 19,547 |
| self-compile `call of a non-declaration` | 1 | 0 |
| L2 self-compile fuel | 107,641,462,840 | 107,640,492,278 (−0.00%) |

On both seeds the armed fail and mismatch rows are the same three. Armed self is 19,547 covered
and matched (base 19,546).

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` | 9,037 |
| `--cases` (witnesses 60 the same) | 7,593 |
| `--claimless` | 14,016 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,313 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (194 passed).
