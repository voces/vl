# Step 7, lane H: `wasmEmit`'s `sFieldElemName` readers, 2026-11-13

Lane F handed over the `sFieldElemName` readers in `wasmEmit.vl`, a disjoint piece of the D6
re-key. The goal: no reader decides on the element name. Each reads the element's type and
keeps the name only as a printed label.

## Probe

A scratch compiler ran over 24,070 programs (18,910 reach emit), with a control tag on each:

| reader | the name's role | reach |
| --- | --- | --- |
| `variantBoxFieldComparable` | a gate (`bn == ""`), then the columns' key | 1 program; name and type both present |
| `emitVariantFieldEqCoreAt` | the columns' key | 1 program; both present |
| `emitStructEqFieldAt`, union arm | a gate (`bxN != ""`) | 4 programs; both present |
| `emitStructEqFieldAt`, ref-list arm | a gate (`d17n != ""`) | 13 programs; both present |
| `unionBoxEqColumns`, its name branch (no type, or the type's arms unresolved) | the arms from the spelling | 0 programs, across all 9 callers |

## The change

- **`unionBoxEqColumns`** reads a union's arms only from its type. The name branch, which no
  program reaches, is a loud floor (`emitFail`). Its name parameter is dropped from all nine
  callers.
- **The three gates** test the element type (`sFieldElemTyIx…`) instead of the element name.
  `d17n` and `bn` are no longer read.
- **`variantNestedRow`** is restored to #7679's form: the stored row by type, or a loud floor.
  Lane A's #7686 had reverted it in a whole-file conflict resolution; lane A confirmed this was
  the only hunk lost.

Left on purpose: `vbN` and `bxN`, which are passed to `emitUnionBoxEqStaged`, and `mphys`
(`emitCoalesceUnionField`). Each hands the element name on as a union label to lane G's
union-box and coalesce machinery (`unionArmTagOf`, `unionArmsOf`, `isValueUnionOfSet`), where
G's union-name cuts take it.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `1fff67ce` against this, fixpoint seeds on both sides):
  24,204 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **`$VL_OPAQUE_SNAMES=1`**, armed on this container's host rebuilt after #7661:
  - Armed, the candidate matches the armed base exactly: 24,204 same.
  - Arming moves the same 261 programs on both sides: 256 bytes-only, 5 output movers, 5
    `runs → not-runs`, 3 new traps. So none of these readers was behind an armed mover.
