// NATIVE `vl build -O3` — the RELEASE PROFILE, gated end to end.
//
// `vl build -O3` shells out to `wasm-opt` with the audited release flag set
// (`--closed-world -O3 --gufa -O3` + the shared GC/reference-type/bulk-memory
// enables), documented in `docs/internals/opt-profile-design.md`. `-O` is the
// unchanged shrink rung and stays a single open-world `-O`.
//
// Two things are pinned here, and the first is the one webcraft P1.3 asked for.
//
// (1) THE MELT TABLE. Per-tick scratch allocations must disappear, so each
//     fixture in `tests/fixtures/opt-melt/` is built at (none) / `-O` / `-O3` and
//     the surviving allocation SITES are counted out of the `--wat` disassembly.
//     The counts are exact goldens: a fixture that stops melting is a regression,
//     and a fixture that STARTS melting is a finding that must be re-documented in
//     `opt-profile-design.md` — both should be loud, so neither direction is
//     tolerated silently. The count is over the whole module, which is the right
//     upper bound: unoptimized, some sites live in helpers the loop calls;
//     optimized, everything reachable has been inlined into the one loop.
//
// (2) THE PROFILE IS BEHAVIOUR-PRESERVING. `--closed-world` is an assumption about
//     the module boundary, not a peephole — it is sound only because VL's boundary
//     is scalar-only (DECISIONS H6). Every fixture and a representative corpus
//     spread is run through `vl run <module>` after optimization and must reproduce
//     its `@log` lines exactly.
//
// (3) THE LOOP SHAPE. Optimizing is not free: on tight scalar loops both rungs are
//     a LOSS under wasmtime, up to 2.4x, and the mechanism is a specific rewrite —
//     binaryen turns the loop VL emits,
//       (block $b (loop $l (br_if $b (eqz c)) BODY (br $l)))
//     into
//       (loop $l (if c (then BODY (br $l))))
//     moving the back-edge inside an `if`. The two are semantically identical and
//     V8 runs them at the same speed; wasmtime/Cranelift splits the rotated loop
//     into two blocks and materialises every loop-carried value at the block
//     parameters on BOTH edges, costing a register shuffle per edge plus a stack
//     round-trip of the widest accumulator on the loop-carried dependency chain.
//     The cost scales with how many values are carried: measured 1.00x at one,
//     1.36x at two, 2.40x at three (`opt-profile-design.md` §7).
//
//     Timing cannot be gated in CI, so what is pinned is the SHAPE that causes it:
//     per fixture per rung, how many loops there are, how many are rotated, and the
//     largest loop-carried set. Those are static counts over the `--wat` dump —
//     deterministic, independent of machine load, and causally tied to the
//     slowdown (hand-editing exactly this shape back recovers the whole 2.4x).
//
// (4) THE BENCHMARK SHAPES. (1) and (3) pin purpose-built probes; `SHAPE_TABLE` pins the
//     modules the perf programme actually reasons about — `bench/<cat>/<name>/main.vl`,
//     the same sources `bench/run.sh` times — at `-O` and `-O3`. Per row: module bytes
//     within a stated band, plus exact counts of functions, allocation sites,
//     `call_indirect`, and (where they are the axis) `return_call` and `ref.eq`. This is
//     the regression gate the perf programme lacked: nothing re-measured at PR time, and
//     three perf documents drifted to numbers stale by up to 4.3x as a result. It is
//     deterministic for the same reason (1) and (3) are — it measures the artifact — and
//     it is explicitly the RELIABLE HALF: a shape pin cannot see a regression that keeps
//     the shape and adds work per iteration. See the table's own header for why it skips
//     the `none` rung and why nothing here is timed.
//
// (5) THE FEATURE ENABLES ACCEPT WHAT THE EMITTER WILL PRODUCE. `BINARYEN_FEATURES`
//     is shared by both rungs and by `--wat`, and binaryen HARD-FAILS validation on
//     an opcode whose feature is not enabled — exit 1 with NO OUTPUT FILE, so the
//     rung `bail!`s rather than degrading. `tests/fixtures/opt-tailcall/` pins the
//     tail-call enable that way, and the flag lists are read OUT OF `main.rs` so the
//     test cannot drift from what ships.
//
// A missing `wasm-opt` stays a SOFT NO-OP for `-O3` exactly as for `-O`, which is
// its own case below (exit 0, a note on stderr, the unoptimized module on disk).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`, shared with the alignment suite)
// AND requires the vl binary + seed wasm + `wasm-opt` + `wasm-dis`; absent any,
// every case registers ignored with a one-line how-to-build note.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const MELT = `${ROOT}/tests/fixtures/opt-melt`;
const LOOPS = `${ROOT}/tests/fixtures/opt-loop`;
const BENCH = `${ROOT}/bench`;
const CASES = new URL("./cases/", import.meta.url);

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const haveOpt = exists(WASM_OPT) && exists(WASM_DIS);
const ENABLED = GATED && haveBin && haveSeed && haveOpt;
if (GATED && !ENABLED) {
  const why = !haveBin
    ? "missing vl binary"
    : !haveSeed
    ? "missing seed wasm"
    : "missing wasm-opt/wasm-dis (run npm ci)";
  console.warn(
    `[native-release] skipped — ${why}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh\n  npm ci",
  );
}

// Allocation SITES surviving each rung, per fixture. `-O` is open-world binaryen
// and melts only what a single function already dominates; `-O3` is the release
// profile. The two non-zero `-O3` rows are the characterized non-melts — the
// union box reached through a ref-typed local with two definitions, and the
// BACKING ARRAY of a grown list (its `{backing,len,cap}` wrapper does melt; only
// the array survives). See `opt-profile-design.md` §3.
const MELT_TABLE: Array<{ fixture: string; none: number; O: number; O3: number }> = [
  { fixture: "struct-scratch-call", none: 3, O: 0, O3: 0 },
  { fixture: "list-wrapper-literal", none: 3, O: 0, O3: 0 },
  { fixture: "list-wrapper-call", none: 3, O: 0, O3: 0 },
  // Both union-box producers here are two-armed helpers, and the RETURN SINK gives such a
  // function ONE construction site: every `return` writes the tag/payload pair into two
  // reserved locals and branches to a single exit that performs the only `struct.new`. So
  // the `none` column is one below the arm count, and the surviving box is a single
  // allocation site — which is the shape Heap2Local can own.
  //
  // The `-O` column is the sharper reading of what that bought. At TWO sites the box could
  // only disappear through `--closed-world` type refinement, so `union-box-call` melted at
  // `-O3` and not before; at one site plain escape analysis suffices and both fixtures melt
  // a rung EARLIER than they used to.
  { fixture: "union-box-call", none: 3, O: 0, O3: 0 },
  // `union-box-branch-local` writes a `let` on two branches by SEPARATE statements — an
  // init and an assignment inside an `if`. There is no merge point for a box to sink into,
  // so neither sink sees it and this row is unmoved. Collapsing it needs the binding's slot
  // to hold the tag/payload pair across a liveness window, which is a rep question and not
  // a sink (`unboxed-union-rep-design.md` §12.4).
  { fixture: "union-box-branch-local", none: 4, O: 4, O3: 2 },
  { fixture: "list-wrapper-push", none: 6, O: 3, O3: 2 },
  // `union-box-call` with its payload READ instead of discarded. The read still blocks the
  // melt at two sites — that is what `opt-profile-design.md` §3 item 0 measured — but the
  // producer now has one site, and the two survivors at `-O`/`-O3` are the PAYLOAD
  // allocations (the data), not the box (the overhead).
  { fixture: "union-box-payload-read", none: 3, O: 2, O3: 2 },
  // The SAME program as `union-box-payload-read`, its producer written as one `return` of
  // an if-EXPRESSION. A union-valued if-expression lowers as a value-typed `if` that boxes
  // in each arm, which read 4/4/4 until the return path split it into per-arm exits. The
  // two rows must stay equal: they are one program in two spellings.
  { fixture: "union-sink-if-expression", none: 3, O: 2, O3: 2 },
  // The SAME program a THIRD way: a `const` BINDING whose init is the if-expression. It
  // read 5/4/4 — a box per arm plus the null box pre-seeded into the binding's
  // non-defaultable slot, which a void-`if` merge does not definitely assign. The BINDING
  // SINK writes the pair in each arm and builds the box once after the `if`, which
  // dominates every read and so retires the pre-seed too: three sites become one. All
  // three spellings must now read the same.
  { fixture: "union-sink-let-if", none: 3, O: 2, O3: 2 },
];

// Loop SHAPE per rung, per fixture in `tests/fixtures/opt-loop/`.
//   loops   — `(loop` headers in the module
//   rotated — those whose single child is an `if` (binaryen's rewrite; the shape
//             wasmtime compiles with a per-edge register shuffle and a spill)
//   carried — the largest set of distinct locals written inside one loop, i.e. the
//             values live across the back-edge. This is the SEVERITY axis: a
//             rotated loop carrying one value measured 1.00x, three measured 2.40x.
//
// The `none` column pins VL's OWN emission: it must stay 0-rotated on the scalar
// fixtures. If a compiler change starts emitting the rotated form directly, the
// default build inherits the whole penalty with no flag to escape it.
const LOOP_TABLE: Array<{
  fixture: string;
  none: [number, number, number];
  O: [number, number, number];
  O3: [number, number, number];
}> = [
  // The CONTROL: rotated at both rungs and measured harmless (1.00x), which is why
  // `rotated` alone is not the alarm — `carried` is what grades it.
  { fixture: "scalar-accum-1", none: [1, 0, 2], O: [1, 1, 2], O3: [1, 1, 2] },
  // `bench/arith/mixed-width`'s kernel: the 2.43x row. One loop, rotated at both
  // rungs, four carried values.
  { fixture: "scalar-accum-3", none: [1, 0, 4], O: [1, 1, 4], O3: [1, 1, 4] },
  // `bench/arrays/binsearch`'s kernel: the 1.23x row, and the nested case. The two
  // already-rotated loops at `none` are list-growth helpers, not user loops; both
  // rungs inline them away and rotate all three that remain.
  //
  // `none` moved 5,2,8 -> 6,3,8 when `__str_eq__` gained its 8x unroll (PERF P3).
  // THE PROBE'S OWN LOOPS DID NOT MOVE — this counter is MODULE-WIDE, and it counts
  // the runtime helpers VL emits into every module. Per-function counts, master vs
  // that change: `$1` (bsearch itself) 2 -> 2, `$0`/`$3` 1 -> 1, and `$4` — the
  // two-string-ref `__str_eq__` — 1 -> 2, which is exactly what an unrolled loop
  // plus its scalar remainder looks like. `binsearch-probe` contains ZERO string
  // operations, so no user loop could have changed.
  //
  // Recorded because it is the gate's first live firing and it fired on the wrong
  // axis: the module-wide unit cannot distinguish "the probe's loop rotated" (the
  // 2.40x defect this gate exists to catch) from "a shared helper gained a loop"
  // (inert for this probe). Tightening it to the probe's own functions is filed;
  // until then a helper change legitimately moves these numbers and the fix is to
  // re-verify per-function and update the row, as done here.
  //
  // `none` then moved 6,3,8 -> 6,3,6 when the list-header hoist landed (PERF P5),
  // and this firing is NOT the previous one's shape — tightening the counter to the
  // probe's own functions would NOT have suppressed it, because the function that
  // moved IS the probe's own. Per-function counts, before vs after:
  //
  //   $0  bsearch      rot=0  carried 8 -> 6   <- the only row that moved
  //   $1  (helper)     rot=0  carried 4 -> 4, and its second loop 2 -> 2
  //   $3  (helper)     rot=1  carried 2 -> 2
  //   $4  (helper)     rot=1  carried 1 -> 1  (twice)
  //
  // `loops` and `rotated` are unchanged, and the loop that moved is UNROTATED at
  // `none`, so the mechanism this gate grades — a rotated back-edge materialising
  // its carried set at the block parameters on both edges — is untouched. What
  // left bsearch's loop is the two list-index frame slots the bounds guard used to
  // write per access (the nullable wrapper stash and its scratch); the hoist reads
  // the header into two locals BEFORE the loop instead, so they are written once
  // per loop rather than once per element. `-O` and `-O3` are byte-identical on
  // both sides (3,3,6), because both rungs already inlined the same helpers away.
  //
  // FEWER carried is the direction the gate's own model calls faster, and the
  // measurement agrees: `bench/arrays/binsearch` at `none` 1292 -> 1235 ms
  // (0.956, min-of-5 interleaved, noise floor 0.49%).
  // `none` then moved 6,3,6 -> 7,4,6 when `__str_hash__` gained its 4x unroll — the
  // SAME shape as the `__str_eq__` firing above, and verified the same way rather
  // than assumed. Per-function loop counts, master vs this change:
  //
  //   $4  rot  1 -> 1     $5  bsearch (the probe itself)  2 -> 2, BYTE-IDENTICAL
  //   $6       0 -> 0     $7  __str_hash__                1 -> 2   <- the only row
  //   $8       2 -> 2     $9                              0 -> 0
  //
  // `$7` takes one string ref, returns i32, and its body carries the FNV prime
  // 16777619 FIVE times — four unrolled steps plus the remainder — which is exactly
  // what an unrolled loop plus its scalar tail looks like. `binsearch-probe.vl`
  // contains ZERO string operations (grep for a quote returns 0), so it never calls
  // `$7`; the added loop and the added rotation are both unreachable from this
  // program and cost it nothing. `-O` and `-O3` are UNCHANGED at 3,3,6 because both
  // rungs already inline the helper away.
  //
  // This is the second time the module-wide unit has fired on the wrong axis, which
  // strengthens the filed tightening: the gate cannot tell "the probe\'s loop
  // rotated" (the 2.40x defect it exists to catch) from "a helper this program never
  // calls gained a loop". Until that lands, a helper change legitimately moves these
  // numbers and the fix is to re-verify PER FUNCTION and update the row.
  { fixture: "binsearch-probe", none: [7, 4, 6], O: [3, 3, 6], O3: [3, 3, 6] },
];

// ── THE BENCHMARK SHAPE PINS ────────────────────────────────────────────────
//
// `MELT_TABLE` and `LOOP_TABLE` pin purpose-built probes. This table pins the
// ARTIFACT the perf programme actually reasons about: `bench/<cat>/<name>/main.vl`,
// the same source `bench/run.sh` times, compiled at the two optimizer rungs.
//
// WHY THIS EXISTS. Nothing re-measured at PR time, and the cost is on the record:
// three perf documents drifted to numbers stale by up to 4.3x and the filed-vs-shipped
// P7 split survived unnoticed. A wall-clock gate cannot pay that debt — `bench/README.md`
// records this box swinging up to 2.5x under contention even with `taskset`, which is the
// same ambiguity that made the `vl test` parallelism ratio unusable and flaked it twice.
// So nothing here is timed. Every column below is a property of the emitted module.
//
// WHAT THIS CAN AND CANNOT SEE. It cannot see a regression that keeps the shape and adds
// work per iteration — one extra `i32.add` inside a loop that already exists moves none of
// these counters and only a few bytes. It is the reliable half, not the whole answer; the
// CPU-time baseline is the other half and is deliberately not attempted here.
//
// THE SELECTIVITY IS MEASURED, NOT ASSERTED. A pin that reddens on unrelated work gets muted
// and then catches nothing, so the table was derived twice: once at 976e3b77, and again after
// rebasing over four changes that all touch EMITTED CODE — the union box sink for
// if-expression-initialised bindings, the numeric-litunion `is` lowering, generic function
// values crossing typed boundaries, and `recordMvValTyIx` routing. The compiler binary itself
// moved 1141634 -> 1147912 bytes across them. All 26 rung-rows below re-derived BYTE-IDENTICAL,
// on every counter. That is the evidence for the claim these rows only move when one of the
// shapes they name moves — none of these 13 programs contains the constructs those four
// changes rewrite.
//
// WHY ONLY `-O` AND `-O3`, WHEN THE OTHER TWO TABLES ALSO PIN `none`. Every counter here
// is MODULE-WIDE, and at `none` a module contains runtime helpers the program never calls:
// `binsearch-probe` contains zero string operations and still carries `__str_hash__`. That
// is not hypothetical — LOOP_TABLE's `none` row has fired twice on exactly that wrong axis
// (`__str_eq__`'s 8x unroll, then `__str_hash__`'s 4x unroll), both times on a helper the
// probe cannot reach. `-O` and `-O3` run DCE, so at those rungs a module-wide count IS a
// reachability-scoped count and the wrong-axis firing cannot happen. A regression in VL's
// OWN emission is not lost by skipping `none`: the optimizer inlines VL's output, so extra
// emitted work still lands in these columns.
//
// The programs are BUILT, never run: they are sized for 1e7-1e8 iterations. Their stdout is
// adjudicated by `bench/run.sh` against `meta.json`'s `expect`, and `vl build` validates the
// module through the engine, so a build that exits 0 is a module wasmtime accepts.
//
// EDITING A BENCHMARK'S `main.vl` IS EXPECTED TO MOVE ITS ROW. The row describes that exact
// program; re-record it in the same change, as the playbook requires for any golden.
type ShapePins = {
  // Module bytes, BANDED (see `BYTES_TOL`). Bloat is what this catches — a lost inline, a
  // lost DCE, a re-materialised allocation, a helper that started unrolling. It cannot see
  // a single added instruction, and it is not trying to.
  bytes: number;
  // Top-level `(func` count. Falls when the optimizer inlines. A RISE means something
  // stopped inlining, which on these shapes is the difference between a direct call and a
  // call frame per iteration.
  fns: number;
  // `struct.new*`/`array.new*` sites, counted exactly as `MELT_TABLE` counts them. A rise
  // is an allocation the optimizer used to melt.
  allocs: number;
  // `call_indirect` sites. This is the closure-dispatch axis: `bench/algorithms/lambda-hot`
  // measures an indirect call at ~13ns against a 0.9ns direct call, 14x.
  indirect: number;
  // `return_call` sites — pinned only where tail calls are the point, because a return_call
  // APPEARING somewhere new is an improvement and must not redden.
  tail?: number;
  // `ref.eq` sites — pinned only on the string shapes, where it is the identity fast path
  // inside `__str_eq__`. Same reason: elsewhere its appearance is not a regression.
  refEq?: number;
};

// Bytes are graded within `max(3%, 16 bytes)` of the recorded value. The band is the
// mute-avoidance device: an exact byte golden on 13 modules reddens on instruction-selection
// noise, gets muted, and then catches nothing. 3% is far under the 2-4x collapse an inlining
// or DCE change produces on these modules (see the `none` -> `-O` columns of the survey in
// the commit that added this table), and far over a two-instruction difference. The 16-byte
// floor keeps the 144-300 byte modules from being pinned to single-digit slack.
const BYTES_TOL_FRAC = 0.03;
const BYTES_TOL_MIN = 16;

// Both directions are graded, and the SHRINK direction is not a formality: a benchmark whose
// module collapses has usually had its hot loop constant-folded away, and a benchmark that
// measures nothing is worse than one that measures slowly.
const SHAPE_TABLE: Array<{ bench: string; axis: string; O: ShapePins; O3: ShapePins }> = [
  // CLOSURE DISPATCH, the devirtualisable case. `meta.json` records 0.048s for a direct call
  // against 0.666s for the same body reached through a lambda value (14x), and that `-O`
  // "collapses the lambda phases back to 0.033s". `indirect` is where that lives: 2 at `-O`,
  // 0 at `-O3` — the release profile's `--closed-world` refinement is what turns the two
  // call sites direct, and `allocs` 1 -> 0 is the closure record melting behind it.
  // SHOULD MOVE IF: closure calls stop lowering to `call_indirect` (a rep change), or `-O3`
  // stops devirtualising them. Either is the 14x coming back.
  {
    bench: "algorithms/lambda-hot",
    axis: "closure call in a hot loop, four spellings",
    O: { bytes: 389, fns: 5, allocs: 1, indirect: 2 },
    O3: { bytes: 272, fns: 1, allocs: 0, indirect: 0 },
  },
  // HIGHER-ORDER BUILTINS. `xs.map(f).filter(g)` plus a `reduce`: the one shape where
  // `meta.json` records reaching for the builtin costing VL 2.01x against its own hand-written
  // loop, while Rust and V8 charge 0.86x and 0.79x. Same devirtualisation story as lambda-hot
  // and the same 2 -> 0, on the idiomatic spelling rather than a synthetic one.
  // SHOULD MOVE IF: the callback stops being devirtualised at `-O3`, or the pipeline's
  // intermediate arrays stop melting (`allocs`).
  {
    bench: "algorithms/map-filter-reduce",
    axis: "map/filter/reduce callback pipeline",
    O: { bytes: 946, fns: 7, allocs: 10, indirect: 2 },
    O3: { bytes: 708, fns: 1, allocs: 8, indirect: 0 },
  },
  // THE CONTROL FOR THE TWO ABOVE. A four-way dispatch table is genuinely dynamic, so
  // `meta.json` records that `-O3` does NOT help here (1.469s vs 1.331s) — binaryen cannot
  // devirtualise a target it cannot see. `indirect` therefore stays 2 at BOTH rungs, and that
  // is the point of carrying this row: without it, "indirect went to 0" reads as unambiguously
  // good, when on this shape it would mean the optimizer had proved something false.
  // SHOULD MOVE IF: the dispatch lowering changes, or `--closed-world` starts (wrongly)
  // devirtualising a table-driven call.
  {
    bench: "algorithms/dispatch-table",
    axis: "4-way indirect dispatch (registry / interpreter shape)",
    O: { bytes: 656, fns: 6, allocs: 18, indirect: 2 },
    O3: { bytes: 466, fns: 6, allocs: 14, indirect: 2 },
  },
  // TAIL CALLS. `meta.json` still carries the `vlDefect` entry from when VL emitted a plain
  // `call` in tail position; the emitter now emits `return_call`, and the same entry measures
  // what that is worth — 1.313s -> 0.638s (2.06x) with byte-identical output, and the depth
  // cap lifting from ~16_210 frames to at least 5_000_000. `tail` is a one-bit pin on that:
  // if it reads 0, this program is 2x slower AND traps at a depth it used to survive.
  // The feature-enable test below is its other half — a `return_call` binaryen refuses to
  // accept is a hard build failure rather than a slow module.
  // SHOULD MOVE IF: the tail-call emitter stops firing on a self-recursive tail call.
  {
    bench: "recursion/tailcall",
    axis: "self tail recursion at depth 5_000",
    O: { bytes: 145, fns: 2, allocs: 0, indirect: 0, tail: 1 },
    O3: { bytes: 144, fns: 2, allocs: 0, indirect: 0, tail: 1 },
  },
  // MUTUAL tail recursion — the case a self-call peephole would miss. Two functions, and the
  // surviving `return_call` count is 1 at both rungs because the optimizer inlines one of the
  // pair into the other; the emitter produces 2 before that.
  // SHOULD MOVE IF: tail-call emission regresses to direct calls across a mutual pair.
  {
    bench: "recursion/mutual",
    axis: "mutual tail recursion",
    O: { bytes: 214, fns: 2, allocs: 0, indirect: 0, tail: 1 },
    O3: { bytes: 206, fns: 2, allocs: 0, indirect: 0, tail: 1 },
  },
  // STRING EQUALITY. `refEq` is `__str_eq__`'s identity fast path, and `meta.json` on
  // `collections/map-string` measures what losing it costs: the same 10M-hit loop reads 497ms
  // with the shortcut and 1042ms without, 2.1x. It is a fast path user code cannot express, so
  // if it stops surviving the optimizer there is no spelling that recovers it.
  // `bytes` is the interesting column here for a different reason: `__str_eq__` carries an 8x
  // unroll (PERF P3), so this row is where an unroll being lost or doubled shows up.
  // SHOULD MOVE IF: `emitStrEqFnCode` changes, the identity fast path is dropped, or the
  // unroll factor moves.
  {
    bench: "strings/str-eq",
    axis: "string == : identity / equal / early-mismatch / late-mismatch",
    O: { bytes: 1491, fns: 3, allocs: 14, indirect: 0, refEq: 1 },
    O3: { bytes: 1466, fns: 3, allocs: 14, indirect: 0, refEq: 1 },
  },
  // STRING HASHING + MAP PROBE. 30M lookups over string keys built as distinct objects, so the
  // probe path is a real hash plus a real content compare rather than a pointer check. This is
  // the shape PERF P7 (`__str_hash__`'s 4x unroll, 1.135x) was measured on, and the row that
  // would have caught the filed-vs-shipped split: a hash-helper change moves these bytes.
  // SHOULD MOVE IF: `__str_hash__` or the probe sequence changes, or the key compare loses its
  // `ref.eq` head.
  {
    bench: "collections/map-string",
    axis: "string-keyed map: insert, hit/miss probe, iterate",
    O: { bytes: 1881, fns: 4, allocs: 18, indirect: 0, refEq: 1 },
    O3: { bytes: 1849, fns: 3, allocs: 19, indirect: 0, refEq: 1 },
  },
  // MAP PROBE WITHOUT THE STRING COST. i32 keys, so this isolates the bucket walk and the
  // `?? -1` sentinel path from hashing and content compare — the two rows differ by exactly
  // the string work, which is what makes either one attributable.
  // SHOULD MOVE IF: the map probe sequence or the map struct access path changes.
  {
    bench: "collections/map-i32",
    axis: "i32-keyed map: insert, hit/miss probe, iterate",
    O: { bytes: 1171, fns: 2, allocs: 13, indirect: 0 },
    O3: { bytes: 1104, fns: 2, allocs: 13, indirect: 0 },
  },
  // MIXED MAP + STRING, the realistic one: tokenize by code-point scan and slice, then a
  // read-modify-write upsert. `meta.json` decomposes VL's cost as ~64% map upsert and ~21%
  // slice, so this row moves for a change to either. It is the only string row where `refEq`
  // survives alongside a live `fns: 5` — the helpers are all genuinely reachable.
  // SHOULD MOVE IF: `slice`, the code-point scan, or the two-probe upsert changes.
  {
    bench: "collections/word-freq",
    axis: "tokenize + word-frequency upsert (map + string)",
    O: { bytes: 2471, fns: 5, allocs: 25, indirect: 0, refEq: 1 },
    O3: { bytes: 2404, fns: 5, allocs: 25, indirect: 0, refEq: 1 },
  },
  // ARRAY ELEMENT WRITE + READ, 400M of each, with the allocation hoisted out of the steady
  // state by construction. `fns: 1` is the load-bearing pin: every element accessor has been
  // inlined into the one loop, so a rise here means an element access became a call.
  // `allocs: 2` is the array plus its wrapper, both outside the loop.
  // SHOULD MOVE IF: the bounds-check sequence changes, or an accessor stops inlining.
  {
    bench: "arrays/fill-sum",
    axis: "hot-loop i32 array element write + read; per-access bounds check",
    O: { bytes: 318, fns: 1, allocs: 2, indirect: 0 },
    O3: { bytes: 298, fns: 1, allocs: 2, indirect: 0 },
  },
  // ARRAY READ IN A BRANCHY LOOP. The bench twin of `opt-loop/binsearch-probe`, which pins the
  // loop SHAPE; this pins the code SIZE of the same kernel, and the two are complementary —
  // the shape pin is blind to per-iteration work, and bytes are blind to a rotated back-edge.
  // SHOULD MOVE IF: the index guard changes, or the list-header hoist (PERF P5) regresses.
  {
    bench: "arrays/binsearch",
    axis: "binary search over a sorted i32 array",
    O: { bytes: 381, fns: 1, allocs: 2, indirect: 0 },
    O3: { bytes: 346, fns: 1, allocs: 2, indirect: 0 },
  },
  // STRUCT FIELD THROUGH AN ARRAY (array-of-structs). Adds a `struct.get` per element to the
  // fill-sum shape, and `allocs: 3` says the per-element structs are allocated once during
  // setup and never re-materialised inside the scan.
  // SHOULD MOVE IF: field access lowering changes, or a struct starts being copied per access.
  {
    bench: "arrays/struct-aos",
    axis: "array-of-structs field scan",
    O: { bytes: 345, fns: 1, allocs: 3, indirect: 0 },
    O3: { bytes: 287, fns: 1, allocs: 3, indirect: 0 },
  },
  // THE TIGHT SCALAR LOOP — `LOOP_TABLE`'s `scalar-accum-3` is this kernel, and it is the 2.43x
  // loop-rotation row. At 203 bytes with a single loop and no allocation, this is the ONE row
  // where the byte band is fine-grained enough to notice work added per iteration: 16 bytes of
  // slack against a loop body of a few dozen. Everywhere else that sensitivity is honestly
  // absent, which is why it is claimed only here.
  // SHOULD MOVE IF: scalar arithmetic lowering or width conversion changes.
  {
    bench: "arith/mixed-width",
    axis: "mixed i32/i64/f64 accumulators in one tight loop",
    O: { bytes: 208, fns: 1, allocs: 0, indirect: 0 },
    O3: { bytes: 203, fns: 1, allocs: 0, indirect: 0 },
  },
];

// THE BENCHMARK SHAPE GATE. One test per `bench/<cat>/<name>`, grading the two optimizer
// rungs against `SHAPE_TABLE`. Nothing is timed and nothing is run; see the table's header
// for what that buys and what it gives up.
const shapeOf = (wat: string, bytes: number, want: ShapePins): ShapePins => {
  const got: ShapePins = {
    bytes,
    fns: funcCount(wat),
    allocs: allocSites(wat),
    indirect: countOf(wat, /\bcall_indirect\b/g),
  };
  // The optional counters are read only when the row pins them, so an unpinned metric
  // cannot show up in a diff as `undefined` vs a number.
  if (want.tail !== undefined) got.tail = countOf(wat, /\breturn_call\b/g);
  if (want.refEq !== undefined) got.refEq = countOf(wat, /\bref\.eq\b/g);
  return got;
};

// Bytes are graded within a band and everything else exactly, so the exact compare drops
// them. Object rest keeps declaration order, and `shapeOf` builds `got` in the same order
// the table literals are written, so the two JSON strings are comparable.
const exact = ({ bytes: _bytes, ...rest }: ShapePins) => rest;

for (const row of SHAPE_TABLE) {
  Deno.test({
    name: `native-release: bench/${row.bench} — emitted shape (${row.axis})`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${BENCH}/${row.bench}/main.vl`;
      const tmp = await Deno.makeTempDir();
      try {
        for (const [label, flags, want] of [
          ["-O", ["-O"], row.O],
          ["-O3", ["-O3"], row.O3],
        ] as const) {
          const out = `${tmp}/m.wasm`;
          // `vl build` validates the module it writes, so exit 0 already means wasmtime
          // accepts these bytes — the programs themselves are far too large to run here.
          const b = await vl(["build", src, ...flags, "--wat", "-o", out]);
          if (b.code !== 0) {
            throw new Error(
              `bench/${row.bench}: vl build ${label} failed: ${b.err.trim().split("\n")[0]}`,
            );
          }
          const bytes = Deno.statSync(out).size;
          const got = shapeOf(Deno.readTextFileSync(`${tmp}/m.wat`), bytes, want);

          // Structure is graded FIRST: a structural move takes the bytes with it, and the
          // structural message names the cause where the byte message can only name the
          // symptom.
          if (JSON.stringify(exact(got)) !== JSON.stringify(exact(want))) {
            throw new Error(
              `bench/${row.bench} ${label}: emitted shape moved\n` +
                `  want ${JSON.stringify(exact(want))}\n  got  ${JSON.stringify(exact(got))}\n` +
                "  fns UP: something stopped inlining — a per-iteration call frame.\n" +
                "  allocs UP: an allocation the optimizer used to melt is back.\n" +
                "  indirect UP: a direct call went through the table (~13ns vs ~0.9ns);\n" +
                "    indirect DOWN on algorithms/dispatch-table means a dynamic target was\n" +
                "    wrongly devirtualised, which is a soundness question, not a win.\n" +
                "  tail DOWN: the tail-call emitter stopped firing — 2.06x AND a stack-depth\n" +
                "    cap back at ~16k frames instead of 5M.\n" +
                "  refEq DOWN: `__str_eq__` lost its identity fast path — 2.1x on an equal-key\n" +
                "    probe loop, and user code cannot spell a replacement.\n" +
                "  A move in the FAST direction is a finding, not a break: re-measure and\n" +
                "  update SHAPE_TABLE + the row's justification in the same change.",
            );
          }

          const tol = Math.max(BYTES_TOL_MIN, Math.round(want.bytes * BYTES_TOL_FRAC));
          if (Math.abs(bytes - want.bytes) > tol) {
            throw new Error(
              `bench/${row.bench} ${label}: module size ${want.bytes} -> ${bytes} bytes ` +
                `(band ±${tol})\n` +
                "  The structural counts above are unchanged, so this is per-instruction\n" +
                "  weight, not a lost inline or a lost DCE. GREW: extra work emitted into\n" +
                "  code that was already there, or a helper started unrolling. SHRANK: check\n" +
                "  the hot loop was not constant-folded away — a benchmark that measures\n" +
                "  nothing is the worse failure. Re-measure and update SHAPE_TABLE with the\n" +
                "  reason. Editing this benchmark's main.vl is expected to move this row.",
            );
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// The same representative @run spread the `-O` suite uses, so the two rungs are
// compared on identical ground.
const CASES_LIST = [
  "arith/ops.vl",
  "objects/struct.vl",
  "strings/basics.vl",
  "loops/while-sum.vl",
  "tostring/numbers.vl",
  "maps/basics.vl",
];

const logsOf = (s: string) =>
  [...s.matchAll(/^\s*\/\/\s*@log (.*)$/gm)].map((m) => m[1]);

const vl = async (args: string[], env: Record<string, string> = {}) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS, ...env },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// One allocation site = one `struct.new*` / `array.new*` in the disassembly.
// `wasm-dis` folds instructions, so every site opens a paren; counted the same
// way `wasm-tools print` counts them (cross-checked: identical on all six).
const allocSites = (wat: string) =>
  (wat.match(/\((?:struct|array)\.new[a-z_]*/g) ?? []).length;

// Loop shape out of a `--wat` dump: (loops, rotated, maxCarried). Each `(loop` is
// taken to its balanced close so the counts are per loop rather than per module,
// and quoted strings are skipped so a name containing a paren cannot desync the
// scan.
const loopShapes = (wat: string): [number, number, number] => {
  let loops = 0, rotated = 0, carried = 0;
  for (let i = 0; i < wat.length; i++) {
    if (!wat.startsWith("(loop", i)) continue;
    let depth = 0, end = i;
    for (let j = i; j < wat.length; j++) {
      const c = wat[j];
      if (c === '"') {
        const q = wat.indexOf('"', j + 1);
        if (q < 0) break;
        j = q;
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          end = j;
          break;
        }
      }
    }
    const body = wat.slice(i, end + 1);
    loops++;
    // ROTATED: the loop's single child is an `if` — binaryen's rewrite of the
    // top-tested `br_if`-out form VL emits.
    if (/^\s*\(if[\s(]/.test(body.replace(/^\(loop(\s+\$[^\s()]+)?/, ""))) rotated++;
    const written = new Set(
      (body.match(/\(local\.set\s+\$[^\s()]+/g) ?? []).map((s) => s.trim()),
    );
    if (written.size > carried) carried = written.size;
  }
  return [loops, rotated, carried];
};

// Opcode occurrences in a `--wat` dump. `\b` around each token keeps the three call
// forms apart: `return_call_indirect` is a word to itself and matches NEITHER
// `\breturn_call\b` nor `\bcall_indirect\b`, so a module using it cannot be double
// counted into both columns.
const countOf = (wat: string, re: RegExp) => (wat.match(re) ?? []).length;

// `wasm-dis` opens every top-level function at one space of indent; nested folded
// instructions are indented further, so this counts DEFINED functions and not imports
// (which print as `(import ... (func ...))` on their own lines).
const funcCount = (wat: string) => countOf(wat, /^ \(func /gm);

// Build `src` at `flags`, dump the WAT, and return the surviving site count plus
// what the module prints. `--wat` runs AFTER the optimizer, so the dump is of the
// artifact being counted, not of the input.
const buildAndCount = async (src: string, flags: string[], tmp: string) => {
  const out = `${tmp}/m.wasm`;
  const b = await vl(["build", src, ...flags, "--wat", "-o", out]);
  if (b.code !== 0) {
    throw new Error(`vl build ${flags.join(" ")} failed: ${b.err.trim().split("\n")[0]}`);
  }
  const wat = Deno.readTextFileSync(`${tmp}/m.wat`);
  const sites = allocSites(wat);
  const shape = loopShapes(wat);
  const r = await vl(["run", out]);
  if (r.code !== 0) {
    throw new Error(`vl run exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
  }
  return { sites, shape, out: r.out.length ? r.out.replace(/\n$/, "").split("\n") : [] };
};

for (const row of MELT_TABLE) {
  Deno.test({
    name: `native-release: ${row.fixture} — allocation sites melt ${row.none}/${row.O}/${row.O3} at (none)/-O/-O3`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${MELT}/${row.fixture}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        const got: Record<string, number> = {};
        for (const [label, flags] of [["none", []], ["-O", ["-O"]], ["-O3", ["-O3"]]] as const) {
          const r = await buildAndCount(src, [...flags], tmp);
          got[label] = r.sites;
          if (JSON.stringify(r.out) !== JSON.stringify(want)) {
            throw new Error(
              `${row.fixture}: ${label} changed behavior\n  want ${JSON.stringify(want)}\n  got  ${
                JSON.stringify(r.out)
              }`,
            );
          }
        }
        const wantT = { none: row.none, "-O": row.O, "-O3": row.O3 };
        if (JSON.stringify(got) !== JSON.stringify(wantT)) {
          throw new Error(
            `${row.fixture}: allocation-site count moved\n` +
              `  want ${JSON.stringify(wantT)}\n  got  ${JSON.stringify(got)}\n` +
              "  A count that went DOWN is a finding, not a break: re-measure and update\n" +
              "  MELT_TABLE + docs/internals/opt-profile-design.md §3 in the same change.",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// THE LOOP-ROTATION REGRESSION GATE. `vl build -O3` (and `-O`) is a LOSS on tight
// scalar loops under wasmtime — 2.43x on `bench/arith/mixed-width`, 1.23x on
// `bench/arrays/binsearch` — and the cause is not in the flag set: bare binaryen
// `-O` at any level produces it, `--closed-world`/`--gufa` alone produce none of
// it, and no combination both melts allocations and leaves the loop alone.
//
// Since it cannot be fixed by choosing flags, it is PINNED, so that a future flag
// change cannot make it quietly worse. Timing in CI is not a usable instrument;
// the loop SHAPE is, because it is what the slowdown was traced to.
for (const row of LOOP_TABLE) {
  Deno.test({
    name: `native-release: ${row.fixture} — loop shape (loops,rotated,carried) stays ${
      row.none.join("/")
    } → ${row.O.join("/")} → ${row.O3.join("/")}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${LOOPS}/${row.fixture}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        const got: Record<string, [number, number, number]> = {};
        for (const [label, flags] of [["none", []], ["-O", ["-O"]], ["-O3", ["-O3"]]] as const) {
          const r = await buildAndCount(src, [...flags], tmp);
          got[label] = r.shape;
          if (JSON.stringify(r.out) !== JSON.stringify(want)) {
            throw new Error(
              `${row.fixture}: ${label} changed behavior\n  want ${JSON.stringify(want)}\n  got  ${
                JSON.stringify(r.out)
              }`,
            );
          }
        }
        const wantT = { none: row.none, "-O": row.O, "-O3": row.O3 };
        if (JSON.stringify(got) !== JSON.stringify(wantT)) {
          throw new Error(
            `${row.fixture}: loop shape moved — (loops, rotated, carried)\n` +
              `  want ${JSON.stringify(wantT)}\n  got  ${JSON.stringify(got)}\n` +
              "  MORE rotated loops, or a HIGHER carried count on a rotated loop, means\n" +
              "  this program got slower under wasmtime: the rotated shape costs a register\n" +
              "  shuffle per loop edge plus a spill of the widest loop-carried value, and the\n" +
              "  cost grades by `carried` (measured 1.00x at 1, 1.36x at 2, 2.40x at 3).\n" +
              "  FEWER is a finding, not a break — re-measure and update LOOP_TABLE +\n" +
              "  docs/internals/opt-profile-design.md §7 in the same change.\n" +
              "  A `none` row that gained a rotated loop is worse still: that is VL's own\n" +
              "  emitter regressing, and the default build has no flag to escape it.",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

for (const rel of CASES_LIST) {
  Deno.test({
    name: `native-release: ${rel} — vl build -O3 stays valid + reproduces @log`,
    ignore: !ENABLED,
    fn: async () => {
      const srcPath = new URL(rel, CASES).pathname;
      const want = logsOf(Deno.readTextFileSync(new URL(rel, CASES)));
      const tmp = await Deno.makeTempDir();
      try {
        const plain = `${tmp}/plain.wasm`;
        const rel3 = `${tmp}/rel.wasm`;
        const bp = await vl(["build", srcPath, "-o", plain]);
        if (bp.code !== 0) throw new Error(`${rel}: vl build failed: ${bp.err.trim().split("\n")[0]}`);
        // `vl build` validates the written module, so a non-zero exit here already
        // means the release profile produced something wasmtime refuses.
        const br = await vl(["build", srcPath, "-O3", "-o", rel3]);
        if (br.code !== 0) throw new Error(`${rel}: vl build -O3 failed: ${br.err.trim().split("\n")[0]}`);

        const pSize = Deno.statSync(plain).size, rSize = Deno.statSync(rel3).size;
        if (rSize <= 0) throw new Error(`${rel}: -O3 produced an empty module`);
        if (rSize > pSize) throw new Error(`${rel}: -O3 grew the module (${pSize} → ${rSize} bytes)`);

        const r = await vl(["run", rel3]);
        if (r.code !== 0) {
          throw new Error(`${rel}: vl run <rel.wasm> exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
        }
        const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(
            `${rel}: -O3 changed behavior\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// THE FEATURE-ENABLE GATE. A wasm feature that binaryen does not have enabled is
// not a missed optimization — it is a HARD FAILURE: `wasm-opt` exits 1 and writes
// no output, so the rung bails and the program cannot be built at all. That makes
// the enables a compatibility contract with whatever `compiler/*.vl` emits next,
// and `--enable-bulk-memory` and `--enable-tail-call` are both in the list AHEAD of
// the emitter producing their opcodes for exactly that reason.
//
// The fixture is `.wat`, not `.vl`, on purpose: a `.vl` tail-recursive program
// compiles to a plain `call` until the tail-call emitter slice lands, so it would
// pass with or without the enable — inert for precisely as long as the gate is the
// only thing standing between a flag edit and a broken `-O`.
//
// Both flag lists are parsed out of `main.rs` so this exercises what SHIPS. A
// rewrite that moves them elsewhere makes this test fail loudly rather than
// silently testing a stale copy.
const rustList = (src: string, name: string): string[] => {
  const m = new RegExp(`const ${name}: &\\[&str\\] = &\\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`could not find ${name} in scripts/vl-host/src/main.rs`);
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};

Deno.test({
  name: "native-release: the feature enables accept a return_call module at BOTH rungs",
  ignore: !ENABLED,
  fn: async () => {
    const mainRs = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
    const features = rustList(mainRs, "BINARYEN_FEATURES");
    if (!features.includes("--enable-tail-call")) {
      throw new Error(
        "BINARYEN_FEATURES is missing --enable-tail-call.\n" +
          "  Without it `wasm-opt` exits 1 on any module containing `return_call`\n" +
          "  and writes NO output file, so `vl build -O`/`-O3` bail on every\n" +
          "  tail-recursive program. See opt-profile-design.md §8.",
      );
    }
    const wat = `${ROOT}/tests/fixtures/opt-tailcall/tailcall.wat`;
    const tmp = await Deno.makeTempDir();
    const sh = async (bin: string, args: string[]) => {
      const { code, stderr } = await new Deno.Command(bin, { args, stdout: "piped", stderr: "piped" })
        .output();
      return { code, err: new TextDecoder().decode(stderr) };
    };
    try {
      const base = `${tmp}/tc.wasm`;
      const asm = await sh(`${ROOT}/node_modules/.bin/wasm-as`, [wat, ...features, "-o", base]);
      if (asm.code !== 0) throw new Error(`wasm-as rejected the fixture: ${asm.err.trim()}`);

      for (const [label, passes] of [
        ["-O", rustList(mainRs, "OPT_PASSES")],
        ["-O3", rustList(mainRs, "RELEASE_PASSES")],
      ] as const) {
        const out = `${tmp}/opt${label}.wasm`;
        const r = await sh(WASM_OPT, [base, ...passes, ...features, "-o", out]);
        if (r.code !== 0) {
          throw new Error(
            `${label} (${passes.join(" ")}) rejected a return_call module: ${r.err.trim()}\n` +
              "  wasm-opt writes no output on a validation failure, so this is a hard\n" +
              "  build failure for every tail-recursive program, not a lost optimization.",
          );
        }
        // The opcode must SURVIVE: an optimizer that silently rewrote it back to a
        // plain `call` would pass the exit-status check while undoing the 2.0x.
        const dis = await new Deno.Command(WASM_DIS, {
          args: [out, ...features],
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!new TextDecoder().decode(dis.stdout).includes("return_call")) {
          throw new Error(`${label} removed the return_call (the tail call did not survive)`);
        }
        const run = await vl(["run", out]);
        if (run.code !== 0 || run.out.trim() !== "5050") {
          throw new Error(`${label}: optimized module printed ${JSON.stringify(run.out)}, want "5050"`);
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// `-O3` outranks `-O` when both are passed: the release profile is a superset of
// `-O`'s effect on every measured shape, so running the shrink rung first would
// only buy a process spawn.
Deno.test({
  name: "native-release: -O3 wins over -O when both are given",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const both = await buildAndCount(src, ["-O", "-O3"], tmp);
      const only = await buildAndCount(src, ["-O3"], tmp);
      if (both.sites !== only.sites || both.sites !== 0) {
        throw new Error(
          `-O -O3 did not take the release path (sites: both=${both.sites}, -O3 alone=${only.sites}, want 0)`,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// A missing `wasm-opt` must FAIL both rungs, identically. `-O` / `-O3` are never
// implied, so reaching the optimizer means the caller asked for it, and handing back
// an unoptimized module at exit 0 makes every downstream check believe it got an
// optimized one — which has produced published `-O3` timings that were re-runs of the
// `-O0` module. The error must name the flag and say how to get binaryen.
//
// This test formerly asserted the OPPOSITE (exit 0 + a note + the unoptimized module
// on disk). The soft no-op was deliberate under webcraft P1.3, and is deliberately
// reversed here: a soft default build is worth protecting, an ignored explicit flag
// is not. A plain `vl build` never shells out to wasm-opt, so a toolchain without
// binaryen still builds everything that did not ask to be optimized.
//
// Runs with an emptied environment so neither PATH nor an ambient `$VL_WASM_OPT`
// can find a binaryen.
Deno.test({
  name: "native-release: -O/-O3 FAIL LOUDLY with no wasm-opt (never a silent no-op)",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      for (const flag of ["-O", "-O3"]) {
        const out = `${tmp}/none${flag}.wasm`;
        const { code, stderr } = await new Deno.Command(VL, {
          args: ["build", src, flag, "-o", out, "--compiler", COMPILER],
          stdout: "piped",
          stderr: "piped",
          clearEnv: true,
          env: { PATH: "" },
        }).output();
        const err = new TextDecoder().decode(stderr);
        if (code === 0) {
          throw new Error(
            `${flag} without wasm-opt exited 0 — a silently unoptimized module is exactly ` +
              `the failure this test exists to prevent; stderr was:\n${err}`,
          );
        }
        if (!err.includes(flag) || !err.includes("wasm-opt")) {
          throw new Error(
            `${flag} without wasm-opt must name the flag AND wasm-opt in its error; stderr was:\n${err}`,
          );
        }
        if (!err.includes("VL_WASM_OPT")) {
          throw new Error(
            `${flag} without wasm-opt must tell the user how to point at a binaryen; stderr was:\n${err}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// The INVERTED control for the test above: a plain `vl build` — no optimizer flag —
// must still succeed in the same wasm-opt-less environment. Without this, making the
// optimizer strict could have broken every build on a toolchain lacking binaryen and
// the suite above would still be green.
Deno.test({
  name: "native-release: a plain `vl build` still succeeds with no wasm-opt",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const out = `${tmp}/plain.wasm`;
      const { code, stderr } = await new Deno.Command(VL, {
        args: ["build", src, "-o", out, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        clearEnv: true,
        env: { PATH: "" },
      }).output();
      if (code !== 0) {
        throw new Error(
          `plain build without wasm-opt exited ${code}: ${new TextDecoder().decode(stderr).trim()}`,
        );
      }
      if (!exists(out) || Deno.statSync(out).size <= 0) {
        throw new Error(`plain build without wasm-opt left no module at ${out}`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
