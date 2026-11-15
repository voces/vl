# D2539: a call refused for an unbound return type parameter is an error, 2026-11-15

Lane K, bucket (f). Clause 2, message quality.

## Mechanism

`const t: IdTable<Tex> = IdTable()` names `V` only in `IdTable`'s return, so the call is
refused with `cannot infer type parameter `V``. That refusal is the one the design owes: a
destination annotation is no pin ([D9073](../inventory/D9073.md)). The call was then still
typed as its raw return, `{slots: (V | null)[], length: i32}`, with `V` unbound. The delivery
into `IdTable<Tex>` asked the covariant-write rule (`rcwCovs`). That rule counts a named type
parameter on the source side as any type, so the slot `.set` writes looked widened. The second
message then quoted line 47 of `std:idtable`, a line the caller never sees.

## Change

- `checkRetTyParamBound` (check_node_rules.vl) answers whether it refused.
- `checkCallOnFuncTy` (check_calls.vl) types a refused call as `TY_ERR`, which every later
  judge already skips, the covariant-write rule included.

Net compiler lines: about +6. Pin helpers: none touched.

## Grading

- The witness reports the one owed error. So do a list result (`mk<V>(): V[]`) and a record
  result (`Box<V>`), annotated and written through.
- A fixture asserts the single error: the corpus runner fails on any undeclared diagnostic.
- The other gates: see the PR.
