## Type system (Track A)

- **The canonical union walk dedupes members by type, not spelling (step 7).** `canonUnionMembersWalk` merges two members only when `memberTySame` agrees (and, for a twin record union, only an identical type), and finds the string arm with `tyPrimNameIs`. The member rule now lives once, in `check_types` (`memberTySame`, `memberTyIn`).
