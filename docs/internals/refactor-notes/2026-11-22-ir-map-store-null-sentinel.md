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
