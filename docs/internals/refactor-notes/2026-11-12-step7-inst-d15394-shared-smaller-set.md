# Step 7 inst: a smaller set two lists of maps share is decided with both, 2026-11-12

Lane w321, D15394. The program builds `const xs = [fnMap, m1]` and `const ys = [m3, m4]`.
`fnMap` holds `inc0` and `half`; `m3` holds `dbl` and `half`; `m1` and `m4` hold `half`; all are
un-annotated. Either list alone ran.

`ftTry` plans the wider set first. A smaller set stored where it is held joins the decision
through `ftSubNeed` (D15234). Here the smaller set `{half}` sits in two lists of maps, each of a
different wider set. Planning `{half}` then met the second list while that list's wider set was
not yet assumed. `ftMapListOfWider` found no assumed set over it, so the whole decision failed.
A probe on `ftHoldCtxOk` showed both maps of the set refused in their literals (hold kind 3).

## Changed

`ftMapListOfWider` (`check_fn_tag.vl`) also takes a list of maps of a wider set not yet decided.
It notes that set in `ftSubNeed`, so it is decided with this one, as `ftJoinWiderNeed` does for
a value join (D15643). The shared smaller set is then decided with both wider sets.

## Measured

`scripts/capability-probes/matrix/two-map-lists-sharing-a-smaller-set.matrix.vl`:

| | before | this branch |
| --- | --- | --- |
| runs, of 54 graded | 0 | 16 |
| un-annotated runs, of 27 | 0 | 16 |
| `runs → not-runs` | — | 0 |
| silent | 0 | 0 |

These cells moved to runs, all un-annotated: `binding`, `return_inferred`, `global_init`,
`closure_capture`, every `block_*` and `fn_body*`, `both_lists`, `both_lists_smaller_read`,
`both_lists_in_function` and `three_lists`.

The annotated face refuses on both seeds with `monoPinMapValues: the map's stored functions close
at another type`. The annotation pins `half` at `(f64) => f64` in `xs`, while `ys` still stores it
at its own type. That is a separate refusal; it is not filed here.

The "before" seed is #7410's head. This branch stacks on it, and #7410 changes the same function.

## Witnesses moved

D15158's position witness and the emit-reason control of `tests/vl_capability_matrix_test.ts`
move to D14082 (a lambda's record result with no union box). It still refuses with no position.

## Proof

SWEEP
