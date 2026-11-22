# IR: a null-free union map value read under `??` (2026-11-22, lane IR-N2)

`map read mv`, the first batch after #9546. On a fixpoint seed of master 14d707ae, the forced
IR-only census misses 39 functions there (31 programs, 24 missing nothing else). A scratch copy
named legacy's mv sub-arm in each miss: the largest group, 25 functions (and 3 module starts),
is the stash route over a union value with no null member and a non-nullable default.

Legacy's stash route writes, for that case, exactly the plain mv arm's bytes: the probe's void
`if` and the stash set, the default in the miss arm (`emitMapValDefault`, which boxes it into the
slot's union with `emitUnionBoxOwed`), the stash set and get, and `ref.as_non_null`.
`mapGetOrMvPlain` refused it only through a blanket union clause.

## The change

- `mapGetOrMvPlain` (`wasmEmit.vl`) refuses only a union with null. Legacy now takes its plain arm
  for a null-free union, writing the same sequence.
- The IR's form 2 (`mapGetOr`, `ir_build.vl`) over a union slot delivers the default at the slot's
  box (`deliver` at `mvValTyIxAt`, as a map store's union value is). `mapGetOrUnionMiss` refuses a
  result rep that is not the receiver's value rep and a default boxed from another union's box,
  with the map store's own guard.

Left for later: the niche stash (8 functions), the union box with null under a nullable default
(5 + 1), `map read atom` (20) and `map read sentinel` (13).

Row file `tests/ir-shadow-rows/null-free-union-map-read-coalesced.vl`; witness
`tests/cases/maps/null-free-union-map-read-coalesced-boxes-its-default.vl`.
