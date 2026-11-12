# Step 7 L6 (step R4): the member-set lookup takes no name; `msSetOfNameTy` goes, 2026-11-12

This follows R2 (#7501) and R3 (#7508). R2 made `msSetOfNameTy` ask the type's row first.

## Changed

- **Every caller of `msSetOfNameTy(name, ty)`** now calls `msSetOfTy(ty)`. The name-reading
  fallback is gone with the function.
- **`msSetOfUnionBox(boxIx, fnIx)`** drops its name. It reads the row of the box read's type,
  else, for a nullable read, its non-null union's row: a map value whose miss rides the null tag.
- **`printUnionPlanCode`** asks the box read's store or declared type where a row keys it, else
  the read's own node type (`printUnionBoxTyOf`).

## Census

A site-tagged probe compiler was run over the cases and cells, recording where the name
answered.

**After R3 the fallback fired in 9 calls in 3 programs:**
- **`printUnionPlanCode`, 5 calls.** The declared type was a hole (`_`, a hole-typed parameter)
  or a narrower `string`. The read's node type keys the row the name gave.
- **`msSetOfUnionBox`, 4 calls.** A map read bound to `x` holds `K | f64 | null`, which keys no
  row. Its non-null union `K | f64` is the box.

**Generalising the nullable rung to every caller would have answered 9 more calls in 2 programs
where today none answers.** For example `f64|string|null` read as `f64|string`, at
`printUnionPlanCode` and `unionSetNonNullCountTy`, which drops the null. That is the hazard
architecture-refactor-plan.md recorded for the rung, so the rung stays the box read's alone.

## Proof

**Targeted A/B:** the 5 programs either census touched print the same output on a master seed
and the candidate.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,524 passed.
- emitter-state audit: passes.
- dead-export: 0.

**The full sweep:** CI's `sweep` label.
