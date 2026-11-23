## Codegen, memory & runtime (Track B)

- IR coverage, record literals at a tagged-function row (lane IR-M1). A record literal whose storage row is open only in tagged function sets, which legacy stores as `i32` ids, is now built at that row instead of at its own closure-typed record. 6 programs that write such records into a function-widened binding are now fully covered. D17069 is corrected: function-field storage follows the row's elaborated type.
