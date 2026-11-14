# D16201: a `const` record's fresh map field takes its slot fact from its writes, and its literal that fact's row, 2026-11-14

Lane G, stacked on #8028 (D16162).

`const o = { m: Map() }; o.m["k"] = { f: inc0 }`, with `inc0` un-annotated and uncalled. The
refusal sentence, `map values must be i32 / boolean`, over-states the scope. One program per value
kind shows that only an uncalled hole function fails: bare (`unsupported map value type`), in a
record or in a list (`map values must be i32 / boolean`). A called one, an annotated one and every
plain kind run. A `const m` binding runs all three.

## Mechanism

1. The elaboration gave the record no slot fact. `elabHeldClosedTyAt`'s map arm declined any field
   holding an initial value, a fresh `Map()` included. A map binding gets its fact through
   `elabSlotClose`'s map arm, over its writes.
2. The struct row was minted in the collect pass, before mono, from the checker's open literal
   type. The closed type mono later pinned found that row by layout (`annShapeLayoutRowOf` in
   `internInlineShape`), since an open and a closed function field share a field code. It
   aliased onto the row, which kept its open recorded type, so `sFieldMapShape` answered
   unsupported (`-3`).

## Change

- **`emit_elab`**: a fresh `Map()` at a record field closes over the writes into that field of the
  holder (`elabAllFreshMaps`, `elabFreshMapSlotTy`). `elabLitBindingFact` gives a `const`
  binding's initializer literal, or a record nested in it, its slot fact. It applies where the
  literal's own type is open and the record holds a map; a tagged function set is left out.
- **`emit_collect`**: `anonMintLiteral` interns that fact's row before minting, so the open literal
  finds the closed row rather than minting the row a closed type would later alias to. The
  elaboration has run by then: `elabPrepareRun` runs before the emit passes.
- `emit_mono` is unchanged. A first attempt also wrote the record's annotation from the fact, and
  is not needed.

## Grading

Fixpoint seeds on both sides, `--before` #8028's head.

- The witness prints `1`, and so do the bare, list, `set`, nested-field and function-local spellings.
- New `record-field-map-of-hole-fn-uncalled.matrix.vl` goes from 27 to 49 of 62 run, 0
  runs→not-runs, 0 silent. Every `const_*` cell runs, and the annotated face runs throughout. The 13
  that do not run are the un-annotated record delivered through a call, a list, a global or a
  capture before its map is written: D16203.
- `map-value-nested-record-of-hole-fn-uncalled`: `map_in_record_field` runs, 60 to 62 of 64.
- 0 runs→not-runs and 0 new silent on 23 more record, map and record-of-function-list templates.
  `pinned-map-of-hole-fn-one-signature`'s SILENT cell is D16124, as before.
- A first version took every closed record literal at its fact. It lost 3 running cells, records
  with a list-of-functions field (`d15204_run_record_field`, `_set`, `d15220_cell_bound_record`).
  The fact path is now limited to records that hold a map.
- `rep-fuzz-check.sh`: exact, 0 new, 0 stale.
- `scripts/dup-struct-rows.vl` reports 0 duplicate rows before and after on the 19 spellings. It
  cannot see this class, because a refused program never reaches the end of emit. The fix raises the
  programs reaching it from 12 to 17.
- An assert in `internInlineShape`'s layout-reuse branch (a closed type reusing a row recorded at
  an open one) fires on all three spellings on the base tree. After the fix it still fires on 4
  running corpus cells, so it is filed as D16204, not added.
