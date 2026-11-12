# Step 7, lane H: `pushDestVKind`'s struct-row rung is filed as ruled, 2026-11-12

#7629 read `pushDestVKind`'s kind off the element type, with one rung kept: a variant element
stored in a struct row is `struct`. The coordinator ruled that rung BY DESIGN. It is a storage
rule, not a type question, the same ruling as `ifExprRefKindOf`'s variant rung.

`vkind-census.vl`'s `RULED` table now names it. `vl run scripts/vkind-census.vl` on master
`1125cf29` with this change reads 87 functions:

| family | before | after |
| --- | --- | --- |
| ruled rung or default | 7 | 8 |
| descriptor read + own rungs | 1 | 0 |
| codec | 4 | 4 |

The other families are unchanged. No compiler file changes.
