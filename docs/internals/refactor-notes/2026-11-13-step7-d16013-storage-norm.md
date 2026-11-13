# Step 7: D16013 closed, a typed normalizer for the list element's key, 2026-11-13

#7803 left three template rungs of `arrLitElemKeyTy` keyed by re-parsing the element's rendered
name: the closure, the nested list and the nullable element. The parse of a render is a
normalization of the type, so no type in hand gave the same key. The coordinator ruled that this
blocks step 7 (D16013).

## The normalizer

`storageNormTy(ty)` (check_relate_core) is one type-to-type function and never spells a string.
It does what the element render (`tyToEmitName`) does to a type:

| render behaviour | normalization |
| --- | --- |
| a literal renders as its base scalar (`tyLitBaseName`) | a literal leaf widens to `litBaseTy` |
| a string literal inside a union stays inline | kept inside a union |
| a litunion alias keeps its name, except in a function parameter (`tyNameFunc`) | kept, except in parameter position |
| a one-member union renders as its member | the member |
| a function type spells no function-value set; a list spells no `readonly` | rebuilt fresh with `mkFuncTy` / `mkArrayTy` |

## Graded

A probe on the converted build compared the hint's key and type with the name parse at every
hint-less list mint that has a hint. With marks reset per compiled program, it swept 24,222
programs:

| round | agree | differ |
| --- | --- | --- |
| widen literals only | 113 / 18 / 98 at P1 / P16 / P17 | 5 / 2 / 10 |
| plus inline string literals in unions, one-member unions, fresh rebuilds | 467 | 5, all `(x: K) => …` |
| plus the parameter-position rule | **471** | **0** |

**Storage check** (the coordinator asked whether any normalization merges types that store
differently). Each normalization applies only where today's name key already merges. Checked by
running:

- a `K`-parameter closure and a `string`-parameter closure in one list;
- a literal-returning closure beside its widened twin;
- `T | null` beside `null | T`.

All print correctly at base and candidate. That program is the new test case
`tests/cases/closures/list-elem-key-storage-normalized.vl`.

## Measured

| instrument | result |
| --- | --- |
| full sweep, 24,222 programs, base 03549c924 against this change on it, both fixpoint seeds | 24,222 same; 0 bytes-only movers; 0 runs → not-runs; 0 new traps |
| fast set on the same tree | all green |
| D16013's repro | prints `ab` |

Lane H adds a nested-union-alias flatten to the same normalizer for its site 55, after this lands.
