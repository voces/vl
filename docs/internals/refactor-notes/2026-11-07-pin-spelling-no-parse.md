# No pin spelling is parsed back into a type (2026-11-07)

Step 3 of the pin-type-column lane ([architecture-target-2026-10.md](../architecture-target-2026-10.md)
§3.4), second slice. Slice 1 ([2026-11-07-pin-type-column-callers.md](2026-11-07-pin-type-column-callers.md))
left 115 programs where `monoInstanceFor` resolved a pin with `nameToTy(pinnedNames[j])`, because
the caller held only a spelling. Under the naming rule a pin that carries a spelling carries its
type beside it, so every one of those callers now hands the type, and the fallback is deleted.

## What changed

| source of the spelling | the type it now hands beside it |
|---|---|
| the flow table's pins (`monoDeclPathKeys`/`monoDeclPathKeysIn`) | a new `fts` out-list: the delivery function type each pin was spelled from |
| `monoSlotPinNameTys`, `monoPlacePinNameTys`, `monoCellPinNameTys` | a new `ft` out-list carrying that delivery type |
| `monoDeliverAtPin(Tys)`, `monoBindingAtPin`, `monoRenameInitAt` | `pinTy` / `targetTy`, the slot's delivery type |
| `monoLamLitTake`, `monoPinWrittenLam`, `monoCoerceNamedGenericTys`, `monoCoerceWrittenLetTys`, `monoCoerceAliasOfWrittenLet`, `monoCoerceChoiceBinding` | the type their `ann`/`tname` was spelled from (`bt`, `ft`, `t`, the elaborated key `kst`, `ept`) |
| `monoNoteBindDeliveryAt/Call`, `monoDeliverLamLit`, `monoHoleLamArgAgain`, `monoDeliverCallAt/Rets`, `monoNoteRetDeliveriesAt`, `monoElabLamArg` | `annTy`: the annotation node's `tyIx`, or the slot's or stamp's type |
| `monoCbFnListRowSpell` | a `rowTy` out-list: the row's element type |
| `monoCoerceFnValue`, the `=` arm of `monoWalk` | the annotation's type substituted in the instance (`monoPinSubTyOf`), so a slot typed by `T` closes |

`monoInstanceFor` reads the value's recorded type, the destination's, the delivery's, then
`pinTyCol`, and nothing else. No function was added to `emit_mono.vl`.

## Measured

Probe method as in slice 1: a build whose fallback traps where it would resolve a pin, a `--names`
seed for the backtrace, over the sweep population (23,613 programs). 12 programs trap at base for
unrelated reasons; they are subtracted.

| | programs reaching the parse |
|---|---|
| base (slice 1 merged) | 115 |
| flow-table types threaded | 26 |
| delivery annotations threaded | 2 |
| instance-substituted annotation | 0 |

At each step the probe sweep also showed 0 movers among the programs that did not trap.

Both seeds were built to a fixpoint (two `refresh-compiler.sh` runs, byte-identical): base
`claude/pin-type-column-3` with master `dea6eb8b` merged, candidate that tree with this change.

| | |
|---|---|
| sweep | 23,613 of 23,613 same (0 bytes-only, 0 output movers, 0 `runs → not-runs`) |
| seed | 6,483,777 → 6,485,865 bytes (+2,088) |
| pin-helper budget (`emit_mono.vl`) | 931 → 931 |

## Still parsed elsewhere

`nameToTy` of a pin's text still runs outside `monoInstanceFor`: `monoPinNamesTy`, the widened
result in `monoInstanceFor` (`monoInstanceRetName`), `monoDeliverCallRets`'s `at2`, and the choice
binding's key (`monoCoerceChoiceBinding`, its call-site twin). Those are item 3 of the lane.
