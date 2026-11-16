## Infrastructure (Track F)

- **Six union-member walkers stop at a cycle instead of a depth** (type hash-cons stage 6b, batch 5):
  `tyHoldsRecord`, `tyHasLitLeaf`, `tyHasMapMember` (`check_types.vl`), `tyNamesNominal`,
  `tyIsLitUnionLike` and `unionLeafIsWide` (`tyquery.vl`). Each records the unions it enters
  (`tyUnionWalkEnter`) in a list local to the call. The all-members query `tyIsLitUnionLike` keeps
  that list as a path, so a union shared by two branches is answered on each. None of the caps fired
  in the 6a census. Output is byte-identical.
