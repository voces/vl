# I8 cutover: order, staging, the dead-code sweep and a re-estimate (2026-11-20)

I8 deletes legacy's expression emitter. ir-design §7 sized it at −36,000 to −45,000 lines, never
prototyped. §10.3 sets its precondition: zero misses on every population. This note plans the
cutover from measurement:
- the I8 census over all five populations (`refactor-notes/2026-11-20-ir-i8-census.md`);
- the driver census widened to the same programs;
- a static reach of the tree with the emitter emptied (`scripts/ir-i8-census/stub-reach.sh`);
- a throwaway build with legacy's entry points stubbed, run over every population.

All readings are on fixpoint seeds of master, 6851d881 (dynamic) and f44a504b (static).

## 1. What I8 deletes: about −25k lines, not −36k to −45k

Two independent readings agree.

**Static** (`stub-reach.sh`; name-level graph, so it overstates edges and understates deletions):

| stage | emptied | then unreached | total |
|---|---:|---:|---:|
| A: the 14 entry points (`emitExpr` and kin, `emitStmt` and kin, `emitFuncBody`, `emitWidened`) | 14 fns, 494 lines | 591 fns, 15,901 lines | 16,395 |
| B: plus every function that calls an emptied one, to a fixpoint, stopped at the module drivers | 509 fns, 15,770 | 956 fns, 9,028 | **24,798** |
| C: B plus every `ir*.vl` function (the IR removed as a root) | 1,133 fns, 15,780 | 2,200 fns, 26,965 | 42,745 |

B is I8: every writer of a subexpression goes, and so does what only they reach. The difference
between C and B, about 18k lines, is legacy-side code that only the IR's own references keep. That
is the shared plans and tails §10.1(a) says stay, including `emit_plan_union.vl`, `emit_plan_list.vl`
and `emit_plan_null.vl` (4.7k lines between them), and it is the figure §7 counted as retiring.

**Dynamic** (the driver census over all 26,216 programs, claiming on): drivers reached only from
unclaimed functions and start bodies hold 23,457 lines (997 functions). Drivers the claim path
calls hold 49,971 lines (`@ir`), and module passes 72,237 (`@module`). Of B's set, 19.9k lines are
in the first group, 1.9k are called by the IR, 2.0k by a module pass and 0.8k are hit by nothing.

**Re-estimate.** §7's I8 row assumed 60–75% of 59.6k lines of `wasmEmit.vl`, `emit_classify.vl`,
`emit_rewrite.vl` and `emit_collect.vl` retire. The measured share is about 40%: **−23k to −25k**.
The programme total moves from about −57k to −70k to about **−44k to −50k**. The shortfall is the
IR's reuse of legacy decisions and tails, which §10.1(a) already ruled stay. I8's size is now the
best-measured step, no longer the least certain one.

## 2. What I8 needs first

§10.3's bar is 100% claimed, measured per distinct function:

| population | claimed | the classes that keep the rest |
|---|---:|---|
| self-compile | 97.8% | `unclaimed family`, `member record`, `expression if atom join` |
| distilled | 82.5% | `read of <name>`, `object field explicitNull`, `array ref`, `box ladder` |
| tests/cases | 64.3% | `read of <name>`, `is rung`, `closure env`, `call of a non-declaration`, `open * type` |
| probes | 69.2% | `intrinsic none`, `read of <name>`, `rep ?` |
| witnesses | 65.9% | `read of <name>`, `open local type`, `is rung`, `closure env` |

The populations outside the corpus are the gap. Their largest family, closures and captured
variable reads, is now owned by IR-N6.

The stub build shows one prerequisite the plan did not have. It stubbed only the 14 entry points,
and every program the census calls fully claimed then builds, except where a global has an
initializer:
- **`emitConstCellInit`**, the global section's constant initializer writer, runs `emitExpr` with
  `gConstExprEmit` set. It broke 2,787 fully claimed programs, and `const a = 1` is enough.
- §10.1(b) stages the start function, the runtime helper bodies and the sections, not this. It
  needs an IR constant-expression writer: literals, `struct.new` and `array.new_fixed` of
  constants, a union box, a closure core.
- It is a module pass, so no function coverage step reaches it.
- No claimed function failed in its own lowering, so no claimed function reaches the 14 entry
  points through a re-entry on any population.

## 3. The order of deletion

1. **Prerequisites with no coverage dependency, in parallel now:**
   - the constant initializer writer into the IR (§2);
   - the start body classes (the global initializers to IR-N4, `array new default` to IR-N3);
   - §10.1(a)'s re-entries, each one PR. The driver census tags only 50 lines as reached through
     them alone, so they gate I8's correctness, not its size;
   - the nine claim fallbacks #9320 holds.
2. **Coverage to 100% per distinct function on every population.** This means the ranked classes of
   §2, with `ir-i8-census/summary.sh` as the scoreboard. A lane takes a class off it and quotes the
   before and after.
3. **Per-family deletion through the door, where a family's fragment is closed** (§4). Each family
   deletes the part of B that only its writers reach.
4. **I8 proper.** Empty the 14 entry points and B's writers, then run the sweep (§5).

## 4. Can I8 be staged per construct family? Only through the door

**Not by a family's own misses.** A function is claimed whole or not at all. An unclaimed function
is lowered by legacy whole, so every construct in it reaches legacy's emitter for that construct,
whatever that construct's own misses are. Family F's legacy writer is reachable from every
unclaimed function that holds an F node. A family whose misses are zero on every population still
cannot delete while any function holding it is unclaimed for another reason.

**Yes through the door (`irLowerNodeIn`, §10.2).** The door lets legacy's lowering of an unclaimed
function hand an F node to the IR as a fragment. F's legacy writer then deletes once both hold:
- every F node in every unclaimed function on every population builds as a door fragment (the
  armed shadow's `node-in` rows, per family);
- the door hosts every legacy context an F node is met in, by §10.2.1's per-context rule.

A fragment builds its whole subtree in the IR, because no escape delegates an operand back. So
staging pays only for families whose subtrees are closed: leaves and value nodes, such as literals,
atoms, numeric and string operations over leaves, and list and record literals of leaves. A
structural family (`if`, calls, blocks, statements) holds arbitrary subtrees, so its fragment
closes only when coverage is already near total. Those families go at I8 proper.

One door exists today: list literals, at `emitArr`. A staged slice per family therefore costs:
- a door at that family's writer;
- its context controls (§10.2.1);
- a `node-in` census row over the five populations.

That is a fair price only where the family's share of B is large. Measuring that share needs B
split by family, which the name-level graph cannot give. The next step is a `node-in` census over
the five populations for the door that exists. Until it proves out on list literals, plan I8 as
one deletion after full coverage, with staging an optimisation.

## 5. The dead-code sweep

Run the sweep after coverage is complete and the prerequisites have landed, in one PR:
1. Empty the 14 entry points, then grow the set to B's fixpoint. That is every `wasmEmit.vl` and
   `emit_*.vl` function that calls an emptied one, stopped at the module drivers (`emitFuncCode`,
   `emitStartBodyCode`, the global init and constant cell writers, `buildCodePayload`,
   `emitModule`). This is `stub-reach.sh`'s stage B.
2. Read `dead-exports.vl --list` over that tree, with `compiler/entry.vl`'s exports as the only
   outside roots. A test or script mentioning a name is no reason to keep it.
3. Delete what it lists, one pass, since the tool is transitive. Then delete every module-level
   `let` only those functions read.
4. Build, refresh to a fixpoint, and run the full gate. A refusal anywhere in the five populations
   means coverage was not complete, and the cutover waits.

`scripts/ir-i8-sweep.sh scripts/ir-i8-census/keep` runs steps 1 to 3 and step 4's build,
self-compile fixpoint and populations in a throwaway tree. It reports each newly failing program by
the first stub it hits, and each claim that falls back on a stub as an IR need (`--grow` adds those
to the keep-list). The keep-list holds the legacy tails the IR still calls, each with its reason.

The dynamic census cannot replace step 2. Its 6.1k lines that no program reaches are mostly code
behind modes no population turns on (the linker, the name section, the diagnostics) and refusal
builders. They are reached, just not by these programs.

## 6. Open questions

- §7's later rows, I9 and I10, were sized the same way and are not re-measured here.
- Whether `emitConstCellInit`'s constant writer belongs to the start-function stage or is its own
  step is a ruling for the coordinator. It shares no code with the start body.

## 7. The rehearsal and the plan (2026-11-25)

A rehearsal of §5 ran on master 7eddff27. It emptied the 14 entry points, grew stage B, then built
and ran every program of the five populations with both the seed and the stubbed compiler. The
method and every reading are in `refactor-notes/2026-11-25-ir-i8-rehearsal.md`; the programs behind each re-entry are
`scripts/ir-i8-census/failing.tsv`.

**Stage B as `stub-reach.sh` grows it breaks the IR.** Its name-level fixpoint also empties shared
tails that the claim path calls, so claims fall back and the self-compile fails. A keep set, grown
to a fixpoint over 29 rebuilds, holds those tails out of B:

| stage | functions emptied | lines deleted |
|---|---:|---:|
| B as `stub-reach.sh` grows it | 539 | 19,968 |
| B minus the keep set (109 functions, 3,533 lines) | 375 | 12,972 |

**What still reaches legacy.** Of 27,421 programs, 20,490 give identical output (no output differs)
and 4,867 fail under both compilers. These 2,064 fail only under B:

| cause | tests/cases | witnesses | distilled | probes |
|---|---:|---:|---:|---:|
| an unclaimed function or start body | 875 | 402 | 84 | 22 |
| a re-entry: a kept tail calls `emitExpr` or `emitWidened` | 328 | 172 | 125 | 16 |
| a record compare falls back (33, cut to 4 by the last keep round) | 30 | 2 | 0 | 0 |
| `emitConstCellInit` calls `emitExpr` | 1 | 4 | 2 | 1 |

The self-compile fails on one re-entry: `emitStrValue`. The global initializer path reaches legacy
only when the start body is unclaimed. Nothing reaches legacy through the door.

**The plan is a keep list plus a port list, and one sweep** (coordinator ruling, 2026-11-25):

| step | what | owner |
|---|---|---|
| keep | the 113 shared tails stay (`scripts/ir-i8-census/keep/`, one file per function: the rehearsal's 109 plus 4 that COV-UNION's #10051 drew in); a later no-behaviour PR may move them to their own module | INFRA (the list), CENSUS (its growth) |
| port | `emitStrValue` (47 programs, blocks the self-compile; first), `emitChainRead` (50), `rcReadSource` (309) | COV-CALL |
| port | `arrLitDataElemEmit` (150), `emitListGetIdx` (58), `emitListGetRecv` (17), `pushMapRecvRef` (2), `emitIdxIndex` (1) | COV-CLOS |
| port | `emitArmSiteAt` (22), `emitDelivered` (7), `emitCoerceAtomPayload` (3) | COV-IS |
| const | `emitConstCellInit`'s remaining `emitExpr` arm (8 programs) | COV-START |
| latent | the 16 stubbed writers a kept tail calls that no population reaches: a probe or a static check each | INFRA |
| gate | `scripts/ir-i8-sweep.sh` in CI (`ci-i8-sweep`): no new cause of "newly failing and not unclaimed", and no new static edge into stage B | INFRA |
| coverage | the census tail to zero unclaimed functions and start bodies | the COV lanes |
| I8 | one PR: `ir-i8-sweep.sh scripts/ir-i8-census/keep --apply` (empties the 14 entry points and B minus the keep set, deletes what `dead-exports.vl` lists), the hand deletions its stub and code lists name, `scripts/ir-i8-rebaseline.sh`, then the full gate | INFRA |

The gate ratchets the set of causes, not the count: coverage moves a program from explained to
unexplained when it claims the last unclaimed function beside a re-entry (coordinator ruling, 2026-11-25).

**The static edges go to zero by hook** (coordinator ruling, 2026-11-25). Every edge from a kept
function into stage B lies under one IR hook: the call where the claim path enters a legacy tail
that takes an expression index. Porting the hook leaves its whole kept subtree unreached, so
`dead-exports.vl` takes it and the keep list shrinks; the edge baseline only falls.

| IR hook | edges under it (the causes among them) | owner |
|---|---|---|
| `armSite` → `emitArmSiteAt` → `emitUnionCoerce` | the union-coercion tree (`emitArmSiteAt`, `emitCoerceAtomPayload`, `pushMapRecvRef`) | COV-IS |
| `structEq` → `nulStructEqGuardTail` | `emitChainRead`, `refListReadAt`, `emitIdxIndex`, `emitNulIsNullTest` | COV-UNION |
| `lowerList` → `coerceTail` → `emitRecCopyInto` | `rcReadSource`, `emitRecCopyFields` | COV-CALL |
| `hoistInRangeCopy` → `arrLitHoistGlobal` | `arrLitDataElemExpr`, `emitStrValue` | COV-CLOS, COV-CALL |
| `coalListGetOr` → `listGetOrOpen` | `emitListGetIdx`, `emitListGetRecv` | COV-CLOS |
| `emitConstCellInit` → `emitUnionBoxOwed` | `emitDelivered`, `emitUnionBoxArg` | COV-START |
| `numCastTail` → `numExactCastTail` → `emitReturnValue` | none: unreachable, cut | INFRA |
| `irFitTail` | `emitRecordFitIs`, `fitRecvRead` | INFRA |
| `rhs` → `emitAsUnionTagged` → `emitAsOneListTail` | `emitListFitAt` | INFRA |
| none (`structEqStage`, kept with no IR root) | its `emitExpr` call | INFRA (off the keep list) |

**An edge the IR provably never takes may stay until I8** (coordinator ruling, 2026-11-25). A kept
helper that legacy also calls, such as `fitRecvRead`'s `emitExpr` fallback, keeps its arm until the
I8 PR deletes it. The edge goes in `scripts/ir-i8-census/edges-proven.txt` with its proof, and the
target before I8 is zero unproven edges. Its guard is the sweep: `--check` reds when any program
reaches a proven edge, so a broken proof surfaces in CI rather than at I8.

A port makes the tail take an IR-lowered operand in place of its `emitExpr` call. The rehearsal
found two more re-entries in its last keep round: `refListReadAt` (4) goes to COV-CLOS, which owns
lists, and `emitNulIsNullTest` (2) to COV-IS, which owns nulls. Per-family staging (§4) buys nothing:
every failure the rehearsal found is a re-entry or missing coverage, not a family. I8 is ready when
`ir-i8-sweep.sh` reports no newly failing program and the census reports no unclaimed function or
start body.

**The dress rehearsal and its red list** (coordinator ruling, 2026-11-25). A draft PR titled "I8
DRESS REHEARSAL" holds the I8 PR built on fresh master: `--apply`, the driver arms as
`emitUnclaimed`, the hand fixes, `ir-i8-rebaseline.sh`. INFRA regenerates it every few hours and
posts the red list there; this table is the latest, by owner.

| as of | what fails | count | owner |
|---|---|---:|---|
| master ad8ae0a3 | self-compile (`ir-i8-self-list.sh`) | 0 units | done |
| master ad8ae0a3 | programs reaching an unclaimed function (`emitFuncBody`) | 568 | the COV lanes, by census class |
| master ad8ae0a3 | programs reaching an unclaimed start body or global initializer (`emitStartGlobalInitValue` 310, `emitStmt` 99, `emitStartGlobalInit` 6, `emitVariantCoerce` 4) | 419 | COV-START, CENSUS |
| master ad8ae0a3 | `reentry emitDelivered` | 47 | COV-IS |
| master ad8ae0a3 | `reentry emitStrValue` | 37 | COV-CALL |
| master ad8ae0a3 | tools that are programs (`scripts/lib/census-grade.vl` and others) | ≥1 | CENSUS |
| master ad8ae0a3 | instruments that compare against legacy (`ci-ir-identity`, the shadow and claim-fallback tests, `self-ir-misses`) | 6 suites | INFRA (retire or rewrite in the I8 PR) |
| master ad8ae0a3 | ratchets with no reading (unused-state, render-parse, self-ir-misses, plumb-shape-cost) | 4 | INFRA |
| master ad8ae0a3 | stubs still called after `--apply` | 14 | INFRA |

The program counts are `ir-i8-sweep.sh` on master: 1,071 of 27,539 programs newly fail (cases 723,
witnesses 289, distilled 44, probes 15), and 35 of them with nothing the seed leaves unclaimed.
