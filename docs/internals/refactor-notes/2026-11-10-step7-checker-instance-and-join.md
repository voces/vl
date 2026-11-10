# Step 7: two checker facts, a copy's instance and a call at its callee's published return, 2026-11-10

This round starts from master `ce2f9fbb` and covers groups 5 and 9 of
`2026-11-09-step7-classifiers-remaining.md`. Under DECISIONS.md §"How step 7's classifier half
finishes", both are CHECKER facts. The method is round 26's: a scratch compiler wraps the
classifier and prints `SH` rows under `$VL_CLS_CENSUS=1`, and `classifier-census.vl --keep` runs it
over the 23,816-program sweep population. Every count below is a number of calls.

## Group 5: the copy's read is the adapter's instance

D9130's and D3868's witnesses ran verbatim on master before any change. They print `3` and
`aaa`/`12`/`12`.

**Where the fact was missing.** `moduleCopySigKey` takes 7 calls in 4 files: D9130's witness,
`alias-of-written-let-handed-to-generic-fn-param.vl`, `fn-choice-bound-as-callback.vl` and
`fn-choice-bound-at-two-types.vl`. Every call is inside a `__lambda_N`, the function-value
adapter `fvaAdapt` (check_assignable.vl) builds at a delivery like `app(g, [1, 2, 3])`. That
adapter is `($fp0: i32[]): i32 => g($fp0)`. The checker recorded the callee read `g` at the copied
binding's open type, `(T[]) => T`, which keys no `$fnsig`, so the classifier chased the copy chain
to a lambda.

**The fact.** After the adapter is checked, a callee read that is a stable `let`/`const` and was
recorded at a type holding a type variable is re-recorded at the adapter's own closed type
(`fvaCopyCalleeAtInstance`). A named generic keeps its open read, because its call instantiates
it.

**Shadow.** The caller's final key (`calleeCloSigKeyOfRead`) was compared at every module-copy
callee read inside a function, before the change against after it:

| | reads | same key | changed |
| --- | --- | --- | --- |
| module-copy callee reads | 37 | 33 | 4 |

All 4 changes move toward the instance. `g` in `app(g, ["a", "b"])` goes from `a>i` to `A>S`.
The legacy key is wrong there, and the program ran anyway because the call dispatches a tagged
set. `h9` (twice) and `h7` go from `""` to `i>i` and `S>S`. After the change `moduleCopySigKey`
takes **0 calls**, so it is deleted together with its rung and `COPY_CHAIN_MAX`.

## Group 9: a call recorded before its callee's return is published

**Why round 21's try still read `<error>`.** There are two cases.

* In the direct self-call, `ret(q, d, n - 1)` comes before the base case. `checkCallOnFuncTy`
  types it `TY_ERR` because `inferObserved` is still -1.
* In the mutual pair (`ma` → `mb` → `ma`), the call is not `-2` at all. When the recording pass
  checks `ma`, `mb`'s hoisted return is the `TY_ERR` its cycle break left. Only after that does
  `mb`'s own recording check publish `i32 | f64`. A re-record keyed on `-2` self-calls cannot
  see this case.

**The fact.** The recording pass (not quiet) notes each call of a declaration whose return is `-2`,
or `TY_ERR` on an un-annotated function, beside the declaration's index (`selfCallPendIx`/`Fn`).
`inferRetPublish` re-records the noted calls of that declaration at the published return
(`selfCallsRecordAt`). The scope is non-generic callees, whose call result is the return itself.

**Shadow** (`exprUnionCall` against `nodeRepIs(·, "union")`):

| tree | agree | disagree |
| --- | --- | --- |
| round 21 | 170,462 | 9, in 2 programs |
| this PR | 171,422 | 4, in 1 program |

`recursive-fn-joins-runtime-numbers-apart.vl` agrees everywhere: 30 of 30 calls, including
`ma`'s call of `mb`.

**The gap that stands.** `numeric-join-held-back-through-a-wrapper.vl` holds `lit(0, z, z)` and
`lit(2, z, z)` over `lit<i64, i64>`. The template's return is `A | B | i32`. The substituted
call's re-join (`substRejoinApart`) lets the literal arm `5` adopt `i64`, so the call is recorded
`i64`. The instance joins the arm apart and returns the `i64 | i32` box. The fact this needs is
the call's result at its instance's join (`elabKeySig` of the call's key). That is a change to how
a generic call's substituted return is re-joined, not a re-record after a publish, and it is not
made here. `exprUnionCall` therefore stays probed.

## Census

| tree | probed | post-only |
| --- | --- | --- |
| master `ce2f9fbb` | 42 | 42 |
| this PR | 41 | 41 |

## Proof

* fixpoint seed, 6,598,040 bytes (master 6,597,037)
* `seed-size --check` +0.1%
* `late-demands --check` 6, baseline 6
* `check-filed-witnesses --strict` 4,679 as filed
* `cases_wasm` shards 7,389 passed, 0 failed
* lint-self clean
