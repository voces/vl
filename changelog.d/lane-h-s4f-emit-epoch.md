## Infrastructure (Track F)

- **The emitter's memos stamp with an emit epoch** (type hash-cons stage 4f, the per-instance
  seal): `tyMutBump(row, hole)` is now the only writer of `tyMutEpoch`, at all 13 sites. It also
  advances `tyEmitEpoch`, except for a write to a row or hole minted inside the innermost open
  mono re-check, which no emit memo can have read. Over 19,779 files no emit-phase write moves
  `tyEmitEpoch`, and output is byte-identical.
