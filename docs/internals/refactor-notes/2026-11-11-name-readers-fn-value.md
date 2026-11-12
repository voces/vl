# The function-value NAME readers, 2026-11-11

`rep-classifier-census.vl -- --reads NAME` lists 61 classifiers on master. This note places
the eight in the elaboration and function-value code; the rest are grouped by bank in the
lane report and routed by the orchestrator.

| classifier | verdict |
| --- | --- |
| `elabListArgAtRep` (emit_elab.vl) | converted here: "a parameter annotated `T[]` of the function's own type parameter" is read off the annotation's arena type (a `TyArray` of a `TyVar`), not by slicing `[]` off its name |
| `elabSlotCallTysOpenFns`, `elabMintOuterSlotFactAt` (emit_elab.vl) | floor: `tyToStr` spells a printable fact key, which is what rendering is for (ARCHITECTURE.md §4.1) |
| `elabArgRepins` (emit_elab.vl) | floor: a type parameter is named in the AST, and `tyParamIsBareOnly` takes the name |
| `directArgSeedsOf`, `emitCapturedCall` (wasmEmit.vl) | named by their consumer: `tyNameOf(parType)` is the union name `emitUnionBoxOwed` takes, the union registry's API (w316) |
| `funcRetUnrepresentable` (emit_collect.vl) | named by its consumer: `funcTypeShapeLowerable(name)`, in emit_shape_intern.vl (w310) |
| `listAnnNameOf` (emit_closure_sites.vl) | name API: it returns an annotation's spelled name to callers that key on it |

After this change the census lists 60.

**Proof.** No `@run` output changes under `tests/cases`. The corpus oracle (`cases_wasm_0..3`)
passes 7,440, distilled `regress.vl` loses no run, lint-self is clean, render-parse budget holds.
