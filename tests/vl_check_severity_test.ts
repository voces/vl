// NATIVE `vl check --severity <level>` — the severity gate + display floor, all VL
// policy (compiler/cli.vl) driven over the command-queue pump. `--severity` does
// double duty: it gates the EXIT CODE (check fails when any diagnostic is at or
// above the level) AND filters the DISPLAYED diagnostics (only those at or above
// the floor print). Severity order high → low: error > warning > info > hint.
// Default `error` (only errors fail); with NO flag the display floor is "show
// everything" while the gate stays `error`, so warnings/hints still print.
//
// This is the native counterpart to the retired tests/cli_severity_test.ts (which
// drove the TS `compiler/cli.ts`). The TS test also poked the internal
// `severityRank`/`meetsThreshold` helpers directly; that behaviour is fully
// observable here through the exit code + displayed output, so it needs no
// separate unit. (The TS test's `run`/`build` advisory-floor cases covered the TS
// host's display policy, which the native host does not mirror, so they retire
// with cli.ts rather than port.)
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
  console.warn("[vl-check-severity] skipped — missing vl binary or seed wasm.");
}

// Run `vl check <file> --concise [flags]` against a temp file containing `source`.
// `--concise` gives a stable, grep-friendly one-line-per-diagnostic format.
// Returns the exit code + captured stderr (diagnostics print to stderr).
const check = async (
  source: string,
  flags: string[] = [],
): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_sev_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["check", file, "--concise", "--compiler", COMPILER, ...flags],
      stdout: "null",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
    }).output();
    return { code, err: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const WARNING_SRC = "let x = 1\n"; // unused top-level variable → warning
const HINT_SRC = "let _x = 1\n"; // intentionally-unused → hint
const ERROR_SRC = "let x: string = 5\n"; // type mismatch → error

// --- exit-code gating --------------------------------------------------------

Deno.test({
  name: "vl-check-severity: a warning exits 0 by default (only errors fail)",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(WARNING_SRC);
    if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: --severity error (explicit default) ignores a warning",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(WARNING_SRC, ["--severity", "error"]);
    if (code !== 0) throw new Error(`expected exit 0, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: --severity warning makes a warning fail",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(WARNING_SRC, ["--severity", "warning"]);
    if (code !== 1) throw new Error(`expected exit 1, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: --severity=warning (inline form) also fails on a warning",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(WARNING_SRC, ["--severity=warning"]);
    if (code !== 1) throw new Error(`expected inline form honoured, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: a hint does NOT gate under --severity warning",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(HINT_SRC, ["--severity", "warning"]);
    if (code !== 0) throw new Error(`expected hint below warning, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: a hint DOES gate under --severity hint",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(HINT_SRC, ["--severity", "hint"]);
    if (code !== 1) throw new Error(`expected hint to gate at hint, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: an error always fails, even by default",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(ERROR_SRC);
    if (code !== 1) throw new Error(`expected error to fail, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-severity: an unknown --severity level errors cleanly (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    const { code, err } = await check(WARNING_SRC, ["--severity", "bogus"]);
    if (code !== 2) throw new Error(`expected clean usage error (2), got ${code}`);
    if (!err.includes("invalid --severity")) {
      throw new Error(`expected an "invalid --severity" message, got:\n${err}`);
    }
  },
});

// --- display filtering: `--severity` also controls which diagnostics print ----

Deno.test({
  name: "vl-check-severity: no flag still PRINTS a warning (default shows all)",
  ignore: !ENABLED,
  fn: async () => {
    const { err } = await check(WARNING_SRC);
    if (!(err.includes("warning") && err.includes("Unused"))) {
      throw new Error(`default should display the warning, got:\n${err}`);
    }
  },
});

Deno.test({
  name: "vl-check-severity: no flag still PRINTS a hint (default shows all)",
  ignore: !ENABLED,
  fn: async () => {
    const { err } = await check(HINT_SRC);
    if (!(err.includes("hint") && err.includes("Intentionally-unused"))) {
      throw new Error(`default should display the hint, got:\n${err}`);
    }
  },
});

Deno.test({
  name: "vl-check-severity: --severity warning PRINTS a warning but HIDES a hint",
  ignore: !ENABLED,
  fn: async () => {
    const warn = await check(WARNING_SRC, ["--severity", "warning"]);
    if (!warn.err.includes("Unused")) {
      throw new Error(`--severity warning should display the warning, got:\n${warn.err}`);
    }
    // A hint sits below the `warning` floor, so it must not appear in output.
    const hint = await check(HINT_SRC, ["--severity", "warning"]);
    if (hint.err.includes("Intentionally-unused") || hint.err.includes("hint [")) {
      throw new Error(`--severity warning should hide the hint, got:\n${hint.err}`);
    }
  },
});

Deno.test({
  name: "vl-check-severity: --severity error PRINTS an error but HIDES a warning",
  ignore: !ENABLED,
  fn: async () => {
    const e = await check(ERROR_SRC, ["--severity", "error"]);
    if (!e.err.includes("error [")) {
      throw new Error(`--severity error should display the error, got:\n${e.err}`);
    }
    // The warning is below the `error` floor: gated out AND filtered from display.
    const w = await check(WARNING_SRC, ["--severity", "error"]);
    if (w.err.includes("Unused") || w.err.includes("warning [")) {
      throw new Error(`--severity error should hide the warning, got:\n${w.err}`);
    }
  },
});

Deno.test({
  name: "vl-check-severity: --severity hint shows everything (hint is the floor)",
  ignore: !ENABLED,
  fn: async () => {
    const { err } = await check(HINT_SRC, ["--severity", "hint"]);
    if (!err.includes("Intentionally-unused")) {
      throw new Error(`--severity hint should still display the hint, got:\n${err}`);
    }
  },
});
