# L5 step 4c: the effect-summary rows as one `EsRows` record (2026-11-15)

Part of L5 step 4 (lifetime records, `2026-11-14-phase-products-design.md` §3). It follows step 4b
(`2026-11-15-l5-step4b-crrows.md`) and uses the same mechanical move.

## What changed

- **`check_effect_rows.vl`:** the 34 tables that `esReset` cleared with a literal now live in
  `export type EsRows`, built by `esRowsNew()` and held by `export let esRows`. `esReset` replaces
  them with one line, `esRows = esRowsNew()`. The `es` prefix is dropped from the field names
  (`esRows.decl`, `esRows.cost`, …); the `gc*` path columns keep their names.
- **Importers:** `check_program.vl`, `check_getter_effects.vl`, `check_escape_parts.vl` and
  `check_leaf_steps.vl` read `esRows.<field>`, and each imports one name in place of its list.

**Kept as module tables:**

- **`esKeyIx` and `esGetterReach`.** These are keyed maps. `esGetterReach` is a cross-phase read by
  `wasmEmit.vl`, and the sentinel-index lint cannot see a record field's map type (step 4b).
- **`esScopeBase` and `esFrame`.** These are walk cursors, not rows, and they belong to step 3's
  cursor record.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 10a7cc4d6`; D is a fixpoint built from this branch.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,298 programs, 0 different**.
- **L2:** the base tree's `compiler/entry.vl` built with A and with D is byte-identical. Guest fuel is
  88,302,566,828 for A and 88,302,566,804 for D.
- **Gates:** `regress.vl` reports no runs lost and `lint-self.sh` is clean. The probe-rollback,
  emitter-state audit, phase-state and memo-generation tests pass.

## Lines

The compiler is **+307 / −343, net −36** over 5 modules. `vl fmt` wraps 22 of the renamed lines that
now pass 100 columns.
