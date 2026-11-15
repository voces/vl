# D16395: `==` over records of different field sets is a check error, 2026-11-15

Lane B, a follow-up to D16394 (#8181). Fixpoint seeds on both sides: before is master
`f211a3f9a` (with D16394's field-wise compare); after is this branch.

## Change

The owner ruled on 2026-11-15 that `==` between records of different field sets is a check
error. `recEqFieldsAt` (`compiler/check_operators.vl`), which already handles two records whose
fields are stored apart, now refuses such a pair:

    `{f: i32, g: i32}` and `{f: i32}` have different fields (`g`); compare the fields you mean

Before, `{f, g} == {f}` passed check through width subtyping and was refused at emit, or built an
invalid module when both sides were nullable. A union compared with one of its members is
unaffected: it tests the arm, and another arm is unequal whatever fields the arms share (DECISIONS
D1180's refusal covers only two general unions).

Net compiler lines: +23 (25 added, 2 removed) (`check_operators.vl` only). Pin-helper delta: 0.

## Measurement

`record-eq-fields-stored-apart.matrix.vl`, with cells added for the ruling:

| | graded | runs | owed refusals |
| --- | --- | --- | --- |
| before (master) | 106 | 101 | 0 |
| after | 106 | 101 | 4 |

The four moved cells are `different_field_sets` and `different_field_sets_nullable`, each in both
faces. They move from an emit refusal (plain) or invalid wasm (nullable) to the owed check
refusal. `runs → not-runs` 0, `→ silent` 0.

The union cells run and are unchanged before and after:

- union vs member, same arm (true);
- union vs member, other arm (false);
- an arm whose fields are a superset of the other's (false);
- a nullable record against its own type (true).

`union_field_vs_member_field` (`{f: A | B} == {f: A}`) is refused at check before and after
(`{f: A | B} isn't equatable`). Whether the design owes that refusal is left to the owner.

## Filed

- **D16397:** `==` in a generic body instantiated at two records of one field set stored apart
  still reaches `emitProgram: struct equality is not supported yet`. The checker sees only the
  type parameters there. The `live-sites.json` row moves from D16395 to D16397. D16395's probe is
  deleted, since its program is now a refusal the design owes.
