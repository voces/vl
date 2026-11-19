# IR: `m[k] ?? d` read inline (2026-11-19)

The self-compile's largest single blocker after `is guard` was `map read inline`: 404 functions
alone. The IR built `g[k] ?? d` only on legacy's `__map_get_<row>__` helper route
(`mapGetOrHelperRoute`). A probe that named the reason split the row:

| reason | functions alone |
|---|---|
| no helper shape (`mapGetHelperShape` 0: an mv-slot map, an i64 key, `-O`) | 208 |
| a `false` default | 120 |
| an identifier default | 27 |
| another default | 33 |

## One decision, shared bytes
- **The decision.** Legacy's `emitMapGetOr` now dispatches on `mapGetOrArmOf`, which names every
  arm it had: `helper`, `widen`, `mv`, `scalarBox`, `sentinel`, `atom` (an atom-valued map's
  member-literal default) and `i32`. Its order is legacy's own, so no byte moves; the self-build is
  identical with the refactor alone.
- **The plain arms' bytes.** The two plain arms write through heads and tails that legacy and the
  IR share, around the default:
  - the `i32` arm: `mapGetOrI32Head` and `mapGetOrI32Tail`;
  - the mv slot arm: `mapGetOrMvHead` and `mapGetOrMvTail`. Its plain test, `mapGetOrMvPlain`, is
    a value that is neither a union nor a nullable niche, and a default that is not nullable.
    Legacy branches on it too.
  - The probe after receiver and key is `mapPrepProbeTail`, which `emitMapPrep` also calls.
- **The IR.** `RMapGetOr.mgForm` is 0 for the helper, 1 for the plain `i32` read and 2 for the
  plain mv read; `mgDef` is the default. The builder takes a module global map read plainly, a key
  written as itself, and a default that computes nothing ahead of the read: a variable, an
  immediate, or one temp its use writes in place (`defaultSelfContained`). The default is written
  in the miss arm, as legacy writes it. The lowering re-asks the arm, and the verifier checks the
  default is at the read's rep.

## Measured on fixpoint seeds: master `58c69581c` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed, of 18,945 | 12,794 | 13,141 |
| self-compile `map read inline`, alone | 406 | 0 |
| distilled functions claimed (`--claims`, 0 fell back) | 31,513 | 31,526 |

- **`ir-identity.sh`:** plain and `--names`, 9,034 identical, 0 differ, self-compile identical.
  `--cases`: 7,512 identical, 0 differ.
- **Mode 3:** 19,079 cells and run cases byte-identical, and the self-compile identical.
- **Cost:** L2 self-compile fuel, same box against master's seed: 99,569,777,324 → 99,617,080,753
  (+0.05%).
- **Lines:** +234 / −54 in `compiler/`. A coverage step: 347 self-compile and 13 distilled functions.

## What is left
- `map read receiver` (29 alone, 27 beside `parameter rep map`): a local or parameter map. Legacy
  reads it the same way; the IR builds only module globals today.
- `map read default computes` (10): a default with more than one node.
