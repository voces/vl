// Tests for `vl check --fix`: the opt-in flag that writes the provably-safe lint
// auto-fixes back to disk (eslint-`--fix` style), reusing the pure quick-fix edit
// logic in `lsp/src/codeActions.ts`.
//
// Key invariants:
//   - A never-reassigned `let` is rewritten to `const` (prefer-const).
//   - An unused variable's name is prefixed with `_` (unused-variable).
//   - A clean file is left byte-for-byte untouched.
//   - Re-running `--fix` is idempotent (the second pass changes nothing).
//   - The unused-variable *remove-binding* fix is NEVER auto-applied (it could
//     drop a side-effecting initializer) — the binding survives, only `_`-prefixed.
//
// The fixes are applied through the real CLI subprocess, so this exercises the
// whole `--fix` path (arg parsing → checkOnly diagnostics → safe-fix filter →
// edit application → file write) exactly as a user runs it.
//
// Run with: deno test -A --no-check tests/cli_fix_test.ts

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// Run `vl check --fix [extraFlags] <file>` against a temp file containing
// `source`. Returns the exit code, captured stderr, and the file's text AFTER the
// run (so callers can assert the on-disk result).
const runFix = async (
  source: string,
  extraFlags: string[] = [],
): Promise<{ code: number; stderr: string; after: string; file: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_fix_" });
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
        "--fix",
        ...extraFlags,
        file,
      ],
      stdout: "null",
      stderr: "piped",
      env: { ...Deno.env.toObject(), NO_COLOR: "1" },
    });
    const { code, stderr } = await cmd.output();
    const after = await Deno.readTextFile(file);
    return { code, stderr: new TextDecoder().decode(stderr), after, file };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// --- prefer-const: `let` -> `const` -----------------------------------------

Deno.test("--fix rewrites a never-reassigned `let` to `const`", async () => {
  // `total` is read (returned) but never reassigned -> prefer-const fires.
  const src = "function sum(n: i32) {\n  let total = n + 1\n  return total\n}\n";
  const { after } = await runFix(src);
  assert(
    after === "function sum(n: i32) {\n  const total = n + 1\n  return total\n}\n",
    `expected let->const, got: ${JSON.stringify(after)}`,
  );
});

// --- unused-variable: prefix with `_` ---------------------------------------

Deno.test("--fix prefixes an unused variable with `_`", async () => {
  // `scratch` is declared inside a function and never read -> unused-variable.
  const src = "function h(n: i32): i32 {\n  let scratch = n + 1\n  return n\n}\n";
  const { after } = await runFix(src);
  assert(
    after.includes("let _scratch = n + 1"),
    `expected the unused var to be _-prefixed, got: ${JSON.stringify(after)}`,
  );
});

Deno.test("--fix does NOT auto-apply the remove-binding fix", async () => {
  // The unused binding's initializer must survive: only a `_`-prefix is applied,
  // never a whole-line removal (which could drop a side-effecting initializer).
  const src = "function h(n: i32): i32 {\n  let scratch = n + 1\n  return n\n}\n";
  const { after } = await runFix(src);
  assert(
    after.includes("scratch = n + 1"),
    `expected the binding+initializer kept, got: ${JSON.stringify(after)}`,
  );
  // The line was prefixed, not deleted: the file keeps all four lines.
  assert(
    after.split("\n").length === src.split("\n").length,
    `expected no lines removed, got: ${JSON.stringify(after)}`,
  );
});

// --- clean file: no-op ------------------------------------------------------

Deno.test("--fix leaves a clean file untouched", async () => {
  // Already `const`, read, never reassigned: no prefer-const / unused-variable
  // diagnostic, so nothing to fix.
  const src = "const x = 1\nprint(x)\n";
  const { after } = await runFix(src);
  assert(after === src, `expected no change, got: ${JSON.stringify(after)}`);
});

// --- idempotence ------------------------------------------------------------

Deno.test("--fix is idempotent: re-running changes nothing", async () => {
  const dir = await Deno.makeTempDir({ prefix: "vl_fix_idem_" });
  const file = `${dir}/probe.vl`;
  const src = "function sum(n: i32) {\n  let total = n + 1\n  return total\n}\n";
  await Deno.writeTextFile(file, src);
  const cliArgs = (f: string) => [
    "run",
    "-A",
    "--no-check",
    new URL("../compiler/cli.ts", import.meta.url).pathname,
    "check",
    "--fix",
    f,
  ];
  const env = { ...Deno.env.toObject(), NO_COLOR: "1" };
  try {
    // First pass: applies the let->const fix.
    await new Deno.Command(Deno.execPath(), {
      args: cliArgs(file),
      stdout: "null",
      stderr: "null",
      env,
    }).output();
    const first = await Deno.readTextFile(file);
    // Second pass: nothing left to fix, so the file must be byte-for-byte stable.
    await new Deno.Command(Deno.execPath(), {
      args: cliArgs(file),
      stdout: "null",
      stderr: "null",
      env,
    }).output();
    const second = await Deno.readTextFile(file);
    assert(
      first.includes("const total = n + 1"),
      `expected first pass to fix, got: ${JSON.stringify(first)}`,
    );
    assert(
      first === second,
      `expected idempotent re-run, got: ${JSON.stringify(second)}`,
    );
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

// --- reporting --------------------------------------------------------------

Deno.test("--fix reports what it fixed", async () => {
  const src = "function sum(n: i32) {\n  let total = n + 1\n  return total\n}\n";
  const { stderr } = await runFix(src);
  assert(
    stderr.includes("fixed") && stderr.toLowerCase().includes("applied"),
    `expected a fix summary in stderr, got: ${stderr}`,
  );
});
