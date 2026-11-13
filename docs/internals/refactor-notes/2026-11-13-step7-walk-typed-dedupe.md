# Step 7: the canonical union walk dedupes by type (2026-11-13)

`canonUnionMembersWalk` (check_program.vl) decided "this member is already in the list" by
comparing rendered names, and found the string arm by its spelling. Both now read the type:

- **Dedupe:** `memberTySame(seenTy[k], lt) && (!twin || seenTy[k] == lt)`. For a twin record
  union, only an identical type counts as a duplicate.
- **String arm:** `tyPrimNameIs(l, "string")`.

The rendered names are still computed, but only as labels for the `atoms` output. No decision
reads them.

`memberTySame` and `memberTyIn` moved from emit_obj_lit_fits.vl into check_types.vl, so the walk,
the box plans (#7832) and G's union key share one rule:

- `null` matches only `null`.
- A numeric literal softens to its base; a string literal set does not soften.
- Lists, maps and nullables recurse into their parts, softening at each level.
- At a leaf, two types match on `tyEq`, the declaration position, the nominal name and gen-app
  status.

## Measurement

The probe compared the name decision with the type decision at every pair the walk compares,
over the sweep population (24,229 programs).

| What the probe compared | Programs that agree | Programs that differ |
| --- | --- | --- |
| String arm: spelling vs `tyPrimNameIs` | 13,045 | 0 |
| Dedupe: name vs `memberTySame` | 10,589 | 2 |

The 2 programs that differ are `tests/cases/unions/numeric-tag-twin-arm-read.vl` and
`numeric-tag-unnarrowed-read.vl`. In both, the members are `{k:1,n:i32}` and `{k:2,n:i32}`: the
names merge them and the types keep them apart. Both unions are twin unions, so the twin guard
makes the walk's decision the same either way.

The sweep against master is byte-identical: 0 movers.
