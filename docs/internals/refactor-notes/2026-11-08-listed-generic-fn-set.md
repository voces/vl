# A named generic held in a list its parameter fills is a tagged set (2026-11-08)

Step 2, the listed-generic lane. Master `7924d36d`; seeds are fixpoints on both sides.

## What changed

`take(a) { const xs = [a]; xs.push(a); use(xs); xs[0]("abc"); xs[1](2) }; take(id)` refused at
emit (D15529). Two facts were missing, and the checker's tag decision never ran for `{id}`:

* `elabListParamSource` (moved to `check_elab_cap.vl`, where the tag decision can read it) took
  `xs` as `a`'s holder only when every read was an element called in place. It now also takes a
  push of `a`'s reads and a positional hand to a named function's un-annotated parameter.
* With the push accepted, the tag plan for `{id}` still declined at three places, each of
  which read the push as something it is not:
  * `ftParamStored`: a closure store into a holder whose rep an instance types. A push onto
    such a list writes the literal's slot, which the plan types with the set.
  * `ftChainCallsComplete`: a call through `xs` with no fact. `xs.push` is a slot write.
  * the elaboration's handed-read walk: a partial delivery (`mintSetPartialNote`), which made
    the late decision decline. It is `elabPushOntoParamList`, like the list literal itself.

Once tagged, the instance binds `a` to the set (`elabCallParamBoundTy`), mono pins the parameter
at the set's i32 id through `monoPinHoleParam`'s set arm, `use` takes the list at its holder's
type, and each call through `xs[i]` is a direct call of `id` at its own arguments. Lambdas take the
same path: `take((x) => x)` with the push runs too, so the B2 bundle-record row is not needed for
a hole lambda the parameter lists.

## Measured

| | base | candidate |
| --- | --- | --- |
| D15529 / D1666 / D15483 witness (the push spelling) | emit reject | runs, `2` `5` |
| D15010, `listed-hole-fn-escaping-list` | runs | runs (bytes move: the tag path, not the chain gate) |
| `generic-fn-listed-pushed-handed-hole-param` un-annotated | 0 of 23 run | 19 of 23 |
| `hole-lambda-listed-pushed-handed-hole-param` un-annotated | 0 of 23 run | 12 of 23 |
| sweep, 23,707 programs | | 3 output movers (the three witnesses), 2 bytes-only, 0 runs → not-runs |

Both templates' annotated faces refuse at check by design (no function type is called at two
types). The four generic un-annotated cells left are check refuses where the position fixes `v`
at `i32` (`return_annotated`, `struct_field_assign`, `array_element_assign`, `array_push`). The
lambda's eleven are `cannot infer a type` check refuses where the position holds the lambda
un-called (struct, list, map, return), plus `global_assign`, which still refuses at emit
(`unsupported argument type for a`).

## What stands

* The slot-write spelling `xs[0] = a` is D15567, now the live-sites witness. An index store
  is not yet a holder read `elabListParamSource` takes.
* A hand whole to a generic function (`use<T>(ys: T[])`) still refuses: only an un-annotated
  parameter is taken.
* A callee that calls the handed list's element (`use(ys) { ys[0](3) }`) is a check reject
  (`called value is not a function (i32)`) on base and candidate alike.
* D15011 (the parameter re-pointed after the build) and D14843 (the loop-handed twin) are
  unchanged.
