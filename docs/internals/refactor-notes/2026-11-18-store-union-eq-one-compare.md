# Union `==` has one compare, and the IR shares it, 2026-11-18 (lane STORE)

The driver census (`2026-11-18-ir-driver-doors.md`) ranked "operand type" first: 527 lines, 300
of them `ast`. Its archetype `emitUnionUnionEq` held two algorithms for one compare:

- a chain that re-read each re-readable operand (`emitExpr`) at every arm, plus its number-cross
  twin `emitUnionUnionNumCross`;
- the staged core `emitUnionBoxEqStagedX`, which takes the two boxes once into slots and
  already served every operand the chain could not re-read.

## The step

Every value-union `==`/`!=` now evaluates each operand once, left then right, and runs the staged
core through `unionUnionEqTail`. The IR's door (`RUnionEq`, gated by `unionUnionEqStagedOf`, the
pure form of `emitBinExprNode`'s routing plus the staged plan) builds both boxes and lowers
through the same tail.

| | lines |
|---|---:|
| AST re-read chain removed (`emitUnionUnionEq` body after the plan, 145, and `emitUnionUnionNumCross`, 49) | −194 |
| moved, not new: names and `| null` twin rules, the staged plan, the nameless refusal | ~60 |
| new: routing predicate, tail, IR build/lower/verify arms, lint sets | ~110 |
| net (7 compiler files) | −86 |

Legacy's bytes move on purpose: a re-readable operand is stashed once instead of re-read per arm.
Before deleting the chain, a seed that refused where the staged core declines built all 6,562
files with `==`/`!=` (corpus, tests, probes, std) with no refusal; a failing control showed the
batch surfaces emit failures.

## Measured

- Identity, legacy-only seed → full seed, `--names`: 9,030 identical, 0 differ, self-compile identical.
  `--cases`: 7,437 identical, 0 differ. Mode 3 self-compile byte-identical to the shipped seed.
- `regress.vl`: the same movement list as master's own seed, no runs lost.
- L2 fuel 97,067,736,968 against master's 96,945,890,492 on the same base (+0.13%).
- Seed: the legacy-only fixpoint is 2,157 bytes under master's.
- Claims: 30,485 corpus functions and 11,646 self-compile functions, both unchanged. Four corpus
  functions move from `operand type` to `union compare operand rep` (generic `T | null` operands,
  not box reps); the remaining 41 sole `operand type` functions are list, record and other compares.
  `tests/cases/unions/union-eq-operands-evaluated-once-in-order.vl` is claimed and pins the order.
