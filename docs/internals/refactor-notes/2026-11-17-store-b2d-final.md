# B2d: the check's decision is final, 2026-11-17

Lane STORE, stage B2d of storage per (KeyId, parameter). The coordinator ruled on 2026-11-17 that the
finality and its `emitFail` ship on their own, because they make every late arm measurable. The
measured deletion of dead arms follows in its own PRs.

## Why finality comes first

`fnTagRedecide` cleared every tag and decided every set again, the check's included. So each late
input stayed live: it re-derived sets the check had already decided, and no B2 step could make any
late code dead.

A probe without the stale-table artifact first re-commits the check's sets after the elaboration
(full undecide and re-commit, the check's sets tried first). It records each set the late inputs
refused. Two sets in two programs were refused, both with one mechanism:

| program | set | late refusal |
|---|---|---|
| `closures/generic-fn-list-written-then-called.vl` | `G {ginc,dbl}` | `ftHoldCtxOk` hole-argument arm, `put(a2)`: `mintSetPartial` |
| `closures/hole-fn-list-written-then-called.vl` | `T {inc0,dbl}` | the same arm, `put(a3)` |

In both, a list holding the set is handed to a hole parameter whose body writes another member into
a slot (`put(ys) { ys[0] = dbl }`). The elaboration marks the set partial; the check had no such fact
and tagged it. The probe also had an ordering case and two diagnostic-order changes, with no decision
moving:
- `returned-lists-of-fns-of-different-results-called-through-element-runs` (`N {inc0}`, `N {half}`):
  refused when tried first, tagged later in the same pass;
- `generics/error-generic-coalesce-default-through-outer-generic` and
  `error-list-literal-around-coalesce-default-clash`: a different first diagnostic.

## What changes

**`check_fn_tag.vl`, the producer fix.** In `ftHoldCtxOk`'s Call arm, during the check, a holder handed
to a hole parameter is refused when all three hold:
- `ftSeededNarrower`: the binding was initialised with a list literal of fewer of the set's members
  than the set has;
- `ftArgSlotWritten`: the callee writes an element or field of it, through the parameter;
- `!fnTagSetSplits`: the set's members agree at its calls.

`ftArgSlotWritten` reads `cwSlotWrittenValues` on the argument's binding, which follows the alias into
the parameter, and keeps the writes whose site lies in the callee's body. There is no second
definition of a write.

Ablation, against master's fixpoint, measured as programs whose check output changes and late rows
new or gone:

| variant | programs changed | new rows | gone |
|---|---|---|---|
| the parameter's own key has a slot value or a write (`!= 0`, which also counts its -1) | 17 | 91 | 2 |
| the parameter's own key holds a written value | 2 (the refutation `emitFail` fires: no effect) | 0 | 0 |
| the argument's binding has a write inside the callee | 11 | 0 | 2 |
| plus the members agree (`!fnTagSetSplits`) | 4 | 0 | 2 |
| plus a set with a generic member called at two keys is left | 1 | 0 | 2 |
| plus a one-member set is left | 1 | 0 | 2 |
| the binding seeded narrower, in place of the one-member test | 0 | 0 | 2 |
| that, without the generic test (shipped; the test is removed) | **0** | **0** | **2** |
| that, without `!fnTagSetSplits` (control) | 7 | 0 | 2 |

**Finality** (`check_fn_tag.vl` `fnTagDecide` and `fnTagRedecide`, `emit_sections.vl` `elabPrepare`).
- After the elaboration, the check's tagged sets are committed first. Their decision is the check's;
  the late pass builds their arms at the instances' calls.
- If the late inputs leave one of them untagged, `fnTagRedecide` returns 20, and `elabPrepare`
  `emitFail`s "the tag decision after the elaboration refuted a function set the check decided".
  On the corpus it fires on 0 programs. On the build without the producer fix it fires on exactly the
  two programs above, which validates the probe.

**Deleted: the dropped-set path, which finality leaves without a writer that matters.**
- `ftLateRefused`, with its reset, its record in `fnTagRedecide` and its skip in `ftTryWith`;
- `fnTagRedecide`'s code 2 and `elabPrepare`'s two `grew == 2` arms;
- `fnTagLateRows`'s `untag` rows.

With these gone, check output and late rows are unchanged, and no program reports "did not settle".
The late pass never dropped a set of its own on the corpus.

The undecide at the start of the late decision stays. Committing the check's sets again rebuilds their
leaf and held-rep tables at the instances' nodes; the stale-table probe broke 12 programs without it.

## Residue

`scripts/late-tags-baseline.txt`: 396 → 394. The two rows that leave are the `untag` rows
`closures/generic-fn-list-written-then-called.vl` `G {ginc,dbl}` and
`closures/hole-fn-list-written-then-called.vl` `T {inc0,dbl}`. No row is new.

## The arm census (probe, for the deletion PRs)

The 28 `ftLate` sites after the decision's setup were wrapped in a recorder. It counts evaluations at
late while deciding a set the check left, and while committing a check set again. No site reads 0.
The counter counts evaluation, not decisiveness, so a site with hits is not shown to be live.

The deletion PRs ablate each site, forcing it to its check behaviour, in this order:
- first sites 12, 14, 15, 19, 22 and 23 (lines 3438, 4040, 4056, 4598, 4953 and 4966 at this PR's base),
  each hit only while deciding a set the check left, at most 32 times;
- then the rest.

## Grading (fixpoint seeds both sides, master `d93cd86b4`)

- `check-filed-witnesses.vl --strict` over both inventories: 5,465 graded, all as filed, 0 moved,
  3,427 checked against their Want output, 0 mismatched.
- `@run` A/B (6,720 programs): 0 wasm movers, 0 output movers.
- `vl check --codegen tests`: output byte-identical apart from the late rows.
- Late tag rows 396 → 394, written from a fixpoint seed, none new; late demands 10.
- L2 self-compile fuel: 96.874G against master's 96.827G measured alike (+0.05%).
- Phase-state census ok; lint clean; `emit_mono.vl` untouched (908). Net compiler lines +97 / −26.
