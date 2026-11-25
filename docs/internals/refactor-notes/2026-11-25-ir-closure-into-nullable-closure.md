# A closure into a nullable closure slot (2026-11-25, lane COV-START)

COV-START keeps `object field coercion` and `argument coercion`. A scratch build of the compiler
printed both reps at each miss. One rep pair shows up in both classes: a closure delivered into a
`(… ) => T | null` slot (a ref-niche nullable) whose closure names another signature of the one
closure struct. For example, `() => true` at `() -> i32` (the row a hole function's read set)
into a field held at `() -> boolean | null`.

## The mechanism

`cloNicheTakes` / `cloNicheRetag` (`ir_build.vl`) retag the closure to the slot's closure, as a
closure field's own retag does (`irCloFieldRetagNote`, the verifier's `cloFieldRetag`). They then
retag it into the nullable's niche, the plain ref the niche holds (`nicheRetag`). `objLitAt` takes
this at a record field and the call builder at an argument.

## Measured, on the classes' programs

| program | master | head |
|---|---|---|
| `generics/hole-guarded-call-through-nullable-field` | `object field coercion` | claimed |
| `closures/fn-value-generic-nullable-fn-param` (start and `direct`) | `argument coercion` | claimed |

Each matches legacy byte for byte under the armed shadow, with the same output under
`VL_IR_STRICT=1`. Sweep: `tests/cases/closures/closure-into-nullable-closure-positions.vl`. The
sweep needs the second record whose closure field returns `i32`, both read through a hole
function. Without them the field's closure rep is the lambda's own, and master claims it already.

## Left in the two classes

- `argument coercion`: a map whose values legacy stores at a wider record's row, a different
  `RMap` rep on one wasm struct (D13902, `map-binding-keeps-own-type-when-read-so`,
  `union-valued-maps-share-one-struct`). `refRepValtype` names no valtype for a map, so
  `repStoresAs` cannot see that the two lower alike. Teaching it maps changes what the verifier
  calls stored alike across many programs, so that is a coordinator question, not a lane fix.
  Also: a list of records at another row (D14381), a list of strings into a list of
  `string | null` (`elem-storage-class-widening-runs`), and instance records
  (`record-pattern-bool-i32-instances`).
- `object field coercion`: a list or record at another row (D16765, D16916, D17402,
  `same-elems-result-in-literal`, `record-repointed-at-subset-of-its-fn-set`,
  `rowless-record-narrowed-to-arm-as-field`), and a closure at a tagged set's id
  (`record-pushed-onto-literal-records-of-wider-set-beside-returned-list`).
