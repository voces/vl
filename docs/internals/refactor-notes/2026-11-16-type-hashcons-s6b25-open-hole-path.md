# Type hash-cons stage 6b: `recOpenHolePath` takes a visited set (lane HASH), 2026-11-16

The last of the s6b21 census's seven load-bearing termination sites. `recOpenHolePath`
(`check_leaf_steps.vl`) finds the path to the first open container a record, list or nullable holds.
It counted down from 8. Raised, it made `nullable-recursive-call-narrow-canary.vl` hang.

It is now a wrapper over a walk that visits a type once, and the depth argument is gone from its three
callers (`check_narrow_flow.vl` ×2, `check_statements.vl`). A type already in `seen` answers "": one
walked before held no open container (else the walk had returned its path), or the walk is on a
cycle.

With s6b22 (#8763) and s6b24 (#8781), all seven load-bearing sites are converted.

## Grading (fixpoint seeds, master `ccc2463cc` vs this branch)

- The census's recursive-type fixtures and `list-element-narrowing-callback-and-loop-runs.vl` run.
- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent.
- Capability matrix A/B over the 23 recursive, tree and self templates: 0 `runs → not-runs`.
- `tests/vl_scaling_shape_test.ts`: 90 of 90.
- Self-compile fuel: +0.4% on the baseline, as master's own measurement.
- `walk-limit` baseline: 553, master's 554 less this site.
