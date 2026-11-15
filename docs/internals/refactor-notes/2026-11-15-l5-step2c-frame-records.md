# L5 step 2c: two emitter frames as records (2026-11-15)

Part of L5 step 2 (`2026-11-14-phase-products-design.md` §3). This slice comes from the triage of
the emitter's hidden-argument rows: 112 rows of `phase-state-census.vl -- --list` in `wasmEmit.vl`,
`emit_elab.vl`, `emit_mono.vl`, `emit_state.vl` and `emit_rewrite.vl`.

## The triage

Each row is graded by how many functions read the global and whether every reader is a direct
callee of the function that sets it.

| readers | rows |
|---|---:|
| none outside the setter | 9 |
| 1–2 | 50 |
| 3–5 | 33 |
| 6 or more | 20 |

Only 7 rows have every reader as a direct callee. Most rows are seats that `emitExpr` or
`coerceKindAt` reads: `lma*`, `boxSeat`, `numSeat`, `armSeat`, `atomSeat`, `rawReadNode` and
`idxSpanNode`. A parameter would have to thread through the recursive dispatcher, and a context
field is line-for-line (`const s = ctx.g; ctx.g = x; …; ctx.g = s`). These are the coercion seats
that L1's I3 deletes (`ir-design-2026-11.md` §5.3).

Two clusters save and restore several globals as a unit, so a record shortens them:

- **`RcElem` (`wasmEmit.vl`).** The element-by-element record copy's source and destination types,
  source locals, row, boxedness and struct path. That is nine globals. `emitRecListCopyTop` opens
  a fresh record and restores the old one, which replaces 24 lines of save, set and restore.
- **`ShrFrame` (`emit_rewrite.vl`).** The shadow respelling's per-frame names: `lamNames`,
  `lamAny`, `lamParams`, `lamFree`, `seen` and `shared`, six globals. `shrWalkFrame` opens one
  per frame and restores the old one, which replaces 18 lines. The program reset also no longer
  clears `seen`/`shared` a second time, because the fresh frame already did.

Every read of the map fields is a `?? default` read, so the sentinel-index lint is not raised
(step 4b had to keep its in-band map reads as module tables).

## Gate

GATE_PLACEHOLDER

## Lines

The compiler is **+129 / −134, net −5** over 2 modules, after `vl fmt`. Most of what the brackets
save goes to the record type and its constructor, which `vl fmt` lays out one field per line. The
census reads 15 hidden globals as 2 record globals (`wasmEmit.vl` 29 → 21, `emit_rewrite.vl`
9 → 4). Each frame stays one hidden argument, now a single value rather than nine or six parallel
ones.
