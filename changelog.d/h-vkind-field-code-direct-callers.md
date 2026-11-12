## Type system (Track A)

- **Step 7: the field-code ladder keeps only the arms the rep descriptor leaves to it.** Every field code is asked of the descriptor first: `funcTypeShapeLowerable` and `internShapeAs` now ask through `nameFieldCodeTy`. The ladder drops the 22 arms no declined type reaches: the scalar spellings, the literal-union, string, map, niche, closure and struct-declaration arms, and D1518's deferred arm predicate. A declined type no rung codes now fails loudly. Byte-identical over the sweep; the seed shrinks by 1,954 bytes.
