# Step 2: maker twins and solved hole calls are keyed (2026-11-08)

Follows [slot-stored values keyed](2026-11-08-call-key-slot-stored-values.md) (#6826).

## What landed

- **A maker's wide twin answers the value key.** `function d9() { return same }` delivered to
  `const v: (k: i32) => i32 = d9()` is built by mono at the destination's result (the D9282
  return widening). The elaboration already banks that twin (`elabWideTwin`, `ekRetWide`) before
  mono runs, but no lookup reached it: mono's destination is `() => (k: i32) => i32`, and
  `elabMemberKeyAtTys` declines an empty parameter list. `elabMemberKeyAtFnTy` now answers a
  zero-parameter destination with the twin at its result (`elabMakerTwinKey`): the one the
  instance being walked reached, else the only one.
- **A direct call of a hole function solved closed is keyed.** `function bound(a) { const k:
  ((x: i32) => i32)[] = a; ... }` called as `bound([inc0])`: the checker solves `a` from its use,
  so the call has no row and `elabDemandFrom` reads it as the root typing. Mono still builds it as
  an instance. The root walk now enqueues a nameless instance at the solved signature for each such
  call with no row and no key, and notes it on the call (`elabSolvedHoleCallAt`).
  An argument read from a binding is excluded: the instance's walk retypes the set the binding
  holds, and on `written-let-of-hole-fns-results-agree-at-hole-arg.vl` an ungated build moved the
  module and dropped one instance.

## The `ckey` classes, before and after

Population: the 23,679 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh
--rows`. Before is master `ea3c74ca`, after is this tree. Both are fixpoint seeds. The counts are
instance builds.

| class | before | after |
|---|---|---|
| keyed `call` build (agree / refines / differ-bind) | 15,575 / 183 / 6 | **15,622** / 183 / 6 |
| keyed `value` build (agree / refines / differ-bind) | 8,668 / 12 / 1 | **8,755** / 12 / 1 |
| keyed `lam` build (agree) | 50 | 50 |
| no key, `spelled` build | 527 | **393** |
| no key, `lam` build | 90 | 90 |
| `hit` / `typedhit` on a `spelled` instance | 149 / 90 | 134 / 92 |
| `typedhit call noinst` | 0 | 2 |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |
| instances (summed `insts` rows) | 25,273 | 25,273 |

All 134 builds that left `spelled` are now `agree`: 87 `value` (maker twins) and 47 `call` (solved
hole calls). The instance count is unchanged in every program, not only in sum.

The two `noinst` rows are `hole-nullable-string-cell-write.vl`: `f(v0)` passes a binding, so the
gate leaves it `spelled`, and `f("s")`, now keyed, reuses that instance by its typed key. One
instance serves both calls, as before. That instance has no elaboration key.

## What is left in `spelled` (393)

Read with a temporary row printing mono's template call, callee and walk top beside each build:

| builds | shape |
|---|---|
| 117 | a named hole function as a value at the root, bound by mono's hole binding (`hole-mono`) |
| 112 | a named function at the root with nothing bound (`hole-none`); not ablated, and calls passing a binding are among them |
| 84 | a root lambda, `hole-mono`: `a7.map((f) => f(3))` where `a7` holds a hole function |
| 69 | the same shapes inside an instance (37 `hole-mono`, 32 `hole-none`) |
| 11 | a root lambda, `hole-none` |

For the 84 lambdas, extending `elabCbNote` to an anonymous callback moves nothing. The element type
holds the hole function's open type, so `elabTyClosed(rt.aElem)` declines before any row is filed.
Keying them needs the element closed first, which mono's hole binding does today.

## Proof

- Fixpoint seed: 6,527,745 bytes, against master's 6,526,280 (+1,465, +0.022%). The `vl fmt`
  pass after the gate left the seed byte-identical.
- `scripts/sweep.vl` diff, master fixpoint vs candidate fixpoint: 23,679 same, 0 bytes-only, 0
  output movers, 0 `runs → not-runs`, 0 new traps.
- `scripts/gate.sh` on the final tree, 4-core box: 22 of 23 rows green on the first run, among them
  `scaling shape`, `late demands`, `seed size` and `dead-export budget`. The red row was
  `lint-self + fmt`: `vl fmt` drift in `emit_elab.vl`. After `vl fmt -w` it is clean.
