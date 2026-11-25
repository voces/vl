# Map get on a union of maps, read per arm into a box (2026-11-25, lane COV-CLOS)

Item C of the lane. `g(a)` narrows a hole parameter to `MI | MS` (`{[string]: i32} | {[string]: string}`) and reads `id(a).get(k)`. Legacy dispatches the union receiver by arm (an arm site). Inside each arm it probes that arm's map and builds the result straight into the union's box: the value's atom tag and a boxed payload on a hit, `null`'s tag on a miss.

The IR built the same arm site, but each arm's read was typed at the whole read's boxed nullable `i32 | string | null`, which is not the arm's map value rep, so it missed at `map get rep`.

## Mechanism

* `mapGetAt`: a read at a boxed nullable that the map's value rep does not take (`mapGetRepOk`), on any arm but `unionBox`, takes the scalar box kind from the arm's own map type (`mapTyScalarBoxKind` of the receiver's rep). It is built as the probe's box (`mtBox`, `emitMapGetScalarBoxTail`), typed at the read's own type.
* `boxPlanWhy`: the `mapScalar` plan takes a value that is already a boxed nullable. That plan writes neither a head nor a tail, so the box is the value.
* `boxOp`: `mapScalar` writes its operand. `RToBox` at `mapScalar` arises only from the case above, because the plan refused every operand before.

Under behaviour parity (#10171) the output is what counts. Both programs print their `@log` lines claims-on and claims-off, with no invalid module.

## Class delta (map get classes' 9 programs, master → head)

| class | master | head |
|---|---:|---:|
| `map get rep` | 3 | 1 |

Claimed: `g` in both `narrowed-map-union-through-a-call-*` programs. Lost: 0. The remaining `map get rep` is `is-on-field-of-map-read-narrowed-by-null`'s start. The four `map get union box rep` rows and the one `map get box type` row are unchanged.

Q58: `tests/cases/unions/map-union-arm-scalar-read-boxed-positions.vl`. `g` misses this class on master and is claimed here; the output is the same claims-off and claimed.
