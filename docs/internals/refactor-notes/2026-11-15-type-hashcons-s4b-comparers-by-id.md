# Type hash-cons stage 4b: two emit comparers become one `==` on an id (lane H), 2026-11-15

Stage 4's second slice, stacked on 4a (#8262). 3b's shadow agreed on every outermost comparison
in 1,833 files: `tySameSet` on 1,319 and `tySameSpelled` on 646. 4a's probes added 8
distinct-row "equal" pairs for `tySameSpelled`, and those agreed too. So the two comparers are
now their ids:

    tySameSet(a, b)      = a == b || tyCanonSet(a) == tyCanonSet(b)
    tySameSpelled(a, b)  = a == b || tyCanonSpelled(a) == tyCanonSpelled(b)

**Deleted from `emit_ty_canon.vl`** (−278 lines):
- the two walks and their nine per-kind helpers;
- the pair stack the two walks shared (`tyWalkA`/`tyWalkB`) and its cycle test;
- the 100,000-pair walk budget, whose answer was "unequal" once it ran out;
- the two pair-of-pairs memos and their reset;
- the `depth` argument, together with the `TY_WALK_DEPTH` cap at all 19 call sites and three
  imports that no longer read it.

The cycle bookkeeping now lives in the id's own walk, done once per row (`emit_ty_seal.vl`). A
comparison no longer has a budget, a depth cap or a per-pair memo to run out of.

**The shadow** keeps the `tyCanonKey` and layout tallies. The same-set and same-spelled rows go
with their comparers (`emit_ty_seal.vl` −47).

`tyCanonKey` still walks. Its 29 disagreements with the set id (3b) are a semantic choice per
caller, between a record keyed by its struct name and a Set inside a generic application's render.
That switch, and the emit-side `tyMutEpoch` reads, are the next slice.

## Measurements

The base is master `828a723b` merged with 4a, built to its own fixpoint. A first base, 4a at its
older master, showed one file 12 bytes apart. The true base matches that file byte for byte, so
the 12 bytes were master's.

| reading | value |
|---|---|
| seed | fixpoint (two refreshes byte-identical) |
| identity | 1,839 corpus files plus `compiler/entry.vl` (the L2 input): same module and diagnostics |
| identity, full sweep (after merge, from 4c) | 19,779 of 19,779 files byte-identical: all of `tests/cases` outside `modules/`, plus `distilled/cells` and `distilled/named` |
| net compiler lines | −334 (`emit_ty_canon.vl` −278, `emit_ty_seal.vl` −47, `emit_obj_lit_fits.vl` −7, two import lines) |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |
