# Relate C1: what the last fit-question brackets protect, measured, 2026-11-15

Review medium 3, stage C of `2026-11-15-relate-recorder-design.md`. After B0 (#8284) and B1 (#8289)
my lane has six `inferQuiet` brackets left that wrap a fit question. This note measures what each one
protects. The result: none can be deleted today. The note also records a premise of the design that
the measurement refutes, because the L2 design (lane G) depends on it.

The only code change is comment text. It states the contract at the three type-level brackets, and
the seed is byte-identical.

## 1. Dynamic: each bracket switched off

This ran in a scratch worktree, never pushed. For each bracket, `inferQuiet = true` became a
no-op and its `quietDepth` pair was neutralised in balance. A first attempt unbalanced the pair, and
because elaboration capture tests `quietDepth == elabCapQuiet`, the result was a self-compile trap.
That trap was the experiment's fault and is not a finding.

Each build was fingerprinted with `probe-rollback-census.ts --fingerprint` over 20,384 programs
(`tests/fixtures`, `tests/cases`, the distilled `cells/` and `named/`). The comparison is against
the same instrumented tree with every bracket on, whose 45 differences from master are the worktree
path in import messages.

| bracket | programs that change | what it protects |
|---|---:|---|
| `assignableExprIn`, the `rtStamp` re-ask | 10,330 | re-entry: under quiet `stampsStand()` is false, so the re-ask cannot reach its own block; without it the delivery recurses until the stack overflows |
| `validateCompArgCstr` | 1 | a container-floor refusal (`tests/cases/generics/type-parameter-list-copy-into-concrete-param.vl`): asked loudly, the probe reports it, and a program that runs stops running |
| `dstTyParamAdapts`, type-level (`check_assignable.vl`) | 0 | none observed |
| `callArgRepTy` (`check_bind_adopt.vl`) | 0 | none observed |
| `callRetRepTy` (`check_bind_adopt.vl`) | 0 | none observed |
| `binCstrPairRefusal` (`check_relate_core.vl`) | 0 | none observed |

A counter global incremented in `holeSolve` and `holeLink` (the only writers of a pin or a link,
which lane H confirmed), and a read of `tyMutEpoch`, were taken around each bracket.

- With the last four switched off together: 0 programs change. Across 16,775 runs inside them,
  there were 0 hole writes and 0 epoch bumps.
- Validation: a positive control at program end saw hole writes in 2,003 programs and epoch bumps in
  8,155. So the counter works.
- A second control around every loud `assignableExpr` (445,464 runs over `tests/cases`) saw 0 hole
  writes and 0 epoch bumps.

## 2. Static: what the four can reach

These paths come from the compiler's call graph: one shortest path per writer, over every function
that writes `holeSol` or `tyMutEpoch`.

- `substTyDeep`, called by `dstTyParamAdapts`, `callArgRepTy` and `callRetRepTy`, reaches:
  - the pin and link writers: `substTyDeep → substHoleTy → substHoleTyReal → joinTys → constrainEmpty → constrainEmptyD → tyPinElem / tyPinKey / tyPinVal → holeSolve`, and `… → tyLinkElem → holeLink`;
  - the in-place row writers: `substTyDeep → substCyclicApp → applyGenAliasTys`, then `fillObjDeclFields`, `fillUnionDeclMembers` and `nulFoldTieRecord`.
  - `applyGenAliasTys` also writes a field annotation's `nodeTyIx` only `!inferQuiet`. The application is memoised in `cUserTypes`, so whichever context applies a key first decides whether that write happens.
- The `assignable` in `dstTyParamAdapts` reaches the same writers through `genericFnAssignable → bindGenWalk → widenLitTy → joinTys` and `genericFnAssignable → substTyDeep`.
- `numBinPairRefusal`, called by `binCstrPairRefusal`, reaches no hole or epoch writer. It does reach
  the literal re-typing writers (`litTreeAdoptDst`, `f32LitTailsAdopt`, `numLitRetype`, which write
  `nodeTyIx` and `litTreeTy`), and those are gated on `inferQuiet` / `stampsStand()`. Its comment already
  names that contract: an instance's types must not retype the shared body's literal tails.

None of these paths is closed by anything the bracket's caller guarantees: a call signature can hold a
derived hole or a generic alias application. **The four brackets stay.** Their effect is unobserved on
20,384 programs, but it is reachable, and nothing proves it closed.

## 3. The premise this refutes

The design (§1.2, K8) said the type-level `assignable` "pins holes unless `inferQuiet`". That is wrong
on two counts:

- **No loud delivery pins a hole on the corpus.** Holes are pinned outside the relation: by demand
  solving, and by the joins the substitution reaches through derived holes.
- **The 28 `inferQuiet` reads in `check_relate_core.vl` gate other writes.** They gate diagnostics,
  join rows and literal re-typing.

What a fit question can still reach is the substitution's derived-hole join and the generic alias
fill. Both are statically possible and unobserved in practice.

For L2, a scheme's bounds come from the deferred demand rows (`*Cstr`, `HD_*`), not from the relation.
The ask-mode hole log the design planned at `tyPin*`/`tyLink*` is not built. It would cover the
`substTyDeep` path, but no observed program takes that path inside a fit question. It waits until
lane G asks for pins as data.

## 4. What remains

- `rtStamp` re-ask: the bracket is both the quiet mode and the re-entry guard. An explicit guard
  would add a second piece of state beside a bracket that must stay for quietness, so it waits until
  that re-ask no longer needs quiet. That happens when `listArmOfUnionFit` stops reaching the
  type-level `assignable`.
- `validateCompArgCstr`: needs the `Refused` channel, so a question can see a refusal without
  reporting it.
- The four type-level brackets: they go when `substTyDeep` stops writing. That means the derived-hole
  join and the generic alias fill become arena-level products, which is lane H's stage 4 and the L2
  checker seal.

## Measurements

- `inferQuiet` hidden scopes: 14, unchanged. Of them, 6 are lane Q's and 8 are this lane's: `fitsExpr`'s
  own, the six in §1, and `dstTyParamAdapts`'s other bracket. That last one wraps `checkNodeHook`, a
  re-check, so it was not switched off here and goes with lane Q's re-check brackets under `CheckRun`.
- Net compiler lines: +3 (comment text only). `emit_mono.vl` functions: 908.
- Identity: the seed built from this tree equals master `7c948348`'s seed byte for byte. Both are fixpoints.
