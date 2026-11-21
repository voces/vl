## Type system (Track A)

- **D17043 closed:** `vl check` no longer reports `const r = { f: twice }` unused when its only read is `r.f(3)` and `twice` is a named function. The checker repoints such a call to `twice(3)` and the original callee leaves the tree; the lint now reads the receiver and the field off the call's own tokens, as it reads any `x.m(…)` callee. Pinned by `tests/vl_check_field_call_read_test.ts` and `lint/field-call-named-function-no-warn.vl`.
