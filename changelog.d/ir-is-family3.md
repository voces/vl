## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` over a record's box field at its storage, and `x?.f is K`.** A local
  record's (or start's) box field tested at its storage reads the raw field and compares its tag;
  `x?.f is K` over an unstaged base tests the base for null, then the field's tag, as legacy's
  `optField` arm writes it. No legacy bytes moved.
