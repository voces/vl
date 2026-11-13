## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the union key folds a brand over a scalar to its base.** A value union's storage key now keys `NtI32` as `i32` and `F32x4` as `v128`, as its label already did, so those rows are reachable by type. Rows reachable only by label at `pushValueUnionRow` fall from 64 programs to 25, all of them numeric literal sets. All 47 programs where the fold fires build byte-identical.
