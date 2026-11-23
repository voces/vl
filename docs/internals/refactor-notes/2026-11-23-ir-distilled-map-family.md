# IR: the distilled corpus's map family — a nullable-boolean print, i64 keys, delete, a walk's pair, 2026-11-23

Lane IR-N6. The coordinator's brief: the distilled corpus had fallen behind tests/cases. This lane
takes its map family as one batch.

## The rows, by what the census names and what ablation found

| census row (distilled, master f3f248cd) | functions | what it is | taken here |
| --- | ---: | --- | --- |
| `print nulBool` | 11 | the IR's print has no `boolean \| null` arm | yes |
| `map key i64` | 10 | `mapKeyArmOf`'s i64 arm: the key at its own width | yes |
| `method delete` | 10 (exposed) | the IR has no map delete | yes |
| `for in pair` | 13 (exposed) | a walk's second name | yes, at an i32 or a string |
| `map get rep` | 20 | the hole instance types the read `boolean`/`AB`, and the map holds `\| null` | no: see below |
| `map read default rep` | 12 | a `{r: null}` default and slot, two record reps, neither with a heap | no: IR-M1 |

`map get rep` was prototyped in a scratch tree: the read held at the map's niche rep
(`mapReadNicheTy`). It cleared all 20 cells, 210 functions covered = verified = matched. But the
same functions then stopped one step later, in the `??` lowering: 10 at `box ladder`
(`holeBoxPlanOf`'s "ladder", which the IR has no plan for) and 10 at `union if arm rep`. Alone it
adds 0, so it stays out.

## The changes, one commit each

1. **print nulBool.** `emitPrintNulBool` is now `printNulBoolOpen`, the operand, and then
   `printNulBoolTail`. The IR lowers its operand between the two. It refuses a valued `if` below
   the opened blocks, as `nulStr` does.
2. **i64 keys.** `mapKeyAt` delivers the key at `repNodeOfTy(TY_I64)` under the i64 arm, as
   `emitScalarValue(key, "i64")` widens it. This covers get, get-or, has and set.
3. **map delete.** A new `RMapDelete`, keyed as `RMapHas` is. `emitMapDelete` is now
   `emitMapRecvKey` followed by the shared `mapDeleteTail`. A statement builds the value and drops
   it, as legacy does.
4. **a walk's pair.** `SForIn.xfVar2` holds the second name's variable, at `forInBindTy`'s rep (an
   i32 or a string only), in legacy's `pSlot`. Legacy's index-counter init is `forInPairInit`,
   shared by both writers. The rolled helpers already bind and step the pair. The 9 distilled
   pairs left over bind a map value at another rep: nullable 6, record 3, atom, list or map 1 each.

## Readings (base: a master f3f248cd fixpoint; fixpoint seeds on both sides)

| class, any (distilled / tests/cases) | base | this change |
| --- | ---: | ---: |
| `print nulBool` | 11 / 28 | 2 / 2 |
| `map key` | 10 / 20 | 0 / 4 |
| `method delete` | 10 / 39 | 0 / 0 |
| `for in pair` | 13 / 27 | 9 / 5 |

| reading | base | this change |
| --- | ---: | ---: |
| distilled-corpus functions with no blocker | 45,373 | 45,396 |
| tests/cases functions with no blocker | 71,527 | 71,594 |

Per mechanism, distilled / tests/cases no-blocker: print +9 / +24, i64 key +8 / +11, delete +4 / +22,
pair +2 / +10.

Legacy lines deleted: 0. Moved to `@ir`: 0.
