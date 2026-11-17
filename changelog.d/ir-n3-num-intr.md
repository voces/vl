## Codegen, memory & runtime (Track B)

- **IR N3, the numeric intrinsics:** legacy's bitcasts (`f64fromBits`, `f64bits`, `f32bits`,
  `f32fromBits`), float intrinsics and integer intrinsics take their width and instruction from
  one shared plan (`numIntrPlanOf`) and their routing from one shared question
  (`numIntrCallReached`). The IR builds a one-instruction intrinsic through that plan. No
  emitted byte moves.
