# IR array literal: a closure element whose rep leaves a hole open is retagged (IR-C1)

`array element coercion`, the closure → closure share (21 functions from D1's hand split, by
got → want rep pair). By ablation it is one mechanism. A hole lambda, or a generic function's
value, built at its own closure rep is delivered into a list whose element is another closure rep
of the same struct. A record field already takes that case (`holeRetagNoted` → a `repTemp`
retag, the same closure struct); the array literal's element loop had no such arm. It now has
it, guarded the same way.

Of the 21 functions, 15 are now fully claimed. 6 move to existing classes:
- `closure temp at an open type's rep`: hole-lambda-binding-read-at-open-type-in-instance ×2,
  two-lambda-written-let-in-two-instances ×2, D7281 ×2.
- `store operand coercion`: captured-cell-hole-lambda-seed-in-generic-body.
- `global store coercion`: hole-lambda-alias-written-values.

The closure → nullable share (4 functions: generic-function-in-nullable-function-list-literal ×3,
D3940) is a second mechanism, and this change does not reach it. A hole lambda or a generic value
into a nullable-function element needs the retag and the nullable widening; it comes separately.

## Legacy tails the IR calls

- `array spread source rep`: the sweep's module-scope `[...[hb], gen]`. It is an existing class.
