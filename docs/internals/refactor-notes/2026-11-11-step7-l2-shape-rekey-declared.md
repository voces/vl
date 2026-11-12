# Step 7 L2 §7: a declared record's inline shape also finds its struct row by type, 2026-11-11

#7219 made the D6 inline-shape interner find an anonymous record's row by type first
(`structRowOfRecordTy`). A declared record kept its declaration's name as the key, waiting on
lane w319's struct-row key. w319's measurement settles it: a declaration selects nothing at
the struct-row level. Rows of one canonical type with the same layout are one WasmGC heap type,
and they merge without moving the sweep. So the key has no declaration half, and the interner
now asks the type for a declared record too.

The base is master `765cf650`+, with a fixpoint seed on both sides. The population is the whole
sweep, 23,913 programs.

## Changed

- `internInlineShapeTyGo` asks `structRowOfRecordTy(fieldsTy)` before the field-set find for
  every record with a type, not only one with no declaration name. A type with no row falls
  back to the field-set find, as before.

## Proof

- **Local full sweep.** `sweep.vl record` was run with fixpoint seeds on both sides. 23,851 of
  23,913 programs are the same, with 62 bytes-only movers, 0 output movers, 0 runs → not-runs
  and 0 new compiler traps. The 62 are 5 cases, 56 distilled cells and the D2174 witness. The
  cases:

  | program | bytes |
  | --- | --- |
  | `unions/struct-holding-self-recursive-arm.vl` | 3,660 → 3,604 |
  | `unions/self-recursive-arm-field.vl` | 1,312 → 1,288 |
  | `generics/instance-holding-union-arm.vl` | 722 → 714 |
  | `generics/type-param-write-reads-at-pin.vl` | 1,989 → 1,985 |
  | `closures/generic-fn-record-not-built-at-declared-row-of-other-signature.vl` | 2,801 → 2,801, other bytes |

  The 56 distilled cells are the `d3290_r4_gN` named set. By their cell names, they are a
  field `S` under coalesce or if-not-null in a generic.
- **Overlap with #7244.** Three of the cases also move under #7244, the dedup by storage type.
  Both changes merge the same duplicate rows, from different finds.
- **Checks.** Listed in the PR.
