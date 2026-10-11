# V8 sizes its inlining budget by the module's small-function share — an owner proposal (2026-10-11)

Lane PF, from diderven DV-1000 and DV-1001. This proposal asks the owner to revisit **"the binaryen
inline budget is a build flag, never a default"** (DECISIONS.md, P1.3 C3; open-rulings
"The binaryen inline budget"). That ruling weighed the flag's size cost against "a win only
some modules want". The evidence below changes the second half. Under V8, what binaryen
does not inline at `-O3` is often inlined by nobody.

## The new evidence

V8 inlines wasm calls itself (TurboFan/Turboshaft, from Liftoff call counts). It scales the
budget for that by the share of **small** functions in the module, with a body under about
50 bytes. The heuristic is that a module with few small functions was already inlined by
its toolchain. The scale was measured with `node --trace-wasm-inlining` (node 24.11.1) on
DV-1001's `-O3` module, by appending trivial functions:

| small share | budget for a 950-node caller | relax's 12 calls inlined |
| --- | --- | --- |
| 25% (as built) | min(1900, 1045) | 0 |
| 40% (one pad) | min(3610, 4480) | 12 |
| ≥ 50% (two or more pads) | min(4750, 7000) | 12 |

A pad stops counting as small at about 46 bytes of body. VL's **default** output carries
empty init stubs and wrappers, so a small program is 56–58% small and gets the generous
budget. `-O3` removes them, so the share falls to 25%. Binaryen's own `-O3` inliner stops at
size 20 (`--flexible-inline-max-function-size`), so a 40-node helper such as DV-1000's
`rockAt` is left to V8, and V8 has just been told not to bother. That is the whole of
DV-1001 ("`-O3` is slower") and the `-O3` half of DV-1000. No binaryen pass is at fault.

**The real game is already in the low-budget mode at every rung.** diderven's `game.wasm` is
25.1% small at default, 15.3% at `-O` and 17.5% at `-O3`. The standalone repros at default
are the exception, not the game.

## Measurements

Node 24.11.1, box load 30–90 on 24 cores. Every number comes from one process that runs all
variants round-robin; the figure is the minimum over the rounds. A range is three repeats.
Single-run medians on this box swing about 2x, which is why minima are quoted.

**Kernels** (µs per call). The `-O3` variants are built by `vl build -O3` with the flag
injected through a `VL_WASM_OPT` wrapper:

| kernel | JS | default | `-O3` | `-O3` fi30 | `-O3` fi40 | `-O3` fi60 | `-O3` fi120 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DV-1000 corner scan | 36–39 | 158–166 | 215–229 | 209–226 | **135–151** | — | — |
| DV-1001 chamfer | 1643–2055 | 1246–1520 | 1262–1371 | — | = `-O3` | 1199–1491 | **905–1112** |

DV-1000's `rockAt` is inlined by binaryen from size 40. DV-1001's `relax` needs 120.

**diderven `game.wasm`** (ms per call, min). LEVEL is `debugDepth` plus one frame; FRAME is
a steady 1920x1080 frame with 8 torches and 150 actors; TICK was noise on every variant and is
omitted. The state fingerprint after each run agrees across all variants:

| build | bytes | build s | FRAME | LEVEL |
| --- | --- | --- | --- | --- |
| default | 360,211 | 4 | 0.160–0.200 | 8.0–11.1 |
| default + `wasm-opt -O1` | 287,894 | 4 + 5 | 0.118–0.123 | 7.9–10.6 |
| default + inlining only (size 16) | 315,242 | 4 + 10 | 0.132–0.151 | 9.0–9.8 |
| `-O` | 266,529 | 26 | 0.114–0.135 | 7.1–10.2 |
| `-O`, always-inline 32 | 282,323 | 28 | 0.098–0.119 | 7.2–8.1 |
| `-O3` | 261,072 | 32 | 0.099–0.123 | 7.3–8.8 |
| `-O3` fi30 | 264,450 | 38 | — | — |
| `-O3` fi40 | 268,678 | 42 | 0.105–0.113 | 6.9–8.3 |
| `-O3` fi60 | 273,843 | 33 | 0.097–0.113 | 6.5–7.7 |

The game's hot paths are cached per level (`src/view_maps.vl`), so its steady frame is 0.1 ms
and a helper-inlining change moves it within noise. The one large effect is **default → any
optimizing rung, about −30% per frame**. diderven ships `bun run build`, which is the
default rung.

**The compiler at `-O3`** (size, `wasm-opt` user CPU at load 30–60):

| | bytes | `wasm-opt` CPU |
| --- | --- | --- |
| `-O3` | 3,637,750 | 331 s |
| `-O3` fi30 | 3,734,130 (+2.6%) | 341 s |
| `-O3` fi40 | 3,843,529 (+5.7%) | 322 s |
| `-O3` fi60 | 4,258,861 (+17.1%) | 363 s |
| `-O` | 3,856,946 | 227 s |
| `-O`, always-inline 32 | 4,193,683 (+8.7%) | 241 s |

**`bench/`** is a weak population for this question. At fi40, only 6 of the 47 programs build
a different `-O3` module, because most are a single kernel function. None of the 6 moved
outside the noise: 3 rounds, binarytrees 7.9–9.0 s on every variant, set-ops 1.1–1.6 s
scattered.

**What does not move.** The seed is unoptimised, so it is unaffected. `plumb-shape-cost.py`
builds at `-O`, so an `-O3`-only change does not touch it. An `-O` change (option C) does
move its `wasm-opt` CPU row, which must be graded on a quiet box. At fi40, 41 of the 47 `bench/`
programs build byte-identical modules.

## Options

* **A. Keep the ruling.** Expose the budget as the flag C3 already ruled, which has never been
  built (`vl build --inline-size=<n>`). diderven passes it. Cost: one CLI flag. Every V8
  consumer has to learn the V8 heuristic to know they need it.
* **B. `--flexible-inline-max-function-size 40` in `RELEASE_PASSES` (`-O3` only).** It closes
  DV-1000's `-O3` regression (1.5x). It costs +2.9% on the game, +5.7% on the compiler at
  `-O3` and no measurable `wasm-opt` CPU. It does not reach DV-1001, which needs 120.
  Binaryen applies the flexible size only to functions with no calls or loops in them, so
  it is a leaf-only budget.
* **C. Raise `-O`'s always-inline from 16 to 32.** On the game, FRAME improves 0.114–0.135 →
  0.098–0.119 for +5.9% bytes; on the compiler, +8.7% bytes. It needs `plumb-shape-cost`
  re-graded on a quiet box, and it is the rung PL-053 tuned for plumb.
* **D. Default rung.** The game is at 25% small already, so V8 inlines little at default.
  What helps is any optimizing pass: `wasm-opt -O1` over the default module, 5 s, matches
  `-O`'s frame time. Making the default run it re-opens `O-default-build-optimizes`, which
  includes a hard binaryen dependency. **The zero-cost answer is for diderven to ship
  `build:vl:opt` (`-O3`), or `-O`.**
* **Not proposed.** Padding modules with trivial functions to raise V8's budget works
  (DV-1001 `-O3` 1262–1371 → 948–1141 µs), but it games one engine's heuristic and can flip
  with any V8 release.

**Recommendation: B, plus D's zero-cost answer.** The real DV-1000 gap is guards the loop
range decides (D4000, ROADMAP B-range), and no inlining option closes it. B removes the
case where `-O3` is slower than default. It does so at a cost the C3 ruling's numbers
overstate for this size (+5.7%, not +28%, at 40 rather than 60).
