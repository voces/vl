# Step 7 L2 §7: an annotation with no type is not shape-walked, and a duplicated arm block is removed, 2026-11-11

The shape-walk census (`2026-11-11-step7-l2-shape-walk-census.md`) left `collectAnnShapes` as
the largest untyped root: a `TypeRef` with no recorded type, walked by its spelling, in 346
case programs. In 20 of them the walk minted a row. The census proposed giving these
annotations a type in the checker. This PR measures what the rows are for and removes the walk
instead.

The base is master `f38db9bd`. The population is the 346 case programs that reach an untyped
annotation walk.

## What the untyped walk minted

The untyped annotations are bounds and constraints (`T extends {toString():string}`,
`{eq(T):boolean}`, `{x:i32|string}`), generic-alias parameters whose declared type is still open,
and canon-rewritten nodes with no type.

A scratch candidate skipped the walk when the annotation has no type. Each of the 346 programs
was built with the master seed and with that candidate. Exit codes differ in 0 programs. In 335
the module is byte-identical. In the other 11, the module is 4 to 15 bytes smaller and the
program prints the same output. Those 11 are bound and constraint programs, such as
`constraints/bound-field-witness.vl` and `getters/getter-method-alternative.vl`, and the bytes
they lose are struct types that no value uses. Giving the bound a type would have kept those
rows. A bound is not the type of any value, so it has no row to mint.

## Duplicated arm block

On master, `internInlineShapeTyGo` ran the `iasMintTopDepth()` arm block (D15095) twice in a
row, character for character. A probe in a scratch compiler, never refreshed into a seed,
tagged the first copy whenever it changed the field's code or text, and tagged the second copy
the same way. Across the 7,442 case programs, the first copy changed a field in 3 programs,
which is the reach control. The second copy changed nothing in any program. The second copy is
deleted.

## Changed

- `collectAnnShapes` walks an annotation only when it has a root type.
- `internInlineShapeTyGo` runs the arm block once.

## Proof

- **Targeted.** The 346 programs that reach an untyped annotation walk were each built with
  both compilers: 0 exit codes differ, 11 modules differ, and those 11 print the same output.
- **Checks.** One `refresh-compiler.sh`; lint-self clean; distilled `regress.vl` reports no runs
  lost; the export, ladder, comment, sentinel, scan and render-parse budgets are at or below
  baseline; `tests/vl_scaling_shape_test.ts` passes. The full identity sweep is the PR's
  `sweep` job. It is expected to report the 11 as bytes-only movers.
