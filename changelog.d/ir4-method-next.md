## Codegen, memory & runtime (Track B)

- **IR coverage, a string's `.indexOf` and `.includes`:** the IR builds both as `RStrOp`s
  (`indexof`, `includes`). It pushes the receiver and needle, then calls the search tail
  (`strIndexOfTail`) that legacy's `emitStrIndexOf` now ends in too. No emitted byte moves.
