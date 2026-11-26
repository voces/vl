# START-2: `widen instLit` (2026-11-26)

Regeneration 9's class (`census-regen9`, red.tsv): 15 programs. Graded on master 6034afb7 with a
probe-patched compiler, 14 are fully claimed. `functions/hole-leaf-literal-through-forwarder.vl`
moves on to `argument coercion` (in `outerE`).

One mechanism. `widenPlanOf`'s `instLit` arm (and `floatLit`) is legacy's `widenLitAt`: the literal
written again at the destination width (`emitSignedNumLitAt`). `widenTo` builds it with
`signedLitAt`, as its `asgLit` arm already did, when the operand is a signed number literal, so no
effect is dropped. The numeric-cast and shift-mask-fold gates, which refused every arm but `plain`
before calling `widenTo`, pass these two through.

`ir-parity --behaviour-only`: behaviour is equal on all 15, and 14 are byte-identical. The new sweep
misses `widen instLit` eight times on the earlier probe and is byte-identical with the change.
