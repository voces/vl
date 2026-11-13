# Step 7 (L6, lane G): a row-less slice's atom column is carried as floor D16052, 2026-11-13

`msFreeSliceOfTy` (emit_union_registry) builds a row-less member slice from
`canonUnionMembersLitsInto` and stores the walk's member spellings as the slice's atom column. Its
readers are `msRenderSet` (5,669 programs) and `msMemberAtomsOfSet` (5,576), so the spellings
can't be dropped at the producer alone.

By coordinator ruling the site is carried as a floor under D16052. It is recorded in
`scripts/render-parse-floors.txt`, and the census moves it from `ty-string-parse` to
`ty-carried-floor`.

The row records the five `msMemberAtomsOfSet` call sites that reach a row-less set, found by
tagging all 16 sites and probing 24,020 files. It also records which of them decide by text. The
close is next on lane G's list: convert those callers to member types, then delete the free atom
column.
