# 2026-11-14 — a re-test after a writing call, and a test after one (D2408, D2449, D2464, D3251)

Four clause-2 refusals of the D2390 narrowing-ended-by-call rule, closed together:

- The place an `is` test tests reads its storage (`crIsTestedPlace`): the bare-name pending
  refusal (`checkIdentNode`), the path settle rule (`pathReadsDeclared`) and the nested-function
  read census (`crNoteCaptureRead`'s callers in `check_access.vl`) all skip it. `emitIs` lowers
  against the storage since D2447, so the test sees the call's write.
- A pending row records the scope depth its call ran at (`crPendFrames`). A read of the name
  through a row on a frame opened after the call is let through (`narNewerThan`), since the
  call's retire re-typed every row it could see.
- A short circuit filters its left side's facts against its right side's calls only
  (`crFilterCond` at `&&`/`||`), rather than every fact against the whole condition.

Graded: `scripts/capability-probes/matrix/retest-after-writing-call.matrix.vl`, 15 cells × 2
faces, all `check refuses` before and RUNS after. Distilled corpus: 0 runs → not-runs, 0
→ silent; its 6 other movements (d16363) are the same on the master seed. Capability probes:
238 of 240 run, unchanged. Seed +924 bytes. Filed D16297, the direct-write twin of D2464.
