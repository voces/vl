# COV-CALL: returned containers across closure openness (2026-11-26)

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

A list of `(_) => _` and a list of `(i32) => i32` lower to one value, since every closure is the
one closure struct. `repFillsHole` admits that in either direction (`cloHoleRetag`). The return
site took it only for a map or a nullable closure pair, and in one direction otherwise
(`listRetagHole`); the tail sites took no retag at all.

- The return site retags with `cloHoleRetag` for any rep but a record (`retCloRetags`). A record's
  retag is the verifier's field-wise rule, which `tests/ir-shadow-rows/hole-fn-field-called-off-
  nested-maker-fields.vl` pins.
- A tail value and a tail `if`'s arm value take the same retag (`retHoleRetag`).
- `retHoleMap` and `nulCloPair`, the old allow-list, are removed.

## Proof

- **Census**, regen-9 F1: `arrays/spread-source-retag-positions` (both units),
  `functions/hole-fn-set-member-bound-at-delivered-nested-list`, D15753, D15755 and D16700 are
  fully claimed, and their armed runs print as legacy does.
- Two F1 rows stay: `closures/heap-value-field-r` and `-s` return a record literal built at its own
  rep, which has no struct heap, while legacy builds it at the result's row. That is F3's
  mechanism, as is `d15293_bound_returned`'s list of such records.
- **Armed sweep:** 2,058 `@run` programs under `tests/cases/closures/` and `tests/cases/arrays/`.
  Two differ armed; both differ the same way on a current-master seed.
- **Q58:** `tests/cases/closures/returned-closure-container-openness-positions.vl` returns at a
  `return`, a lambda's tail, a tail `if`'s arms, a nested list and a generic instance's result. On
  the master seed three functions miss on `return coercion`/`tail coercion`; on this branch all
  eleven match, and the armed run prints the `@log` list.
