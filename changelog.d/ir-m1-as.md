## Codegen, memory & runtime (Track B)

- IR coverage, the `expression as` class (lane IR-M1). Four cast shapes are now claimed the way legacy writes them:
  - an exact numeric cast in every mode, including a bare `as` that returns the function's null;
  - a literal-union cast over an atom or a numeric literal, using legacy's own staged member test and tail (new Rhs `RAsTail`);
  - `as%` over a narrowed shift mask, using the IR's shift-mask fold;
  - `as%` over an integer literal, as its 32-bit constant, masked at `u8`.

  An `expression as` miss now names the cast's arm and mode.
