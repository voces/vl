# IR: `__array_new_default__`, `fromCodePoints` over a global, an atom pushed into a string list (2026-11-21, lane IR-N3)

Three list builtins the builder refused by name.

## The change

- **`array new default`.** `__array_new_default__(n)` is `RListNewDefault { ldLen, ldAt }`:
  the length, its stash (`arrNewLenStash`), then legacy's zeroed allocation
  (`arrNewDefaultTail`, now exported) at `arrNewPlanOf`'s pair. The builder asks the plan where
  `arrNew` already did, and a refused site is a named miss. The verifier checks an `i32` length
  and a list result.
- **`code point list read`.** `fromCodePoints(xs)` reads its list twice by name. Over a global,
  the builder's read is a temp, and the second read is the global's read written again
  (`irLReadAgain`, the hoisted receivers' re-read, now one shared helper).
- **`push atom`.** An atom pushed into a `string[]` or `(string | null)[]` decodes at the push, as
  legacy's `emitStrValue` does. The builder's delivery at the string rep is `atomToStr`, the
  decode the IR already shares, so `pushPlainWhy` stops refusing it.

## Witnesses

`tests/cases/intrinsics/array-new-default-lists.vl`, `tests/cases/strings/from-code-points-global-list.vl`
and `tests/cases/lists/push-atom-into-string-list.vl`, with rows under `tests/ir-shadow-rows/`.
Each is a named miss on the base seed and covered and matched after. On every
`__array_new_default__` program in `tests/cases` and the probes (22), the shipped A/B is
identical: the builder's plan call ahead of legacy's mints nothing new.
