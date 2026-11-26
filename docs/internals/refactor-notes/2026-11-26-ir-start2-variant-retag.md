# START-2: `global initializer variant coercion` (2026-11-26)

Census restricted to the class's two programs, master 07ff5bb2: 2 → 1.
`records/intersection-recursive-twin-row-retag-positions.vl`'s start body is claimed: its arm cell
(`const gn: Node = mkM()`) takes the plain record, which `recRetag` (#10210) admits as the variant.
`types/canonical-field-order.vl` stays: `Dot` and `Circle` hold the same fields in another
declaration order, and `recRetag` compares fields by position.

Re-graded on this master and left open:
- `global read coercion` ×3, the closure-holed reads: reading the cell at its own rep's type
  (`return-literal-twin-nested`, D17385) builds, but the holed retag then fails the verifier, as
  the local spelling's claim does; `producers-of-fn-widened-holder-built-at-its-row-runs`'s local
  spelling misses on `declaration coercion` (COV-START's).
- `for range slot` stays parked (coordinator, 2026-11-26): it waits for the IR's own loop-hoist
  placement.
