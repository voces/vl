# IR coverage: `return <expr>` in a function with no result (2026-11-26, COV-CALL)

**Mechanism.** At a function whose result rep is no-value, the IR builder's `RetStmt` arm missed
on `void return value`. Legacy (`emitStmt`'s `RetStmt` leg) emits the argument as a statement and
then a bare `return`. The builder now does the same: `stmtNode` on the argument, then the bare
return node. The `return f()` tail-call form keeps going through the lowering's existing
void-tail-call rule.

**Census (regen-9 `void return value`, 12 rows).** Every row is now claimed:

- `closures/lambda-bundle-through-hole-param-at-several-signatures` (`useCap`);
- `functions/named-fn-through-hole-param-calling-generic-at-two-types` (`inner`);
- `functions/never-function-value` (`call$1`);
- `generics/hole-param-tail-calls-void-field-function` (`click` and `tap`);
- `modules/ufcs-type-bound-at-type-parameter` (`__lambda_4`);
- `unions/variant-list-coerced-element-positions` (`fail`);
- `named/d16261_generic` (`id`);
- the witnesses of D14601 (two rows), D16260 and D3925.

Each armed run prints what legacy prints. The only shadow differences are byte mismatches in the
locals prefix, which are informational.

**Q58.** `tests/cases/functions/void-return-value-positions.vl`. On the master seed it claims 8
functions; on this branch it claims 13, and the armed run prints the `@log` list.
