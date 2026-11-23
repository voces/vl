# IR coverage: an `if` over a decided `is`, through `emitIs`'s own pre-rung plan (2026-11-21, lane IR-N1)

`emitIs` answers some `is` tests before any rung of `isArmOf`, at the pre-arms of `isPreArmOf`:
`storage`, `tautology`, `covers`/`fits`, `prim` and `pin`. The IR's `boxTest` did not ask
`isPreArmOf`, so it decided those tests from `isArmOf`. An `if`, `!` or short-circuit over a
decided `is` was then a named miss (`decided is condition`, `decided is short-circuit`), because
legacy reads the constant back off its bytes (`staticIsGuard`) and writes only the live arm.

## What landed

- **One decided plan.** `isDecidedPlanOf` (`emit_plan_union.vl`) states `emitIs`'s answer at each
  pre-arm: the constant bit, and whether the operand is evaluated and dropped first. `emitIs` now
  writes from it, and `boxTest` asks it first: `storage` keeps the stored test, a decided rung is
  the constant after the operand's evaluation when the plan says so.
- **The readback sites read the plan's bytes.** `bareConstIs` asks whether the condition just built
  is exactly the bare constant legacy reads back, at all four `staticIsGuard` sites. The statement
  `if` chain then writes only the live arm (no then arm at 0, no else at 1), and `!` folds to the
  constant.
- **Two named misses stay.** A decided guard whose then arm always exits, where legacy cuts the rest
  of the block (`guardEndsBlockWith`, now shared with `monoStaticGuardEndsBlock`): `decided is guard
  ends block`. A decided list test whose narrowed region legacy reads through a fit shadow, whose rows
  are emit-time lowering state the builder cannot see (`listFitShadowSet`): `decided is fit shadow`.
  The value `if` and short-circuit misses are unchanged.

## The correction to #9346's note

#9346's note left two receivers unexplained, a lambda and an element read, where legacy evaluated
and dropped a receiver the IR called re-readable. The cause was not a legacy context. It was the
`prim` and `pin` pre-arms, which evaluate and drop any operand that is not effect-free, and the
`covers`/`fits` pre-arms, which always do. A capture, a folded global in a capture-less lambda, and
an element read with its bounds check are not `exprEffectFree`. Through the shared plan both shapes
are now covered and match, and the `is static in a lambda` and `is static receiver place` misses are
deleted.

## Coverage

Measured on fixpoint seeds of this branch and of master `db422387` (#9366 squashed), each building
this branch's source.

| population | master | this branch |
| --- | ---: | ---: |
| self-compile functions with no blocker | 19,387 | 19,388 |
| self-compile claimed (mode 3) | 19,362 | 19,363 |
| corpus with no blocker (45,678) | 43,944 | 44,028 |
| `tests/cases` covered / matched (armed shadow) | 61,061 / 61,054 | 61,383 / 61,376 |

`tests/cases`' armed shadow adds no fail, differ or mismatch row; its fail/differ file list is the
base's. The pre-arm misses (`is pre-arm` tautology,
prim, pin, fits, covers; 401 rows on the base) and `is static in a lambda` / `is static receiver
place` are gone. Left on `tests/cases`: `decided is condition` 28 (the value `if` and short-circuit
forms), `decided is guard ends block` 19, `decided is fit shadow` 6.

- **Byte proof:** mode 3 self-compile identical; `ir-identity.sh --names` identical 9,037, fail
  under both 3,267, differ 0, self-compile identical; `--cases` identical 7,579, fail under both
  68, differ 0, witnesses same 60; `--claimless` identical 14,014, fail under both 3,267, differ 0;
  `tests/cases` A/B same 8,693, differ 0.
- **Fuel:** L2 self-compile 105,402,091,617 against master's fixpoint 105,366,050,536 (+0.03%).
- **Ratchets:** sentinel, ladder-sets, comment and lint-self clean.
