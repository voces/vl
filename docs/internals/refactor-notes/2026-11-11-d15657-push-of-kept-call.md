# D15657: a push of a kept maker's call stores into the list as an index write does, 2026-11-11

Clause-2 close. Base is master `ada32709`.

## What was wrong

`const xs = [mk2()]; xs.push(mk2())`, with `mk2` kept at `J = { f: i32 | null }`. The store
column (`recStoreDeclOf`) named a list-literal binding as the container of its elements and of
`xs[i] = v`, but not of `xs.push(v)`. So the pushed call was not a stored value, never reached
`recStoresAgree`, and D15180's own-storage refusal fired on a call that is itself kept at `J`.

Building the position matrix found a second defect on master. `[...xs, mk2()]` trapped the
compiler: `recStoredValues` listed the spread part as a stored value, and `recRefuseAtOwnRow` read
`tyAt(-1)` for it.

## The fix (checker)

- `recStoreDeclOf` and `recMapSetStoreValue` (check_fit_rules.vl) answer `xs.push(v)` as a store
  into `xs`, beside `xs[i] = v`, when a kept delivery builds `v`. Counting every push broke 15
  fixtures: a pushed literal or binding is built by D15287's push rules, not the store column.
- `recStoredValues` skips a spread part. It hands on another list's elements and is no stored value.
- `recStoreSpreadsApart` (check_bind_adopt.vl) runs once every container's build is known. It
  refuses a spread part held at its own storage beside the build, with `recListPartsApartRefuse`'s
  sentence. A spread of a list that is itself built at the build runs.

## Graded

| cell | master | here |
| --- | --- | --- |
| `push(mk2())`, `push(b)` after `[b]`, `push(c)`, in a function, unwritten `let`, loop | check reject | runs |
| `[...xs, mk2()]`, `[mk2(), ...xs]`, `[...xs, ...]` after a push | compiler trap | runs |
| `[...xs]` then `push(mk2())` | check reject | runs |
| `[...own, mk2()]`, own a fresh literal list | compiler trap | check reject, D15671 |
| `[...own, mk2()]`, own annotated `{f: i32}[]` | compiler trap | check reject, fixture |
| `xs[0] = mk2()`, `[mk2(), mk2()]`, `push({ f: 2 })`, `J[]` then push, `Map` set | runs | runs |
| `{ ys: xs }` then a field read | emit error | emit error, D15670 |
| std:array `insert` / `concat` | check reject | check reject, D15672 |
| a reassigned `let` list, push or index write | check reject | check reject, D15673 |
| push of a call kept at another row `L` | check reject | check reject (owed) |

There is no `unshift` on a list.
