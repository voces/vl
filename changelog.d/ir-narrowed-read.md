## Codegen, memory & runtime (Track B)

- **IR: a union-box local narrowed to a ref-element list or a map arm is read by the IR (`narrowed read`).** Legacy reads such a binding on `identReadArmOf`'s `reflist` or `map` arm: the box, its payload, and a cast to the arm's list wrapper or map struct. The IR's `RBoxNarrow` now carries that container (`bnCon`), and the lowering writes the box and legacy's own post-box tails (`refArrayUnionUnboxTail`, `mapUnionUnboxTail`, split out of the read emitters). Legacy bytes are unchanged.
