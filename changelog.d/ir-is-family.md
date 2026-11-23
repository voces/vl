## Codegen, memory & runtime (Track B)

- **IR coverage: `is` over a stored box, against a map the box lacks, and the decided guard's
  block cut.** An `is` over a narrowed name or element read at its storage tests the declared
  box's tag; an `is` against a map the box cannot hold drops its receiver and answers `false`; a
  decided-true guard that always exits cuts the rest of its block behind `unreachable`, as legacy
  does (D932). No legacy bytes moved.
