## Infrastructure (Track F)

- **Six literal-tree walkers lose their depth caps** (type hash-cons stage 6b, batch 1):
  `litTreeOps`, `litTreeHasRadix`, `lbiLitTree`, `lbiTreeHasRadix`, `cexF32Leaves` and
  `castBoundBits`, plus `leafIsLit`'s pass-through depth. Each recurses only into a node's children
  or a join's tails, so it cannot meet a cycle. Over the corpus none of the caps ever fired, and
  output is byte-identical.
