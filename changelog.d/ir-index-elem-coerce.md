## Codegen, memory & runtime (Track B)

- **IR: a ref list read of a box element narrowed at its place is built by the IR (`index element coercion`).** Legacy's `refListGetTail` recovers the element, then unboxes it to the narrowed container or to the atom kind the place narrows to. That decision is now `refListReadUnboxOf`, which the tail itself asks. The builder admits a read at the rep that unbox leaves, and the lowering writes the same tail. Legacy bytes are unchanged.
