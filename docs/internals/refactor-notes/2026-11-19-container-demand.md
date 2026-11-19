# One container demand for an un-annotated parameter (2026-11-19)

Family A of the map/set ablation: D16974 (a `Set` at `.has`) and D16977 (an `i32`-keyed map at
`c[1]`). Before this change, each use decided alone what the parameter was. `.has` minted a map
demand, which refused a Set. `c[1]` minted an array demand, which refused every map.

## The operation set
The body's uses record operations against the parameter's demand key (`noteCtnOp`,
check_hole_rows.vl). The rows ride `holeArrayDemand` under `!c<op>!<key>`, so they roll back with it.

| op | recorded at |
| --- | --- |
| `[i32]` | an i32 index on the hole (`checkIndexHole`) |
| `[key]` | a non-i32 key index on the hole |
| `get` `set` `has` `delete` `add` `keys` `values` | a map/set method on the hole (`holeMapMethod`) |
| `map` `filter` `push` `pop` | a list method on the hole (`holeArrMethod`) |

An `[i32]` and a list method also keep marking the parameter indexed, which the UFCS receiver
rung reads.

## The resolution table
`ctnRefusedOp(ops, at)` (check_demands.vl) asks the argument's kind (`ctnOpsTaken`):

| argument | takes |
| --- | --- |
| list | `[i32]`, `map`, `filter`, `push`, `pop` |
| string | `[i32]` |
| map | `[key]`, `get`, `set`, `has`, `delete`, `keys`, `values`; `[i32]` when the key is i32 or open |
| Set | `has`, `delete`, `add`, `keys`, `values` |
| union of lists/maps | what every member takes |
| type variable, error | everything (its own pin answers) |
| other scalar | nothing |
| any other type | the list row (its own index trap or the instance's check answers) |

The call (`callFtyHoleParamDemands`), the UFCS call and the function-value delivery each ask the
table first, refusing with one sentence: "expected <kinds>, got <type> — the body <use>". After
that comes the map demand's key/value pins (`holeMapDemandMet`), now asked of a Set under the set
flavour, and then the write demand. A type variable handed in takes the operations to its own call.

The instance's re-check then types the body at the argument. So the i32-keyed map that the deleted
refusal called "silently wrong" (`{[i32]: boolean}` printed as i32) now prints `true`
(`maps/infer-param-i32-index-list-or-map.vl`).

## Deleted
- `tyRefusesArrayDemand` (check_types.vl), the map clause included. The pin-row skip in
  check_demands.vl spells its two cases inline.
- `holeArgArrayErr`'s "ambiguous between an array and an i32-keyed map" arm. The function now
  speaks only for the write demand.
- `holeArgDemandErr`'s open-map "expected a map" arm, and `holeMapDemandOpen` (check_leaf_steps.vl),
  its only reader. The table refuses every argument that arm reached first.
- The hard-coded `noteArrayDemand` calls at the index and list-method sites, now `noteCtnOp`.

## Not in this change
D16975, a union of maps at `.has`/`a["k"]`. The table admits it member by member. The map
demand's delivery still refuses it, deliberately: past the call, the pin's re-check cannot lower a
union-of-maps read, because `lmMembers` declines under `monoRecheckDepth`. Admitting it lets
`const v = a; v.has("k")` pass `vl check` and fail emit. Closing it is the map analogue of
D16897's per-arm instance read.
