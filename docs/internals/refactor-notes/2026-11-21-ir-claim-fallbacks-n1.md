# IR: two claim fallbacks `tests/cases` showed and the corpus did not (2026-11-21, lane IR-N1)

IR-D1's census of `tests/cases` under the armed shadow found two verifier failures in
`literal-unions/`. A verifier failure in a claimed function is a hard failure (§10): legacy's
bytes ship, and a lowering defect hides behind them. Both are on master `f44a504b8`.

## `asg-into-nullable-atom-local-value-runs.vl`: rule 3 in `fromCall`

`return k = pick(b)` with `k: K | null`. `assignValue` stores the value and then re-reads `k`
through `narrowedLocalRead`. That read recovers the nullable local to its inner rep (`K`'s
atom) into a temp, but the temp was typed at the identifier's own type, the cell's `K | null`.
Rule 3 (a variable's rep is its type's) refused it.

The recover temp now takes the cell's nullable inner type wherever that inner is the read's rep.
That is the type the recover produces, read off the checker's type.

## `pop-coalesce-widens-to-string.vl`: rule 2 in `@start`

`ms.pop() ?? "b"` over `("a" | "b")[]`, with a member default, keeps the atom. `coalPopOrWhy`
admitted only a primitive element, but legacy's `popOrPlanOf` takes a literal-union list as a scalar
list of i32 atom ids, and the lowering calls the same `popOrOpen`. The rule now admits an `RAtom`
element.

## Rows

`tests/ir-shadow-rows/asg-reread-nullable-atom-recover.vl` and
`tests/ir-shadow-rows/pop-coalesce-atom-list.vl`. Both fail the verifier under the merge-base
seed and match under this branch's.

MEASUREMENTS
