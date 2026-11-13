# Step 7 (L6, lane G #13 P2, last stray): a printed union's box kinds come from member types, 2026-11-13

`printUnionPlanCode` (emit_fn_scans) plans a printed union's dispatch. Where the row's banked
value kinds don't cover the members, it used to parse each member's atom with `valueAtomKind`.
Now it reads `boxAtomKindOfMemberTy` over the member types.

The member types are taken from the first of these that lines up with the atoms:

1. the box type's set;
2. the declared type's leaves;
3. the print's store set (`printUnionStoreSetOf`);
4. the named union's set (`msSetOfUnion`, the D16060 name rung).

If none lines up, a loud floor fires.

## Decision table (probe over 24,020 corpus and witness files)

| path | programs | calls | kind disagreements |
| --- | --- | --- | --- |
| typed (box, leaves or store set) | 22 | 65 | 0 |
| named union's set | 2 | 6 | 0 |
| floor | 0 | 0 | — |

A first draft skipped the store set. It floored
tests/cases/unions/value-union-niche-survivor-delivery.vl, which runs on master.
