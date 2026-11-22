## Codegen, memory & runtime (Track B)

- **IR coverage: a valued `if` of one variant boxed whole into its union.** `f(if c { a } else { b })`, with both arms one record arm of `f`'s union parameter, missed at `box ladder`. Legacy writes the arm's tag, the whole `if`, then the box. The box plan now names that join's `rec` arm, by the same `armValuePlainOf` answer legacy's ladder reads. The IR writes the head after any operand an earlier argument staged and before the condition. The last 3 self-compile functions on `box ladder` build.
