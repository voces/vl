# COV-CALL: `irConvert`, slice 1: returned containers across closure openness (2026-11-26)

Lane COV-CALL; the F1 sub-family of regen-9's `return coercion` and `tail coercion`.

## Diagnosis (the coercion family)

I graded every regen-9 `argument coercion`, `return coercion`, `tail coercion` and `void return
value` program by its source and destination reps. The four classes share no single mechanism.
They split into:
- F1: containers of closures whose openness differs;
- F2: containers whose element widens to `| null` or a wider union;
- F3: a record at another row of its shape;
- F4: wrapping into a nullable or a box;
- `void return value`: an i32-repped value returned from a no-value result.

This PR is F1.

## Mechanism

The coordinator ruled the four families one mechanism, a structural conversion recursing through
containers, built as one converter, `irConvert` (DECISIONS.md, 2026-11-26). This PR is its first
slice.

- **The converter.** `irConvert(b, v, dst, dstTy, at)` answers through `convertKindOf`, a `match`
  over the destination's rep kind with no `_`. A value is taken as it stands (`convertAsIs`: an open
  type's rep, a valtype the destination stores, the bottom ref in a nullable ref, a niche's ref) or
  retagged (`convertRetag`: a list's twin, closure openness, a record's struct twin or noted row).
  Anything else misses as `convert <src> -> <dst>`.
- **Closure openness.** A list of `(_) => _` and a list of `(i32) => i32` are one value, since every
  closure lowers to the one closure struct. `convertRetag` admits that in either direction
  (`cloHoleRetag`) for any rep but a record. A record's retag stays the verifier's field-wise rule,
  which `tests/ir-shadow-rows/hole-fn-field-called-off-nested-maker-fields.vl` pins; the row copy is
  slice 4's.
- **Sites.** The return, the tail and the tail `if` arm call `irConvert` in place of their own chains.
  The return's chain of `listRetag`, `holeRetagNoted` (map or nullable closure pair only),
  `recRetag*`, `openRepTakes`, `repStoresAs`, `repNullRefFits` and `nicheRefTakes` is deleted there.
  So are `retHoleMap` and `nulCloPair`. The tail sites had no rule at all.
- `return coercion` and `tail coercion` now read `convert <src> -> <dst>` where no case applies. The
  nested-twin miss (D17385) stays as it was.

## Proof

- **Census**, regen-9 F1: `arrays/spread-source-retag-positions` (both units),
  `functions/hole-fn-set-member-bound-at-delivered-nested-list`, D15753, D15755 and D16700 are
  fully claimed, and their armed runs print as legacy does.
- Two F1 rows stay: `closures/heap-value-field-r` and `-s` return a record literal built at its own
  rep, which has no struct heap, while legacy builds it at the result's row. That is F3's
  mechanism, as is `d15293_bound_returned`'s list of such records.
- **Armed sweep:** 3,317 `@run` programs under `tests/cases/{closures,arrays,functions,unions}/`.
  Three differ armed; all three differ the same way on a current-master seed.
- **Q58:** `tests/cases/closures/returned-closure-container-openness-positions.vl` returns at a
  `return`, a lambda's tail, a tail `if`'s arms, a nested list and a generic instance's result. On
  the master seed three functions miss on `return coercion`/`tail coercion`; on this branch all
  eleven match, and the armed run prints the `@log` list.
