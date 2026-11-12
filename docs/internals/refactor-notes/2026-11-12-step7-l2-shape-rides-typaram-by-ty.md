# Step 7 L2 §7: `shapeFieldsRideTyParam` reads the parameter's type, not the field's spelling, 2026-11-12

Lane w311's one-cut deletion of the name-based ref-list cluster (`refArrShapeKindGo`,
`refArrElemNameGo`, `nameIsRefArrayGo`) needs this caller off it, and w311 handed it to lane
w310. `shapeFieldsRideTyParam` (`emit_shape_intern.vl`) declines a shape row for a `(T | null)[]`
field over a type parameter. It asked `refArrShapeKind(fieldText) == RLK_UNION`, so a declared
`T` that the parameter's name shadows (kind 1) kept its row. It now asks `tyVarNamesNoDecl`: the
element's inner type is a `TyVar` whose name takes no declared type (`cUserTypes`). That is the
shadow ruling itself, read off the type and the declaration table, with no parse of the field
text. `emit_shape_intern.vl` no longer imports `refArrShapeKind` or `RLK_UNION`.

The base is master `e3c63e35`, with a fixpoint seed on both sides. The population is the whole
sweep, 23,984 programs.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, over the 355 cases
that spell `(… | null)[]`. 5 reach the test. In 1 of them the spelling answered kind 1: the
shadow witness `generics/error-param-shadow-tyaram-nullable-elem.vl`, whose `T` is a declared
struct. All 5 build byte-identically with the type test, and the witness still prints `2`.

## Proof

- **Local full sweep.** `--prove-fixpoint` seeds on both sides: 23,984 same, 0 bytes-only
  movers, 0 output movers, 0 runs → not-runs, 0 new compiler traps.
- **Checks.** `rep-fuzz-check.sh` is exact. `cases_wasm` passes 7,472 with 0 failed. lint-self
  is clean. `emitter-state-audit --check` is clean. The export budget, with findings, has 0 dead
  exports. Render-parse is flat, and the baseline is not written.
