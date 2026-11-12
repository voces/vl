# Step 7 L6 (step S2): `unionRowKeyAB` takes no name; the literal-union assignment guards ask the binding's type, 2026-11-12

This is stacked on S1 (#7562).

## Changed

- **`unionRowKeyAB(site, ty)`** answers the row type `ty`'s key finds. Its name fallback is
  gone, and its callers drop the name.
- **The two assignment guards** (`assignGlobal` / `assignLocal`, sites 88 and 89) were the only
  callers the fallback answered. They asked `unionRowIsLitUnion(name, declared type)`. They now
  ask `bindingTyIsNoBox` of the binding's own inferred type (`letUnionTyIxOf`,
  `unionTyIxOfIdentAt`), which is true for:
  - a homogeneous literal union (held as its atom or base);
  - a type that is no union. A numeric literal union's binding carries its base, so
    `let fexit: CliExit` is `i32`.

  It is false for `null`, a null hole that a later write fills, which holds the box.
- **Unused parameters drop:** `unionArmVariantForObj`, `unionArmLandingForStructExpr` and
  `narrowedBoxRenderOf` lose their names.

## Census

A probe compiler was run over the cases and cells, and over the compiler's own source.

**The fallback answered 100 calls in 50 programs, all at sites 88 and 89:**
- **98 calls passed no type** (an inferred binding's declared type is -1).
- **2 calls passed a type that keys no row.**

**At those guards, three ways of asking the binding type:**
- **The declared type** disagreed with today's answer in 23 calls.
- **The binding's type with `homogLitUnionBase` alone** disagreed in 13 calls in 8 programs, all
  `null` holes, plus 2 calls in the compiler's source (`CliExit`).
- **The final rule (literal union, or no union, but not `null`)** agrees in every corpus call
  and every call in the compiler's own source.

**Why the self-compile matters:** a first candidate that only dropped the fallback built every
corpus program but miscompiled `cli.vl` (`let fexit: CliExit = EXIT_OK` lowered as a box). So
the census includes `compiler/entry.vl`.

## Proof

**Fixpoint:** the candidate compiles itself byte-identically.

**Targeted A/B:** the 182 census programs print the same output on a master seed and the
candidate.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,538 passed.
- emitter-state audit: passes.
- dead-export: 0.
- union-key licence test: passes.

**The full sweep:** CI's `sweep` label.
