# `internArmShapeRow` answers the row its type already has, 2026-11-13

Lane A, census 5's last site. It follows lane E's step (d) (#7756), after which
`internInlineShapeFieldsTy` reads an arm's fields off its type and `nm` is only the row's
label. Emit only.

**The change.** Before minting, `internArmShapeRow` asks `repStructRowOfTy(aty)`. When the
type has a row, that row is the arm's row and nothing is minted. Otherwise the arm mints under
its rendered label as before. The memo write is factored into `iasNote`.

**What it changes, by the decision table in
`2026-11-13-step7-arm-mint-softening-floored.md`.** The mint used to deduplicate by its rendered
label. In 7 sites across 5 programs, that label landed on another declared type's row while
`repStructRowOfTy(aty)` gave the arm's own row. The disagreements were:
- **Storage-widened twins:** `soundness/is-containing-record-always-fits`,
  `unions/layout-family-literal-set-beside-string` and `unions/union-variant-field-reps-equality`;
- **Structural twins:** `unions/arms-name-one-record-shape-twice` and
  `generics/alias-to-generic-application-field-positions`. Two separately declared records
  sharing a row was only ever a by-name accident, never a ruling (#7306 merges an inline field
  with its declared twin, at recording). These two now take their own rows too.

At every one of those sites, `repStructRowOfTy(aty)` answers the same row before and after the
mint (the arm's recorded row, `structRowRecordingTy`). So the dedupe does not depend on whether
the mint has run.

**Probe** (master after #7756, the full sweep population): a loud `emitFail` wherever a fresh mint
still lands on a row `repStructRowOfTy` disagrees with. It fired at 0 sites. The same comparison
fired at the twin sites before the cut.

**Sweeps.** Fixpoint seeds on both sides.

| sweep | programs | same | bytes-only movers | output movers | runs → not-runs | new compiler traps |
|---|---|---|---|---|---|---|
| plain | 24,209 | 24,209 | 0 | 0 | 0 | 0 |
| armed (`VL_OPAQUE_SNAMES=1`) | ARMED_RESULT |

The three storage-widened programs move neither output nor bytes. The armed sweep ran on a host
built after #7661: D12340's witness builds to different bytes armed and unarmed, and prints `6`
both ways. A host from before #7661 reads the switch as absent, and its armed sweep measures
nothing.
