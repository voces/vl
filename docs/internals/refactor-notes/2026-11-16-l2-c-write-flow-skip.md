# L2 (c) PR 2: a parameter written into a nullable place stays pin-generic, 2026-11-16

The second of the two PRs approved for the D3299/D3436 pin-model change (coordinator ruling,
2026-11-16). PR 1 (`2026-11-16-l2-c-tvw-param-hole.md`) let `tvPlaceWrite` narrow a place
written from a parameter hole; this PR lets the hole reach it.

## The change

`noteHoleFlow` (`check_leaf_steps.vl`) records the flows the parameter solve answers a hole by.
It now skips a bare parameter hole when:
- it is the value of the assignment being delivered (`nlAsgTgt`/`nlAsgGot`, the ambient pair
  `checkAssignStore` sets around the delivery), and
- the place's storage admits `null`, is not `null` itself, and holds no type variable and no
  literal type.

The hole stays open, so the function is instanced per pin, and the place reads at the pin's
member (`HD_TVW`).

A literal-holding place keeps the flow answer. Without it, `g("a")` pins `x` to `string`, which
does not fit `Ab | null`. The `<T>` spelling refuses that program today; un-annotated it runs and
must keep running (the literal-union template's nine cells).

Out of scope: a call argument and a `return` into `T | null` (no place is narrowed), and
`m.set(k, x)` (map reads do not narrow).

## Measured

- New matrix `hole-written-into-nullable-place-{string,null,record,number,litunion}.matrix.vl`:
  - **positions:** a local, a declared record's field, a list cell, plus a read of the parameter
    itself after the write;
  - **reads:** member, operator, `== null`, print; both faces.
  - Against a fixpoint master seed: 28 cells move to runs (string 8, record 12, number 8),
    0 runs → not-runs, 0 silent. Null and literal-union pins: unchanged.
- Fingerprint over fixtures, cases and the distilled cells/named: 2 of 20,741 programs move,
  both with identical output.
  - `generics/hole-nullable-string-cell-write.vl` and
    `literal-unions/generic-write-nullable-atom-into-nullable-string.vl`.
  - Their writes now instance per pin, so the emitted bytes differ.
- Distilled `regress.vl`: 0 runs → not-runs, 0 → silent. The 16 `nw/g1` cells D3436 names are not
  in the distilled set.
