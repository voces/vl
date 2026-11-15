# A mono-valued map get is one call of a per-shape helper, 2026-11-15

Lane P, binary size. Item 2 of the seed-size profile in `2026-11-15-size-push-grow-outline.md`,
step 2. Step 1 (`2026-11-15-size-map-entry-probe.md`) made a get probe for the entry; this step
moves the value read into the probe's helper too.

## The pattern

The compiler reads its maps almost always as `m[k] ?? -1` or `?? 0` over an i32-valued map. Each
such site, after the probe call, kept `local.set entry; local.get entry; if (result i32)` around
`vals.backing[entry - 1]`, with `i32.const <default>` as the else. That is about 27 bytes, plus
the index `struct.get` that feeds the probe. The seed held about 1,500 of these.

## The change

`__map_get_<row>__(m, key) -> i32` is one tail helper per (map shape, miss value), minted on first
ask (`helpMapGetFn`, `HELP_MAP_GET`). Its body loads `m`'s index (and, for a string key, the
key's hash, hashes, live flags and keys backing) into locals, runs the probe loop, and reads the
entry's value or answers the row's miss value. The probe loops are factored out of
`__map_probe__` and `__map_probe_i32__` (`emitMapProbeStrLoop`, `emitMapProbeI32Loop`) and take
their local indices, so the two helpers and the get helper share one loop each. A get is still
one call: the site pushes the map and the key and calls the helper.

The helper applies to two forms:

- **`m[k]`**: a bare read of a mono-valued map (i32 or string key), whose miss value is
  `mapGetMissOf` (the type's niche sentinel, else 0).
- **`m[k] ?? d`** over the same maps, when the map has no null sentinel and `d` lowers to exactly
  one `i32.const`. That constant is the miss value, and `d` stays a literal, so evaluating it
  eagerly changes nothing.

Every other form keeps the site's probe and read. That covers a valued map (an mv slot), an i64
key, a widening `??`, a null-sentinel value map and any other default. `-O` keeps all of them
inline, because binaryen scalarises a map it can see. This is a new `gOptimized` reader,
registered in `vl_opt_after_link_test.ts` and in s5-per-module-artifacts.md.

Routing only the bare `m[k]` form through the helper made the seed 1,150 bytes larger. Those
reads are rare, and the helper bodies cost more than they saved. The `??` form is where the
sites are.

## Measurements

Base is master `548c16d6b`'s fixpoint. The candidate is its own fixpoint (r2 == r3), and
`native-fixpoint.sh --pair` holds.

| reading | master | candidate |
| --- | ---: | ---: |
| seed | 6,393,958 B | 6,334,524 B (**−0.93%**) |
| L2 fuel | 88,934,697,716 | 88,825,222,598 (−0.12%) |
| L2 CPU, interleaved median of 16 | 29.53 s | 29.59 s |
| L2 CPU, paired ratio over 16 rounds | | median 1.015, 95% interval 0.989–1.039 (10 of 16 above 1) |
| L2 peak RSS | 4,158 MB | 4,155 MB |

## Behaviour

Sweep of master against the candidate: 24,791 same, 424 bytes-only movers, 0 output movers, 0
runs lost, 0 new compiler traps. `regress.vl`: no runs lost. No test pin moved.
