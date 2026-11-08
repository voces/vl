# Step 6: `synthParamAnnots` deleted, its readers read the recorded type

Measured on 2026-11-08 over the sweep population (23,615 programs).

`synthParamAnnots` wrote an un-annotated parameter's inferred type into `parType` as a synthesized
`TypeRef`. The checker already held that type on the parameter node. The readers below now take
`parTyNode(p)`: the annotation when there is one, else the parameter node itself, whose recorded
type `repOfNode` and `nodeTyIxOf` read directly. An un-annotated parameter left an open hole
(`TyVar`) gets -1, as the write-back's empty pin did.

## Ablation, grouped by reader

Ablated (the write-back a no-op) at `cbc9406c` + #6758: 124 output movers, 123 of them
runs → not-runs. Each group is the files that run again once that reader reads the node's type,
added in this order.

| reader | what it read off `parType` | files |
|---|---|---|
| `vtKindOfParam`, `paramStructIdxOf`, `paramTypeNodeOfRead` | the param's slot kind and table slot | 72 |
| `retStructRowIndex` | the struct row, by the pin's name | 7 |
| `paramStructIndex` | a field read's receiver row (`field access receiver is not a struct`) | 37 |
| `captureValKind`, `captureValStructIdx` | a captured param's env field kind | 1 |
| `annValtypeSlotOf` variant arm, `paramStructIndex` `S \| null` arm | a variant / nullable-variant slot | 3 |
| `retMapFlag`, `retNulMapFlag`, `mapAnnShape`, `paramMapShape`, the captured-map shape | a map param's struct family | 2 |
| `unionNameOfExpr`'s param arm | the union row a union param boxes as | 2 |

The arena rungs were already there in most of these. What was missing was a `Param` arm in front
of the `ty is TypeRef` gate.

## Result

Full sweep, fixpoint seeds, master `82072a24` against this change: 0 output movers,
0 runs → not-runs, 36 bytes-only. The bytes-only movers fall into two kinds, sampled by
disassembly:

- a lambda's functype `(param structref …)` now reuses the identical type the program already
  declares instead of minting a second copy (30+ files, closures mostly);
- D2675, D9990: fifteen scratch locals the pinned spelling declared and nothing used are gone.

## Not converted

The "is this parameter annotated" gates (`parType < 0` in `emit_base`, `emit_atom_kinds`,
`emit_closure_sites`, `emit_lift`, `wasmEmit`) still read the syntax. Converting them to
`parTyNode` moved 11 runs → not-runs: they mean "written by the user", not "typed". Before this
change the write-back made them see a typed param as annotated, and the sweep shows that no
program needed it.

## Cost

| measure | master `82072a24` | this change |
|---|---|---|
| seed bytes (fixpoint) | 6,505,157 | 6,504,468 (−689) |
