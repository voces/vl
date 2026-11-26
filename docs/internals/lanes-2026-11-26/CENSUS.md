You are lane CENSUS of the VL IR migration (repo voces/vl). The coordinator is session session_01CnBfvYZyoydFLJ3hmQsKHS; report to it with send_message. The previous coordinator and all its lanes stopped; you replace the earlier CENSUS lane.

Goal: I8 — delete legacy's expression emitter. The owner ruled the bar stays at 100%: zero unclaimed units (functions + start bodies) on all five populations. About 225 units remain fleet-wide.

Read first, in this order:
1. docs/internals/lane-brief.md — your whole procedure (setup, ownership, Before READY, Landing). Follow it.
2. CLAUDE.md (repo rules).
3. The retro at branch ccr-435155f6-4mp54l: `git fetch origin ccr-435155f6-4mp54l && git show FETCH_HEAD:docs/internals/orchestration-retro-2026-11-26.md`. Its V1–V7 changes apply to you now.

Changes from the lane brief (coordinator, 2026-11-26):
- V5: a coverage PR carries NO refactor note and NO inventory row. Its body states the class, the units claimed before/after on that class's programs under VL_IR_REQUIRE_CLAIM=1, and CI. Keep the one-line changelog.d/<branch>.md.
- V7: do not fix legacy's own emission (wasmEmit.vl, emit_*.vl outside shared plans/tails). If you must touch them, the PR body says why the IR cannot take the shape alone.
- Bundle: one PR per mechanism family, several classes at once where they share a mechanism; at most 3 open PRs.
- Land yourself on LAND-OK (lane brief "Landing"), except shared-plan-wide output changes, baselines or ratchets: send `READY #<pr> <sha>` and the coordinator merges. The coordinator also merges any green, mergeable PR it sees.
- Messages to the coordinator are one line each: `READY #<pr> <sha> <class delta>`, `LANDED #<pr> <sha> <units before→after>`, `BLOCKED <what> <what you need>`, `DONE <summary>`. Design questions: propose and proceed (R9).

Your work list: the units the latest i8-red run (workflow i8-red-nightly.yml, artifact i8-red, red.tsv) assigns to owner CENSUS. The coordinator will send you the list once the current run finishes; start setup now. If no list has arrived when setup is done, compute it yourself: `scripts/ir-i8-census/census.sh` + `scripts/ir-i8-census/class-programs.sh` on your fixpoint seed, filtered to your owner by scripts/ir-i8-census/owners.tsv (on master, or PR #10444's branch census-registry-8 if it has not merged).

In flight: PR #10444 (registry-8, owners.tsv). Land it first (docs/scripts-only, merges on green). Then, before your units, two infra changes from the retro:
- V2: make .github/workflows/i8-red-nightly.yml run hourly (cron) on master, keeping its artifact and summary; the job summary is the fleet scoreboard.
- V3: red.sh routes an unowned class by its mechanism-family prefix (registry-8's table: convert→COV-CALL, local rep→COV-START, is/box→COV-IS, coalesce/short-circuit/compare→COV-UNION, lambda/closure→COV-CLOS, global/if/assignment/operand→START-2, else CENSUS); owners.tsv keeps only exceptions. No more registry PRs.
Then your own units: map / store / the rest, the open-type family (open temp/local/parameter type, parameter rep unsup, shared member callee kid, closure argument box), box of a null-typed value, claim fell back.

Work largest class first. After each landing, start the next item. When your list is empty, send DONE and ask for more.
