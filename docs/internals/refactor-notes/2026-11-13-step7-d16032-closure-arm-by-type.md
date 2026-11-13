# Step 7 (lane D, D16032): the closure-arm coerce reads its arm by the union type, 2026-11-13

`emitUnionCoerceList` asked `unionClosureArmName(unionName, uTy)` for the closure arm's atom
name, tested it only for `!= ""`, and then `cloBoxArmTy` looked the same arm up again by name
(`unionClosureArmTyOfRow(-1, unionName)`).

`unionClosureArmTyOfTy(name, ty)` (emit_union_atoms) replaces `unionClosureArmName`. It returns
the first function-typed member's type through `unionArmTysOfTy`, which reads the row `ty` keys
first (lane G, #7862), or -1. The coerce uses that type for both the presence test and the tag
fallback. `cloBoxArmTy` became `cloBoxOwnFnTy`: the carrier's own checked function type, or -1.
The `==` caller keeps its lazy fallback through `cloBoxEqArmTy`, so a union name is never looked
up while the operand's own type answers.

None of lane D's callers asks `unionArmTysOfTy` for atoms anymore. Its remaining atom reader is
`unionArmTyOfAtomTy` in `emitUnionUnionEq` (lane G, D16052).

## Measurement

An MPROBE build over the 24,070-record population compared, at the coerce site, the arm type by
the union type with the old name-path arm: same in 58 programs (140 decisions), different in none.

**Byte comparison:** master against this change, 58 of 58 programs reaching the site build
identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
