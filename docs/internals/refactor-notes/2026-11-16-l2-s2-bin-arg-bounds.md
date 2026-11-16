# L2 S2, last tables: binary-operator and argument rows become `Iface` bounds, 2026-11-16

The fifth and last S2 step (`l2-inferred-interfaces-design.md` §8, marked **identical**), stacked
on #8538 (`2026-11-16-l2-s2-mem-ufcs-bounds.md`). It moves `binCstr` and `argCstr` onto the owner's
`Iface`. With it, every one of the 11 constraint tables is a kind of `Bound`, and S2 is done.

## Where S2 stands after this PR

§A.1's first command, `grep -nE "^export (const|let) [a-zA-Z]+Cstr[A-Za-z]*\s*[:=]"
compiler/check_cstr_rows.vl`, now prints one line, `nestCstrSeen`: a memo of `BND_NEST` row
indices, not a table. The eleven kinds, all in `compiler/check_iface.vl`:

| kind | was | PR |
|---|---|---|
| `BND_PRINT`, `BND_ARRDEF`, `BND_NEST` | `printCstr`, `arrDefCstr`, `nestCstr` | #8500 |
| `BND_IS`, `BND_RET` | `isCstr`, `retCstr` | #8518 |
| `BND_LET`, `BND_BM` | `letCstr`, `bmCstr` | #8529 |
| `BND_MEM`, `BND_UFCS` | `memCstr`, `ufcsCstr` | #8538 |
| `BND_BIN`, `BND_ARG` | `binCstr`, `argCstr` | this PR |

Each owner's `Iface` lists its own rows per kind, in recording order. A call reads its callee's rows
merged with module scope's, through `bndNextRow`. Rollback truncates each kind's log through
`bndTruncate`.

## The change

- **`BND_BIN`**: `on`/`a` are the operands, `s` the operator, `site` the expression, `b` its literal
  shape (D2757).
- **`BND_ARG`**: `on` is the argument type, `a` the parameter type, `s` the callee name, `c` the
  form, `site` the argument node, `b` the hole call (D13201). Both writers' duplicate scans read only
  the owner's rows.
- **`validateArgCstrs` walks `bndNextRow`.** Its ownership test comes first and short-circuits, so
  skipped rows were never asked anything.
- **`validateBinCstrs` keeps its every-row walk.** It asks `gnotDeadAtPin` of every row before the
  ownership test, and that call can mint arena types (`substHoleTy`, `assignable`). Skipping
  non-owned rows could therefore shift type indices, so the walk stays as it was. S3's solver, which
  reads only the callee's bounds, is the place to change that order, graded.
- **The other readers** read `bndAt`/`bndCount` in place of the columns, in their global order:
  - `argCstr` helpers in `check_assignable.vl`, `check_calls.vl`, `check_leaf_steps.vl` and
    `check_relate_core.vl`;
  - `binCstrsHold` (`check_relate_core.vl`) and the bin readers in `check_demands.vl` and
    `check_leaf_steps.vl`.
- `check_cstr_rows.vl`'s header now says a body records bounds on its owner's `Iface`.
  `ifaceOwned`, the shadow printer's column counter, is gone: every count reads `bndOwnRows`.

## Gates

On master `2f28e2ae`, with #8538's step under this one:
- **Identical.** Two refreshes from master's fixpoint seed are cmp-identical, and 20,576 programs
  fingerprint identically, both seeds run from one worktree.
- `regress.vl`: 0 runs → not-runs. Its 23 "other movement" `d551_*` cells are master's own (see
  #8538's note).
- `decl-order-ab.vl`: 16 of 5,259 cases move, 0 to a clause-1 outcome, 0 not in the baseline.
- The 227 hole and inferred matrices: 0 runs → not-runs, 0 of 15,410 rows changed.
- **`GATE_IN_WORKTREE=1 scripts/gate.sh`.**
  - The first run caught `vl_arena_write_fields_test`: an `Iface` field named `binOp` shared its
    name with a `Node` variant field, which takes it out of `awFields`. The field is now `binary`,
    and the test passes.
  - The two rows red on #8529 and #8538 stay red, and are not this change: `ir shadow` 0 → 1
    (master's seed too) and `vl_touch_set_test` (the host predates #8503).
- `lint-self.sh`: clean. Seed size: +0.4% on the baseline file. Late demands: 2, the baseline.
- **L2 self-compile guest fuel**, master seed compiling each source at one path length:
  91,330,414,746 against master's 91,337,431,037 (−0.01%).

## S2 in lines

| step | PR | net `compiler/` lines |
|---|---|---:|
| print, arrDef, nest | #8500 | +67 |
| is, ret | #8518 | −66 |
| let, bm | #8529 | −19 |
| mem, ufcs | #8538 | −18 |
| bin, arg | this PR | −87 |
| **S2** | | **−123** |

The design estimated +500 / −1,500 for S2. The difference is that S2 is identical, so it keeps every
validator and the replay order. The tables' writers, truncates, resets and column declarations go;
the deletions the estimate counted fall to S3, when the solver replaces the validators.
