// NATIVE `vl check` hygiene — CLI robustness fixes that are VL policy
// (compiler/cli.vl, cli_util.vl, driver.vl):
//   - `--exclude` glob matching is an iterative dynamic program: adversarial
//     `*a*a*a…` patterns finish instantly instead of exponentially backtracking;
//   - the import-chain DFS is depth-capped with a REAL diagnostic instead of an
//     opaque wasm stack-overflow trap;
//   - a trailing `/` on the target is normalized, so dir-mode labels never
//     render `dir//file.vl`.
//
// GATING: same as tests/vl_check_args_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
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
  console.warn("[vl-check-hygiene] skipped — missing vl binary or seed wasm.");
}

const run = async (
  args: string[],
): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "null",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

const withDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_hygiene_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "check: an adversarial --exclude glob completes (no exponential backtrack)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      // 60 `a`s against `*a*a…*ab`: exponential for backtracking recursion,
      // instant for the DP. The pattern must also NOT match (trailing `b`).
      await Deno.writeTextFile(`${dir}/${"a".repeat(60)}.vl`, "print(1)\n");
      const started = Date.now();
      const { code, err } = await run([
        "check",
        dir,
        "--exclude",
        "*a*a*a*a*a*a*a*a*a*a*a*a*a*a*ab",
      ]);
      const elapsed = Date.now() - started;
      if (code !== 0) throw new Error(`expected exit 0, got ${code}: ${err}`);
      if (!err.includes("Checked 1 file")) {
        throw new Error(`the non-matching pattern must not exclude: ${err}`);
      }
      // Generous bound — the old recursion needed ~2^30 steps here.
      if (elapsed > 30_000) {
        throw new Error(`glob match took ${elapsed}ms — backtracking regression`);
      }
    });
  },
});

Deno.test({
  name: "check: --exclude glob semantics hold (`*` stops at `/`, `**` crosses)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      await Deno.mkdir(`${dir}/tests/deep`, { recursive: true });
      await Deno.writeTextFile(`${dir}/a.vl`, "print(1)\n");
      await Deno.writeTextFile(`${dir}/tests/deep/d.vl`, "print(1)\n");
      // `te*p` cannot cross the separator — nothing is excluded.
      const single = await run(["check", dir, "--exclude", "te*p"]);
      if (!single.err.includes("Checked 2 files")) {
        throw new Error(`\`*\` must not cross \`/\`: ${single.err}`);
      }
      // `te**p` crosses it — the subtree is pruned.
      const double = await run(["check", dir, "--exclude", "te**p"]);
      if (!double.err.includes("Checked 1 file,")) {
        throw new Error(`\`**\` must cross \`/\`: ${double.err}`);
      }
      // Anchoring: a bare dir name gates the dir and everything beneath it.
      const subtree = await run(["check", dir, "--exclude", "tests"]);
      if (!subtree.err.includes("Checked 1 file,")) {
        throw new Error(`\`tests\` must prune its subtree: ${subtree.err}`);
      }
    });
  },
});

Deno.test({
  name: "check: a too-deep import chain is a positioned diagnostic, not a trap",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const n = 300; // past the 256 cap
      for (let i = 0; i < n; i++) {
        const src = i === n - 1
          ? `export const v${i} = 0\n`
          : `import { v${i + 1} } from "./f${i + 1}"\nexport const v${i} = v${
            i + 1
          } + 1\n`;
        await Deno.writeTextFile(`${dir}/f${i}.vl`, src);
      }
      const { code, err } = await run(["check", `${dir}/f0.vl`]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${err}`);
      if (!err.includes("Import chain exceeds the maximum depth")) {
        throw new Error(`expected the depth-cap diagnostic, got: ${err}`);
      }
      // The diagnostic is positioned at the offending import, in its module.
      if (!err.includes("f256.vl:1:")) {
        throw new Error(`expected the anchor at f256.vl's import, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "check: a trailing slash on the target never labels `dir//file.vl`",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      await Deno.writeTextFile(`${dir}/a.vl`, "let x = 1\nprint(x)\n");
      const { code, err } = await run([
        "check",
        `${dir}/`,
        "--severity",
        "info",
        "--concise",
      ]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${err}`);
      if (err.includes("//")) {
        throw new Error(`double slash in a file label: ${err}`);
      }
      if (!err.includes(`${dir}/a.vl`)) {
        throw new Error(`expected the normalized label, got: ${err}`);
      }
    });
  },
});
