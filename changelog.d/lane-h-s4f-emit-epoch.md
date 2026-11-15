## Infrastructure (Track F)

- **The emitter's memos stamp with an emit epoch** (type hash-cons stage 4f, the per-instance
  seal): `tyMutBump(row, hole)` is now the only writer of `tyMutEpoch`, at all 13 sites. It also
  advances `tyEmitEpoch`, except for a write to a row or hole minted inside the innermost open
  mono re-check or acyclic alias application, which no emit memo can have read. Over the corpus
  no emit-phase write moves `tyEmitEpoch`, and output is byte-identical.
