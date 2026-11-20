## Codegen, memory & runtime (Track B)

- **IR coverage, `for` over a list of boxes, records or `i32` lists:** the IR's walk now binds a
  value union's box, a record or an `i32` list element as legacy's does (`forInElemPlain`). The
  self-compile ships 48 more functions from the IR. No emitted byte moves.
