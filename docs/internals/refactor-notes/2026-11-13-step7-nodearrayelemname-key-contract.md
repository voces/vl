# `nodeArrayElemName`: graded a floor under the spelling-index contract, 2026-11-13

Lane A. The render-parse census (#7748) lists `nodeArrayElemName`'s five renders
(`check_emit_queries`) as failing. Coordinator's ruling: a render used only as a dictionary key,
never parsed back, is accepted when the key is canonical for the type. That means every site
that mints a row in the table and every site that looks one up must give one row per type.
Measurement only; no compiler change.

**Consumers** (traced at master). The function has two callers, `arrLitBoxElemName` and
`arrLitElemRender`, with ten consumers between them. Every consumer tests `== ""`, and none
compares the name against a specific spelling or parses it. Three only gate (`arrLitBoxElem`,
`arrElemIsClosureTy`, `arrLitNestedElemKind`). Seven also use the name as a row key, in two
tables:
- **the ref-list table** (`rlElem*`), which holds the kind-3 map, nested-list, closure-list and
  union box rows. Its one inserter, `rlInternNameTyK`, dedups on `repElemIdOfNameTy(name, ty)`.
  That is the element type's rep id whenever a type hint is passed, so the spelling decides a
  row only for an unhinted call;
- **`unNames`**, keyed by name through `unRowBySid`. The array literal's row is minted by
  `arrLitInferUnionElemName` and adopted by type key (`unNameAdoptTyKeyRow`).

**Can the keys come from the typed namer instead?** At both callers, the name was compared with
`rlRowNameOfTy(elem, false)` over the full population (24,207 programs). They differ in 1,352
programs (first message per program):

| class | programs | example: `nodeArrayElemName` / `rlRowNameOfTy` |
|---|---|---|
| optional scalar | 689 | `""` / `i32\|null` |
| map | 241 | `{[string]:{r:i32\|null}}` / `{[string]:Circle}` |
| value union | 174 | `""` / `K` |
| closure | 116 | `(()=>void)` / `""` |
| nested array | 88 | `({r:i32}\|{s:i32})[]` / `Shape[]` |
| union box | 28 | `Cat\|Dog` / `{meow:i32}\|{woof:i32}` |
| function | 15 | structural / nominal |

So the name cannot be swapped for the typed namer without re-keying both tables.

**Canonical-key test.** At the end of every emit, a probe scanned both tables for two rows
whose types are `tySame` and `tyEq` (nominality kept, so a newtype's rows count as distinct),
over the full population:
- No duplicate row carries a name `nodeArrayElemName` produced. Its keys meet the contract, so
  its five renders are graded a **floor** under the spelling-index contract.
- Two duplicates come from other producers, both on recursive types. Neither shows in the
  emitted module, and each is filed:
  - D16000: `unNames`, a recursive union reached through its map alias declared first;
  - D16001: the ref-list table, lists of a recursive record and of its intersection alias.
- With `tySame` alone, 38 more programs pair rows for a newtype and its base (`NtI32|null`
  beside `i32|null`). Those are distinct by design.

**The callers' type mismatch.** Both callers gate on `nodeTyAt(arrIx, fnIx)` but render
`nodeTyIxOf(arrIx)`. A counting probe reached a named element with an instance frame in 3,009
programs, and the two types were `tySame` in every one. Not reached; nothing filed.
