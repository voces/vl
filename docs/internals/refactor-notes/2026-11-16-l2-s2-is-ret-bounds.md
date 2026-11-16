# L2 S2, second tables: `is` and return rows become `Iface` bounds, 2026-11-16

The second S2 step (`l2-inferred-interfaces-design.md` §8, marked **identical**), stacked on the
first (`2026-11-16-l2-s2-tyix-bounds.md`, #8500). It moves `isCstr` and `retCstr` onto the owner's
`Iface`. Six tables remain: `binCstr`, `argCstr`, `letCstr`, `bmCstr`, `memCstr` and `ufcsCstr`.

## The change

- **`Bound` grows to `{on, a, b, site, fn, s}`.** `a` and `b` are operands (-1 when unused) and
  `s` is a spelling. Each kind's constant in `check_iface.vl` says what its operands mean.
  `bndPush` takes the record.
  - `BND_IS`: `on` is the tested operand's type, `a` the checked record type, `s` its spelling,
    `site` the test.
  - `BND_RET`: `on` is the returned type, `a` the declared return, `b` the old `wOnly` column,
    `site` the returned expression.
  - The three earlier kinds build theirs with `tyIxBound`.
- **Writers** (`noteIsCstr`, `noteRetCstr`) push through `bndPush`, and their duplicate scans read
  only the owner's rows. `noteRetCstr` still marks the delivery with the row's index
  (`cvMark(CV_RET, …)`).
- **Validators** (`validateIsCstrs` in `check_demands.vl`, `validateRetCstrs` in
  `check_assignable.vl`) walk `bndNextRow` under the same `cstrOwnedBy` filter, as the first step's
  do.
- **Rollback.** `RB_IS` and `RB_RET` truncate through `bndTruncate`. The probe-rollback assertion
  names `isCstr` and `retCstr` once each.

## Gates

- **Identical.** Two `refresh-compiler.sh` runs from the master fixpoint seed (`c040079c`) are
  cmp-identical.
- **Fingerprint** (rc, diagnostics, emitted bytes), 20,535 programs, against the master fixpoint
  seed: identical.
  - 25 programs embed their own source path (`__callsite__` defaults and the D947 named cells), so
    their bytes depend on the checkout's path. Fingerprinted from the same worktree with both
    seeds, those 25 are identical too.
  - Fingerprints compared across worktrees must be taken at one path.
- **Re-proved after merging master `32ee97e5`**, into which #8500 merged squashed:
  - two refreshes from that master's fixpoint seed are cmp-identical;
  - 20,568 programs fingerprint identically, with both seeds run from one worktree;
  - `lint-self.sh` is clean.
  The gates below ran before the merge, against `c040079c`.
- `regress.vl`: 0 runs → not-runs, no cell changed class.
- `decl-order-ab.vl`: 16 of 5,246 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 227 hole and inferred matrices, `--before` master against `--after` this seed: 0
  runs → not-runs, 0 of 15,410 rows changed.
- `GATE_IN_WORKTREE=1 scripts/gate.sh`: all gates pass.
- `lint-self.sh`: clean. Seed size: 6,347,259 bytes (+0.1% on the baseline). Late demands: 2, the
  baseline.
- **L2 self-compile guest fuel** (master seed compiling each source, at one source path length):
  - master: 89,831,371,098;
  - first step: 89,874,618,804;
  - this step: 89,865,571,361 (+0.04% on master).

## Lines

Against the first step: `check_iface.vl` 116 → 146 lines; in the eight touched files, +137 and
−203. Net −66.
