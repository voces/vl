# Step 2: a value call's member is keyed on the value its slot stores (2026-11-08)

Follows [held generics keyed](2026-11-08-call-key-held-generics-landed.md) (#6813), which left
558 `spelled` builds and 90 `lam` builds with no key.

## What landed

- **The stored value holds the key.** For a call through a field or element read, such as
  `a1[0](3)` with `let a1 = [inc0]`, `elabSetCallRows` instanced each hole or generic member and
  noted the key on the CALL. Mono makes that instance where the value is STORED (the `inc0` in the
  literal, with no template call), so its first request found no key and the build fell back to
  mono's spelling. A later typed request reached the same instance as `typedhit value agree`. The
  member's key is now also noted on each value the write scan places at the callee's slot
  (`elabCalleeStoredValues`, `cwSlotWrittenValues`), at the root only, for a field or element read of
  a `let`, and only when some generic or hole function is read as a value. Without that gate
  `scaling shape`'s record-parameter axis read 40x (bar 5.1): a parameter's slot asks every caller.
- **A call through a closed function type gets rows.** `v.fs[0](3)` with
  `const v: { fs: ((x: i32) => i32)[] } = r` has a callee type that is already closed, so the
  checker files no call-bind row and the elaboration never ran `elabSetCallRows` for it
  (`d15198_run_n_i32`). Such a call with no row now runs it when some target is a hole function or
  a generic (`elabClosedValueCallRows`).

## The `ckey` classes, before and after

Population: the 23,670 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh
--rows`. Before is #6813 merged onto master `dfc71a0a`, after is this tree. Both are fixpoint
seeds. The counts are instance builds.

| class | before | after |
|---|---|---|
| keyed `call` (agree / refines / differ-bind) | 15,574 / 183 / 6 | 15,574 / 183 / 6 |
| keyed `value` (agree / refines / differ-bind) | 8,622 / 12 / 1 | **8,661** / 12 / 1 |
| keyed `lam` (agree) | 50 | 50 |
| declined `hole` | 1 | 1 |
| no key, `spelled` (hole-none / hole-mono) | 299 / 259 | **289 / 230** |
| no key, `lam` | 90 | 90 |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |
| instances (summed `insts` rows) | 25,257 | 25,257 |

All 39 builds that left `spelled` are now `value agree`.

## What is left in `spelled`, by where mono builds it

Read with a temporary row printing mono's template call and walk top beside each `spelled` build,
on the 392 programs that carry one (an ungated build of this change, 516 left; the five largest buckets, 514 of them):

| bucket | builds | shape |
|---|---|---|
| a named function as a value, nothing to bind, at the root | 158 | `function d9() { return same }` delivered to `(k: i32) => i32`: mono instances the maker per destination (the return widening). The elaboration walks those instances, but only because mono demanded them, so no key exists before the build. |
| a direct call, nothing to bind, at the root | 98 | a hole parameter the checker solved closed from its uses (`unannotated-param-solved-from-usage`): no row binds anything, so nothing is enqueued. |
| a named hole function as a value, at the root | 108 | not ablated yet. Candidates: stored values the write scan does not place, and calls whose value never reaches `elabSetCallRows`. |
| a root lambda as a value | 83 | a hole lambda handed to a list method at the root (`a7.map((f) => f(3))`). Root callbacks are filed by `check_elab_cap.vl` for named generics only. |
| inside an instance | 67 | the same shapes under a walk top; the stored-value note is root-only. |

## Proof

- Fixpoint seed: 6,526,937 bytes, against the base's 6,525,260 (+1,677, +0.026%).
- `scripts/sweep.vl` diff, base fixpoint vs candidate fixpoint: 23,670 same, 0 bytes-only, 0
  output movers, 0 `runs → not-runs`, 0 new traps. The change moves keys only.
- `scripts/gate.sh` on the final tree: all 23 rows green (seed size, late demands, dead-export budget and `scaling shape` among them).
