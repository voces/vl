# IR: standalone `?.` (2026-11-22, lane IR-N5)

Batch 2 of the coordinator's classes for IR-N5, on master 4cb73575, stacked on
ir-object-member-batch.

## Standalone `?.` (`expression optional member`, 40 functions, 16 files)

A probe of the 40 by leaf and chain shape: almost all are one link over an unstaged base.

| leaf | rows |
| --- | --- |
| a scalar into the union box | 13 |
| nullable record | 6 |
| pinned non-null, a plain read | 6 |
| nullable string or ref list | 4 |
| `boolean \| null` sentinel | 1 |

- **Legacy, byte-identical.** `emitOptMemberValueGo` is split into a plan (`optLeafArmOf`), a
  head (`emitOptLeafHead`) and a tail (`emitOptLeafTail`). The per-link null test in
  `emitOptChainIsNull` is split into `emitOptLinkNullOpen` and `emitOptLinkNullClose`. Each
  failure keeps its message and order (`optLeafFail`). All 164 non-error tests/cases files
  holding `?.` build byte-identical before and after.
- **IR.** A new right-hand side, `ROptRead { orV, orAt }`, in family `record`. The builder takes
  one link whose base is a non-temp variable: not staged (`optChainStagesRecv`), owing no recover
  (`readOwesNonNullRecover`), at the read's own rep. The lowering writes:
  1. the base and `ref.is_null`;
  2. the link's open, then the base again where the field's null is tested, then the close;
  3. the leaf head;
  4. the base as non-null, its niche recovered as `emitOptChainValue` does;
  5. the leaf tail.
- A first lowering tested only the base for null. Mode 2's detail showed legacy also testing the
  field, so the link's test is now legacy's own two halves.
- The rest stay named misses: `optional read chain` (two links), `optional read staged`, and
  `optional read base`.

New test case: `objects/optional-member-standalone-leaf-kinds.vl`.

The measurements are in the PR body.
