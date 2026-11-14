## Codegen, memory & runtime (Track B)

- **A literal-set-or-`null` field reads through an un-narrowed union of records (D15882, D16031,
  D4266).** A `K | null` field, a number literal `| null` field in either member order, a string
  set beside `string | null`, the then-arm read of a cross-arm `is`, and `??` over such a read
  were refused with `field access receiver is not a struct`; they dispatch on the box tag and run.
