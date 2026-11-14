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

- **`holeDeclOfFnTy`:** names the declared function whose own open signature a bound type is, from
  the hole its first parameter names (`paramHoleName`), with the arity checked.
- **`holeDeclCallInst`:** types the call as that function's direct call. Each lambda argument is
  typed at the closed types the function's body calls that parameter at (`holeParamCalledAt`,
  every call agreeing). Then the function's body is typed at the closed arguments
  (`holeLamRetAt`).

The existing tagged-set path (`holeSetCallRetOf`) still answers a call through a set of two or
more members.

## Grading

Fixpoint seeds on both sides, `--before` master `4b94dbf0`.

- **The witnesses:** D16334 prints `11`. D16335's binding is refused with `cannot assign i32 to 's'
  of type boolean`. The `string` spelling was invalid wasm and is now refused the same way.
- **New `hole-call-through-declared-hole-fn.matrix.vl`:** `runs 60 of 60 graded · 2 owed
  refusals · 20 skipped · 0 silent`; 14 cells move and 0 are lost.
  - Four WRONG cells (`bound_map` printed `null`, `bound_map_set` printed nothing) now run.
  - Two SILENT cells (built-in `map_value`, `map_set`, invalid wasm) now run.
  - Six emit refusals (`struct_field_init`, `array_element`, `record_field` ×2, `list_push` ×2)
    now run.
  - `wrong_annotation`, both faces, moves from `WRONG true` to the owed refusal.
- **Every `*hole*` matrix (184), fixpoint seeds both sides:** `runs -> not-runs 0` in each.
  `hole-lambda-arg-through-hole-callee` also gains `map_value`/`map_set` (SILENT to RUNS).
- **The other gates:** see the PR.
