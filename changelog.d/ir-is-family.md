- IR coverage: an `is` over a narrowed name or element read at its storage tests the declared
  box's tag, an `is` against a map the box cannot hold drops its receiver and answers `false`, and
  a decided-true guard that always exits cuts the rest of its block behind `unreachable`, as legacy
  does (D932).
