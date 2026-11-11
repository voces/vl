# Step 7 L2 §7: the field walk's 8 name mismatches, one closed by the type and seven named, 2026-11-11

The walk re-census on top of #7176 (`2026-11-11-step7-l2-untyped-annotation-walk.md`) found 8
programs where `internInlineShapeTyGo` held a record type but walked a field untyped: the field
name it split from the spelling was not a field of the type. This note finds the two causes.

The base is master `9723f0bd`+, with the cases population.

## The two causes

The probe ran in a scratch compiler that was never refreshed into a seed, against the 8
programs. For every field whose type lookup missed, it recorded the shape spelling, the split
name, and the owner type's field names.

| programs | spelling | split name | cause |
| --- | --- | --- | --- |
| 7 | `{f: i32, n: i32}` | ` n` | a spaced display render: every field after the first keeps its leading space |
| 1 | `{f:string}\|{f:{q:i32}}` | `f`, text `string}\|{f:{q:i32}` | a union of two records, accepted as one shape because it opens and closes a brace |

The spaced spelling is the name of a `TypeRef` that `fvaAnnotMinted` (`check_annot_resolve.vl`)
mints for a type with no spelling, such as a set of functions. It spells that `TypeRef` with
`tyToStr`, the display render, and its comment says the checker reads the type, not the
spelling. `collectAnnShapes` walks the `TypeRef` by that spelling, through the `| null` peel
into the interner. The probe traced the walk's entry to this site.

## Changed

- `internInlineShapeTyGo` declines a shape whose `fieldsTy` is not a record. A spelling that
  opens and closes a brace can still be a union of records. Across the cases population this
  fires in 1 program, `structs/nested-union-softening-list-return-twin.vl`, whose type is that
  union. Its module is byte-identical, so the garbled row the split made was never used.

## Named, not changed

- **The spaced minted annotation, 7 programs.** The walk reads a display render as an
  emitter spelling. Trimming the split names would re-key those rows under a second spelling.
  A walk keyed by type has no split to get wrong, so this goes with the interner's re-key
  (the next slice) and is not patched here.

## Proof

- **Targeted.** The 1 program is byte-identical, with the same output.
- **Checks.** Listed in the PR. The full identity sweep is the PR's `sweep` job.
