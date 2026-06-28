// NATIVE `vl check <entry>` over a MODULE GRAPH — a diagnostic in an IMPORTED module
// must be attributed to THAT file, not the entry. The file label + caret context come
// from the owning module (`compiler/driver.vl`'s `diagModule` → `compiler/cli.vl`'s
// `cliDiagFile`/`cliDiagSrcLines`), resolved through the diagnostic's anchor token's
// module (`modOfTok`). Before this, a graph-compile error in `helper.vl` printed as
// `entry.vl:line:col` — correct line/col, WRONG file.
//
// GATING: same as tests/vl_check_dir_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.

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
  console.warn("[vl-check-module-diag] skipped — missing vl binary or seed wasm.");
}

const check = async (
  target: string,
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", target, "--concise", "--compiler", COMPILER],
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

Deno.test({
  name: "vl-check-module-diag: an imported module's error is labelled against THAT file",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_moddiag_" });
    try {
      // `helper.vl` has a type error on line 2; `main.vl` imports it.
      await Deno.writeTextFile(
        `${dir}/helper.vl`,
        "export function add(a: i32, b: i32): i32 { return a + b }\n" +
          "export const wrong: string = 42\n",
      );
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        'import { add } from "./helper"\n\nprint(add(1, 2))\n',
      );

      const r = await check("main.vl", dir);
      // The error is in helper.vl:2 — it must be attributed there, NOT to main.vl.
      if (!r.out.includes("helper.vl:")) {
        throw new Error(
          `expected the error attributed to helper.vl, got:\n${r.out}`,
        );
      }
      if (/main\.vl:\d+:\d+/.test(r.out)) {
        throw new Error(
          `the imported-module error was mislabelled against the entry main.vl:\n${r.out}`,
        );
      }
      // Concise form is `helper.vl: error [line:col] message`; the error is on line 2.
      if (!/helper\.vl: error \[2:/.test(r.out)) {
        throw new Error(`expected \`helper.vl: error [2:...]\`, got:\n${r.out}`);
      }
      if (r.code === 0) {
        throw new Error(`expected a non-zero exit (type error), got 0:\n${r.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
