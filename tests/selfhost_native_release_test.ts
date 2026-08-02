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

// Build `src` at `flags`, dump the WAT, and return the surviving site count plus
// what the module prints. `--wat` runs AFTER the optimizer, so the dump is of the
// artifact being counted, not of the input.
const buildAndCount = async (src: string, flags: string[], tmp: string) => {
  const out = `${tmp}/m.wasm`;
  const b = await vl(["build", src, ...flags, "--wat", "-o", out]);
  if (b.code !== 0) {
    throw new Error(`vl build ${flags.join(" ")} failed: ${b.err.trim().split("\n")[0]}`);
  }
  const sites = allocSites(Deno.readTextFileSync(`${tmp}/m.wat`));
  const r = await vl(["run", out]);
  if (r.code !== 0) {
    throw new Error(`vl run exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
  }
  return { sites, out: r.out.length ? r.out.replace(/\n$/, "").split("\n") : [] };
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
