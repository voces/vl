## Codegen, memory & runtime (Track B)

- **IR delivers a union of records unboxed at a record slot that stores every arm** (D16321). Where each member of `B | D` is a record that `A`'s layout stores, a return, binding, argument, field or push of the union at `A` is the box's payload cast to `A`'s heap, as legacy's arm delivery writes it (`RArmUnbox` at a destination, through the exported `emitRecordArmsUnboxTo`). The verifier refuses such an unbox landing at another record; keyed self-tests pin both sides.
