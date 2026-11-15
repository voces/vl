## Infrastructure (Track F)

- **Every type-arena row read goes through `tyAt`** (type hash-cons stage 3a): the 176 direct
  `T.tys[x]` reads, so the arena has one reader. Output byte-identical. The hash-cons design note
  records the revised stages 3–5: intern at seal, emit side first, checker side with L2.
