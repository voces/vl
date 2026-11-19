## Codegen, memory & runtime (Track B)

- IR: a value `if` or a returned `if` whose condition is an `is` test (or its `!`) builds on the
  IR, a decided-`false` test writing no then arm as legacy does; the value `if`'s plain-path
  refusal now names the rung that refused it.
