# IR: a spread group at a sub row is taken as its own list (2026-11-26, lane COV-CLOS)

## Defect

Legacy's spread plan can stash a group at its own row (`spGroupRows`) when its element is a subtype
of the literal row's: a `C[]` beside `null` in a `(C | null)[]`, or a `Circle[]` in a `Shape[]`
(D14960). `spreadJoinGroups` then copies it with `array.copy`, which takes a source whose element is
a subtype of the destination's. The IR's lowering already passes those rows to the join. But the
builder refused any such group (`array spread sub row`).

## Fix

The fence is gone. A group at a sub row joins the converted groups in `RSpread.spOwn`, which
replaces `spConv`: each such group is a list at its own rep. The verifier's rule is unchanged apart
from the name. A group in `spOwn` must be a list, and every other group must be at the literal's
rep.

## Census: base (master) → head, all 11,500 census files

| | base | head |
|---|---:|---:|
| claimed units | 114,631 | 114,634 |
| lost | — | 0 |
| `array spread sub row` | 3 | 0 |

The gained units are the start body of `arrays/spread-subtype-record-element.vl`, and `mk` and the
start body of `lists/spread-record-list-beside-null-keeps-nullable-row.vl`.

## Positions

`tests/cases/lists/spread-sub-row-group-positions.vl` covers binding, argument, `return`, record
field, assignment and list element, plus a wider record list into a narrower one. Base misses
`array spread sub row` twice; head claims every function, and the output is the same with claims on
and off.
