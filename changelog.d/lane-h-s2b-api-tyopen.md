## Infrastructure (Track F)

- **One openness test for a type's children** (type hash-cons stage 2b API): every list-element,
  map-key and map-value `< 0` / `>= 0` comparison calls `tyOpen(child)`, and `mkTyVarSlot` keys
  its binder through `declKeyOf(node)`. Output byte-identical.
