# IR: the distilled corpus's map family — a nullable-boolean print, i64 keys, delete, a walk's pair, a niche map read, 2026-11-23

Lane IR-N6. The coordinator's brief: the distilled corpus had fallen behind tests/cases. This lane
takes its map family as one batch.

## The rows, by what the census names and what ablation found

| census row (distilled, master) | functions | what it is | taken here |
| --- | ---: | --- | --- |
| `print nulBool` | 11 | the IR's print has no `boolean \| null` arm | yes |
| `map key i64` | 10 | `mapKeyArmOf`'s i64 arm: the key at its own width | yes |
| `method delete` | 10 (exposed) | the IR has no map delete | yes |
| `for in pair` | 13 (exposed) | a walk's second name | yes, at an i32 or a string |
| `map get rep` | 20 | the hole instance types the read `boolean`/`AB`, and the map holds `\| null` | 17, at `boolean \| null`; next stop named below |
| `map read default rep` | 12 | a record type with no struct row (`{r: null}`), stored in another row | no: its own follow-up |

`map get rep`'s next stops: 10 functions at `box ladder` (`holeBoxPlanOf`'s "ladder", which the IR
has no plan for; IR-N9 placed it in IR-N2's coalesce family) and 10 at `union if arm rep` (chained
`a ?? b ?? c`, IR-N2's). The 3 left at `map get rep` hold a `K | null` atom value: a niche read of
one fed a following `?? "s"` a bare-atom decode (verifier rule 2 in
`tests/cases/maps/one-literal-map-value-delivery.vl`), so the read takes only `boolean | null`.

`map read default rep`: in every cell the map slot's value type is the literal-inferred
`{r: null}`, which has no struct row, yet the slot stores struct row 0 or 1 (`mvValStructIdxOf`).
`objLit` builds the default at that row's type, so the default and the read are two record reps.
Legacy keeps the value in that storage row through the binding and its field test, which is why all
12 also carry `null test nullty`. The fix is a rep decision, a record type with no row repped as the
row that stores it, so it goes in a follow-up of its own.

## The changes, one commit each

1. **print nulBool.** `emitPrintNulBool` is now `printNulBoolOpen`, the operand, and then
   `printNulBoolTail`. The IR lowers its operand between the two. It refuses a valued `if` below
   the opened blocks, as `nulStr` does.
2. **i64 keys.** `mapKeyAt` delivers the key at `repNodeOfTy(TY_I64)` under `mapKeyArmOf`'s i64
   arm, as `emitScalarValue(key, "i64")` widens it. This covers get, get-or, has and set.
3. **map delete.** A new `RMapDelete`, keyed as `RMapHas` is. `emitMapDelete` is now
   `emitMapRecvKey` followed by the shared `mapDeleteTail`. A statement builds the value and drops
   it, as legacy does. Keyed self-tests: `map-delete-of-map` holds (0), and `map-delete-of-i32`
   is refused (rule 2).
4. **a walk's pair.** `SForIn.xfVar2` holds the second name's variable, at `forInBindTy`'s rep (an
   i32 or a string only). Its slot is legacy's `forInPairSlotOf`, the one function every writer
   computes it with; the lowering checks the variable against the loop record's `pIdx`. Legacy's
   index-counter init is `forInPairInit`, shared by both writers. The rolled helpers already bind
   and step the pair.
5. **a niche map read.** A read the instance types without its map value's `boolean | null` null
   is held at the map's value rep and typed at its value type (`mapReadNicheTy`), as legacy's
   helper returns that niche. `ir_build.vl` now imports `tyMapValOf`, `forInBindTy` and `TY_I64`,
   so its phase-state surface is re-baselined 9 -> 12.

## Legacy tails the IR calls

- `printNulBoolOpen`, `printNulBoolTail` (`wasmEmit.vl`): a `boolean | null` print around its operand.
- `mapDeleteTail` (`wasmEmit.vl`): a map delete's probe, tombstone and 0 or 1, after its receiver and key.
- `forInPairInit` (`wasmEmit.vl`): a walk's index-pair counter at 0, or its hidden counter.
- `forInPairSlotOf` (`emit_plan_list.vl`): a walk's second-name slot.

## Readings (fixpoint seeds on both sides)

Functions with no blocker, `VL_IR_SHADOW=4`: distilled corpus 45,401 -> 45,424; tests/cases
71,667 -> 71,738. Fully IR-only tests/cases programs (`ir-only-census.vl`): 5,224 -> 5,289.

| class | corpus any (alone) before | after | tests/cases any (alone) before | after |
| --- | --- | --- | --- | --- |
| `print nulBool` | 11 (11) | 2 (0) | 29 (27) | 2 (0) |
| `map key` | 10 (0) | 0 | 21 (0) | 5 (0) |
| `method delete` | 10 (4) | 0 | 40 (24) | 0 |
| `for in pair` | 13 (7) | 9 (0) | 28 (17) | 5 (0) |
| `map get rep` | 20 (20) | 3 (3) | 1 (1) | 1 (1) |

Armed tests/cases: covered 71,667 -> 71,738, matched 71,666 -> 71,737. Identity: `--names`
identical 9,037, differ 0; `--cases` identical 7,686, differ 0, witnesses same 61; tests/cases A/B
identical 7,405, differ 0; `--claimless` identical 14,033, differ 0; mode 3 and armed
self-compile identical. L2 self-compile fuel +0.23% on its base. Late demands 9 (baseline 9),
late tag rows 307 (baseline 307). `regress.vl`: no runs lost. Deep-nesting margin: base 900 KB,
head 910 KB.

Witnesses, one per mechanism, each printing the same under the base and the candidate seed:
`tests/cases/null/print-nullable-boolean-of-map-has-and-field.vl`,
`tests/cases/maps/i64-keyed-map-read-has-set-default.vl`,
`tests/cases/maps/delete-as-statement-and-value.vl`,
`tests/cases/loops/for-in-pair-index-and-map-value.vl`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
