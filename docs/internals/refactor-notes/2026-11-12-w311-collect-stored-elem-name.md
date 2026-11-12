# Step 7: a type-keyed list literal row is stored under its type's row name, 2026-11-12

`collectAArrayLit` (`emit_collect.vl`) interns a list literal's ref-list row in three places:
- the kind-9 branch;
- a kind-9 key reached through a list of lists;
- the plain mint.

Each passed `arrLitElemName(i, -1)` as the stored spelling. It is the literal's element name,
read off its shape. A new `arrLitStoredElemName(i, ty)` passes the row name of the key type
(`rlRowNameOfTy`), the spelling `rlInternOfTy` stores under. It falls back to the literal's
own name only where the key renders none.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population, base master `a33a4dde`: same
23,831, bytes-only 116, output movers 0, runs → not-runs 0, new compiler traps 0. Each of the
116 movers was rebuilt on both seeds and disassembled. Every one keeps its size, its type count
and its lines, and only the type indices reorder, because a row's stored name orders its
emission.

## What still takes the literal's name

An `emitFail` probe on the fallback fires on 799 cells. Every firing has no key type
(`arrLitMintHintTy` is -1): a record keyed by its declaration, such as `#anon0` (129) or
`Circle` (106), a hole function, a literal, or a type parameter. `arrLitMintHintTy` keeps those on
the name's key by contract. They move when struct rows take the declaration-aware key.
