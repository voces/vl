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

## The sweep's one mover, and its fix

The first CI sweep lost one program: D10130, `k?.get("a") ?? d` over `{[string]: V} | null` at
the `i32` pin. It went from runs to `union box atom test on a union with no recorded members: null`.

**Cause.** The `??` call-stash arm asks `unionHasAtomK(ksid, "null", …)` of the operand's set.
At this pin the set is unresolved (-1). The removed name fallback answered `false` for
`i32|null`, because that name has no recorded arms. The arm then declined to a later one.

**Rejected rules.**
- Reading the instance type with `nodeTyAt` resolves no set either.
- Reading null-membership off the type (`tyHasNullMember`) passes the gate. The arm then
  refuses with `scalar map read has no value-box type`.

**Fix.** `setHasNullAtom(s)` answers `false` for an unresolved set. All four `??` null gates use it.

**Population: one program.** A probe compiler noted every unresolved set at the four gates,
with the name fallback's answer beside it. Only D10130 hit, at the call-stash gate, where the
name answered no null:
- inventory witnesses: 1 of 4,743;
- distilled and corpus chunks: 0 of 9,202;
- the self-compile: 0.

The rule matches master on every observed hit.

**After the fix:** D10130 prints `5`. lint-self is clean, rep-fuzz is exact, regress loses no
runs, cases_wasm passes 7,537, and the emitter-state audit passes.
