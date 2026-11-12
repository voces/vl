# Step 7 inst: a value join of maps of a set and a smaller set is one map of the joined set, 2026-11-12

Lane w321, D15393. `fnMap` holds `inc0` and `half`, and `m2` holds `half`; all are un-annotated.
They are joined as `function pick(c) { return if c { m2 } else { fnMap } }`, or as
`const m = if k { m2 } else { fnMap }`.

The arm join (`joinArmTys` → `elabFnJoinDeepTy`) had no map arm, so it kept the first map's set.
D15352 joined maps only in a list literal (`elabFnJoinMapTy`). The row said that giving the arm join
a map arm was check-clean invalid wasm: the joined map's closures were untagged and minted a second
storage. Probes on `ftTry` and `ftHoldCtxOk` found two causes.

- The tag pass tried only the wider set and never pulled in the smaller set of the other arm. A
  list literal pulls it through `ftSubNeed`; a value join had no such rung.
- A function's inferred result came from `joinRetTys`, which had no map arm either. So the
  returned `if`, typed at the joined map, sat at a return whose result was the first arm's map,
  and its context was refused.

## Changed

- `joinArmTys` and `joinRetTys` (`check_relate_core.vl`) join maps through `elabFnJoinMapTy` where
  the deep join leaves the type unwidened.
- `ftJoinMapTailsNote` (`check_fn_tag.vl`): the scan notes each tail map's set within `s`, for a
  value `if` or `match` holding maps of `s`. `ftRetMapSubsNote` does the same for each returned
  map of a function whose result is a map of `s`.

A first cut had only the arm join and the tail rung. It took `two_returns` (two `return`s of the
two maps) from a loud reject to SILENT. The matrix caught it, and `ftRetMapSubsNote` is the fix.

## Measured

`scripts/capability-probes/matrix/value-join-of-maps-of-hole-fns.matrix.vl`:

| | master | this branch |
| --- | --- | --- |
| runs, of 58 graded | 24 | 49 |
| `runs → not-runs` | — | 0 |
| silent | 5 | 1 |

Master had four SILENT cells that now run: `returned_join_wider_first` and `match_join`, in both
faces. Check-clean invalid wasm on master, clause 1. The one SILENT cell left is `return_inferred`
(annotated), the same on master: a returned join bound at an annotated map. Filed as D15753,
clause 1.

## Proof

**Full local sweep.** Fixpoint seeds, base master `784c38bf`, 23,995 programs:

| | count |
| --- | --- |
| same | 23,994 |
| bytes-only | 0 |
| output movers | 1 |
| runs → not-runs | 0 |
| new compiler traps | 0 |

The one mover is D15393, which goes from refusal to runs. D15753's witness is check-clean
invalid wasm on both seeds.
