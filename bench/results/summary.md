# VL cross-runtime benchmark results (PRELIMINARY)

Generated 2026-08-02T14:30:10 by `bench/run.sh`. **PRELIMINARY** — other work may have been on the
machine during this sweep. Re-run `bench/run.sh` on an idle box for authoritative numbers.

| | |
|---|---|
| reps per configuration | 7 (median reported; min/max in results.json) |
| cpu pinning | `taskset -c 2-5` |
| rustc | rustc 1.96.0 (ac68faa20 2026-05-25) |
| deno | deno 2.9.0 (stable, release, x86_64-unknown-linux-gnu) |
| python | Python 3.11.2 |
| vl repo commit | 1dd3d6a2 |
| VL execution | prebuilt `.wasm` (`vl run x.wasm`); compile time is a separate column |
| ratios | computed on **startup-subtracted** times |

## Startup baseline (empty program)

| runtime | median ms |
|---|---|
| rust | 2.22 |
| vl | 4.90 |
| vl-run-src | 12.19 |
| deno | 12.20 |
| python | 9.51 |

`vl-run-src` is compile+run of an empty program in one process; `vl` is a prebuilt module.

## Noise floor

| runtime | bench | first median ms | repeat median ms | spread |
|---|---|---|---|---|
| vl | arith/i32-accum | 324.88 | 347.57 | 7.0% |
| rust | arith/i32-accum | 58.31 | 57.70 | 1.0% |
| deno | arith/i32-accum | 355.89 | 342.67 | 3.7% |

Within-configuration (max-min)/median across every measured run: p50 6.6%, p90 150.9%, p99 715.0%.

Outliers (a single sample >1.5x its own configuration's median): **49 of 1771 samples**, affecting 49 of 253 configurations. Almost every affected configuration has exactly ONE such sample, i.e. this is isolated interference from unrelated work on the box rather than broad noise — which is why the median of 7 absorbs it and why the `vl/deno(min)` column below should agree with `vl/deno`. Where they disagree, believe neither and re-run.

**Noise floor taken as 7.0%.** Differences smaller than this are not differences.

## Results

Times are medians in **ms**, startup-subtracted. `py(norm)` is Python's reduced-N time
multiplied by that benchmark's scale factor; `-` means the benchmark's own audit says no
scalar factor is valid. `vl/rust` is HEADROOM, not a loss.

| benchmark | rust | vl | vl -O3 | deno | py(raw) | py(norm) | vl/rust | vl/deno | vl/deno(min) | py/vl | verdict | flags |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|
| strings/str-eq | 37.8 | 1894.3 | 1869.8 | 135.1 | 81.8 | 654.5 | 50.09 | 14.02 | 14.11 | 0.3 | PRIORITY-LOSS | RUST-GAP-50x, PYTHON-RED-ALERT-0.3x, STARTUP>10%(python) |
| algorithms/lambda-hot | 113.1 | 2155.7 | 182.5 | 194.7 | 881.3 | 22031.6 | 19.05 | 11.07 | 11.00 | 10.2 | PRIORITY-LOSS | RUST-GAP-19x, IDIOM-GAP-8.98x(opt), O3-GAP-11.81x |
| strings/substr-search | 37.7 | 1063.5 | 1109.4 | 125.3 | 133.4 | 133.4 | 28.22 | 8.49 | 8.48 | 0.1 | PRIORITY-LOSS | RUST-GAP-28x, PYTHON-RED-ALERT-0.1x |
| algorithms/dispatch-table | 140.6 | 1179.3 | 1216.1 | 353.4 | 1143.6 | 11436.1 | 8.39 | 3.34 | 3.36 | 9.7 | PRIORITY-LOSS |  |
| arrays/matmul | 106.9 | 1585.0 | 1567.7 | 582.8 | 1766.3 | 31440.4 | 14.83 | 2.72 | 2.80 | 19.8 | PRIORITY-LOSS | RUST-GAP-15x |
| collections/set-ops | 415.8 | 870.5 | 800.9 | 347.1 | 163.7 | 655.0 | 2.09 | 2.51 | 2.46 | 0.8 | PRIORITY-LOSS | PYTHON-RED-ALERT-0.8x |
| arrays/struct-soa | 104.1 | 1250.4 | 1130.1 | 500.8 | 2011.8 | 16764.5 | 12.01 | 2.50 | 2.50 | 13.4 | PRIORITY-LOSS | RUST-GAP-12x |
| recursion/mutual | 556.2 | 1560.3 | 1269.9 | 659.0 | 1290.3 | 64513.1 | 2.81 | 2.37 | 2.38 | 41.3 | PRIORITY-LOSS | O3-GAP-1.23x |
| arrays/reverse-inplace | 261.8 | 2099.1 | 1810.9 | 958.2 | 1716.9 | 27469.8 | 8.02 | 2.19 | 2.27 | 13.1 | PRIORITY-LOSS | O3-GAP-1.16x |
| collections/map-string | 503.6 | 1255.8 | 1244.0 | 628.9 | 378.8 | 1515.4 | 2.49 | 2.00 | 2.00 | 1.2 | LOSS | PYTHON-RED-ALERT-1.2x |
| arrays/sort-heap | 316.4 | 936.2 | 1020.9 | 563.1 | 3806.5 | 15226.0 | 2.96 | 1.66 | 1.67 | 16.3 | LOSS |  |
| collections/word-freq | 228.2 | 1202.4 | 1165.4 | 756.3 | 214.1 | 2140.8 | 5.27 | 1.59 | 1.61 | 1.8 | LOSS | PYTHON-RED-ALERT-1.8x |
| algorithms/spectralnorm | 1058.7 | 2487.8 | 2273.0 | 1629.8 | 904.3 | 90425.6 | 2.35 | 1.53 | 1.52 | 36.3 | LOSS |  |
| strings/int-format | 399.6 | 845.1 | 805.9 | 661.8 | 186.1 | 5582.0 | 2.12 | 1.28 | 1.28 | 6.6 | LOSS |  |
| collections/map-i32 | 367.9 | 1067.1 | 990.7 | 854.5 | 362.4 | 1449.7 | 2.90 | 1.25 | 1.25 | 1.4 | PAR | PYTHON-RED-ALERT-1.4x |
| algorithms/nbody | 1380.2 | 2962.1 | 3232.9 | 2451.6 | 1150.6 | 115057.1 | 2.15 | 1.21 | 1.21 | 38.8 | PAR |  |
| recursion/flatcall | 976.9 | 1428.3 | 1419.2 | 1197.5 | 786.7 | 78665.9 | 1.46 | 1.19 | 1.19 | 55.1 | PAR |  |
| recursion/flatcall-inlined | 970.1 | 1418.2 | 1431.8 | 1195.0 | 618.3 | 61828.6 | 1.46 | 1.19 | 1.19 | 43.6 | PAR |  |
| collections/struct-field | 443.3 | 997.0 | 343.8 | 890.8 | 521.4 | 104279.8 | 2.25 | 1.12 | 1.14 | 104.6 | PAR | O3-GAP-2.90x |
| algorithms/mandelbrot | 2658.4 | 3175.3 | 2860.0 | 2902.4 | 1256.6 | 80421.2 | 1.19 | 1.09 | 1.08 | 25.3 | PAR |  |
| arith/floatops | 482.8 | 381.7 | 385.2 | 350.7 | 362.9 | 36293.3 | 0.79 | 1.09 | 1.10 | 95.1 | PAR |  |
| strings/slice-extract | 293.3 | 1296.1 | 1271.1 | 1191.1 | 588.1 | 17643.5 | 4.42 | 1.09 | 1.09 | 13.6 | PAR | IDIOM-GAP-1.31x(opt) |
| arith/bitops | 295.4 | 324.0 | 318.3 | 311.4 | 362.6 | 36262.9 | 1.10 | 1.04 | 1.04 | 111.9 | PAR |  |
| algorithms/map-filter-reduce | 121.3 | 923.0 | 513.0 | 912.5 | 675.1 | 6751.2 | 7.61 | 1.01 | 1.04 | 7.3 | PAR | O3-GAP-1.80x |
| arith/intdivmod | 238.9 | 483.6 | 476.3 | 479.3 | 90.8 | 9075.0 | 2.02 | 1.01 | 1.00 | 18.8 | PAR | IDIOM-GAP-2.03x(opt) |
| arith/f64-accum | 551.9 | 535.9 | 539.5 | 546.7 | 64.7 | 6466.7 | 0.97 | 0.98 | 0.99 | 12.1 | PAR | STARTUP>12%(python) |
| algorithms/binarytrees | 4029.4 | 4438.9 | 4443.2 | 4730.0 | 2683.4 | 42934.6 | 1.10 | 0.94 | 0.95 | 9.7 | PAR |  |
| arith/i32-accum | 56.1 | 320.0 | 289.5 | 343.7 | 204.3 | 20434.7 | 5.70 | 0.93 | 0.84 | 63.9 | PAR | IDIOM-GAP-2.05x(opt) |
| recursion/treewalk | 656.5 | 747.2 | 720.2 | 873.6 | 2267.9 | - | 1.14 | 0.86 | 0.91 | - | PAR | PY-UNNORMALISABLE |
| strings/char-scan | 262.4 | 1409.6 | 1248.1 | 1648.2 | 2231.8 | 22318.3 | 5.37 | 0.86 | 0.86 | 15.8 | PAR |  |
| arith/mixed-width | 172.3 | 195.4 | 474.3 | 257.9 | 176.6 | 17659.3 | 1.13 | 0.76 | 0.76 | 90.4 | WIN | O3-REGRESSION-2.43x |
| collections/struct-array-scan | 260.2 | 752.9 | 673.9 | 1013.1 | 564.9 | 11298.5 | 2.89 | 0.74 | 0.70 | 15.0 | WIN | IDIOM-GAP-1.37x(opt) |
| arrays/binsearch | 1066.3 | 1464.3 | 1802.1 | 1999.5 | 987.2 | 19743.3 | 1.37 | 0.73 | 0.73 | 13.5 | WIN | O3-REGRESSION-1.23x |
| recursion/tailcall | 118.3 | 1202.5 | 1202.2 | 1653.7 | 795.1 | - | 10.16 | 0.73 | 0.72 | - | WIN | RUST-GAP-10x, PY-UNNORMALISABLE, IDIOM-GAP-2.02x(opt) |
| arrays/fill-sum | 93.1 | 1037.0 | 930.9 | 1479.7 | 1639.7 | 16397.4 | 11.14 | 0.70 | 0.68 | 15.8 | WIN | RUST-GAP-11x |
| arith/convert | 304.9 | 277.2 | 279.6 | 423.1 | 230.3 | 23028.6 | 0.91 | 0.66 | 0.66 | 83.1 | WIN |  |
| strings/token-count | 331.9 | 1409.3 | 1489.7 | 2304.0 | 1176.2 | 23523.2 | 4.25 | 0.61 | 0.61 | 16.7 | WIN |  |
| recursion/fib | 541.2 | 870.0 | 867.4 | 1449.6 | 633.5 | 18389.9 | 1.61 | 0.60 | 0.60 | 21.1 | WIN |  |
| arrays/struct-aos | 330.0 | 1583.3 | 1557.4 | 2650.6 | 2430.3 | 20251.4 | 4.80 | 0.60 | 0.56 | 12.8 | WIN |  |
| collections/struct-alloc | 671.0 | 282.1 | 284.3 | 475.5 | 307.6 | 6905.3 | 0.42 | 0.59 | 0.59 | 24.5 | WIN |  |
| arith/bitcount | 224.8 | 172.8 | 181.9 | 321.8 | 123.6 | 12360.5 | 0.77 | 0.54 | 0.54 | 71.5 | WIN |  |
| arith/i64-accum | 112.1 | 295.9 | 300.7 | 592.1 | 206.1 | 20609.7 | 2.64 | 0.50 | 0.44 | 69.6 | WIN |  |
| recursion/deeprec | 640.8 | 973.2 | 988.2 | 2242.5 | 773.7 | - | 1.52 | 0.43 | 0.44 | - | WIN | PY-UNNORMALISABLE |
| recursion/ackermann | 265.7 | 523.9 | 520.4 | 1350.1 | 1550.0 | 39680.8 | 1.97 | 0.39 | 0.39 | 75.7 | WIN |  |
| arrays/push-growth | 102.4 | 522.1 | 459.4 | 1382.7 | 1429.2 | 7145.8 | 5.10 | 0.38 | 0.40 | 13.7 | WIN |  |

## Extra VL spellings (opt.vl / toplevel.vl / globals.vl / ...)

A gap between `main.vl` and a hand-spelled variant is a **defect to file**, never a tip.

| benchmark | vl (idiomatic) | variant | variant ms | idiomatic/variant |
|---|--:|---|--:|--:|
| algorithms/lambda-hot | 2155.7 | opt | 240.1 | 8.98 |
| arith/f64-accum | 535.9 | main_global | 830.4 | 0.65 |
| arith/i32-accum | 320.0 | opt | 155.8 | 2.05 |
| arith/i64-accum | 295.9 | main_global | 416.3 | 0.71 |
| arith/intdivmod | 483.6 | opt | 238.3 | 2.03 |
| arrays/fill-sum | 1037.0 | toplevel | 1038.6 | 1.00 |
| arrays/matmul | 1585.0 | opt | 1595.3 | 0.99 |
| arrays/reverse-inplace | 2099.1 | toplevel | 2071.0 | 1.01 |
| arrays/sort-heap | 936.2 | opt | 896.6 | 1.04 |
| collections/map-i32 | 1067.1 | toplevel | 1123.6 | 0.95 |
| collections/struct-array-scan | 752.9 | opt | 551.0 | 1.37 |
| collections/struct-field | 997.0 | toplevel | 992.0 | 1.01 |
| collections/word-freq | 1202.4 | opt | 1250.1 | 0.96 |
| recursion/deeprec | 973.2 | opt | 1017.5 | 0.96 |
| recursion/flatcall | 1428.3 | opt | 1428.2 | 1.00 |
| recursion/tailcall | 1202.5 | opt | 594.5 | 2.02 |
| strings/char-scan | 1409.6 | globals | 1453.9 | 0.97 |
| strings/int-format | 845.1 | stdfmt | 4477.5 | 0.19 |
| strings/slice-extract | 1296.1 | opt | 988.5 | 1.31 |
| strings/token-count | 1409.3 | globals | 1336.6 | 1.05 |

## Compile time (never inside an execution number)

| benchmark | vl build | vl build -O3 | rustc -O |
|---|--:|--:|--:|
| algorithms/binarytrees | 14.4 | 354.2 | 96.0 |
| algorithms/dispatch-table | 8.8 | 314.9 | 83.6 |
| algorithms/lambda-hot | 9.3 | 311.6 | 85.1 |
| algorithms/mandelbrot | 9.0 | 323.7 | 105.6 |
| algorithms/map-filter-reduce | 10.5 | 358.0 | 120.8 |
| algorithms/nbody | 12.0 | 381.5 | 127.6 |
| algorithms/spectralnorm | 10.0 | 375.3 | 125.2 |
| arith/bitcount | 9.8 | 227.1 | 60.8 |
| arith/bitops | 9.3 | 294.3 | 60.4 |
| arith/convert | 8.9 | 228.9 | 54.1 |
| arith/f64-accum | 8.2 | 258.5 | 51.0 |
| arith/floatops | 8.8 | 228.5 | 54.4 |
| arith/i32-accum | 8.4 | 236.6 | 52.3 |
| arith/i64-accum | 9.2 | 240.0 | 50.1 |
| arith/intdivmod | 9.3 | 235.2 | 54.9 |
| arith/mixed-width | 8.5 | 235.8 | 55.3 |
| arrays/binsearch | 9.5 | 312.0 | 70.7 |
| arrays/fill-sum | 9.5 | 312.9 | 78.8 |
| arrays/matmul | 9.1 | 341.9 | 89.1 |
| arrays/push-growth | 8.8 | 305.6 | 69.8 |
| arrays/reverse-inplace | 9.2 | 323.1 | 86.7 |
| arrays/sort-heap | 8.9 | 360.7 | 86.2 |
| arrays/struct-aos | 9.3 | 294.6 | 67.8 |
| arrays/struct-soa | 8.5 | 321.2 | 75.2 |
| collections/map-i32 | 9.0 | 325.3 | 123.6 |
| collections/map-string | 8.5 | 340.7 | 138.9 |
| collections/set-ops | 9.1 | 359.8 | 159.5 |
| collections/struct-alloc | 12.5 | 291.5 | 60.8 |
| collections/struct-array-scan | 9.0 | 290.2 | 69.4 |
| collections/struct-field | 8.9 | 289.7 | 53.4 |
| collections/word-freq | 9.2 | 368.6 | 159.3 |
| recursion/ackermann | 8.5 | 228.7 | 53.3 |
| recursion/deeprec | 8.4 | 229.2 | 57.5 |
| recursion/fib | 8.1 | 236.7 | 48.3 |
| recursion/flatcall | 9.2 | 238.1 | 54.1 |
| recursion/flatcall-inlined | 8.2 | 231.5 | 52.0 |
| recursion/mutual | 8.2 | 251.0 | 55.3 |
| recursion/tailcall | 8.1 | 238.6 | 52.6 |
| recursion/treewalk | 12.7 | 274.7 | 60.3 |
| strings/char-scan | 9.4 | 309.1 | 76.3 |
| strings/int-format | 9.2 | 306.4 | 77.6 |
| strings/slice-extract | 8.6 | 320.3 | 78.6 |
| strings/str-eq | 9.7 | 352.5 | 108.5 |
| strings/substr-search | 9.0 | 351.6 | 128.5 |
| strings/token-count | 9.1 | 341.0 | 78.4 |

## Failures

None — every benchmark built and ran in every language.

## VOID benchmarks (excluded)

- **strings/concat-build** — ADVERSARIAL AUDIT: cross-language ratio is unusable. The Rust column measures NOTHING — min-of-7 pinned wall time is 4.6ms, BELOW the 6.8ms empty-Rust-program startup baseline. deno reads 56.0ms (34% launcher) and python3 71.5ms (17% launcher); VL reads 1730ms. No REPS value fixes this: work is linear in REPS for Rust/JS/Py but VL is O(n^2) in N and linear in REPS, so REPS x20 puts Rust at ~92ms (still under the 200ms floor) and VL at ~34s. The VL-INTERNAL finding survives and should still be reported: doubling N multiplies VL by ~3.5x (O(n^2)) while Rust/JS/Python stay ~1.6-1.9x (O(n)) — VL's

