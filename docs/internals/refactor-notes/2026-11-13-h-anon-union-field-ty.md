# 2026-11-13 — lane H: a record literal's union field mints from its type

`declTyIxOfName` falls to `resolveAnnot` when a name is neither a declared type nor a primitive.
Its census entry (emit_rep) falls once no caller passes it a render. This note covers lane H's
callers.

## The probe

A build tagged each lane H call: a `cUserTypes` hit, a primitive hit, or a miss to
`resolveAnnot`. Only the non-hits fired. Corpus: 24,170 programs (`vl check --batch --codegen`).

| caller | misses | what it passes |
| --- | --- | --- |
| `collectDeclaredUnion`, `declTyIxOfName(s.udName)` ×5 (emit_collect) | 0 | the declared name, an identifier |
| `registerValueUnionNameAB`, its `ty < 0` arm (emit_union_atoms) | 0 | — |
| `registerValueUnionName` (emit_union_atoms) | 38 programs | a rendered union spelling (`i32\|null`, `P[]\|i32[]`, `{x:i32}[]\|i32[]`) |

`repShadowCheckSpellTy` parses on purpose: it is the shadow harness's compare, under
`$VL_REP_SHADOW`.

## The conversion

`registerValueUnionName` had one caller: `anonMintRowFor`, which registers a record literal's
union field box under the name `anonUnionFieldName` or `anonNullFieldBox` rendered from a type.
The caller now keeps that type beside the name and calls `registerAnonUnionField(name, ty)`:

- A type with a spelling twin (`unionSpellingTyOf`) mints through `registerValueUnionNameAB`,
  as the typed seam does at site 55.
- A type with none (a record or alias arm) mints from the type itself.
- A missing type fails loudly.

`registerValueUnionName` is deleted.

## Agreement

A probe at the caller compared the twin against the parse of the name:

- Where the twin exists, it matched in every program.
- 6 programs have no twin. In 4 of them (`S`, `Shape`) the parse returned the field type's own
  id.
- In the other 2 (`i32|R`, `{x:i32}|string`) the type is the same structure as the parse
  (`i32 | {f: i32}`, `{x: i32} | string`) under a different arena id.
- All 6 produce the same output on master and the candidate.

Sweep, master fixpoint against candidate fixpoint: see the PR.
