# Step 2: the call key binds lambdas built in an instance; held generics parked (2026-11-08)

Follows [the call key binding parameters handed a generic function](2026-11-08-call-key-generic-fn-params.md)
(#6792), which left 349 builds declined `open` and 685 with no key.

## What landed

- **Lambdas built inside an instance.** For a lambda, mono's walk top is the instance it builds
  through, which is the pin-demanded instance (`33|?via.0=fn(fn(i32)=>i32, i32)=>i32`). The
  elaboration keyed the literal under the call key's own instance (`0|?via.0=Fn#9`).
  `elabLamKeyOf` reads the lambda's value key under the walk top, then under the instance that top
  refines (`elabKeyRefines`). Mono's lambda build hands that key to `elabCallKeyBinding`.
- **Shadow.** `elabInstVerdict` reads `refines` where the demanded instance is recorded as
  refining the key's instance. It used to read `differ-bind`.

## The `ckey` classes, before and after

Population: the 23,649 programs of `scripts/sweep.vl -- list`, `vl build` under `$VL_ID_SHADOW=1`,
`scripts/id-shadow/run.sh --rows`. Before is master+#6792, after is the landed tree. Both are at
their fixpoint. Counts are instance builds.

| class | before | after |
|---|---|---|
| keyed (`call` + `value` + `lam`) | 24,006 | **24,033** (27 `lam`, all `agree`) |
| declined, `open` / `hole` | 349 / 5 | 349 / 5 |
| no key, `spelled` / `lam` | 557 / 140 | 557 / **113** |
| `monoHoleBinding` binds at least one name | 640 | **613** |
| keyed, `differ-bind` | 65 | **7** (the rest read `refines`, below) |
| `monoBindSeededTyParams` (agree / differ) | 25 / 3 | 25 / 3 |
| instances minted | 25,217 | 25,217 |

## The keyed differ-bind rows, graded

Measured on a candidate that also keyed held generics (below). The verdict change is independent of
that half. **195 of 202 read `refines`.** The key spells a hole that is handed a generic as the
generic's value (`Fn#9`). Mono binds it at the generic's instance at the pin, and `elabDemand`
records that instance as refining the key's. Both name the same callee. Mono's binding is the one
that builds, and the key is right about identity, so a switch should take the refined instance.
**7 stay `differ-bind`**: D15537, `ckb_bound_wider`, `d15068_mix_first_literal`,
`d15172_listviafield`, and two `soundness/*-wider-*` cases. There the key binds at the checker's
wider rep row (D15537) and mono binds at the pin.

## Parked: generics held in a list or record (the 349 `open`)

Accepting a parameter type whose every open part sits beneath a function type (`[id]`, `{ f: id }`)
took `open` from 349 to 0 and `hole` from 5 to 1. Instances stayed 25,217, and the pre-merge sweep
was clean. On master `bdc20404`, though, it moves one emit refusal in
`tests/vl_emit_diag_position_test.ts` ("imported, a generic instance"). For `use<T>(ys: T[])` handed
`xs = [id]`, the keyed build reads `agree`, but the binding makes `use`'s own body refuse first
(`lib.vl:2`). Mono's differing binding let it refuse later, at `lib.vl:7`, where the test pins the
anchor. Requiring a closed pin did not change this. Both are emit refusals of one check-clean
program, so the open question is whether the test's anchor or the binding should give. That is a
decision for the program's owner.

## Still open

- **`lam`, 113 builds with no key.** For example `outerA(h, x) { h(x, (n) => n * 2) }`, where `h`
  holds the non-generic `two`. `elabValueKeys[lambda]` is empty: the elaboration never demands a
  lambda handed to a call through a held function value. That is a new elaboration capability, not
  a lookup.
- `spelled` (557), the `hole` builds and the 3 seeded differs: not attempted. The `monoHoleBinding`
  deletion waits on all of them.

## Proof (the landed tree, merged with master `bdc20404`)

- Fixpoint seed: 6,502,265 bytes, against master's 6,501,408 (+857).
- `scripts/sweep.vl` diff, master's fixpoint seed vs candidate: 23,656 same, 0 bytes-only,
  0 output movers, 0 `runs → not-runs`, 0 new traps.
- `vl_emit_diag_position_test`: 4 of 4 pass.
