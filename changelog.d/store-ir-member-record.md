## Codegen, memory & runtime (Track B)

- **IR: a narrowed box's union-box field, and a variant literal at its wider row:** a narrowed variant's union-box field reads through `narrowedMemTail`, the one tail legacy now writes it with, at the rep `unionFieldNarrowUnboxOf` decides. A variant literal whose row stores a wider field is built at that row through `objLitAtVariantRow`. A statement `if`'s dead `else` is no longer built. 38 more self-compile functions and 75 more corpus functions are built by the IR.
