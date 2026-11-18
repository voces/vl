# IR S1b: the start body claimed, 2026-11-18

Lane IR2, stage 1 step S1b of `2026-11-18-ir-s1-start-design.md`, after S1a (#9035) and the
start-order matrix (#9044). The single start body (`k` -1) inside the IR's set now ships from
the IR. No emitted byte moves.

## What landed

- **The start's top-level rows are proved first.** A start banks one `vl-src` row of kind 1 per
  top-level item that wrote bytes, and a statement nested in a top-level block banks kind 1 too
  (`bankBodyStmtSpan` at module scope). S1a compared kinds 5 and 6 only. Span notes now carry
  their kind (`irSpanNoteKind`): `buildStart` notes kind 1 over each item, `irSpanNote` gives a
  statement kind 1 in the start and 5 elsewhere, and `irDualEmit` compares kinds 1, 5 and 6.
- **One merge order.** `startMergeOrder()` merges statements and initializers on source position;
  legacy's merge loop walks it, and `startIrOrder` gives the IR its view (dropping a global whose
  initializer runs elsewhere).
- **The claim seam.** `irClaimStart`, family `start` in `CLAIMED`, runs in `emitStartBodyCode`
  after the frame is laid out (`fbBeginFunc`) and before legacy writes the pool fill. It builds
  as the shadow does, checks `claimable()`, verifies, and lowers through `irLowerClaim` with
  `fnPos` -1, banking the rows at the start's own position. A fallback is counted as `claim fell
  back: <why>`; a claim as `claimed start`, apart from the functions' `claimed`. The scope and
  loop resets are one helper (`startFrameReset`) run before the claim and again before legacy.
- **Named misses kept from S1a:** string accumulator, progress cell, every initializer arm but
  `plain`, init-function windows (S1c). **One added:** `hoisted receiver read`, a start `while`
  whose receiver legacy hoists has no read the lowering can repeat (`loopHoistCands` asked as the
  lowering asks it). It covers a master gap from #9039 (a field of a global record as a hoisted
  receiver), which STORE fixes on `ir-hoist-global-field`; it is the start's only, so functions
  keep master's behaviour until that lands, and then the miss can go.

## Readings (master `53ff806b` against this branch, fixpoint seeds both)

- Start-order matrix (`tests/cases/start-order/`): every row claimed and matched, or a named miss
  (the two guarded rows: progress cell; the accumulator; the multi-module files run through init
  functions, S1c). Corpus oracle 9 passed with the start claimed.
- `ir-identity.sh --cases`: `identical 7465, fail under both 69, differ 0`.
- Identity, distilled cells and self-compile: 0 differ plain and `--names`; self-compile identical.
- Armed shadow over `tests/cases`, the probes and the corpus: 0 mismatch, 0 fail; 4,196 start
  bodies covered = matched of 15,150; functions 66,331 covered = matched.
- Mode 3: self byte-identical; corpus `claimed start` 2,674; corpus mode-3 identity `differ 0`.
- `--claims` 30,510, `ir-shadow: ok`.
- L2 fuel 97,380,760,205 against master's 97,350,003,955 on the same box (+0.03%).
- Pin helpers 904; phase-state census flat; lint clean; IR tests 27 passed.
