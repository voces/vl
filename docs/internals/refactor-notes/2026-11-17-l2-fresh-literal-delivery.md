# L2: the per-call vector records a fresh argument at the row its delivery rebuilds it, 2026-11-17

STORE's A1 (route 1, the coordinator's ruling) keys an instance whose argument is a fresh literal
or call at its contextual type. A0 (#8872) found 45 check-only keys in 27 programs where the vector
held the argument's own type (`{r: i32}`) and the elaboration keyed the delivered row
(`{r: i32 | null}`). The split, recorded in `l2-inferred-interfaces-design.md` §10:
- the call's own destination is L2's, this change;
- a later call's parameter (the forwarder shapes) is S3.4d's, STORE's.

## The change

`instVecDeliveryClose` (check_bind_adopt.vl) runs as check's last step, at `elabPrepare`'s start,
once the record solve has decided each rebuild. For each direct call's vector row, each declared
type parameter that only bare parameters take, and whose every argument there
`recRebuiltLeafRow` rebuilds at one row, is recorded at that row (`instVecSetTyAt`).

It leaves alone:
- an argument kept at its own type;
- two arguments rebuilt at different rows;
- a parameter type that mentions the variable inside it;
- a hole (`?f.k`). For a hole the elaboration keeps the hole's own binding and keys the delivery
  as a row entry (`#r.k`) beside it.

Nothing but A0 and the iface shadow reads the vector, so the build is identical by construction.

## Measured: A0 (`$VL_INST_KEYS=1`), L2's family-A witnesses

| file | before | after |
| --- | --- | --- |
| `call-through-identity-built-at-delivery` | equal 0, check-only 1, elab-only 1 | equal 1, 0, 0 |
| `fresh-call-at-several-sites-built-at-delivery` | 1, 0, 1 | 2, 0, 0 |
| `identity-fresh-call-built-at-delivery` | 0, 1, 1 | 1, 0, 0 |
| `identity-fresh-call-of-hole-callee-built-at-delivery` | 4, 1, 2 | 6, 0, 0 |
| `identity-fresh-call-with-arguments-built-at-delivery` | 2, 1, 2 | 3, 0, 1 |
| `identity-literal-into-record-union-member` | 0, 1, 1 | 1, 0, 0 |
| `identity-literal-into-record-union-then-own-row-call` | 1, 1, 1 | 2, 0, 0 |
| the same, `-unann` | 1, 1, 1 | 2, 0, 0 |
| `inferred-return-identity-literal-into-record-union` | 1, 0, 1 | 2, 0, 0 |
| the same, `-unann` | 1, 0, 1 | 2, 0, 0 |
| `nested-identity-fresh-call-built-at-delivery` | 0, 1, 1 | 1, 0, 0 |
| `call-through-hole-identity-built-at-delivery` | 2, 0, 2 | 2, 0, 2 |
| `lists/call-in-list-literal-read-in-place-built-at-delivery` | 0, 0, 0 | 0, 0, 0 |

Every check-only key is gone. Two keys remain elab-only:
- **`call-through-hole-identity`:** holes. The elaboration's delivered-row entry `#r.0` beside the
  hole has no check-side counterpart; that is a key-composition question for A0.
- **`identity-fresh-call-with-arguments`:** one key, the hole function `u`'s `#r.0` row entry, the
  same category.

So no declared-parameter key disagrees any more; what remains is whether the vector should carry
holes' row entries.
