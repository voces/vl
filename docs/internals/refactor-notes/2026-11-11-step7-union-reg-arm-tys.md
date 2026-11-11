# Step 7 L6: a shape arm's type is found by the canonical key, and two atom pairings follow the member, 2026-11-11

Cut order item 5 (`2026-11-11-step7-union-registry-census.md`): callers that lose or mis-pair a
member's type. Two lanes reported a find in this family:

- **w314: `internShapeArms` interns an arm untyped.** Both member lookups miss: the spelling's
  own row (`unionMemberTysOf(set)`) and site 10 (`unionMemberTysOfAB(10, set, setTy)`), which
  asked the softened key. An example is `{c2:i32}` under `Shape2 = Cir2 | Sq2`, in the 24
  `d361e*`, D1857 and `a004220` cells. The census lists site 10 among the sites where only the
  canonical key finds a row, for record unions spelled by shape.
- **w310 (D15675, #7154): `unionAtomTysOf` pairs atoms with canonical members by position,** and
  a pinned instance spells its members in source order. #7154 aligned
  `isVariantBoxUnionAtoms` by spelling (`unionAtomTysAlignedOf`). Two positional sites remained:
  `utkNameStructText` (`emit_union_tykey.vl`) and the nullable-closure result's mix test
  (`emit_collect.vl`).

The base is #7177 merged with master `45b11b99`.

## Changed

- **Site 10 joins `unSiteOnTyKey`.** `internShapeArms` and `internShapeDeepTy`'s closure-atom
  walk ask the canonical type key.
- **`unionAtomTysAlignedOf` moves to `emit_union_registry.vl`,** beside `unionAtomTysOf`, so
  `emit_union_tykey.vl` can call it without an import cycle. `utkNameStructText` and the mix
  test now call it. Each atom takes the canonical member that spells it. When some atom spells
  none, the pairing falls back to position, as before.
- `registerInlineUnionAtoms` keeps positional pairing. No lane has reported a case there.

## The reading

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded every
`internShapeArms` call whose spelling finds no row of its own. It read 19,536 programs: every
`tests/cases` file and every distilled cell, `cells/` and `named/`.

| | arms typed by site 10 | arms left untyped |
| --- | --- | --- |
| #7177 | 0 | 1,458 reaches in 343 programs |
| this PR | 183 reaches in 44 programs | 1,275 reaches in 300 programs |

The arms still untyped are mostly generic templates (`T|string`, `T[]|i32[]`), which have no row.
The other notable group is `A|B|null`, 172 reaches: the record union's row does not hold the
`null` atom, so its member count is not the arms'. Pairing those from the type's own members is
position-sensitive in the way D15675 is, so it is left for a member-keyed pairing.

## Proof

- **Bytes.** Every `tests/cases` file and every distilled `cells/` cell (9,202) was built with
  #7177's merged L1 seed and with this candidate's L1 seed. 9,202 of 9,202 are the same: exit
  code, module bytes, and the diagnostic with digits erased. CI's sweep grades the whole
  population.
- w310's witness pattern (`function k<T>(u: T | P)` with `T := Z[]`, and a nullable closure arm)
  prints the same on both sides.
- **Locally:** one refresh, lint-self, rep-fuzz, distilled `regress.vl`, seed-size,
  late-demands, and the dead-export and render-parse budgets.
