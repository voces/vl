## Codegen, memory & runtime (Track B)

- **The IR lowers every cast arm legacy writes:** a narrow load folded with its widening (`as% i64`, or a mask that only zero-extends) is the `_i64` load; `as!` and a bare `as` at a pin they can never hit (`holeMiss`, `instMiss`) trap with legacy's report or return; `m[k] as? V` over a `V | null` read is the read; a `boolean` cast to `i64`, `f32` or `f64` widens its 0 or 1. plumb-shape-cost's units now build with no IR blocker, so the ratchet reads at I8.
