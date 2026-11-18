# IR S1a: the start body under the shadow, 2026-11-18

Lane IR2, stage 1 step S1a of `2026-11-18-ir-s1-start-design.md`. Shadow only: nothing is
claimed, and no emitted byte moves.

## What landed

- **The seam.** `emitStartBodyCode` collects the merged order of top-level statements and the
  globals whose initializer runs in start, then (armed, start entry only) hands it to
  `irShadowStart`. A global whose initializer runs elsewhere (a constexpr cell) is not in the
  order: it writes nothing there.
- **The build.** `buildStart` makes one IR function (`@start`, `fnIx` -1, void). A statement is
  built as any statement. An initializer is built by `globalInit`: the value delivered at the
  cell's rep, then `SGlobalSet`.
- **The lowering.** The start entry opens with legacy's pool fill (`irStartPrologueHook`,
  `emitStrFillCalls`) and takes legacy's frame. Its last call is no tail call. Its element-read
  rows are rebased with legacy's own (`rebaseStmtSpans`).
- **Shared decisions, both consumed by legacy:**
  - `startInitArmOf(gst, gck)`: how an initializer is written (holder, widen, mapBox, unionBox,
    variant, alias, nulnone, atom, plain). `emitStartGlobalInit` dispatches on it; the IR takes
    `plain` only, without the arm unbox (`globalInitArmUnboxes`).
  - `promoSlotIn(gi, ctx)`: a promoted global's start local. `emitUserGlobalGet`/`Set` read it;
    the IR reads and writes a promoted global as that local in start, and misses elsewhere.
- **Rows.** The start counts under `start fns`, `start uncovered <why>`, `start covered`,
  `start verified`, `start matched`, so the per-function figures keep their population. A
  mismatch is `mismatch start <why>`; a verifier failure names `@start`.

## Named misses kept

- `string accumulator`: a start owing `strAccScanStart`'s accumulator (a claim hazard). Pinned
  by a shadow test.
- `progress cell`: a program with a guarded global. Deferred from S1a: the guard decision in
  start reads the ambient `gInitStartOrd`, so `SInitProgress` needs the start position carried
  in `GlobalCtx` first. 29 starts on the population below.
- `global initializer <arm>` for every arm but `plain`, and `global initializer rep` for a cell
  with no scalar rep.
- An init-function window (`k >= 0`) is not shadowed yet (S1c).

## Readings (master `dc61ab56` against this branch, fixpoint seeds both)

- Armed shadow over `tests/cases`, `scripts/capability-probes` and the distilled corpus: 15,130
  start bodies, 4,187 covered, verified and matched; 0 mismatch, 0 fail. Function rows: 66,238
  covered, verified and matched.
- Corpus alone: 2,674 starts covered and matched.
- First start misses: call target 3,210 (generic instance calls, as in functions), global
  initializer rep 2,100, expression object 743, global initializer widen 604, unionBox 558.
- Identity (distilled cells and self-compile, plain and `--names`): 0 differ. `--cases`: 7,443
  identical, 69 fail under both, 0 differ. Mode 3 self byte-identical; `--claims` 30,486, 0 fell
  back.
- L2 fuel: 97,018,749,326 against master's 96,960,181,336 on the same box (+0.06%).
- Pin helpers 904. Phase-state census flat.
- The driver census keeps master's door tags (#9018), whose `@start` door is the stage-1
  measure; S1a claims nothing, so no door moves yet.
