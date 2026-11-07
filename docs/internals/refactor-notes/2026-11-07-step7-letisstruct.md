# Step 7: `letIsStruct` deleted onto the binding's typed rep, 2026-11-07

`letIsStruct` was the last type-blind classifier `letInitCellKind` read
(`2026-11-07-step7-letinitcellkind.md`). It stood on D15543: 65 calls in which the binding held
a nullable record of a generic function value. The typed claim declined them, because the
function's own `T` read as an open type variable.

**The own-scheme query.** `tyVarsOwnScheme(ty, encl)` (`check_subst.vl`, #6724, merged) asks whether
every type variable in `ty` belongs to a function type, all of whose variables come from one
function that is not among `encl`, the functions enclosing the binding. `bindCellGo`'s guard
declines only when that fails. This PR widens which variables count as "one function's":

* a generic's own parameter (`tyVarOwner` names the declaration, which declares the name), in
  #6724;
* a hole of an un-annotated parameter (`?f.0`, `?f@12.0`);
* an operator hole whose owner is such a parameter hole (`?binop.+.340.?inc0.0`, owned by
  `?inc0.0`), which is the return type of `function inc0(a) { return a + 1 }`.

Under an own scheme the claim takes the row the initializer builds (`holderRecordRow`, else
`structIndexOfLet`) and claims only a record kind. `repSlotOfKind` on the type would pick
`{f:(i32)=>i32}` against a delivered `{f:i32}`, which is D15298 as invalid wasm.

**Re-shadow.** The shadow is the batch-1 one: at each `letIsStruct` call, the old answer
against `letBindRepKind` being `struct` or `variant`, counted per let through
`clsCensusEnter`, over the census population.

| compiler | calls that disagree | programs | class |
| --- | --- | --- | --- |
| before (#6714) | 65 | — | nullable record of a generic fn (D15543) |
| #6724 (generic parameters) | 15 | 9 | the same, over hole functions |
| + parameter holes | 11 | 7 | operator-hole return (`a + 1`) |
| + operator holes (this PR) | 1 | 1 | D15194, refused at emit on both seeds |

Every disagreement had the old answer `struct` and the typed one `nulstruct`. The one that
remains is D15194 (`ref valtype with no interned shape`), which is a loud emit reject on base
and candidate alike. That is a refused program that stays loud, so it falls under the standing
ruling. D15339 left the shadow at the parameter-hole step, and it is refused the same way on
both seeds.

**Deleted.** `letIsStruct` is gone. `letInitCellKind` reads `bk == "struct" || bk == "variant"`
off the binding rep it already computed. The captured-slot index reads the same off
`letBindRepKind`, and `emit_closure_sites.vl`'s return arm reads it through
`retLetHoldsRecord`.

**Proof.** Seeds are fixpoints (two refreshes, byte-identical). Base is master `fa202cbb`,
which has #6724 in it.

| seed | bytes | sweep vs base: same, output movers, bytes-only, runs lost, new traps |
| --- | --- | --- |
| base | 6,473,613 | — |
| this PR | 6,475,579 | 23,606, 0, 7, 0, 0 |

The seven bytes-only movers are the hole-function face of D15543's class, now held in the
`nulstruct` cell with the same output: D12340, D9183, `d15221_get_dbl`/`getb_dbl`/`rebget_dbl`,
`hole-fn-inline-list-record-stored.vl` and `map-of-records-beside-list-of-same-record.vl`.
