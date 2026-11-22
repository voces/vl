# IR: a narrowed read of a nullable capture is the capture at its own rep, then legacy's recover, 2026-11-22

Lane IR-N6. This is the second family from the capture-class ablation
(`2026-11-22-ir-capture-instance-decl.md`). A closure reads a nullable capture where the checker
narrowed it, as in `if c != null { c[1] }`. The read asks for the member's rep and the capture
holds the nullable, so `captureRead` missed with `capture binding`.

## Ablation

| variant | misses |
| --- | --- |
| a captured local, read narrowed (`c[1]`, `c.length`) | yes |
| a record member (`c.a`) | yes |
| a captured parameter | yes |
| an escaping closure | yes |
| an un-narrowed read (`c == null`) | no |
| the same narrowing on a plain local | no |

## The change

Legacy writes a captured identifier as `emitIdentNode`'s `capture` arm, `emitCapturedRead`. That is
the environment's `struct.get`, which recovers a `nulstr` only; the IR already misses that case as
`capture recover`. Legacy then calls `emitReadRecover`, which adds `ref.as_non_null` where
`readOwesNonNullRecover`.

`captureRead` now reads the capture at its own rep, as the environment field or the lifted
parameter. It wraps it in the `RRecover` that a local's narrowed read builds. The route is
`nullNarrowArmOf`, the one a local's and a global's narrowed read take, and `rcNn` is legacy's
`readOwesNonNullRecover`.

The environment temp is typed at the binding's type, `capTyOf`, the type `liftCapVar` gives a
lifted capture's parameter. A narrowed read whose binding type is unknown, or whose rep is not the
capture's, misses as before. The first proof found 9 rule-3 verifier fails before the temp was
typed this way; the rerun has 0.

`tests/ir-shadow-rows/capture-held-i32.vl` pinned one `capture binding` miss, `flag`'s
`boolean | null` read narrowed to `boolean`. It now covers and matches 6 of 6, so its floors rise.

## Readings (base master 4bcb34f34, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases functions with no blocker | 68,784 | 68,825 |
| tests/cases `capture binding` (any / alone) | 109 / 106 | 68 / 65 |
| tests/cases claimed (mode 3) | 68,389 | 68,430 |
| corpus functions with no blocker | 45,190 | 45,201 |
| corpus `capture binding` | 11 | 0 |
| self-compile functions with no blocker | 19,864 | 19,864 |
| `ir-only-census`: tests/cases programs fully IR-only | 4,248 of 7,054 | 4,258 of 7,054 |
| `ir-only-census`: `capture binding` functions | 107 | 66 |

Claimed rises with covered (+41 each), so no new function is covered through a kind in the
unclaimed `other` family.

The `capture binding` that remains is the other families from the same ablation: a captured
generic-function cell (`i32` cell read at a closure), a capture at an open rep, and list-to-list.

Legacy lines deleted: 0. Moved to `@ir`: 0.
