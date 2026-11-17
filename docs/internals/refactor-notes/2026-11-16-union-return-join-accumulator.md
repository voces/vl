# Union return joins grow linearly per return, 2026-11-16 (lane REP)

Step 2 of the union-width plan in `2026-11-16-union-arm-rows-and-scan-census.md` (step 1 is #8846).
The family is one function returning a union of N declared record types from N returns, called N
times; at N = 128 the checker's return join was 30% of its samples.

The coordinator ruled for a caller-owned accumulator (declining a global marker on join-built
unions), gated by `joinTys`'s own ladder, with the early-exit dedupe folded in only if corpus
identity and distilled regress both hold.

- `joinTysInto(acc, a, b)` runs `joinTys`'s whole ladder; only its last rung, the plain variant
  join, reads `acc`. When `a` is the type that join last built for this caller, with no
  fieldwise record replacement and under the same `tyMutEpoch`, `cUserTypesVer`, `nomLitRelax`,
  no-fieldwise flag and no open assignable walk, `a`'s members are kept as they are and only
  `b`'s are compared. Each kept member was compared with every earlier one when it was kept, so
  re-comparing them answers the same. Owners: `noteNaturalRet` (renewed at a function's first
  return) and `sharedUnionFieldTy` (one per read).
- `setMapRecordClashMsg` asks its pairs only among records holding a map, directly or through
  record fields (a visited set ends the walk); no other pair can clash.
- `dropLitsBesideBase` answers a literal whose base is a scalar from the scalar members' names,
  as `tySame` of a scalar holds only beside a scalar of its name or a union (which keeps the
  scan).
- The early exit (stop comparing once a member is a duplicate) held corpus identity but read
  1,554.9M → 1,554.8M at N = 128: with the accumulator, new members are rarely duplicates. Not
  taken.

| N | master before #8846 | #8846 | both |
|---:|---:|---:|---:|
| 16 | 24.3M | 22.8M | 21.5M |
| 64 | 362.9M | 234.8M | 152.5M |
| 128 | 2,293M | 1,266M | 528M |

| reading | value |
|---|---|
| L2 fuel, master 6cd505a50 against this change, measured alike | 94,029,577,172 → 93,948,072,527 (−0.08G, −0.09%) |
| the stateless parts alone, against c4052ed4e | −97M; the accumulator adds about +15M on L2 and −22% at N = 128 |
| corpus identity (`corpuscmp` against c4052ed4e's compiler) | 8,470 modules, 0 DIFFER, 0 LOST |
| axis `record union arms returned` (64 against 16) | 7.09, bar 13.0 → 9.0 (#8846 alone reads 10.30) |
