#!/usr/bin/env -S deno run -A
// Smoke-tests the compiled `vl` binary (roadmap C5 / H-M1). This is the real
// validation of the distribution story: it proves that binaryen.js loads and
// runs *inside* the `deno compile`d binary (the one known caveat of C5).
//
//   deno task smoke            # builds dist/vl if missing, then exercises it
//   deno task smoke ./dist/vl  # smoke-test an existing binary
//
// Exits non-zero on the first failed check.

const BIN = Deno.args[0] ??
  (Deno.build.os === "windows" ? "dist/vl.exe" : "dist/vl");

const run = async (
  args: string[],
  stdin?: string,
): Promise<{ code: number; stdout: string; stderr: string }> => {
  const cmd = new Deno.Command(BIN, {
    args,
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

console.error("");
if (failures > 0) {
  console.error(`${failures} smoke check(s) FAILED`);
  Deno.exit(1);
}
console.error("all smoke checks passed — binaryen runs in the compiled binary");
