## Infrastructure (Track F)

- **`scripts/ir-i8-self-list.sh`, every unit the I8 self-compile leaves unclaimed:** on a tree after `ir-i8-sweep.sh --apply`, a listing copy whose `emitUnclaimed` writes `unreachable` and carries on is built by the seed and then builds the source under `$VL_IR_SHADOW=5` (claim rows only, since the census modes that compare against legacy reach its stubs). On the I8 dress rehearsal it reads 20,305 functions, 6,095 const cells, 138 starts and 84 thunks claimed, and 1 unit unclaimed (`decodeArities`).
