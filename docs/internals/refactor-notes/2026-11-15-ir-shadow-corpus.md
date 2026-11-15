# The IR shadow over the distilled corpus (2026-11-15)

Lane I asked for this harness for I1b's claiming gate. It touches no IR file.

## What

- **`scripts/silent-sweep/distilled/ir-shadow.vl`** builds every cell of `cells/` and `named/`
  through `vl check --codegen` with `$VL_IR_SHADOW=1`, in chunks of 200, with `$JOBS` chunks at
  a time (default 4). It sums the `[ir]` rows.
  - It prints covered, verified and matched, and every mismatch and failure class.
  - **Exit 1:** any `fail` row, or any mismatch class above `ir-shadow-baseline.txt`. A class
    the baseline does not list counts as 0 there.
  - **Exit 2:** a chunk that trapped or timed out, or no rows at all.
  - A fall prints and passes. `--write-baseline` refuses while a verifier failure stands.
- **The host (`scripts/vl-host/src/main.rs`, 5 lines)** arms the shadow on the `vl check` pump
  and prints its rows at `CMD_VALIDATE`, beside the classifier census. Before this, only
  `vl build` printed them, and a per-cell `vl build` over 12,156 cells takes tens of minutes.
- It is not in `gate.sh`. I1b wires it in when claiming lands.

## Measured (fixpoint seed of master `69a976170`)

- **Wall time:** 14.6 s at `JOBS=4`.
- **Population:** 8,340 of 12,156 cells print rows. Every one of the other 3,816 either fails
  the check (3,279 are `loud check reject` in `baseline.jsonl`) or runs with no function (537,
  read by hand: four hold only a function type).
- **Rows:** 44,798 functions, 9,449 covered and verified, 9,443 matched.
- **The check path agrees with the build path:** over 413 cells (every 40th named cell, every
  10th derived cell), the sorted `[ir]` rows from `vl check --codegen` and from per-cell
  `vl build` are identical (1,061 rows each).
- **The baseline holds six mismatches in four classes:**

  | class | cells |
  |---|---|
  | `unlowered: rem over f32` | 2 (`d492_rem_f32_*_direct`) |
  | `unlowered: rem over f64` | 2 (`d492_rem_f64_*_direct`) |
  | `unlowered: locals layout` | 1 (`d572o_litbrand_typar`) |
  | `unlowered: list read wrapper slot` | 1 (`d591_arg_i32_i32__i32_l_r1`) |

  The last one is #8425's list read. `take(xs: i32[])` reads `xs[1]`, the builder admits it,
  and at lowering legacy's wrapper slot is not found. It is a follow-up for the list slice.
- **Controls:**
  - with no baseline, these six fail the run (exit 1, each class named `rose`);
  - with the baseline written, the run passes;
  - a baseline count raised by one prints `fell` and passes;
  - a count lowered below the measurement fails.
  - A verifier failure cannot be produced from the CLI (the corruptions are wasm exports), so
    that arm is read, not run.
