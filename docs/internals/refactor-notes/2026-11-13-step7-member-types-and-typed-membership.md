# Box kinds and union membership read the member's type, 2026-11-13

Lane A, taking lane G's `wasmEmit` share and lane D's membership hand-off.

**Kinds.** Each site below read a union member's box kind with `valueAtomKind` over its rendered
spelling. Each now reads it with `boxAtomKindOfMemberTy` over the member's type:
- `emitUnionUnionNumCross` ×2, whose caller now collects member types beside the atoms;
- `unionBoxEqColumns`;
- `staleBoxFrom`;
- `boxNarrowScalarKinds` ×2, which now reads `canonUnionMemberTysOf`.

**Membership.** `boxWidenAtomFor` and `boxNarrowAtomFor` tested membership by spelling
(`strListHas`), so every caller had to keep the member names. That covered the three retag
entries and `memReadBoxPlan`. The test is now typed (`memberTyIn`), and every caller drops its
name list. The rule is the one the member render dedupes by:
- `null`, as -1 or the `null` primitive, matches `null`;
- a numeric literal matches at its base scalar, while a string literal set keeps its own type;
- otherwise two members match when they are `tyEq`, name the same declaration and brand
  (`armDeclSame`), and are both or neither a generic application. Lists recurse into their
  elements, ignoring `readonly`; nullables recurse into their inner type.

**Verified.** A probe computed the spelling answer beside the typed answer at all five
membership tests over the sweep population (24,224 programs). Successive rules removed each
disagreement class: the `null` encoding, a declared record against its structural twin, a
generic application against its shape, a string literal set, and a `readonly` list. The final
rule disagrees in none of the 3,028 / 2,764 / 1,205 / 111 programs that reach the four test
sites. The plain sweep reads no movers.

**Census.** Six parses leave: 3 `ty-string-parse` and 3 `ty-parse-unclassified`, all in
`wasmEmit`. The baseline lowers only those.
