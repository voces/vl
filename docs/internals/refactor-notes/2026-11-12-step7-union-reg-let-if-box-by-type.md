# Step 7 L6 (lane G): a `let`-`if` binding's box is named by its type, 2026-11-12

Lane I's classifier-pair grading named this ARENA + NAME pair. `emitLetIfInit` decided whether a
`let` initialised by an `if` boxes as a union, and under which name. It took the caller's
`letUNm`, else the annotation's spelling (`tyNameOf`), else the init's union name
(`unionNameOfExpr`), and boxed when that name was non-empty. The name reached `emitUnionBoxOwed`
beside `nulTy`, the binding's union type (its annotation's, else the joined `if`'s).

Since C3a (`2026-11-12-step7-union-reg-box-name-from-ty.md`), `emitUnionBoxArg` names a box from
its type whenever the type gives one (`boxDstName`), so the caller's name matters only where the
type gives none.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, compared the old name
with `boxTyName(nulTy)` at every `union` slot over the sweep list (24,020 programs graded):

| | calls | programs |
| --- | --- | --- |
| both box; the box's name is equal | 623 | 353 |
| both box; the two names bind one row | 14 | 13 |
| one boxes and the other does not | 0 | 0 |

## Changed

- The gate and the name are `boxTyName(nulTy)`.
- `emitLetIfInit` drops its `letUNm` parameter.
- The D969 comment now states the contract: an un-annotated binding boxes too.

`letUNm` still feeds the plain-init path (`emitLetPlainInit`); that path is outside this pair.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, dead-exports, emitter-state-audit.
- **The full sweep:** CI's `sweep` label. Expected identity.
