# Type hash-cons stage 4f, step 3a: the emit epoch's invariant is enforced (lane H), 2026-11-15

Stacked on #8400 (steps 1 and 2, `2026-11-15-type-hashcons-s4f-emit-epoch.md`).

**The window.** Emit-side code first runs in `elabPrepare`, through `repVariantShapesPrime` and the
rep queries in `elabPrepareRun`, and last in `emitProgram`. A census over 15,323 programs that
reach emit, with the window opened at `elabPrepare` and closed after `emitProgramRun`, found **0
visible `tyEmitEpoch` bumps** and 1,411 fresh ones. It ran on a scratch seed, never committed.

**The guard.** The per-program reset (`emitProgramReset`) records `tyEmitEpoch` in `emitEpochAt`
(`emit_sections.vl`). `elabPrepare` runs that reset, and so does `emitProgram` when it runs the
elaboration itself. Since `tyEmitEpoch` moves only on a visible
write, an emit that ends with it elsewhere calls `emitFail` ("an emit-phase write changed a type an
emit memo may hold") and returns -1. The read goes through `sealEpoch` in `emit_ty_seal.vl`, which
already imports the epoch. The guard adds no counter and no checker state.

**Phase-state census.** At master's baseline. `emitEpochAt` is written and read only in the emit
phase, and `emit_sections.vl` imports no new checker symbol. An earlier draft kept a window flag and
counter in `check_types.vl`, which `tyMutBump` wrote and `emit_sections.vl` opened and closed. That
draft raised cross by 1 and surface by 2; this version adds neither.

**What is not done, and why (the coordinator's call).** The emitter's 31 `tyEmitEpoch` reads stay.
Each also gives its memo per-program invalidation, and some memos may be filled during checking,
before the window, while rows still move visibly. Deleting one safely takes a reset at the window
start plus proof that the memo is never read earlier. That is about zero net lines per memo. Lane
E's Rep ADT stage 3½/4 re-keys most of those memos on `tyRepId`, and deletes each one's epoch read
in the same change.

## Measurements

| reading | value |
|---|---|
| control | the guard fires: a scratch seed whose `inferRetPublish` passes no row makes its write visible, and `closures/alias-of-fn-param-litunion-arg.vl` then fails with the internal error |
| seed | fixpoint |
| identity | 19,865 of 19,865 files byte-identical against #8400's merged fixpoint (all of `tests/cases` outside `modules/`, `distilled/cells`, `distilled/named` and `compiler/entry.vl`) |
| seed size | 6,377,230 → 6,377,376 bytes (+146), after master 55151b05 is merged into both |
| phase-state census | `--check` ok, baseline unchanged from master |
| net compiler lines, this PR | +13 (`emit_sections.vl` +10: the recorded epoch and the `emitFail`; `emit_ty_seal.vl` +3: `sealEpoch`) |
| net compiler lines, #8400 + this | **+85** (+72 and +13): it enforces an invariant and deletes nothing. The estimate had been +82 |
