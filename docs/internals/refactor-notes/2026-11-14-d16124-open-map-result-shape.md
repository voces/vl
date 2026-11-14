# An un-annotated map result recorded open takes its calls' shape (D16124), 2026-11-14

Lane B. One reader moved, `cloRetValSlot`'s map arm in `emit_classify.vl`.

## What changed

The functype result of an un-annotated function returning a map was keyed by
`mapShapeOfTyPeeled(fnRecordedRetTy(fe))`. When the recorded type is open (`{[string]: (_) => _}`)
that is the mono map, while every call (`fnRetMapShapeAt` → `inferredRetMapSlot`) and the returned
value read the tail's closed type. The arm now answers `inferredRetMapSlot(fe)` for exactly that
case: no annotation, and a recorded result with a type variable or an inference hole. A closed or
declared result keeps the old reading, so no other function's signature moves.

## Evidence

- Fixpoint: a second `refresh-compiler.sh` is `cmp`-identical.
- `pinned-map-of-hole-fn-one-signature.matrix.vl` `--before` master's fixpoint seed `--after` this
  one: `return_inferred` annotated SILENT → RUNS; runs 76 of 78; 0 runs → not-runs; 0 silent.
- `map-of-maps-of-hole-fns` (57/58) and `pinned-map-of-hole-fn-read-through-a-holder` (73/78): no
  cell moved.
