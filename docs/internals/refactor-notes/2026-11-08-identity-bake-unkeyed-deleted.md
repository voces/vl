# Identity typing (A): the last two declines keyed, mono's unkeyed bake deleted (2026-11-08)

Follows [the declined decisions](2026-11-07-identity-declined-decisions.md) (#6745: 1,575 keyed,
2 `nobase`). This PR keys those 2 and deletes the derivation in `monoBakeCallback` that only
they still used.

## Measured first: where mono's own derivation still decides

Population: the 23,615 programs of `scripts/sweep.vl -- list`, `$VL_ID_SHADOW=1`, on #6745 merged
with master. Each of the four derivations had a temporary row, deleted before the commit.

| derivation | at a keyed decision | at a declined decision | at a non-callback instance |
|---|---|---|---|
| `monoBakeCallback`'s callee (rewritten calls) | 1,251 (the key's) | **2** (mono's) | none |
| (S1) registry hit, concrete callee | 8 (the map's) | 0 | none |
| (S1) registry hit, generic instance | 68 (the map's) | 0 | 8,527 (`@name` key) |
| `monoHoleBinding` | 0 fallbacks | **2** | 11,887 |
| `monoBindSeededTyParams`' type | 8 (the base's) | 0 | 20 |

There were 1,588 decisions in all: 1,586 keyed and 2 `nobase`. So mono's own derivation decided at
the 2 `nobase` decisions and nowhere else, as expected. The hole and seed bindings and the `@name`
registry key are NOT dead. They are the only answer for every instance that is not
callback-specialized, and the elaboration keys no such decision. Deleting them is a different
question: the call key would have to bind those instances.

## The two `nobase`, keyed

- **`app2` in `closures/generic-returned-fn-param.vl`.** Mono's clone of `take` resolves to key 0,
  which binds `g` to `((i32) => i32, i32) => i32`. The elaboration keyed the call `h(...)` only under
  key 5, which binds `g` to the generic `<T>((T) => T, T) => T`. That is the same declaration with
  the same parent. `elabCallInstUnderScheme` now answers such a call. The other key must bind the
  generic function value that `from` binds an instance of (`elabBindsSchemeOf`), it must be the only
  such key, and the answer must bind no type variable.
- **The UFCS overload-set call in `modules/generic-ufcs-overload-set`.** `monoPinBinOps`' member
  arm re-mints `r.pick(xs, g)` as `pick$m…(r, xs, g)` and recorded no source. It now records one
  (`nodeSrcNote`), so `elabCallKeyedSrc` reaches the keyed member call.

After the fix both are keyed, and the grouping agrees (`specgroup` 1/1/1 and 7/7/7).

## Deleted

- `monoBakeCallback`'s unkeyed branch: the alias walk, the shadow guard and the by-name callee
  lookup. The two parameters only that branch read (`cbParamNames`, `fnDeclIx`) also go. With no key
  (`specK < 0`) nothing is baked, and every call keeps its `call_ref`.
- `monoBakeAliasParam`, `monoReadsOwnParam` and `monoFnBindsParamAt`, which only that branch
  reached.
- `monoSpecializeConcrete`: a declined decision is not specialized, and the registry hit is the S1
  map's slot alone. The `@name` match there was measured redundant at every keyed decision (#6736).

## Proof

- Fixpoint seeds on both sides: base #6745 merged with master `503af1ae`. Each rebuild is
  byte-identical.
- `scripts/sweep.vl` diff:
  - 23,615 same, 0 bytes-only movers, 0 output movers;
  - 0 `runs → not-runs`, 0 new traps.
- Both newly keyed decisions bake exactly what mono's derivation baked.
- Seed: 6,497,120 → 6,497,260 bytes (+140).
- The pin-helper budget falls from 931 to 928 (`emit_mono.vl`), with the baseline lowered in this PR.
