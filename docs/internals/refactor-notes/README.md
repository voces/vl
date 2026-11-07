# Refactor notes

Dated measurements from the architecture migration, one file per section, moved verbatim out of
[architecture-target-2026-10.md](../architecture-target-2026-10.md), which keeps the target, the decided
design, the seven steps and their status. A new measurement goes in a new `YYYY-MM-DD-<slug>.md` here,
with a line in this index; the PR that moves a step also updates the target doc's status section.

Newest first:

- [2026-11-07-identity-typing-shadow](2026-11-07-identity-typing-shadow.md): Identity typing (A) as a shadow: every specialized argument has its singleton, instance delta 0, 1,557 joins become sets.
- [2026-11-07-record-literals-closed-from-bindings](2026-11-07-record-literals-closed-from-bindings.md): Record literals closed from the bindings they read (was §3.4).
- [2026-11-07-argument-keyed-instances-design](2026-11-07-argument-keyed-instances-design.md): Argument-keyed instances: design note (was §3.4).
- [2026-11-07-function-let-slot-fact](2026-11-07-function-let-slot-fact.md): A function-holding let's slot fact, from its calls (was §3.4).
- [2026-11-07-function-list-hole-binding](2026-11-07-function-list-hole-binding.md): A function list's hole binding (was §3.4).
- [2026-11-07-argument-pin-arms](2026-11-07-argument-pin-arms.md): The argument pin's arms, measured (was §3.4).
- [2026-11-07-instance-identity-non-function-arg](2026-11-07-instance-identity-non-function-arg.md): Instance identity for a non-function argument, measured (was §3.4).
- [2026-11-07-mono-hazards-and-parked](2026-11-07-mono-hazards-and-parked.md): Mono's standing hazard, the parked hub, and B2's named bar (was §3.4).
- [2026-11-07-elaboration-reader-contracts](2026-11-07-elaboration-reader-contracts.md): The elaboration readers' contracts (was §3.4).
- [2026-11-07-node-walk-value-returns](2026-11-07-node-walk-value-returns.md): Node type, instance result, walk type and value returns (was §3.4).
- [2026-11-07-slot-type-and-instance-binding](2026-11-07-slot-type-and-instance-binding.md): Slot type, instance binding and slot deliveries (was §3.4).
- [2026-11-07-unbound-default-and-function-holding](2026-11-07-unbound-default-and-function-holding.md): The unbound default, the open design questions, and the function-holding fact (was §3.4).
- [2026-11-07-slot-type-unassessed-and-written-let](2026-11-07-slot-type-unassessed-and-written-let.md): Slot type's 15 unassessed, and the written-let gate and type (was §3.4).
- [2026-11-07-exit-census-evening](2026-11-07-exit-census-evening.md): Exit checklist, re-census of 2026-11-07 (evening) (was §3.4).
- [2026-11-07-exit-census-morning](2026-11-07-exit-census-morning.md): Exit checklist, re-census of 2026-11-07 (morning) (was §3.4).
- [2026-11-06-call-half-and-value-half](2026-11-06-call-half-and-value-half.md): The call half and the value half (was §3.4).
- [2026-11-06-per-call-delivered-rep](2026-11-06-per-call-delivered-rep.md): Next stage, first item: a per-call delivered-rep fact (was §3.4).
- [2026-11-06-monoflow-read-rewrite](2026-11-06-monoflow-read-rewrite.md): Value returns, the uncalled-slot gates, and the `monoFlow*` read rewrite (B1, B2) (was §3.4).
- [2026-11-06-slot-type-reach-parked](2026-11-06-slot-type-reach-parked.md): Slot type: `monoReachSlotTy`, parked and pruned (was §3.4).
- [2026-11-06-exit-checklist-pin-helpers](2026-11-06-exit-checklist-pin-helpers.md): Exit checklist: the pin helpers, census of 2026-11-06 (was §3.4).
- [2026-11-06-emit-mono-queue-shadows](2026-11-06-emit-mono-queue-shadows.md): Shadows of the queue, the fallback sources and bucket 1 (was §3.4).
- [2026-11-05-canonical-instance-key](2026-11-05-canonical-instance-key.md): The canonical instance key, measured (was §3.4).
- [2026-11-05-emit-mono-decision-arms](2026-11-05-emit-mono-decision-arms.md): emit_mono's decision arms: the coverage probe and the queue (was §3.4, opening).
- [2026-11-05-flow-table-retirement](2026-11-05-flow-table-retirement.md): Retiring the flow table, reader by reader (was §3.3).
- [2026-11-02-split-plan-recensus](2026-11-02-split-plan-recensus.md): What stands between master and deleting the split plan (was §3.2).
- [2026-11-01-seed-growth](2026-11-01-seed-growth.md): Where the seed's growth went, 0becd8120 → 9d1d7374 (was §4.1d).
- [2026-11-01-scoreboard-reading-b9f2a457f](2026-11-01-scoreboard-reading-b9f2a457f.md): Scoreboard reading at b9f2a457f (afternoon) (was §4.1c).
- [2026-11-01-scoreboard-reading-2d9c02fc8](2026-11-01-scoreboard-reading-2d9c02fc8.md): Scoreboard reading at 2d9c02fc8 (was §4.1b).
- [2026-10-31-scoreboard-reading-cb348241](2026-10-31-scoreboard-reading-cb348241.md): Scoreboard reading at cb348241 (was §4.1a).
- [2026-10-25-pr-4813-do-not-queue](2026-10-25-pr-4813-do-not-queue.md): PR #4813 (L2 D1 stage 11): do not queue as is (was §5).
- [2026-10-25-scoreboard-baselines](2026-10-25-scoreboard-baselines.md): Scoreboard baselines (76a3eb8fd) (was §4.1).
- [2026-10-25-first-landings-findings](2026-10-25-first-landings-findings.md): Findings and decisions from the first landings (was §3.1).
- [2026-10-25-evidence-witness-family](2026-10-25-evidence-witness-family.md): Evidence: the witness family, its root cause, and the pipeline survey (was §1.1–§1.3).
