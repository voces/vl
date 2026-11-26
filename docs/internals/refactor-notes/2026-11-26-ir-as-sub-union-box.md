# IR: an `as?` sub-union value delivered into its own union (2026-11-26)

Lane COV-IS, regen-9 class `box into another union`.

`boxIntoOtherUnion` (compiler/ir_build.vl) treated any value whose box plan was not `pass` as
needing a re-box into the destination union. A `x as? Shape` result narrowed by `!= null` has
the node type `Shape` itself; it is already the destination's box. The builder now hands it
over when the value's node type equals the destination type, which is what legacy emits.

Measured:

- regen-9 rows closed: as-coalesce-variant-and-sub-union,
  type-test-one-predicate-is-as-match-runs, record-arms-same-field-disj-as-opt. All three now
  claim byte-identical to legacy.
- `vl run scripts/ir-parity.vl -- --files` over those three plus the sweep: same 4, differs 0.
- The sweep `tests/cases/unions/as-sub-union-narrowed-into-union-positions.vl` covers passed,
  bound, returned, list element and top level. On master it misses 4 sites plus 1 at start;
  with the change it misses none.
- Shared plan unchanged (`holeBoxPlanOf` untouched), so legacy claims-off bytes do not move.
