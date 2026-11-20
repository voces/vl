## Codegen, memory & runtime (Track B)

- **IR coverage: a `boolean | null` niche in `==`/`!=`.** A compare that legacy writes on its
  numeric tail (`eqNumericRouteOf`), between a `boolean | null` map read and a bool or another
  such read, is now built by the IR as the plain `i32.eq`/`i32.ne` of the two cells. Null's
  sentinel equals only null. Self-compile covered goes 18,972 → 18,977. No emitted byte moves.
