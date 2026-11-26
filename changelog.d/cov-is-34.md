## Codegen, memory & runtime (Track B)

- **IR claims a numeric union re-boxed at a wider union** (`i32 | f32` stored as `i64 | f64` in a record built at a wider row): the shared box plan's `numRebox` arm re-boxes it member by member, as legacy writes it.
