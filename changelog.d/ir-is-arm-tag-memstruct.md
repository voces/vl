## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` arm tag test over a record's union-box field.** `o.f is T` over a field holding a union box reads the field at its storage, as legacy's raw `struct.get` does, then the shared tag compare. A field whose storage is a nullable box, or a narrowed read off its storage's box, is a named miss.
