# Step 7 L6 (step H2): `unionHasAtomK` takes no name; the store-kind ladder and the coerce sets come from the union's type, 2026-11-12

This follows H1 (#7543).

## Changed

- **`unionHasAtomK(s, kw, k)`** answers from the set `s` (`msHasValKind`). Its name, and the
  spelling fallback (`unionHasAtomTy`), are gone; a set that cannot answer fails loudly. Its 19
  callers drop their names.
- **The callers that could hand it no set now build one from the type:**
  - `unionStoreAtomKindOfSet(s0, uTy, vk)` and `unionStoreAtomKind(uTy, vk)` use
    `msSetOfTyAny(uTy)` where no set is given.
  - wasmEmit's `coerceSetOf(uSet, uTy)` does the same.
  - `coerceValueAtomKind` gains `uTy`.
  - `unionEqAtomKindOf(otherIx, uSet, uTy, fnIx)` replaces its name with `uTy`. Its callers pass
    the box read's type, and for the scalar map-read compare, `atom | null` as a type.
  - `memReadBoxedAtomKind` passes the field read's store or declared union type.
- **Deleted:** the unused `unmArms` in `emitUnionLitIs` and an unused field name in the null
  default.

## Census

A probe compiler was run over the cases and cells. Each entry point that can reach the
fallback set the set its type gives, and the fallback compared that set's answer with the
name's:
- **The fallback fired in 48 calls in 15 programs**, every one with no set passed.
- **43 calls agree.** The field reads agree only through the store or declared type: the field
  row a member read records (`memFieldRowOut`) is -1 there.
- **5 calls in 1 program differ** (`maps/scalar-read-miss-is-null-when-consumed.vl`). The
  synthesized name `"i32 | null"` was spelled with spaces, which the spelling path did not
  parse, so it answered false where the type's set answers true. The program prints the same
  output either way, and matches its `@log`.

## Proof

**Targeted A/B:** the 15 census programs print the same output on a master seed and the
candidate.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,537 passed.
- emitter-state audit: passes.
- dead-export: 0.

**The full sweep:** CI's `sweep` label.
