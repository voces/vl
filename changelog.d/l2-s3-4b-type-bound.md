## Type system (Track A)

- **A type-bound member call on an un-annotated parameter takes the argument's own `self`-function**
  (L2 S3.4b part 2, `refactor-notes/2026-11-16-l2-s3-4b-type-bound.md`; D16384). `function g(b) {
  print(b.loadI32(0)) }` handed a `Buf` was refused as a missing field `loadI32`. It now runs, as the
  `<T>` spelling does, with each instance resolving its own receiver's module.
