// NATIVE `vl build -O` — the wasm-opt optimization path, gated end to end.
//
// `vl build -O` shells out to `wasm-opt` (when present) to shrink the emitted
// WasmGC module in place. This suite proves, through the native tool only, that
// the optimized output is (a) SMALLER-or-equal, (b) a valid wasm module wasmtime
// loads, and (c) BEHAVIOR-PRESERVING — `vl run <opt.wasm>` (the prebuilt-module
// passthrough) reproduces the file's `@log` lines exactly. The optimizer runs
// with EXACTLY `--enable-reference-types --enable-gc --enable-bulk-memory` (VL
// output is WasmGC; `-all` would enable post-3.0 features wasmtime refuses). Bulk
// memory is wasm 2.0 core and on by default in both engines VL targets, but
// binaryen 130 HARD-FAILS validation on `memory.copy`/`memory.fill` without the
// flag — rc=1 and no output file — so it is pinned ahead of the emitter ever
// writing those opcodes (`docs/internals/buffer-design.md` §B4). Wired here via
// `$VL_WASM_OPT` so the test is self-contained against the repo's binaryen
// (`node_modules/.bin`).
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`, shared with the alignment suite)
// AND requires the vl binary + seed wasm + a `wasm-opt`; absent any, every case
// registers ignored with a one-line how-to-build note. (No emitter bytes change —
// optimization is a post-pass on the host side — so goldens are untouched.)
//
// @test-timing opt

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const CASES = new URL("./cases/", import.meta.url);

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const haveOpt = exists(WASM_OPT);
const ENABLED = GATED && haveBin && haveSeed && haveOpt;
if (GATED && !ENABLED) {
  const why = !haveBin ? "missing vl binary" : !haveSeed ? "missing seed wasm" : "missing wasm-opt (run npm ci)";
  console.warn(
    `[native-opt] skipped — ${why}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh\n  npm ci",
  );
}

// A representative spread of @run cases (scalars, structs, strings, loops, maps).
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
    env: nativeEnv(env),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};
const sizeOf = (p: string) => Deno.statSync(p).size;

for (const rel of CASES_LIST) {
  Deno.test({
    name: `native-opt: ${rel} — vl build -O shrinks + vl run reproduces @log`,
    ignore: !ENABLED,
    fn: async () => {
      const srcPath = new URL(rel, CASES).pathname;
      const want = logsOf(Deno.readTextFileSync(new URL(rel, CASES)));
      const tmp = await Deno.makeTempDir();
      try {
        const plain = `${tmp}/plain.wasm`;
        const opt = `${tmp}/opt.wasm`;
        const bp = await vl(["build", srcPath, "-o", plain]);
        if (bp.code !== 0) throw new Error(`${rel}: vl build failed: ${bp.err.trim().split("\n")[0]}`);
        const bo = await vl(["build", srcPath, "-O", "-o", opt], { VL_WASM_OPT: WASM_OPT });
        if (bo.code !== 0) throw new Error(`${rel}: vl build -O failed: ${bo.err.trim().split("\n")[0]}`);

        // (a) optimized is a valid module, no larger than the plain build.
        const pSize = sizeOf(plain), oSize = sizeOf(opt);
        if (oSize <= 0) throw new Error(`${rel}: -O produced an empty module`);
        if (oSize > pSize) {
          throw new Error(`${rel}: -O grew the module (${pSize} → ${oSize} bytes)`);
        }

        // (b)+(c) wasmtime loads it and it behaves identically to the source.
        const r = await vl(["run", opt]);
        if (r.code !== 0) {
          throw new Error(`${rel}: vl run <opt.wasm> exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
        }
        const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(
            `${rel}: -O changed behavior\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// The host caps `wasm-opt` at four worker threads unless `$BINARYEN_CORES` says otherwise:
// binaryen's default of one per core cost plumb's units more CPU and memory for the same bytes
// (D2311). A wrapper standing in for `wasm-opt` records the value each run was handed.
Deno.test({
  name: "native-opt: -O hands wasm-opt at most four threads, and an explicit BINARYEN_CORES wins",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const log = `${tmp}/cores.log`;
      const wrap = `${tmp}/wasm-opt`;
      Deno.writeTextFileSync(
        wrap,
        `#!/bin/sh\necho "\${BINARYEN_CORES-unset}" >> "${log}"\nexec "${WASM_OPT}" "$@"\n`,
      );
      Deno.chmodSync(wrap, 0o755);
      const src = new URL("arith/ops.vl", CASES).pathname;
      const runs = async (env: Record<string, string>) => {
        try {
          Deno.removeSync(log);
        } catch { /* no earlier run */ }
        const b = await vl(["build", src, "-O", "-o", `${tmp}/o.wasm`], { VL_WASM_OPT: wrap, ...env });
        if (b.code !== 0) throw new Error(`vl build -O failed: ${b.err.trim().split("\n")[0]}`);
        return Deno.readTextFileSync(log).trim().split("\n");
      };
      if (Deno.env.get("BINARYEN_CORES") === undefined) {
        const cap = String(Math.min(4, navigator.hardwareConcurrency));
        const got = await runs({});
        if (got.some((v) => v !== cap)) {
          throw new Error(`default: want every wasm-opt run at ${cap} threads, got ${JSON.stringify(got)}`);
        }
      }
      const pinned = await runs({ BINARYEN_CORES: "2" });
      if (pinned.some((v) => v !== "2")) {
        throw new Error(`BINARYEN_CORES=2: want every run at 2, got ${JSON.stringify(pinned)}`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
