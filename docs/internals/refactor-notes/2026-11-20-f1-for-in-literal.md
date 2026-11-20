# IR: a `for` walk over a list literal (2026-11-20)

For-in family step 1. `forInPlainWhy` refused a literal iterable (`for x in [1, 2, 3]`), a reason
written before `RMakeList` existed; only the IR's builder reads it. Legacy writes a literal
iterable through `emitForInList` → `emitExpr` → `emitArr`, whose for-iterable arm reads a constant
literal's module list (`arrLitIsForIter`, `arrLitHoistGlobal`), then `svSyncRecv`. The IR already
has both: the literal builds through `arrayLit` → `RMakeList`, whose lowering takes the same
for-iterable arm, and the walk's lowering calls the shared `forInListSync`. The step deletes the
refusal; no lowering is new.

## Witnesses

- `tests/cases/loops/for-in-literal-iterables.vl`: constant, variable, nested, string, empty and
  record literals, one literal walked twice and inside another walk, and a literal in a generic
  instance; it prints 6, 12, 7, ab and 101.
- `vl_ir_shadow_test`: every walk of a constant, variable or string literal is covered and
  matched; so are the empty, record, twice-walked and nested ones. A generic instance's `[1.5]`
  walks f64 elements, a kind `forInElemPlain` does not admit: a named miss
  (`for in element f64`), its own family.

## Readings

Against a fixpoint at the merge-base c2f0a972f (candidate a fixpoint, 6,905,223 bytes):

- Self-compile functions covered 18,619 → 18,645 (+26); `for in literal` 26 → 0 (its two
  pairings with `push short-circuit operand` now block on that alone).
- Corpus functions with no blocker 41,450 → 41,498 (+48); `for in literal` 60 → 0. Shadow 41,498
  covered, verified and matched.
- Corpus `ir-identity --names` 9,037 identical, 0 differ, self-compile identical; `--cases` 7,529
  identical, 0 differ; witnesses 59 same; mode-3 self-compile identical. No legacy byte changes,
  so no A/B is owed; the `tests/cases` A/B reads 7,249 same, 0 differ.
- L2 self-compile fuel 103,511,758,090 → 103,507,728,773 (−0.004%); late demands 9 of 9, late
  tag rows 307 of 307; seed 6,905,223 bytes.
