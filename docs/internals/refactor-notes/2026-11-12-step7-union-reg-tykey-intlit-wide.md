# Step 7 L6 (step R1): a union keys an integer literal set beside other members as the base it is boxed at, 2026-11-12

The base is master `a0e195a9b`.

## Changed

`utkTyKeyTextGo` (emit_union_tykey_text) keys a union's members as before, with one change.
A member that is a set of integer literals, in a union with other members, keys as the base or
bases it is boxed at (`i32`, or `i64` past i32's range), each once. So `(1 | 2) | null` keys as
`i32 ; null`, the key of the `i32 | null` box it is stored in (`nulNumLitUnionBaseName`'s rep).

Unchanged:
- **A lone literal set** is its base scalar and has no row.
- **String literal sets** keep their own key. A string literal union is an atom, not a
  `string`, and whether `K | i32` and `string | i32` are one row is the next step's question.

## Census

A scratch probe compiler was run over the cases and cells, recording every union type key the
rule changes:
- **Every changed key is a nullable integer literal union.** `(1 ; 2) ; null`, `(1 ; 2 ; 3) ;
  null`, `(5000000000 ; 6000000000) ; null`, `(1 ; 2 ; 5000000000) ; null`, `1 ; null`, and so on.
- **None keyed a row before.** No lookup that finds a row today loses it.
- **103 calls in 31 programs** now find the box row, which their name already named
  (`msSetOfNameTy`'s group (a)).
- **46 calls in 35 programs** find none; no box row was minted for them.

## Proof

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress (distilled): no runs lost.
- cases_wasm: 7,499 passed.
- emitter-state audit: passes.

**The full sweep:** CI's `sweep` label.
