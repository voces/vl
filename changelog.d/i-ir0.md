## Codegen, memory & runtime (Track B)

- **IR step I0:** the typed mid-level IR's node set, its verifier (rules 1–8) and a phase-A
  shadow builder over I1's constructs. Under `VL_IR_SHADOW=1` every lowered function inside
  the set is built, verified and discarded: 1,524 of the self-compile's 17,322 functions
  build and verify. No function is claimed, so no emitted byte moves.
