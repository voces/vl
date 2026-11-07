# The rep facts behind mono's remaining guards (2026-11-07)

Measured on master `b055cc92` (#6716), 4-core box. Each guard of #6711 was removed in a scratch
compiler (`monoPinReturnedObj` takes `elabHeldValTy` always; `monoRetFnListTy` drops the
generic-instance and identity tests), each witness was built `--no-validate --names` and
disassembled, and the build site's types were read with a scratch `emitFail` probe. #6716's
"no token" class was read off the column shadow (`fnColShadowArm(2)`) over the D15203, D15207
and D15293 named cells. Nothing here is landed.

## What the elaboration has, and what the emitter builds

| class | witness | type at the build site (own / held) | rep the emitter builds | guard off |
|---|---|---|---|---|
| (a) field reads a function | `d15221_opt_dbl` | `{s: {f: (_) => _}}` / `{s: {f: (i32) => i32}}` | `s.f` = `dbl` as a direct index (`struct {i32}`, `i32.const 13`); `r.f` = `inc0` (uncalled) as a closure (`struct {ref $closure}`) | outer row closes both fields to the closure row, inner literal still `struct {i32}`: invalid wasm in `mk` |
| (a) field reads an open binding | `hole-fn-map-record-returned` | `{m: {[string]: (_) => _}}` / `{m: {[string]: (i32) => i32}}` | `hm`'s map row, chosen at `const hm = Map()` | `expected (ref $closed-map), found (ref $hm-map)` in `mk` |
| (b) literals in a generic instance | `d15293_called` (D15296) | `{fs: ((_) => _)[], x: T}[]` / `{fs: ((i32) => i32)[], x: i32}[]` | `[inc0]` as an `i32` list of direct indices; the record's `fs` field resolves to a wrong list row | invalid wasm in `mk` (was a loud emit reject) |
| (b) same, two instances | `d15293_called_two` | as above, at `i32` and `string` | `[inc0]` as a list of closures at both instances | **runs**, `5 s 3` |
| (c) closed only by identity | `lambda-list-join-type-param-pin` | `T[]` / `string[]` = identity | lambda in `k<T>`: `[t]` beside `[1]` | `k(2.5)` alone runs; `k("s"); k(2.5)` is invalid wasm in the second instance's lambda (`expected i32, found f64`) |
| (d) result has no token | `d15207_bound_twin`, `d15207_generic_ret`, `d15203_run_uncalled_local_returned` | recorded `{fs: ((_) => _)[]}[]` | `[inc0]` with `inc0` never called | the reader declines; `repSigRetTokOfTy` of `(_) => _` is `""` |

Delivering the functions at the closed type as well (`monoDeliverLitAt` on the record after
`monoRecordObjLitAt`) does not move (a): the inner literal is still `struct.new $direct-row`,
and the consumer still reads `mk().s.f` into an `i32` local and calls `$dbl` statically.

## The rule each class needs

- **(a), (b), (d): one fact.** A slot (record field, list element, map value) holding an
  un-annotated function has a rep the emitter chooses per VALUE — a direct function index where a
  static call reaches it through the slot, a closure (the uncalled stub) otherwise — and neither
  `(_) => _` nor its closed `(i32) => i32` says which. The two agree only if the rep of a
  function-holding slot is a function of something both sides read. That is not a build-site
  rule: the inner literal, the map binding and every consumer read decide it independently.
- **(c): a recording key.** A lambda literal in a generic body is shared by the instances, and a
  type recorded on its nodes at one instance is read by the next. Agreement needs the record
  keyed by instance (as `elabNodeRepAt` keys a named function's instance copy), not by node.

## Design question (a/b/d): which rep owns a function-holding slot

1. **The closed type owns it: always a closure.** Each write converts a named function to its
   closure at the slot (the conversion list literals already do: `d15221_optc_dbl`,
   `d15293_called_two`), and each read through the slot calls through the closure. Costs: an
   indirect call where a static one runs today, a retype of every consumer read whose root is a
   call (`mk().s.f(3)` has no binding to retype), and the `Map()` binding's row chosen after its
   uses. Removes all three guards and #6716's no-token class.
2. **The fact owns it: record the rep beside the type.** The elaboration records, per slot, the
   known function (a direct index) or "closure", and the row registry keys a function-typed
   field by it. Keeps static dispatch; the closed type gains a rep distinction it does not have,
   and every row lookup by shape (`repStructRowByShape`) must compare it.

Neither is priced yet. The measurement that prices them is a sweep of option 1's scratch
compiler (count the static calls that become indirect, and the `runs` it buys), since option 2's
cost is in the registry, not the output.

## Parked

No PR changes a guard. The (b) guard cannot be narrowed to "two instances": the one-instance
twin turns a loud emit reject into invalid wasm, which is clause 2 to clause 1.
