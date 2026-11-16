# Oracle: a radix tree that is no constant in a join, and min's f32 peer (2026-11-16, lane SOUND)

`fuzz.sh --gen all --seeds 60` on master `d14f2c88c` reported two DISAGREEs and one UNSOUND. All
three were oracle gaps. In each, the compiled output matches the same value delivered another
way, which the oracle already agreed with.

| cell | minimal witness | oracle before | compiled | rule |
| --- | --- | --- | --- | --- |
| `ar_s59_0004` | `let k: i32 = -5; const v2: i64 = 4294967296; print(if k > 0 { v2 } else { 0xFFFFFFFF << k })` | `-134217728` | `-576460752303423488` | 4.3 |
| `ar_s49_0065` | `function f(p: i32): i64 { return if p == 0 { p - 9 } else { 0xFFFFFFFF - 9223372036854775807 } }` | `0` | `-9223372032559808512` | D3043 |
| `ar_s47_0131` | `const m: f32 = min(g(2.5), 0.1 % (if 0.0 < c { 3.0 } else { 0.5 }))`, `g: (f32) => f32` | fault: `0.1 does not fit f32` | `0.10000000149011612` | 4.3 |

- **4.3, a tree that is no constant.** `litJoin` ran a radix tree at the typed arm's width only
  for a constant tree. A tree over a variable (`0xFFFFFFFF << k`) took the i32 default and was
  widened afterwards. `radixArmCtx` now evaluates such an arm, in an `if` or a `match`, at the
  typed peer's width. A constant tree is still re-run in `litJoin`.
- **D3043.** A constant radix tree holding a decimal outside i32 is i64-wide. Beside an i32 arm,
  it was re-run at i32 and wrapped `2^63-1` to `-1`. It now keeps its width, and the join widens.
- **`min`/`max`/`abs`.** A float tree over a join of float constants (`floatJoinTree`) is no
  constant, so it was evaluated at f64 and then refused at the f32 binding. Beside a typed `f32`
  argument, it is now evaluated at f32.

Each witness is pinned in `tests/oracle_smoke_test.ts`.

The first run's compiled outputs were re-judged with the fixed oracle (`oracle.ts diff`). AGREE
went from 54,552 to 54,555, with 0 DISAGREE and 0 UNSOUND. The distilled corpus is identical
under both oracles: AGREE 10,806, 0 new disagreements.

## The hof generator's refusal share

The same run refused 1,667 of 12,000 `ho` cases (13%, ceiling 7%). The ceiling was set at 5% on
2026-11-15 (`2026-11-15-oracle-refused-column.md`). Seeds 1-10 alone now refuse 12.9%, and every
block of ten seeds lands between 12.9% and 14.9%.

The rise is d7b8845e7 (D16562, #8450): an unbound callee type parameter binds at its default.
- Method: a 60-cell sample of seeds 1-10 refusals, checked at each first-parent master commit
  since `5ea626748`.
- `5ea626748` and d191c5b5a, the commit before d7b8845e7, refuse 21 of the 60.
- d7b8845e7 and every later commit refuse all 60.
- The new refusals are the generator's `compose(hinc, hinc)(<i64 or f64>)`: `compose`'s `A` is
  bound by nothing at the call. That is now the language, so the generator must bind it.

A 60-case sample of today's `ho` refusals, by first error:
- 27: `compose`'s unbound `A` taking `i32`.
- 15: a constant overflowing `i32`.
- 3: `string + i32`.
- The rest: `cannot assign` of a hole function's body at another call's type.

None is an emit reject.

Of the 21 sampled cells already refused before D16562, 18 raise `… at the call's argument types`.
All 18 run past `vl check` once only their `g<N> = …` reassignment lines are removed. That is
[D16813](../inventory/D16813.md), a clause-2 refusal that depends on call order. The other 3 are
the generator's own: `hinc` at a `string`, and a constant outside `i32` handed to a compose.
