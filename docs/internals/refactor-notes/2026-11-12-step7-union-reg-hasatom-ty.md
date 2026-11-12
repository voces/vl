# Step 7 L6 (step H1): `unionHasAtomOfTy` takes the union's type alone, 2026-11-12

The base is master after R4 (#7533).

## Changed

- **`unionHasAtomOfTy(ty, want, arr)`** answers from the row `ty` keys (`unMemHasAtomRow`). The
  name, and its spelling fallback (`unionHasAtomTy`), are gone. A union no covered row answers
  fails loudly. Its 16 callers (wasmEmit's list-literal and value-atom coerce ladders) drop
  their names.
- **`unMemHasAtomRow`'s list leg** reads a numeric literal-union element as its base. `Z[]` with
  `Z = 0 | 1` holds `i32[]`, as the value is stored.
- **`coerceListAtomOf`** drops its unused name.

## Census

A site-tagged probe compiler was run over the cases and cells:
- **The type keys a row in every call:** 1,066 calls in 154 programs.
- **1,061 calls agree** with today's name-first answer.
- **5 calls in 1 program differ** (`unions/narrowed-numlit-list-arm-read.vl`: `i32[]` asked of
  `Z[] | i32`). Today's spelling answers true. The row's list leg compared the literal-union
  element `Z` against `i32` and answered false, so the widening above closes it.

## Proof

**Targeted A/B:** all 154 census programs print the same output on a master seed and the
candidate.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,531 passed.
- emitter-state audit: passes.
- dead-export: 0.

**The full sweep:** CI's `sweep` label.
