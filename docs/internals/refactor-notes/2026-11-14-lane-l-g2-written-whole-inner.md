# Whole literals written into a held container, built at its row — 2026-11-14

Lane L, group G2 of lane B's census of the un-annotated-function-in-a-container family:
D15357, D15392. D15350 built an initialiser's inner literals at the holder's element row
(`fnTagHeldInner`); a whole literal written in later kept its own. Built on G1 (#8043), whose
`cwSoleReadInit` the D15392 half reuses.

## What moved

- **A list literal pushed whole (D15357).** fn-tag's `ftSlotOp` takes a `push` onto a held list
  of record lists whose argument is a list literal of record literals (`ftWholeRecListLit`), and
  `ftRecWriteJoins` walks a list literal into its records, joining each field at the holder's
  element. Once the set is tagged, `fnTagHeldWrittenInner` (check_elab_cap.vl) stamps the
  literal at the holder's element rep and queues its records at that rep's record, the queue
  `fnTagHeldInner` fills for the initialiser.
- **A list binding as a record's field (D15392).** The `let` field widener widened a field
  holding an inline list of functions but not a list binding. A binding read only as the field
  (`letFnListSoleSource`) is widened the same way, with the binding and its literal re-typed to
  the field, so the binding counts as widened and D15306's stamp builds the written record at it.

## Evidence

- Seed fixpoint: a second `refresh-compiler.sh` is `cmp`-identical.
- Witnesses and ablations with distinct functions (`a + 1`, `a * 10`, `a + 100`). D15357 also
  runs with one function at two types; D15392 also runs at one call type.
- `capability-matrix.vl --before <master fixpoint> --after <this fixpoint>`, two new templates,
  each 0 runs → not-runs and 0 silent: `list-literal-of-fn-records-pushed-whole-onto-held-list`
  41 of 46 graded cells run (14 moved emit refuses → runs, all un-annotated);
  `record-of-fn-list-written-whole-over-list-binding-field` 32 of 46 (5 moved). The second's
  capture and slot positions stay refused: the field's list is read where it is not declared, or
  is not a binding (D16242's and D15307's families).
- `rep-fuzz-check.sh`: exact, 0 new, 0 stale. `gate.sh` (with its `regress.vl` row) on the
  merged tree.
- The first build of `fnTagHeldWrittenInner` raised the kind-ladder budget by one (an `is`
  ladder over two literal kinds); the record arm is now a delegation.

## Residue

D16242: a list binding read again keeps its own set. D16243: a field write of a list literal
over such a field is a slot write, D15307's family.
