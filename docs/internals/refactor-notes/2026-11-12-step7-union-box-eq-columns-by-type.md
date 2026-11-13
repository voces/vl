# A box `==`'s arm columns are read from the union's type, 2026-11-12

Lane A, for lane G's step-7 L6 slice. Emit only.

**The change.** `unionBoxEqColumns` (wasmEmit) took a union's spelling, split it into atoms
(`unionMemberAtomsOf`), and turned each into a variant row (`variantIndexOf`) or a member type
(`unionArmTyOfAtom`). It now also takes the union's arena type. Where that type's arms resolve
(`armRowTysOfUnionTy`, a new sibling of `armRowsOfUnionTy` in emit_classify that also hands back
member types), the arms, rows and member types come from it. The spelling answers only where the
type is -1 or does not resolve. Each of the nine call sites passes the type its name came from:
- a field's `sFieldElemTyIx`;
- a ref-list slot's `rlElemTyIxAt`;
- the left operand of a union `==` (`unionEqOperandTy`): a map read's value union, else the
  operand's own type.

`emitStructUnionEq` takes the type beside the name.

**Census** (probe compiler, the full sweep population; compares each column's atom kind and the
tag, heap and struct row of its variant row, in order): 180 sites over 30 programs. All agree,
and every site had a type, so the spelling fallback was never reached.

The first probe used `unionBoxTyIxOfExpr` for the `==` operand. It differed at one site
(D15058's witness): a narrowed map read, whose storage type `U | null` added a `null` column the
name `U` did not have. `unionEqOperandTy` takes a narrowed read's own type instead.

**Which row a struct column takes.** With the union's own row of each member type
(`armRowsOfUnionTy`'s pick), four programs moved bytes only, with the same output:
`arms-name-one-record-shape-twice`, `struct-union-equality`, `struct-union-equality-scalar-arm`
and `union-concrete-variant-equality`. Each had extra per-arm locals: the frames the compare
stages are keyed by row, and the union's own row of `A` is a different row, with its own heap,
from the first row of `A`, which the spelling named. The probe's (tag, heap, struct row)
comparison missed this because those twin rows share a tag. A struct column therefore takes the
first row of its member type (`exactArmRowOfTy`), as the spelling did.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,202 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
