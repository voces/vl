# A listed hole parameter's slot write and a hand to a generic callee keep the set tagged (2026-11-08)

Step 2, the listed-generic lane, after [the push](2026-11-08-listed-generic-fn-set.md) (#6871).
Base is #6871's head merged with master `c7d86903`; seeds are fixpoints on both sides.

## What changed

`elabListParamSource` keeps a list as its parameter's holder when every other read of the list is
one it can type with the parameter's set. It now takes two more reads:

* **A slot write of the parameter's reads** (`xs[i] = a`, `elabSlotWriteList`). The elaboration's
  handed-read walk takes the written read like a push (`elabMintHandedIn`). The tag plan needed no
  change, since an index store is neither a closure store nor a call through an element.
* **A positional hand to a generic callee's `T[]` parameter** (`use<T>(ys: T[])`), beside the
  un-annotated one. The instance binds `T` at the holder's element, the set.

## Measured

| | base | candidate |
| --- | --- | --- |
| D15567, `xs[0] = a` | emit reject | runs, `1` `5` |
| the same, handed `(x) => x` | emit reject (`monomorphize: unsupported argument type for a`) | runs, `1` `5` |
| push spelling, `use<T>(ys: T[])` | emit reject | runs, `2` `5` |
| D15154's old witness, `take<T>(a: T)` with `use<T>` | emit reject | runs, `1` `5` |
| D15010, `listed-hole-fn-escaping-list` | runs | runs |
| `generic-fn-listed-pushed-handed-hole-param`, un-annotated | 19 of 23 | 19 of 23 |
| `hole-lambda-listed-pushed-handed-hole-param`, un-annotated | 12 of 23 | 12 of 23 |
| `generic-fn-listed-slot-written-handed-hole-param` (new), un-annotated | 0 of 23 | 19 of 23 |
| `hole-lambda-listed-slot-written-handed-hole-param` (new), un-annotated | 0 of 23 | 12 of 23 |

All four matrices: 0 runs → not-runs, 0 silent. The new templates' non-runs are the same cells
as their pushed twins'.

## Witnesses moved

* D15567 closes. A slot write from a SECOND parameter (`take(a, b) { const xs = [a]; xs[0] = b }`)
  still refuses with the same `.length` literal. It is **D15568**, and it takes over the live-sites
  row, the emit-stage case of `vl_check_json_test.ts`, `INSTANCE_WITNESS`, and the witnesses of
  D1666, D15155, D15157 and D15483.
* `MONO_WITNESS` and D15154's witness (`take<T>(a: T)` handing its list to `use<T>`) run now. Both
  move to D14843's program, whose `monomorphize:` refusal is anchored at the call, line 10.

## Item 3 of the lane: a callee that calls the handed list's element

`use(ys) { print(ys[0](3)) }`, handed the list of `id` or of `(x) => x`, **runs on base and
candidate alike** (`3`, then `5`). The `called value is not a function (i32)` check reject that
#6871's note reported does not reproduce on its own spelling. Nothing is owed here.

## What stands

* D15568: a write from another parameter. One holder, two parameters' sets, and
  `elabListParamSource` keeps one parameter.
* The lambda handed to a generic callee (`take((x) => x)` with `use<T>(ys: T[])`) is a check
  reject on base and candidate alike: `cannot infer a type for parameter x`.
* D15011, D14843, the lambda `global_assign` cell, D15105, D15331 and the root lambdas whose hole
  takes a function value are unchanged. `monoHoleBinding` still has its one reader, so step 2 is
  not ended.
