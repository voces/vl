# Step 7: voidness read from the recorded result (`computeVoidFns` retired)

Measured 2026-11-07 on master `ac6882d5`, 4-core box; the proof rows re-read after merging master `f92d874b`.

## The population

Every `.vl` file under `tests/cases/` plus the distilled corpus (`cells/` and `named/`): 19,355
files. In process (the seed under Deno, `std:` and relative imports fetched the way
`tests/support/casesWasmOracle.ts` does), 14,507 compile; the other 4,848 are rejected identically
by both seeds below, with the same diagnostics. The shadow-only sweep, which stages no imports,
compiles 13,513.

## The void shadow on master (`fnRetShadowArm`, 13,513 programs)

| class | functions | witness |
|---|---|---|
| agree | 50,895 | (all) |
| never, emitter void | 21 | `tests/cases/modules/never-imported/util.vl` `fail` |
| no result recorded, instance or nested, emitter value | 16 | `tests/cases/generics/generic-value-slot-written-in-generic-body-at-two-instances.vl` `__lambda_0` |
| no result recorded, emitter value | 1 | same file, `__lambda_6` |
| recorded void, emitter value | 0 | |
| recorded value, emitter void | 0 | |

The `, emitter void/value` suffix is new in this PR: it splits the classes the recorded type does
not grade by what the emitter lowered. Every `never` row is a `: never` annotation, which
`buildFnMap` seeds and the pass never reads; an un-annotated function that calls one, or loops
forever, records `void` (pinned in `tests/vl_fn_ret_shadow_test.ts`). The 17 unrecorded rows are
lambdas in generic bodies whose result stays open; all are valued.

## The replacement

`recordedVoidFns` (one pass, no fixpoint): an un-annotated function is void when its recorded
result (`fnRecordedRetTy`) is `void`, it has a bare `return`, or no caller consumes its result.
Anything else, an open result included, is valued. The fixpoint's body derivation and the
helpers only it used (`cvfRecordedValue`, `blockTailMemberValue`, `tailIfNullableIsReal`,
`inferRetBearsNullByNode`, `ifArmsAllValues`, `inferNullFallsThrough`, `tailSelfFnIx` with `tailCallsSelf`'s guard in `emit_classify.vl`) are
deleted.

## Proof

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical, and master's own fixpoint as the base |
| seed size | 6,436,623 → 6,434,772 (−1,851), both fixpoints |
| byte sweep, 19,355 files | 14,507 byte-identical, 0 moved; 4,848 rejected identically |

## The kind shadow on master (`fnKindShadowArm`), for the next PR

`computeRetInference` and `buildFnMap` write the same columns in place (`fRetKind`, `fRetBool`,
`fRetStructIdx`), so the kind shadow grades the settled column through the lowered signature
(`cloSigKeyExt`). 31,197 valued functions:

| class | functions | witness |
|---|---|---|
| kind agree | 31,038 | |
| row agree | 78 | `tests/cases/modules/ambient-function-keeps-builtin-type/make.vl` `mkSet` |
| kind: recorded result has no token | 39 | `tests/cases/soundness/built-map-read-literal-default-returned-runs.vl` `g` |
| kind: recorded `>c`, lowered `>s0;` | 22 | `tests/cases/closures/bundle-record-let-holder-reassigned.vl` `lap` |
| kind: no result recorded | 17 | the void table's 17 |
| row: stamped `>m-1;`, lowered `>M-1;` | 1 | `tests/cases/objects/place-narrowed-nullable-container-field.vl` `mkS` |
| row: stamped `>m-6;`, lowered `>M-6;` | 1 | `tests/cases/maps/i64-keyed-position-union-member.vl` `pick` |
| row: stamped `>Z`, lowered `>M-4;` | 1 | `tests/cases/functions/hole-param-nullable-return.vl` `mkSet` |
| kind: recorded `>S`, lowered `>i` | 1 | `tests/cases/functions/return-assign-expression-global.vl` `setK` |

The 82 rows outside the two agree classes are what `computeRetInference`'s retirement has to
settle or park, one class at a time; they are not graded here.
