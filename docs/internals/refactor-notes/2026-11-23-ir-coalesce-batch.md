# IR coverage: the coalesce batch (2026-11-23, lane IR-N2)

One PR over several `coalesce …` classes, one commit per mechanism.

## Design

- **`nulStr`, a new `CoalValArm`**: a `string | null` `??` on legacy's `br_on_non_null` core at
  `sTy()` (`emitCoalesceNulRefCtx`). The operand builds into `cbLB` and the default into the
  null arm. A join (`coalNulRefArmOf` = `join`) stages the operand ahead of its `if` and boxes
  the present arm. A `litAtom` default decodes through `atomToStr`
  (`emitCoalesceAtomStrDefault`). An operand and a default that build nothing stay `RCoalStr`,
  written in place.
- **`RCoalAtomStr`** takes any default that builds nothing at the string rep, not only a string
  literal.
- **Decided arms, no new node**:
  - `retypedDead`, `pinNonNull`, `fieldFlat` and `popElem` build the operand itself.
  - `deadJoin` builds the `if` legacy mints. It is now minted once per (`??`, instance) in
    `coalDeadJoinIfOf` (`emit_state.coalDeadJoinIfs`, cleared by `emitStateReset`), so the
    builder and legacy read one node.
  - `nulnone` runs its `null`-typed operand for effect along `emitNulNoneForEffect`, then
    builds the default.
- **Places over a global receiver**: `coalOptLeaf` and `coalBoxArm`'s binding arms re-read their
  operand through `opndAgain` (`irHoistRecv`). A receiver legacy stages in its `?.` stash
  (`optChainStagesRecv`, a captured cell's read) stays a miss.

`coalDeadJoinIfs` changes legacy from minting per call to minting once per site. Each function
instance is emitted once, so legacy wrote the site once either way, and the node's
`nodeTyRecord` is written once, as before. The legacy A/B below differs 0.

## Measured

Against master `0ba14606f` at its fixpoint seed:

| class (fns) | base | head |
| --- | --- | --- |
| `coalesce string default` | 24 | 0 |
| `coalesce string shape` (+ `start:`) | 19 + 4 | 0 |
| `coalesce atom default` | 5 | 0 |
| `coalesce nulnone` (+ `start:`) | 21 + 8 | 0, 2 now `coalesce nulnone effect if` |
| `coalesce retypedDead` | 18 | 0 |
| `coalesce deadJoin` | 13 | 0 |
| `start: coalesce box place` / `coalesce box place` | 23 / 7 | 0 / 2 |
| `start: coalesce optional place` / `coalesce optional place` | 23 / 10 | 1 / 1, 4 now `coalesce optional staged receiver` |

- `tests/cases`: covered = verified 70,554 → 70,654 (+100), matched 70,553 → 70,653. Programs
  fully IR-only 4,843 → 4,892.
- `ir-identity --names`, `--cases`, `--claimless` and the legacy A/B (tests/cases, capability
  probes and distilled cells, 20,035 programs) differ 0.

Open: a `??` field read off a call receiver (`coalesce field place`, 20 `start:` fns) waits on
legacy's call-receiver stash (branch `ir-n2-d17059`).
