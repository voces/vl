# L2 S2, third tables: write and builtin-method rows become `Iface` bounds, 2026-11-16

The third S2 step (`l2-inferred-interfaces-design.md` §8, marked **identical**), stacked on #8518
(`2026-11-16-l2-s2-is-ret-bounds.md`). It moves `letCstr` and `bmCstr` onto the owner's `Iface`.
Four tables remain: `binCstr`, `argCstr`, `memCstr` and `ufcsCstr`.

## The change

- **`Bound` gains `c`, a third operand, and `seq`**, the check-order stamp that `let` and `bm`
  share (`cstrSeqNext`, D2218). Kinds that keep no order set it to -1.
  - `BND_LET`: `on` is the written type, `a` the destination, `s` the binding name, `site` the
    source expression. Owner `CSTR_DELIVERY_ONLY` still marks a write only a delivery of its
    binding judges.
  - `BND_BM`: `on` is the argument type, `a` the expected one, `b` the old `ctx`, `c` the form,
    `s` the label.
  - The removed tables' rationale moves onto the two kind constants: D572 for writes, D582 for
    builtin-method arguments.
- **Writers** (`noteBmArgCstr`, `letCstrRow`) scan only the owner's rows.
  `noteElemLetCstr`'s any-owner check `i32ListHas(letCstr.ix, ix)` becomes
  `bndSiteHas(BND_LET, ix)`.
- **Validators.** `validateLetCstrs` and `validateBmCstrs` walk `bndNextRow` under `cstrOwnedBy`.
  Three walks keep their global order:
  - the pin pass in `check_demands.vl`, which merges `let` and `bm` by `seq`;
  - the write-scan judges in `check_assignable.vl`, which select by written declaration, not by
    owner;
  - `check_decl_scan.vl`'s row readers.
  These read `bndAt`/`bndCount` in place of the columns.
- **`letLamJudgedAtCall`** bound-tests the row's node before `nodeAt`: `sentinel-index-unguarded`
  asks this of an index read through `bndAt`. No program reaches the new arm; the fingerprint is
  identical.

## Gates

On master `32ee97e5`, with #8518's step under this one:
- **Identical.** Two refreshes from master's fixpoint seed are cmp-identical, and 20,568 programs
  fingerprint identically, both seeds run from one worktree.
- `regress.vl`: 0 runs → not-runs.
- `decl-order-ab.vl`: 16 of 5,256 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 227 hole and inferred matrices: 0 runs → not-runs, 0 of 15,410 rows changed.
- `lint-self.sh`: clean. Seed size: +0.4% on the baseline file.
- **L2 self-compile guest fuel**, master seed compiling each source at one path length:
  89,867,857,854 against master's 90,887,912,844 (−0.02%).
- **`GATE_IN_WORKTREE=1 scripts/gate.sh`: two rows red, neither from this change.**
  - `ir shadow` reports `prefix or locals at 0x34 vs 0x35`, 0 → 1. Master's own fixpoint seed
    gives the same mismatch.
  - `vl_touch_set_test` (ci-native) needs the host change #8503 made to
    `scripts/vl-host/src/main.rs`. The shared `vl` binary here predates it.

## Lines

Against the second step: `check_iface.vl` 146 → 185 lines; across `compiler/`, +259 and −278 (net −19).
