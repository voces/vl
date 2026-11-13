# Step 7: `unionHasBoolLeafArm` reads each arm's depth off its type, 2026-11-13

Lane E, the third site taken from lane G's non-stray set. `unionHasBoolLeafArm(unTy, d)` asks
whether a union has the boolean-leaf list arm of depth `d` (`boolean[]` is 0, `boolean[][]` 1).
It parsed each arm's spelling for its trailing `[]` pairs (`boolLeafListDepthOfName`). Yet
`unionTyArms` already returns each arm's arena type beside the spelling, and
`boolLeafListDepthOfTy` reads the same depth off a type.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `ddd58e6e`. At each arm
it compared `boolLeafListDepthOfName` of the spelling with `boolLeafListDepthOfTy` of the type. It
was drained once after `emitProgramRun`, over the sweep's 24,224 programs. A control fired.

- 13 arms in 7 programs; 10 are boolean-leaf lists.
- 0 disagreements.

## Changed

The test reads `boolLeafListDepthOfTy` of each arm type. `boolLeafListDepthOfName` loses its only
caller and is deleted.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `ddd58e6e` against the candidate: 24,224 same, 0
  bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: the site's `ty-source-parse` entry leaves (emit_map_twins goes from 1 to
  0), and the census drops `boolLeafListDepthOfName` from its `EXTRA_PARSERS`.
