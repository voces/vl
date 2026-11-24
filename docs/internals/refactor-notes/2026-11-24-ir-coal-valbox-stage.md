# IR coverage: a boxed binding's `??` argument after another argument (2026-11-24, lane IR-N11)

`short-circuit argument after another` on master 0319020c: 7 functions, each the only blocker
of its program. One is in tests/cases (`places` in
`numerics/coalesce-joins-runtime-numbers-apart`). Six are corpus cells,
`named/nj2_co__*__std__op`. All of them are `filled(2, q ?? b)`: a `??` over a boxed binding,
passed after an earlier argument. A probe compiler naming the refused `SCoalBox` read `valBox`
for all 7.

Legacy's order, from the disassembly of `nj2_co__i32__rti64` `run`: it writes the earlier
argument, then the `??`'s tag test `if` on the binding's box. The default is built in the null
arm only. This is the order `stageLead` already writes for the niche and nullable-reference arms.

- **`coalArmStagesLeads` (ir.vl)** now counts `valBox` and `valScalar`. Both read only the
  binding before the tag test opens. So the lowering's `coalBox` writes an earlier argument's
  pending temps below the `if` in definition order, and `irBStageLeads` stages an earlier
  immediate or variable as it does for a valued `if`.
- **`coalBox` (ir_build.vl)** no longer refuses a temp an earlier operand left
  (`coalesce box after an operand`) along those two arms. It still refuses it along the arms
  that do not stage.

`valScalar` has its own witness, `s(two(), q ?? five())`: legacy writes `call $two`, then the
`if (result i32)` on `q`'s tag, with `five()` in the null arm.

## Measured

Base 0319020c, both seeds fixpoints.

- `short-circuit argument after another`: 7 → 0 (tests/cases 1 → 0, corpus 6 → 0). Before this
  change, the side-effect witnesses `show(two(), q ?? b)` and `s(two(), q ?? five())` were
  refused at `coalesce box after an operand`. They now match. That class has no tests/cases or
  corpus function at base, so it moves 0 → 0 in both populations.
- IR-only census: 6032 → 6033 of 7174 tests/cases programs fully IR-only. The one function
  above is the only row of `functions.tsv` that moves.
- Mode-4 corpus: `blockers none` 46789 → 46795 of 46958 functions. Starts covered/matched
  9689/9689 on both seeds.

Position sweep (Q58): each arm in 10 positions, written with an earlier effectful operand where
the position has one: a direct argument at the arm's own type and at a wider union, a nested call
argument, a string `+` operand, an interpolation hole, `return`, a `const` initializer, an `if`
arm, a `??` operand and a record-literal field
(`tests/cases/null/coalesce-boxed-binding-positions-{wide,scalar}.vl`, one function per position).
Both are check-clean and give output identical to a claimless compiler on both seeds. Under mode 6,
head covers and matches all 80 functions; base leaves 6 uncovered at `coalesce box after an
operand`. The templates
`scripts/capability-probes/matrix/coalesce-boxed-binding-{wide,scalar}-default.matrix.vl` run in
every graded position on both seeds (64 of 64, 46 of 46). Their 110 generated programs are
identical to claimless, with no mode-6 fail.

This lane's first candidate made `scripts/silent-sweep/distilled/ir-shadow.vl` build invalid wasm,
through the staging arms' box head order. That defect was already on master for the niche arms.
It shipped first as D17091's express fix (#9816), and this change is measured on top of it.

Rows: `tests/ir-shadow-rows/coalesce-box-argument-after-a-call.vl`,
`coalesce-box-scalar-argument-after-a-call.vl`, `coalesce-box-arguments-side-by-side.vl`.
Neighbours already matched at base and still matched: the `??` argument first, then a plain
one; `&&` and `||` after another argument.

## Legacy tails the IR calls

None new. The lowering's `coalBoxArm` (`coalBoxOpen`, `coalBoxElse`, `coalBoxEnd`) already
writes these arms, and `stageLead` already stages a valued `if`'s leads.
