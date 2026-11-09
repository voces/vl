# Step 7: a recursive element's arm row mints at its first read (2026-11-09)

Base: master `2544f3ce` (#7006). Both seeds are fixpoints (two self-compiles, byte-identical).

## What changed

* **The union pass's last early arm read is deleted.** `markRefArrayArmsOf` minted the row of a
  ref-list arm whose element reaches a cycle (`tyReachesCycle`), so that a nested list could read
  it by the declared type. It now mints no arm row; every arm's row mints at its first read
  (`unMemRefArrArmSlot`). `internShapeDeepTy` on the arm stays: it is load-bearing.
* **A declared alias and its body are one recursive type.** `type J = null | string | J[]` is a
  one-member union over its body. `tyUnrollsTo(J, body)` failed at the head-code check (a union
  against a nullable), although `tyEqSameHoles` holds. So `repElemId` of the body walked into
  `J` instead of folding it, and the two keyed two rows. `tyUnrollsTo` now compares the head codes
  of the peeled bodies (`tyAliasBodyOf`).

* **D4140 runs.** `(null | string | J[])[]` is `J[]` with `J` unfolded once; its element now
  keys as `J`, so the list takes `J`'s row at a binding, a parameter and a return. The row is
  closed with a pin, `tests/cases/unions/recursive-alias-unfolded-list-is-alias-list.vl`.

## Why the bare deletion lost D4153

`D4153`'s pin (`tests/cases/unions/recursive-alias-nested-list-copied-with-map.vl`) refused with
`ref valtype with no interned shape`. The first reader is `emitCloSigFunctype` for the lambda
`(x): J => x`, whose parameter `x: J[]` asks for the row of `J` before the annotation's rows are
minted. The only row of that type then was the inner list literal's, minted with the body's
arena index (`string|J[]|null`), and it keyed apart from `J`. The early read had covered this by
minting a second row for `J`. With one key for the two spellings, the literal's row is `J`'s row.

## Measured

Seed: master `2544f3ce` 6,591,394 → 6,591,575 (+181).

Sweep, #7006's head merged with `99415ee4` against this change on the same tree (23,806 programs):
0 `runs → not-runs`, 0 new compiler traps, 2 output movers, 6 bytes-only movers. The output
movers are D4140 (`emit_reject → runs`) and `tests/cases/intrinsics/fs-write-at.vl`. The second
is the two recordings writing the same file at once: alone, both seeds print the same bytes.
