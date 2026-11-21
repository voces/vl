## Codegen, memory & runtime (Track B)

- **IR coverage, SIMD loads and stores:** `__load_v128__` and the other SIMD loads, and
  `__store_v128__`, build through the IR as `RSimd`, their address along the memory access plan
  (`memAddrPlanOf`) and written by the access tail legacy also writes (`simdMemTail`). No emitted
  byte moves.
