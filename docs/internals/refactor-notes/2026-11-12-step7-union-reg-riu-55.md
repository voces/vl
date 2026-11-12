# Step 7 L6 (lane G, cut 5b): the inline registrar's value union is named by its type, 2026-11-12

The base is master `1e3a4f41`, after cut 5a (#7651, `2026-11-12-step7-union-reg-rvu-of-ty.md`).
`registerInlineUnionGo` registered a value union under its caller's name: the render of the type
it holds (A/B site 55). It now calls `registerValueUnionOfTy(55, sty)`, which names the row by the
spelling the type gives (`valueUnionNameOfTy`, else `valueUnionKeyTextOfTy`).

## The census (cut 5a's)

Over the sweep population, at site 55:

| | calls | programs |
| --- | --- | --- |
| the derived name equals the caller's | 9,294 | 4,984 |
| it binds the type's key row | 39 | 30 |
| it differs | 243 | 187 |

The 243 differences are spellings of one union:

- member order: `f64|i32` against `i32|f64`, `i32|string` against `string|i32`;
- an alias against its literals: `K|i32` against `i32|K`, `"a"|"b"|i32` against `i32|AB`;
- D4320's one-list: `f64[]` against `f64[]|f64[]`.

A value union's tags are per kind, so a rename moves no tag. A row's member columns follow its
name's order, so the expected movers are bytes-only.

## Unchanged

Site 55 still resolves the name it registers (`declTyIxOfName`) when its type is not a flat value
union (`valueUnionTyIsFlat`). The spelling it resolves is now the type's own. Moving that
resolution to `sty` is the next step for the site; it is what the October note found broke 12
modules, and it is graded on its own.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress (no runs lost; the 28 "other movement" classes are the same on
  a master seed), rep-fuzz, check-filed-witnesses `--strict`, late-demands, seed-size,
  dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. The expected movers are bytes-only renames in the
  census's 187 programs.
