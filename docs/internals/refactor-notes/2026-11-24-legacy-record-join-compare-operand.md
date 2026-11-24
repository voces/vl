# A record-joined value `if` compares as its record (2026-11-24, lane IR-N5, D17128)

A value `if` whose arm is a union narrowed to a record is written by legacy as a reference join at
the record's row (`ifJoinsAtRecord`, D17026). As a `==` / `!=` operand, `eqRouteOf` still took its
`exprUnion` as a union box and routed the compare to the box compare, which met a record and failed
to validate (clause 1), or, with both operands such joins, refused loudly.

## The change

- `eqRouteOf` (`wasmEmit.vl`): an operand that `ifJoinsAtRecord` is not a union-box operand.
- `binEqSideRow` (`emit_fn_scans.vl`): such an operand's struct row is its join's
  (`ifRefJoinOf(…).rjSlot`, `variantRowOf` for an arm kind), so `binEqStructRow` /
  `binEqVariantRow` resolve and the compare is legacy's field-wise struct `==`.

The first alone falls to `struct equality is not supported yet`; both are needed. The IR leaves
these compares to legacy (`operand type`), unchanged.

New test case: `unions/record-join-narrowed-arm-as-compare-operand.vl`, every compare position
with a box whose `x` differs from the compared record's and one whose `x` matches.

## Not in this change

- A union operand (`S`) compared with a record-joined `if` stays a loud reject; its sentence moves
  from `union ==: an operand's union has arms the box compare cannot serve` to
  `== over a struct union is not supported yet`.
- With no discriminant, two same-layout records are one type to the checker, so a same-layout
  variant compare has no spelling apart from the struct case.
- The direct-call argument is D17115; a field read off the join is D17108.
