# Step 7 (lane D, D16032): the arm-path scans read the row their read carried, 2026-11-13

`unionListElemMapFieldMember`, `unionStructArmMapFieldMember` and `unionStructArmMapListElemIndex`
(emit_fn_scans) took a union's name from `unionNameOfRead`, then looked it up again in `unNames`
through `unionArmTys`. Since #7834 that read carries the row its type keys. The scans now ask for
it (`unionNameRowOfRead`, the read-side twin of `unionNameRowOfExpr`) and pass it to
`unionArmTysOfRow`. That function reads the row's atoms (`unionArmsOfRow`) and member types
directly, and falls back to the name only where the row records no members.

## Measurement

An MPROBE build over the 24,070-record population, at `unionArmTysOfRow`:

| path | programs | decisions | carried row vs the name's row |
| --- | --- | --- | --- |
| row | 15 | 37 | same in every one |
| name fallback | 0 | 0 | — |

**Byte comparison:** master against this change, 15 of 15 programs reaching the scans build
identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
