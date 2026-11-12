# Step 7: every `msSetOfNameTy` caller hands it the union's type, 2026-11-12

This is step (iii) of lane w316's `msSetOfNameTy` plan. Step (iv) keys the lookup by type, which
needs every caller to hold one. The only calls that reached it with `ty = -1` came through the two
type-less wrappers, `unionSetHasNull` and `unionNameNonNullCount`. Both are now gone.

## Census

A probe tagged each call site, and in `msSetOfNameTy` it tagged a site's call with `ty < 0` (`neg`)
and one whose name named no row, so the missing type was read (`read`). A reach tag at every call
was the control. The population is the whole sweep, 24,042 programs, of which 3,251 reach it.

| site | reach | `neg` | `read` | type now passed |
| --- | --- | --- | --- | --- |
| `mvUnionIsScalarNull` (`emit_map_value_slots.vl`) | 3 | 3 | 0 | the slot's value type |
| `coalesceResultIsBox` (`emit_start_block.vl`) | 5 | 5 | 5 | the `??` node's type |
| box `==` against `K \| null`, string, bool (`wasmEmit.vl`) | 10 | 10 | 0 | `unionBoxTyOfRead` |
| `emitScalarMapReadBoxEq` (`wasmEmit.vl`) | 1 | 1 | 0 | `unionBoxTyOfRead` |
| `emitUnionBoxNulNiche` (`wasmEmit.vl`) | 34 | 34 | 1 | its `unionTy` |
| `coalesceDefaultNullable` (`emit_classify.vl`) | 0 | 0 | 0 | the default's node type |
| `coerceSetHasNull` (`wasmEmit.vl`) | 0 | 0 | 0 | the coerce target's `uTy` |

No direct caller passes `-1`. Where the name names its own row, the type is not read, so those
sites cannot move. The 6 `read` programs do read it.

## Graded

A `neg` cell that is a file was built and run on both seeds, comparing module bytes and output.
That covered 36 of the 42 `neg` cells, all 6 `read` cells among them: 36 same. The other 6 are
inventory-doc cells, which CI's sweep grades.

## Changed

- Every listed site passes its type to `unionSetHasNullTy` or `unionNameNonNullCountTy`.
- `coerceSetHasNull` takes the coerce target's type.
- The type-less wrappers `unionSetHasNull` and `unionNameNonNullCount` are deleted.

## Proof

- **Targeted.** The 36 file cells above are byte- and output-identical. CI's sweep is the proof
  for the population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
