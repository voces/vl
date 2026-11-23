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
4. Next: the six D1 cells that read the value from a local, a capture or a map. Each read moves
   the value from its storage rep (a minted `J$m…` on row 0) to a heapless `{f: null}` rep.

Quick A/B (mode 1, tests/cases plus the named cells) against N6's 194193920, after step 3:
covered, verified and matched 118,179 → 118,180; start covered, verified and matched
14,932 → 14,935; no losses, mismatch/fail 0. d15214_plain_inner's start is covered.
