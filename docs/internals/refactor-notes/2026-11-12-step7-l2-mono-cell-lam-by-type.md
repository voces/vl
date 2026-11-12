# Step 7 L2: a capture cell's hole lambda is matched by type, 2026-11-12

`monoCellLamTakeAt` decides whether a hole lambda that a capture cell holds takes the cell's
function type. It used to compare two concatenated spellings:

- `want`, from the wanted pin names, each `normTypeAtom`'d;
- `got`, from the lifted lambda's parameter spellings (`monoSlotParamPins`).

These were the last two `normTypeAtom` reads in `emit_mono.vl`, which are among the body-rewrite
readers of `2026-11-10-step7-l2-mono-key-census.md` §3.

The function already receives the wanted types, `pinTys` (`monoFnTyParamTys` of the cell's
function type). It now compares them with each lambda parameter's recorded type:

- `tySame` position by position;
- an un-annotated parameter counts as `i32`, which is how the all-i32 clone leaves it;
- a missing type on either side means no match.

## Measured

A scratch probe held the typed compare beside the spelled one and counted decisions over 24,070
programs. It was never seeded.

| | decisions (programs) |
| --- | --- |
| agree | 256 (106) |
| the type matches, the spelling does not | 0 |
| the spelling matches, the type does not | 0 |
| a type missing | 0 |

The probe reports through `emitFail` and is blind to programs that already refuse. CI's sweep
covers those.

## Counts

- `normTypeAtom` reads in `emit_mono.vl`: 2 → 0, and the import goes.
- `emit_mono.vl` spelling reads: 14 → 12.
- pin-helper: unchanged. The compare is inline, and `monoSlotParamPins` keeps its other caller.

## Proof

- **Locally, on master after #7642:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict` as filed.
- **The sweep** is CI's (`sweep` label).
