## Codegen, memory & runtime (Track B)

- IR: a struct field store (`o.f = v`) lowers through one arm decision (`fieldStoreArmOf`) and legacy's store tail, byte-identical; 93 self-compile and 22 corpus functions more are claimed.
