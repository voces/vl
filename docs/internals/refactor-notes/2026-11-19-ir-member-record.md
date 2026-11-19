# `member record`: three record reads made plain (2026-11-19)

The coordinator's blocker census named `member record` as a class that blocks a function alone. It
is the builder's last miss in `buildMember`, for a record receiver whose read is neither plain arm
(`structFieldPlain`, `variantFieldPlain`). A local diagnostic build named the failing condition
for each miss (corpus plus probes, functions where it is the only blocker / where it is one of
several):

| reason | alone | any |
|---|---:|---:|
| receiver owes a non-null recover | 93 | 276 |
| union-box field | 43 | 125 |
| field stored `nulstruct`, read `struct` | 38 | 58 |
| a record's `length` field | 1 | 732 |

Once a field-read receiver was admitted, the stored-nullable row was the next miss on 79 of the
same functions.

## What changes
`memberReadPlain` and `fieldStoresRead` (`wasmEmit.vl`), read only by the IR's field-read arms:
- **`length`** is a plain field when the receiver is a struct or variant with no list-fit grow
  row and no union-of-containers arm (`lengthIsField`): `emitMemberNode` then reads it as any field.
- **A receiver that owes a recover** is plain when it is itself a field read: the IR's `getField`
  and `boxField` end with `emitReadRecover`, as legacy's read does. Any other receiver owing one
  (a local) stays out, since the IR's local read writes no recover.
- **A row stored as a nullable ref** stores the read when the read records its non-null twin and
  owes the recover that `fieldTail` writes.

## Measured
See the PR body. The union-box field reads stay the named miss; they unbox through legacy's arm.
