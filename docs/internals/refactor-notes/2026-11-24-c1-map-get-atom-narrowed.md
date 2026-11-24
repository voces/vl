# IR map get: a read narrowed past an atom value's `-1` null (IR-C1)

The coordinator's census on `2ae11435` named `map get rep` (6 distilled cells) and `map read
default rep` (10). Ablating the distilled cells, grouped by their originating grid, found three
families, not two:

| family | distilled cells | what it is | where it went |
| --- | ---: | --- | --- |
| C, this note | 2 (`d3127_r2_g1_F1_*`, `map get rep`) | a narrowed read of a `K \| null` atom-valued map | here |
| chain | 4 (`d3127_r2_g1_F4_*`, `map get rep`) | `a ?? b ?? c`: the chain's inner link reads the scalar map at a nullable rep | lane N3, with the chain |
| B | 7 (`d3127_r4_*` booleanN, `map read default rep`) | the map-read instance of D17401, legacy's silent `boolean \| null` chain | lane N3, after D17401 |
| A | 3 (`b021775`, `b011298`, `b011299`, `map read default rep`) | the `{ r: null }` literal beside a union member; D17400 its loud sibling | IR-C1, next |

## The change

A map read the checker types at the bare atom (under a null test, written or the one
`coalNullTestIf` synthesizes for `m[k] ?? d` joining another type) reads the bits the helper
returns. The test proves they are not the `-1` niche. `mapGetRepOk` now takes that read for a
mono-valued map whose value is the atom's nullable. Verifier rule 2 (`mapGetDstOk`) admits it
beside the ref niche's narrowed record. The lowering is legacy's: every covered function matches.

## Legacy tails the IR calls

None new. The chain family's 4 cells still stop at `map get rep`, on the chain's inner link.
