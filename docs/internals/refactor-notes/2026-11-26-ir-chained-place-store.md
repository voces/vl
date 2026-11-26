# A store whose value is another field or element store is built (lane CENSUS, 2026-11-26)

**Mechanism.** `a.f = b[i] = v`: a store whose right side is itself a field or element write used
as a value. The builder skipped every such store up front (`store of a field or element write`).
A field or element write already builds as a value (`print(m[k] = 9)` claims), and the outer store
built from it lowers to legacy's bytes, so that skip now covers only a map entry write as the value
(`store of a map entry write`, `writesMapEntryValue`): built, that one mismatches legacy's bytes in a
function body and lands out of order at top level.

A map entry store whose value is a store refused the store (`map store value store`), its receiver
and key read at their use above the IR's statement. They are now staged below it as below a valued
`if` (`mapSetStageLeads`, through `irBStageLeads`).

**Reading** (census probe on master's fixpoint seed; regen-11 — 2 units):

| unit | before | after |
|---|---|---|
| `element-or-field-write-value-in-any-position.vl` `@start` | `store of a field or element write` | claimed, byte-matched |
| `map-entry-write-value.vl` `@start` | `store of a field or element write` | verifier: "an assignment's unwidening is not its operand's narrowing to its result" |

The second now reaches the store of a record into a `P`-valued map used as a value
(`(mp[fk] = { v: 4 }).v`), which master's verifier refuses on its own; the guards masked it. Each
program prints what master's seed prints.

New case `tests/cases/expressions/chained-place-store-positions.vl`: element into field, field into
element, `f64` and `string` places, a three-place chain in a function body, and map entries from an
element and from a field store; every unit claimed and byte-matched, and the program runs under
`VL_IR_REQUIRE_CLAIM=1`.
