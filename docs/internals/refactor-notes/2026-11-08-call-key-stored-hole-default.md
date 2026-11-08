# Step 2: a stored hole function has a key, and its one root instance answers every read (2026-11-08)

Follows [a hole function instanced once is keyed where its value is read](2026-11-08-call-key-sole-hole-instance.md)
(#6841), which left `monoHoleBinding` binding at 98 `spelled` builds and 12 keyless lambdas.

## What landed

- **A stored hole function that nothing calls has its default instance.** `elabStoredHoleDefaults`,
  in `elabRun`: a hole function whose value is read and that no instance reaches is enqueued at the
  root at each parameter hole `i32`, the instance mono already demands for it. `function mk<T>(x: T)
  { return [{ fs: [inc0], x: x }] }` built `inc0` with no key at all; it now builds at that key.
- **A sole root key answers every read, a clone's included.** The end-of-`elabRun` sole-instance
  table is kept (`elabSoleHoleKeys`), and `elabValueKeyAt` and `elabLamKeyOf` fall back to it. The
  #6841 notes reached only the nodes that existed when `elabRun` ended, and mono builds an instance
  body from a clone made after that, so a read of `inc0` inside `mk`'s instance found no note even
  where `inc0` had its one key.

## The `ckey` classes, before and after

Population: the 23,696 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh --rows`.
Before is master `0c9f9fce`, after is this change on it. Both are fixpoint seeds. Counts are
instance builds.

| class | before | after |
|---|---|---|
| keyed `value` agree | 8,930 | **8,995** |
| keyed `lam` agree | 50 | **51** |
| keyed `call` (agree / refines / differ-bind) | 15,657 / 183 / 6 | 15,657 / 183 / 6 |
| keyed `value` (refines / differ-bind) | 12 / 1 | 12 / 1 |
| `spelled`, `hole-mono` inside an instance | 39 | **0** |
| `spelled`, `hole-mono` root named / root lambda | 30 / 31 | **4** / 31 |
| `spelled`, `hole-none` (root named / root lambda / inside an instance) | 87 / 37 / 31 | 87 / 37 / 31 |
| `lam` no key (hole-none / hole-mono) | 78 / 12 | 78 / **11** |
| instances (summed `insts` rows) | 25,342 | 25,342, no program moved |

All 66 builds that left `hole-mono` are `agree`. None is `differ-bind`.

## What is left

`monoHoleBinding` binds something at 46 builds over 33 programs:

| builds | class | shape |
|---|---|---|
| 31 | `spelled` root lambda | a lambda with two or more keys: written into a generic's slot inside each instance (`fs[0] = (x) => x + x` in `w<T>`, D12212), or a returned lambda delivered at two signatures (D12234) |
| 11 | keyless lambda inside an instance | a lambda written into a `let` in a generic body and read per instance (D7281) |
| 4 | `spelled` root named | a hole function called through a record field or map read whose keys sit under the reading call's instance, not the root (D15331) |

Every one is a function with no single instance, so the read needs the instance it actually
receives. That is the flow item 2 of the lane names, without #6841's sole-key limit.

The 8-hop limit in `cwFnValueDeclOf` moved none of them: a 12-alias chain of a stored hole function
builds keyed on both seeds.

## Proof

- Fixpoint seed: 6,552,622 bytes against the base's 6,551,572 (+1,050, +0.016%).
- `scripts/sweep.vl` diff, base fixpoint vs candidate fixpoint: 23,696 same, 0 bytes-only, 0 output
  movers, 0 `runs → not-runs`, 0 new traps.
- `scripts/gate.sh` on the tree merged with master `d64abc49` (fixpoint 6,555,194 bytes): 23 of 23
  rows green. Seed size +2.5% of its +3% bar; export budget 0; pin-helper budget 927, unchanged.
