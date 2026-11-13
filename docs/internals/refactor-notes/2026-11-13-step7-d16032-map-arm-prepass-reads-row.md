# Step 7 (lane D, D16032): the frame pre-pass's map-arm scans read the carried row, 2026-11-13

`unionMapArmIdent` and `unionMapArrayElemIndex` (emit_fn_scans) took a union's name from
`unionNameOfRead` and dropped the row the read carried. Then `unionHasMapArm` /
`unionHasMapArrayArm` looked the name up again in `unNames` through `unionArmTys`. Both now ask
for the row (`unionNameRowOfRead`) and pass it to `unionHasMapArmOfRow` /
`unionHasMapArrayArmOfRow`. These read through `unionArmTysOfRow` (from #7839): the row's members
where it records them, else the name's.

The name-only versions had no other caller and are deleted: `unionHasMapArm`,
`unionHasMapArrayArm`, `unionMapArmName`, `unionMapArmNameTy`.

## Measurement

An MPROBE build over the 24,070-record population at `unionArmTysOfRow`, which now has five
callers (#7839's three scans and these two):

| path | programs | decisions | carried row vs the name's row |
| --- | --- | --- | --- |
| row | 32 | 89 | same in every one |
| name fallback | 0 | 0 | — |

**Byte comparison:** master against this change, 32 of 32 programs reaching these callers build
identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
