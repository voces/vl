# D16394: record `==` over fields stored apart, 2026-11-15

Lane B. Fixpoint seeds on both sides: before is master `33ef972d7`; after is this branch.

## Change

`checkEqualityBinNode` (`compiler/check_operators.vl`) now rewrites certain `l == r` (or
`l != r`) in place, using the checker's existing value-block desugar, into
`{ const $el = l; const $er = r; $el.f == $er.f && … }`. The rewrite fires when the checker has
already accepted the pair as mutually comparable, and both sides are records (or nullable records)
of one field set whose rows differ (`fieldStorageEq` false). A nullable side adds a null guard, so
a null side equals only a null side. Each field pair then goes through its own `==`: scalar, list
or record. A nested pair that differs is rewritten in turn. No second comparison table is added,
and the emitter is unchanged. The bindings are unannotated, so an operand whose row is settled
later (a literal-only binding adopted at a declared type, `soundness/record-literal-builds-at-declared-destination.vl`)
keeps that row.

Net compiler lines: +103 (`check_operators.vl` only). Pin-helper delta: 0.

## Measurement

`vl run scripts/capability-matrix.vl -- scripts/capability-probes/matrix/record-eq-fields-stored-apart.matrix.vl --before <before> --after <after>`:

- **before:** 28 of 96 graded cells run;
- **after:** 93 run;
- `runs → not-runs` 0, `→ silent` 0, program traps 0.

The 16 whole-program cells cover each of these field kinds, and each cell proves `==` and `!=`,
true and false:

- a literal union against its base;
- `i32` against `f64`, `i32` against `i64`, `f32` against `f64`;
- `i32 | null` and `string | null` against plain;
- `i32[]` against `f64[]` and against `(i32 | null)[]`;
- a nested record, and a nested nullable record;
- top-level nullable records;
- two mixed fields;
- reordered fields;
- operands evaluated once;
- a function parameter;
- a record-literal operand on either side.

Not running after the change:

- `return_inferred` annotated: a design-owed refusal.
- `litunion_list_field`, both faces: moved from the emit refusal to D16393's check refusal (an
  open clause-2 row for the list spelling).

## Found and filed

- **D16395:** `{f, g} == {f}`, which width subtyping accepts, still reaches
  `emitProgram: struct equality is not supported yet`. Which fields that comparison compares is
  not ruled, so the probe uses the aliasing witness both answers agree on. The `live-sites.json`
  row moves from D16394 to D16395.
- **D16396:** `{x: i32, y: i64} == {x: f64, y: i32}` is refused at check. The checker asks
  whether one whole record is assignable to the other, but each field pair compares bare.
