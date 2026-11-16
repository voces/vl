# Type hash-cons stage 6b, batch 5: six union-member walkers get visited sets (lane H), 2026-11-16

These are the first of the 57 type-walker caps that need a visited set
(`2026-11-16-type-hashcons-s6b4-acyclic-type-caps.md`): six in `check_types.vl` and `tyquery.vl` that
walk union members and nullable inners (`tyIsLitUnionLike` also walks list elements).

| walker | query | old cap |
|---|---|---|
| `tyHoldsRecord` | some member is a record | `depth > 8` |
| `tyHasLitLeaf` | some member is a literal | `depth <= 0` |
| `tyHasMapMember` | some member is a map | `depth <= 0` |
| `tyNamesNominal` | some member names a nominal type | `depth <= 0` |
| `tyIsLitUnionLike` | every non-null member is literal-like | `depth <= 0` |
| `unionLeafIsWide` | some member is `i64` or `f64` | `depth <= 0` |

## Why a visited set, and which one

A walk over only union members and nullable inners can meet itself again only through a union that
is its own member. D16733 (#8540) refuses that at the declaration. `tyIsLitUnionLike` also steps into
list elements, and `type K = "a" | "b" | K[]` is legal and loops through the list. So each walker gets
a visited list over union rows (`tyUnionWalkEnter`, `check_types.vl`). The list is local to the
outermost call, so the phase-state census sees no new table (6b-2's lesson). A union met again
answers false:
- **The five existence queries** keep every visited union: the first visit already answered, and
  false is neutral.
- **`tyIsLitUnionLike` asks about every member.** Its list is a path, popped when the union's walk
  ends. A union shared by two branches (a DAG, not a cycle) is answered on each, and only a cycle back
  to a union still open answers false, as the exhausted cap did.

`emit_obj_lit_fits.vl` declares a private one-argument `tyHoldsRecord` of its own. The depth rewrite
skips that file.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base (master c144bf3f1's compiler); both refreshes exit 0 |
| identity | 2,827 of 2,827 byte-identical: the 2,000-file sample with `compiler/entry.vl`, 800 union, literal and nullable cases, and every recursive or cyclic corpus file |
| probes | eight recursive-type programs, including `type K = "a" \| "b" \| K[]` and `type W = i64 \| W[] \| null`, terminate and print the same |
| guest fuel, fixed input | 92,304,284,736 → 92,358,322,164 (+0.06%) |
| net compiler lines | +50 over 14 files: six wrappers, the helper, the path pop and their comments |
