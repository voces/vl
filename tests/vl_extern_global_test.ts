// `extern let` / `extern const` AND THE ENTRY MODULE'S `export let` — imported and exported wasm
// globals (plumb PL-003(b)). The facts a `tests/cases/` fixture cannot assert:
//
//   1. THE IMPORT AND EXPORT SECTIONS. An extern global is a `global` import in the `extern`
//      namespace, one per NAME across modules; an entry module's scalar `export let`/`export
//      const` is a `global` export, and a non-scalar one is not exported at all.
//   2. A HOST-PROVIDED `WebAssembly.Global` IS THE CELL, not a snapshot: the program sees a
//      write the host makes between two reads (from top level, a function and a closure), and
//      the host sees every write the program makes.
//   3. SEPARATELY BUILT UNITS SHARE ONE GLOBAL — through V8 (one instance's exports as the
//      next one's `extern` imports), through `wasm-merge` plus `-O3`, and through a merge whose
//      `extern` is a generated facade re-exporting each name from its unit. Mutability is part of
//      the link: an `extern let` against an `export const` is a link error.
//   4. `vl run` PROVIDES NO GLOBALS and refuses at load, naming the global.
//
// GATING is the usual one (`SELFHOST_NATIVE_ALIGN=1` + binary + seed). The `wasm-merge` and
// `wasm-dis` half needs `node_modules/.bin`, which `ci-native` does not install, so it
// self-ignores there; the `ci-release-shape` job names this file and runs it with npm deps.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";
import { vlHostImports } from "../compiler/vlHostImports.ts";

const STD = `${ROOT}/std`;
const CASES = `${ROOT}/tests/cases/extern`;
const BIN = `${ROOT}/node_modules/.bin`;
const FEATURES = [
  "--enable-reference-types",
  "--enable-gc",
  "--enable-bulk-memory",
  "--enable-tail-call",
  "--enable-simd",
];

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
const TOOLS = ENABLED &&
  ["wasm-merge", "wasm-opt", "wasm-as", "wasm-dis"].every((t) => exists(`${BIN}/${t}`));
if (GATED && !ENABLED) {
  console.warn("[vl-extern-global] skipped — missing vl binary or seed wasm.");
}

type Ran = { code: number; out: string; err: string };

const exec = async (cmd: string, args: string[]): Promise<Ran> => {
  const { code, stdout, stderr } = await new Deno.Command(cmd, {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: STD },
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

const mustExec = async (cmd: string, args: string[]): Promise<string> => {
  const r = await exec(cmd, args);
  if (r.code !== 0) {
    throw new Error(`\`${cmd} ${args.join(" ")}\` exited ${r.code}\n${r.err}`);
  }
  return r.out;
};

const withDir = async (f: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_extern_global_" });
  try {
    await f(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

/** Build `src` (a path) to `<dir>/<name>.wasm`, answering the output path. */
const build = async (dir: string, src: string, name: string): Promise<string> => {
  const out = `${dir}/${name}.wasm`;
  await mustExec(VL, ["build", src, "-o", out, "--compiler", COMPILER]);
  return out;
};

const expectEq = (what: string, got: unknown, want: unknown): void => {
  const g = JSON.stringify(got, (_k, v) => typeof v === "bigint" ? `${v}n` : v);
  const w = JSON.stringify(want, (_k, v) => typeof v === "bigint" ? `${v}n` : v);
  if (g !== w) throw new Error(`${what}: want ${w}, got ${g}`);
};

const EXPORT_UNIT = `${CASES}/global-export.vl`;
const IMPORT_UNIT = `${CASES}/global-import-from-unit.vl`;
// `global-export.vl`'s start prints 0,1; the importer then prints 1, 2 and 2 + width + 1.
const LINKED_LOGS = "0,1,1,2,11";

Deno.test({
  name: "extern global: imports fold to one `global` entry per name across modules",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      const w = await build(dir, `${CASES}/global-two-modules/entry.vl`, "entry");
      const mod = new WebAssembly.Module(await Deno.readFile(w));
      const globals = WebAssembly.Module.imports(mod).filter((i) => i.kind === "global");
      expectEq(
        "global imports",
        globals.map((i) => `${i.module}.${i.name}`),
        ["extern.rax", "extern.rbx"],
      );
    }),
});

Deno.test({
  name: "extern global: an entry module's scalar `export let`/`export const` is a global export",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      const w = await build(dir, EXPORT_UNIT, "a");
      const mod = new WebAssembly.Module(await Deno.readFile(w));
      expectEq(
        "exports",
        WebAssembly.Module.exports(mod).map((e) => `${e.name}:${e.kind}`).sort(),
        ["incr:function", "rax:global", "width:global", "zf:global"],
      );
      const logs: string[] = [];
      const inst = new WebAssembly.Instance(mod, { imports: vlHostImports(logs).imports });
      const rax = inst.exports.rax as WebAssembly.Global;
      const width = inst.exports.width as WebAssembly.Global;
      expectEq("rax after start", rax.value, 1n);
      (inst.exports.incr as () => void)();
      expectEq("rax after incr", rax.value, 2n);
      expectEq("width", width.value, 8);
      let threw = false;
      try {
        width.value = 9;
      } catch {
        threw = true;
      }
      expectEq("`export const` is immutable", threw, true);
    }),
});

Deno.test({
  name: "extern global: a host WebAssembly.Global is the cell — reads see host writes",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      const w = await build(dir, `${CASES}/global-register-file.vl`, "rf");
      const rax = new WebAssembly.Global({ value: "i64", mutable: true }, 40n);
      const zf = new WebAssembly.Global({ value: "i32", mutable: true }, 0);
      const width = new WebAssembly.Global({ value: "i32", mutable: false }, 8);
      const scale = new WebAssembly.Global({ value: "f64", mutable: true }, 0.5);
      const ratio = new WebAssembly.Global({ value: "f32", mutable: true }, 0.25);
      const logs: string[] = [];
      const inst = new WebAssembly.Instance(new WebAssembly.Module(await Deno.readFile(w)), {
        imports: vlHostImports(logs).imports,
        extern: {
          rax,
          zf,
          width,
          scale,
          ratio,
          // A host write between two of the program's reads.
          tick: () => {
            rax.value = rax.value + 100n;
          },
        },
      });
      expectEq("logs", logs.join(","), "40,41,141,150,true,16,2,0.75");
      expectEq("rax read back", rax.value, 150n);
      expectEq("zf read back", zf.value, 1);
      expectEq("scale read back", scale.value, 2);
      rax.value = 7n;
      expectEq("peek after a host write", (inst.exports.peek as () => bigint)(), 7n);
    }),
});

/** Instantiate each unit against the exports of the ones before it; the logs, in order. */
const linkV8 = async (wasms: string[]): Promise<string> => {
  const logs: string[] = [];
  const { imports } = vlHostImports(logs);
  const ext: WebAssembly.ModuleImports = {};
  for (const w of wasms) {
    const mod = new WebAssembly.Module(await Deno.readFile(w));
    const inst = new WebAssembly.Instance(mod, { imports, extern: ext });
    Object.assign(ext, inst.exports);
  }
  return logs.join(",");
};

Deno.test({
  name: "extern global: two separately built units share one global through V8",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      const a = await build(dir, EXPORT_UNIT, "a");
      const b = await build(dir, IMPORT_UNIT, "b");
      expectEq("V8 link", await linkV8([a, b]), LINKED_LOGS);
      // Mutability is part of the import: `extern let width` cannot take an `export const`.
      await Deno.writeTextFile(`${dir}/c.vl`, "extern let width: i32\nprint(width)\n");
      const c = await build(dir, `${dir}/c.vl`, "c");
      let err = "";
      try {
        await linkV8([a, c]);
      } catch (e) {
        err = String(e);
      }
      if (!/LinkError/.test(err) || !/width/.test(err)) {
        throw new Error(`want a LinkError naming width, got ${err || "a clean link"}`);
      }
    }),
});

Deno.test({
  name: "extern global: wasm-merge links the units, -O3 keeps them, and the import is used directly",
  ignore: !TOOLS,
  fn: () =>
    withDir(async (dir) => {
      const a = await build(dir, EXPORT_UNIT, "a");
      const b = await build(dir, IMPORT_UNIT, "b");
      // Every access is a `global.get`/`global.set` on the import itself, with no wrapper.
      const dis = await mustExec(`${BIN}/wasm-dis`, [b]);
      for (const want of ["(global.get $gimport$0)", "(global.set $gimport$0"]) {
        if (!dis.includes(want)) throw new Error(`want \`${want}\` in wasm-dis of b:\n${dis}`);
      }
      const merged = `${dir}/merged.wasm`;
      await mustExec(`${BIN}/wasm-merge`, [a, "extern", b, "b", ...FEATURES, "-o", merged]);
      const run = async (w: string): Promise<string> => {
        const logs: string[] = [];
        const mod = new WebAssembly.Module(await Deno.readFile(w));
        const left = WebAssembly.Module.imports(mod).filter((i) => i.module === "extern");
        expectEq(`${w} unresolved extern imports`, left.length, 0);
        new WebAssembly.Instance(mod, { imports: vlHostImports(logs).imports });
        return logs.join(",");
      };
      expectEq("merged", await run(merged), LINKED_LOGS);
      const opt = `${dir}/merged.O3.wasm`;
      await mustExec(`${BIN}/wasm-opt`, [merged, ...FEATURES, "-O3", "-o", opt]);
      expectEq("merged -O3", await run(opt), LINKED_LOGS);

      // The facade recipe (`cli-design.md`): a generated module NAMED `extern` imports each
      // name from its defining unit and re-exports it, so no unit has to be named `extern`.
      // An imported mutable global re-exported through it still resolves to the one cell.
      await Deno.writeTextFile(
        `${dir}/facade.wat`,
        `(module
  (import "a" "rax" (global $rax (mut i64)))
  (import "a" "width" (global $width i32))
  (import "a" "incr" (func $incr))
  (export "rax" (global $rax))
  (export "width" (global $width))
  (export "incr" (func $incr)))
`,
      );
      const facade = `${dir}/facade.wasm`;
      await mustExec(`${BIN}/wasm-as`, [`${dir}/facade.wat`, ...FEATURES, "-o", facade]);
      const viaFacade = `${dir}/facade-merged.wasm`;
      await mustExec(`${BIN}/wasm-merge`, [
        facade,
        "extern",
        a,
        "a",
        b,
        "b",
        "--rename-export-conflicts",
        ...FEATURES,
        "-o",
        viaFacade,
      ]);
      expectEq("merged through the facade", await run(viaFacade), LINKED_LOGS);
    }),
});

Deno.test({
  name: "extern global: `vl run` refuses a module that imports a global, naming it",
  ignore: !ENABLED,
  fn: () =>
    withDir(async (dir) => {
      await Deno.writeTextFile(`${dir}/g.vl`, "extern let rax: i64\nprint(rax)\n");
      const r = await exec(VL, ["run", `${dir}/g.vl`, "--compiler", COMPILER]);
      if (r.code === 0 || !r.err.includes("`rax`")) {
        throw new Error(`want a non-zero exit naming \`rax\`, got ${r.code}: ${r.err}`);
      }
    }),
});
