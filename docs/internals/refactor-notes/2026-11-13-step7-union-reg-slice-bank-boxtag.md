# Step 7 L6 (lane G, #13 P2): member slices bank `boxTagOfTy`, 2026-11-13

Stacked on lane H's D16062 PR 2 (#7789). The union member slices (`recordUnMemTys`,
`msFreeSlicePush`, emit_rep) banked each member's box ABI code as `valueAtomKind` over the
member's canon render. That made a member's code a fact about its spelling: D16050 and D16051. It
also left a string literal-union arm at -1, "not a value atom". They now bank `boxTagOfTy(ty)`,
the tag the runtime writes into the box, the same rule D16062's verdict reads. A `null` member is
code 6 (the row-less slice spells it as type -1).

## What the producer switch moved, and the readers that take it

A probe at both producers over the corpus population found **1,006 disagreements in 780
programs**. Nearly all are a string literal-union arm (`K`, `AB`, inline `"a" | "b"`), which
banked -1 and now banks 2, its member string. D16051's one-literal lists move to 7.

Lane H applied the two pushes alone, on master `9564c861`: **57 programs stopped running**, all at
one emit refusal (`wasmEmit`, the `K | null` atom widening). Its "is there a plain `string` arm"
test asked the banked code (`unionTyHasValKindOf(uTy, 2)`), so a literal-union arm, now 2, read as
a string arm. It now asks `msHasPlainValKind(s, 2)` (emit_rep): a member of kind 2 whose type is
no literal and no literal union. `unionTyHasValKindOf` had no reader left and is deleted.

`isValueUnionOfSet` (wasmEmit) fell back to the union's spelling
(`isValueUnionName(unionMemberSetOf(nm))`) where the set declined. With every set sliced, a probe
over the population found the fallback reached only where the caller's name lookup found no set:
33 points in 22 programs (31 false, 2 true, both union `==` operands). Each caller now passes the
union's type, the fallback asks `msIsValueUnion(msSetOfTyAny(ty))`, and a union neither answers is
a loud floor. wasmEmit no longer imports `isValueUnionName` or `unionMemberSetOf`.

## Measurement

The named set is the 57 programs H's experiment lost, D16050/D16051's ablations, and the 22
fallback programs. Each was run on H's branch and on this one.

| set | programs | same output | moved |
| --- | --- | --- | --- |
| H's 57 (inventory D3347, D3358, D3616, D4041, D6950, D7043, D7120, D7121, D7960, D7962, D7966; the d3140, d3127, l6 and rv3310 named cells; 13 test cases) | 57 | 57 | 0 |
| D16050 / D16051 ablations, and controls | 33 | 33 | 0 |
| programs reaching `isValueUnionOfSet`'s fallback | 22 | 22 | 0 |

D16050's mixed-base list and D16051's one-literal lists now bank one code each, read off the type.
They are closed here.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel, scan and render-parse budgets.
- **The full sweep:** CI's `sweep` label, against H's branch tip.
