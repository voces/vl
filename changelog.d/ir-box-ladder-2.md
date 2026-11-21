## Codegen, memory & runtime (Track B)

- **IR coverage: an integer literal-union value boxed under its base scalar's arm.** A `1 | 2` value delivered into a union boxes as its `i32` kind, as legacy's atom kind reads it. The box plan's scalar tail read the value's type with `tyPrimNameOf`, which names no literal union, so the plan fell to the ladder and the IR missed at `box ladder`. It now reads `tyScalarBasePrim`.
