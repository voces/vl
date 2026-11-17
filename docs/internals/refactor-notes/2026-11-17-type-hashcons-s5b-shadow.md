# Type hash-cons stage 5b, the shadow: tagging under mono's anonymous pin key (lane H), 2026-11-17

5b folds `monoAnonPinDiscrim` into the pin's set id (design note §2.6). STORE agreed to the fold on
one condition: no two arguments under one folded key differ in `fnTagTyIsTagged` on any function
leaf. This PR measures that condition and changes no key. With `$VL_ID_SHADOW` unset, the emitted
bytes are identical.

## The key is already the set id

`monoAnonPinDiscrim` appends `"=" + tyCanonKey(ty)`, and since 3b `tyCanonKey` is
`"#" + tyCanonSet(ty)`, the CF_SET canonical id. So the spelled discriminator is the set id written
as text. Folding it into an id cannot split or merge an instance.

A first version of this shadow counted splits and merges. Over the population below it reported 0
and 0, but those zeros hold by construction and measure nothing, so this version drops them. What
5b has left is representational: the `=#<id>` text becomes an id slot when mono's key becomes an id
vector, and that waits on STORE's storage field (5a's note). No switch PR has anything to change.

## The shadow

`canonKeyShadowNote(head, ty)` (`emit_ty_seal.vl`) runs in `monoKeyPinSeg` wherever the
discriminator is non-empty. Per pin head and set id, it records the function-leaf tagging: a `T` or
`F` per function leaf, in walk order. The walk cuts on its own path, so a subtree shared by two
fields counts at both. A second tagging on the same head and id is a **tagdiff**, and its row names
both type indices.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master 005926c63) |
| population | 20,285 files (`tests/cases` outside `modules/`, `distilled/cells`, `distilled/named`, `compiler/entry.vl`); 15,784 reach emit |
| programs with a note | 239 |
| notes | 1,761 |
| tagdiff | 2 rows, one program |
| identity, shadow off | 3,223 / 3,223 capability-list files byte-identical (`compiler/entry.vl` checked from a frozen copy of the tree) |

## The one tagdiff

`tests/cases/generics/hole-fn-value-unresolved-read.vl` (and its named twin
`distilled/named/d16842_unresolved_read.vl`) has two calls on one head and set id `#7`:
- `id({ f: inc0 })`: one function, untagged.
- `id(if n > 2 { { f: half } } else { { f: quarter } })`: a tagged set.

Removing either call clears the row. The two calls already share today's key, and the program
prints its expected output.

The coordinator's ruling on the condition is that the fold must add no disagreement today's key
lacks. This one exists before the fold and is unchanged by it. STORE is asked whether the shared
instance is a latent defect.

## What 5b still needs

- The id slot itself, with mono's key as an id vector, once STORE rules on the storage field.
- The cross-question memo, for the call-graph walks 6b left bounded (`fvaHoleDeclOf`,
  `fvaRelayValueCalls`, `fvaRelayTwinInner`, `holeParamUnreadIn`; the s6b39 backlog). It is a
  design item tied to L5's frozen record solve (CheckRun), not a stage-5 slice.
