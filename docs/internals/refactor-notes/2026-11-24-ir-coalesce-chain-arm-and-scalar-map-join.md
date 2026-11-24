# IR coverage: a union join's `??`-chain arm and the scalar map join (2026-11-24, lane IR-N2)

PR B of the D17085 pair. #9789 fixed legacy's boxing of a hole instance's minted `??` link. This
note lifts the IR's matching miss, and builds `coalesce mapScalarJoin`, the d3127_r4_gx_x02xx cells.

## Design

- **Chain arm.** `unionIfArm` no longer misses an arm that is itself a `??`. The arm is
  delivered into the join's box like any other arm, and its chain goes through `coalChain`
  (legacy's `coalChainLinkOf`, `coalChainMint`). The lift alone covers no new function. Each cell
  it reaches stops at its next blocker: `map get rep`, `rep ?` or `box ladder`.
- **Scalar map join.** `coalMapScalarJoin` builds `m[k] ?? d`, where `d` is another arm of the
  result's union and the map's value boxes as a scalar. It is an `RMapGetOr` of form 7: the probe,
  then the hit's scalar boxed at its own arm's tag, then `d` delivered into the union in the miss
  arm, as `emitMapGetOrScalarJoin` writes it. A default that computes ahead of its use is a miss.
- **Verifier.** Form 7 reads a scalar map value into an `RBox` (rule 2). The keyed self-tests are
  `map-scalar-join-of-i32` (holds) and `map-scalar-join-of-string` (refused).

Legacy changes only in its body: its emit-fail test and its hit sequence are split out of
`emitMapGetOrScalarJoin` as `mapScalarJoinBoxes` and `mapScalarJoinOpen`.

## Legacy tails the IR calls

- `mapScalarJoinOpen(ak)`: after the probe, the hit boxed at kind `ak`'s tag, then the `else`.
- `mapScalarJoinBoxes(e, ak, fnIx)`: legacy's own condition for the join to have a box and an arm.

## Measured

Base master `73c87bffa` against head `d7ba09b3d`, both fixpoint seeds, with `VL_STD` on both arms:

- Census class rows (tests/cases run and trap tiers, fns / programs / runs):
  - `coalesce mapScalarJoin` 9 5 3 → 0, and `start: coalesce mapScalarJoin` 2 2 1 → 0;
  - `union if arm coalesce chain` 6 1 0 → 0, and its `start:` row 1 1 1 → 0.
- The chain's 6 functions (the D17085 witness's) move to `rep ?` 10 → 16. They are a minted link
  with no type of its own in a hole instance.
- Its `start:` function leaves the census's tracked classes.
- Programs fully IR-only: 6027 of 7173 → 6034 of 7174.
- tests/cases: covered = matched 79,461 → 79,539. No new fail or differ row.
- The legacy A/B moved 0 programs, and self-compile is byte-identical.
- The d3127_r4_gx_x0200/02/04/06/08/09 cells are covered and matched.
- Every cell of N9's handed-over box-ladder sets (13 + 6) stays at `box ladder`.

Open: the `rep ?` link of a hole instance's chain, and the d3127 F4 cells at `map get rep`.
