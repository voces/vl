## Codegen, memory & runtime (Track B)

- IR: a struct or variant-parameter field store (`o.f = v`) lowers through one arm decision (`fieldStoreArmOf`) and legacy's store tail, byte-identical; 114 self-compile and 22 corpus functions more are claimed.
