# IR-M1: record stored on another type's row — heap identity (family, 2026-11-23, lane IR-M1)

A named family, parked for one design pass (coordinator ruling 2026-11-23). Lane IR-M1 builds it
after D17070, the literal-set relay and D17075, with N6 reviewing the rowless-block and
verifier-arm parts.

## The root

The IR names a record's struct heap only through `structIndexOfTy` (`recordHeapOfTy`,
`recHeapOf`). Legacy can store a record type on another type's row. It does so by canonical key,
for a type with no row of its own, and for a global whose cell it declares on a wider row's heap
(`globalCellStructIdx`). Such a type has no heap in the IR's notes, or the wrong one, so values
and places on one wasm struct look foreign.

## The cells

Measured on master ff34a69e / 9c7453e6:

- **8 `start: global initializer coercion` cells** (N8's #9728 note, N7's breakdown). All miss
  at `globalInitValue`'s final check, with no legacy coercion (`coerceKindAt` = `none`):
  - 6 reflist cells: `Circle[]` into `{r: null}[]`, `{x: f64}[]` into `{x: i32}[]`, `J[]` into
    `{f: null}[]`, `{f: i32}[][]` into `J[][]`;
  - 2 struct cells: held-literal-read-through-record-union-field-runs and
    record-copied-into-union-member-sharing-field-names-runs.
  - Two more reflist rows (`hole-fn-list-of-two-results-*`) are closure-element lists at an open
    type; they are checked against N5's class first.
- **d15214_plain_inner** (corpus):
  - `mk`'s result type has no row and canonicalises onto K's. The literal is built at that row's
    recorded type (with `j` nullable), against a result whose `j` is non-null.
  - `const _k: K = mk()` then holds a rowless value whose heap the IR does not know.

- **D17083 (#9757, from N8): 5 corpus cells**, `d15221_opt_dbl`, `_opt_half`, `_optb_dbl`,
  `_optb_half` and `d15293_bound_returned`. All miss `return coercion`.
  - Witness: `function mk() { return { r: { f: inc0 }, s: { f: dbl } } }`. Legacy builds `$2` =
    `{ ref null $7, ref null $4 }`, where `$7` is `{ ref $5 }` (the closure struct) and `$4` is
    `{ i32 }` (a function tag).
  - So two sibling inner records of one VL type `{f: (i32) => i32}` sit on different heaps, under
    one open result type.
  - d15293 is the same pattern inside a list.
  - The miss needs a returned literal with two siblings holding different hole functions. Bound to a
    `const` first, as a module global, or with either sibling alone, it is covered and matched.
  - Routes D1 tried, all failed:
    - `cloHoleRetag` needs one noted heap for both sides, but the value has none.
    - `objLitTwinTyAtRow` with `irTyHeldOpen` leaves the inner literals at `open temp type`.
    - The same-heap retag is refused by rule 2 (`hole-fn-param-into-returned-record`, `mk2`/`mk5`).
  - Relaxing the verifier was refused. The heap must ride on the rep as an IR note that tells the
    two sibling records apart.

## The direction (pre-ruled)

- `recHeapOf` takes legacy's storage row: `structRowOfRecordTy`, plus `globalCellStructIdx` for a
  global's cell, carried as an IR note.
- The verifier admits exactly one widening retag: a non-null field to a nullable field on the same
  heap.
- Ship as one PR with the full A/B. Runs → not-runs must stay at 0, including the cells the
  attempts below lost.

## Attempts, measured and reverted (kept on this branch)

1. **Hold a global at its cell row's record** (`globalCellRowTy`, only where the cell's heap is not
   the type's own). Its reads follow (`globalStoredTy` in `stored` and in `globalNoteAt`), and a
   stored row's plain union-box kid is admitted on the `own` field read.
   - The 4 witnesses are covered, and start covered is +1 net.
   - It loses modules/overload-generic-fresh-binding-runs: the global held at the wider row is
     passed to a generic instance's parameter at its own type. The delivery side must cover it.
   - A first cut without the heap test lost 20 starts.
2. **Accept `d = o` when both cells share one heap.** `d` is then noted at `o`'s own rep, and its
   reads (typed at `d`'s record) miss `global read coercion`. The retag across the IR's two heap
   notes is refused.
3. **d15214, a returned literal built at the result type** when `structRowOfRecordTy(result)` is
   the literal's row: +3, −4, and 1 rule-2 FAIL (hole-fn-in-nested-maker-record-read-inline, `mk5`).
   Widening `objLit`'s `ct` branch to `structRowOfRecordTy` instead loses `reorderFields`
   (object-shape-unannotated-literal-rebuilt), a rowless local held at its row type.
4. **A tree-wide nullable kid where the row stores a nested record nullable**: −25 body, −24 start.
   Legacy stores every code-15 field nullable (`fieldStoreTyOf`), so this is not the predicate.

## The PR (branch `ir-m1-heapid`, on N6's `recordRowFn` slot)

1. `recHeapOf` falls back to the heap of the row legacy stores a type with no row of its own at
   (`recordRowFn`, installed as `structRowOfRecordTy`).
2. One widening retag (coordinator ruling 2026-11-23), in the builder's `recRowRetag` and the
   verifier's retag arm (`recFieldsWiden`): a plain record on one noted heap stands at another
   whose field is nullable over its own field's rep, or where its own field is `null`.
   - Aliasing probe: the checker refuses a widened write through the wider alias in both arms
     ("… writes a widened field. A record is shared, not copied …"), so no pin is owed.
3. A global read notes its struct cell's heap (`globalCellStructIdx`) at a record rep with none
   (`noteCellHeap`), only where the read's fields lower alike with, or widen to, the cell row's
   own; a second, different answer leaves the rep with no heap (`irRecHeapNoteOne`), and
   `recRowRetag` reads the noted heaps.
   - D1's 7 cells: their value's `{f: null}` type has no row under any legacy lookup
     (`structRowOfRecordTy`, the canonical key and `recNarrowRecordOf` all give -1, by D14890).
     `closure_capture_unann` reads a global and is now clean.
   - Without the row-match guard, overload-pick-reads-only-delivery's global (stored on a row
     that boxes `x`, read with `x` plain) gave a rule-2 FAIL in `@init`.
4. The heap answer is recorded (N6's review): `recHeapOf` asks `askRecordHeap`, whose slot
   `recordHeapFn` (installed by `emitProgram` as the type's own heap, else its storage row's) is
   re-asked from `rowFieldAsksHold`. Only a heap it names is recorded: -1 admits no retag, so a
   later heap where none stood is no change. Control: a seed whose heap hold always disagrees
   fails `vl run` of the d15214 witness with "internal: a record's field storage changed after
   its rep was built (rowFieldStorage)"; the head prints `4`.

Trusts and order:
- The verifier trusts the builder's heap notes (`irRecHeap`): `recFieldsWiden` and the cell
  note are not re-derived from a struct cell, as `recSubRetag`'s notes are not.
- `noteCellHeap` notes a cell's heap only where `recHeapOf(rep)` is -1, and -1 is not recorded:
  a type that later gets a heap of its own, different from the cell's, leaves that note stale and
  nothing re-asks it (N6's review). Batch 2 records the -1 where it gates a cell note.
- A cell note met after a retag that rested on the first answer leaves the rep at -2, and the
  verifier refuses that retag (loud, an `ir claims` fallback). No function in tests/cases or the
  named cells shows a rule-2 retag fail (quick A/B after step 3).

5. Next (batch 2): the six D1 cells that read the value from a local, a capture or a map. Each read moves
   the value from its storage rep (a minted `J$m…` on row 0) to a heapless `{f: null}` rep.

Quick A/B (mode 1, tests/cases plus the named cells) against N6's 194193920, after step 3:
covered, verified and matched 118,179 → 118,180; start covered, verified and matched
14,932 → 14,935; no losses, mismatch/fail 0. d15214_plain_inner's start is covered.

## Readings (batch 1, base master 49a2a3c20, head 2311cd26f, fixpoint seeds)

- Quick A/B (mode 1, tests/cases plus the 10,827 named cells): covered, verified and matched
  118,263 → 118,264; start covered, verified and matched 14,952 → 14,953; no losses, no
  mismatch or verifier fail. On tests/cases alone the A/B and the ir-only census (6,017 of
  7,173) are unchanged: master already carries the starts the slot's own PR (#9788) closed.
- `ir-identity.sh --cases`: identical 7,753, differ 0; `--claimless`: identical 14,055, differ
  0; `--names`: differ 0; self-compile identical. Mode 6 prepost differs: corpus 0 of 82,251,
  cases 1 of 66,756 (not own refusal 0).
- rep-fuzz exact; L2 self-compile fuel +0.06% on 124,231,434,992; fuel pair +0.03%
  (124,232,156,004 → 124,268,594,079), after the cell-heap memo (the unmemoised note cost
  +0.70%); `self ir misses` 0; deep nesting 8 passed, 0 failed.

## Batch 2a (D17087): the global storage row and a stored row's union box

1. `globalRep` holds a record global whose checked rep has no struct heap at its storage row's rep
   (`cellAtStorageRow`, N8's cut), memoised per (global, rep, type) for the program; it is right
   only with #9772's delivery at legacy's declared row (without it, the D17087 witness's start
   went matched → `argument coercion`).
2. ir_build_ref's stored-row field read admits a union box the row stores under a read that keeps
   the field plain: legacy's field get and unbox tail.

Readings (base master 89ce9eefe, head 5b6b71edc, fixpoint seeds):
- A/B (mode 1, tests/cases): start covered and matched 6,906 → 6,913, mismatch/fail 0 → 0; quick
  A/B with the named cells: start 14,972 → 14,979, no losses; one moved miss (generics/
  inferred-return-identity-literal-also-read-at-own-type: `global initializer variant coercion` →
  `field read of a stored row`). ir-only census 6,039 → 6,045 of 7,175.
- Identity `--cases` 7,755, `--claimless` 14,453, `--names` 9,433: differ 0; self-compile
  identical; mode 6 corpus differs 0 of 86,291, cases 1 (a pre-existing own refusal).
- rep-fuzz exact; L2 +0.02%; fuel pair +0.01% (the unmemoised hold cost +0.37%); `self ir misses`
  0; deep nesting 8 passed.
- Q58 position sweep of `i.x` off the held global (11 positions: scalar, union and nested call
  argument, concat, interpolation, return, const and let initializer, if arm, `??` operand,
  record-literal field): all `start matched`; `ir-identity --claimless` identical 11, differ 0.
- Neighbours: top-level `let` and closure read covered and matched (`1 10` under both seeds); an
  annotated binding of the literal's type is refused by the checker (only a fresh record widens).
- Per class (quick A/B, tests/cases plus the named cells, start rows): `argument coercion`
  13 → 10, `array element coercion` 8 → 7, `global initializer coercion` 8 → 6, `global
  initializer variant coercion` 2 → 1, `field read of a stored row's box` 5 → 4, `field read of a
  stored row` 0 → 1 (the one moved miss above); starts covered and matched 14,972 → 14,979.
- Per mechanism: the storage-row hold (1) alone moves a start out of its coercion class into the
  stored-row field read, where (2) is what lets it build. Measured on the D17087 witness: (1) alone
  takes it from `argument coercion` to `field read of a stored row's box`; (1) and (2) take it to
  matched. (2) alone was not measured: an existing storage-row holder (D14426) may reach it too, so
  the per-class rows above are the pair's reading, not (1)'s or (2)'s alone.
- Correction (V5's verify of #9818): the named cells alone read 8,462 → 8,462, unchanged; the
  quick A/B's 14,972 → 14,979 is tests/cases and the named cells together, so the +7 is all
  tests/cases. V5 attributes it 6 to the storage-row hold and 1 to the stored-row box unbox.

## Batch 2b part 1: a capture's environment row heap

`captureRead` notes the heap of the struct row legacy stores the capture at
(`captureValStructIdx`, where `captureValKind` is a struct) for a heapless record read rep
(`noteCapHeap`), through the cell note's row-match guard, now shared as `rowHeapFor`; one answer
per rep, memoised per program.

Readings (base batch 2a 3977fec35 = master 1db11290 in compiler, head 7736511f3, fixpoint seeds):
- Named cells alone: covered, verified and matched 41,563 → 41,567; `declaration coercion` 4 → 0
  (d16132_{block_bare,block_if,block_while,fn_body}_capture_unann). tests/cases unchanged: A/B
  covered 76,728 → 76,728, start 6,913 → 6,913, mismatch/fail 0; census 6,045 of 7,175 on both.
  The three block cells keep `start uncovered closure env capture` (N7's class), as on base.
- The `rowHeapFor` fold is byte-neutral for the existing paths: 17 programs (batch 1's cells,
  D17047's witness, the D17087 witness, batch 2a's Q58 sweep, overload-pick-reads-only-delivery)
  build byte-identical under the 2a and 2b seeds.
- Identity `--cases` 7,755, `--claimless` 14,453, `--names` 9,433: differ 0; self-compile
  identical; mode 6 corpus differs 0 of 86,287, cases 1 (the pre-existing own refusal).
- rep-fuzz exact; fuel pair 124,988,908,629 → 124,988,908,629 (the note never fires in the
  self-compile); `self ir misses` 0; deep nesting 8 passed.
- Witnesses, one per frame shape (block, if, while, fn body), read `v.f` and print 5, 6, 7, 8
  under both seeds; a `let` reassigned before the closure runs prints 9 and matches.
- Q58: 11 positions of the capture inside the closure. Output and `ir-identity --claimless`
  identical 11, differ 0. The `const` initializer (the claim) and a union argument match; nine
  positions are uncovered under both seeds in classes this note does not touch (`argument
  coercion`, `string operand after another`, `return coercion`, `assignment coercion`, `ref if
  arm rep`, `coalesce nulRef default rep`, `object field coercion`).
