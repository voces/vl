# Step 7 L2, mono: the pin-acceptance test reads the type, not an echoed spelling (2026-11-13)

Lane D. Lane I's re-grade lists `monoNarrowedPinName` (emit_mono) as a content decision: it
compared a spelling `n` with an answer derived from it.

## Cut

`monoAnnPinName(name, ty)` returns `name` exactly when `name != ""` and `monoAnnPinOkTy(ty)`, and
`""` otherwise. Seven sites tested it by comparing the echoed spelling with the input
(`monoAnnPinName(n, nt) == n`). Each now asks the type predicate directly:
- `== x` becomes `x != "" && monoAnnPinOkTy(t)`;
- `!= x` becomes `x == "" || !monoAnnPinOkTy(t)`;
- where `x` is already known non-empty (`nom`, a literal), only `!monoAnnPinOkTy(t)` remains.

The sites are `monoNarrowedPinName`, `monoNarrowedNominalPinName`, the nullable-record and
narrowed-list rungs beside them, and `monoPinAnnSpelling`'s literal-union alias test. The
rewrite is behaviour-preserving by `monoAnnPinName`'s definition.

## Byte comparison

From an `MPROBE` reach probe, four of the sites are reached, in 825 programs. Master vs PR over
all of them: **825 of 825 SAME**.

## Census

No census entry moves: the echo comparisons were not graded as parses. The change removes a
text comparison the census does not see, which lane I's re-grade flagged as a content decision.
