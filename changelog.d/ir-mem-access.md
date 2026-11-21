## Codegen, memory & runtime (Track B)

- **IR coverage, memory loads and stores:** an i32 linear-memory load or store builds through the
  IR as one memory access over its address and value, written by the access tail legacy also
  writes. Legacy's three load and store arms are one, over one plan per width
  (`memAccessPlanOf`) and one address plan (`memAddrPlanOf`). No emitted byte moves.
