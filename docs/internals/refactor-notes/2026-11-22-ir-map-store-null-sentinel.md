# IR: a map store's `null` sentinel (2026-11-22, lane IR-N3)

The coordinator ruled the corpus `map store value boolNull` (9) and `atomNull` (3) rows to IR-N3 as
map store residue after #9473, which this stacks on. Legacy's `emitMapSetValExpr` writes a bare
`null` into an atom-valued map as `i32.const -1` and into a `boolean | null`-valued one as
`i32.const 2`, by `mapSetValArmOf`'s `atomNull` and `boolNull` arms. Those are the bytes
`emitNullOwn(NULL_OWN_ATOM)` and `emitNullOwn(NULL_OWN_BOOL)` write.

## The change

- `mapSet` admits the two arms; `mapSetValue` builds `RNullOf` with that own at the map's value rep
  (`mr.rmVal`), gated by `nullOwnRepFits` (a miss names the arm otherwise).

`boolNulNone` (a `null`-typed expression evaluated for its effect, then `2`) stays a named skip.

## Witness

`tests/ir-shadow-rows/map-store-null-sentinel.vl`: `set` and index stores of `null` into a
`boolean | null` map and `set` of `null` into a `K | null` map.

Legacy's two arms now write `emitNullOwn(NULL_OWN_ATOM)` and `emitNullOwn(NULL_OWN_BOOL)` rather
than the constants, so the arm-to-null correspondence lives in one place (byte-neutral).

## Measured vs merge-base 898b840d8 (fixpoint seeds on both sides)

- Fixpoint after one refresh; `--names` self-compile identical; mode-3 self-compile byte-identical.
- `ir-identity.sh --claimless`: identical 14018, fail under both 3267, differ 0.
- `ir-identity.sh --cases`: identical 7611, differ 0; witnesses same 60, differ 0.
- tests/cases legacy A/B: identical 7331, differ 0.
- tests/cases armed shadow: covered 68,652 → 68,657 and matched 68,651 → 68,656 (+5);
  `map store value atomNull` 7 → 0, `boolNull` 2 → 0.
- Corpus no-blocker functions 45,028 → 45,040 (+12): `map store value boolNull` 9 → 0, `atomNull`
  3 → 0.
- Self-compile L2 fuel -0.01% per PR.
