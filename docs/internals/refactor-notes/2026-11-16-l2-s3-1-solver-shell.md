# L2 S3.1: the solver shell, 2026-11-16

The second step of the S3 plan (`2026-11-16-l2-s3-plan.md`), marked **identical**, stacked on
S3.0 (#8560). Five sites each re-asked a callee's bounds with their own hand-written list of
`validate*Cstrs` calls. They now all go through one shell, `ifaceSolveAt` in
`check_assignable.vl`, which S3.3's solver will replace step by step.

## The shell

- **One step order.** Every site already asked the validators in the same order: bin, print,
  arrDef, nest, is, arg, ret, let, bm, mem, ufcs. They are the `SS_*` steps. `SolveAt.kinds` is a
  mask that says which steps a site takes, and `ifaceSolveAt(at, from, to)` runs the masked steps of
  a range in order.
- **What a site supplies** is a `SolveAt`:
  - the bindings, plus a separate pair for the declared return, since only `callFtyPinCstrs` binds
    unbound variables to never (`withUnboundAsNever`) for it;
  - the call, the callee and its spelling, and the hole arguments.
- **Owner toggles become data.** `callFtyPinCstrs` sets `substSelfOwner` around its bin, let and
  ufcs steps (the callee's owner) and around its arg step (`topFnOwnerOf(callee)`), restoring the
  value it held on entry. These are now `selfOwner`, `argOwner` and `ownerWas`, applied by the
  shell when `toggles` is set. `topFnOwnerOf` is a pure lookup, so computing it before the first
  step is the same as computing it at the arg step. The other sites never toggled.
- **A site's own steps sit between ranges.** The compiler uses no closures, so the shell takes a
  step range instead of hooks:
  - `callFtyPinCstrs` runs bin–arg, then `forElemArgCstrs` and the return bindings, then ret–bm,
    then `refuseOpenNullHoleArg` over the arguments, then mem–ufcs;
  - `ufcsRevalidatePins` runs bin–bm, its receiver and argument checks, then mem–ufcs;
  - the other sites run every step in one call.

| site | steps |
|---|---|
| `callFtyPinCstrs` (`check_calls.vl`) | all |
| `ufcsRevalidatePins` (`check_member_call.vl`) | all |
| `declCstrsAtBinding` (`check_assignable.vl`) | all but is |
| `judgeHoleLambdaAt` (`check_calls.vl`) | all but nest |
| `fsbRecheckOne` (`check_assignable.vl`) | all but nest and ufcs |

The modes the sites set around the shell are left where they are: `substNestMode`,
`cstrOwnedStrict`, `cstrSetOwners` and `holeBindHeld`. S3.6 retires them with the replay, once the
solver no longer reads them.

## Gates

Re-proved after merging master `0ba90ffd`, into which S3.0 (#8560) merged squashed:
- two refreshes from that master's fixpoint seed are cmp-identical;
- 20,601 programs fingerprint identically, both seeds run from one worktree;
- `lint-self.sh` is clean.

Before that, on master `49648fba` with S3.0 under this step:
- Two refreshes from master's fixpoint seed are cmp-identical, and 20,590 programs fingerprint
  identically, both seeds run from one worktree.
- `regress.vl`: 0 runs → not-runs. Its 23 `d551_*` movements are master's own.
- `decl-order-ab.vl`: 16 of 5,268 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 228 hole and inferred matrices: 0 runs → not-runs, 0 of 15,476 rows changed.
- `GATE_IN_WORKTREE=1 scripts/gate.sh`: every row passes except `ir shadow`, whose 0 → 1 mismatch
  master's own seed also reports.
- `lint-self.sh`: clean.
- L2 self-compile guest fuel, master seed compiling each source at one path length:
  92,137,608,129 against S3.0's 92,120,785,121 (+0.018%).

## Lines

`compiler/`: +199, −165. The shell is a dispatch over today's validators, so it adds lines until
S3.3 to S3.6 replace what it dispatches to.
