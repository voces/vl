## Infrastructure (Track F)

- **Three type walkers stop at a cycle instead of a depth** (type hash-cons stage 6b, batch 2).
  `tyMayHoldFn`, `tyHasInferHole` and `tyReachesClosure` walk each record and union once, with a
  shared visited stack, and their depth argument goes from all 105 call sites. These are the caps
  6a found ending the walk on recursive types. Output is byte-identical, including the six
  recursive-type programs that did not terminate under deeper caps.
