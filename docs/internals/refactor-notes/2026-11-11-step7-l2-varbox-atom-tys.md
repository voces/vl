# Step 7 L2 §7: a variant box's atoms paired with their own member types (D15675), 2026-11-11

The spelling-predicates note (`2026-11-11-step7-l2-spelling-predicates.md`) left P9 as a
floor. There, `isVariantBoxUnionAtoms` received a `tys` slice that did not line up with its
atoms. This PR finds the cause, files the clause-2 defect it produces as D15675, and aligns the
slice.

The base is master `f50936aa`, with a fixpoint seed on both sides.

## Cause

`unionAtomTysOf` gives the n-th non-null atom of a spelling the n-th non-null member of the
type's canonical sequence. A pinned instance spells its parameter in the order the source wrote
it, with `T` replaced, so `T | P` at `T := Z[]` spells `Z[]|P`. The canonical sequence orders
`P` first. `Z[]` was therefore typed as the record and `P` as the list, so the variant-box test
saw no ref-element array beside the struct. The union was never registered, and the `is` test
refused it.

P9's six disagreements were all in pinned generic instances, in 5 programs. Four of them typed a
map atom as a primitive, and in each of those the map is spelled beside a `string` member. That
is the shape this swap produces. This PR did not re-probe them one by one.

## Changed

- `isVariantBoxUnionOfTy` (`emit_collect`) is the one call the three variant-box sites make:
  `registerInlineUnionGo`, `registerCloResultUnion`, and `registerInlineUnionAtoms`' map guard.
  It pairs each atom with the canonical member whose atom spells the same
  (`unionAtomTysAlignedOf`, through `canonUnionMembersInto`). When some atom spells no canonical
  member, it keeps the positional pairing.
- A first attempt passed the type's canonical atoms to the test in place of the spelling's.
  That compiler trapped with `call stack exhausted` on `scripts/seed-provenance.vl`, which
  `refresh-compiler.sh` caught. The spelling's atoms are therefore kept, and only their types
  are aligned.

## Not changed

`unionAtomTysOf` still pairs by position at two other sites. The first is the nul-closure arm's
mix test in `emit_collect`. The second is in `emit_union_tykey`, which belongs to lane w302.
Both are named in D15675's grading list.

## Proof

- **Witness.** D15675 is refused on master and runs on the candidate. The same holds for the
  three-member spellings `T | P | string` and `P | string | T`. The fixture
  `tests/cases/generics/pin-union-param-ref-list-before-record.vl` holds both shapes.
- **Byte sweep.** `sweep.vl record --population cases` was run with the master fixpoint and with
  the candidate fixpoint. All 7,442 programs are the same, with 0 bytes-only movers and 0 output
  movers.
