# `monoInstanceFor`'s callers hand the pin's type (2026-11-07)

Step 3 of the pin-type-column lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4), first slice. Steps 1 and 2 ([2026-11-07-pin-type-column.md](2026-11-07-pin-type-column.md),
[2026-11-07-pin-key-reads-column.md](2026-11-07-pin-key-reads-column.md)) gave each pin its own type
and keyed the instance by it. `monoInstanceFor` still parses a pin's name with `nameToTy` when no
type reached it from the value, the destination or the delivery.

## What changed

`monoInstanceFor` takes a sixth argument, `pinTyCol`: the type each pin was spelled from, where the
caller holds it. The `nameToTy` fallback runs only where that column has no closed type. It does
not go through `deliveryTys`, because that column also sets the instance key's destination
(`instKeyDstSet`) and the tagged-set reading.

| caller | the column it hands |
|---|---|
| `monoCoerceFnValueTys` (new `tnameTy` argument) | the function type `tname` was spelled from, peeled of a nullable: the slot fact `ft` at the four list and stored-slot sites, `st`/`sst` at the closed-stamp sites, `t` in `monoHeldValueAt`, the annotation's type in `monoCoerceFnValue`, `expTy` in `monoCoerceFnValueName` |
| `monoCellLamTake` / `monoCellLamTakeAt` / `monoLamLitTakeTys` | the same, as `tnameTy` / `pinTys` (`monoDeliverLamLit` hands the lambda's elaborated `lt`, `monoListCbLamAt` its element type) |
| `monoNoteBindDeliveryCall` (both calls) | the elaborated instance's parameters, where the signature is spelled from them |
| `monoCoerceListCbArg`, `monoElemsAtSet`, `monoBundlePinArg`, `monoPinLamAtTys`, `monoCloCoerceBuild` | the types the pins are spelled from (`lt.aElem`, `rows[k]`, `f.fnParamTypes`, `tys`, `t`'s parameters) |

## Measured

A probe build that traps where the fallback resolves a pin, run over the sweep population (23,611
programs), with each trap's backtrace read off a `--names` seed:

| | programs reaching the parse |
|---|---|
| base | 246 |
| this change | 115 |

The 115 that remain hand only a spelling, never a type:

| caller (frame above `monoInstanceFor`, the one above it) | programs |
|---|---|
| `monoCellLamTakeAt` from `monoFnPinAt`, `monoWalk`, `monoPinWrittenLam`, `monoOpenCallAtElems`, `monoPinOpenCallLams`, `monoDeliverLamLit` | 62 |
| `monoCoerceFnValueTys` from `monoDeliverAtPinTys` (a `pin` string), `monoCoerceWrittenLetTys`, `monoWalk` | 39 |
| `monoHoleLamArgAgain` (the second take of a lambda literal) | 5 |
| `monoNoteBindDeliveryCall` (a signature from the destination's annotation) | 5 |
| `monoRenameInitAt`, a direct call from `monomorphize` | 4 |

Most of these spell the pin from the flow table's signature strings (`monoDeclPathPins`,
`monoSigFnTyName`) or from a destination annotation's text (`annFnDecompose`). To retire the
fallback, the flow table's pins need to carry types, so that each of those strings arrives with one.

Both seeds were built to a fixpoint (two `refresh-compiler.sh` runs, byte-identical): base
`claude/pin-type-column-2` with master `c631be4a` merged, candidate that tree with this change.

| | |
|---|---|
| sweep | 23,611 of 23,611 same (0 bytes-only, 0 output movers, 0 `runs → not-runs`) |
| seed | 6,478,397 → 6,478,954 bytes (+557) |
| pin-helper budget (`emit_mono.vl`) | 943 → 943 |
