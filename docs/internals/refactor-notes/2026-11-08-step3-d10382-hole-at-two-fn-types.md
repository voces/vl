# Step 3's last row: a hole handed on at two function types (D10382)

`take(a)` passes its hole parameter to `run<U>(f: (x: U) => U, u: U)` at `i32` and at `string`.
`take(id)` used to be refused by the checker. It now prints `4`.

## What changed

| where | change |
| --- | --- |
| `check_fn_decl.vl` `solveUnannotParams` | a hole that flows into two different function types is left unsolved (`holeFlowsToTwoFns`). The call then binds it per call as `Fn#id` (#6893's binding). |
| `emit_mono.vl` `monoPinTyParamComposite` | `monoArgIsHeldGeneric`: an un-annotated parameter that the instance binds to a set of named generics takes the type the value arguments bind, as a bare generic name does. That gives `U`. |
| same | the elaboration's hand member (`elabCallHandMember`) is noted for a function-typed parameter too, not only for a hole parameter, so the bundle `a` hands the member at `(i32) => i32` and `(string) => string`. |

An earlier try made only the checker change. That moved the row to an emit reject
(`unsupported argument type for f`), so it was reverted. The emit half needed both mono arms
above. Neither one is in `monoArgTyNameCascade`.

## Measured

| instrument | base (fixpoint of master `0b10a9ff` + `b3df267c`) | candidate |
| --- | --- | --- |
| canonical sweep, 23,736 programs | | 1 output mover, D10382 `check_reject -> runs`. 0 runs -> not-runs, 0 new traps, 0 bytes-only movers |
| seed | 6,579,801 | 6,580,634 (+833) |

## Neighbours

- The concrete twin `take(inc)` is still refused, with the message it had on base. A fixture pins it.
- `take<A>(a: A)`, the annotated twin, refuses at emit on base and here. Filed as D15575.
- Handed on at one type and called directly at another: still a check reject. A direct call records
  no hole flow. Filed as D15576.
- A hole lambda `take((x) => x)` was refused on base with `argument 1: expected (string) => string`.
  It is now refused with `cannot infer a type for parameter x`. Both are check rejects, and no
  corpus cell carries it.

## Step 3

D10382 was the last item. Step 3 is done.
