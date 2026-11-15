# D16590: the destination binds a generic function at a record literal's field

2026-11-15, lane K. `unbox<A>(r: { f: (x: A) => A })` at `const k: (x: f64) => f64 = unbox({ f: gid })`
was refused by the emitter: `A` stayed open because `dstOnlyOpenFnArgsName` accepted only a
parameter that is itself a function type handed an open function.

- `dstOpenFnSlotsNaming` (`check_assignable.vl`) returns the function types a parameter hands an
  open function at: the parameter itself, or each field naming the type parameter, read at the
  record literal's value for it, recursively. The "another argument binds this slot" rule runs
  over each of them unchanged.
- A list literal argument (`first([gid])`) already ran by another path, so this adds no list case.
- Not covered: `{ f: gid, n: 2.5 }`, where a non-function field binds `A`. The argument's own
  binding does not reach the field's generic function there; refused before and after.
