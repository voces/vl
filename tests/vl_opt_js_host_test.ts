// `-O` in the JS hosts (L10): the seed compiles with `setOptimized`, then
// `compiler/optHost.ts` drives the compiler's own `-O` chain on a fresh instance with
// binaryen.js answering its requests. The module it ends with must be BYTE-IDENTICAL to
// native `vl build -O` — the compiler decides every step and argv, so any difference is the
// adapter misreading `wasm-opt`'s CLI (levels, StackIR, a global flag, a pass argument).
//
// Fixtures reach each step: escape (record-result), multi-value (fresh-argument),
// inline-record and flattening (flat-melts), a loop rung, and two corpus programs that
// import std. `--names` and `--low-memory-unused=` each change both the compile and argv.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` + the vl binary + the seed + binaryen.js, which needs
// node_modules (`npm ci`) — ci-native has none, so there this file ignores itself.
//
// @test-timing opt

import { COMPILER, ROOT, STD, VL, binaryen, exists, nativeEnv } from "./support/tree.ts";
import { createWasmChecker, type Exports } from "../lsp/src/wasmChecker.ts";
import { optimizeModule, runWasmOpt, type Binaryen } from "../compiler/optHost.ts";

const WASM_OPT = binaryen("wasm-opt");

const loadBinaryen = async (): Promise<Binaryen | undefined> => {
  try {
    const m = (await import("binaryen")).default;
    // deno-lint-ignore no-explicit-any
    const b = m as any;
    return typeof b === "function" ? await b() : b;
  } catch {
    return undefined;
  }
};

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const B = GATED ? await loadBinaryen() : undefined;
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(WASM_OPT) && B !== undefined;
if (GATED && !ENABLED) {
  const why = B === undefined ? "binaryen.js (npm ci)" : "the vl binary, the seed or wasm-opt";
  console.warn(`[opt-js-host] skipped — missing ${why}.`);
}

const FIXTURES = [
  "tests/fixtures/opt-escape/record-result.vl",
  "tests/fixtures/opt-multivalue/fresh-argument.vl",
  "tests/fixtures/opt-inline/flat-melts.vl",
  "tests/fixtures/opt-loop/scalar-accum-1.vl",
  "tests/cases/strings/basics.vl",
  "tests/cases/maps/basics.vl",
];

type Variant = { flag: "-O" | "-O3"; names?: boolean; lowMemory?: number };

const VARIANTS: Variant[] = [
  { flag: "-O" },
  { flag: "-O3" },
  { flag: "-O", names: true },
  { flag: "-O3", lowMemory: 4096 },
];

const label = (v: Variant) =>
  [v.flag, v.names ? "--names" : "", v.lowMemory ? `--low-memory-unused=${v.lowMemory}` : ""]
    .filter((s) => s !== "").join(" ");

const read = (key: string): string | undefined => {
  try {
    return Deno.readTextFileSync(key.startsWith("std:") ? `${STD}/${key.slice(4)}.vl` : key);
  } catch {
    return undefined;
  }
};

const seed = ENABLED ? new WebAssembly.Module(Deno.readFileSync(COMPILER) as BufferSource) : undefined;

// The JS host's build: compile on one seed instance, optimize on a fresh one.
const jsBuild = async (path: string, v: Variant): Promise<{ emitted: Uint8Array; out: Uint8Array }> => {
  const inst = new WebAssembly.Instance(seed!, {});
  if (v.lowMemory) (inst.exports.setLowMemoryUnused as (n: number) => number)(v.lowMemory);
  const checker = createWasmChecker(() => inst.exports as unknown as Exports);
  checker.setOptimized(true);
  checker.setEmitNames(v.names === true);
  const { bytes, diagnostics } = await checker.compile(Deno.readTextFileSync(path), path, read);
  if (bytes === undefined) {
    throw new Error(`${path}: want a module, got diagnostics ${JSON.stringify(diagnostics)}`);
  }
  const fresh = new WebAssembly.Instance(seed!, {}).exports;
  const out = optimizeModule(fresh, B, bytes, {
    release: v.flag === "-O3",
    names: v.names,
    lowMemoryUnused: v.lowMemory,
  });
  return { emitted: bytes, out };
};

const nativeBuild = async (path: string, v: Variant, out: string): Promise<Uint8Array> => {
  const args = ["build", path, v.flag, "-o", out, "--compiler", COMPILER];
  if (v.names) args.push("--names");
  if (v.lowMemory) args.push(`--low-memory-unused=${v.lowMemory}`);
  const r = await new Deno.Command(VL, {
    args,
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_COMPILE_CACHE: "0" }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!r.success) {
    throw new Error(`vl ${args.join(" ")}: want exit 0, got ${r.code}\n${new TextDecoder().decode(r.stderr)}`);
  }
  return Deno.readFileSync(out);
};

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

const firstDiff = (a: Uint8Array, b: Uint8Array) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
};

Deno.test({
  name: "opt js host: the JS host's -O module is byte-identical to native vl build's",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir({ prefix: "vl-opt-js-" });
    try {
      const bad: string[] = [];
      for (const file of FIXTURES) {
        const path = `${ROOT}/${file}`;
        for (const v of VARIANTS) {
          const want = await nativeBuild(path, v, `${tmp}/native.wasm`);
          const { emitted, out } = await jsBuild(path, v);
          // A control: the comparison is of optimized modules, not of two emitter outputs.
          if (same(emitted, out)) bad.push(`${file} ${label(v)}: the JS host left the module unchanged`);
          if (!same(want, out)) {
            bad.push(
              `${file} ${label(v)}: want native's ${want.length} bytes, got ${out.length} ` +
                `(first difference at byte ${firstDiff(want, out)})`,
            );
          }
        }
      }
      if (bad.length > 0) throw new Error(bad.join("\n"));
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "opt js host: the wasm-opt emulation refuses a flag the compiler never emits",
  ignore: !ENABLED,
  fn: () => {
    const empty = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
    let got = "no error";
    try {
      runWasmOpt(B, empty, ["-Oz"]);
    } catch (e) {
      got = e instanceof Error ? e.message : String(e);
    }
    if (!got.includes("`-Oz`")) throw new Error(`want a refusal naming \`-Oz\`, got: ${got}`);
  },
});
