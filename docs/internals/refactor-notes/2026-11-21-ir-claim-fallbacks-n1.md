# IR: three claim fallbacks `tests/cases` showed and the corpus did not (2026-11-21, lane IR-N1)

IR-D1's census of `tests/cases` under the armed shadow found two verifier failures in
`literal-unions/`, and IR-N4's triage a lowering miss in `generics/`. A verifier failure in a claimed function is a hard failure (§10): legacy's
bytes ship, and a lowering defect hides behind them. Both are on master `f44a504b8`.

## `asg-into-nullable-atom-local-value-runs.vl`: rule 3 in `fromCall`

`return k = pick(b)` with `k: K | null`. `assignValue` stores the value and then re-reads `k`
through `narrowedLocalRead`. That read recovers the nullable local to its inner rep (`K`'s
atom) into a temp, but the temp was typed at the identifier's own type, the cell's `K | null`.
Rule 3 (a variable's rep is its type's) refused it.

The recover temp now takes the cell's nullable inner type (`recoveredReadTyOf`, in
`emit_plan_union.vl`, so `ir_build.vl` imports no new checker symbol) where that inner is the
read's rep and the rep is an atom.

The first cut admitted any rep. That also unblocked `soundness/short-circuit-write-may-not-run.vl`
(`(s = "w").length`, a `string | null` re-read), and its shipped bytes then differed: legacy writes
`ref.as_non_null` there and the IR's recover lowering does not. That decision is what IR-N4's
`RRecover` change carries from build time, so a string re-read stays a rule-3 fallback here.

## `pop-coalesce-widens-to-string.vl`: rule 2 in `@start`

`ms.pop() ?? "b"` over `("a" | "b")[]`, with a member default, keeps the atom. `coalPopOrWhy`
admitted only a primitive element, but legacy's `popOrPlanOf` takes a literal-union list as a scalar
list of i32 atom ids, and the lowering calls the same `popOrOpen`. The rule now admits an `RAtom`
element.

## `map-declared-callback-return-reads-its-pin.vl`: `operand above a valued if's value`

`(e): string | i32 => e ?? "n"` boxes a `coalesce valBox` out at the `pass` arm. The builder's
`boxLeadsAt` reports no lead for `pass` and `memberBox`, and `holeBoxHead` writes nothing for them,
but `boxOp`'s lowering called `leaf()` before every box, which refuses while a valued `if`'s value
waits on the stack. `leaf()` now runs only for a box that writes a head.

## Rows

`tests/ir-shadow-rows/asg-reread-nullable-atom-recover.vl`,
`tests/ir-shadow-rows/pop-coalesce-atom-list.vl` and
`tests/ir-shadow-rows/box-pass-of-coalesce-out.vl`. Each fails under the merge-base seed (a verifier
failure, or the unlowered fallback) and matches under this branch's.

Writing the third row found D17039 (#9329): `.map` over a `null[]` list builds an invalid module.

MEASUREMENTS
