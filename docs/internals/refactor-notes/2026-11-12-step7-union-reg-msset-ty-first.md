# Step 7 L6 (step R2): `msSetOfNameTy` asks the type's row first, 2026-11-12

The base is master, after R1 (#7492), C8 (#7487) and w310's #7493 (every caller passes a type).

## Changed

`msSetOfNameTy(name, ty)` answers the row `ty` keys (`msSetOfTy`) first. The name's row is read
only where the type keys none.

## Census

A scratch probe compiler was run over the cases and cells, comparing each call's set against the
type's row's set: 76 calls in 18 programs differ.

| class | calls (programs) | what the type's row is |
| --- | --- | --- |
| same members | 26 (7) | a literal type's row with the widened set's members: `"x" \| 7` (key `("x" ; 7)`) beside the `string\|i32` spelling's, and `D = 1 \| 9000000000` beside `i64\|i32` |
| a different type | 34 (6) | a literal type's own row: `K\|i32` (key `("a" ; "b") ; i32`) where the hub's widened name is `string\|i32`; `"x" \| "y"\|boolean`; `i32\|string` where the name is `i32\|K` |
| no row | 16 (7) | a nullable mixed literal set (`("a" ; 1) ; null`), for which no row is minted; the name's row still answers |

- **Before R1** the census had 211 differing calls; R1's widening folded the nullable integer
  literal unions.
- **The step-7 pair census:** of 154 row pairs sharing a canonical rep, 149 are different
  checker types and stay two rows. The other 5 are:
  - four newtype pairs (`NtI32 | null` beside `i32 | null`, and so on), which `tySame` reads as
    one type although their keys and identities differ;
  - one generic body type recorded for two instances' rows (the per-instance node-type gap).

  So no merge was due.

## What is left

- **The no-row class.** It needs a row keyed by the nullable mixed literal set, or that set's
  key widened as R1 widened integer sets.
- **`tySame` over a newtype member of a union.** It answers true for `NtI32 | null` against
  `i32 | null`.

## Proof

**Targeted A/B:** all 18 census programs, built and run on a master seed and the candidate,
print the same output.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,503 passed.
- emitter-state audit: passes.

**The full sweep:** CI's `sweep` label.
