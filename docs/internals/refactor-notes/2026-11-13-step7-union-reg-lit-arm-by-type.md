# Step 7 L6 (lane G, #13 step 2): the literal-union-arm question reads the union's type, 2026-11-13

The base is master `c96d62aa` plus #7754. `unionCarriesLitUnionArmOfSet` asked the member set and,
where the set answered -1, the union's spelling (`unionCarriesLitUnionArm`, which split the name
and its `unionMemberSetOf` alias). Now the fallback reads the union's type. Each caller passes the
type its name came from: `unionNameRowOfExpr`'s `rowOut[1]`, or `unionEqOperandTy` at the union
`==` operands. The type's declared members keep an alias arm whole (`MU = MA | MK`), which the
box row's softened slice cannot. A union neither the set nor the type answers is a loud floor.
`unionCarriesLitUnionArm` is deleted, along with wasmEmit's import of
`nameIsLitUnionArmValueUnion`.

The union `==` operands (`emitUnionUnionEq`) used to ask the spelling alone. They now ask the set
first, like every other caller.

## Decision table

This was measured on the corpus population (`vl check --codegen` over every test case and filed
witness). At each place the set answered -1, the probe recorded the typed answer next to the
spelling's.

| typed answer against the spelling | sites | outcome |
| --- | --- | --- |
| agrees, true (`MU` ×2, `K \| f64 \| null` ×2) | 4 | unchanged |
| agrees, false | 66 | unchanged |
| declined: `i32[] \| i32[]`, members the walk does not claim, no literal union | 12 | now 0 (an unclaimed member matters only beside a literal union), as the spelling answered |
| no type at the site | 0 | the floor is unreached |
| union `==` operands whose answer moves when the set is asked first | 0 | unchanged |

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label.
