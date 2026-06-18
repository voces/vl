// Tests for `vl fmt` — the CLI formatter. `fmt` runs the SELF-HOSTED formatter
// (the compiled seed's `formatSrc`, whose logic lives in `compiler/format.vl`).
// These drive the real CLI subprocess (arg parsing → seed-backed format →
// stdout / in-place write / --check exit code) exactly as a user runs it.
//
// The seed (`build/vl-compiler.wasm`) is required; absent (fresh clone, no
// `scripts/refresh-compiler.sh` yet) the tests self-ignore — same convention as
// the wasm-checker suite.
//
// Run with: deno test -A --no-check tests/cli_fmt_test.ts

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const ignore = !(() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();

// Run `vl fmt [flags] <file>` against a temp file containing `source`. Returns the
// exit code, stdout, and the file's text AFTER the run.
const runFmt = async (
  source: string,
  flags: string[] = [],
): Promise<{ code: number; stdout: string; after: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-check",
        new URL("../compiler/cli.ts", import.meta.url).pathname,
        "fmt",
        ...flags,
        file,
      ],
      stdout: "piped",
      stderr: "null",
      env: { ...Deno.env.toObject(), NO_COLOR: "1" },
    });
    const { code, stdout } = await cmd.output();
    const after = await Deno.readTextFile(file);
    return { code, stdout: new TextDecoder().decode(stdout), after };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const MESSY = "let   x=1\nfunction f(a: i32, b: i32): i32 {\nreturn a+b\n}\n";
const CANONICAL = "let x = 1\nfunction f(a: i32, b: i32): i32 {\n  return a + b\n}\n";

Deno.test({ name: "vl fmt: reflows messy source to canonical on stdout", ignore }, async () => {
  const { code, stdout, after } = await runFmt(MESSY);
  assert(code === 0, `expected exit 0, got ${code}`);
  assert(stdout === CANONICAL, `unexpected output:\n${JSON.stringify(stdout)}`);
  // Without -w the file is left untouched.
  assert(after === MESSY, "stdout mode must not modify the file");
});

Deno.test({ name: "vl fmt -w: rewrites in place and is idempotent", ignore }, async () => {
  const first = await runFmt(MESSY, ["-w"]);
  assert(first.code === 0, `expected exit 0, got ${first.code}`);
  assert(first.after === CANONICAL, `not formatted in place:\n${JSON.stringify(first.after)}`);
  // Second pass over the now-canonical content changes nothing.
  const second = await runFmt(CANONICAL, ["-w"]);
  assert(second.after === CANONICAL, "second -w pass was not idempotent");
});

Deno.test({ name: "vl fmt --check: non-zero on drift, zero when already formatted", ignore }, async () => {
  const drift = await runFmt(MESSY, ["--check"]);
  assert(drift.code !== 0, "expected non-zero exit on unformatted input");
  assert(drift.after === MESSY, "--check must not modify the file");
  const clean = await runFmt(CANONICAL, ["--check"]);
  assert(clean.code === 0, `expected exit 0 on formatted input, got ${clean.code}`);
});
