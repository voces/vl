## Codegen, memory & runtime (Track B)

- **IR coverage, closure captures and narrowed reads:** an `is K[]`-tested capture, a `string | null` capture read as non-null (in an environment or a lifted function), a closure capture held apart from its slot only in its holes, and a narrowed atom read by `print` or through a left-operand-only `??` build through the IR byte-identical to legacy. tests/cases +24 and corpus +22 covered = matched.
