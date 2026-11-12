## Type system (Track A)

- **Step 7: `nulMapInnerName` and the two map-spelling predicates it left are deleted.** Lane F's reflist cut 3 (#7617) removed the code-29 arm that was `nulMapInnerName`'s last caller; `nameIsBareMap` and `nameIsMapMemberUnion` followed it. Render-parse parses fall by 2 (10 → 8 on master at the merge).
