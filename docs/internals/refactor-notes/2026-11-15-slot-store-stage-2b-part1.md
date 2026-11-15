# Slot store, stage 2b part 1: the classes alone close the slot facts (lane S, 2026-11-15)

Stage 2a ([`2026-11-14-slot-store-stage-2a.md`](2026-11-14-slot-store-stage-2a.md)) landed the
place-class engine behind the values cascade. This PR deletes the cascade: `elabSlotFacts`,
`elabSlotInstFacts` and `elabSlotBundleFacts` take every function-holding slot fact from the
classes. Part 2 switches the delivery walk's readers and deletes the walk.

- **Net:** +34 compiler lines against master `83a90988d` (486 added, 452 deleted). The record and the engine rules cost about what the cascade, its dead helpers and a write-only check table it freed save. The pair turns negative with part 2, which deletes the walk (about −1,000 to −1,300).
- **Pin helpers:** `emit_mono` functions 908 → 908; part 1 touches no mono reader.

## What changed

- **The tables are one record** (`EPL: EplTables`, review L5). `eplBuild` is `EPL = eplFresh()`.
- **The cascade is deleted.** `elabSlotClose`, `elabSlotCloseWhole`, `elabSlotFromSources`,
  `elabValsAreFns`, `elabWholeAtAnn` and `elabHoleParamsAll` had no other caller (194 lines).
  - `elabBindingWholeTy`, `elabHeldFnTy` and `elabHeldClosedTyAt` stay. The walk's readers
    (`elabHeldValTy`, `elabUncalledSlotTy`, `elabCallNamesOne`, `elabTyAtPath`, …) still call
    them, so they go with the walk in part 2.
  - The 2a estimate of about −700 for the cascade counted those shared helpers.
  - `fnSlotAnnTyOf` (`check_elab_cap.vl`), which only the cascade read, goes with its table
    `fnSlotAnnTys`. `fnSlotAnnNote` now records only the slots handed open.
- **Eleven engine rules replace what the cascade did.** Each was found by a gate witness or a `tests/cases` program. The distilled corpus alone moved none of them: five came from `deno task test`, and one from the late-demands gate.

| rule | what it replaces | found by |
|---|---|---|
| Demand at a closed leaf: each top-level instanced member with no instance at the leaf's parameters is demanded there, in the program pass only. | The cascade's demand order (`elabHeldFnTy`'s `elabResultAtParams`). | D15753, D15754, D15943 (runs → invalid wasm without it) |
| Uncalled, late: after the settle, an uncalled class closes at its members' one agreed instance, or at the D9100 default when none has one. | `elabHeldFnTy`'s uncalled branch. | the `d15203`/`d15294`/`d15207` corpus cells (runs → emit reject) |
| A child place takes its bounded parent's step: places keep `(parent, step)` links, merged on union. | `elabSlotClose` reading an annotated destination through `[m2]`. | D16123 |
| The engine builds the write index (`cwIxBuild`). | Under `cwIxWant` the first pass drew no edges. 2a hid it, because the cascade answered first. | D16123 |
| A nested member copied into a container answers by its one instance under the frame being read, at the leaf's parameters. Not for a holder that is the function itself: mono instances that one with its binding. | `elabSlotClose` for a written container in a generic. | D7201; the holder-itself limit is from late demands (below) |
| An uncalled function binding stays open. A holder that is itself a function closes only by a call or a bound; with neither, it is handed on or unread. | `elabSlotCloseWhole`'s first test. | `closures/hole-fn-if-to-hole-param` |
| A slot handed to an open function parameter takes no fact: it is delivered at each call's own signature. | `elabHeldFnTy`'s first test. | the same |
| A member whose own signature is closed at the leaf's parameters answers by it (an annotated lambda, which has no instances). | `elabHeldOwnResult`. | `generics/generic-value-slot-written-in-generic-body-at-two-instances` |
| The frame rule also covers a holder that reads its function out of a container (`h = o.f`), and a nested member with no instance under the frame is demanded there. An instance under the frame whose parameter has no recorded type does not disagree. | `elabSlotClose` / `elabSlotFromSources` per instance. | `closures/written-let-in-record-field-aliased-called-in-two-instances`, `closures/returned-lambda-literal-infers-its-parameter` |
| A field the program re-points with a whole assignment does not take its record literal's value into its class (D12239). | The walk following the most recent write. | `closures/generic-list-held-or-returned-written-lambda-called-where-it-fits` |
| A container leaf that answers by a nested member's frame instance also demands that member at the leaf's parameters, while the run is open. That is the instance mono reads for the slot's fact. | The cascade's own demand of a nested member, which minted it in time. | late demands: without it, `record-of-written-lambda-let-in-generic-called-per-instance`, `…-returning-capture-per-instance` and `two-lambda-written-let-in-two-instances` minted it after the run |

## Readings

Fixpoint seeds: master `83a90988d` and this branch, each byte-identical on a second refresh.

| check | reading |
|---|---|
| distilled corpus, per cell (class and message) | 12,036 of 12,037 identical to master. The one mover is `dord011`: `trap_loads` → loud emit reject (`a function value is called at two signatures, and the closure it holds was built for one`). That is a trap now refused, not a lost `runs` |
| filed witnesses, `--strict`, both inventories | ok (the gate's row) |
| `decl-order-ab.vl` | 314 of 5,136 cases move, 38 to a clause-1 outcome. Master has 39; one case not in the baseline appears on both |
| late demands | 2 in 2 files of 6,885 built, against master's 4 in 4: no file rises, and two fall (`error-record-field-of-generic-called-under-shadowing-name`, `error-written-record-field-of-generic-called-and-read-under-is`). The baseline is lowered for the falls only, written from this branch's fixpoint seed |
| L2 self-compile guest fuel (`VL_FUEL=1`, each seed building its own tree) | 86.291e9 against master's 86.303e9: −0.01% |
| seed size | 6,888,449 bytes: +3,866 (+0.06%) over master's fixpoint (gate: ok) |
| `scripts/gate.sh` | every row ok but `ci-native`. Its 5 failures are the seed-cache and sidecar tests, which fail on master's seed too in this container (`~/.cache/vl/seed` is gone, and the container runs as root) |

## Declaration order: what part 1 can and cannot move

This was measured on the 38 clause-1 movers of `decl-order-ab-baseline.txt`. Each was run as
written and with its functions last, with slot facts dumped from a scratch build.

- **21 record no slot fact in either order.** Their dependence is the keying of calls through
  generic function values, filed as [D16281](../inventory/D16281.md) (lane T).
- **13 differ in the checker's tag decision.** The set is tagged as written and untagged with the
  functions last. The classes agree in both orders, but members with different results share a
  closure only through the tag. That is `fnTagDecide` deciding from call notes recorded before
  the members' bodies are checked. It is lane G's, under D16381.
- **4 are the slot store's own:** `hole-fn-returns-call-through-widened-fn-list-runs`,
  `widened-fn-list-element-bound-in-hole-fn-called-runs`,
  `frame-list-of-fn-records-of-different-results-captured-by-closure` and
  `generic-list-returned-to-annotated`. **0 of 4 stop moving** on this branch, as on master. Part 1 replaces the cascade with the engine and keeps every decision the same; these cells move in what the engine reads, and part 2 takes them up.

## Part 2

The walk is `elabSlotDeliveries` and its family. 2a's note listed its readers, but missed
`elabDlvActiveKey`, `elabDlvEnterCall`, `elabLitReturnedBy`, `elabReachClosure`, `elabSameTys`,
`elabTyFnFree`, `elabRetsAdd` and `elabLamParamTyAt`. The mono readers are lane M's; part 2 deletes
the walk once they have switched. The engine's child reads move to lane H's accessors (`tyElemOf`,
`tyKeyOf`, `tyValOf`, `tyOpen`) when those land.
