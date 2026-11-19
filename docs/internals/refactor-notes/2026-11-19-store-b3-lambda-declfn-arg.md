# STORE B3.10b step 2: a lambda as a declared callee's argument (2026-11-19)

This is the lambda-leaf position the 2026-11-18 design note left open ("a direct call's
argument", 27 rows on master + #9051).

## Mechanism
`ftLamPlainAt` (the check's retry, `ftNodeOk`'s FuncDecl arm) admits a lambda that is an argument
of a call through a set. It now also admits a lambda argument of a declared callee, when all of
these hold:
- the argument lands in an un-annotated parameter the callee does not hand back (`ftArgHandedBack`);
- every fact of the lambda's set is at one argument vector (`arrowSetOneShape`).

## Measured (master c38445e91 fixpoint vs this branch's fixpoint)
Without the one-shape condition, 18 rows move but 10 programs break: 8 validation failures, 2
"tagged a function set the check refused", and 1 "called at two signatures" refusal. The breakers
are the bundle-record family (`closures/bundle-record-*.vl`, `hole-lambda-bundle-*.vl`) plus
`functions/hole-lambda-literal-at-two-instances.vl` and `functions/generic-structured-param-through-hole.vl`.
In each, the callee calls the lambda at two signatures (`f(2.5)`, `f(3)`), so it is one closure per
signature, never one id. The 13 rows that condition keeps late are those.

With it:
- Late tag rows: 5 gone, 0 new (each `T {<lambda>}`):
  - `closures/handed-hole-fn-widening-i32-to-f64`
  - `closures/hole-lambda-member-tagged`
  - `functions/hole-lambda-typed-by-callee-call`
  - `generics/hof-hole-fn-and-closed-lambda-instances`
  - `literal-unions/coalesce-hole-call-retyped-dead`
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics byte-identical.
- Full @run A/B over 6,760 programs: 0 RC, wasm or output movers.

## Left
The remaining declared-callee argument rows are called at two signatures. Deciding them at check
needs a per-signature id: an instance key per (call, KeyId) rather than one per set.
