## Codegen, memory & runtime (Track B)

- **IR coverage, atomics and saturating truncations:** every `__atomic_*__` intrinsic (load,
  store, rmw, cmpxchg, wait, notify, fence) and the eight scalar `__trunc_sat_*__` build through the
  IR as `RAtomic` and `RTruncSat`, written by the plans and tails legacy also writes (`atomicPlanOf`,
  `atomicTail`, `truncSatPlanOf`, `truncSatTail`). No emitted byte moves.
