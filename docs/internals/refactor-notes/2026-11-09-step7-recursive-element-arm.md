# Step 7: a recursive element's arm row mints at its first read (2026-11-09)

Base: #7006's head (`bb1c1a70`) with master `99415ee4` merged in. Both seeds are fixpoints (two
self-compiles, byte-identical).

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

## Why the bare deletion lost D4153

`D4153`'s pin (`tests/cases/unions/recursive-alias-nested-list-copied-with-map.vl`) refused with
`ref valtype with no interned shape`. The first reader is `emitCloSigFunctype` for the lambda
`(x): J => x`, whose parameter `x: J[]` asks for the row of `J` before the annotation's rows are
minted. The only row of that type then was the inner list literal's, minted with the body's
arena index (`string|J[]|null`), and it keyed apart from `J`. The early read had covered this by
minting a second row for `J`. With one key for the two spellings, the literal's row is `J`'s row.

## Measured

See the PR body for the seed delta and the sweep.
