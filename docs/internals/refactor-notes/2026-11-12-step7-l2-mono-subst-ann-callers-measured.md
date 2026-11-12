# Step 7 L2 §7: emit_mono's monoSubstAnn callers measured against the naming rule; all stay, 2026-11-12

`monoSubstAnn` (`emit_base.vl`, lane w310) substitutes an instance's `tvV` binding spellings
through an annotation's text. Lane w310 deletes it once it has no callers, and this lane moves
emit_mono's callers off it. Each caller was tried with the substituted type in place of the
substituted text: the substituted annotation type (`monoSubstInst`, `substTyDeepOf`), spelled by
the naming rule. That is `monoPinSpellShaped`, and `monoPinSpellFields` for a `let` annotation,
whose `#anon` bindings are re-spelled by shape.

The base is master `b5d9150f`. Each candidate was built by one seed and swept alone against the
base built by the same seed. The population is the whole sweep: 23,945 programs.

## Trials

| caller | same | runs → not-runs | losing cells | floor |
| --- | --- | --- | --- | --- |
| `monoSubstAnnNode` (a cloned lambda's parameter annotation) | 23,937 | 8 | the `d2567_iife__*` and `d2567_ret2__*` named cells (nullable unions through an IIFE and a return): "parameter `x` of a lambda is substituted at another type than the elaboration's" | the lambda clone's check compares the substituted spelling with the elaboration's, so the rule's spelling of a nullable union reads as another type |
| `monoPinTyParamComposite`'s `pinC` | 23,941 | 4 | D15530, `generics/is-list-over-union-arm-tests-emptiness.vl`, `generics/null-only-type-param-binds-never.vl`, `generics/nullable-alias-app-type-param-binds.vl`: "unsupported argument type" | the rule has no spelling where the binding holds `never` or an alias application, and an empty pin is refused |
| `monoSubstLetType` (a body `let` annotation) | 23,937 | 7 | D933, `d933_ctl_const_arms`, `d933_widen_narrowed_use`, `generics/generic-is-over-anonymous-record-pin.vl`, `generics/join-of-lists-literal-union-beside-string-at-instance.vl`, `generics/pin-explicit-type-argument-union-member.vl`, `generics/widen-union-structT-narrowed-string-arm.vl` (invalid modules; one "ref valtype with no interned shape") | the `let`'s union annotation is registered and read back by its spelling (`monoPinMintedUnion`, `letUnionNameOf`), so a respelled member order or a row name keys another row |
| `monoSubstAnonShapes` (its own `monoSubstAnn` call) | — | — | — | not tried alone: it rewrites the `pinC` / `let` text the two rows above produce, so it moves with them |
| `monoFoldLayoutAt`'s `IsExpr` arm | — | — | — | lane w321's call site (`monoSubstIsExpr`), not tried here |

No caller moves without its text reader asking the type. These are the same readers that hold
`monoPinAnnSpelling` and `monoPinUnionNameOfTy` (D15810): the union registry by spelling, and the
lambda clone's spelling compare. So `monoSubstAnn` keeps its callers until those readers key by
type.

## Proof

This is a docs-only change: no compiler source changes, and the seed is byte-identical by
construction. The trial compilers were scratch builds, never refreshed into a seed.
