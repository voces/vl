# L2 S2, fourth tables: member and UFCS rows become `Iface` bounds, 2026-11-16

The fourth S2 step (`l2-inferred-interfaces-design.md` §8, marked **identical**), stacked on #8529
(`2026-11-16-l2-s2-let-bm-bounds.md`). It moves `memCstr` and `ufcsCstr` onto the owner's `Iface`.
Two tables remain, `binCstr` and `argCstr`; they are the largest.

## The change

- **`Bound` gains `more: i32[]`**: the other call nodes a UFCS row stands for (D2517). Every
  other kind shares the constant `bndNoMore`, which nothing pushes onto, so they allocate nothing.
  A UFCS row gets its own list. The writer pushes onto it in place, as it did onto
  `ufcsCstr.more[k]`, and rollback leaves those pushes as it did before.
- **`BND_MEM`**: `on` is the receiver type, `s` the member spelling, `site` the node. `a` holds the
  old `dem` flag (1 asks a demand, 0 a classification, D1431).
- **`BND_UFCS`**: `on` is the receiver type, `s` the function name, `a` the old `p0`.
- **Writers.** `noteMemCstr` and `noteUfcsCstr` scan only the owner's rows. `noteUfcsCstr` lives
  in `check_leaf_steps.vl`.
- **Validators.** `validateMemCstrs` and `validateUfcsCstrs` walk `bndNextRow` under `cstrOwnedBy`.
  Two loops keep their global order and read `bndAt`/`bndCount`:
  - the layout-constant walk in `check_demands.vl`, which selects `fn == calleeFn` exactly;
  - `tpDemandTy` in `check_subst.vl`.
- Comments that named `memCstr.prop` or `ufcsCstr.ty` now name the kind constants.

## Gates

On master `5b42a89c`, with #8529's step under this one:
- **Identical.** Two refreshes from master's fixpoint seed are cmp-identical, and 20,574 programs
  fingerprint identically, both seeds run from one worktree.
- `regress.vl`: 0 runs → not-runs.
  - It lists 23 "other movement" cells, `loud check reject → loud check reject` in the `d551_*`
    grid. Master's own fixpoint seed lists the same 23 against the committed baseline: the baseline
    lags master, and this change does not move them.
- `decl-order-ab.vl`: 16 of 5,258 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 227 hole and inferred matrices: 0 runs → not-runs, 0 of 15,410 rows changed.
- `lint-self.sh`: clean. Seed size: +0.4% on the baseline file.
- **`GATE_IN_WORKTREE=1 scripts/gate.sh`: the same two rows are red as on #8529, neither from this
  change.**
  - `ir shadow` reports `prefix or locals at 0x34 vs 0x35`, 0 → 1, which master's own seed also
    reports.
  - `vl_touch_set_test` needs #8503's host change; the shared `vl` binary here predates it.
- **L2 self-compile guest fuel**, master seed compiling each source at one path length:
  91,048,946,674 against master's 91,078,211,043 (−0.03%).

## Lines

Against the third step: `check_iface.vl` 185 → 209 lines; across `compiler/`, +214 and −232
(net −18).
