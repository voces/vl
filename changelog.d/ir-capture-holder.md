## Codegen, memory & runtime (Track B)

- **IR coverage: a holder captured whole.** A binding that keeps a returned bundle whole is now read, copied and called inside a closure at the record its capture holds (`capturedHolderTy`, `calleeIsCapture`). This was the `capture binding` miss on a captured holder, 9 functions → 1. Legacy's bytes don't change.
