## Codegen, memory & runtime (Track B)

- IR coverage, heap identity 4c (lane IR-M1): a returned record whose result's record kids were never noted retags at the result, so D17083's pin `mk2` builds in IR.
