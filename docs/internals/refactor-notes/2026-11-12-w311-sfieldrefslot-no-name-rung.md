# Step 7: `sFieldRefSlot` reads no element name, 2026-11-12

Closing census 5's failing column still listed `sFieldRefSlot` (`emit_shape_rows.vl`). For a
struct's ref-list field that recorded no element type (`ty < 0`), it resolved the field's stored
element NAME (`fieldElemTyIxOfName`) and minted that type's row.

## Measured

Validated `emitFail` probes over the sweep population (24,196 programs):

| probe | programs |
| --- | --- |
| control: `ty < 0` reached | 1 (`tests/cases/generics/generic-record-of-list-param-list-return.vl`, element name `""`) |
| the name resolves to a type, so the name rung would mint | 0 |

The one program that reaches the branch has an empty element name. It resolved to nothing then,
and the answer was -1. A loud floor there would cost that program (cut 5,
`2026-11-12-w311-reflist-cut5-open-template-field-by-type.md`), so the branch answers -1 directly
and reads no name.

**Contract:** a field that recorded no element type has no row.

The open-type arm's `rlOpenRowMint(ty, sFieldElemNameAt(si, fi))` passes the name only as the
new row's label; `ty` keys it.

## Proof

Fixpoint seeds over the whole population: all 24,196 the same against master. `scripts/gate.sh`
passes.
