# `arm site operand`, part 2: an effect-free index built once (IR-C1, Q57)

Part 1 (#9824) took a narrowed receiver as its name. The remaining function,
`list-union-element-through-hole` `last` (`a[a.length - 1]`), has a non-atom index. Legacy writes
it again in each arm with `a` overridden to that arm's wrapper local, so its `a.length` there is the
arm's own `struct.get`. Matching that needs a per-arm sub-build of the index under a receiver
override, estimated at 3–4h of identity-only work. The queue acked the Q57 exception.

- **Builder** (`armSiteRead`): an index that is not re-readable, not the key's literal, calls and
  writes nothing (`exprEffectFree`), and is an `i32` is admitted. It is built once, before the
  `RArmSite`. An index that calls stays the named miss `arm site operand`.
- **Lowering** (`armSite`): such an index (a temp) is set into its own stash, `armIdxSlot`
  (scratch code 53, an `i32`, declared in `fbLazyListKindRun`). It comes after the read's row
  opens and before the receiver, and the writer reads that local in each arm.
- **Why it is the same behaviour**: legacy evaluates the index exactly once, in the one arm that
  runs, so the count is unchanged. The index calls and writes nothing, so moving it ahead of the
  tag test, which reads only the box, changes nothing observable. A trap in it is the program's
  trap either way.

## Price (Q57)

- **Run cost:** the IR sets the index once into the `armIdxSlot` stash ahead of the tag chain, then
  the arm that runs copies it into the read's index local (`local.set` of a `local.get`). Legacy
  computes the index straight into that local inside the arm. Each side evaluates the index once,
  so the IR pays one more `local.set` / `local.get` pair per executed arm-site read. Run fuel is
  unmeasured: no program run-fuel instrument exists. The Q57 readings' "fuel" column is the whole
  `vl run`, compile included.
- **Size:** the modules are smaller: `arm-site-hoisted-index-positions` 12955 → 12395 B,
  `list-union-element-through-hole` 2078 → 2022 B, `arm-site-narrowed-receiver-and-index`
  1639 → 1586 B.
- **No codegen property is lost:** the index is evaluated once, the bounds check is unchanged, and
  no unboxing or tail form changes.

## Divergences (`scripts/ir-divergence-baseline.txt`)

| program | functions |
| --- | --- |
| `tests/cases/unions/list-union-element-through-hole.vl` | `last` |
| `tests/ir-shadow-rows/arm-site-narrowed-receiver-and-index.vl` | `last`, `nextOf` |
| `tests/cases/unions/arm-site-hoisted-index-positions.vl` (the Q58 sweep) | the ten position functions |

All share one mechanism: one more `i32` local, and the index set into it ahead of the chain.

## Q58

`tests/cases/unions/arm-site-hoisted-index-positions.vl` puts `a[a.length - 1]` at 10 positions:
a scalar and a union call argument, a nested call argument, a concat operand (over `K[] | string[]`),
an interpolation hole, a `return`, a `let`, an `if` arm, a `??` operand (over nullable numeric
lists) and a record-literal field. All are covered, and the output is identical to part 1's seed.
Each function is a listed divergence.

## Legacy tails the IR calls

No new tail; the writer is #9768's.
