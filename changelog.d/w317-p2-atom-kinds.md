## Codegen, memory & runtime (Track B)

- **Step 7, #13 P2 (lane D's half): four atom-kind decisions read the member's type.** `boxWidenAtomFor` and `boxNarrowAtomFor` take their members' types and read the box kind from them. So do `unionHasAtomKindArm` and `nliAtomOfExpr`'s call arm, which reads the callee's return type. All of these previously classified a rendered atom. `boxAtomKindOfMemberTy` (emit_rep) is `boxTagOfTy` with the atom parse's rules for `null`, literals and literal unions. All 3,935 programs that reach the sites build byte-identical.
