# Step 7: `arenaEmitName`'s renders graded by what they feed, 2026-11-13

Lane E, the step 7 close-list item for renders that feed a decision. `arenaEmitName` renders an
arena type with `tyToNominalName`, then applies `canonEmitName`. It has eight references: the
definition, one import, two comments and four call sites. `reachRegisterName` wraps it for four
more callers.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `03549c92`. It put a
reach marker at each call site, a marker on each branch that tests the render for `""`, and a
marker on the dup gate's taken branch. It was drained once after `emitProgramRun`, over the
sweep's 24,221 programs. A control fired.

| Site | What the name feeds | Programs reaching it | Empty render taken |
|---|---|---|---|
| `registerInlineUnionOfChild` | the `unNames` label of the row | 784 | 0 |
| `registerCloResultUnion` | the `unNames` label of the row | 138 | 0 |
| `reachRegisterName`, nullable niche | the `unNames` label of the row | 6,572 | 557 |
| `reachRegisterName`, union | the `unNames` label of the row | 6,668 | 410 |
| `inferRetArenaUnionIsDup` | a compare with the recorded name | 186 | 0; the dup branch is taken in 8 |
| `annAdoptRegisteredName` | an `unNames` lookup, then the binding's `tyName` | 1,581 | 115 |
| `monoInstanceRetSpelling` fallback | a pin label and a synthesized `TypeRef` | 321 calls | 321, every call |

## Graded

- **Converted (a compare):** `inferRetArenaUnionIsDup` compared the arena render with the
  recorded nominal name. A match meant two spellings of one union would mint a second `unNames`
  row. Registration is keyed by type (`unRowOfTyKey`, `unNameAdoptTyKeyRow`), so the name fallback
  adopts the walk's row. The gate is deleted; the walk always registers.
- **Floor, never taken:** the empty-render returns in `registerInlineUnionOfChild` and
  `registerCloResultUnion` were taken in 0 programs. They are loud floors
  (`UNION_NO_EMIT_NAME_MSG`), not silent declines.
- **Deleted, never named anything:** the `arenaEmitName` fallback in `monoInstanceRetSpelling`
  returned `""` on all 321 calls. The fallback goes. Where the naming rule has no spelling the
  instance infers its return, as it already did.
- **Floor, a label:** in the two `reachRegisterName` registration sites and
  `annAdoptRegisteredName`, the name is the `unNames` label or lookup key. Lane A's canonical-key
  test graded that registry floor (#7782). An empty render means the type has no label, so it is
  not registered by name; the type-keyed row is minted regardless. These stay until `unNames`
  rows need no label.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `03549c92` against the candidate: 24,221
  same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps. The 8
  programs that took the dup gate are among the same: the type-keyed registration already made
  the second registration a no-op.
- `scripts/gate.sh`: all rows pass.
