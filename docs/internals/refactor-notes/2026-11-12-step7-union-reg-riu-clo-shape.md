# Step 7 L6 (lane G, cut 4d): the closure-result union and the registrar's shape test by type, 2026-11-12

This is stacked on cut 4c (#7623, `2026-11-12-step7-union-reg-riu-members.md`). It moves the last
two places in `emit_collect.vl` that read a union's spelling for a decision about its members.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, ran each typed rule
beside the text rule it replaces. It tallied each decision and reported once per program, at the
end of `emitProgram`, over the sweep list (24,020 programs graded).

| decision | agree | differ |
| --- | --- | --- |
| `registerCloResultUnion`: the closure result's union boxes (no / yes) | 311 / 7 | 0 |
| `registerInlineUnionGo`: the union is a single record shape (no / yes) | 10,004 / 0 | 0 |

- **The first row.** `registerCloResultUnion` split the result's spelling (`unionSetAtomsOfTy`) and
  aligned the atoms to member types (`isVariantBoxUnionOfTy`). It now asks `isVariantBoxUnionTys`
  of the result type's members (`riuMemberTys`, cut 4c).
- **The second row.** The shape test asked `nameIsWholeSpanShape(name)`. At its line it is never
  true, by spelling or by type: a record reaches the registrar's earlier returns first. It now asks
  whether `sty` is a record.

An earlier probe placed the shape test at the top of `registerInlineUnionGo`. There it differed in
64 calls in 20 programs: declared record names, which the earlier returns take. That is not where
the test runs.

## Changed

- `registerCloResultUnion` reads the result type's members.
- The registrar's shape test reads `sty`.
- **Deleted:**
  - `isVariantBoxUnionOfTy`, which has no caller left;
  - the registry's atom-to-type aligners, `unionAtomTysAlignedOf` and `unionAtomTysOf`, which
    only it read;
  - a stale comment about `nameIsWholeSpanShape`'s callers.
- `emit_collect.vl` no longer calls `unionSetAtomsOfTy`. Its one caller left is
  `unionArmsOfSetTy` inside the registry.
- `isVariantBoxUnionAtoms` (`emit_base.vl`, lane E's file) has no compiler caller left. The
  dead-export census still counts it as referenced, so it is left for lane E.

## Proof

- **Seed:** fixpoint. The census is identity on every decision, so the expected sweep is identity.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, render-parse, dead-exports (nothing new), emitter-state-audit.
- **The full sweep:** CI's `sweep` label.
