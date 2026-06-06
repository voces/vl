// Tests for `vl check --severity <level>`: the severity-rank/threshold helpers
// in isolation, plus the end-to-end behaviour driven through the real CLI as a
// subprocess. `--severity` does double duty — it both gates the EXIT CODE and
// filters the DISPLAYED diagnostics (only those at or above the level print).
// So the exit-code tests key on `code`; the display tests capture stderr and
// assert a diagnostic's presence/absence in the output.
//
// Severity order, high → low: error > warning > info > hint. `check` exits
// non-zero when ANY diagnostic is at or above the chosen level; default `error`
// (only errors fail). Crucially, with NO `--severity` flag the display floor is
// "show everything" (gate stays `error`), so warnings/hints still print by
// default. A `let x = 1` produces a `warning` (unused variable); a `let _x = 1`
// produces a `hint` (intentionally-unused) — handy severity probes.
//
// Run with: deno test -A --no-check tests/cli_severity_test.ts

import { meetsThreshold, severityRank } from "../compiler/cli.ts";

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// --- the rank / threshold helpers in isolation ----------------------------

Deno.test("severityRank: orders error > warning > info > hint", () => {
  assert(severityRank("error") > severityRank("warning"), "error > warning");
  assert(severityRank("warning") > severityRank("info"), "warning > info");
  assert(severityRank("info") > severityRank("hint"), "info > hint");
});

Deno.test("meetsThreshold: at-or-above the chosen level gates", () => {
  // Default `error` threshold: only errors gate.
  assert(meetsThreshold("error", "error"), "error gates at error");
  assert(!meetsThreshold("warning", "error"), "warning does not gate at error");
  assert(!meetsThreshold("hint", "error"), "hint does not gate at error");

  // `warning` threshold: warnings and errors gate; info/hint do not.
  assert(meetsThreshold("error", "warning"), "error gates at warning");
  assert(meetsThreshold("warning", "warning"), "warning gates at warning");
  assert(!meetsThreshold("info", "warning"), "info does not gate at warning");
  assert(!meetsThreshold("hint", "warning"), "hint does not gate at warning");

  // `hint` threshold: everything gates (hint is the floor).
  assert(meetsThreshold("hint", "hint"), "hint gates at hint");
  assert(meetsThreshold("warning", "hint"), "warning gates at hint");
});

// --- the CLI end to end, asserting on the exit code ------------------------

// Run `vl check <args...>` against a temp file containing `source`, returning the
// process exit code. The file is created with a `.vl` extension so `check`
// treats it as a single file (no directory walk).
const runCheck = async (
  source: string,
  flags: string[],
): Promise<number> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_sev_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-check",
        new URL("../compiler/cli.ts", import.meta.url).pathname,
        "check",
        file,
        ...flags,
      ],
      stdout: "null",
      stderr: "null",
    });
    const { code } = await cmd.output();
    return code;
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// Like `runCheck`, but capture stderr (where diagnostics print) alongside the
// exit code, so display-filtering tests can assert what was/wasn't shown. Uses
// `--concise` for a stable, grep-friendly one-line-per-diagnostic format.
const runCheckCapture = async (
  source: string,
  flags: string[],
): Promise<{ code: number; stderr: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_sev_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-check",
        new URL("../compiler/cli.ts", import.meta.url).pathname,
        "check",
        file,
        "--concise",
        ...flags,
      ],
      stdout: "null",
      stderr: "piped",
    });
    const { code, stderr } = await cmd.output();
    return { code, stderr: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const WARNING_SRC = "let x = 1\n"; // unused top-level variable → warning
const HINT_SRC = "let _x = 1\n"; // intentionally-unused → hint
const ERROR_SRC = "let x: Int = true\n"; // type mismatch → error

Deno.test("check: a warning exits 0 by default (only errors fail)", async () => {
  assert((await runCheck(WARNING_SRC, [])) === 0, "default ignores warnings");
});

Deno.test("check: --severity error (explicit default) ignores a warning", async () => {
  const code = await runCheck(WARNING_SRC, ["--severity", "error"]);
  assert(code === 0, "explicit --severity error still ignores warnings");
});

Deno.test("check: --severity warning makes a warning fail", async () => {
  const code = await runCheck(WARNING_SRC, ["--severity", "warning"]);
  assert(code === 1, "warning gates the exit code at --severity warning");
});

Deno.test("check: --severity=warning (inline form) also fails on a warning", async () => {
  const code = await runCheck(WARNING_SRC, ["--severity=warning"]);
  assert(code === 1, "inline --severity= form is honoured");
});

Deno.test("check: a hint does NOT gate under --severity warning", async () => {
  const code = await runCheck(HINT_SRC, ["--severity", "warning"]);
  assert(code === 0, "hint stays below warning");
});

Deno.test("check: a hint DOES gate under --severity hint", async () => {
  const code = await runCheck(HINT_SRC, ["--severity", "hint"]);
  assert(code === 1, "hint gates only when explicitly requested");
});

Deno.test("check: an error always fails, even at --severity hint", async () => {
  assert((await runCheck(ERROR_SRC, [])) === 1, "error fails by default");
});

Deno.test("check: an unknown --severity level errors cleanly (exit 2)", async () => {
  const code = await runCheck(WARNING_SRC, ["--severity", "bogus"]);
  assert(code === 2, "unknown level is a clean usage error");
});

// --- display filtering: `--severity` also controls which diagnostics print ---

Deno.test("check: no --severity flag still PRINTS a warning (default shows all)", async () => {
  const { stderr } = await runCheckCapture(WARNING_SRC, []);
  assert(
    stderr.includes("warning") && stderr.includes("Unused"),
    `default should display the warning, got: ${stderr}`,
  );
});

Deno.test("check: no --severity flag still PRINTS a hint (default shows all)", async () => {
  const { stderr } = await runCheckCapture(HINT_SRC, []);
  assert(
    stderr.includes("hint") && stderr.includes("Intentionally-unused"),
    `default should display the hint, got: ${stderr}`,
  );
});

Deno.test("check: --severity warning PRINTS a warning", async () => {
  const { stderr } = await runCheckCapture(WARNING_SRC, ["--severity", "warning"]);
  assert(
    stderr.includes("Unused"),
    `--severity warning should display the warning, got: ${stderr}`,
  );
});

Deno.test("check: --severity warning HIDES an info/hint", async () => {
  // A hint sits below the `warning` floor, so it must not appear in output.
  const { stderr } = await runCheckCapture(HINT_SRC, ["--severity", "warning"]);
  assert(
    !stderr.includes("Intentionally-unused") && !stderr.includes("hint ["),
    `--severity warning should hide the hint, got: ${stderr}`,
  );
});

Deno.test("check: --severity error PRINTS an error", async () => {
  const { stderr } = await runCheckCapture(ERROR_SRC, ["--severity", "error"]);
  assert(
    stderr.includes("error ["),
    `--severity error should display the error, got: ${stderr}`,
  );
});

Deno.test("check: --severity error HIDES a warning", async () => {
  // The warning is below the `error` floor: gated out AND filtered from display.
  const { stderr } = await runCheckCapture(WARNING_SRC, ["--severity", "error"]);
  assert(
    !stderr.includes("Unused") && !stderr.includes("warning ["),
    `--severity error should hide the warning, got: ${stderr}`,
  );
});

Deno.test("check: --severity hint shows everything (hint is the floor)", async () => {
  const { stderr } = await runCheckCapture(HINT_SRC, ["--severity", "hint"]);
  assert(
    stderr.includes("Intentionally-unused"),
    `--severity hint should still display the hint, got: ${stderr}`,
  );
});
