# Step 7 slot layer, family B, 10: four struct-row and classifier name readers read the type, 2026-11-11

These are four readers from w318's classifier census. Each read a record or type *name* to
decide. This PR is stacked on #7238 (9a), and so on 8b's `sRowCanonOf` and 8c's canonical
`structRowOfRecordTy`.

## What changed

| reader | before | after |
| --- | --- | --- |
| `structIndexOfLet` (`emit_classify`) | `structRowOfAnnTy(lt.tyName, lty, lty)`: the record's row, else the spelling's | `structRowOfRecordTy(lty)`: the canonical row of the annotation's type |
| `saDeclShapeOk` (`wasmEmit`) | `ann.tyName == "string"` | `tyPrimNameOf(nodeTyIxOf(d.letType)) == "string"` |
| `cboxZeroInit` (`emit_rewrite`) | the annotation's spelling against `i32`, `f64`, … | the primitive name of the annotation's type |
| `flatHasSubWordField` (`emit_collect`) | its own `u8`/`i8`/`u16`/`i16` list | the checker's `flatStorageSpellWidth` |

## The floor: `flatHasSubWordField`

It keeps a name read, by design. A sub-word width is a storage spelling the arena types as
`i32`: `PrimName` has `u8` and no `i8`, `u16` or `i16`, and the checker reads the width off the
spelling (`flatStorageSpellWidth`, `check_leaf_steps`). The nested flat it follows is found by
the declaration's own name (`flatDeclByName`). The slice deletes the emitter's copy of the width
list, so the spelling rule has one home.

## Measurement

- **Candidate against #7238's seed:** all 23,910 programs are the same, module bytes included.
- **An alias of a primitive** (`type N = i32`, `let x: N` captured and assigned by a closure)
  runs on both seeds. Another path already gave it a zero value. So `cboxZeroInit`'s type read
  admits no program the spelling refused.

## Proof

- Refresh is at 6,623,769 bytes.
- `regress.vl`: no runs lost.
- `cases_wasm_*`: 7,440 passed.
- `vl_check_codegen` and `vl_scaling_shape`: pass.
- `lint-self` and its budgets: clean. The dead-export budget: ok.
- Seed size: +0.5% on its baseline.
- The `sweep` label re-proves the population. Expected movers: none.
