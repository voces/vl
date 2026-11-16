## Codegen, memory & runtime (Track B)

- **IR N2b-2a, a `.pop()` statement:** legacy's pop over an i32 or scalar list takes its layout
  from one shared plan (`popPlanOf`) and writes its statement form through a shared tail, and the
  IR builds a `.pop()` statement on an i32, i64, f64 or f32 list the same way. The self-compile
  hands 69 more functions to the IR in mode 3. No emitted byte moves.
