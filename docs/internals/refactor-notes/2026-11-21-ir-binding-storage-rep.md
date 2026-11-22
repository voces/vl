# IR: a cell at its storage row where its initializer builds it (D14426 family 2, and its local twin), 2026-11-21

Lane IR-N4. The coordinator ruled option 1 of `2026-11-21-ir-global-cell-rep-pair.md`: the cell
takes its storage rep, and a read takes legacy's carrier. The carrier is the D14434 binding
storage column, `letBindTy` (the table legacy's `letCellSlot` is laid out from). No per-node stamp
is added. Item B of the `declaration coercion` split, the local twin, lands beside it.

## Change

- **A global, per build.** `globalInitValue` and `mapNewInit` deliver at the binding rep, as
  before. When the built value is instead at `letBindTy`'s rep, and no earlier node in this build
  set the global's rep, the initializer stores it there, and `irGlobalNote` records that rep. The
  rep is noted per function (first note wins), so another function's reads of the global stay at
  the binding rep, and the step is monotone.
- **The global's read.** In a build whose note is the storage rep, a read the checker typed at the
  binding takes the cell as it is. It becomes a temp typed at the storage type (`identRead`'s
  `stored`).
- **A local.** A declaration whose initializer builds `letBindTy`'s rep, where the binding rep was
  asked for, retypes its fresh variable to the storage type (`localStoredAt`). A read typed at
  the binding then takes the variable as it is (`localReadStored`).
- **A field read of a stored row.** `buildMember` misses when its receiver's built rep is not the
  row the field read was planned at (a permuted stored record). That case failed rule 2 before
  this check.
- **The guard.** The verifier's `RGlobalGet` rule holds an un-narrowed read whose rep is not its
  checked type's rep to the declaration's `letBindTy` rep (`globalReadAtTyOrStorage`). A local's
  variable is typed at that column, so rule 3 holds it. A control seed with the guard's storage
  arm disabled fails the row file's start body with `a global read off its type's rep is not at
  its storage row`.

Compiler lines +81 / −16 (`ir_build.vl` +65 −15, `ir_verify.vl` +14 −1, `ir_build_ref.vl` +2).
The shadow row is `tests/ir-shadow-rows/binding-storage-rep.vl`: a module list of a hole function,
and a function-local list of maps.

## Readings (base: fixpoint seed at merge-base `6716810b`; candidate fixpoint)

| reading | base | this step |
| --- | ---: | ---: |
| armed `tests/cases` covered = matched + 1 pre-existing | 65,130 | 65,148 |
| armed `tests/cases` start covered = matched + 1 pre-existing | 5,032 | 5,054 |
| `tests/cases` `uncovered declaration coercion` | 157 | 98 |
| `tests/cases` `start uncovered global initializer coercion` | 86 | 26 |
| `tests/cases` `const cell plain object: miss global initializer coercion` | 58 | 24 |
| `tests/cases` `start uncovered global read coercion` | 98 | 100 |
| corpus functions covered = verified = matched | 44,588 | 44,594 |
| corpus `declaration coercion` alone | 35 | 30 |
| corpus IR claims | 44,442 | 44,448 |
| self-compile covered = matched | 19,551 | 19,551 |
| L2 self-compile fuel | 107,659,626,761 | 107,660,276,630 (+0.00%) |
| late demands / late tag rows | 9 / 307 | 9 / 307 |

No `tests/cases` file loses a covered, matched or start-covered function. The fail and mismatch
rows are the same on both seeds, row for row. The two new `start global read coercion` rows are
start bodies that now get past their initializer and stop at a read of another global.
`ir-identity.sh --cases`: 7,593 identical, 0 differ. `--claimless`: 14,016 identical, 0 differ.
