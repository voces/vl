## Codegen, memory & runtime (Track B)

- **IR N2b-2c-1, `K | null` over a literal union:** the IR admits a literal-union atom's
  nullable (`K | null`) as a value. An atom delivered into it is the same i32, a `null` is legacy's
  own sentinel through its null writer, and a returned call keeps legacy's tail-call form. The IR
  covers 47 more corpus functions, and the self-compile hands it 51 more. No emitted byte moves.
