# IR: a hole instance's parameter is held at the row legacy declares it at, 2026-11-22

The coordinator's D15180 class, IR-D1's design. Legacy builds a hole function's instance at the
record its delivery needs: `function g(v) { const w = v; return w }` called as
`const c: A = g({ d: 5 })` declares `(param $0 (ref $0)) (result (ref $0)) (local $1 (ref $0))`,
`$0` A's row. The IR built the parameter at the argument's own `{d: i32}`, a record with no row
(`repRowOfTyStruct` -1), and missed `return coercion` or `narrowed read` behind it.

## The change

* `paramHeldTy`, after the bundle arm: where legacy declares the parameter a struct
  (`vtKindOfParam`, `paramStructIdxOf`) at a row the checker's type does not map to, the parameter
  is that row's record type (`declRowTy`: `slotRowTyOf`, kept only where it is closed and maps
  back to the row). Otherwise, the fallback, it keeps the checker's type.
* `declRowParamVarOf`: a read of that parameter, or of a `let` whose variable holds its slot's
  declared row (`irSlotRowTy`, legacy's `localIsRef` / `localStructIdx`), is of that row's type;
  `declRowLetTy` declares a `let` initialized by such a read at its slot's row.
* `buildMember` reads such a receiver's fields at that row (D14426's receiver at its storage row).
* The result needs no rule: no function in tests/cases, the corpus or the self-compile takes a
  declared result row the param, read and `let` pieces do not already give.

## Readings (base master d51926731, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases armed shadow covered / matched | 68,394 / 68,393 | 68,435 / 68,434 (same single fail row) |
| corpus functions with no blocker | 45,093 | 45,098 |
| self-compile functions with no blocker | 19,800 | 19,800 |

Parameters at the declared row: 62 in tests/cases, 15 in the corpus; the fallback: 65 and 1.
Callers newly showing `argument coercion` were already unclaimed (IR-N9's caller-side class).
Identity (`--names`, mode 3, `--cases`, claimless, tests/cases A/B): 0 differ. Legacy lines
deleted: 0. Moved to `@ir`: 0. Found on the way: D17047 (unfiled: D17047, row in #9525; legacy's own row split, check-clean
invalid wasm), filed separately.
