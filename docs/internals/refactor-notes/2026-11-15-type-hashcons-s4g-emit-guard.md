# Type hash-cons stage 4f, step 3a: the emit epoch's invariant is enforced (lane H), 2026-11-15

Stacked on #8400 (steps 1 and 2, `2026-11-15-type-hashcons-s4f-emit-epoch.md`).

**The window.** Emit-side code first runs in `elabPrepare`, through `repVariantShapesPrime` and the
rep queries in `elabPrepareRun`, and last in `emitProgram`. A census over 15,323 programs that
reach emit, with the window opened at `elabPrepare` and closed after `emitProgramRun`, found **0
visible `tyEmitEpoch` bumps** and 1,411 fresh ones. It ran on a scratch seed, never committed.

**The guard.** `elabPrepare` and `emitProgram` open `tyEmitWindow`. `tyMutBump` counts a visible bump
while the window is open. When `emitProgram` ends the window with a nonzero count, it calls
`emitFail` ("an emit-phase write changed a type an emit memo may already hold") and returns -1.
`holeReset` closes the window and clears the count at the arena's reset, before that reset's own
bump, so a check-only compile that ran `elabPrepare` cannot leave it open.

**Phase-state census.** The window is state that crosses the check→emit boundary by design:
`elabPrepare` and `emitProgram` open it, and `tyMutBump` (check) counts into it. It lives in
`check_types.vl` behind `tyEmitWindowOpen` and `tyEmitWindowClose`, so the census counts one
cross-phase table (`tyEmitWindow`) where two exported globals would have counted two. `surface`
in `emit_sections.vl` rises by the two functions' imports.

**What is not done, and why (the coordinator's call).** The emitter's 31 `tyEmitEpoch` reads stay.
Each also gives its memo per-program invalidation, and some memos may be filled during checking,
before the window, while rows still move visibly. Deleting one safely takes a reset at the window
start plus proof that the memo is never read earlier. That is about zero net lines per memo. Lane
E's Rep ADT stage 3½/4 re-keys most of those memos on `tyRepId`, and deletes each one's epoch read
in the same change.

## Measurements

| reading | value |
|---|---|
| net compiler lines, this PR | see the PR |
| net compiler lines, #8400 + this | see the PR |
| identity | see the PR |
