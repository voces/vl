# Step 7 L6 (lane G, cut 8a): the union-name wrappers answer from types; the producer is one floor, 2026-11-13

The base is master `6d8f552d`. `unionNameRowOfExpr` (10 consumers: the is-tests, `wideRetagPairs`,
`emitUnionConcreteEq`, `njMembersOf`, `njBoxHoldsNull`, `sharedUnionFieldPlan`,
`unionArmRowsOfExpr`) and `letUnionNameOf` (`emitAssignGlobal`, the hole read) returned the
name `unionNameOfExpr`'s spelling rungs produced.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, compared the old name
against three typed candidates at every `unionNameRowOfExpr` call (16,208 calls over the sweep
list, 24,170 programs). Each candidate is named by its row, else its value-union key, else its
declared alias.

| candidate | agrees (same name or same row) |
| --- | --- |
| the box type (`unionBoxTyIxOfExpr`) | 15,397 |
| … else the node's own type, where the box type names none | +34 |

What is left:

- **614** calls: a function value's nullable, `i32|null`, which no type names because its box is
  keyed by its set.
- **About 15** calls: a declared alias spelling (`M`, `J|string`) that no type names.
- **109** calls where the box names a different union:
  - alias against spelling (`i32|string` → `U`);
  - a literal duplicate (`string|string|i32` → `string|i32`);
  - member order;
  - a dropped null (`A|B|null` → `A|B`, where the node type agrees with the box).

`letUnionNameOf` against `letBindTy` (5,692 calls): 176 equal and 4,894 where neither names a
union. The other 613 are the function-value nullable, and 3 are named only by the type.

## Changed

- `unionNameRowOfExpr` answers from the box type, else the node's type, with the row that type
  keys.
- `letUnionNameOf` answers from `letBindTy`.
- Where no type names a union, both fall to one floor, `unionNameOfExprFloor` /
  `letUnionNameOfGo`. These are now the producer's only readers inside lane G's wrappers.
- The 109 differing spellings and the 3 type-only lets take the typed answer. The sweep grades
  them.

## Proof

- **Seed:** fixpoint.
- **The full sweep:** CI's `sweep` label. Movers expected among the 109; graded by output.
