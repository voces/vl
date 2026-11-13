# Step 7 L2, mono: tagged records and literal pins read their rows by type (2026-11-13)

Lane D. Base `537a04cc`. Closes D16020 and D16040; files D16021.

## Cut

The coordinator proposed one deep stored-type entry point. The probes showed the two rows need
different keys, so there is none, and `monoTagMapRepTy`'s reach is unchanged:
- D16020's literal row is keyed at the stored form: `{xs: i32[]}`.
- D16040's element row is keyed at the tagged type, which prints like the checker type but is
  a different arena type.

1. **Literal side (D16020).** `structIndexOfObjCtxGo` gets a rung after the adopted rep: the
   row of `tagRepTyFn(adopted)`. Unarmed, the literal reached that row through
   `structIndexOfTy`'s spelling, which an opaque label cannot spell. Armed, it fell through to
   the hole-typed mint row.
2. **Parameter side (D16020).** `synthTypeRefFb` keeps the literal's type for an `#anonN` pin
   in `anonPinLitTy`. The node's checker type stays the `{}` placeholder: recording the
   literal's type there makes `paramValtypeFloor` refuse a pin whose literal type holds a type
   variable. The table is cleared in `emitProgramReset`, which runs before any pass that
   synthesizes a pin. `retStructRowIndex` reads the anonymous row at that type (`sAnonRowByTy`). The
   label is read only where no literal type is held, which is D16021.
3. **Ref-list element (D16040).** `rlElemStructRowOfName`'s `structIndexByName(nonNulBaseOf(nm))`
   becomes `rowOfTyUpToFnSets`: the first declared or shape row whose recorded type is `tySame`
   to the element's type.

4. **`nonNulBaseOf` is deleted** (`emit_map_value_slots.vl`). Its only caller was D16040's name
   lookup. It held the emitter's last type-string parse, so the render-parse census reads
   **0 type-string parses** (was 1) and 8 `tyToEmitName` calls, and the baseline is lowered.

## Decision tables

All are `MPROBE` builds over the 24,070-record population, unarmed.

| rung | programs | decisions | agreement with the rung it replaces |
| --- | --- | --- | --- |
| literal stored-type rung | 1 (plus the witness) | 2 | same as `structIndexOfTy` |
| `rowOfTyUpToFnSets` | 6 (plus the witness) | 14 | same as the name lookup, 6 of 6 |
| `#anonN` identity rung | 9 | 102 | same row as the label, 9 of 9 |
| label, no literal type held, agrees with the typed ladder | 237 | 2,074 | n/a |
| label, no literal type held, disagrees (D16021) | 1 | 4 | n/a |

## Byte comparison

Master vs PR over every program that reaches any changed rung, plus the witnesses: **257 of 257
SAME**.

## Armed (`VL_OPAQUE_SNAMES=1`)

| program | master | PR |
| --- | --- | --- |
| D16020 witness and its inline spelling | emit error | runs `4 4` |
| `d15296_bound_returned.vl` | invalid module | runs `5` |
| the 9 programs formerly needing the label, D16040's list | run | run, same output |
| `union-of-records-arm-holding-type-param-built-at-instance.vl` | exit 70 | exit 70 |

## Not done

D16021 is a pin forwarded through a second instance (`fwd(o: G) { show(o) }`). It pins at the
outer pin's placeholder type, so the label is still read there. Closing it means carrying the
literal type through `monoInstantiate`'s argument pins.
