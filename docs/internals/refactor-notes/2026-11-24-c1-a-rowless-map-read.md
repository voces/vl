# IR map read: a record whose type's row records another is read at that row's record (IR-C1, A)

Family A of the `map read default rep` split: the 3 distilled cells `b021775`, `b011298` and
`b011299`. Each declares a plain `Dot` and the union arm `Circle` with one shape, and stores the
literal `{ r: null }` in an un-annotated map.

## The known split, not fixed

D14890 (`recNarrowRecordOf`) keeps the type at its own rep: two records qualify, so there is no
narrowing. `structRowOfRecordTy`'s storage-key rung (`repRowOfTyStruct`) stores the mv slot at
the shape's struct row 0 anyway. The checker types the map's value, the `??` and its default at
a type whose struct index is that row, but whose row records another type. So the IR's read rep
(`record6`, the type's) and the map's value rep (`record4`, the row's) are two records for one
storage. Ruling (b), making the storage-key rung agree with D14890, was refused: it would move
what legacy stores for no clause-1 or clause-2 gain.

## The change (IR only)

- `mapReadStoredRep`: a `??` over such a map yields the map's value rep. This applies only where
  the read's type has a struct row that records another type whose rep is that value rep.
- Its temp, and a fused default's out (`mapGetOrBox`'s new `outTy`), are typed at the row's
  recorded type.
- `localSlotRecordTy`: a fresh local legacy declares at that row's slot takes the read as it is
  (`localStoredAt`).
- Every covered function matches legacy byte-for-byte.

## Legacy tails the IR calls

- `null test nullty operand`: in the position sweep (`rowless-record-map-read-positions.vl`), `rd`
  and `show` stop there after the read. It is an existing class: on the base seed `show` stopped
  there too.
- `global read coercion` at module scope is unchanged.
