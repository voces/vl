## Infrastructure (Track F)

- **Twenty-one type walkers stop at a cycle instead of a depth** (type hash-cons stage 6b,
  batch 6). Each walks with a path of the unions and records it has entered (`tyPathEnter`,
  `check_types.vl`), pushed on entry and popped on exit. A cycle back to a type still open answers
  what an exhausted cap answered, and no other answer can change. None of the caps fired in the 6a
  census. Output is byte-identical, and guest fuel is +0.005%.
