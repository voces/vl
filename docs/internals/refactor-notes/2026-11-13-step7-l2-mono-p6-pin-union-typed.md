# Step 7 L2, mono, P6 cut 4: union pins and instance returns are spelled from their types (2026-11-13)

Lane D. Base `f18fb736`. The `monoPinUnionName` → `canonEmitName` and `monoInstanceRetSpelling` →
`arenaEmitName` sites in lane H's render-parse census. The registry hunk is lane G's API, and G
reviews it.

## What the spellings fed

Both names reached identity in one place only: `monoRegisterPinUnion`'s `unNameBound(name)` gate.
- Every union-spelled pin through `monoSynthPinRef` already has a closed type (2,441 programs,
  3,815 decisions, none open), so the pin node is typed by the type.
- The instance return's node is typed by `r` (`synthTypeRefTy(nm, -1, r)`).

## Cut

1. `monoRegisterPinUnion`: `unNameBound(name) || (unRowOfTyKey(ty) >= 0 &&
   unNameAdoptTyKeyRow(name, ty))`. A union type that already has a row binds the new spelling
   to it, so the name labels and the type decides. `unNameBound` stays first: it is the
   spelling-index contract.
2. `monoPinUnionName` is deleted, along with `monoPinUnionNameOfTy`, and its callers pass their
   spelling through. With the registry adopting by type, its canonicalization was a label.
   - First tried: spelling the type instead of `canonEmitName(rs)` (1,164 of 1,164 SAME).
   - Then: returning `rs` unchanged, also 1,164 of 1,164 SAME. That is the identity.
   - The `canonEmitName` import leaves `emit_mono.vl`.
3. `monoInstanceRetSpelling` spells the type and keeps `arenaEmitName` only where the naming rule
   has no spelling.

## Decision tables

From `MPROBE` builds over the 24,070-record population.

`monoPinUnionName`, type spelling against `canonEmitName`:

| answer | programs | decisions |
| --- | --- | --- |
| same text | 1,096 | 3,584 |
| different text (alias naming, literal absorption, numeric widening, field vs handle) | 70 | 242 |
| no spelling, keeps `rs` | 5 | 7 |

`monoInstanceRetSpelling`, type spelling against `arenaEmitName`:

| answer | programs | decisions |
| --- | --- | --- |
| same text | 1,466 | 2,498 |
| different text (member order, generic applications by fields, rows by name) | 597 | 737 |
| no arena name | 177 | 320 |

## Byte comparison

Master vs PR, over the union of every program reaching either site: **3,069 of 3,069
identical** (3,047 SAME, 22 SAME refusal).

Every text difference is a label. The type-keyed adopt binds whichever spelling reaches the
registry to the type's one row.

## Census

- One type-string parse leaves: `canonEmitName(rs)`.
- `emit_mono.vl` renders: three leave and three enter here, net zero.
- The baseline also records `const ls = monoPinSpellShaped(lt)` from #7762. That render replaced
  a parse, but it raced #7764's re-graded census, which left master's render-parse gate at 39
  against 38.
