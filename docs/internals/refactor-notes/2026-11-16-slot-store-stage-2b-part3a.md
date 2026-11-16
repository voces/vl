# Slot store, stage 2b part 2b(iii) A: two more elab readers read the classes (lane SLOT, 2026-11-16)

Part 2b(ii) ([`2026-11-15-slot-store-stage-2b-part2-readers.md`](2026-11-15-slot-store-stage-2b-part2-readers.md))
left the delivery walk with its readers listed below. This PR switches the first two. The walk is
deleted once every reader has moved (part E of the split below).

## The remaining readers, measured at master `e1f7f37c`

The walk is `elabSlotDeliveries`, `-Omitting`, `-At` and `-Into`. Its family spans
`emit_elab.vl` 14700-17550 (102 functions, about 2,750 lines). The count of direct callers comes
from a call graph built from `name(` sites only.

| reader | reaches the walk through | PR |
|---|---|---|
| `elabRetFnListLitTy` | `elabSlotPerInstance` | A (this) |
| `elabHoleGenBindFnArgs`, `elabCloseFnArgs` | `elabValueAgreedCallTys` | A (this) |
| `elabLamGenResultTy` (and, through it, `elabHoleLamClosedOf`, `elabEnqueue`, `elabCbAtBuild`, `elabFnDeclRetAtUnder`) | `elabSlotDeliveries` | B |
| `elabLitSlotCallees` (`emit_sections.vl` `elabPrepare`, `emitProgramRun`) | `elabLitSlotCallTys`, `elabLitCallResultTy`, `elab{Slot,Value}CallTysOpenFns` | B |
| `elabValueSlotUncalled` | `elabSlotUncalledOmitting` | C |
| `elabRetsReachProbe` | `elabValueReturnsFrom` | E (a probe; it goes with the walk) |
| 12 `emit_mono.vl` functions, 19 sites: `monoDeclPathKeysIn` (3), `monoSlotDeliveryTy`, `monoPinFnParamTys`, `monoFlowSlotPins`, `monoPinListElems` (3), `monoPinNestedListElems` (2), `monoStoredSlotFnTy` (2), `monoElemFnPinTys`, `monoPinOpenCallLams`, `monoPinNoteReachLets`, `monoPinLamAtDelivery`, `monoLamParamPinAnn` (2) | the exported walk readers | C (uncalled sites), D |

## What changed

- **`eplSlotPerInstance(holder, path)`**: whether the instances of the function `holder` sits
  in deliver the slot at different signatures (`eplSlotSigAt` per frame key).
  `elabRetFnListLitTy` asks it in place of `elabSlotPerInstance`.
- **`eplSlotAgreedCalls(holder, path, k, skip, tys)`**: the checked argument types every call
  through the slot or a copy agrees on. It leaves out calls made in a function in `skip`, and is
  false for none, an open argument or two tuples. `elabValueAgreedCallTys` is now this.
  The probe found three rules the walk applied that the first class version missed:
  - A slot in an instanced function, read for the program, gathers the calls of every instance.
  - An argument is read at its checked type. Read at its instance's type instead, a
    pushed lambda's hole-typed `k` closes there. Four `tests/cases` programs moved, so this was
    kept out of an identical PR.
  - A parameter's value is also called wherever a binding handed to it is called.
    `gs[1](l)` hands `l` to every member of `gs`, so `apply2`'s `g` agrees only with `apply3`'s
    calls too. Without this rule, `functions/lambda-through-const-list-element-forms` demanded a
    lambda late. Taking every class upstream instead over-merged: four programs disagreed the
    other way.
- **Net:** +50 compiler lines (81 added, 31 deleted). The walk's code still has its other
  readers, so nothing is dead yet.

## Parity

A scratch build answered both the walk and the classes at both readers. It logged every call
where they differed, over `tests/` and the distilled corpus (`cells/` and `named/`):

| reader | calls compared (control: log every call) | differing calls |
|---|---|---|
| `elabValueAgreedCallTys` | 348,202 over `tests/` | 0 |
| `elabRetFnListLitTy` (per-instance test and signature) | 0: no `tests/` program, corpus cell or hand-written returned-list program reaches it | none measured |

The probe logs through a list `elabRun` does not reset. `elabLateNames` is cleared when the run
starts, so a probe that logs there misses every call made during the run. The control is what
showed this. `elabRetFnListLitTy` is reached only through `elabWrittenValueTy`'s last arm. Nothing
in the tree exercises it, so it is a candidate for deletion with the walk (part E) rather than a
measured switch.

## Readings

Fixpoint seeds: master `e1f7f37c` and this branch, each byte-identical on a second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell | `regress.vl --json` byte-identical to master's |
| late demands | 2 in 2 files of 7,020 built: the baseline (the late-demands gate row) |
| seed size | 6,349,556 bytes against master's 6,349,140: +416 (`seed-size.vl --check` ok, +0.1% on its baseline) |
| L2 self-compile fuel (`self-compile-time.sh`, each seed building its own tree) | 89.820e9 against master's 89.769e9: +0.06% |
| `emit_mono` pin helpers | 908: untouched |
| `scripts/gate.sh` | all 25 rows ok |

## Next

PR B: `elabLamGenResultTy`, with a named cell for the three calls where a function is returned
through a function value's result, and the `elabLitSlotCallees` family.
