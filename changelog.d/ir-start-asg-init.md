## Codegen, memory & runtime (Track B)

- **D17133 closed:** `const c = (k = "ww")` over a literal-union cell `k`, with `c` read from a function or closure, built an invalid module under the IR's claim (`unknown local`), caught only by the legacy fallback. The start now declines that initializer to legacy, which stores the member's id.
