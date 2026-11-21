# IR: the `null` unit rep (2026-11-21, lane IR-N2)

`rep null` and `result rep null` miss where a value's type is the `null` unit. `valueRep`
(`ir_build.vl`) refused the unit's rep, although the verifier's `RNullOf` rule already accepts a
`NULL_OWN_NONE` null delivered at it, and the lowering writes it (`emitNullOwn`, `ref.null none`).
Legacy's functype names the unit's result `nullref`.

## The change

- `valueRep` admits the unit (`repPrim(r) == "null"`).
- `deliver`'s `null` literal arm treats the unit as it treats a nullable reference: legacy's own
  null, `NULL_OWN_NONE`.
- `identRead` takes legacy's `nulnone` arm first (`identReadArmOf`). A read of a `null` unit
  cell is its destination's null, `emitNullAt`'s `nullOwnAt`, as an `RNullOf`. Without it, a
  hole identity's `return x` read the unit parameter where legacy writes `ref.null none`
  (`bytes: return at 0xd0 vs 0x20`). A destination the null does not fit is the named miss
  `null unit read rep`.

A unit local keeps no valtype in the lowering (`valtypeOf`), so a body that declares one still
misses there.

Row file `tests/ir-shadow-rows/null-unit-result-and-read.vl`; witness
`tests/cases/inference/null-unit-result-and-read.vl`.
