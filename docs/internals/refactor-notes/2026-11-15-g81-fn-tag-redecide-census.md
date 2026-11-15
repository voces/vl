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
  the check had already tried it;
- for each set the check tried, or tagged and the late pass drops, three trial plans at late time:
  - **A:** the check's branches with the late mint rows;
  - **B:** the late branches with no mint rows;
  - **C:** the check's branches with no mint rows.

The trials perturb one program's outcome (one late add moves from the call source to the mint
source, and one extra drop round appears), so the counts below are from the first probe, without
trials.

Population: every `tests/cases` file marked `@run`, 6,463 programs.

## Result

- **454 programs (7.0%) are changed by the late decision.**
  - 414 gain tagged sets, and 3 lose one (code 2).
  - By grid: closures 314, functions 112, generics 23, and 5 elsewhere.
  - Rounds: 168 programs run one redecide, 412 run two, 6 run three.
  - No program is changed only by a late closure note; each comes with a tag change.

Sets tagged late, by the source that admitted them:

| source | the check tried it | set commits | programs |
|---|---|---|---|
| `elabMintFacts` rows | no | 1,191 | 387 |
| call sets | yes, and refused | 619 | 192 |
| call sets | no | 36 | 24 |
| `mintFwdFieldSetsOf` | no | 4 | 2 |
| escapes | yes | 2 | 1 |

- **The largest share, 387 programs, are sets the check never saw.** They are reached only through an
  instance's call through a set its parameter is bound to. The check is generic and has no
  instances, so it never learns which set a parameter holds at each call.

### The sets the check refused and the late decision accepts

| A | B | C | sets | programs | what flips it |
|---|---|---|---|---|---|
| yes | yes | yes | 516 | 164 | neither the mint rows nor the late branches: other state the elaboration leaves |
| no | yes | no | 104 | 33 | the late branches |

In the second row the late branches decide it, and the mint rows are not needed. The late-only branches
those plans pass through are:
- call recognition through local `const` aliases and nested declarations (`ftCalleeSource`,
  `ftCalleeFn`);
- a coerced escape (`ftHolderCoerced`);
- a hand-back at a closed type (`ftHandBackAtClosed`, `ftNodeOk`);
- `ftLateParamOk`.

A pass through a branch is not proof that it decided, so per-branch ablation is the next census.

### The sets the check tagged and the late decision drops

- `closures/generic-fn-list-written-then-called.vl`
- `closures/hole-fn-list-written-then-called.vl`
- `closures/written-let-written-hole-param-reached-through-called-param.vl`
- `functions/hole-and-closed-function-handed-to-one-slot-through-a-list-runs.vl`

This includes the program the trials perturbed. Each is refused late under A, B and C alike, so the
elaboration's state refutes the check's tag: the check's answer was wrong, not incomplete. All four
print their expected `@log` lines on master `37b47ca1`, because the emitter uses the late decision.
The two list programs pass through `ftStoredAt` (a record literal an instance writes into a holder
of the set). The other two pass through `ftDirectCountsGrow`, `ftListCallHoleArg` and
`ftLateArgOfSet`.

## What it decides

- **The fix is not moving one fact from the emitter into `fnTagDecide`.** The deciding inputs are
  per-instance flow (the mint rows) and state the elaboration leaves (row C).
- **Step (ii)** computes the instance-to-set facts at check time from the call binding rows and the
  forward edges, as a shadow beside `elabMintFacts`, and diffs the two.
- **Before (ii), name the elaboration state behind row C.** The candidates are set membership, node
  types the elaboration rewrites, and the escapes it delivers. A shadow of the mint rows alone
  cannot close those 164 programs.
- **Step (iii)** deletes `elabMintFacts`' role as the tag input outright, with no fallback.
