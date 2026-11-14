## Codegen, memory & runtime (Track B)

- **`i8[]`, `u16[]` and `i16[]` are packed lists (D16043).** A sub-word list stores each
  element's low bits at its width and reads it back widened: `i8[]`/`i16[]` sign-extend,
  `u8[]`/`u16[]` zero-extend. They share `u8[]`'s one packed-list path, with the wrapper and
  backing chosen by a row read off the checked element type. Every `u8[]` program compiles
  byte-identical. A union member of a width other than `u8` is refused loudly (D16046).
