## Codegen, memory & runtime (Track B)

- **IR M1, the `??` ladder's front door:** legacy's `l ?? d` lowering takes its arm from one
  shared decision (`coalArmOf`). The IR builds a module global map read with an i32 default
  (`g[k] ?? -1`) along legacy's helper route, through shared route, key and tail functions.
  The self-compile hands 169 more functions to the IR. No emitted byte moves.
