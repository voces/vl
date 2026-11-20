## Codegen, memory & runtime (Track B)

- **IR: an object literal under legacy's source-order stash.** A literal whose layout order permutes an observable source order (`emitObj`'s and `emitVariantStruct`'s D1510 stash) is built by the IR: each field in source order, set into the slot `objOrderStashSlot` opens for it, then the slots read in layout order. `objLitStashRowOf`/`At` and `objLitVariantStashOf`/`At` name the rows; a literal that drops a field stays legacy's. `RMakeRec.mrSrc` carries the source order.
