# A generic instance's returned record takes its held type (2026-11-08)

Lane "D15297, and the function-holding path's last declines". It follows
[2026-11-08-held-type-keeps-fn-sets](2026-11-08-held-type-keeps-fn-sets.md).

## What changed

`monoPinReturnedObj` (`emit_mono.vl`) declined every generic instance. It now reads
`elabHeldValTy` per instance and records the instance's own copy of the literal at it
(`monoRecordObjLitAt`). The non-generic path is unchanged: `idSlotHeldTy` over the held type,
else `monoObjLitFieldsPin`. A copy gets no `idSlotHeldTy` pass because no slot is keyed by a copy.

## Measured

Base: master `82072a24` at its fixpoint, 6,505,157 bytes. Candidate: a fixpoint at 6,505,194
bytes (+37). `scripts/sweep.vl -- diff`: 23,622 same, 0 bytes-only, 3 output movers, 0
`runs → not-runs`, 0 new traps. All three movers are `emit_reject → runs`: D15297, D15276 (an
un-annotated `mk(n)` is a generic instance) and `named/d15293_bare_record`.

Siblings checked by hand, base → candidate. 17 move from `ref valtype with no interned shape`
to runs: the witness and its un-annotated `mk(x)` twin, calls through a `const` and through the
call result, two named functions, a nested record, a list field beside the set, two returns of
one set, two returns of different sets, a map field, a generic wrapper, and a `let` that is
reassigned. A single named function field (`{ f: inc0 }` annotated) and a lambda element already
ran.

## Still refusing

| program | outcome | row |
| --- | --- | --- |
| the record bound to a `const` inside `mk<T>`, then returned | loud, no interned shape | none: `monoPinFieldContainers` declines a generic instance (instance-binding lane) |
| `[mk(1), mk(2)]`, a set called through the list | loud, no interned signature | D15548 |
| `return [{ fs: [inc0], x: x }]` with two instances, a set called | **check-clean invalid wasm**, on master too | D15549 |

D15549 is clause 1. Each instance's copy carries the right closed type: the string copy has
`{fs: ((i32) => i32)[], x: string}`. But both rows read `{ref $fs, i32}`. The row of a record
whose set a call reaches is keyed without the instance.

## "Built at different rows" (D15226, D15510)

This is a capability gap, not a design rule. Bare records with different sets now run (above),
and so does the list under a list with one set. `elabFnJoinDeepAt`'s `shape == 2` decline
(`check_elab_cap.vl`) is the gate. With the decline dropped, D15226 runs (`6`), but D15510
(`inc0` beside `half`, two results) becomes check-clean invalid wasm. So the decline is what
keeps D15510 loud. A same-signature guard over the checker's function types cannot tell the two
apart, because both rows' un-annotated parameters are still open there. The test has to read
each member's instanced signature. Parked, not shipped.
