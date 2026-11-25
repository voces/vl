## Codegen, memory & runtime (Track B)

- **I8 re-entry: a `for` iterable's hoisted module list is built from the IR's own elements.** Before, the IR asked legacy's hoist, which wrote each element through `emitStrValue` and `emitExpr`. That was the re-entry the I8 rehearsal's self-compile stopped on. A `for` over module `const` strings that fell back to legacy is now claimed.
