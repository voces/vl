# Step 7: `registerRefArrayArmUnions` reads the arm's box tag off its type, 2026-11-13

Lane E, one of the three sites taken from lane G's non-stray set. `mintInlineUnion` registers the
inner union of each list arm whose element is a union, unless a box tags the arm directly. It
tested the second half with `valueAtomKind` of the arm's spelling (`atoms[rai]`). It already held
the arm's arena type (`atomTys[rai]`), with the spellings as a parallel list.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `ff65f873`. At each
list arm with a union element it compared `valueAtomKind(atoms[rai]) < 0` with
`boxTagOfTy(atomTys[rai]) < 0`, lane G's typed twin. It was drained once after `emitProgramRun`,
over the sweep's 24,224 programs. A control fired.

- 210 arms in 104 programs; 205 register.
- 0 disagreements.

## Changed

`registerRefArrayArmUnions(stmts, atomTys)` reads `boxTagOfTy` of the arm's type, and the spelling
parameter goes.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `ff65f873` against the candidate: 24,224 same, 0
  bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: the `valueAtomKind(atoms[rai])` entry leaves, so `ty-string-parse` goes
  from 12 to 11.
