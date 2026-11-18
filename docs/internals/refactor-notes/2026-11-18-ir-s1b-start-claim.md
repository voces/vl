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
  `plain`, init-function windows (S1c). A start loop over a global record's list field (a hoisted
  receiver read off a global) matches and is claimed now that STORE's #9049 records the read.

## Readings (master `8365bb0b` against this branch, fixpoint seeds both)

- Start-order matrix (`tests/cases/start-order/`): every row claimed and matched, or a named miss
  (the two guarded rows: progress cell; the accumulator; the multi-module files run through init
  functions, S1c). Corpus oracle 9 passed with the start claimed.
- `ir-identity.sh --cases` (the matrix included): `identical 7467, fail under both 69, differ 0`.
- Identity, distilled cells and self-compile: `identical 9032, fail under both 3267, differ 0`,
  plain and `--names`; self-compile identical.
- Armed shadow over `tests/cases`, the probes and the corpus: 0 mismatch, 0 fail; 4,199 start
  bodies covered = matched of 15,154; functions 66,333 covered = matched.
- Mode 3: self byte-identical; corpus `claimed start` 2,676; corpus mode-3 identity `differ 0`.
- `--claims` 30,511, `ir-shadow: ok`, no claim fell back.
- L2 fuel 97,453,587,124 against master's 97,430,856,743 on the same box (+0.02%).
- Pin helpers 904; phase-state census flat; ladder sets ok; lint clean; IR tests 27 passed.
- Net lines in `compiler/`: +162 -54, net +108.
