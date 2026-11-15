# What `fnTagRedecide` changes over the check's tag decision, measured, 2026-11-15

Lane G, as the tag-decision layer's owner (`l2-inferred-interfaces-design.md` §10). This is step (i)
of removing the second storage decision before L2 S3. It changes no compiler code.

## Method

A scratch-only probe build of master `4b8e8d26`, never pushed and never used to refresh a seed,
logs through `$VL_IFACES` after `vl build`:
- after the check's `fnTagDecide` (`check_pins.vl`), the number of tagged sets;
- after each `fnTagRedecide` round (`emit_sections.vl`), its code: 0 settled, 1 tagged more, 2
  untagged one;
- each set tagged late, with the source that admitted it (call sets, `elabMintFacts` rows,
  `mintParamHeldSets`, `mintFwdFieldSetsOf`, `mintCloRows`, escapes, eta-built sets) and whether
  the check had already tried it, and whether the check had tagged it;
- for each set the check tried, or tagged and the late pass drops, three trial plans at late time:
  - **A:** the check's branches with the late mint rows;
  - **B:** the late branches with no mint rows;
  - **C:** the check's branches with no mint rows.

The trials perturb one program's outcome (one late add moves from the call source to the mint
source, and one extra drop round appears), so the counts below are from the first probe, without
trials.

Population: every `tests/cases` file marked `@run`, 6,463 programs.

## Result

**Corrected.** The first reading of this census counted every set the late decision commits.
`fnTagRedecide` first clears every tag (`fnTagUndecide`) and then decides again, so most of those
commits re-tag a set the check had already tagged. The figures below count only sets whose state
differs from the check's: newly tagged, or dropped. The earlier row C ("other state the elaboration
leaves", 516 sets in 164 programs) was the re-confirmations. It is withdrawn.

- **416 programs (6.4%) end with a different tag decision from the check.**
  - 414 gain a set and 4 lose one, with some programs doing both. The trial probe counts 4
    losses; the trial-free probe counts 3.
  - By grid: closures 279, functions 109, generics 23, and 5 elsewhere.
  - No program is changed only by a late closure note.

Late commits, by the source that admitted the set:

| source | the check tried it | the check tagged it | set commits | programs |
|---|---|---|---|---|
| `elabMintFacts` rows | no | no | 608 | 387 |
| `elabMintFacts` rows | no | yes, through another set | 584 | 366 |
| call sets | yes | yes | 567 | 192 |
| call sets | yes, and refused | no | 51 | 32 |
| call sets | no | yes | 36 | 24 |
| `mintFwdFieldSetsOf` | no | no | 4 | 2 |
| escapes | yes | no / yes | 1 / 1 | 1 / 1 |

A row whose "the check tagged it" column is yes changes nothing. The changes are:
- **387 programs: sets the check never saw.** They are reached only through an instance's call
  through a set its parameter is bound to (the mint rows). The check is generic and has no
  instances, so it never learns which set a parameter holds at each call.
- **32 programs: sets the check refused and the late decision accepts.** They are accepted only
  with the late branches (trial B accepts, A and C refuse); the mint rows are not needed. The
  late-only branches those plans pass through:
  - call recognition through local `const` aliases and nested declarations (`ftCalleeSource`,
    `ftCalleeFn`);
  - a coerced escape (`ftHolderCoerced`);
  - a hand-back at a closed type (`ftHandBackAtClosed`, `ftNodeOk`);
  - `ftLateParamOk`.

  Passing through a branch is not proof that it decided, so per-branch ablation is the next census.
- **3 programs: forwarded record fields (2) and one escape.**

### The sets the check tagged and the late decision drops

- `closures/generic-fn-list-written-then-called.vl`
- `closures/hole-fn-list-written-then-called.vl`
- `closures/written-let-written-hole-param-reached-through-called-param.vl`
- `functions/hole-and-closed-function-handed-to-one-slot-through-a-list-runs.vl`

This list includes the program the trials perturbed. Each is refused late under A, B and C alike,
so the late inputs refute the check's tag: the check's answer was wrong, not incomplete. All four
print their expected `@log` lines on master `37b47ca1`, because the emitter uses the late decision.
The two list programs pass through `ftStoredAt` (a record literal an instance writes into a holder
of the set). The other two pass through `ftDirectCountsGrow`, `ftListCallHoleArg` and
`ftLateArgOfSet`.

### Whether the elaboration re-decides a checker fact

At each accepted plan, the probe compared every check-time node's type with its type at the late
decision. In 152 of the 164 programs that re-tag a set, no node type changed. Only 12 programs show
any rewritten node type, and none to a function type. Set membership, the calls through the set
and the escapes involving it were the same at the check and at the late decision in nearly every
accepted plan. The elaboration does add nodes after the check.

## What it decides

- **The redecide's real inputs are two:**
  - **per-instance flow, the mint rows:** 387 programs, with the forwarded fields;
  - **the late-only branches:** 32 programs gained, and the drops.
- **No re-decided checker fact of size was found.** Node types, membership, calls and escapes are
  stable, so nothing here needs to move upstream for its own sake. Whether lane S's 2b shares an
  input is decided by the per-branch census.
- **Step (ii)** computes the instance-to-set facts at check time from the call binding rows and the
  forward edges, as a shadow beside `elabMintFacts`, and diffs the two. With the late branches'
  per-branch census, that covers every change.
- **Step (iii)** deletes `elabMintFacts`' role as the tag input outright, with no fallback.
