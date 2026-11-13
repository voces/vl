# 2026-11-13 — lane H: a declared union's variants match the row by type (D16052)

D16052 retires the atom column a union with no row answers from. `collectDeclaredUnion` read it
twice, through `unionTyArms`:

- An alias member's arm count decided whether the member is spelled expanded.
- A nullable member's arms became variants named by their atoms. A row-less set answered these
  in 18 corpus programs.

Then `declVariantPos` placed each variant on a row member by matching its spelling against the
row's atoms.

## The change

- Both reads take the member types alone (`unionTyMemberTys`, G's #7845). emit_collect no longer
  imports `unionTyArms`.
- `declVariantPos` matches by type: the first row member `tySame` to the arm's type that no earlier
  arm took, so twin arms keep their order.
- An expanded nullable member's arm is named after the row is recorded, from the row's own atom at
  its matched position, or `null`. An arm the row holds under no member fails loudly.

## Agreement

A probe compared the type match with the spelling match at every variant position whose arm or
row member is a record, the only positions `mintVariantRows` reads (24,170 programs):

- 6,632 of 6,637 agree.
- The other 5 are intersection arms (`Node&{v:i32}`, `Wide&{w:i32}`). The spelling match missed
  them (-1) because the row spells the folded shape; the type match finds row position 0. Both
  give the same variant type.
- The row-less nullable expansions (18 programs) all agree.

Sweep, master fixpoint (52100b11c) against candidate fixpoint: 24,229 same, 0 bytes-only
movers, 0 output movers, no runs lost, no new compiler traps.
