# D16296, D16232: the container variance rule reaches a union's arms, 2026-11-14

Lane M. These are clause-1 rows. The coordinator asked for one shared place, not a second copy of
the check.

## Mechanism

The function-value variance rule refuses a container whose functions a call through the
destination type would reach at another signature (`fvaRefuseNested`, with its one caller in
`fvaAdapt`). Its predicate, `fvaNestedFnDiffers` (check_ty_relate.vl), answered "no" whenever the
destination was a union. That happened at two levels:

- **The whole value (D16296).** A record built at `{f: () => i32}` was delivered to
  `{f: () => i64} | f64`. Check passed, and the narrowed call trapped.
- **A field (D16232).** A field typed `(() => boolean | i32) | {w: i32}` took `() => boolean`
  unconverted, so `is` on its function arm was false. This happened with or without an outer
  union.

## Change

- **`fvaAdapt`** (check_assignable.vl) applies the rule to each arm of a union destination that the
  container is assignable to. It is the same predicate and the same refusal, in a loop.
- **`fvaNestedFnDiffers`**: its function arm, given a union, asks `fvaFnArmsDiffer`. A function
  passes when it is one of the union's members, or when some function arm takes it unconverted.
  It differs when it lands only in function arms that would need a conversion.

Net compiler lines: +36 / −8 (+28).

Both rows now give the refusal that their plain twin already gave. That twin is the record
destination for D16296 and the function-typed field for D16232, and its refusal is by design: the
functions inside a value are not converted on the way. These spellings keep running: an arm that
needs no conversion, a record that already matches its arm, the annotated-result spelling and
`{a: i64[]}` with no function.

## Grading

Fixpoint seeds on both sides, `--before` master `613c659f1`.

- **Repo grids.** 46 grids show 0 runs→not-runs and the same RUNS counts. They are the 39 union and
  function templates under `scripts/capability-probes/matrix/`, plus `fn-record-field-list-written`,
  `fn-nested-record-field-list-written`, `fn-record-field-alias-written`, `fn-list-alias`,
  `fn-map-written-two-results`, `field-write-value` and `element-write-value`.
- **Lane T's three D16310 templates** (on its branch, not here), each 0 runs→not-runs:
  - `lambda-at-closed-fn-type-wider-scalar-result`: the `return_inferred` cell (annotated face)
    moves from TRAP to the check refusal; traps 27 → 26.
  - `lambda-at-closed-fn-type-fn-union-field`: the `return_inferred` cell (annotated face) moves
    from WRONG `false` to the check refusal; wrong 27 → 26.
  - `lambda-at-closed-fn-type-union-field-result`: unchanged.
  - Their other silent and trapping cells are D16310's and are unchanged.
- **Observed, not this row's:** `const v: {a: i64[], f: () => i64} | f64 = {a: [367], f: () => 6}`
  (the inline literal) traps on master and here. D16296's ablation credits D16310 with it, but
  D16310's fix is not on master yet.
