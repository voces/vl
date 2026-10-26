# Track B — Codegen, memory model and runtime

The forward items of the codegen track, linked from [`ROADMAP.md`](../../ROADMAP.md). The rules
there apply here, and `tests/roadmap_honest_test.ts` gates this file too.
- A finished item is deleted in the PR that adds its CHANGELOG line.
- A defect is a row in [`inventory/`](../internals/inventory/), and this file cites only open rows.
- A question for the owner is a section of [`open-rulings.md`](../internals/open-rulings.md).

## Consumer feedback: emoji-sheep-tag

emoji-sheep-tag has no issues doc of its own, so its asks live here. A perf round ported a
pathfinding search to VL (`voces/emoji-sheep-tag` PR 3) and reported three rough edges:
- **Verified: a module that never calls `print` imports the host print functions.**
  `shared/pathing/vl/search.vl` has no print call. Built with master's `vl`, it imports seven
  `imports.__print_*__` functions without `-O`, and two with `-O` (`__print_char__` and
  `__print_str_flush__`). A trivial module imports none, so some lowering pulls them in, probably a
  runtime-error or trap-message path. Forward: emit a host print import only when it is reachable.
- **The first use builds the toolchain, and `-O` needs a separate binaryen install.** The consumer
  measured about 5 minutes for the first build. This bears on the L10 ruling (the optimizer becomes a VL compiler
  phase) and on distribution (C5, H-M2).
- **Unverified: in the consumer's line-of-sight port, `-O3` produced slower code than no
  optimization.** Obtain the program and reproduce it before scheduling. If it holds, either fix the
  rung choice or document `-O`/`-O3` as per-program (P1.3 below).

Context, not a demand: the VL search ran about 19.0 ms against about 21.5 ms for the hand-optimised
flat-array TypeScript. End to end, the two were within noise, because the boundary and the
non-search work dominate. Read it as a data point on generated-code performance.

## Items

- **B-range** (D4000, DV-1000). Induction ranges for `for … until`, propagated through inlined
  helpers. They fold the compares and list bounds tests that the range decides. Keep the trap messages
  that cannot fold, and grade against a node/JS control.
- **B-hint.** Emit `metadata.code.branch_hint` for trap arms and `??` fallbacks. wasmtime must opt in.
- **L10, the optimizer as a VL phase** (optimizer-in-VL ruling). `-O` becomes a VL compiler phase, so
  the rung is chosen by the cost of the whole compile.
- **P1.3, optimization defaults.** Add the `-O` column to `bench/results/summary.md`, and name
  `sort-heap` in cli-design.md as the case where `-O3` is worse. The per-program rung cannot be
  selected (see the emoji-sheep-tag item).
- **B-alloc, allocate less.** Four parts:
  - Heap2Local on the default path, as an `opt_*` pass under L10;
  - rep inference that drops the list wrapper;
  - more union-arm niches;
  - B6a-opt: `Set` drops its always-true `vals` array.
- **String building.** A module-global accumulator appended from inside a function stays quadratic:
  200,000 two-char appends take 3.8 s. The function-local and top-level-loop cases are linear. Ropes
  were refused.
- **String interpolation.** A string-only hole still pulls `std:fmt` and `std:str` until
  whole-program dead-code elimination. This is unverified, and related to the print-import item
  above.
- **B2, numerics.** Arbitrary-precision BigInt and `Decimal<Backing, Scale>` as future std generics.
  They need const generics (A10).
- **B6-ro.** Widen the eight pure readers of `std:array` to `readonly T[]`, one fixture per export
  (std-api-reviewer).
- **B6, collections.** Representation inference, under `repOf(ty)`: a never-grown list becomes a
  header-less fixed array (§VL.7).
- **B6a, `Map` and `Set`.** Three gaps:
  - a recursive nested-collection map value `{[string]: Tree[]}` hits an emit error;
  - D2673: a `Set<K>` cannot be a union member;
  - an un-annotated `Map()` needs clean diagnostics.
- **B6b.** Representation inference (with A9), std over primitives, and the naming and forcing
  surface, which the owner decides. `docs/guide/collections-design.md` owns the design.
- **B6c, unchecked map read.** The lowering exists. Two parts remain:
  - measure whether any population needs the hatch;
  - the map and closure niche cells of `as!`, which are a loud emit reject.
- **B6d.** Lint a `.has(k)` or `!= null` guard whose body re-reads `m[k]`, which probes twice where
  one probe would do. Suggest binding once, or `as!`. It is a repo lint over the syntax tree
  (syntax-tree API ruling).
- **B7, strings.** Four gaps:
  - `__print_string__` runs per element, so non-ASCII print is slower;
  - source intake is still UTF-32;
  - the map probe cost is bimodal (hash clustering);
  - there is no display-width model beyond code points.
- **B12, concurrency** (concurrency-design.md, not `async`/`await`). This covers stack switching,
  `map(f, limit)` and effect inference. A std `map` needs a generic sized-array constructor.
- **B15, function values.** A nested un-annotated capturing function delivered as a value
  (`[k][0](1)`, `use(k)`) still refuses at emit. Find or file the rows. The migration's step 3–4
  function-value types are where it closes.
- **B17, diagnostics and lint.** Each item is a lint over the syntax tree:
  - a float zero-divisor warning;
  - a discarded-call-result warning (owner ruling first);
  - assignment of a literal in a condition;
  - per-line `// vl-ignore <code>` and `vl-ignore-file`;
  - LSP quick-fixes;
  - severity threading.
- **B-mem.** Narrow 8- and 16-bit stores are absent, and the allocator tier is `std:buffer`. The two
  dead intrinsics wait on buffer-design O8.
- **Buf memory safety.** `Buf` is a forgeable structural record (`std/buffer.vl`). buffer-design.md
  §L2b has the one-word `new` newtype fix. Fix or accept is an open ruling (open-rulings §E).
- **B-sym.** Identifier-interning phases 4 (the checker scope chain) and 5 (`modRenamed`) remain
  (perf-program.md §9.7). Phase 4 touches the scope chain that `identDeclIx` will replace, so check it
  against the migration first.
- **B-ci.** `build.rs`'s `VL_SEED_KEY` recompiles the embed job on each push. Verify that `ci-native`
  uses `check --batch`. The target is a `ci.yml` wall of at most 3 minutes.
- **B-validwasm.** Confirm that non-optimized output validates for narrowing, divergent loops, maps
  and recursive types, by running the corpus without `-O`. This is unverified.
- **B21.** The two buried-position prelude rejects (`match` inside a call argument, and a top-level
  binding) were not re-probed.
- **B-debug.** Value-rich panic messages (`index 7 out of bounds (length 3)`), and the span of an
  index assignment's left-hand side.
- **B-emitmsg.** Emit failures still use compiler-internal jargon. Rewrite each as a source-located,
  plain-language message. Under the target, most become check-time facts or disappear.
- **B-repdebug.** `vl check --why-reject`, `vl build --dump-reps`, and a corpus label for which tier
  failed. It is likely superseded once `repOf(ty)` is one function whose result can be printed.
