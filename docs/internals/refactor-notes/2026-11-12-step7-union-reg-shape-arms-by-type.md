# Step 7 L6: a union's inline-shape arms are typed by its type, not its member-set text, 2026-11-12

One of the five text callers of `unionMemberTysOf` that still reach the softened key through
`unRowOfSetText` (`2026-11-12-step7-union-reg-var-slice-sibling.md`'s list).

## Changed

`internShapeArms` (`emit_shape_intern.vl`) reads its arms' types from the row `set` is bound
to. Otherwise it reads them from the row its type `setTy` keys to (`unionMemberTysOfAB`). Only a
set with neither a bound row nor a type reads its member-set text.

## The census behind it

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded each
set-text hit here beside the members the type path gives. It read every `tests/cases` file and
every distilled `cells/` cell (9,202): 37 hits in 10 programs, every one held a type, and the
type path gave the same member types in the same order in all 37.

## Not changed

`unionRowOrSetArmTys` (`emit_map_twins.vl`) has 29 set-text hits in 10 programs. The type's
row and the bound row both miss there, so the text answers, and the site stays until its
callers hand it a type that keys. The other three (`unionArmMemberTys`, `unionArmTys` for an
unbound name, the `emit_union_registry` prim-arm test) hold only text.
