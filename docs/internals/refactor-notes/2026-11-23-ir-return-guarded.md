# IR: guarded global reads and stored-alike returns (2026-11-23, lane IR-D1)

Two classes from the IR-only census at 693fd72c, re-measured at master 88df143e: `guarded global
read` (28 functions, 23 programs) and `return coercion` (29, 21).

## Guarded global read

A read of a user global that may run before its initialiser is of the `guard` class
(`userGlobalReadClass`). Legacy writes `emitInitGuard(g, "read")`, a stack-neutral
`if <not yet initialised> { report; call the init-fail helper } end`, then the `global.get`. The IR
refused the class outright (`irGlobalReadMiss`). It now claims the class wherever the global is
minted, and `globalRead` writes the same guard and read. The guard reads `emitCurFnPos` and
`gPromoInStart`, which are the function being lowered when the IR claims it.

## Return coercion: stored-alike values

A probe at the miss on master split the rows:

| shape | rows | taken |
| --- | --- | --- |
| closure → closure, stored alike | 7 | yes |
| null → nullable, the null fits the ref | 3 | no (see below) |
| map → map | 5 | no |
| record → record, record or closure → nullable, list, box → record | 8 | no |

A closure the result stores alike (`repStoresAs`) is returned as it stands, as at an argument. The
verifier's return rule accepts the pair through `vfStoresAs`, and the facts pass notes it at
every return whose reps differ.

The null-fit arm was tried and dropped. It exposed
`generics/hole-identity-null-into-nullable-record.vl::ret`, whose argument `hid(nn)` reads the
null-unit const `nn` as a `global.get` where legacy writes `ref.null none`. The armed shadow caught
the byte mismatch. That is a separate defect in the IR's null-unit global read, reported to the
coordinator.

## Legacy tails the IR calls

- `emitInitGuard` (wasmEmit): ir_lower `globalRead`, the `guard` class's read-before-init guard.

The measurements are in the PR body.
