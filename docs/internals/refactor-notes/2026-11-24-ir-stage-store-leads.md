# IR: an earlier operand is staged below a store a later operand makes (2026-11-24, lane IR-N11, D17109 follow-up)

D17109 closed a clause-1 bug, `two(b, b = 2)` printing 22, by declining: an operand that stores
(an assignment used as a value) after an earlier operand missed `store after an operand`. The
literal and unwiden arms missed `... after an operand` when an earlier temp was pending. Legacy
writes the earlier operand first (`local.get b`), then the `block { local.set b; i32.const 2 }`.
The IR now does the same.

- **Builder (`irBStageLeads`)**: a store from `at` on stages the earlier variable and immediate
  operands as temps at their own starts, as a valued `if` or an order stash does.
  `ifBelowLeadOf` no longer misses when the leads are all temps and a store follows.
  `assignValueLit`, `assignValueNullLit` and the unwiden arm drop their `endsInTemp` decline.
  N3's `assignment value box after an operand` stays: a box writes its tag ahead of the store.
- **Lowering (`node`)**: before `SAssign` (not an arm's write of its out), `SGlobalSet`,
  `SSetField` and `SListSet`, the pending temps outside the store's own operands are written
  first: `stageLeadOf`, which is `stageLead` over an operand list (`stageLead(c)` is
  `stageLeadOf([c])`). The floor is raised across the store, as `stashSetEffect` does, and the
  roots are handed back to `pending` for their reader. A store with no roots lowers as before,
  so existing claims keep their bytes.
- `mapSetStageLeads`'s `map store value store` miss is untouched (its own class, one function).

## Measured

Base 4e84cecc, both seeds fixpoints, each census arm built in a tree at its own commit.

- Census, tests/cases run and trap tiers: fully IR-only 6565 of 7504 → 6572 of 7507.
  - The 74 decline rows go to 0:
    - `store after an operand` 40, start 2;
    - `assignment value lit after an operand` 27, start 1;
    - `assignment value unwiden after an operand` 1, start 1.
  - 61 of those functions are now fully covered, plus 7 that missed `short-circuit right
    operand` (`at_binop` ×3, `field_binop`, `field_compare`, `index_binop`, `index_compare`):
    their lead was a temp, and the store no longer refuses it.
  - Self-compile 0 missed.
- The 13 that move downstream, each to a class it already had, none failing:
  - `box of an assignment`: `at_interp` ×2, `at_unionArg` ×2, `global_interp`, `global_unionArg`
    (the `m1850941900`/`m196472349`/`m1811373930` modules).
  - `box ladder`: `at_interp`, `at_unionArg` (`m1693621087`).
  - `unary p+`: `namedArgs` (`m1949317116`).
  - `push short-circuit operand`: `short-circuit-write-may-not-run.vl::opt`.
  - `short-circuit closure argument`: `assign-value-keeps-evaluation-order.vl::main` and its
    `@start`.
  - `start: assignment value parked`: `element-or-field-write-value-in-any-position.vl::@start`.
- Mode 6 over the 22 changed programs, shipped seeds: matched 591 → 658 of 689 and start
  matched 22 → 24 of 26. Covered equals verified equals matched on both seeds; 0 fail or
  mismatch rows.
- `ir-shadow.vl -- --prepost` over the corpus and tests/cases: 0 order rows.
- Matrix `assignment-value-after-a-lead.matrix.vl` (4 store kinds × 9 positions, plus the
  built-in positions), `--before`/`--after`: runs 118 of 118, 0 `runs → not-runs`, 0 silent.

Failing controls:
- Builder staging removed: the local lead is clobbered and the cell prints 22 instead of 12.
- Lowering staging removed: the global, field and element cells
  (`tests/cases/assignment/store-lead-staged-*.vl`) each fail `non-stack temp: out of order`.

Row: `tests/ir-shadow-rows/store-staged-below-a-lead.vl`.

## Legacy tails the IR calls

None new.
