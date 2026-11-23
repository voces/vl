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

The dynamic census cannot replace step 2. Its 6.1k lines that no program reaches are mostly code
behind modes no population turns on (the linker, the name section, the diagnostics) and refusal
builders. They are reached, just not by these programs.

## 6. Open questions

- §7's later rows, I9 and I10, were sized the same way and are not re-measured here.
- Whether `emitConstCellInit`'s constant writer belongs to the start-function stage or is its own
  step is a ruling for the coordinator. It shares no code with the start body.
