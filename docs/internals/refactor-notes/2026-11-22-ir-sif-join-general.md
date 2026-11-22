# IR: SIf's decided join is a value, not a node pointer, 2026-11-22

Lane IR-N4. Coordinator ruling (option 1): #9478 lands with `siJoinAt`, the chain head's node
index, and this follows straight after it. IR-D1's bundle `choice` arm needs the same field set to
`(struct, si)`, a join with no chain head to point at.

## Change

- `SIf.siJoinAt: i32` becomes `siJoin: RefJoin` (`rjKind`, `rjSlot`) and `siJoinNul: boolean`.
  Both are still built only through `sIf`, which defaults them to no join and `false`.
- `refIfLink` stores the head's kind and slot and the link's accumulated null; it no longer takes
  the head's index.
- The lowering's valued-if open reads `siJoin` and `siJoinNul` when a kind is set, under the same
  gate, and otherwise asks `ifRefJoinOf` and `ifLinkYieldsNull` of the link as before. A decided
  join is stored, so the lowering asks nothing for it.

New admission predicates (R8): none. The stored kind and slot are `ifRefJoinOf`'s answer at the
chain head, and the null is the builder's accumulator, which `refIfLink` already holds equal to
the link's own `ifLinkYieldsNull`.

Generated code is unchanged: the chain's links open at the same blocktype either way. The shadow
row is #9478's `tests/ir-shadow-rows/ref-if-chain-head-join.vl`.
