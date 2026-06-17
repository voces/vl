// NATIVE `vl check --fix` — the lint auto-fix, computed and applied in VL
// (compiler/cli.vl) and written back via the command-queue pump (CMD_WRITE_FILE).
// Exactly ONE fix, the only one that is always correct with no human judgment:
//   prefer-const → `let` becomes `const`.
// `--fix` deliberately does NOT touch unused variables OR parameters: the
// `_`-prefix silences a warning, and whether that's right depends on intent
// (genuinely-unused vs forgotten-after-refactor), so it stays a human choice.
// The lint still reports them.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.

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
if (GATED && !ENABLED) console.warn("[vl-check-fix] skipped — missing vl binary or seed wasm.");

const fix = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--fix", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

Deno.test({
  name: "vl-check-fix: applies prefer-const only; leaves unused var/param (still reported); idempotent",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_fix_" });
    try {
      const f = `${dir}/a.vl`;
      const before =
        "function f(a: i32, b: i32): i32 { b }\nlet unusedLocal = 1\nlet keep = 2\nprint(f(keep, keep))\n";
      await Deno.writeTextFile(f, before);
      const r = await fix(f);
      if (r.code !== 0) throw new Error(`--fix exited ${r.code}:\n${r.err}`);
      // Only `let keep` → `const keep`. The unused param `a` and unused local are
      // untouched.
      const want =
        "function f(a: i32, b: i32): i32 { b }\nlet unusedLocal = 1\nconst keep = 2\nprint(f(keep, keep))\n";
      const after = await Deno.readTextFile(f);
      if (after !== want) throw new Error(`unexpected fixed source:\n${after}`);
      // The unused param + local are still reported, and nothing more is applied.
      const r2 = await fix(f);
      if (r2.code !== 0 || r2.err.includes("Applied")) {
        throw new Error(`expected idempotent re-run, got ${r2.code}:\n${r2.err}`);
      }
      if (
        !r2.err.includes("Unused parameter `a`") ||
        !r2.err.includes("Unused variable `unusedLocal`")
      ) {
        throw new Error(`expected unused param + local still reported:\n${r2.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
