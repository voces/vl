## Codegen, memory & runtime (Track B)

- **IR: a `for` walk over byte lists, lists of string or byte lists, variant records, nullable strings or records, and f64 or i64 lists.** `forInPlainWhy` refused those element kinds and every byte source (`for in byte source`, `for in element …`); legacy's own bind writes each, so the walk takes them, a byte read unsigned as an `i32` (`forInU8Src` into `forInLoopAt`). A union list's walk variable read as its box is a box receiver (`irBBoxLocal` takes a `LoopVar`).
