## Codegen, memory & runtime (Track B)

- **IR stages an n-ary node's earlier operands below a later one's `if` or `??` (lane COV-UNION):** simd, simd memory, array spread, host call, log, byte string, memory op, memory access, atomic, array new, list copy and a captured call's arguments go by one rule (`irBStageOperands`) in place of twelve refusals.
