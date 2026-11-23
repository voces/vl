# IR: a holder captured whole (2026-11-23, lane IR-N8)

This change stacks on `ir-capture-binding` (#9646), whose `capTyOf` holds a captured holder at its
record (`holderRecordTy`). A read of the capture still missed as `capture binding`.

`holderReadTy` knew a holder only as this frame's variable or as a module cell. It now gives a
capture of a binding that keeps a returned bundle whole the record its capture holds
(`capturedHolderTy`). A holder call through such a capture reads it there (`calleeIsCapture`,
`bundleCaptureRead`).

## Readings

Shadow mode on the 9 programs of `capture binding A ? read at closure` (the master 75db3649
census): #9646's fixpoint seed against the head.

| reading | #9646 | head |
|---|---:|---:|
| covered = matched | 235 | 242 |
| `capture binding` | 9 | 1 |

## Remaining capture families, with witnesses

- `no rep param` / `no rep other` / `no rep decl`, 21 functions. The smallest witness is a generic
  parameter captured by a closure in a `null` instance (`outer<U>(x: U)` called with `null`): the
  captured binding is typed `null` and has no value rep. One instance, or two non-null ones, builds.
  Not ablated further.
- `open temp type`, 10 functions. A bundle call through a capture inside a lambda (`() => f(2.5)`)
  whose result type stays open, since the lambda is not instanced per signature.
- `? read at list`, 7 functions. A v128 captured in a cell, handed to IR-N7.
