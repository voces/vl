# The `raw` family is claimed (IR-C1)

`CLAIMED` gains `raw` (SRawOp, RRawOp, RRel). In an ordinary function the builder makes raw nodes
in two places: a union binding's `if` sink (`sink.put`, `sink.null`, `sink.close`) and a list
reserve (`reserve.open`, `reserve.close`). Both lower through legacy's own writers
(`unionBoxToPairTail`, `unionLetSinkClose`, `emitUnionNullToPair`, `listReserveOpen`,
`listBuildClose`). So a claim sets the same emit state legacy would, and the builder's own
questions (`letIfInitSinks`, `listReserveScan`) are syntactic scans. No new admission predicate.

Why `raw` was excluded: no hazard was recorded. #9114 added the family for runtime helpers, and
user-function raw ops arrived later in coverage PRs that left claiming unchanged.

## Readings (base `898b840d8`, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7611, fail under both 68, differ 0, timeout 0; witnesses same 60, differ 0 |
| `ir-identity.sh --claimless` | identical 14018, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, fail under both 3267, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45028 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline (eight baselined classes fell) |
| `--claims` | 44983 functions emitted by the IR; 83 outside the corpus; no fallback |
| L2 self-compile fuel per PR | -0.07% on 110309261217 |
| tests/cases claimed (mode 5, `fnc` rows) | 64019 → 64312 (+293 over 141 files, 0 lost) |

Released by directory: generics 104, unions 47, functions 30, arrays 25, lists 16, numerics 12,
types 9, closures 9, literal-unions 8, maps 7, inference 7, conditionals 7, lint 3, soundness 2,
match 2, strings 1, statements 1, objects 1, methods 1, loops 1.

## The functions released (tests/cases, file and function)

```
tests/cases/arrays/boolean-array.vl  mk
tests/cases/arrays/i64-array.vl  go
tests/cases/arrays/index-len-bounds-ok.vl  f
tests/cases/arrays/infer-build-scalar.vl  getf
tests/cases/arrays/infer-build-scalar.vl  geti
tests/cases/arrays/infer-build-scalar.vl  gets
tests/cases/arrays/infer-build-struct.vl  mk
tests/cases/arrays/infer-build-struct.vl  pair
tests/cases/arrays/infer-build-struct.vl  wrap
tests/cases/arrays/infer-empty-push-struct-unannotated.vl  captured
tests/cases/arrays/infer-empty-push-struct-unannotated.vl  inFn
tests/cases/arrays/infer-empty-push-var.vl  dup
tests/cases/arrays/infer-empty-scalar-elem-unannotated.vl  stored
tests/cases/arrays/inferred-f64-array-return.vl  built
tests/cases/arrays/inferred-return-empty-through-binding.vl  mk19
tests/cases/arrays/inferred-return-empty-through-binding.vl  mk8
tests/cases/arrays/nested-array-inferred-empty-deep-leaf.vl  deepLeaf
tests/cases/arrays/nested-array-inferred-empty-nested-ref-leaf.vl  f16
tests/cases/arrays/nested-array-inferred-empty-nested-ref-leaf.vl  f17
tests/cases/arrays/nested-array-inferred-empty-nested-ref-leaf.vl  mk15
tests/cases/arrays/nested-array-inferred-empty-push.vl  f64Nest
tests/cases/arrays/nested-array-inferred-empty-push.vl  i32Nest
tests/cases/arrays/nested-array-inferred-empty-push.vl  strNest
tests/cases/arrays/nested-array-inferred-empty-unsupported-leaf.vl  f32Leaf
tests/cases/arrays/u8-packed-list.vl  mk
tests/cases/closures/call-captured-closure-positions.vl  atArrayPush
tests/cases/closures/closure-array-push-lambda.vl  go
tests/cases/closures/hole-fn-generic-pushed-into-list-called-at-two-types.vl  main
tests/cases/closures/hole-lambda-pushed-into-typed-list.vl  pushed
tests/cases/closures/hole-param-of-fn-set-pushed-onto-closed-list-beside-tagged-copy.vl  h
tests/cases/closures/written-binding-of-generics-delivered-by-push.vl  main
tests/cases/closures/written-binding-of-generics-param-copy-stored-in-closed-holder.vl  pushCopy
tests/cases/closures/written-binding-of-generics-param-copy-stored-in-closed-holder.vl  pushCopyOfCopy
tests/cases/closures/written-fn-binding-two-types-delivered-by-value.vl  main
tests/cases/conditionals/if-binding-no-else-stays-nullable.vl  f
tests/cases/conditionals/if-join-narrowed-arm-unannotated-binding.vl  stillUnion
tests/cases/conditionals/list-join-arms-kept-in-any-order.vl  i3
tests/cases/conditionals/list-join-arms-kept-in-any-order.vl  ks
tests/cases/conditionals/list-join-arms-kept-in-any-order.vl  m3
tests/cases/conditionals/list-join-arms-kept-in-any-order.vl  m4
tests/cases/conditionals/list-join-arms-kept-in-any-order.vl  twoStep
tests/cases/functions/else-less-if-expression-binding.vl  annotated
tests/cases/functions/else-less-if-expression-binding.vl  arithmetic
tests/cases/functions/else-less-if-expression-binding.vl  coalesced
tests/cases/functions/else-less-if-expression-binding.vl  compared
tests/cases/functions/else-less-if-expression-binding.vl  falseArm
tests/cases/functions/hole-join-result-through-forwarder.vl  g
tests/cases/functions/hole-join-result-through-forwarder.vl  g$1
tests/cases/functions/hole-join-result-through-forwarder.vl  g$2
tests/cases/functions/hole-join-result-through-forwarder.vl  g3
tests/cases/functions/infer-string-array-return-codegen.vl  snap
tests/cases/functions/infer-string-array-return-codegen.vl  snap2
tests/cases/functions/inferred-if-binding-ident-arm.vl  fc
tests/cases/functions/inferred-if-binding-ident-arm.vl  fl
tests/cases/functions/inferred-if-binding-ident-arm.vl  fl64
tests/cases/functions/inferred-if-binding-ident-arm.vl  fp
tests/cases/functions/inferred-nullable-if-binding.vl  chain
tests/cases/functions/inferred-nullable-if-binding.vl  fd
tests/cases/functions/inferred-nullable-if-binding.vl  fe
tests/cases/functions/inferred-nullable-if-binding.vl  fi
tests/cases/functions/inferred-nullable-if-binding.vl  fl
tests/cases/functions/inferred-nullable-if-binding.vl  fm
tests/cases/functions/let-of-generic-repointed-read-handed-to-method.vl  pushed
tests/cases/functions/let-of-generic-repointed-read-handed-to-method.vl  pushedFirst
tests/cases/functions/let-untyped-from-array-call.vl  snap
tests/cases/functions/let-untyped-from-array-call.vl  snap2
tests/cases/functions/nullable-if-expr-binding.vl  chain
tests/cases/functions/nullable-if-expr-binding.vl  fd
tests/cases/functions/nullable-if-expr-binding.vl  fi
tests/cases/functions/nullable-if-expr-binding.vl  fl
tests/cases/functions/nullable-if-expr-binding.vl  fm
tests/cases/generics/annotated-join-coalesce-at-pin.vl  F
tests/cases/generics/annotated-join-coalesce-at-pin.vl  W
tests/cases/generics/annotated-join-coalesce-at-pin.vl  W$1
tests/cases/generics/binding-of-generic-function-delivered-as-value.vl  main
tests/cases/generics/body-type-param-composite-locals.vl  wrap
tests/cases/generics/body-type-param-composite-locals.vl  wrap$1
tests/cases/generics/body-type-param-composite-locals.vl  wrap$2
tests/cases/generics/coalesce-join-at-list-pin.vl  early
tests/cases/generics/coalesce-join-at-list-pin.vl  joined
tests/cases/generics/coalesce-join-at-list-pin.vl  renamed
tests/cases/generics/coalesce-join-at-literal-union-pin.vl  bind
tests/cases/generics/coalesce-join-at-literal-union-pin.vl  retbind
tests/cases/generics/coalesce-over-kept-apart-join.vl  F
tests/cases/generics/coalesce-over-kept-apart-join.vl  F$1
tests/cases/generics/coalesce-over-kept-apart-join.vl  G
tests/cases/generics/empty-list-literal-pin-through-generic.vl  filledLeg
tests/cases/generics/empty-list-pushed-type-param-pins.vl  back
tests/cases/generics/empty-list-pushed-type-param-pins.vl  one
tests/cases/generics/empty-list-pushed-type-param-pins.vl  one$1
tests/cases/generics/empty-list-pushed-type-param-pins.vl  one$2
tests/cases/generics/empty-list-pushed-type-param-pins.vl  one$3
tests/cases/generics/empty-list-pushed-type-param-pins.vl  two
tests/cases/generics/empty-list-pushed-type-param-pins.vl  two$1
tests/cases/generics/empty-list-pushed-type-param-pins.vl  two$2
tests/cases/generics/generic-body-push-record-of-generic-fn-two-instances.vl  run
tests/cases/generics/generic-body-push-record-of-generic-fn-two-instances.vl  run$1
tests/cases/generics/generic-body-push-record-of-generic-fn-two-instances.vl  run$2
tests/cases/generics/generic-function-value-stored-after-construction.vl  a
tests/cases/generics/generic-function-value-stored-after-construction.vl  a$1
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  arg
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  eq
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  f
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  f$1
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  fld
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  ret
tests/cases/generics/generic-if-null-join-coalesce-scalar.vl  two
tests/cases/generics/generic-is-beside-anonymous-record-pin.vl  first
tests/cases/generics/generic-is-beside-anonymous-record-pin.vl  h
tests/cases/generics/generic-is-beside-anonymous-record-pin.vl  k
tests/cases/generics/generic-is-over-anonymous-record-pin.vl  g
tests/cases/generics/generic-is-over-anonymous-record-pin.vl  h
tests/cases/generics/generic-is-over-anonymous-record-pin.vl  u
tests/cases/generics/generic-is-over-function-type-pin.vl  g
tests/cases/generics/generic-is-over-function-type-pin.vl  g$1
tests/cases/generics/generic-is-over-function-type-pin.vl  h
tests/cases/generics/generic-is-over-function-type-pin.vl  h$1
tests/cases/generics/generic-is-over-function-type-pin.vl  k
tests/cases/generics/generic-is-over-function-type-pin.vl  k$1
tests/cases/generics/generic-is-over-function-type-pin.vl  u
tests/cases/generics/generic-is-over-function-type-pin.vl  u$1
tests/cases/generics/generic-list-result-element-row.vl  mi
tests/cases/generics/gradual-type-parameter-union.vl  gasq$1
tests/cases/generics/gradual-type-parameter-union.vl  gret
tests/cases/generics/gradual-type-parameter-union.vl  gs
tests/cases/generics/gradual-type-parameter-union.vl  gtwo
tests/cases/generics/hole-fn-choice-nested-positions.vl  methodArg
tests/cases/generics/hole-guarded-member-read-through-nullable-field.vl  otherCalls
tests/cases/generics/hole-join-two-params-part.vl  g
tests/cases/generics/hole-join-two-params-part.vl  h
tests/cases/generics/hole-join-two-params-part.vl  m
tests/cases/generics/hole-optional-member-read-record-union.vl  H
tests/cases/generics/hole-optional-member-read.vl  G
tests/cases/generics/if-arm-local-generic-instance.vl  push
tests/cases/generics/if-join-two-list-types-union.vl  aliased
tests/cases/generics/if-join-two-list-types-union.vl  bound
tests/cases/generics/if-join-two-list-types-union.vl  chained
tests/cases/generics/if-join-two-list-types-union.vl  concreteFirst
tests/cases/generics/if-join-two-list-types-union.vl  looped
tests/cases/generics/if-join-two-list-types-union.vl  matched
tests/cases/generics/if-join-two-list-types-union.vl  taken
tests/cases/generics/inferred-string-int-null-join-into-generic.vl  g
tests/cases/generics/is-over-a-widened-numeric-join.vl  g
tests/cases/generics/is-test-a-pin-cannot-hold.vl  listTest$2
tests/cases/generics/is-test-a-pin-cannot-hold.vl  negGuard$1
tests/cases/generics/is-test-over-type-param-union.vl  h0
tests/cases/generics/is-test-over-type-param-union.vl  h0$1
tests/cases/generics/join-two-bare-type-params-is.vl  g
tests/cases/generics/join-two-bare-type-params-is.vl  h
tests/cases/generics/join-two-numeric-type-params.vl  f
tests/cases/generics/join-two-numeric-type-params.vl  f$1
tests/cases/generics/join-type-params-with-null-arm.vl  g
tests/cases/generics/literal-and-builtin-hole-at-pin-keeps.vl  okholepush
tests/cases/generics/literal-and-builtin-hole-at-pin-keeps.vl  u8push
tests/cases/generics/match-join-of-nullable-param-keeps-concrete-arm.vl  h
tests/cases/generics/match-join-of-nullable-param-keeps-concrete-arm.vl  h$1
tests/cases/generics/match-join-of-nullable-param-keeps-concrete-arm.vl  h$2
tests/cases/generics/numeric-union-null-test.vl  G
tests/cases/generics/returned-join-with-coalesce-arm.vl  g3
tests/cases/generics/unannotated-return-off-a-hole-typed-element.vl  elemPush
tests/cases/generics/unannotated-return-off-a-hole-typed-element.vl  elemPush$1
tests/cases/generics/union-member-order-across-joins.vl  choose
tests/cases/generics/union-member-order-across-joins.vl  choose$1
tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl  g
tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl  g$1
tests/cases/generics/value-join-at-the-pin.vl  chain
tests/cases/generics/value-join-at-the-pin.vl  g
tests/cases/generics/value-join-at-the-pin.vl  lit
tests/cases/generics/value-join-at-the-pin.vl  lit$1
tests/cases/generics/value-join-at-the-pin.vl  litStr
tests/cases/generics/value-join-at-the-pin.vl  two
tests/cases/generics/written-param-union-beside-concrete-default.vl  N
tests/cases/generics/written-param-union-beside-concrete-default.vl  N$1
tests/cases/generics/written-param-union-self-join-keeps-numbers.vl  F
tests/cases/generics/written-param-union-self-join-keeps-numbers.vl  G
tests/cases/inference/container-null-hole-filled.vl  callSite
tests/cases/inference/container-null-hole-filled.vl  coal
tests/cases/inference/container-null-hole-filled.vl  mkF
tests/cases/inference/container-null-hole-filled.vl  viaParam
tests/cases/inference/unannotated-build-expr.vl  firstPlusOne
tests/cases/inference/unannotated-reverse.vl  take2
tests/cases/inference/unannotated-reverse.vl  take2$1
tests/cases/lint/unused-container-no-warn.vl  main
tests/cases/lint/unused-container-no-warn.vl  make
tests/cases/lint/unused-container.vl  main
tests/cases/lists/inferred-return-list-join-loop.vl  inMatch
tests/cases/lists/join-list-union-if-bound.vl  h
tests/cases/lists/join-list-union-match-bound.vl  g
tests/cases/lists/join-list-union-match-bound.vl  h
tests/cases/lists/litunion-inline-array-ops.vl  ops
tests/cases/lists/push-atom-into-string-list.vl  lit
tests/cases/lists/push-atom-into-string-list.vl  opt
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  f
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  f$1
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  g
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  g$1
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  h
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  h$1
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  k
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  k$1
tests/cases/lists/push-hole-param-into-empty-literal-two-instances.vl  k$2
tests/cases/literal-unions/atom-array.vl  make
tests/cases/literal-unions/inferred-join-beside-a-scalar.vl  ret
tests/cases/literal-unions/inferred-join-beside-a-scalar.vl  tests
tests/cases/literal-unions/inline-atom-array.vl  go
tests/cases/literal-unions/litunion-atom-in-string-array-literal.vl  main
tests/cases/literal-unions/litunion-field-into-string-list.vl  fill
tests/cases/literal-unions/litunion-field-into-string-list.vl  main
tests/cases/literal-unions/litunion-field-nullable-string-sinks.vl  main
tests/cases/loops/exit-arm-null-join-binding.vl  filled
tests/cases/maps/list-of-maps-i32-key-frame.vl  go
tests/cases/maps/map-read-in-if-expression.vl  armOnly
tests/cases/maps/map-read-in-if-expression.vl  condOnly
tests/cases/maps/map-read-in-if-expression.vl  localMap
tests/cases/maps/map-read-in-if-expression.vl  matched
tests/cases/maps/map-read-in-if-expression.vl  narrowedReRead
tests/cases/maps/nullable-union-of-maps-if-join.vl  h
tests/cases/match/binding-arm-in-value-position.vl  either
tests/cases/match/binding-arm-in-value-position.vl  maybe
tests/cases/methods/optional-member-call-lambda.vl  pick
tests/cases/numerics/as-cast-constant-fits.vl  bytes
tests/cases/numerics/hole-param-numeric-union-past-null.vl  fi
tests/cases/numerics/hole-param-numeric-union-past-null.vl  ia
tests/cases/numerics/nested-join-means-its-hoisted-twin.vl  hoisted
tests/cases/numerics/numeric-join-null-any-order.vl  g
tests/cases/numerics/numeric-join-null-any-order.vl  h
tests/cases/numerics/numeric-join-null-any-order.vl  j
tests/cases/numerics/recursive-fn-joins-runtime-numbers-apart.vl  g
tests/cases/numerics/recursive-generic-joins-runtime-numbers-apart.vl  g
tests/cases/numerics/recursive-generic-joins-runtime-numbers-apart.vl  get
tests/cases/numerics/runtime-numeric-join-read-by-value-hole-mutual.vl  g
tests/cases/numerics/runtime-numeric-join-read-by-value-hole-mutual.vl  ga
tests/cases/objects/field-shorthand-kept.vl  intents
tests/cases/soundness/generic-litunion-element-bind-and-store.vl  viaLocalArray
tests/cases/soundness/record-literal-builds-at-declared-destination.vl  pushed
tests/cases/statements/bare-block-statement.vl  contents
tests/cases/strings/index-of-grid.vl  main$m1500621473
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  fnf32
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  fnf64
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  fni32
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  fni64
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  inff32
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  inff64
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  infi32
tests/cases/types/if-expression-no-else-scope-rep-grid.vl  infi64
tests/cases/types/if-expression-no-else-value-positions.vl  bindFn
tests/cases/unions/binding-if-arm-runs-its-prelude.vl  pre
tests/cases/unions/binding-if-sinks-each-arm-box.vl  opt
tests/cases/unions/binding-if-sinks-each-arm-box.vl  pick
tests/cases/unions/covariant-write-in-sibling-function-runs.vl  sib
tests/cases/unions/generic-join-record-pin-is-arm.vl  g
tests/cases/unions/generic-join-record-pin-is-arm.vl  g$1
tests/cases/unions/join-arms-typed-at-destination.vl  bind
tests/cases/unions/join-arms-typed-at-destination.vl  nested
tests/cases/unions/let-if-binding-arms.vl  chain
tests/cases/unions/let-if-binding-arms.vl  elseLess
tests/cases/unions/let-if-binding-arms.vl  probe
tests/cases/unions/let-if-binding-arms.vl  two
tests/cases/unions/let-if-binding-sink-with-returns.vl  h
tests/cases/unions/let-if-binding-sink-with-returns.vl  k
tests/cases/unions/lint-union-let-no-melt.vl  fast
tests/cases/unions/list-covariant-call-result-to-parameter.vl  other
tests/cases/unions/list-covariant-container-passed-to-function.vl  other
tests/cases/unions/list-covariant-container-second-name.vl  other
tests/cases/unions/list-covariant-container-to-lambda.vl  other
tests/cases/unions/list-covariant-delivered-by-container-store.vl  f
tests/cases/unions/list-covariant-delivered-by-container-store.vl  other
tests/cases/unions/list-covariant-delivered-through-return.vl  other
tests/cases/unions/list-covariant-delivered-to-lambda.vl  other
tests/cases/unions/list-covariant-delivered-to-nested-element.vl  other
tests/cases/unions/list-covariant-delivered-to-struct-field.vl  other
tests/cases/unions/list-covariant-for-in-read.vl  other
tests/cases/unions/list-covariant-nested-container.vl  other
tests/cases/unions/list-covariant-readonly-view-call-result.vl  __other
tests/cases/unions/list-covariant-readonly-view-opaque-callee.vl  __other
tests/cases/unions/list-covariant-returned-container-inferred.vl  other
tests/cases/unions/list-covariant-returned-container.vl  other
tests/cases/unions/literal-union-arm-box-null-and-eq.vl  h
tests/cases/unions/literal-union-arm-box-null-and-eq.vl  u
tests/cases/unions/narrowed-numlit-list-arm-read.vl  inferred
tests/cases/unions/un-annotated-empty-list-union-push.vl  structUnionPush
tests/cases/unions/un-annotated-empty-list-union-push.vl  valueUnionPush
tests/cases/unions/union-field-literal-row-positions.vl  g
tests/cases/unions/union-field-literal-row-positions.vl  g2
tests/cases/unions/union-field-literal-row-positions.vl  g3
tests/cases/unions/union-if-value-variant.vl  go
tests/cases/unions/union-member-widened-delivery.vl  fl
tests/cases/unions/union-member-widened-delivery.vl  go
tests/cases/unions/union-member-widened-delivery.vl  nul
tests/cases/unions/union-member-widened-delivery.vl  ret
tests/cases/unions/union-member-widened-delivery.vl  three
tests/cases/unions/union-member-widened-delivery.vl  viaArg
tests/cases/unions/variant-element-list-beside-layout-twin.vl  elemPush
```
