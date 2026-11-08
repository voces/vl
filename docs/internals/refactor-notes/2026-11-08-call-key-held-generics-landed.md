# Step 2: held generics keyed, lambdas through a held member keyed (2026-11-08)

Follows [held generics and lambdas](2026-11-08-call-key-held-generics-and-lambdas.md) (#6803),
which parked the held-generic half because it moved one emit refusal's anchor.

## What landed

- **Held generics.** The call key binds a parameter type that is open only beneath a function
  type (`[id]`, `{ f: id }`) as it stands (#6803's parked commit `11b52c00`).
- **The pin binds `T` wherever the declared type holds it.** `elabKeyGenericFnPin` read only a
  parameter declared as bare `T`. For `use<T>(ys: T[])` handed `[id]` it bound `T` to the
  generic's open type, so `use`'s own body refused (`ys.length`, lib.vl:2). That was a real
  `runs → not-runs`: the plain witness without the `push` runs on master. The pin is now walked
  against the declared type (`bindGenWalk`), the witness runs, and
  `vl_emit_diag_position_test`'s refusal stays at lib.vl:7 as on master. No re-anchor or new
  inventory row was needed.
- **Lambdas handed through a held non-generic member.** A call through a held function value
  ran `elabArgRows` only for a member with something to bind, so in `outer(h, x) { h(x, (n) =>
  n * 2) }` with `h` holding `two`/`twof` the lambda had no value key. A member that binds
  nothing now runs it too, where its closed parameters take the instance's argument types
  (`elabMemberTakesArgs`). Otherwise both members key the lambda in each instance, and the
  lookup declines.

## The `ckey` classes, before and after

Population: the 23,662 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh
--rows`. Before is master `7eeb80e6`, after is this tree. Both are fixpoint seeds. The counts
are instance builds.

| class | before | after |
|---|---|---|
| keyed `call` (agree / refines / differ-bind) | 15,357 / 46 / 6 | **15,573 / 184 / 6** |
| keyed `value` (agree / refines / differ-bind) | 8,624 / 12 / 1 | 8,624 / 12 / 1 |
| keyed `lam` (agree) | 27 | **50** |
| declined `open` | 350 | **0** |
| declined `hole` | 5 | **1** |
| no key, `spelled` | 558 | 558 |
| no key, `lam` | 113 | **90** |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |
| instances minted | 25,259 | 25,259 |

## Still open

- **`lam` (90).** Two shapes remain: a lambda bound to a name and handed to a plain call inside
  an instance (D3928), and a lambda delivered by a return (D14881).
- **`spelled` (558).** Hole functions held in a list or record and reached only through an element
  read or an annotated binding, e.g. `const v: { fs: ((x: i32) => i32)[] } = { fs: [inc0] }`
  (`d15198_run_n_i32`), or never called (`d15207_arrow_length`). The elaboration demands no
  instance for them. Keying them needs a walk that delivers a function value into a typed
  container slot.
- `hole` 1, the 3 seeded differs and the 7 keyed `differ-bind` (D15537's wider rep row): not
  graded in this change.

## Proof

- Fixpoint seed: 6,505,881 bytes, against master's 6,504,969 (+912, +0.014%).
- `scripts/sweep.vl` diff, master's fixpoint seed vs candidate: 23,662 same, 0 bytes-only, 0 output
  movers, 0 `runs → not-runs`, 0 new traps.
