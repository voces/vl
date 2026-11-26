# Orchestration retro, 2026-11-26: velocity to I8

A new coordinator took over at master `2cd89d7b` (2026-11-26 20:04Z). Every lane session of the
previous cycle is inactive. This note reads the last six days, sets the delivery estimate, and
lists what changes. It follows `orchestration-reset-2026-11-25.md`; O1 to O6 stand unless a
ruling below names one.

## 1. Where the migration is

Delivery means **I8**: legacy's expression emitter deleted (ir-i8-cutover §8). I9 (mono onto the
IR) and I10 (the optimiser) come after and are not re-measured; they are not on this date.

The I8 blocker count is the unclaimed units (functions plus start bodies) the census finds over
the five populations. The self-compile and every `scripts/` tool are claimed already.

| reading | when (UTC) | programs that stop running | unclaimed units |
|---|---|---:|---:|
| rehearsal, master 7eddff27 | 11-25 morning | 2,064 | — |
| dress rehearsal regen 3 | 11-25 13:07 | 1,071 | — |
| census, master fcf003d9 | 11-26 early | 601 | 842 |
| i8-red-nightly run 1 | 11-26 06:45 | 478 | 628 |
| CENSUS regen-12 (registry-8, #10444) | 11-26 19:50 | — | about 225 |

From 06:45 to 19:50, 141 PRs merged and the count fell by about 400 units: **about 30 units an
hour, about 2.8 units a merge**. The 06:45 run had 195 classes for 628 units (3.2 a class);
regen-12's 69 newly unowned classes hold 83 units (1.2 a class), so the rate per PR is falling.

**Estimate at the current process:** about 225 units at a falling 10 to 20 an hour with a full
fleet is 12 to 24 working hours of coverage, then the I8 PR (about half a day: the draft exists,
§8 is scripted). That is **I8 around 2026-11-28 to 11-29**, if the fleet is restarted now. With
the fleet stopped, as it is at handover, the date does not move at all.

## 2. What went well

- **Throughput**: 240 merges on 11-25 and 122 by midday 11-26; CI is the queue (O2) and a PR's
  whole CI runs in about ten minutes.
- **The draft I8 PR (#10096)** turned an abstract bar into a concrete red list. The self-compile
  has been fully claimed since regeneration 3; the remaining work is only the coverage tail.
- **Behaviour parity over byte identity** (11-25, 11-26) removed a whole class of work: refusals
  that existed only to keep legacy's byte order (#10443 is an example).

## 3. What slowed it

1. **The fleet has no restart path.** Every lane lived in one coordinator's context. When it
   stopped, all lanes stopped, and five PRs were left mid-CI with nobody to land them.
2. **The red list is stale between hand regenerations.** The draft's last red list is regen 9,
   06:18Z, 14 hours and about 140 merges old. The nightly job ran once (by hand). Lanes picked
   work from CENSUS's local regenerations instead, which only CENSUS could see.
3. **Routing work by ruling, one PR at a time.** `owners.tsv` changed in 11 PRs in 22 hours
   (registry-1 to -8), each carrying coordinator rulings on which lane owns a class. Registry-8
   finally routes by mechanism family; that rule belongs in `red.sh`, so a new class routes itself.
4. **Per-PR paperwork on coverage PRs.** 158 refactor notes were added on 11-26 alone, plus
   changelog entries, inventory rows and multi-population A/B tables in every body. A coverage PR
   now buys about three units; the write-up costs as much as the fix.
5. **Legacy still absorbs work.** 47 merges in two days name legacy. Some are shared plans that
   outlive I8 (allowed), but several fix legacy's own emission of a shape the IR then claims
   (#10440, #10441 are both "IR and legacy"). O3 says fix in the IR only.
6. **Waiting to land.** A green PR waits for its lane to run `land-check.sh` and merge, or for the
   coordinator. With the lanes gone that wait is unbounded.

## 4. Changes (coordinator, 2026-11-26)

**V1. Restart the fleet as cloud sessions, one per owner,** from registry-8's table (COV-UNION 42,
COV-CALL 39, COV-IS 38, COV-START 35, CENSUS 30, START-2 28, COV-CLOS 13 units). Each gets the
lane brief plus its unit list. COV-CLOS has the least; it also takes the D17681/D17682 rows its
last PR filed. One more lane, I8-PREP, owns #10096 (V4).

**V2. The red list runs hourly on master,** not nightly (`i8-red-nightly.yml` cron), and its
summary is the scoreboard. A lane picks from the latest run's artifact. CENSUS stops publishing
local regenerations.

**V3. Routing is a rule, not a ruling.** `red.sh` routes an unowned class by its mechanism-family
prefix (registry-8's table). `owners.tsv` keeps only exceptions. Registry PRs stop.

**V4. The I8 PR is kept ready.** I8-PREP regenerates #10096 on master at least every four hours
and lands every piece of §8 that does not need coverage first, so that the day the count reaches
zero, I8 is one regeneration and one gate away.

**V5. A coverage PR carries no refactor note and no inventory row.** Its body states the class,
the units it claims (before and after, on that class's programs, under
`VL_IR_REQUIRE_CLAIM=1`), and CI. A refactor note is for a measurement or a mechanism others
will reuse. `changelog.d/<branch>.md` stays (one line).

**V6. Green PRs land without a wait.** The coordinator merges any PR whose CI is green on its head
and that GitHub reports mergeable, with `expectedHeadSha`, as soon as it sees it. Lanes may still
self-merge per the lane brief.

**V7. O3 is enforced at review.** A coverage PR that edits `wasmEmit.vl` or `emit_*.vl` outside a
shared plan or tail says why the IR cannot take it alone, or it goes back.

## 5. Owner rulings (2026-11-26)

- **The bar stays at 100%** (owner). I8 lands only with zero unclaimed units on all five
  populations. The coordinator had offered landing over a short named list of loud
  `cannot yet lower` programs; the owner declined, so the `runs → not-runs` veto stands.
- **The coordinator merges green PRs** (owner): CI green on the head, GitHub mergeable,
  `expectedHeadSha`; a red master push is reverted at once (V6).
- **Eight lanes** (owner): the seven owners of V1 plus I8-PREP.
