# START-2: `call of a non-declaration: top-level lambda record` (2026-11-26)

Regen-10 lists 5 units, granted by CENSUS:
- `closures/hole-lambda-bundle-returned-from-top-level-lambda.vl` (`@start`, `back`, `two`)
- the distilled `bundle_copy_closure_returned` cell
- D15744's witness

A top-level `const` lambda returning a hole lambda's bundle record (`topLambdaRecordFe`) has no
plain closure key (`callRefPlainKey` is ""), so `closureCallRhs` missed. Legacy calls the closure
at the lambda's own signature (`cloSigKeyExt`), and then picks the member the call's use takes
(`emitBundleResultPick`).

`lambdaRecordCallRhs` builds exactly that, from existing pieces:
1. `closureCallAt` at that key, into a temp at the key's return row (`sigKeyRetSlot`).
2. `RResultPick`, the same pick a direct call of a bundle-returning function takes.

`ir-parity`: byte-identical on all three programs. The case is the position matrix: the call held,
handed on, called directly, and delivered at one member's type into an argument, a field, an
element, a push, a map and a return.
