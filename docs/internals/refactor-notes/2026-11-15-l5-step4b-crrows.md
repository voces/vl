# L5 step 4b: the capture rows are one lifetime record, 2026-11-15 (lane Q)

The second slice of step 4 of `2026-11-14-phase-products-design.md` §3 ("lifetimes are records").

## Change

`crReset` (`check_capture_rows.vl`) cleared 75 names one by one. The 66 tables that the module
itself declares are now the fields of one `crRows: CrRows` record, and the reset is
`crRows = crRowsNew()`. The `cr` prefix is dropped from the field names (`crOpOpaque` becomes
`crRows.opOpaque`), and each importer names `crRows` once.

**Kept as module tables:**

- **`crAsgMemo`, `crCapRecCount`, `crHandleMemo` and `crInfoMemo`.** The sentinel-index lint learns
  a map global from a column-0 `let name: {[…]` and from the importing module's import locals. It
  cannot see a record field's type, so `crRows.asgMemo[root]` reads to it as an unguarded table
  index, and the ratchet would rise by 8. Teaching the lint record fields is a change to the shipped
  lint and to the driver's import staging. It is left for its own PR, and these four maps stay.
- **`crCapLossAny`.** `tests/vl_emitter_state_audit_test.ts` uses its single clear in `crReset` as the
  never-cleared control.
- **The tables `crReset` clears that other modules declare** (`check_capture_walks.vl`'s memos), and
  the two calls `crReset` makes (`crLostReset`, `arenaEditLogReset`).

## The census

- **Probe-rollback map census:** `scripts/probe-map-classes.tsv`'s 16 rows for the moved maps are
  renamed to `check_capture_rows:CrRows.<field>`, with class and reason unchanged.
- **The field scanner:** in `tests/vl_probe_rollback_test.ts`, from #8267, it now matches a field
  whose type is a map itself. Before, it also matched a list of maps (`cvuDecls:
  {[i32]: boolean}[]`), which the top-level scan never counted either.

## Gate

- **Seeds:** A is a fixpoint built from `git archive b75afba1f`; D is a fixpoint built from this
  branch.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,283 programs, 0 different**.
- **L2:** the base tree's `compiler/entry.vl` built with A and with D is byte-identical (guest fuel
  88,186,956,977 and 88,241,305,206).
- **regress.vl:** no cell changed class; no runs lost. `lint-self.sh` is clean.
- **Lint and tests:** `vl check` warnings are unchanged at 301, the emitter-state audit test passes,
  and the probe-rollback test passes.

## Lines

The compiler is **+624 / −720, net −96** over 16 modules.
