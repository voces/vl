# Type hash-cons stage 4f: the emitter's memos stamp with an emit epoch (lane H), 2026-11-15

This is the per-instance seal from stage 4e's census
(`2026-11-15-type-hashcons-s4e-emit-bump-census.md`). That census found three writers that move
`tyMutEpoch` while `emitProgram` runs, all inside mono's instance re-checks:
- `applyGenAliasTys`: 189 bumps in 139 programs;
- `tyPinElem`: 100 bumps in 32 programs;
- `inferRetPublish`: 73 bumps in 23 programs.

## What every emit-phase write touches

A scratch seed (never committed) marked the arena length and the hole count at each
`monoRecheckBegin`. It then classed every emit-phase write against the innermost open mark.
Over the 55 programs with a `tyPinElem` or `inferRetPublish` bump, **all 100 pins solve a hole
minted inside the same re-check, and all 73 published returns patch a function row minted inside
it**. None touches older state, and none happens outside a re-check.

The alias fills are different. Measured against the re-check mark, all 189 are visible: the
application runs outside a re-check, or its placeholder predates the mark. The narrower argument,
lane M3's, does hold. The placeholder is minted by the application that fills it, and only that
application's code holds it before the fill. So the application opens its own fresh scope. That
holds only for an **acyclic** instance (M3's caveat): a cyclic instance's field resolution builds
types that reach the still-empty placeholder, and a memo computed in that window has seen the
empty row. A cyclic fill therefore still moves `tyEmitEpoch`.

What those writes change did not exist before the re-check began, so no emit memo can have read
it. The checker's own memos (`hhStamp`, `tdStamp`, `shMemo` and others) do read those rows
during the re-check, so they still need every bump.

## The rule

- **One writer.** `tyMutBump(row, hole)` in `check_types.vl` is the only place `tyMutEpoch` and
  `tyEmitEpoch` are written. All 13 former `tyMutEpoch = tyMutEpoch + 1` sites call it.
- **Two epochs.** It always advances `tyMutEpoch`, so the checker memos are unchanged. It
  advances `tyEmitEpoch` too, unless the row or hole written was minted inside the innermost open
  mono re-check.
- **The fresh scopes.** `tyFreshBegin` pushes the marks and `tyFreshEnd` pops them. A mono
  re-check opens one (`monoRecheckBegin` / `monoRecheckEnd`), and so does an alias application,
  from just before it mints its placeholder to just after the fill. `holeReset` clears the marks
  with the arena.
- **What each site passes:**
  - `tyPinElem`, `tyPinKey`, `tyPinVal`: the hole they solve;
  - `inferRetPublish`: the function row it patches;
  - `applyGenAliasTys`: the placeholder it fills (`resIx`), or neither when the instance may
    reach itself. The test is `tyMayReachSelf`: uncached and run at fill time, because an outer
    fill can close the cycle late. It answers true when its walk gives up past depth 64, so a
    give-up keeps the bump. `tyReachesSelf` and its callers are unchanged;
  - the other nine: neither, so both epochs advance, as before.
- **The readers.** The emitter's memos read `tyEmitEpoch`: `emit_rep.vl` (26 occurrences,
  imports and comments included), plus `emit_classify`, `emit_union_tykey_text`,
  `emit_shape_rows`, `emit_nullable_rets` and `emit_ty_seal`. Their `STAMPED` entries in
  `scripts/emitter-state-audit.vl` and their disable edits in `scripts/memo-generation-rows.json`
  name it.

This adds no mono function and re-derives nothing. The facts are the ones the re-check already
writes; only the stamp the emitter reads is narrower.

## Measurements

The base is master `c1493e4a` built to its own fixpoint.

| reading | value |
|---|---|
| seed | fixpoint, base and branch |
| identity | 19,780 of 19,780 files, final tree: all of `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named` and `compiler/entry.vl` |
| census, full corpus (15,323 programs that reach emit) | **0 emit-visible bumps**; 362 fresh (189 alias fills, 100 pins, 73 published returns). No emit-phase alias fill was cyclic |
| net compiler lines | +72 (`check_types.vl` +58: the helper, the fresh scopes, `holeIxOf`, `tyMayReachSelf` and the comments; `check_relate_core.vl` +8: the alias scope and its cycle test; the rest is one call per site and the renamed reads) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |

## Next: step 3

With `tyEmitEpoch` constant during emit on the corpus, the emitter's stamps can go:
- the `tyEmitEpoch` comparisons in the six files delete;
- a `tyEmitEpoch` bump while `emitProgram` runs becomes an `emitFail`, so a visible write during
  emit is a loud internal error instead of a stale memo;
- the per-program resets that already clear those memos stay.
