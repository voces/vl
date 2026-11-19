## Codegen, memory & runtime (Track B)

- **IR: union-box field reads.** A struct or variant field that holds a value-union box is read by the IR, its narrowed unbox written by the same tail legacy calls (`structUnionBoxTail`, `variantUnionBoxTail`); an ambiguous box stays legacy's. Legacy's `.length` block now takes `lengthIsField`'s decision, so the IR's gate and legacy's share it.
