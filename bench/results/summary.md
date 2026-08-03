# VL cross-runtime benchmark results (PRELIMINARY)

Generated 2026-08-03T01:21:48 by `bench/run.sh`. **PRELIMINARY** — other work may have been on the
machine during this sweep. Re-run `bench/run.sh` on an idle box for authoritative numbers.

| | |
|---|---|
| reps per configuration | 5 (median reported; min/max in results.json) |
| cpu pinning | `taskset -c 2-5` |
| rustc | rustc 1.96.0 (ac68faa20 2026-05-25) |
| deno | deno 2.9.0 (stable, release, x86_64-unknown-linux-gnu) |
| python | Python 3.11.2 |
| vl repo commit | 1d3a8559 |
| VL execution | prebuilt `.wasm` (`vl run x.wasm`); compile time is a separate column |
| ratios | computed on **startup-subtracted** times |

## Startup baseline (empty program)

| runtime | median ms |
|---|---|
| rust | 2.65 |
| vl | 4.51 |
| vl-run-src | 10.05 |
| deno | 14.53 |
| python | 9.77 |

`vl-run-src` is compile+run of an empty program in one process; `vl` is a prebuilt module.

## Noise floor

| runtime | bench | first median ms | repeat median ms | spread |
|---|---|---|---|---|
| vl | arith/i32-accum | 345.60 | 342.55 | 0.9% |
| rust | arith/i32-accum | 65.92 | 61.79 | 6.3% |
| deno | arith/i32-accum | 368.07 | 364.67 | 0.9% |

Within-configuration (max-min)/median across every measured run: p50 5.7%, p90 33.7%, p99 105.3%.

Outliers (a single sample >1.5x its own configuration's median): **13 of 1270 samples**, affecting 13 of 254 configurations. Almost every affected configuration has exactly ONE such sample, i.e. this is isolated interference from unrelated work on the box rather than broad noise — which is why the median of 5 absorbs it and why the `vl/deno(min)` column below should agree with `vl/deno`. Where they disagree, believe neither and re-run.

**Noise floor taken as 6.3%.** Differences smaller than this are not differences.

## Results

Times are medians in **ms**, startup-subtracted. `py(norm)` is Python's reduced-N time
multiplied by that benchmark's scale factor; `-` means the benchmark's own audit says no
scalar factor is valid. `vl/rust` is HEADROOM, not a loss.

| benchmark | rust | vl | vl -O3 | deno | py(raw) | py(norm) | vl/rust | vl/deno | vl/deno(min) | py/vl | verdict | flags |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|
| strings/str-eq | 38.7 | 936.1 | 931.8 | 136.1 | 86.0 | 688.4 | 24.19 | 6.88 | 6.89 | 0.7 | PRIORITY-LOSS | RUST-GAP-24x, PYTHON-RED-ALERT-0.7x, STARTUP>10%(python) |
| strings/substr-search | 38.4 | 661.4 | 712.6 | 128.0 | 138.7 | 138.7 | 17.21 | 5.17 | 5.13 | 0.2 | PRIORITY-LOSS | RUST-GAP-17x, PYTHON-RED-ALERT-0.2x, STARTUP>10%(deno) |
| arrays/matmul | 115.2 | 1666.4 | 1692.6 | 595.7 | 1818.6 | 32371.3 | 14.47 | 2.80 | 2.68 | 19.4 | PRIORITY-LOSS | RUST-GAP-14x |
| algorithms/lambda-hot | 123.0 | 565.7 | 187.7 | 221.6 | 1069.6 | 26740.3 | 4.60 | 2.55 | 2.51 | 47.3 | PRIORITY-LOSS | IDIOM-GAP-2.03x(opt), O3-GAP-3.01x |
| collections/set-ops | 434.2 | 948.6 | 945.8 | 409.6 | 232.2 | 928.9 | 2.18 | 2.32 | 2.26 | 1.0 | PRIORITY-LOSS | PYTHON-RED-ALERT-1.0x |
| arrays/struct-soa | 110.1 | 1168.5 | 1209.7 | 519.8 | 2140.8 | 17839.3 | 10.61 | 2.25 | 2.29 | 15.3 | PRIORITY-LOSS | RUST-GAP-11x |
| collections/map-string | 774.8 | 1386.2 | 1273.6 | 684.2 | 381.5 | 1526.1 | 1.79 | 2.03 | 1.94 | 1.1 | PRIORITY-LOSS | PYTHON-RED-ALERT-1.1x |
| collections/word-freq | 225.4 | 1219.4 | 1215.8 | 716.0 | 205.0 | 2050.2 | 5.41 | 1.70 | 1.73 | 1.7 | LOSS | PYTHON-RED-ALERT-1.7x |
| arrays/sort-heap | 343.3 | 904.0 | 918.9 | 597.2 | 4261.0 | 17044.0 | 2.63 | 1.51 | 1.52 | 18.9 | LOSS |  |
| arrays/reverse-inplace | 237.5 | 1752.0 | 1856.2 | 1163.7 | 1770.5 | 28327.5 | 7.38 | 1.51 | 1.58 | 16.2 | LOSS |  |
| algorithms/spectralnorm | 1046.7 | 2614.6 | 2442.8 | 1765.5 | 976.5 | 97647.0 | 2.50 | 1.48 | 1.51 | 37.3 | LOSS |  |
| collections/map-i32 | 422.7 | 1262.7 | 1229.0 | 951.7 | 380.4 | 1521.5 | 2.99 | 1.33 | 1.35 | 1.2 | LOSS | PYTHON-RED-ALERT-1.2x |
| algorithms/nbody | 1479.9 | 3352.7 | 3532.5 | 2582.7 | 1202.7 | 120267.5 | 2.27 | 1.30 | 1.26 | 35.9 | LOSS |  |
| strings/int-format | 384.6 | 843.1 | 807.7 | 666.0 | 195.2 | 5857.4 | 2.19 | 1.27 | 1.26 | 6.9 | LOSS |  |
| recursion/mutual | 577.3 | 829.0 | 827.2 | 682.3 | 1334.6 | 66729.4 | 1.44 | 1.22 | 1.22 | 80.5 | PAR |  |
| recursion/flatcall-inlined | 1032.9 | 1484.7 | 1462.0 | 1232.3 | 615.0 | 61496.7 | 1.44 | 1.20 | 1.21 | 41.4 | PAR |  |
| recursion/flatcall | 1018.7 | 1486.7 | 1470.0 | 1237.0 | 905.4 | 90540.5 | 1.46 | 1.20 | 1.18 | 60.9 | PAR |  |
| collections/struct-field | 459.3 | 1051.9 | 359.9 | 899.0 | 560.5 | 112103.4 | 2.29 | 1.17 | 1.19 | 106.6 | PAR | O3-GAP-2.92x |
| arith/floatops | 515.0 | 422.6 | 424.6 | 379.5 | 403.9 | 40387.0 | 0.82 | 1.11 | 1.10 | 95.6 | PAR |  |
| strings/slice-extract | 305.4 | 1326.1 | 1316.3 | 1235.3 | 609.4 | 18282.7 | 4.34 | 1.07 | 1.08 | 13.8 | PAR | IDIOM-GAP-1.30x(opt) |
| algorithms/mandelbrot | 2871.0 | 3373.8 | 3069.1 | 3171.1 | 1510.1 | 96649.3 | 1.18 | 1.06 | 1.07 | 28.6 | PAR |  |
| arith/bitops | 299.4 | 334.8 | 319.4 | 330.1 | 384.1 | 38411.6 | 1.12 | 1.01 | 1.02 | 114.7 | PAR |  |
| arith/intdivmod | 250.9 | 510.5 | 501.2 | 508.5 | 96.6 | 9656.9 | 2.03 | 1.00 | 1.02 | 18.9 | PAR | IDIOM-GAP-2.03x(opt) |
| algorithms/dispatch-table | 151.5 | 421.9 | 290.5 | 421.7 | 1296.6 | 12966.0 | 2.79 | 1.00 | 1.01 | 30.7 | PAR | O3-GAP-1.45x |
| arith/f64-accum | 573.8 | 558.6 | 566.8 | 574.6 | 74.0 | 7397.6 | 0.97 | 0.97 | 0.98 | 13.2 | PAR | STARTUP>11%(python) |
| arith/i32-accum | 63.3 | 341.1 | 352.1 | 353.5 | 219.4 | 21936.1 | 5.39 | 0.96 | 0.96 | 64.3 | PAR | IDIOM-GAP-2.16x(opt) |
| strings/char-scan | 270.8 | 1526.1 | 1317.1 | 1663.7 | 2213.1 | 22131.1 | 5.64 | 0.92 | 0.89 | 14.5 | PAR | O3-GAP-1.16x |
| algorithms/binarytrees | 4318.7 | 4776.7 | 5355.0 | 5477.2 | 3707.6 | 59322.3 | 1.11 | 0.87 | 0.89 | 12.4 | PAR |  |
| arith/mixed-width | 185.0 | 223.1 | 515.0 | 278.9 | 188.4 | 18837.9 | 1.21 | 0.80 | 0.78 | 84.4 | PAR | O3-REGRESSION-2.31x |
| recursion/treewalk | 595.0 | 694.9 | 720.0 | 906.4 | 2421.4 | - | 1.17 | 0.77 | 0.72 | - | WIN | PY-UNNORMALISABLE |
| collections/struct-array-scan | 234.8 | 706.5 | 726.8 | 967.3 | 554.0 | 11080.2 | 3.01 | 0.73 | 0.68 | 15.7 | WIN | IDIOM-GAP-1.35x(opt) |
| arrays/binsearch | 1112.6 | 1655.7 | 2032.8 | 2371.4 | 1116.4 | 22327.0 | 1.49 | 0.70 | 0.69 | 13.5 | WIN | O3-REGRESSION-1.23x |
| algorithms/map-filter-reduce | 137.7 | 642.1 | 575.1 | 969.6 | 705.1 | 7050.7 | 4.66 | 0.66 | 0.68 | 11.0 | WIN |  |
| arrays/struct-aos | 500.5 | 1722.2 | 1766.5 | 2656.0 | 2580.8 | 21506.0 | 3.44 | 0.65 | 0.65 | 12.5 | WIN |  |
| arith/convert | 329.8 | 289.1 | 296.3 | 449.0 | 236.1 | 23607.9 | 0.88 | 0.64 | 0.65 | 81.7 | WIN |  |
| strings/token-count | 345.7 | 1517.9 | 1615.8 | 2455.7 | 1244.1 | 24882.9 | 4.39 | 0.62 | 0.61 | 16.4 | WIN |  |
| recursion/fib | 571.2 | 962.4 | 933.3 | 1578.7 | 660.2 | 19166.4 | 1.69 | 0.61 | 0.62 | 19.9 | WIN |  |
| arrays/fill-sum | 106.9 | 970.1 | 1024.6 | 1592.0 | 1799.7 | 17996.8 | 9.07 | 0.61 | 0.61 | 18.6 | WIN |  |
| collections/struct-alloc | 709.0 | 298.9 | 282.3 | 490.7 | 324.2 | 7278.4 | 0.42 | 0.61 | 0.59 | 24.4 | WIN |  |
| arith/i64-accum | 117.7 | 355.3 | 318.3 | 625.9 | 233.4 | 23337.6 | 3.02 | 0.57 | 0.54 | 65.7 | WIN | IDIOM-GAP-1.16x(main_global) |
| arith/bitcount | 236.2 | 177.5 | 185.3 | 320.1 | 119.8 | 11977.1 | 0.75 | 0.55 | 0.57 | 67.5 | WIN |  |
| arrays/push-growth | 115.2 | 589.6 | 494.2 | 1316.4 | 1441.4 | 7207.2 | 5.12 | 0.45 | 0.45 | 12.2 | WIN | O3-GAP-1.19x |
| recursion/deeprec | 688.4 | 1036.4 | 1049.7 | 2344.3 | 821.3 | - | 1.51 | 0.44 | 0.44 | - | WIN | PY-UNNORMALISABLE |
| recursion/ackermann | 270.3 | 498.4 | 510.1 | 1386.2 | 1602.7 | 41028.1 | 1.84 | 0.36 | 0.36 | 82.3 | WIN |  |
| recursion/tailcall | 122.9 | 621.1 | 620.4 | 1756.6 | 828.1 | - | 5.05 | 0.35 | 0.36 | - | WIN | PY-UNNORMALISABLE |

## Extra VL spellings (opt.vl / toplevel.vl / globals.vl / ...)

A gap between `main.vl` and a hand-spelled variant is a **defect to file**, never a tip.

| benchmark | vl (idiomatic) | variant | variant ms | idiomatic/variant |
|---|--:|---|--:|--:|
| algorithms/lambda-hot | 565.7 | opt | 278.4 | 2.03 |
| arith/f64-accum | 558.6 | main_global | 563.7 | 0.99 |
| arith/i32-accum | 341.1 | opt | 158.3 | 2.16 |
| arith/i64-accum | 355.3 | main_global | 307.6 | 1.16 |
| arith/intdivmod | 510.5 | opt | 252.1 | 2.03 |
| arrays/fill-sum | 970.1 | toplevel | 1024.4 | 0.95 |
| arrays/matmul | 1666.4 | opt | 1573.4 | 1.06 |
| arrays/reverse-inplace | 1752.0 | toplevel | 1782.2 | 0.98 |
| arrays/sort-heap | 904.0 | opt | 906.1 | 1.00 |
| collections/map-i32 | 1262.7 | toplevel | 1163.0 | 1.09 |
| collections/struct-array-scan | 706.5 | opt | 524.6 | 1.35 |
| collections/struct-field | 1051.9 | toplevel | 1019.5 | 1.03 |
| collections/word-freq | 1219.4 | opt | 1262.9 | 0.97 |
| recursion/deeprec | 1036.4 | opt | 1027.0 | 1.01 |
| recursion/flatcall | 1486.7 | opt | 1481.5 | 1.00 |
| recursion/tailcall | 621.1 | opt | 619.0 | 1.00 |
| strings/char-scan | 1526.1 | globals | 1757.6 | 0.87 |
| strings/int-format | 843.1 | stdfmt | 4561.7 | 0.18 |
| strings/slice-extract | 1326.1 | opt | 1020.9 | 1.30 |
| strings/str-eq | 936.1 | opt | 1260.4 | 0.74 |
| strings/token-count | 1517.9 | globals | 1442.6 | 1.05 |

## Compile time (never inside an execution number)

| benchmark | vl build | vl build -O3 | rustc -O |
|---|--:|--:|--:|
| algorithms/binarytrees | 14.0 | 364.1 | 103.9 |
| algorithms/dispatch-table | 10.0 | 337.4 | 89.8 |
| algorithms/lambda-hot | 10.0 | 365.5 | 107.9 |
| algorithms/mandelbrot | 9.1 | 406.5 | 134.0 |
| algorithms/map-filter-reduce | 17.5 | 456.3 | 145.9 |
| algorithms/nbody | 12.5 | 378.0 | 130.1 |
| algorithms/spectralnorm | 9.3 | 364.8 | 110.7 |
| arith/bitcount | 8.8 | 251.9 | 51.6 |
| arith/bitops | 8.2 | 248.2 | 50.6 |
| arith/convert | 8.6 | 255.0 | 60.6 |
| arith/f64-accum | 8.9 | 244.4 | 53.1 |
| arith/floatops | 9.6 | 275.2 | 53.7 |
| arith/i32-accum | 8.3 | 253.7 | 57.2 |
| arith/i64-accum | 9.0 | 269.1 | 54.2 |
| arith/intdivmod | 9.8 | 251.0 | 54.2 |
| arith/mixed-width | 9.4 | 250.1 | 54.7 |
| arrays/binsearch | 8.6 | 358.1 | 68.6 |
| arrays/fill-sum | 8.4 | 333.0 | 68.6 |
| arrays/matmul | 10.3 | 368.2 | 96.2 |
| arrays/push-growth | 9.4 | 338.9 | 75.2 |
| arrays/reverse-inplace | 8.5 | 343.1 | 75.9 |
| arrays/sort-heap | 9.2 | 383.4 | 88.5 |
| arrays/struct-aos | 9.2 | 321.3 | 76.0 |
| arrays/struct-soa | 8.6 | 339.3 | 80.3 |
| collections/map-i32 | 9.0 | 376.0 | 151.9 |
| collections/map-string | 8.4 | 479.4 | 144.4 |
| collections/set-ops | 8.2 | 431.6 | 155.2 |
| collections/struct-alloc | 12.7 | 281.1 | 71.6 |
| collections/struct-array-scan | 8.5 | 306.5 | 71.8 |
| collections/struct-field | 8.1 | 304.2 | 52.2 |
| collections/word-freq | 8.8 | 384.3 | 126.8 |
| recursion/ackermann | 7.6 | 255.4 | 51.4 |
| recursion/deeprec | 8.1 | 260.4 | 51.9 |
| recursion/fib | 9.2 | 246.4 | 53.5 |
| recursion/flatcall | 8.6 | 240.4 | 50.4 |
| recursion/flatcall-inlined | 8.4 | 220.0 | 51.5 |
| recursion/mutual | 9.4 | 244.4 | 57.1 |
| recursion/tailcall | 8.2 | 231.0 | 50.6 |
| recursion/treewalk | 12.8 | 272.1 | 58.0 |
| strings/char-scan | 8.5 | 359.3 | 74.1 |
| strings/int-format | 7.4 | 284.7 | 66.8 |
| strings/slice-extract | 8.4 | 330.4 | 76.4 |
| strings/str-eq | 8.9 | 374.9 | 110.7 |
| strings/substr-search | 8.0 | 355.9 | 121.9 |
| strings/token-count | 10.2 | 356.6 | 80.7 |

## Failures

None — every benchmark built and ran in every language.

## VOID benchmarks (excluded)

- **strings/concat-build** — ADVERSARIAL AUDIT: cross-language ratio is unusable. The Rust column measures NOTHING — min-of-7 pinned wall time is 4.6ms, BELOW the 6.8ms empty-Rust-program startup baseline. deno reads 56.0ms (34% launcher) and python3 71.5ms (17% launcher); VL reads 1730ms. No REPS value fixes this: work is linear in REPS for Rust/JS/Py but VL is O(n^2) in N and linear in REPS, so REPS x20 puts Rust at ~92ms (still under the 200ms floor) and VL at ~34s. The VL-INTERNAL finding survives and should still be reported: doubling N multiplies VL by ~3.5x (O(n^2)) while Rust/JS/Python stay ~1.6-1.9x (O(n)) — VL's

