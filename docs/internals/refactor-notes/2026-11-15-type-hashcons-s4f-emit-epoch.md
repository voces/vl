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
it**. None touches older state, and none happens outside a re-check. Lane M3 makes the same
argument for an alias fill: the placeholder is minted by the application it fills.

What those writes change did not exist before the re-check began, so no emit memo can have read
it. The checker's own memos (`hhStamp`, `tdStamp`, `shMemo` and others) do read those rows
during the re-check, so they still need every bump.

## The rule

- **One writer.** `tyMutBump(row, hole)` in `check_types.vl` is the only place `tyMutEpoch` and
  `tyEmitEpoch` are written. All 13 former `tyMutEpoch = tyMutEpoch + 1` sites call it.
- **Two epochs.** It always advances `tyMutEpoch`, so the checker memos are unchanged. It
  advances `tyEmitEpoch` too, unless the row or hole written was minted inside the innermost open
  mono re-check.
- **The marks.** `monoRecheckBegin` pushes them through `tyRecheckBegin`, `monoRecheckEnd` pops
  them through `tyRecheckEnd`, and `holeReset` clears them with the arena.
- **What each site passes:**
  - `tyPinElem`, `tyPinKey`, `tyPinVal`: the hole they solve;
  - `inferRetPublish`: the function row it patches;
  - `applyGenAliasTys`: the placeholder it fills (`resIx`);
  - the other nine: neither, so both epochs advance, as before.
- **The readers.** The emitter's memos read `tyEmitEpoch`: `emit_rep.vl` (26 occurrences,
  imports and comments included), plus `emit_classify`, `emit_union_tykey_text`,
  `emit_shape_rows`, `emit_nullable_rets` and `emit_ty_seal`. Their `STAMPED` entries in `scripts/emitter-state-audit.vl` name it.

This adds no mono function and re-derives nothing. The facts are the ones the re-check already
writes; only the stamp the emitter reads is narrower.

## Measurements

The base is master `c1493e4a` built to its own fixpoint.

| reading | value |
|---|---|
| seed | fixpoint, base and branch |
| identity | 19,780 of 19,780: all of `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named` and `compiler/entry.vl`. The sweep first showed one DIFF, `distilled/named/d582s_smsetv_bool_str_ufcs_typar.vl`; its outputs are byte-identical on both seeds over five runs, and it compares SAME when re-run (a timeout under the sweep's parallel load) |
| census, emit-phase writes over the 55 programs | 173, all fresh: `tyEmitEpoch` does not move |
| census, full corpus | see the PR |
| net compiler lines | +51 (`check_types.vl` +44: the helper, the marks, `holeIxOf` and the comments; the rest is one call per site and the renamed reads) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |

## Next: step 3

With `tyEmitEpoch` constant during emit on the corpus, the emitter's stamps can go:
- the `tyEmitEpoch` comparisons in the six files delete;
- a `tyEmitEpoch` bump while `emitProgram` runs becomes an `emitFail`, so a visible write during
  emit is a loud internal error instead of a stale memo;
- the per-program resets that already clear those memos stay.
