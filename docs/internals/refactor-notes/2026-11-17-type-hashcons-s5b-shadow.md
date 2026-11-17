# Type hash-cons stage 5b, the shadow: mono's anonymous pin key against its canonical set id (lane H), 2026-11-17

5b folds `monoAnonPinDiscrim` into the pin's set id (design note §2.6). The discriminator is a
spelled `tyCanonKey` that `monoKeyPinSeg` appends to an anonymous record or map pin. After the
fold, the pin would be keyed by `tyCanonSet`, the CF_SET canonical id from 3b. STORE agreed to the
fold on one condition: no two arguments under one folded key differ in `fnTagTyIsTagged` on any
function leaf.

This PR adds the shadow only. Mono's key does not change, and with `$VL_ID_SHADOW` unset the
emitted bytes are identical.

## The shadow

`canonKeyShadowNote(head, spelled, ty)` (`emit_ty_seal.vl`) runs in `monoKeyPinSeg` wherever the
discriminator is non-empty. Per pin head, it records:
- **split**: one spelling meets two set ids. The fold would split an instance that today's key
  shares.
- **merge**: one set id meets two spellings. The fold would merge instances that today's key keeps
  apart.
- **tagdiff**: one set id meets two function-leaf taggings. This is STORE's condition. The tagging
  is a `T`/`F` per function leaf in walk order, and the walk cuts on its own path, so a subtree
  shared by two fields counts at both. The row names both type indices and says whether the two
  spellings were the same (`same-spelling`) or the fold would merge them (`new-merge`).

`canonShadowReport` writes one `canon key5b notes N split S merge M tagdiff V` row per program,
followed by up to 24 example rows.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 005926c63) |
| population | 20,285 files (`tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`, `compiler/entry.vl`); 15,784 reach emit |
| programs with a note | 239 |
| notes | 1,761 |
| split | 0 |
| merge | 0 |
| tagdiff | 2 rows, one program, `same-spelling` |
| identity, shadow off | 3,222 of 3,223 capability-list files byte-identical. The 3,223rd, `compiler/entry.vl`, differed because the tree was edited during the run. Rebuilt from a frozen copy of the tree with both seeds, it is byte-identical |

## The one tagdiff

`tests/cases/generics/hole-fn-value-unresolved-read.vl` (and its named twin
`distilled/named/d16842_unresolved_read.vl`) has two calls on the same set id and the same spelling:
- `id({ f: inc0 })`: one function, untagged.
- `id(if n > 2 { { f: half } } else { { f: quarter } })`: a tagged set.

Removing either call clears the row. Both calls already share today's spelled key, so the fold
neither introduces nor removes this pair, and the program runs and prints its expected output. Read
literally, STORE's condition is not met. Read as "the fold creates no tag disagreement", it is met.
This is a ruling for STORE, and the switch waits on it.

## What 5b still needs

- The switch, in its own PR, once the tagdiff above is ruled on.
- The cross-question memo, for the call-graph walks 6b left bounded (`fvaHoleDeclOf`,
  `fvaRelayValueCalls`, `fvaRelayTwinInner`, `holeParamUnreadIn`, s6b39). It is a design item tied
  to L5's frozen record solve (CheckRun), not a stage-5 slice. An emit-scoped partial memo is not
  worth doing alone.
