# An inferred record result's returns are audited like a written one's (2026-11-24, lane IR-N5)

`auditRecordJoinLeaves` (emit_value_sites.vl) refuses a branch that hands over a record whose
field types differ from the join's row, since legacy shares a record rather than converting it.
It audited a function's `return` values only when the function had a written result
(`fn.fnRet >= 0`). An inferred record result was never checked, so a `return mk2()` or a returned
local, built at its own row, was handed over unconverted and the module failed validation inside
the function ([D17463](../inventory/D17463.md)).

## The change

- Under `fn.fnRet < 0`, the same `rjaLeaves` runs over `collectRetValues` against the row of
  `fnCheckedRetTy` (the inferred result, or a lambda's checked result).
- Invalid wasm becomes the existing `RECORD_COPY_MSG` refusal. No program that ran is refused.
  The audit stays behind `recordJoinSeen()`, so a join at one row never reaches it.

## What stays open

A written result runs the same programs. The check delivers the result's row into the maker,
which is then built at the join's row, so no conversion is owed. An inferred statement-return
join makes no such delivery: `noteRetJoinValues` re-joins only a `tpJoinUnions` result. That
delivery is [D17224](../inventory/D17224.md), the next PR.

## Measured vs master `bf61bf508` (fixpoint seeds on both sides)

- The ablation spellings: d63 (nested wrapper), d63b (`return mk2()`), ab4 (lambda), ab5 (`.f`
  read), ab7 (`const t = mk2(); return t`) and ab8 (a local literal) go from invalid to loud.
  d62 / D17462 (un-annotated parameter) and the value-`if` d63c were already loud. ab1 (both
  literals), ab2 (same row), ab3/ab8a (written result) and ab9 (value `if` over a local) run,
  unchanged.
- tests/cases: 6894 files built on both seeds; 0 build outcomes differ.
- distilled `regress.vl`: runs → not-runs 0 classes (0 of 261224 census cells), → silent 0.
