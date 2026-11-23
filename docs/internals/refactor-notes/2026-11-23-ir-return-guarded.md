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
| null → nullable, the null fits the ref | 3 | yes, with the null-unit global fold (below) |
| map → map | 5 | no |
| record → record, record or closure → nullable, list, box → record | 8 | no |

A closure the result stores alike (`repStoresAs`) is returned as it stands, as at an argument. The
verifier's return rule accepts the pair through `vfStoresAs`, and the facts pass notes it at
every return whose reps differ.

A null that fits the nullable result's ref (`repNullRefFits`) is returned as it stands too, as
at an argument and a global; the verifier's return rule accepts the same. Admitting it at first
exposed `generics/hole-identity-null-into-nullable-record.vl::ret`. Its argument `hid(nn)` read the
never-filled null-unit const `nn` as a `global.get`, where legacy writes `ref.null none`, and the
armed shadow caught the byte mismatch. The IR's global read now asks the same fold fact the local
read already did (`identReadArmOf` → `nulnone`, built as `RNullOf` at `nullOwnAt`). The shadow
row `tests/ir-shadow-rows/null-unit-global-read-as-returned-argument.vl` pins it: it reds on a
control build without the fold and passes with it.

## Verifier self-tests (return rule)

- `return-not-stored-alike` (an `i32[]` result returned a `boolean[]` parameter, no valtypes
  noted): refused, rule 2.
- `return-stored-alike` (both reps noted at one valtype): holds, rule 0.
- `return-stored-unlike` (noted at two valtypes): refused, rule 2.
- A wrong expectation in the map reds the test (checked by flipping `return-stored-alike` to 2).
- The facts pass notes a differing pair's valtypes only from `refRepValtype`. A pair the facts
  record as unlike is refused, as `return-stored-unlike` shows.

## Legacy tails the IR calls

- `emitInitGuard` (wasmEmit): ir_lower `globalRead`, the `guard` class's read-before-init guard.

The measurements are in the PR body.
