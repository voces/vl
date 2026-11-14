# D14803: an argument only a union of type parameters admits binds every candidate

**Ruling** (owner, 2026-11-14, DECISIONS under D14802): `F(5)` against `F<A, B>(v: A | B)` reads as
`F<i32, i32>(5)`.

**Change.** Two union arms in `check_relate_core.vl`, one per binding pass. Each already bound a
single open member, or paired open members with the argument's members by position when the
counts matched (D3643). When the counts differ, each now binds every open member to the argument's
members that no concrete member admits:

* `bindParamUnionLate`, the call's binding (`bindParamUnionOwn` / `bindParamUnionsLate`);
* `bindGenUnionRest`, the instance's pin (`bindGenWalkFull`), so the monomorphizer instances the
  same `F<i32, i32>`.

An argument a concrete member admits whole still binds nothing (D2803), and an empty `[]` still
leaves its `T` open (D12581).

**Matrix** (master → this change):

| program | master | now |
| --- | --- | --- |
| `F<A, B>(v: A \| B): boolean { v }; F(5)` | prints `true` | refused at the return, `expected boolean, got i32` |
| `H<A, B, C>(v: A \| B \| C): boolean { v }; H(5)` | prints `true` | refused |
| `const r: boolean = G(5)`, `G<A, B>(v: A \| B): A \| B` | prints `true` | refused, `cannot assign i32` |
| `G(5)`, `G("s")` | `5 s` | `5 s` |
| `H(5) H("s") H(2.5) H(true)` | runs | `5 s 2.5 true` |
| `N<A, B>(v: A \| B \| null)`, `N(5) ?? 0` | emit reject | `5` |
| `S<A, B>(v: A[] \| B[])`, `S([1, 2])` | emit reject | `2` |
| positional `i32 \| string` argument into `G` | `q 4` | unchanged |
| D2803 `pr<T>(v: T \| string)`; D12581 `len([])` | run | unchanged |
| mixed `A \| B \| i32`; another parameter names `A`; explicit type arguments | run | unchanged |

The witness moves runs → check reject, owed in `scripts/sweep-owed.txt`.
