# Step 7: the `repSlotOfTy` callers move to the structural struct row

Measured 2026-11-09 on a 4-core box, over master `4b938caf`. The sweep population is 23,806
programs. Every seed is a fixpoint (two `refresh-compiler.sh` runs byte-identical). This follows
[2026-11-09-step7-struct-row-one](2026-11-09-step7-struct-row-one.md), which ruled the structural
reader (`repStructRowOfTy`, `repSlotOfKind("struct", ·)`) canonical.

## What moved

Twelve of the fifteen callers, in three batches, each its own commit and sweep:

| batch | sites | sweep vs base |
| --- | --- | --- |
| 1, annotation rows | `emit_nullable_rets.vl`: `retNulRefIndex`, `retStructRowIndex`, `retStructIndex`, `monoRetRowName` | 23,806 same, 0 bytes-only, 0 movers |
| 2, ownership guards | `emit_shape_rows.vl`, `emit_shape_intern.vl`, `emit_sig_tokens.vl`, `emit_union_atoms.vl` | 23,806 same, 0 bytes-only, 0 movers |
| 3, value reads | `emit_sig_tokens.vl` (3), `emit_shape_rows.vl` `rowFieldStoresAtom` | 23,806 same, 0 bytes-only, 0 movers |

`repStructRowOfTy` moved from `emit_rep_slot.vl` into `emit_shape_rows.vl`, the module that owns
its rungs, so the rows module can ask it without an import cycle. `emit_rep_slot.vl` imports it.

The ownership guards asked `repSlotOfTy(t) != si`. They now ask `repStructRowIsOrTwin(t, si)`:
whether row `si` is the structural row of `t` or a layout twin of it. Every one of them also
refuses a row with a twin right after, so the twin case answers as before.

`retStructIndex` asks the structural row only when the type is not a union arm
(`repTyIsVariant`), so an arm keeps its variant index from the name scan.

## A synthesized `#anonN` TypeRef records the wrong type

The first cut of batch 1 put the structural row before the name scan in `retStructRowIndex`. It
moved 20 programs `runs → compiler_trap` (the module failed to validate), all records with
function fields. A probe at that reader printed, for
`tests/cases/closures/fn-record-field-list-read-by-param.vl`:

```
#anon0 ann={} namedRowTy={xs: ((_) => _)[]} twin=0
```

The synthesized TypeRef `#anon0` names the literal's row, but its recorded type
(`nodeRepTyIxOf`) is the empty record `{}`. The structural reader answers the `{}` row for `{}`,
which is right for the type it was asked. The node's recorded type is the stale fact. So the fix
is at the node-side readers, which ask a TypeRef's name before its type. It cannot live in the
type reader, which has no node.

It is not reachable from master. A probe in the reader's shape rung, firing when another row of
the same type had a different layout, moved none of the 23,806 programs. The nominal reader
declined `{}`, so master's node-side readers fell through to the name.

## What still reads `repSlotOfTy`

Three sites. Each asks a nominal question or cannot reach the structural reader:

| site | why it stays |
| --- | --- |
| `emit_shape_rows.vl` `variantStructHeapTwinAt` | Asks for the declared row of an arm's record. On the structural reader, the compiler built from the new source emits an invalid module for the compiler (`mkBool`: type index out of bounds). The L1 build passes, so only an L2 build shows it. |
| `emit_mv_slots.vl` `armLayoutContestedAt` | Asks whether a declared row claims an arm. `emit_mv_slots` is below `emit_shape_rows`, so it cannot import the structural reader. |
| `emit_rep.vl` `repSlotOfElemTy` | A key builder: a -1 keys a record by its fields, so a swap moves rep keys. It is also below `emit_shape_rows`. |

`repSlotOfTy` stays while these three read it.

## Proof

| check | base | this branch |
| --- | --- | --- |
| fixpoint seed | 6,588,061 | 6,588,222 (+161) |
| sweep, 23,806 programs | | 23,806 same, 0 bytes-only, 0 output movers |
| `rep-fuzz-check.sh` | | exact, 0 baselined failures |
| `late-demands.vl --check` | 6 | 6 |
| `check-filed-witnesses.vl --strict`, both inventories | | 4,675 graded, 4,675 as filed |
