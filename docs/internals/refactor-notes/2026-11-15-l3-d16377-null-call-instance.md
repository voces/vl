# L3: the row slot's `null` call is the declared parameter's instance (D16377)

2026-11-15, lane I. A record parameter `p: A | null` handed a wider row becomes generic at its row
slot (`__R<decl>_<k>__A | null`, D3992). A call with only `null` binds no type parameter, so
`elabUnboundCallNote` keys it at the defaults, and a parameter only a `null` reaches binds
`never` (D3178). `never | null` is `null`: the instance took `nullref`, and an `is` over it found
no union (`emitProgram: `is` test but no union type declared`).

- `elabNullOnlyPin` (`check_calls.vl`): a type parameter only a `null` reaches binds `never`, except
  a row slot (`rowParamIsSlot`), which binds its record (`tvSlotBound`). The slot ranges over that
  record's rows, so the instance is the declared `A | null` function, which the `is`, `!= null`,
  `??` and narrowed-read lowerings already serve. Nothing in emit changes.

Measured on fixpoint seeds (master `417397629` vs this branch):

- `record-param-width-is-nullable.matrix.vl` (new: `is C`, `is A`, `is null`, `!= null`, a narrowed
  read, `??`, `null` first, two parameters, UFCS, a forwarded call, an exact row beside, a loop):
  8 → 24 of 24, runs → not-runs 0, silent 0.
- `record-param-width-{before,between,after,inline}`: unmoved, 0 lost.
- Named set `d16377-width-nullable-is`, 8 cells, all `runs`.
- Pin helpers (`emit_mono.vl`): 908 → 908.
