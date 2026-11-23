# IR: the rest of return coercion (2026-11-23, lane IR-D1)

Follows #9711. A probe at the miss on master c1226504 split the remaining rows:

| shape | rows | taken |
| --- | --- | --- |
| `Map()` returned from a generic (`0 > n`: the node typed at its template map) | 4 | yes: built at the result's map (`mapNewShapeOf` is the instance's) |
| closure → ref-niche nullable (`(…) => … \| null`) | 2 | yes: `nicheRefTakes`, inner rep or stored alike |
| a map, record or list value from a hole function (`10 > 2`, `50 > 17`, …) | 8 | no: the hole-function lane's shared instances |
| box → record, record variant | 2 | no |

## Verifier

The return rule gains `vfNicheTakes`: a ref-niche nullable (`rnDisc` 1) takes its inner rep, or a
rep the facts pass noted stored at the inner's valtype. `noteReturn` notes the (inner, value)
pair for a nullable result. Keyed self-tests:

- `niche-return-not-stored-alike`: refused, rule 2;
- `niche-return-stored-alike`: holds, 0.

`RMapNew` needs only a map destination (rule 2), unchanged.

## Legacy tails the IR calls

None new.

The measurements are in the PR body.
