## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the arm-path scans read the row their read carried.** Three map-arm scans in emit_fn_scans no longer look a union's name up again in `unNames`. They take the row the read already found by type (`unionNameRowOfRead`) and read its atoms and member types from it (`unionArmTysOfRow`). All 15 programs that reach the scans build byte-identical.
