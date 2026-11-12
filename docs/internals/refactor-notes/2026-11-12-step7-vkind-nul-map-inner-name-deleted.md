# Step 7, lane H: `nulMapInnerName` is deleted with the predicates it left, 2026-11-12

`nulMapInnerName` (`emit_map_value_slots.vl`) peeled `| null` off a map spelling. It was lane H's
map-value slot parse. Its last caller was `shapeFieldElemName`'s code-29 arm, and lane F's
reflist cut 3 (#7617) deleted that arm. On master `1c930e7c` nothing calls it.

Deleting it left `nameIsBareMap` (`emit_base.vl`) with no caller, and that left
`nameIsMapMemberUnion` with none. All three are deleted. Each had no caller, so the deletion
changes no program's output by construction. The seed is still a fixpoint.

## Measurement

- **render-parse:** parses 19 → 17. `nulMapInnerName`'s `nullablePartOf` and
  `nameIsMapMemberUnion`'s `unionMemberCount` are gone; renders stay at 9. The baseline is
  rewritten in this PR.
- **Seed:** a fixpoint, 6,714,738 bytes.
- **The export budget:** 0 dead exports.

`nonNulBaseOf`, the file's other parse, has no lane H callers left. Its remaining callers are
lanes B, E and F's, and it goes with them.
