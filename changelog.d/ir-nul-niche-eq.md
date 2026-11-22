## Codegen, memory & runtime (Track B)

- **IR coverage, `==`/`!=` over nullable references:** a compare of two `string | null`,
  `i32[] | null` or other nullable list or closure operands builds through the IR. It is written
  under legacy's null guard (both null is true, one null is false, else the rep's own compare), by
  the head and tails legacy also writes. No emitted byte moves.
