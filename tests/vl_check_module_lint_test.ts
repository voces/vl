// NATIVE `vl check <entry>` LINT over a MODULE GRAPH — the lint tier runs per
// resolved module (`compiler/driver.vl`'s `lintGraph`), so a finding in an
// IMPORTED module is attributed to THAT file, and `unused-import` fires in the
// importing module (the ImportDecl AST node, review N27 follow-up).
//
// Policy pinned here (compiler/cli.vl):
//   - a SINGLE-FILE target lints the whole graph: dep findings appear, labelled
//     with the dep's path;
//   - a DIRECTORY target lints each file as its own entry only, so a shared
//     dependency's findings are NOT re-reported once per importer.
//
// GATING: same as tests/vl_check_module_diag_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

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

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-module-lint] skipped — missing vl binary or seed wasm.");
}

const check = async (
  target: string,
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "check",
      target,
      "--concise",
      "--severity",
      "info",
      "--compiler",
      COMPILER,
    ],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

const HELPER = `export function add(a: i32, b: i32): i32 { return a + b }
export type Pair = { l: i32, r: i32 }
export function scale(p: Pair): i32 {
  let wasted = 3
  const f = 10
  return p.l * f + p.r
}
`;

const MAIN = `import { Pair, add, missingUse } from "./helper"

export function total(p: Pair): i32 { return add(p.l, p.r) }
`;

const setup = async (): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_modlint_" });
  await Deno.writeTextFile(`${dir}/helper.vl`, HELPER);
  await Deno.writeTextFile(`${dir}/main.vl`, MAIN);
  return dir;
};

Deno.test({
  name:
    "vl-check-module-lint: single-file check lints the whole graph with per-file attribution",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup();
    try {
      const r = await check("main.vl", dir);
      // unused-import fires in the IMPORTING module, labelled main.vl.
      if (!/main\.vl: warning \[1:\d+\] Unused import `missingUse`/.test(r.out)) {
        throw new Error(`missing unused-import in main.vl:\n${r.out}`);
      }
      // The dep's unused local + prefer-const are labelled helper.vl.
      if (!/helper\.vl: warning \[4:\d+\] Unused variable `wasted`/.test(r.out)) {
        throw new Error(`missing dep-attributed unused variable:\n${r.out}`);
      }
      // Used imports must NOT flag: `Pair` (type-only use), `add` (value use).
      if (/Unused import `Pair`|Unused import `add`/.test(r.out)) {
        throw new Error(`used import falsely flagged:\n${r.out}`);
      }
      // Warnings gate at severity info.
      if (r.code === 0) {
        throw new Error(`expected a gating exit code, got 0:\n${r.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl-check-module-lint: a directory run reports each file once (no per-importer duplicates)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup();
    try {
      const r = await check(".", dir);
      const dupes = r.out.match(/Unused variable `wasted`/g) ?? [];
      if (dupes.length !== 1) {
        throw new Error(
          `expected exactly 1 'wasted' finding (helper checked as its own entry), got ${dupes.length}:\n${r.out}`,
        );
      }
      if (!/Unused import `missingUse`/.test(r.out)) {
        throw new Error(`missing unused-import in the dir run:\n${r.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
