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
// (4) THE FEATURE ENABLES ACCEPT WHAT THE EMITTER WILL PRODUCE. `BINARYEN_FEATURES`
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
  // `union-box-branch-local` writes a `let` on two branches INSIDE one function. Those two
  // sites never reach the return path, so the sink does not see them and this row is
  // unmoved — it is the pin for the phase-2 slice (`unboxed-union-rep-design.md` §6).
  { fixture: "union-box-branch-local", none: 4, O: 4, O3: 2 },
  { fixture: "list-wrapper-push", none: 6, O: 3, O3: 2 },
  // `union-box-call` with its payload READ instead of discarded. The read still blocks the
  // melt at two sites — that is what `opt-profile-design.md` §3 item 0 measured — but the
  // producer now has one site, and the two survivors at `-O`/`-O3` are the PAYLOAD
  // allocations (the data), not the box (the overhead).
  { fixture: "union-box-payload-read", none: 3, O: 2, O3: 2 },
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
  { fixture: "binsearch-probe", none: [6, 3, 8], O: [3, 3, 6], O3: [3, 3, 6] },
];

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

// A missing `wasm-opt` must degrade the same way for both rungs: exit 0, a note
// naming the flag on stderr, and the UNOPTIMIZED module left on disk (not a
// half-written one). Runs with an emptied environment so neither PATH nor an
// ambient `$VL_WASM_OPT` can find a binaryen.
Deno.test({
  name: "native-release: -O3 is a soft no-op with no wasm-opt (same as -O)",
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
        if (code !== 0) throw new Error(`${flag} without wasm-opt exited ${code}: ${err.trim()}`);
        if (!err.includes(`note: ${flag} requested but no \`wasm-opt\``)) {
          throw new Error(`${flag} without wasm-opt printed no note; stderr was:\n${err}`);
        }
        if (!exists(out) || Deno.statSync(out).size <= 0) {
          throw new Error(`${flag} without wasm-opt left no module at ${out}`);
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
