# Gate: `ir claims` runs its heavy witnesses alone, and is budgeted at its peak (2026-11-24, lane IR-P1)

The `ir claims` row was SIGKILLed (rc 137) on 15 GB boxes at `JOBS=4` (coordinator report). Two
things combined:

- **The budget.** `gate.sh`'s `row_mem` held no `ir claims` entry, so the scheduler budgeted the
  row at its 200 MiB default. Its real peak is about 4.5 GB.
- **The fan-out.** Each chunk is one `vl check --codegen` process over up to 200 files, so its peak
  is the largest file's, not the sum. Two filed witnesses, D3417 and D3465 (big-list stress), peak
  at about 4.2 GB each. They sat 30 lines apart in the staged list, so an inventory row added ahead
  of them could move a chunk boundary between them, and then two 4.2 GB chunks ran at once.

The fix:

- **`heavy-programs.txt`.** A committed list of `<row id or path>\t<peak MiB>\t<why>`.
  `ir-shadow.vl`'s `measure` takes the programs it names out of the fan-out and builds them after it,
  in one process. `tests/vl_heavy_programs_test.ts` reds on an entry that names no filed `runs` row
  and no file.
- **`row_mem`.** `ir claims` is budgeted at 4,600 MiB, beside the two `ir-parity` rows.

## Readings (master c52f546e, peaks of the whole process tree sampled every 0.2 s)

| reading | result |
| --- | --- |
| D3417 alone, D3465 alone, both in one process | 4,162, 4,161, 4,175 MiB |
| the 26 witness chunks, each alone | 1 heavy (4,176 MiB, both witnesses); 25 at 116 to 594 MiB, mean 301 |
| the row at `JOBS=4`, before | 4,519 MiB; 122.3 user + 17.8 sys CPU-s, 66 s wall |
| the row at `JOBS=4`, after | 4,568 MiB; 126.8 user + 18.9 sys CPU-s, 77 s wall |
| the `--claims` report, before and after | byte-identical |

## Failing control

A `--files` list of 600 witnesses that places D3417 at position 0 and D3465 at position 200, so the
two land in different chunks of the fan-out:

| harness | peak |
| --- | --- |
| before (no list) | 8,580 MiB, the two heavy chunks at once |
| after | 4,393 MiB |

A census for new heavy programs is the chunk-peak measurement above. Rerun it when a filed
witness grows, and add what it finds to the list.

## The `row_mem` audit (coordinator)

The full gate ran one row at a time (`GATE_MAX_PAR=1`) with the whole tree's RSS sampled every 0.5
s, so each reading is the row alone. Rows under 100 MiB are omitted. Every row the reading put
above its estimate is raised to the reading rounded up. None is lowered: a generous estimate
costs wall time, a short one an OOM kill.

| row | peak MiB | `row_mem` before | after |
| --- | --- | --- | --- |
| `deno task test` | ≤ 4,205 (the reading includes the gate's seed build; the full `deno task test` alone is 4,893) | 1,400 | **4,300** |
| `ci-native` | 4,621 | 4,000 | **4,800** |
| `self-compile pair` | 4,190 | 4,700 | 4,700 |
| `lint-self + fmt` | 3,455 | 2,400 | **3,600** |
| `late demands` | 439 | 500 | 500 |
| `self ir misses` | 4,268 | 1,600 | **4,400** |
| `phase state` | 423 | 200 (the default) | **500** |
| `plumb-shape cost` | 520 | 1,400 | 1,400 |
| `kind-ladder sets` | 403 | 800 | 800 |
| `dead-export budget` | 392 | 600 | 600 |
| `render-parse budget` | 135 | 600 | 600 |
| `scaling shape` | 927 | 900 | **1,000** |
| `rep-fuzz` | 1,010 | 1,600 | 1,600 |
| `filed witnesses` | 9,330 | 8,000 | **9,600** |
| `inventory refs` | 356 | 400 | 400 |
| `capability probes` | 376 | 800 | 800 |
| `conflict markers`, `splice scan`, `seed size`, `no-python` | 105 to 181 | 200 (the default) | 200 |
| `lsp suites (ci list)` | 988 | 1,100 | 1,100 |
| `distilled corpus` | 4,693 | 1,700 | **4,800** |
| `ir shadow` | 1,424 | 1,300 | **1,600** |
| `ir shadow cases` | 1,520 | 1,300 | **1,600** |
| `ir claims` | 4,536 | 200 (the default) | **4,600** |
| `ir claim refusals`, `ir claim cross` | 4,340, 4,346 | 4,400 | 4,600 |
