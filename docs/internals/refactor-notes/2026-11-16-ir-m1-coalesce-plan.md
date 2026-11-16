# IR M1: one front door for the `??` ladder, and a global map read with an i32 default, 2026-11-16

Lane IR-C. M1 is the `??` ladder's front door, by the coordinator's order after N2b-2c. On the
2c-1b seed, `operator ??` held 302 self-compile functions alone. A throwaway census naming the
arm each `??` takes put 311 of those (and 996 with other blockers) on the fused map read
`m[k] ?? d`; the fused pop `xs.pop() ?? d` (2b) held 1 alone. `CLAIMED` stays empty, and no
emitted byte moves.

## What landed

- **`coalArmOf` is the ladder's decision.**
  - `emitCoalesceGo` now dispatches on one `CoalArm`, in legacy's order: folds of a dead or
    re-associated operand, the map and list reads with a default fused into the read, then
    `niche` for the nullable-rep arms.
  - Six arms used to decide by building a node or emitting: the null-arm `if`, the retyped
    dead join, the hole's map read, the map read join, the scalar join and the map join. Each
    now has a predicate (`coalNullArmShaped`, `coalRetypedDeadJoinTy`, `coalHoleMapReadValTy`,
    `coalMapReadJoinWhen`, `coalMapRecvOf`, `coalMapJoinWhen`), and its builder runs only on
    its arm.
- **The fused map read's helper route is shared.**
  - `mapGetOrHelperRoute` is `emitMapGetOr`'s choice of `__map_get_<row>__` with the default
    folded into the helper's miss.
  - `mapGetHelperFnOf` mints the helper.
  - `mapKeyArmOf` is how a map op writes its key (`MapKeyArm`).
  - `mapRecvRefTail` and `mapRecvKeyTail` are the receiver's recovery and the op context's
    shape.
- **`RMapGetOr { mgSym, mgNonNull, mgKey, mgAt }`**, in a new `map` family, is built only on that
  route:
  - the receiver is a module global map, read plainly;
  - the key is written as itself;
  - the result is an i32.

  Its lowering mints the helper, reads the global, recovers it, writes the key, pins the
  context, then calls, in `emitMapGetCall`'s order. Every other arm is a named miss
  (`coalesce <arm>`, `map read inline`, `map key <arm>`, `map read receiver`).
- `CoalArm` and `MapKeyArm` are registered as closed sets in `compiler/lint.vl`, the `map`
  family is added to `IrFamily`, and `mgKey` to the field tables.

## Pins

Each is a shared witness, one covered function matching legacy:
- `ix[k] ?? -1` by an i32 key;
- `tys[s + "!"] ?? 0` by a built string key;
- `ix[(ix[k] ?? 0) + 1] ?? -1`, a key holding another such read, which moves the op context
  between the receiver and the call.

## Coverage

| reading | 2c-1b | this step | gained |
|---|---:|---:|---:|
| self-compile claimed in mode 3 | 5,557 | 5,726 | +169 |
| corpus covered = matched (12,294 cells) | 23,125 | CORPUSCOV | CORPUSGAIN |

On the self-compile the remaining `??` misses are `map read inline` (140 alone: a `false`, `[]`
or `""` default, read inline rather than through the helper), `map read receiver` (a local or
parameter map) and `coalesce popOr` (1 alone).

## Bars

| bar | reading |
|---|---|
| self-build | fixpoint; the armed self-build is byte-identical, with the 2 mismatches 2c-1b already reports |
| corpus identity against the 2c-1b seed, 12,294 cells | IDROW |
| mode 3 with `list` and `map` admitted (throwaway build) | self-compile 5,726 claimed and byte-identical, the same 2 fallbacks as before; corpus M3ROW |
| L2 self-compile fuel (`self-compile-time.sh`, each tree from its own fixpoint seed) | FUELROW |
| seed size, 2c-1b seed to this one | 6,517,996 to 6,522,903 (+4,907); SEEDPCT |
