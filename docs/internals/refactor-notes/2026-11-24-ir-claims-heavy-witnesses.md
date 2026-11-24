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
