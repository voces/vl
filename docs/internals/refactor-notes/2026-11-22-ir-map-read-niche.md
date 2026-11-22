# IR: a ref-niche map value read under `??` (2026-11-22, lane IR-N2)

`map read mv`, the second batch after #9546. On the forced IR-only census at master 14d707ae,
legacy's niche stash route holds 8 functions (7 programs, 4 missing nothing else) and 2 module
starts. Each reads a map whose value is a nullable ref (`{[string]: S | null}`, a string or a
closure) as `m[k] ?? d` with a default that is not nullable.

Legacy's stash route at a nullable niche writes the hit's slot or the miss's null into the stash,
then one `ref.is_null` test whose arm writes the default, and recovers the stash to non-null.

## The change

- The arm is a predicate and two writers in `wasmEmit.vl`, which legacy and the IR both use:
  `mapGetOrNicheStash`, and `mapGetOrNicheHead` and `mapGetOrNicheTail` around the default. The
  niche under a nullable default (`?? null`) keeps legacy's own path.
- The IR builds `RMapGetOr` (or the fused `SCoalBox` read) at a new form 4. `mapNicheReadsAt`
  (`ir.vl`) ties the out's rep to the map value's: a discipline-1 nullable whose inner rep is the
  out's. The builder refuses another rep, and the verifier admits form 4 only so.

Left for later: the union box with null (5 functions, and 1 under a nullable default),
`map read atom` (20) and `map read sentinel` (13).

Row file `tests/ir-shadow-rows/nullable-ref-map-read-coalesced.vl`; witness
`tests/cases/maps/nullable-ref-map-read-coalesced-to-its-value.vl`.
