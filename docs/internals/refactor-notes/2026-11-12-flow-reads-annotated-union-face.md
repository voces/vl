# Flow-sensitive reads, the annotated-union face, 2026-11-12

This is the second PR of the owner-ruled item "A read of a `let` takes its most recent write's
type" (DECISIONS.md). The design is `2026-11-12-flow-reads-design.md`. A read of a `let` of a
union type takes the member its most recent write stored:

```vl
let x: i32 | string = 1
x = "sss"
print(x.length)
```

## The rule as built (checker)

- **A write installs a row.** A write to a `let` of a union type installs a `NAR_KIND_ASG` row
  of the member it stored (`letUnionWriteNarrows`, `retireNameNarrowing`). An annotated
  initialiser installs one too (`checkLetDeclNodeIn`). The member is `writeMemberTy`'s: the one
  the value is, else the sole one it is assignable to.
- **Writes are judged against storage.** This holds in a block that re-declares the name
  without a row of its own (`asgRowStoreTy` in `writeStorageTy` and `retireNameNarrowing`). The
  `=` target is recorded at storage (`letWriteTargetTy`), so the emitter's scratch reservation
  agrees with the store.
- **A retiring write ends an enclosing block's row** that cannot hold the value
  (`asgRowsRetireBelow`). The join below the block then meets both paths.
- **A capture or a top-level function** reading a union `let` that any later write may change
  reads storage (`crCaptureLosesNarrowing`). The guard rules for writing calls apply unchanged.
- **`is` and `match` over a write-narrowed `let`.**
  - The test is lowered at storage: the operand is recorded unnarrowed (`isOperandAtStorage`).
  - Its then and else facts are computed from storage (`isTestCurTy`).
  - A guard over it is a real guard row (`applyNarrows`).
  - So a structural fit is tested on the box's contents (D15952).
- **`writeReNarrowTy`** picks, among several members a value is assignable to, the one it is the
  same variant as (`{ v: 2 }` into `Box<i32> | Box<f64>`).

## The dead-test policy (coordinator ruling (a), re-ruled (ii))

- **Refused:**
  - an `is` the write made impossible (the existing D2198 error);
  - a `match` arm naming a member the write ruled out ("is not a member of"). A `match` over a
    write-narrowed `let` is complete over the member set the write left.
  - an `==` of two write-narrowed values that cannot compare.
- **Legal:** an always-true test, with or without `else`. Its `else` is typed from storage.

DECISIONS.md records this as "A WRITE'S NARROWING MEETS THE SAME REFUSAL", and open-rulings.md
as `write-narrowed-dead-test`.

## Measurement

**Sweep.** `sweep.vl record` over the whole population, the fixpoint master seed `06baca0f`
against the fixpoint candidate:
- 24,161 of 24,177 programs the same; 16 bytes-only movers; 0 output movers;
- 0 runs → not-runs and 0 new compiler traps;
- 1 program only in the candidate, the new fixture.

**The price: 11 programs, in their old spellings.** Each one ran on master. The candidate
refuses each old spelling, and its new spelling runs with the same output:

| program | old spelling on the candidate |
| --- | --- |
| `closures/capture-narrowed-global-and-cell.vl` | `is` 'boolean' can never match f64 |
| `closures/generic-written-into-function-or-string-union-slot.vl` | `is` 'string' can never match (T) => void |
| `generics/union-member-generic-application-inline-nullable.vl` | `is` 'Tag' can never match Pair<i32,string> |
| `types/transparent-alias-union-arm-positions.vl` | `is` 'MyCat' can never match i32 |
| `unions/empty-list-into-u8-list-union.vl` | `is` 'B' can never match u8[] |
| `unions/empty-list-is-disjoint-list-arm.vl` | `is` 'string[]' can never match i32[] |
| `unions/function-arm-reassign-after-narrow.vl` | `is` 'Uz' can never match (i32) => i32 |
| `unions/nested-atom-list-arm-tags-apart.vl` | match pattern `i32[][]` is not a member of K[][] |
| D14302's witness | `is` 'Tag' can never match Box<i32> |
| D7701's witness | cannot compare (i32) => i32 with (string) => i32 |
| D3944's witness | `is` 'string' can never match (T) => void |

**Two more programs moved without losing a run:**
- D4018's witness moved from emit reject to a "cast does nothing" check refusal. It now writes
  conditionally and keeps its emit reject.
- `soundness/union-narrow-reject.vl` became check-clean, as the ruling says it should. Its
  must-error contract now uses a parameter.

**Matrix.** `capability-matrix.vl` over the new template
`union-let-read-after-write.matrix.vl`, master seed against the candidate: 0 of 46 → 46 of 46
graded cells run. 0 runs → not-runs, 0 silent, 0 program traps.

**Prototype defects caught by the sweep and fixed before landing:**
- 3 emit traps (scratch-frame reservation);
- 4 traps and 4 lost refusals around writing calls and captures (D2390, D2402, D2462,
  call-ends-narrowing-*);
- a silent wrong output (D15952, now pinned).
