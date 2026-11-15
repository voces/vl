# D16334, D16335: a call through a parameter bound to a declared hole function is that function's call, 2026-11-14

Lane K. Clause 1, two rows, one mechanism.

## Mechanism

`use(lap)`, with `use(k) { return k((a) => a * 10) }` and `lap(g) { return g(1) + 1 }`. The check
types the call from `use`'s body under the binding `k = lap's open signature` (`holeRetTyOf`).
The call `k((a) => a * 10)` is typed in `holeCallInstOf`, which binds a lambda argument through the
parameter type of the bound signature (`holeLamBind`). `lap`'s signature is `(_) => _`: its
parameter is a bare hole, not a function type, so the binding failed and the result stayed open.
An open result is assignable everywhere. D16335's `boolean` binding was check-clean and printed
`true`. D16334's map took `_` as its value type, and the bound read printed `null`. The direct call
`lap((a) => a * 10)` was always typed `i32`.

## Change (`check_relate_core.vl`, the hole-return path)

- **`holeDeclOfFnTy`:** names the declared function whose own open signature a bound type is.
  It uses the lone member of the type's function set (`fnTagMembers(fnTagSetOfTy(vt))`). Failing
  that, it uses the function whose own hole the first parameter names (`paramHoleName`). Either
  way the arity is checked (`holeDeclChecked`).
- **`holeDeclCallInst`:** types the call as that function's direct call. Each lambda argument
  is typed at the closed types every call of that parameter in the function's body passes. Then
  the function's body is typed at the closed arguments (`holeLamRetAt`).
- **One call-site walk.** That walk is `ftParamCallsAt`, split out of `ftParamOnlyCalledAt`:
  - it matches the callee by declaration (`identDeclOf`), so a shadowing binding is not counted;
  - it descends into nested lambdas and functions.
  - `ftParamOnlyCalledAt` (the fn-tag judge, which also requires every read to be a call) and
    `ftArgIsParam` move here from `check_fn_tag.vl`, which already imports this module.
  - `holeParamIndexOfCall` matches by declaration too.
- **Not folded:** `holeCallOfArg` finds the call holding a given argument node. It is not a walk
  over a parameter's calls, and no parent index exists to replace it.
- **A parameter that escapes is not refused here.** `ftParamOnlyCalledAt`'s reads-equal-calls
  rule would send such a call back to the open result, the clause-1 bug. A hand-on at another
  type is refused loud instead ([D16336](../inventory/D16336.md)).

The existing tagged-set path (`holeSetCallRetOf`) still answers a call through a set of two or
more members.

## Grading

Fixpoint seeds on both sides, `--before` master `4b94dbf0`.

- **The witnesses:** D16334 prints `11`. D16335's binding is refused with `cannot assign i32 to 's'
  of type boolean`. The `string` spelling was invalid wasm and is now refused the same way.
- **New `hole-call-through-declared-hole-fn.matrix.vl`:** `runs 68 of 68 graded · 6 owed
  refusals · 20 skipped · 0 silent`; 0 are lost against master.
  - Four WRONG cells (`bound_map` printed `null`, `bound_map_set` printed nothing) now run.
  - Two SILENT cells (built-in `map_value`, `map_set`, invalid wasm) now run.
  - Six emit refusals (`struct_field_init`, `array_element`, `record_field` ×2, `list_push` ×2)
    now run.
  - `wrong_annotation` and `nested_wrong_annotation`, both faces, move from `WRONG true` to the
    owed refusal.
  - `shadowed_param` moves from a check refusal to RUNS. The direct call's spelling runs too.
  - `nested_lambda_call`, `nested_fn_call` and `escaped_param` run on both sides.
- **Every `*hole*` matrix (184), fixpoint seeds both sides:** `runs -> not-runs 0` in each.
  `hole-lambda-arg-through-hole-callee` also gains `map_value`/`map_set` (SILENT to RUNS).
- **The other gates:** see the PR.
