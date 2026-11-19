## Codegen, memory & runtime (Track B)

- **IR coverage, a string's `.charCodeAt`:** the IR builds `s.charCodeAt(i)` as an `RStrOp`
  (`charcode`) through the same guarded read `s[i]` takes (`rawStrGetTail`), skipping a receiver a
  live loop hoist holds. Legacy's `emitStrCharCode` now ends in that tail too, so its duplicate
  guard-and-read is gone. No emitted byte moves.
