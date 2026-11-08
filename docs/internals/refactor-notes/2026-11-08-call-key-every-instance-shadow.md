# Step 2: does the call key bind every instance mono builds? (2026-11-08)

Follows [the identity bake's unkeyed derivation deleted](2026-11-08-identity-bake-unkeyed-deleted.md)
(#6752). That PR found mono's hole binding, `@name` registry key and seed binding are the only
answer for every instance that is not callback-specialized. This PR measures, per instance, whether
the elaboration's key already names it, and switches the one class that needed no new fact.

## The shadow

`$VL_ID_SHADOW=1` now prints one `ckey` row per instance `monoMakeInstanceGo` builds or reuses
(`elabInstShadow`) and one per type parameter `monoBindSeededTyParams` binds (`elabSeedShadow`).
The row names the key path (`call`, `value`, `lam`, or `spelled` for mono's own `@name` key), why
`elabCallKeyBinding` declined (`elabCallKeyDecline`), where the hole binding came from, and a
verdict: the key's `elabInstSpelling` against the instance mono demanded. Read by no pass.

Population: the 23,615 programs of `scripts/sweep.vl -- list`, built with `vl build`, on this branch
(#6752 merged with master `691fde26`). Counts are instance builds, not programs.

| class | before | after |
|---|---|---|
| keyed: the key's binding is the instance's (`call` + `value`) | 11,741 | **19,617** |
| a key, declined by `elabCallKeyBinding` | 12,554 | 4,673 |
| of those, a function-holding parameter: agree / differ | (not split) | 4,469 / 199 |
| of those, a hole-reaching parameter: agree | (not split) | 5 |
| no key at all (`spelled` 544, `lam` 140) | 684 | 684 |
| `monoHoleBinding` binds at least one name | 8,322 | **2,916** |
| registry hits, `call` + `value` + `typedhit` (agree / differ) | 8,910 / 24 | 8,910 / 24 |
| registry hits, `spelled` / `lam` (no key) | 268 | 268 |
| `monoBindSeededTyParams` bindings (agree / differ) | 25 / 3 | 25 / 3 |

All 24,980 builds. 18,459 compiles mint 25,140 instances on both sides.

## Switched: the value class

A function delivered as a value is keyed by `instKeyValueTime` (§3.4, value half), but its binding
was still rebuilt by mono: `elabCallKeyBinding` was only asked about the call key. It is now asked
about the value key where no call key exists. 7,882 value builds take the key's binding, and
`monoBindCols` + `monoHoleBinding` no longer run for them.

## What still needs mono, and why

- **A function-holding parameter (4,668 builds).** All but 5 of the declined builds that have a
  key decline for this reason: the key binds the parameter's TYPE, and mono's pin carries the function value's
  REP (closure vs tagged set, Fn#d's value-instance fact). The key's spelling agrees at 4,469 of
  them. Dropping the check in `elabCallKeyBinding` was tried: 24 `runs → not-runs` and 10 new
  compiler traps. The elaboration has to record that rep at the call before these switch.
- **No key (684 builds, 268 hits).** A lambda literal instanced inside another instance, which is
  handed to a value call (`h(x, (n) => n * 2)`, `functions/hole-lambda-literal-two-instance-types`),
  or a template with no call. The registry key is mono's `@name` spelling there by construction.
- **The 199 `differ-bind` builds** are in `closures/hole-fn-*` and `returned-*-lists-of-fns-*`. The
  key names a different binding than the instance mono demands, so they are the first witnesses for
  the rep fact above.

So none of `monoHoleBinding`, `monoWalkIdentCall`'s S1 map, `monoBindSeededTyParams` or the
`@name` key is dead yet. Nothing is deleted.

## Proof

- Fixpoint seed, byte-identical on the second rebuild: 6,500,501 bytes. The base is this branch's
  shadow-only seed at 6,500,093 bytes, so the switch costs +408 bytes, mostly shadow rows.
- `scripts/sweep.vl` diff, base vs candidate: 23,615 same, 0 bytes-only movers, 0 output movers,
  0 `runs → not-runs`, 0 new traps.
- `scripts/gate.sh`: 23 of 23 rows pass. The pin-helper budget stays at 928.
