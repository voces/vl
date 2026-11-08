# The read-side atom and arm floors take the table (2026-11-08)

Step 5. Follows `2026-11-08-instance-cast-payload-records.md` (#6856), which left 17 atom rows and
1 arm row in `scripts/box-dst-shadow/floors.tsv`.

## What each floor lacked, and the record that serves it

| floor (deliveries on master's fixpoint) | what it lacked | record now |
|---|---|---|
| `emitStrValue` no record (30) | a literal-set template hole is delivered as a string with no stamp (`tplHoleHandled`) | `atomReadStamp(hole)` |
| const join reads (11, five positions) | `const M = if c { A } else { B }` reads as `string`; the emitter stores its set (`constBindsLitSet`, D14757) | `atomSrcStamp` reads that set (`constLitSetReadTy`) |
| `emitMemberNode` no record (10) | a `.length` receiver is no operand and no delivery | `atomReadStamp(receiver)` |
| `emitRefIfArm` / `emitReturnCoercedValue` no record (14) | a `?.` read's minted member part is never checked, so has no type | stamped at the read's type without `null` |
| `null differs` (52, six positions) | a `??` decodes its left only on a hit, and a later delivery restamped the left at its own nullable type; a map read's hit is the stored value, in an instance too | `atomHitStamp`: the non-null of the map's value or the left's own type, held (`nodeAtomSrcHeld`); a left `??` hands its default over on the same hit |
| `emitDirectCallArgsUnder` arm, site has no heap (5) | nothing: a slot that names no heap casts nothing, so the position never owed the arm | `directArgArmOwed` requires a heap (byte-identical) |

The hole record closes D2213: `print("g \{g}")` over a module-scope `g` narrowed to one literal
was an emit refusal (`literal-union string widening with no members`) and prints `g y`.

`binRetTy` now stamps operands under `elabCapLive()` too, the quiet guard its numeric half
already had. It moved no row on the sweep population.

## Lowered integer `match` compares

On master's fixpoint the class reads 0. On the stale setup seed and on one candidate fixpoint it
read 10 numeric and 1 atom floor, in three `tests/cases/match/` and `numerics/` files: whether an
operator check ever sees `scrut == pat` (`desugarMatchAt` builds it after the arms are checked)
depends on the build. `matchLower` now stamps each lowered compare's operands itself.

## Shadow (`run.sh`, sweep population, fixpoint seeds)

| | master `93df9d8b` | this PR |
|---|---|---|
| atom table | 1,151 (+18 narrower, +3 no member) | 1,260 (+21, +4) |
| atom floor: no record | 64 | 3 |
| atom floor: null differs | 52 | 0 |
| arm table / floor | 33 / 5 | 33 / 0 |
| num table / no record / src differs / dst differs | 333,650 / 1,171 / 20,428 / 2 | same |
| `floors.tsv` rows | 74 (and `run.sh` red: 2 unlisted `null differs`) | 58 (green) |

Master's fixpoint failed `run.sh`: `emitCoerced` and `emitLetInitValue` `null differs` were
unlisted. Both are gone. Sixteen rows leave `floors.tsv`: 14 atom, the arm row, and
`srPushSource` `num` no record, which no delivery reaches.

## What stands

- **Atom, 3 deliveries.** A generic call's result set that only the instance names, bound
  un-annotated (`coalesce-join-tag-in-instance.vl`, 2); one return in
  `captured-litunion-assign.vl` that floors only beside the file's earlier closures (1).
- **Numeric no record, 1,171.** `emitFnTagDispatch` 474 (hole-function-set arms: the call's
  joined result is a hole at the check). `emitCoerceAtomPayload` 385. `emitBinOperandAs` 26, of
  which 22 are `xs[i] += v` over a list a later `push` pins (`D1603.vl`,
  `compound-index-assign-pins-element.vl`).
- **dst differs, 2.** `3.0 as i64` (site `i64>i64`) and an `f32` literal tail of a value `if`
  (site `f32>f32`) are literals the site mints at its own kind. Nothing is widened, so the site
  owns the rep, as `arrLitDataElemEmit`'s `src differs` does.
