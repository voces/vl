# Type hash-cons stage 4e: which writers still move `tyMutEpoch` during emit (lane H), 2026-11-15

The last slice of stage 4 deletes the emitter's `tyMutEpoch` reads. This note measures whether that
can be done, and what it waits for. Docs only.

## Why not re-key the memos

Re-keying a row-keyed memo on a content id is correct only when the memo's answer is a function of
that id's equality. Read against the four files with no generic-alias dependence:

| file | memo | can it re-key on an id? |
|---|---|---|
| `emit_union_tykey_text.vl` | `utkMemo*`, `utkShape*` | no: the answer is key text that names a declared struct, and every id flavour merges a struct with its anonymous twin |
| `emit_nullable_rets.vl` | `gck*` | no: keyed by slot, with seven invalidation inputs, of which `tyMutEpoch` is one |
| `emit_rep.vl` | `repKeyMemo` | it becomes `tyRepId` when lane E's stage 3½ re-keys `repOf` (lane E's file and stage) |
| `emit_rep.vl` | `rcMemo`, `rtSync`, the slot caches | a structural fact or a program-fact cache; re-keying gains nothing while the id itself reads the epoch |
| `emit_ty_seal.vl` | the id memo | must keep its stamp while rows mutate |

So the systematic route is to make the epoch stop moving during emit. Then every emit-side read is
a no-op, and they all go in one deletion.

## The census

There are 13 sites that advance `tyMutEpoch`. Each was instrumented with a per-site counter, split
by whether `emitProgram` was running. This ran on a scratch seed, never committed (the patch is in
the session scratchpad); the pristine seed was restored and checked with `cmp`. It covered 19,779
files: all of `tests/cases` outside `modules/`, plus `distilled/cells` and `distilled/named`.

| site | check-phase bumps | emit-phase bumps | programs with an emit bump |
|---|---:|---:|---:|
| `check_core_state.vl` (the per-program reset) | 17,093 | 0 | 0 |
| `check_fn_decl.vl` (solved parameter) | 76 | 0 | 0 |
| `check_inferred_return.vl`, `inferRetPublish` (inferred return patched in place) | 27,758 | **73** | **23** |
| `check_relate_core.vl`, `applyGenAliasTys` (alias placeholder filled in place) | 1,054 | **189** | **139** |
| `check_relate_core.vl` (null hole filled) | 58 | 0 | 0 |
| `check_relate_core.vl`, three others | 31,067 | 0 | 0 |
| `check_side_rows.vl` (return-inference reset) | not reached | — | — |
| `check_type_shape.vl` (hole shape gained a field) | 2,802 | 0 | 0 |
| `check_types.vl`, `tyPinElem` | 18,043 | **100** | **32** |
| `check_types.vl`, `tyPinKey` / `tyPinVal` | 18,940 | 0 | 0 |

**Three writers move the epoch during emit, in 194 of the 19,779 programs.** All three are mono's
instance re-checks running inside `emitProgram`:
- `applyGenAliasTys`: 189 bumps in 139 programs. This is lane M3's P6 (#8339, a generic-alias
  instance minted once), which removes it.
- `tyPinElem`: 100 bumps in 32 programs. A list element pinned while an instance is re-checked.
- `inferRetPublish`: 73 bumps in 23 programs. An instance's inferred return patched into its
  function row.

## What the deletion waits for

After P6, two writers are left, in at most 55 programs. Both are real type changes made while emit
already runs. Removing them means finishing an instance's re-check, pins and published return,
before any emit memo reads a row. That is a per-instance seal: mono re-checks every instance first,
and only then emits. Once the census reads 0 emit-phase bumps, the emitter's `tyMutEpoch` reads
(`emit_rep`, `emit_classify`, `emit_union_tykey_text`, `emit_shape_rows`, `emit_nullable_rets`)
delete in one change, and the `emit_ty_seal` id memo keeps the only stamp.

To re-run the census, apply the scratchpad patch to a scratch worktree, build a seed, run every file
under `VL_ID_SHADOW=1` and sum the `bump <site> check <n> emit <n>` rows. Then restore the pristine
seed and confirm it with `cmp`.
