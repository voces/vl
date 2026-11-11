# w315's emit-reject groups A and C, ablated; D15740 closes, 2026-11-11

The four cells w315 grouped as function-value identity, each ablated to a minimal witness on
master and graded against its plainest neighbour. All four are mechanism refusals (a
neighbouring spelling runs), so each is owed a fix. They are four mechanisms, filed as rows:

| row | cell | witness | neighbour that runs |
| --- | --- | --- | --- |
| D15740 (closed here) | `bundle_copy_closure_returned` | a bundle in a module `const` returned from a function | `const w = c` at module scope |
| D15744 | the same cell | the returning function a lambda, or a returned `const` copy of the holder | D15740's spelling |
| D15741 | `bundle_copy_closure_handed` | a `const` copy of the bundle handed to a hole parameter | `take(c)` (emit_mono.vl, w317's file) |
| D15742 | `d15270_two_level` | a function field written into a two-level maker's record, called at two types | one maker level |
| D15743 | `d15270_generic_mk` | a function field written into a generic maker's record | the same maker without a type parameter |

## D15740

`lap` returns its parameter called at two signatures, so its call's value is a bundle record
that a holder keeps whole. A returned holder was kept only where every return sat in the
function declaring it, and the keep was noted only for a returned call:

- `elabHolderCanHoldReturned` (emit_elab.vl): a module-scope `const` is one record whichever
  function returns it.
- `elabRetKeptCall`: a returned holder's initialiser call is kept whole as a returned call is, in
  `elabPlainCallsNote` and `elabRetRecordKeepsNote`.
- `elabGlobalReturnerWhole`: the returner must be one that may return a record
  (`elabRetRecordShape`), and no call of it may take one member, by a holder called at one
  signature or a destination naming one member's type. Emit lowers such a returner at that member
  while the returned `const` is the whole record. On master that built invalid wasm; it is now
  refused and filed as D15748.

**Position matrix** (`scripts/capability-probes/matrix/bundle-copy-handed.matrix.vl`, new): master
`0a9e9948` runs 2 of 48 graded with 3 SILENT (`return_inferred`/annotated, `return_annotated` in
both faces); this PR runs 2 with 0 SILENT, 0 runs → not-runs. The 3 SILENT cells are D15748, now
loud.

**Sweep** (`scripts/sweep.vl`, base master `abase` against the fixpoint candidate, 23,915
programs): 23,914 same, 0 bytes-only, 1 output mover (D15740, emit reject → runs), 0 runs →
not-runs, 0 new traps.

**Proof run locally.** The fixture, the corpus oracle (`cases_wasm_0..3`, 7,442),
`check-filed-witnesses --strict` (as filed with D15740 closed), distilled `regress.vl`,
lint-self, seed size +0.5%, late demands 6, the inventory tests.
