# Type hash-cons stage 6b: `fieldStorageEq` without a depth, and D16736 (lane H), 2026-11-16

`fieldStorageEq(a, b, depth)` (`check_ty_relate.vl`) asks whether two field types share one storage.
82 call sites passed `REC_STORE_DEPTH` (8). Its budget only bounded list, nullable and map steps:
a record pair went through `recStorageField`, which asked each field with a fresh
`REC_STORE_DEPTH`. So on a recursive record pair the walk never ended. D16736 is the witness: two
recursive records that store a field differently, with the recursive field first, exhausted the
compiler's call stack at `vl check`.

The close threads the record pairs the walk is inside (flattened, source then destination, copied
on extend) through `recObjStorageEq` and `recStorageField`. A pair met again is stored alike so far,
which is the old exhausted answer and the coinductive one: the fields outside the cycle decide.
`depth` leaves `fieldStorageEq`, `recMapStorageEq` and every caller. `REC_STORE_DEPTH` stays for its
other users.

| reading | value |
|---|---|
| seed | fixpoint; every refresh exits 0 (stacked on #8644) |
| D16736 | compiler trap on master; now the check reject the reordered spelling gets |
| identity | 2,827 of 2,827 files byte-identical against #8644's seed |
| probes | the eight recursive-type programs terminate and print the same |
| depth grid | 240 of 240 run |
| distilled | no cell changed class |
| scaling | 90 of 90 |
