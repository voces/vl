// NATIVE `vl check` / `vl fmt` STRICT ARG PARSING — usage errors are VL policy
// (compiler/cli.vl cliParseArgs) driven over the command-queue pump. An unknown
// flag or a second positional argument exits 2 with a usage message instead of
// being silently ignored (`vl check a.vl b.vl` must not quietly check only
// `a.vl`), and a value-taking flag never swallows the host-injected trailing
// `--color=<v>` as its value.
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
  console.warn("[vl-check-args] skipped — missing vl binary or seed wasm.");
}

// Run `vl <args>` with a clean, valid probe file available for positional use.
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

// A tiny valid file to point the positional args at.
const withProbe = async (
  fn: (file: string, dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_args_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, "print(1)\n");
  try {
    await fn(file, dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "check: a second positional argument is a usage error (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      const other = `${dir}/other.vl`;
      await Deno.writeTextFile(other, "print(2)\n");
      const { code, err } = await run(["check", file, other]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("unexpected extra argument")) {
        throw new Error(`expected extra-argument usage error, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "check: an unknown flag is a usage error (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const { code, err } = await run(["check", file, "--frobnicate"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("unknown flag `--frobnicate`")) {
        throw new Error(`expected unknown-flag usage error, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name:
    "check: a trailing valueless --severity errors instead of swallowing the host's --color",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // The host appends a synthetic `--color=<v>` AFTER user args; a bare
      // `--severity` must not consume it as its value.
      const { code, err } = await run(["check", file, "--severity"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("--severity requires a value")) {
        throw new Error(`expected severity-value usage error, got: ${err}`);
      }
      if (err.includes("--color")) {
        throw new Error(`--severity swallowed the injected --color: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "fmt: a check-only flag is a usage error (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const { code, err } = await run(["fmt", file, "--fix"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("fmt: unknown flag `--fix`")) {
        throw new Error(`expected fmt unknown-flag usage error, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "check: valid flags still parse (severity value, exclude value)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const ok = await run(["check", file, "--severity", "warning"]);
      if (ok.code !== 0) {
        throw new Error(`expected exit 0, got ${ok.code}: ${ok.err}`);
      }
      const eq = await run(["check", file, "--severity=warning"]);
      if (eq.code !== 0) {
        throw new Error(`expected exit 0, got ${eq.code}: ${eq.err}`);
      }
    });
  },
});
