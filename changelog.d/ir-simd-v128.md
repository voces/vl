## Codegen, memory & runtime (Track B)

- **IR coverage, v128 and SIMD:** a `v128` value (an `F32x4`, a `Mask32x4`, any `new v128`) is a
  value rep in the IR, held in a 0x7b local, parameter or result. Every SIMD intrinsic but a load
  or store builds as one `RSimd` op, written by the instruction tail legacy also writes
  (`simdTail`). A brand cast between vector types builds as its operand. No emitted byte moves.
