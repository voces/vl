# IR: start-body captures and bundles captured whole (2026-11-23, lane IR-N8)

IR-N6's capture remainder, re-derived on master 75db3649. A throwaway seed named each
`capture binding` / `closure env capture` site and its rep pair. Largest families (functions):

| family | fns |
|---|---:|
| `start: closure env capture unbound` | 30 |
| `closure env capture rep record vs closure` | 13 |
| `closure env capture no rep param` | 9 |
| `closure env capture no rep other` | 9 |
| `capture binding A ? read at closure` | 9 |
| `capture binding A ? read at list` | 7 |

## The change

- `ownBinding` (behind `liftCapDecl`) walked only a function's body, so in a start body every
  module-block local was unbound. A start body's roots are now its statements that initialize no
  global (`ibStartRoots`). `buildStart` also resets the own-binding and capture-decl tables, which
  the previous function had left.
- `capTyOf` read a bundle parameter at its scope's closure type, and a holder of a returned bundle
  at its scope type. Both are now held as legacy holds them: `bundleHeldTy` for the parameter and
  `holderRecordTy` for the holder, the record of one closure per signature.
- A bundle call whose callee is a capture reads it at that record (`bundleCaptureRead`) and picks its
  member as a parameter's call does. It used to refuse as `bundle callee`.

## Readings

Shadow mode, master 75db3649 fixpoint seed against the head:

| reading | base | head |
|---|---:|---:|
| start bodies of the 30 programs: covered = matched | 3 | 29 |
| bundle programs: covered = matched | 441 | 467 |
| `bundle callee` | 21 | 0 |
| `closure env capture` (bundle programs) | 18 | 3 |

Unmasked: `open temp type` 10.

## Not in this change

- `capture binding A ? read at closure` (9): a holder captured whole and read at a member's closure.
- `? read at list` (7): a v128 captured in a cell (IR-N7's reps).
- `no rep param` / `no rep other` (18): the generic and hole instances IR-N6 described.
