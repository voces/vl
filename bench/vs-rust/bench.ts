// bench/vs-rust/bench.ts — the standing "match Rust" scoreboard: six kernels (k.vl / k.rs,
// written by plumb as PL-037 and shared with this project for exactly this purpose), built with
// the CURRENT `vl` and with Rust, run in the same V8 (Deno) process, best of N, and reported as
// ns/unit and the ratio VL/Rust. See README.md for the methodology and how to read `--check`.
//
// Usage (from the repo root):
//   deno run --allow-read --allow-run --allow-write --allow-env bench/vs-rust/bench.ts
//   deno run -A bench/vs-rust/bench.ts --json
//   deno run -A bench/vs-rust/bench.ts --check
//   deno run -A bench/vs-rust/bench.ts --reps 9 --vl /path/to/vl
//
// Rust: if `rustc` has the `wasm32-wasip1` target, it is rebuilt fresh into a temp file (so a
// local toolchain change is reflected); otherwise the COMMITTED bench/vs-rust/k-rs.wasm is used,
// and its provenance (rustc version, build date, exact command) is read from
// k-rs.build-info.json rather than assumed. `--no-rustc` forces the committed path even when a
// toolchain is present, for testing that path or for a stable A/B against `vl` changes alone.
import { vlHostImports } from "../../compiler/vlHostImports.ts";

const DIR = new URL(".", import.meta.url);

type KernelName = "hash" | "matChain" | "sort" | "mix" | "array" | "map";

/** One kernel: its exported name, the argument tuple both k.vl and k.rs's export take, and the
 * "unit" count (calls × inner iterations) ns/op is divided by — matching plumb's bench.ts. */
type Kernel = { name: KernelName; args: number[]; units: number };

const KERNELS: Kernel[] = [
  { name: "hash", args: [500, 20000], units: 500 * 20000 },
  { name: "matChain", args: [300000], units: 300000 },
  { name: "sort", args: [1000000], units: 1000000 },
  { name: "mix", args: [20000000], units: 20000000 },
  { name: "array", args: [1000000], units: 21000000 },
  { name: "map", args: [200000], units: 2200000 },
];

type Opts = {
  reps: number;
  json: boolean;
  check: boolean;
  writeBaseline: boolean;
  vl?: string;
  rustc: string;
  noRustc: boolean;
};

const parseArgs = (argv: string[]): Opts => {
  const opts: Opts = { reps: 5, json: false, check: false, writeBaseline: false, rustc: "rustc", noRustc: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const [flag, inlineVal] = eq >= 0 ? [a.slice(0, eq), a.slice(eq + 1)] : [a, undefined];
    const next = () => inlineVal !== undefined ? inlineVal : argv[++i];
    switch (flag) {
      case "--reps":
        opts.reps = Math.max(1, parseInt(next(), 10));
        break;
      case "--json":
        opts.json = true;
        break;
      case "--check":
        opts.check = true;
        break;
      case "--write-baseline":
        opts.writeBaseline = true;
        break;
      case "--vl":
        opts.vl = next();
        break;
      case "--rustc":
        opts.rustc = next();
        break;
      case "--no-rustc":
        opts.noRustc = true;
        break;
      default:
        throw new Error(`unknown flag: ${flag}`);
    }
  }
  return opts;
};

/** Locate the `vl` binary: an explicit `--vl`/`VL` env override, else the dev binary at its
 * usual worktree-relative path (the convention every other `scripts/*.sh` gate uses), else
 * `dist/vl`, else whatever `vl` resolves to on PATH. */
const findVl = async (explicit?: string): Promise<string> => {
  if (explicit) return explicit;
  const envVl = Deno.env.get("VL");
  if (envVl) return envVl;
  const candidates = [
    new URL("../../scripts/vl-host/target/release/vl", DIR).pathname,
    new URL("../../dist/vl", DIR).pathname,
  ];
  for (const c of candidates) {
    try {
      await Deno.stat(c);
      return c;
    } catch {
      // not there — try the next candidate
    }
  }
  return "vl";
};

const runCmd = async (
  cmd: string,
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const command = new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" });
  let output: Deno.CommandOutput;
  try {
    output = await command.output();
  } catch (e) {
    return { code: -1, stdout: "", stderr: `failed to spawn ${cmd}: ${e instanceof Error ? e.message : String(e)}` };
  }
  return {
    code: output.code,
    stdout: new TextDecoder().decode(output.stdout),
    stderr: new TextDecoder().decode(output.stderr),
  };
};

/** True when `rustc` exists and its target list carries `wasm32-wasip1` — the same check the
 * build step needs, done up front so a missing toolchain falls back once, quietly. */
const haveRustcWasm32 = async (rustc: string): Promise<boolean> => {
  const { code, stdout } = await runCmd(rustc, ["--print", "target-list"]);
  return code === 0 && stdout.includes("wasm32-wasip1");
};

const rustcVersionOf = async (rustc: string): Promise<string> => {
  const { code, stdout } = await runCmd(rustc, ["--version"]);
  return code === 0 ? stdout.trim() : "(unknown rustc version)";
};

/** Builds k.vl with plumb's PL-037 repro flags: `--import-memory` so bench.ts can supply one
 * shared `WebAssembly.Memory` to both modules, and a heap window wide enough for k.vl's `D`
 * data address — none of the kernels call `Buffer()`, so heap-base/limit are inert here, kept
 * only so the build command matches the filed repro exactly. */
const buildVl = async (vl: string, out: string): Promise<void> => {
  const src = new URL("k.vl", DIR).pathname;
  const { code, stderr } = await runCmd(vl, [
    "build",
    src,
    "--import-memory",
    "--heap-base=0x100000",
    "--heap-limit=0x8000000",
    "-O",
    "-o",
    out,
  ]);
  if (code !== 0) throw new Error(`vl build failed (rc ${code}):\n${stderr}`);
};

const buildRust = async (rustc: string, out: string): Promise<void> => {
  const src = new URL("k.rs", DIR).pathname;
  const { code, stderr } = await runCmd(rustc, [
    "--edition",
    "2021",
    "--target",
    "wasm32-wasip1",
    "--crate-type",
    "cdylib",
    "-C",
    "opt-level=3",
    "-C",
    "panic=abort",
    src,
    "-o",
    out,
  ]);
  if (code !== 0) throw new Error(`rustc build failed (rc ${code}):\n${stderr}`);
};

type RustSource = { path: string; describe: string };

/** Resolves the Rust side to a wasm file: fresh from source when `rustc` has the wasm32 target
 * and `--no-rustc` was not passed, otherwise the committed prebuilt, whose provenance comes
 * from k-rs.build-info.json rather than being asserted here. */
const resolveRust = async (opts: Opts, workDir: string): Promise<RustSource> => {
  if (!opts.noRustc && await haveRustcWasm32(opts.rustc)) {
    const out = `${workDir}/k-rs.wasm`;
    await buildRust(opts.rustc, out);
    const version = await rustcVersionOf(opts.rustc);
    return { path: out, describe: `built fresh with ${version}` };
  }
  const path = new URL("k-rs.wasm", DIR).pathname;
  const infoPath = new URL("k-rs.build-info.json", DIR).pathname;
  const info = JSON.parse(await Deno.readTextFile(infoPath)) as {
    rustcVersion: string;
    date: string;
  };
  return {
    path,
    describe: `committed prebuilt (built with ${info.rustcVersion} on ${info.date})`,
  };
};

type VlExports = Record<KernelName, (...a: number[]) => number>;

const loadVlModule = async (path: string): Promise<VlExports> => {
  const memory = new WebAssembly.Memory({ initial: 0x1000, maximum: 65536 });
  const bytes = await Deno.readFile(path);
  const { instance } = await WebAssembly.instantiate(bytes, {
    env: { memory },
    imports: vlHostImports([]).imports,
  });
  return instance.exports as unknown as VlExports;
};

const loadRustModule = async (path: string): Promise<VlExports> => {
  // k.rs's exports never call back into the host: `preview1` needs no real implementation.
  const stub = new Proxy({}, { get: () => () => 0 });
  const bytes = await Deno.readFile(path);
  const { instance } = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: stub });
  return instance.exports as unknown as VlExports;
};

/** Calls `f(...args)` `reps` times and keeps the best (minimum) wall time — the noise on a
 * shared box only ever adds time, so the min is the closest single number gets to the kernel's
 * true cost. Returns the kernel's own last-computed value alongside it, for the agreement
 * check: every rep of a pure kernel returns the same value, so the last one is as good as any. */
const timeBest = (
  f: (...a: number[]) => number,
  args: number[],
  reps: number,
): [ms: number, result: number] => {
  let best = Infinity;
  let result = 0;
  for (let k = 0; k < reps; k++) {
    const t0 = performance.now();
    result = f(...args);
    const dt = performance.now() - t0;
    if (dt < best) best = dt;
  }
  return [best, result];
};

type Row = {
  name: KernelName;
  nsVl: number;
  nsRust: number;
  ratio: number;
  agree: boolean;
  vlResult: number;
  rustResult: number;
};

type Baseline = { commit: string; date: string; ratios: Record<string, number> };

const printTable = (rows: Row[], vl: string, rustDescribe: string, reps: number): void => {
  console.log(`vl:    ${vl}`);
  console.log(`rust:  ${rustDescribe}`);
  console.log(`reps:  best of ${reps}`);
  console.log("");
  const nameW = Math.max(...rows.map((r) => r.name.length), 4);
  for (const r of rows) {
    const flag = r.agree ? "" : `  MISMATCH vl=${r.vlResult} rust=${r.rustResult}`;
    console.log(
      `${r.name.padEnd(nameW)}  vl ${r.nsVl.toFixed(2).padStart(8)} ns  rust ${r.nsRust.toFixed(2).padStart(8)} ns  vl/rust ${r.ratio.toFixed(2)}${flag}`,
    );
  }
};

const printCheck = (rows: Row[], baseline: Baseline): void => {
  console.log("");
  console.log(`--check against baseline.json (commit ${baseline.commit}, ${baseline.date})`);
  console.log("informational only — this is not a gate; timing on a shared box is noisy.");
  for (const r of rows) {
    const base = baseline.ratios[r.name];
    if (base === undefined) {
      console.log(`${r.name.padEnd(9)}  no baseline entry`);
      continue;
    }
    const deltaPct = ((r.ratio - base) / base) * 100;
    const sign = deltaPct >= 0 ? "+" : "";
    console.log(
      `${r.name.padEnd(9)}  baseline ${base.toFixed(2)}  now ${r.ratio.toFixed(2)}  (${sign}${deltaPct.toFixed(1)}%)`,
    );
  }
};

const writeBaseline = async (rows: Row[]): Promise<void> => {
  const path = new URL("baseline.json", DIR).pathname;
  const { code, stdout } = await runCmd("git", ["rev-parse", "--short=9", "HEAD"]);
  const commit = code === 0 ? stdout.trim() : "(unknown)";
  const baseline: Baseline & { _comment: string } = {
    _comment:
      "Standing scoreboard for the 'match Rust' target, written by bench.ts --write-baseline. Not a gate (bench.ts --check only prints deltas against it) — this box is shared and timing is noisy; read the ratios' trend, not a single run.",
    commit,
    date: new Date().toISOString().slice(0, 10),
    ratios: Object.fromEntries(rows.map((r) => [r.name, Number(r.ratio.toFixed(2))])),
  };
  await Deno.writeTextFile(path, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`wrote ${path}`);
};

const main = async (): Promise<void> => {
  const opts = parseArgs(Deno.args);
  const vl = await findVl(opts.vl);
  const workDir = await Deno.makeTempDir({ prefix: "vl-vs-rust-" });
  try {
    const vlWasmPath = `${workDir}/k-vl.wasm`;
    await buildVl(vl, vlWasmPath);
    const rust = await resolveRust(opts, workDir);

    const vlMod = await loadVlModule(vlWasmPath);
    const rustMod = await loadRustModule(rust.path);

    const rows: Row[] = [];
    let anyMismatch = false;
    for (const k of KERNELS) {
      const [tVl, vlResult] = timeBest(vlMod[k.name], k.args, opts.reps);
      const [tRust, rustResult] = timeBest(rustMod[k.name], k.args, opts.reps);
      const nsVl = (tVl * 1e6) / k.units;
      const nsRust = (tRust * 1e6) / k.units;
      const agree = vlResult === rustResult;
      if (!agree) anyMismatch = true;
      rows.push({ name: k.name, nsVl, nsRust, ratio: nsVl / nsRust, agree, vlResult, rustResult });
    }

    if (opts.json) {
      console.log(JSON.stringify({ vl, rust: rust.describe, reps: opts.reps, rows }, null, 2));
    } else {
      printTable(rows, vl, rust.describe, opts.reps);
    }

    if (opts.check) {
      const baselinePath = new URL("baseline.json", DIR).pathname;
      const baseline = JSON.parse(await Deno.readTextFile(baselinePath)) as Baseline;
      printCheck(rows, baseline);
    }

    if (opts.writeBaseline) {
      await writeBaseline(rows);
    }

    if (anyMismatch) {
      console.error("");
      console.error("MISMATCH: VL and Rust disagree on at least one kernel's result (see above) — this is a correctness bug, not noise.");
      Deno.exit(1);
    }
  } finally {
    await Deno.remove(workDir, { recursive: true }).catch(() => {});
  }
};

await main();
