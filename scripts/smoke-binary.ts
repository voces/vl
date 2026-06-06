#!/usr/bin/env -S deno run -A
// Smoke-tests the compiled `vl` binary (roadmap C5 / H-M1). This is the real
// validation of the distribution story: it proves that binaryen.js loads and
// runs *inside* the `deno compile`d binary (the one known caveat of C5).
//
//   deno task smoke            # builds dist/vl if missing, then exercises it
//   deno task smoke ./dist/vl  # smoke-test an existing binary
//
// Exits non-zero on the first failed check.

// Resolved to an absolute path after the binary is ensured (below), so checks
// that override the child cwd (the bare `check` cwd-default case) still spawn it.
let BIN = Deno.args[0] ??
  (Deno.build.os === "windows" ? "dist/vl.exe" : "dist/vl");

const run = async (
  args: string[],
  stdin?: string,
  cwd?: string,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(BIN, {
    args,
    cwd,
    // NO_COLOR keeps `check` output ANSI-free so text assertions stay clean
    // (stdout is piped here anyway, so colors are already suppressed — belt
    // and suspenders). Layered onto the inherited env so the binary still finds
    // node_modules/binaryen, PATH, HOME, etc.
    env: { ...Deno.env.toObject(), NO_COLOR: "1" },
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = cmd.spawn();
  if (stdin !== undefined) {
    const w = child.stdin.getWriter();
    await w.write(new TextEncoder().encode(stdin));
    await w.close();
  }
  const { code, stdout, stderr } = await child.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout).trim(),
    stderr: new TextDecoder().decode(stderr).trim(),
  };
};

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
  console.error(`${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
  if (!ok) failures++;
};

const ensureBinary = async () => {
  try {
    await Deno.stat(BIN);
  } catch {
    console.error(`${BIN} missing — building it`);
    const { code } = await new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", "scripts/build-binary.ts"],
      stdout: "inherit",
      stderr: "inherit",
    }).output();
    if (code !== 0) Deno.exit(code);
  }
};

await ensureBinary();
BIN = await Deno.realPath(BIN); // absolute, so child-cwd overrides still find it
console.error(`smoke-testing ${BIN}\n`);

// 1. run an inline snippet — exercises compile + binaryen codegen + runWasm.
{
  const r = await run(["-e", "print(1 + 2)"]);
  check("run -e snippet", r.code === 0 && r.stdout === "3", r.stdout || r.stderr);
}

// 2. run from stdin.
{
  const r = await run([], "print(6 * 7)");
  check("run stdin", r.code === 0 && r.stdout === "42", r.stdout || r.stderr);
}

// 3. build to a .wasm (+ .wat) — exercises binaryen emit + wasmToWat read-back.
{
  const out = await Deno.makeTempFile({ suffix: ".wasm" });
  const r = await run(["build", "samples/functions.vl", "-o", out, "--wat"]);
  let wasmOk = false;
  try {
    wasmOk = (await Deno.stat(out)).size > 0;
  } catch { /* missing */ }
  check("build .wasm + .wat", r.code === 0 && wasmOk, r.stderr);
  await Deno.remove(out).catch(() => {});
  await Deno.remove(out.replace(/\.wasm$/, ".wat")).catch(() => {});
}

// 4. check a clean file — exit 0.
{
  const r = await run(["check", "samples/functions.vl"]);
  check("check clean (exit 0)", r.code === 0, `exit ${r.code}`);
}

// Build a small, self-contained clean tree (with a nested dir + a non-.vl file)
// for the directory / cwd-default check cases — robust regardless of which
// corpus files happen to carry intentional error diagnostics.
const tmpDir = await Deno.makeTempDir();
await Deno.mkdir(`${tmpDir}/nested`);
await Deno.writeTextFile(`${tmpDir}/a.vl`, "let x = 1\nprint(x)\n");
await Deno.writeTextFile(`${tmpDir}/nested/b.vl`, "let y = 2\nprint(y)\n");
await Deno.writeTextFile(`${tmpDir}/notes.txt`, "skip me\n");

// 5. check a directory — recursively checks every *.vl under it (incl. nested),
//    skipping non-.vl files. Proves the dir-walk aggregation works (exit 0).
{
  const r = await run(["check", tmpDir]);
  check("check directory recursive (exit 0)", r.code === 0, r.stderr || `exit ${r.code}`);
}

// 6. check with no path argument — defaults to the cwd (`check .`). Run with the
//    child cwd set to the clean temp tree so the default is exercised directly.
{
  const r = await run(["check"], undefined, tmpDir);
  check("check cwd default (exit 0)", r.code === 0, r.stderr || `exit ${r.code}`);
}

// 7. check a non-existent path — clear error, non-zero exit.
{
  const r = await run(["check", `${tmpDir}/does-not-exist`]);
  check("check missing path (exit 2)", r.code === 2, `exit ${r.code}`);
}

await Deno.remove(tmpDir, { recursive: true }).catch(() => {});

// A file with one known type error, used by the diagnostic-rendering checks
// below. `a = "x"` after `let a = 1` is an i32-vs-string assignment error whose
// span covers the `"x"` literal on line 2 (1-based).
const badFile = await Deno.makeTempFile({ suffix: ".vl" });
await Deno.writeTextFile(badFile, `let a = 1\na = "x"\n`);

// 8. default (pretty) check output — must contain the offending source line, a
//    caret/tilde underline, the `at file:L:C` locator, and the summary, and
//    must exit non-zero on an error.
{
  const r = await run(["check", badFile]);
  const ok = r.code === 1 &&
    r.stderr.includes(`a = "x"`) && // offending source line
    /\^~*/.test(r.stderr) && // caret/tilde underline
    r.stderr.includes(`at ${badFile}:2:5`) && // locator (1-based L:C)
    r.stderr.includes("Found 1 error.") && // summary, singular
    !r.stderr.includes("Found 1 errors."); // pluralization correct
  check("check pretty default (carets + summary)", ok, r.stderr);
}

// 9. --concise reproduces the legacy one-line-per-diagnostic format exactly.
{
  const r = await run(["check", "--concise", badFile]);
  const ok = r.code === 1 &&
    r.stderr === `${badFile}: error [2:5] Type error: expected i32, got "x"`;
  check("check --concise (legacy line)", ok, r.stderr);
}

// 10. clean single-file pretty check — exit 0 with the no-errors summary.
{
  const r = await run(["check", "samples/functions.vl"]);
  const ok = r.code === 0 && /no errors\./.test(r.stderr);
  check("check pretty clean summary (exit 0)", ok, r.stderr || `exit ${r.code}`);
}

await Deno.remove(badFile).catch(() => {});

console.error("");
if (failures > 0) {
  console.error(`${failures} smoke check(s) FAILED`);
  Deno.exit(1);
}
console.error("all smoke checks passed — binaryen runs in the compiled binary");
