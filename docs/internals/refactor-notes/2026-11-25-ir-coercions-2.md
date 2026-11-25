# Coercions, batch 2: a nullable hole closure returned, a scalar tail arm boxed (2026-11-25, lane COV-START)

Two mechanisms, from units other lanes' changes exposed in this lane's classes:
- COV-CLOS's map-read positions (`pRet`);
- COV-CLOS's pop/get `??` returns (`tail coercion`).

## The mechanisms, one commit each

- **A nullable closure returned at a nullable closure rep a hole leaves open.**
  - The value is a map read of a hole function, returned from an un-annotated function.
  - `holeRetagNoted`'s closure arm (`clo`) now also covers a pair of closure ref niches
    (`nulCloPair`), so the value is retagged as a closure is.
  - Witness: `maps/map-read-at-twin-closure-rep-positions.vl`'s `pRet`, now claimed and
    byte-identical to claimless.
- **A scalar tail arm at a boxed result.**
  - A value `if` (a `??` over a hoisted `pop()` or `get()`) yields a bare `f32`, `f64`, `i32`
    or `i64` where the result is `T | null` or `T | string`.
  - The arm is now boxed at the result's union by the shared box plan (`boxTempIn` at
    `ib.irRetTy`), the box legacy's `emitUnionBoxOwed` writes.

## Measured, merge-base → head

Same census probe and program lists, tests/cases listed fresh (9,4xx programs); armed shadow over
every program.

| reading | merge-base | head |
|---|---:|---:|
| tests/cases distinct functions claimed | 45,458 | 45,475 |
| `tail coercion` units in the four `pop-get-or-result-rep-*-hoisted.vl` | 8 | 0 |
| armed shadow mismatch, fail and fallback rows | 25 | 25, the same rows |

## Found and sent on

- D17564 (lane SOUND). A hole closure read from a `Map()` and called in an interpolation hole is
  claimed into an invalid module, which falls back. A direct call of it in other positions
  mismatches legacy. Pre-existing on master; the sweeps leave those positions out.
- A legacy defect, per O3 not fixed. `type R = { v: i32, f: () => boolean }; const named: R = …;
  const xs = [{ v: 2, f: () => 11 }]` fails legacy emit ("ref valtype with no interned shape").

## Left in this lane's classes

- `pList`: a nullable closure element into a list whose element rep is the non-null closure.
  Retagging nullable to non-null is not something the verifier can admit.
- `record-literal-beside-declared-record-with-another-field-function.vl`: an element built at a
  declared record whose closure field's signature differs, with no layout row.
- COV-CLOS's spread programs, once #10090 lands.
