// THE MODULE-ARMING GATE, graded NATIVELY — the executor for the shared table in
// `tests/module_gate_agreement_test.ts`.
//
// `vl check <entry>` runs BOTH mirrored copies of the gate in series: the Rust
// host's inline one (`stage_program`, `scripts/vl-host/src/main.rs`) arms the
// module fetch loop, and the compiler's own (`cliNeedsModules`,
// `compiler/cli_util.vl`, inside the seed) decides whether `check` takes the
// module pipeline. So this file is what turns "the four gates agree" from a
// source-text claim into a measured one for two of the four; the pure test grades
// the shared TS copy against the same rows, and `tests/lsp_wasm_checker_test.ts`
// grades it through the seed-backed LSP.
//
// THE DISCRIMINATOR IS A DIAGNOSTIC THAT DOES NOT APPEAR. A gate that fails to arm
// does not error — it silently skips the module pipeline, and the unresolvable
// module is never looked for. So the `unresolved` rows name a module that does not
// exist and require the error; a broken gate makes them go SILENT, which is the
// exact shape the LSP shipped with (0 diagnostics where the CLI reported one).
//
// GATING: same as tests/vl_check_module_diag_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

import { GATE_CASES } from "./support/moduleGateCases.ts";

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
  console.warn("[vl-module-gate] skipped — missing vl binary or seed wasm.");
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
    // VL_STD pins std to THIS tree: agent worktrees symlink the cargo target dir
    // to the main checkout, and the host resolves `std:` from the BINARY's
    // ancestors — so without this the template rows fetch the wrong `std:fmt`.
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

Deno.test({
  name: "vl-module-gate: the native gates answer every row of the shared table",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_module_gate_" });
    const failures: string[] = [];
    try {
      for (const c of GATE_CASES) {
        if (c.native === "skip") continue;
        const entry = `${dir}/entry.vl`;
        await Deno.writeTextFile(entry, c.source);
        const r = await check("entry.vl", dir);
        const sawUnresolved = /Cannot resolve import/.test(r.out);
        if (c.native === "unresolved" && !sawUnresolved) {
          failures.push(
            `"${c.name}": the module fetch loop did not arm — expected ` +
              `\`Cannot resolve import "./nope"\`, got rc=${r.code}:\n${r.out || "  (no output)"}`,
          );
        }
        if (c.native === "clean" && r.code !== 0) {
          failures.push(`"${c.name}": expected a clean check, got rc=${r.code}:\n${r.out}`);
        }
      }
      if (failures.length > 0) {
        throw new Error(
          `the native module gates (scripts/vl-host/src/main.rs + ` +
            `compiler/cli_util.vl \`cliNeedsModules\`) disagree with the shared ` +
            `table in tests/module_gate_agreement_test.ts:\n\n` +
            failures.join("\n\n"),
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The bug in its original shape, kept as its own named row: this is what the LSP
// reported nothing for while `vl check` reported the error, and it is the case a
// reader will look for by name.
Deno.test({
  name: "vl-module-gate: a re-export of a missing module is diagnosed (#2182's arm)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_module_gate_reexp_" });
    try {
      await Deno.writeTextFile(
        `${dir}/entry.vl`,
        'export { helper } from "./nope"\nprint(1)\n',
      );
      const r = await check("entry.vl", dir);
      if (!/Cannot resolve import "\.\/nope"/.test(r.out)) {
        throw new Error(
          `expected \`Cannot resolve import "./nope"\`, got rc=${r.code}:\n` +
            (r.out || "  (no output — the fetch loop never armed)"),
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
