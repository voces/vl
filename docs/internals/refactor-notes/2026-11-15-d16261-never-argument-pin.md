# D16261, D16260: a parameter bound at `never` is pinned at the default

2026-11-15, lane I. Bucket (f). A `never` argument (`f(fail())`) binds an un-annotated or generic
parameter at `never` in the elaboration. `never` has no pin spelling (`monoPinOfClosedTy` answers
""), so the hole rung's comparison of mono's pin with the elaboration's had two empty spellings
and refused the call as internal (D16261), and the type-parameter rung had no argument pin to
spell (D16260).

- Both rungs (`emit_mono.vl`) now read the elaboration's binding (`elabCallHoleParamTy`,
  `elabCallParamTy`) and, where it is `never`, spell the instance's default and keep `never` as
  its type. That is the rule an explicitly unbound type parameter at `never` already follows in
  `monoBindTyParamElab` (D15530). Mono computes no type of its own for the binding.
- The call never runs past its argument, so the instance's parameter is never read.

Measured on fixpoint seeds (master `7bf2afc7a` vs this branch): the `d16261-never-argument-pin`
named set, 8 cells, all `runs` (7 refused on master); the eight `*never*` matrix templates
unmoved, runs → not-runs 0. Pin helpers (`emit_mono.vl`): 908 → 908.
