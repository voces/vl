// Tests for `vl check --severity <level>`: the severity-rank/threshold helpers
// in isolation, plus the end-to-end exit-code behaviour driven through the real
// CLI as a subprocess. The flag only gates the EXIT CODE — every diagnostic
// still prints — so the subprocess assertions key on `code`, not on output.
//
// Severity order, high → low: error > warning > info > hint. `check` exits
// non-zero when ANY diagnostic is at or above the chosen level; default `error`
// (only errors fail). A `let x = 1` produces a `warning` (unused variable); a
// `let _x = 1` produces a `hint` (intentionally-unused) — handy severity probes.
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
