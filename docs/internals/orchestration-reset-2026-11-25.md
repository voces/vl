# Orchestration reset, 2026-11-25

A new coordinator took over the IR migration at master `7eddff27`. This note records what the
coordinator read, what it changed, and why. The rulings are the coordinator's (2026-11-25); the
owner may overrule any of them.

## What the last cycle did well

- **Throughput.** 640 merges from 2026-11-21 to 2026-11-24 (134, 180, 171, 155 a day). About 70%
  were IR coverage or claim work.
- **Soundness culture.** Byte identity against legacy (`ir-identity.sh --cases`, `--claimless`)
  is a sharp proof. The claims-off fallback (G3, Q64) turned a class of shipped invalid modules into
  loud refusals. Q58's position sweeps found real clause-1 defects.
- **Batching (Q16, Q17)** let one PR carry a whole class family.

## What it did badly

1. **The scoreboard went stale.** I8's bar is 100% claimed per distinct function on five
   populations (ir-i8-cutover §2). It was last measured on 2026-11-20 (tests/cases 64.3%, witnesses
   65.9%, probes 69.2%, distilled 82.5%). About 600 merges later no one had re-measured it. Progress
   was reported as per-class deltas ("31 → 0"), which say nothing about the distance to I8. A class
   that hits zero on the corpus can still keep hundreds of functions unclaimed in `tests/cases`.
2. **The process grew one rule per incident.** `merge-queue.md` holds R1 to R12 and Q1 to Q71.
   Every lane had to read and obey them. Single-PR trains, nine verifier lanes, PRE-REVIEW lines,
   lane-claim broadcasts and READY lines all re-proved, on 4-core boxes, what CI already proves on
   every PR in about eight minutes (`ci-proof.sh rows`: 21 gate rows). The two proofs CI does not
   run, `ir-identity.sh --cases` and `--claimless`, are why a verifier existed. They belong in CI.
3. **Effort went into code that I8 deletes.** In four days, 20 or more `Legacy:` fixes plus many
   `D<id>` emitter fixes landed. Most existed so that a claim could match legacy byte for byte, or
   because a sweep found a legacy defect. There were also 76 inventory or docs-only commits, mostly
   rows that sweeps filed against legacy's emitter. A legacy-emitter fix pays twice: once in legacy
   and again in the IR. It buys nothing once I8 lands.
4. **Coordination churn.** Ids raced (Q70), classes collided (Q49), and lanes waited hours on merges
   that had already happened (Q44). These are symptoms of about 20 concurrent actors with no fixed
   ownership.

## Rulings (coordinator, 2026-11-25)

**O1. The scoreboard is the I8 census.** `scripts/ir-i8-census/census.sh` plus `summary.sh` over
all five populations, re-run on master at least daily by the census lane, and published as a dated
refactor note. A coverage lane picks its class from the latest ranked table. Its PR quotes that
class's distinct-function count on `tests/cases` and the witnesses, before and after, from a census
restricted to the programs the master census lists for the class. A corpus-only delta is not
progress toward I8.

**O2. CI is the queue.** Trains, verifier lanes, PRE-REVIEW and lane-claim broadcasts retire. A PR
merges when all of these hold:
- the PR's CI is green on its head;
- the lane has sent `READY #<pr> <sha>` with its proof lines (the lane brief lists them);
- GitHub reports the PR mergeable.

The coordinator squash-merges with `expectedHeadSha`. A master push run that goes red is reverted
at once by the coordinator, and the lane re-lands its PR. Fixing forward is allowed only when the
fix is one obvious line. Until CI runs `ir-identity.sh`, the lane runs `--cases` and `--claimless`
once on its head and quotes both summary lines. The infra lane's first job is to move both into CI.

**O3. Legacy's emitter is frozen except where a claim needs it.** A defect in legacy's emitter
(`wasmEmit.vl`, `emit_*.vl`, but not in a plan or tail the IR shares, ir-design §10.1(a)) is not
fixed in legacy. The IR claims that shape correctly instead. Where legacy is wrong, the IR's bytes
differ by design. That is listed as a Q57 divergence, marked `legacy-wrong`, and proved by the
program's own expected output, not by parity. The checker, mono and shared plans keep being fixed,
since they outlive I8. Exception: a clause-1 silent wrong value that a consumer meets now goes to
the soundness lane.

**O4. File rows sparingly.** A row is filed only for a defect that its finder does not fix in the
same PR and that outlives I8 (checker, mono, shared plans, std, host). A legacy-emitter defect
found by a sweep gets one line in its lane's refactor note, not a row. Each lane keeps a reserved
id range (Q70 stands).

**O5. Fixed ownership, big PRs.** Each lane owns named classes or files for its life. A lane
holds at most three open PRs. A PR carries a class family (Q16). One mechanism per commit stays, so
a veto can split it.

**O6. No new queue rules without a check.** A new process rule lands only with the script or
test that enforces it. Otherwise it goes in `working-rules-evidence.md` as an observation. R1 to
R12 and Q1 to Q71 stay as history. Where they conflict with O1 to O6, O1 to O6 win.

## Lanes at the reset (cloud sessions, 4 cores each)

| lane | owns |
|---|---|
| INFRA | `ir-identity.sh --cases`/`--claimless` as a CI job; the lane `ready-check.sh`; the `legacy-wrong` divergence kind (O3) |
| CENSUS | the daily I8 census and ranked table (O1); the per-class program lists |
| ADOPT-IR | the open IR PRs and branches from the last cycle |
| ADOPT-CHK | the open checker, legacy and soundness PRs and branches from the last cycle |
| COV-CLOS | `read of <name>` (captured variable), `closure env` |
| COV-IS | `is rung`, `null test boxTag`, `rep ?` |
| COV-CALL | `call of a non-declaration`, `indirect call`, `intrinsic none` |
| COV-START | start bodies (global initializer `unionBox`/`widen`/`coercion`/`variant`, `array new default`), then `open local/temp/parameter type` |

The class split follows the 2026-11-20 census. It is re-cut when the CENSUS lane publishes.
