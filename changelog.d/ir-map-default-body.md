## Codegen, memory & runtime (Track B)

- IR: a map read `m[k] ?? d` whose default computes (a call, a nested read, the narrowing
  rewrite's `if true` default) builds on the IR as `SCoalBox`'s fused map-read arm, its default
  written lazily inside the probe's miss arm.
