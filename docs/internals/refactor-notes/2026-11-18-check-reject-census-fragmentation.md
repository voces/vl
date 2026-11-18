# The open `check_reject` rows by mechanism, 2026-11-18

Lane F2. Asked for the largest remaining `check_reject` family, the census came back fragmented. The
population is the 82 open rows with outcome `check_reject` across both inventories on master
`fe903786` (plus D16968, filed the same day), every one still graded "as filed" against a fresh seed.
They are grouped below by each row's own Mechanism section, not its title, and only the
empty-container group was ablated. A title cluster is not a family: the next census starts here.

| group | rows | mechanism |
|---|---:|---|
| Function values through holes, re-pointed `let`s, lambdas of differing results | 22 | one per row (a module-scope-only lift, `holeLetJudge`'s capture deferral, a stale destination row, the generic-rename close, per-type slots, write summaries) |
| Diagnostics, wording and tooling | 15 | no missing capability: a better sentence, one refusal for a cascade, or a tool |
| Record and list delivery at a wider record | 10 | one per row (readonly covariance, recursive aliases, a narrowed delivery, maker copies, nested list fields, callback builds, nested views, parameter adoption) |
| Singletons | 10 | one each |
| Hole parameters, generic bindings, list element pins | 7 | an open element or hole read before the pin that types it, each through its own rung |
| Narrowing | 6 | an `is` test or path fact that does not narrow, or narrows only part of a union |
| Empty container in a hole body (ablated) | 5 | the template's open container type, pinned in place by the first instance's re-ask |
| Numeric and literal typing | 5 | literal widening and numeric-union comparison rules |
| Generic and union lists | 3 | a join of list types at a generic parameter, or a union-of-lists element read through a parameter |

Rows, by group:

- Function values: D3183 D3931 D4719 D5018 D12236 D14880 D14943 D15197 D15332 D15771 D16095 D16096
  D16180 D16238 D16331 D16336 D16411 D16453 D16552 D16697 D16836 D16860.
- Diagnostics: D2293 D2308 D2540 D3270 D3409 D3471 D3482 D3771 D3819 D3983 D3984 D4060 D4193 D4985
  D16862.
- Record and list delivery: D4050 D4150 D4151 D14827 D16446 D16706 D16786 D16950 D16954 D16960.
- Singletons: D1856 D1968 D2101 D2673 D3230 D3477 D3642 D4053 D4263 D16382.
- Hole parameters and element pins: D10402 D16272 D16368 D16564 D16567 D16640 D16931.
- Narrowing: D3216 D3286 D3470 D4081 D4089 D4262.
- Empty container: D5472 D16423 D16602 D16603 D16968.
- Numeric and literal: D2980 D3321 D3452 D4037 D16650.
- Generic and union lists: D2772 D2833 D16930.

The empty-container ablation (a probe in `validateArgCstrs`): the hole body's argument type is one
arena entry (`_[]`, `{[_]: _}`) that `substTyDeep` returns unchanged, so the first instance's
`constrainEmpty` pins it in place and the second instance reads the pin. A bare `[]` argument passes
only because `argCstrFitsAt` re-asks its origin node, and an empty list literal node fits any list;
a `Map()` call node, a binding, a member-call demand (D16423) and the callee-write summary (D5472)
have no such answer. Three paths reach one root: a template-owned open container pinned in place.
