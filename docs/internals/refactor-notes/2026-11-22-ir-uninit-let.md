# IR coverage: an uninitialized binding, and the shadow reads the frame the claim reads (2026-11-22, lane IR-N7)

`stmtNode` skipped any `let` with no initializer as `declaration`. Legacy's `emitLetDeclStmt`
writes nothing for one: it binds the name, and the wasm local's default covers the declaration.
For a reference binding, the collect walk marks the slot in `localUnset`. `fbEmitLocalsVec` then
declares it nullable, and `fbLocalGet` and `fbLocalTee` assert it non-null (`fbLocalIsUnsetRef`).
The IR writes its locals and reads through the same writers.

## Change

- **`stmtNode`** (`ir_build.vl`) writes nothing for an uninitialized binding, as legacy does.
  `declaration` stays the miss for a binding with no IR variable.
- **`emitFuncCode`** (`emit_sections.vl`) closes the frame (`fbEndFunc`) after the armed shadow
  instead of before it:
  - `fbEndFunc` only zeroes `fbFrameLocals`, and nothing is written between the two points, so
    legacy's bytes do not change;
  - the claim path already lowers inside the open frame (`irClaimFn`, then `fbEndFunc`);
  - with the frame closed, the shadow read every unset reference local as non-null, declared it
    `0x64` and dropped its `ref.as_non_null`. It reported a mismatch the claimed bytes do not have.
- **New row:** `tests/ir-shadow-rows/uninit-let.vl`, an uninitialized `i32`, `string`, list and
  generic binding.

## Measured

Against master 4fbcb806's fixpoint seed, over the 28 files the `declaration` class names, with an
L1 head:
- covered = matched 100 → 119, with no mismatch;
- `declaration` 28 → 0. 17 now stop at `labelled block`, and 2 at `if switch`;
- starts: `declaration` 4 → 0, all 4 now `labelled block`;
- before the frame-order change, the same build covered 119 and matched 106. All 13 mismatches
  were an unset reference local's `0x63`/`ref.as_non_null`. Its claim build was byte-identical
  to legacy's, for example `generics/uninitialized-let-in-generic.vl`.
