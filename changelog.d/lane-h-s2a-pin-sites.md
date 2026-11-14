## Infrastructure (Track F)

- **Every empty-collection pin goes through one writer** (type hash-cons stage 2a): the 33 in-place
  element, key and value pins call `tyPinElem`/`tyPinKey`/`tyPinVal`, so `tyMutEpoch` has 13 bump
  sites instead of 43. Output byte-identical.
