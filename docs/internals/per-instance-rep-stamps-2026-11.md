# Per-instance record builds for generic makers (D17874) — proposal, 2026-11-28

I8-PREP. Coordinator ruling (2026-11-28): D17874 stays open and unscheduled at this yield. Design only:
the one probe build below measured, and landed nothing.

## (1) Where a literal's rep stamp lives today, and why it is one per node

- **The record solve's stamp.** `recordRepTyAdopt` → `repStamp` (check_fit_rules.vl) writes
  `nodeRepTyIx[node]` (check_core_state.vl), a column with one entry per AST node. It is one per
  node because the record solve runs once over the program, on the shared AST.
- **The elaboration's stamp.** During an instance's re-check (`elabCapLive()`, check_elab_cap.vl),
  `repStamp` writes `elabCapRep[node]` instead. That is banked as `elabNodeReps[node] = [key, ty,
  …]` (emit_elab.vl), so it is per (node × instance key) already. `litRepTyAt` reads that first.
- **What a generic body's literal gets.** `recordRepTyAdopt` stamps nothing for it (`litPinN`, and
  `stampsHeld` from D14721). The solve's decision for a maker is not a node stamp at all: it is the
  kept table `recKeptFnPush(fd, own, dst)` / `recKeptFnDstOf(fd, own)` (check_rec_rows.vl).
- **That table is already keyed by instance.** `own` is the call's result type, which differs
  between instances of a maker whose result names `T`. The emitter reads it per instance key:
  `elabRetOf(k)` returns `recKeptFnDstOf(ekDecl[k], r)` for the instance's own result `r`.
- **Hole makers already use this path.** `function mk(x) { return { f: null, g: x } }` with
  `mk(8)` at `J` and `mk("s")` at `K` runs on master and prints the write through each record
  apart. That is D17874's two-instance shape: a hole template is admitted by `recInferredFnOf` as a
  non-generic, and each call's `own` names its instance.

So the gap is not storage. A generic maker is kept out of `recInferredFnOf` unless it has one
instance (#10851), and the solve's site tests compare a maker's calls across instances.

## (2) The shape: one entry per (maker × instance result) in the kept table, read through the instance key

- **No side table on node index.** The per-instance identity is the instance's result type `own`,
  already the kept table's key. The emitter reaches it only through `elabRetOf(k)`, the instance
  key's own reader.
- **Admission.** Admit a generic maker in `recInferredFnOf` when each of its instances, grouped by
  its calls' result type `own`, has calls that do not land apart. That generalises #10851's
  `recGenericOneInstance` from "one instance" to "each instance lands at one record".
- **What stays refused.** One instance at two differing records (e3) still has two `dst` for one
  `(fd, own)` key. It needs a converting copy of an instance's result, which emit has no lowering
  for (`convert record -> record`, `emit_plan_union.vl` `widenPlan("convert")`). That stays
  refused at check, as today, and is a separate decision.

## (3) Readers that change, enumerated by instrument

The instrument: a probe build that dropped only #10851's same-instance test, run on the D17874
witnesses (scratchpad, not committed). Each failure names a reader still comparing across
instances or reading the generic decl instead of the instance:

| witness | probe outcome | reader that must read per instance |
| --- | --- | --- |
| c2: `mk(8)` at `J`, `mk("s")` at `K` | refused at check | `recGenericLandsApart` → `recSitesLandApart` / `recSiteLandsOff` (check_fit_rules.vl): group sites by `own` before testing apart |
| c1: `mk(8)` at `J`, `mk("s")` free | emit `global initializer coercion` (clause-1 split) | the module-global initializer's delivered row (wasmEmit.vl, near the `recKeptFnDstOf(fnIx, rf.retUTy)` read): must take the instance's `elabRetOf(k)` |
| d2: `mk` inside `outer<U>` called at two types | emit `convert record -> record` | the hand-on through a generic wrapper (`recFnBuiltAtDst`'s `calls` leaf → `recAdoptNote`): stays refused through `recWithinInstancedFn` |
| c3, d1 | run | none |

- **Readers that need no change:** `litKeptRepOf` / `litKeptCallRep` (emit_elab.vl) already pass
  the call's own result to `recKeptFnDstOf`, and `elabRetOf` already reads per key.
- **Not yet confirmed:** mono's literal build inside an instance, which `litRepTyAt` serves from
  `elabNodeReps`, then the kept row. The probe never reached emit for c2, so this needs one more
  probe after the site grouping.

## (4) Yield

- **Instrument:** a probe compiler (#10851's tree plus a `D17874-PROBE` marker). It marks a call
  of a generic fresh maker delivered at a record storing a field differently, wherever the
  one-instance rule refuses it or its calls land apart.
- **Validation:** the marker fired on the c1, c2 and e3 controls and stayed silent on the served
  a, c3 and e5.
- **Population:** every file in `tests/cases/`, `scripts/silent-sweep/distilled/` and
  `scripts/capability-probes/` that declares a generic function: 7,648 of 28,153 files (2,310
  oracle cases, 4,894 distilled cells, 444 probes).
- **Result:** 2 hits, both this lane's own control pins
  (`records/error-generic-maker-at-two-instances-at-two-records.vl`,
  `records/error-generic-maker-at-one-instance-in-joins-at-differing-records.vl`). 0 distilled
  cells and 0 capability probes reach the shape.

## Recommendation

Keep D17874 open and unscheduled. The yield is zero programs beyond this lane's own pins. The
change is small and localised: the site grouping in (3), the global-initializer reader, and the
mono literal confirmation. It is not the general IR change the per-node framing implied, because
the per-instance store already exists.

Revisit it when a corpus or probe cell reaches the shape. Add a capability probe for c2 now, so
the next sweep counts it (`scripts/capability-probes/generic-maker-at-two-instances-at-two-records.vl`). Until then, the refusal is clause-2 debt with a named mechanism, pinned
by the two error controls.
