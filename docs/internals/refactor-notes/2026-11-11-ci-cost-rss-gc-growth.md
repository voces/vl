# ci-cost: the plumb-shape main unit's peak RSS follows the seed's GC heap growth, not the fuel cache, 2026-11-11

On #7181, #7195 and #7216, `ci-cost (1)` read the main unit's peak RSS at about 426–443 MB,
against a 318 MB baseline with a +10% bar. Fuel was within 1% of the baseline. The working
hypothesis was a cold fuel sidecar: on a cache miss, the seed would be JIT-compiled inside the
measured process. The CI logs and a local reproduction refute that. The step comes from **when
the seed's copying GC heap doubles**. This PR changes no bar, baseline or host behaviour. It makes
the gate print the metered build's GC line beside each RSS reading (`$VL_GC_STATS=1`), so a red run
shows which heap state it hit.

## The cache state does not decide it

| Run (job) | Fuel cache | main fuel | main RSS | tail RSS | main − tail |
|---|---|---|---|---|---|
| #7195 (130772451231) | miss: `Cache not found for input keys: vl-fuel-…` | 9,029,998,249 | 442.7 MB | 323.8 MB | 118.9 MB |
| #7216 (130776959215, attempt 1) | hit: `Cache hit for: vl-fuel-…`; the warm step took about 50 ms | 9,029,998,249 | 426.2 MB | 307.1 MB | 119.1 MB |

- **A warm cache is red too.** The #7216 run is red with the cache warm. The miss adds about 17 MB;
  the ~119 MB gap between main and tail is there either way.
- **A cold sidecar reads the same locally.** Built by `warm-seed.sh --fuel --stash` and then
  measured, it read 318 / 318 MB, the same as a warm one.
- **A real JIT would read much higher.** JIT-compiling the seed inside the process peaks at about
  850 MB, not 440 MB.
- **The gate already warms before it measures.** `plumb-shape-cost.vl`'s control build warms the
  fuel engine first.

## The mechanism: `SeedGcHeadroom` and a live set at the line

The copying seed store starts at a 256 MiB heap (two 128 MiB semispaces). `SeedGcHeadroom`
(`scripts/vl-host/src/main.rs`) doubles the heap once a collection leaves more than
`SEED_GC_GROW_PERCENT` = 75% of a semispace (96 MiB) live. It checks on a 10 ms epoch tick, and only
the latest collection. On a fixpoint seed of master `3a4f92a6`, the main unit's metered build
reports `collections: 10, peak live after a collection: 103003 KiB` (100.6 MiB). That is just over
the line. The tail unit reports 81,425 KiB, well under it.

The same build, with only `$VL_COMPILE_GC_GROW` varied (4-core Xeon, `VL_ISA=x86-64-v3`, `VL_FUEL=1`):

| `VL_COMPILE_GC_GROW` | collections | peak live after a collection | peak RSS |
|---|---|---|---|
| off | 16 | 120,067 KiB | 327 MB |
| 99 | 16 | 120,067 KiB | 327 MB |
| 90 | 16 | 119,816 KiB | 327 MB |
| 80 | 12 | 106,860 KiB | 327 MB |
| 75 (default), 3 runs | 10 | 103,003 KiB | 327 MB |
| 70 | 7 | 100,275 KiB | 567 MB |
| 60 | 4 | 100,275 KiB | 587 MB |

Peak RSS depends on how early the heap doubles. At the default, this box doubles late and reads
327 MB. CI's 426–443 MB sits between the late-doubling and early-doubling states. Guest fuel is the
same with the policy on or off (9,065,885,178 both ways), so the fuel row cannot see this.

**Not reproduced locally.** On this box the default reads 327 MB every time, including with the
build slowed fourfold by three CPU hogs on its core. Which host property tips CI's runners is
open. The `gc` field this PR prints answers it on the next red run: fewer collections at the same
peak live means the heap grew earlier.

## Options (the owner's call; neither is taken here)

- **(a) Meter the RSS build with `VL_COMPILE_GC_GROW=off`.**
  - Gains: RSS then depends only on the program, and fuel is unchanged.
  - Costs: the heap would double only once the live set passes a whole semispace (128 MiB), not
    96 MiB, so the ratchet gets less sensitive. It would also measure a policy users don't run.
- **(b) Make the grow decision deterministic in the host.**
  - What: decide on each collection rather than on a 10 ms sample of the latest one.
  - Costs: this is a user-facing GC change. The main unit would then double every time (about
    560–590 MB by the table above), so it needs a re-baseline.
