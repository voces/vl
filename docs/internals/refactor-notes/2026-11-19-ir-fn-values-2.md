# IR: function values, step 2 (2026-11-19)

Step 1 (#9130) left these classes, among others:
- `callee captures`: a lifted callee capturing a binding that is not a caller parameter;
- `call of a non-declaration`: a closure call `callRefPlainKey` declines.

## What changed
- **A lifted callee's capture may be a `let` or `const` of the caller** (`liftCapDecl`).
  - The binding is found at a read of the capture inside the lifted body (`identDeclOf`).
  - It is accepted only when it stands in the caller's own body, outside any nested function.
    That set is built once per function (`ownBinding`), because a per-capture walk tripped the
    `called captured narrowed locals` scaling axis (1.64 against a 1.5 bar).
  - It reads no legacy scope: `captureHomeOf` asks `scopeSlotOf`. Nor does it read the
    write-scan index: `recEnclosingFn` trapped on D3731, where the index is not yet built.
  - A capture boxed into a cell (`capCellTargetOf`) is still a miss, as is a callee that writes a
    capture back.
- **A plain closure call takes string and record arguments.** `callRefPlainKey` admits a `str`
  parameter whose argument is not read as an atom, and a `struct` parameter whose argument is
  neither unboxed from a narrowing nor a nullable record. Legacy's agreement record
  (`emitCallRefArg`'s plain-arm result) already counts exactly those arms as plain, so the armed
  check covers them.

## Measured on fixpoint seeds: master `c8601b4df` against this branch

| | master | this branch |
|---|---|---|
| distilled functions claimed (`--claims`, 0 fell back), all matched armed | 34,057 | 34,119 |
| self-compile functions claimed | 14,158 | 14,159 |
| `callee captures` alone | 62 | 2 |
| `call of a non-declaration` alone | 46 | 40 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,513 identical, 0 differ.
- **Mode 3:** 19,079 cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 100,287,483,742 → 100,336,972,517 (+0.05%).
- **Lines:** +67 / −7 in `compiler/`.

## What is left in these classes
- `call of a non-declaration` (40): mostly union-arm (`variant`) arguments (d199's family) and
  generic instances.
- `closure env` (18 alone): a function value that captures.
- `indirect call` (17): a call through a non-name value.
