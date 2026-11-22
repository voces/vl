## Codegen, memory & runtime (Track B)

- **IR coverage: a vector boxed into a union of it.** A `v128` value passed where `v128 | null`, `v128 | string` or `v128 | i32` is expected missed at `box ladder`. Legacy boxes it at value-atom kind 14 in its value box. The box plan now names that kind's `atom` arm under legacy's own kind answer.
