// NATIVE `vl check --codegen` — the opt-in full-pipeline flag that also runs the
// emitter, so codegen/emit-stage errors (which the fast type-check path never
// reaches) are surfaced. All VL policy (compiler/cli.vl), driven over the
// command-queue pump.
//
// Key invariant — a file that type-checks clean but fails the emitter:
//   `vl check <file>`            exits 0  (fast path, no emit, misses the error)
//   `vl check --codegen <file>`  exits 1  (emitter runs, error surfaced)
//
// The fixture is a `Box` with a nullable-list field (`xs: i64[] | null`): the type
// is well-formed (fast path clean) but a nullable list has no rep in a struct field,
// so the emitter rejects. This is a live rep-fuzz baseline gap (nullable-list-locals
// family) — if it graduates, swap in any other shape that type-checks clean but
// emit-errors. (The native emitter reports it as `only i32 / boolean / string /
// array struct fields are supported` + the `(emit error)` summary marker. We assert
// the exit-code contract + that emit-stage marker, not the host-specific wording.)
//
// This is the native counterpart to the retired tests/cli_codegen_test.ts.
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
if (GATED && !ENABLED) {
  console.warn("[vl-check-codegen] skipped — missing vl binary or seed wasm.");
}

const check = async (
  source: string,
  flags: string[] = [],
): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_cg_" });
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

// Type-checks cleanly, fails the emitter (a nullable-list struct field has no rep).
const EMIT_ERROR_SRC =
  `type Box = { v: i32, xs: i64[] | null }\n` +
  `const b: Box = { v: 1, xs: null }\n` +
  `print(b.v)\n`;

// A normal, fully valid file — passes both the fast and the full path.
const CLEAN_SRC = `let x = 1\nprint(x)\n`;

// --- emit-erroring file ------------------------------------------------------

Deno.test({
  name: "vl-check-codegen (no --codegen): emit-erroring file exits 0 (fast path misses it)",
  ignore: !ENABLED,
  fn: async () => {
    const { code } = await check(EMIT_ERROR_SRC);
    if (code !== 0) throw new Error(`expected exit 0 on the codegen-free path, got ${code}`);
  },
});

Deno.test({
  name: "vl-check-codegen --codegen: emit-erroring file exits non-zero with an emit error",
  ignore: !ENABLED,
  fn: async () => {
    const { code, err } = await check(EMIT_ERROR_SRC, ["--codegen"]);
    if (code === 0) throw new Error(`expected non-zero exit with --codegen, got ${code}`);
    // The emitter ran and the failure surfaced as an error at the emit stage:
    // the `--concise` `error [line:col]` diagnostic plus the `(emit error)`
    // summary marker that distinguishes an emit-stage failure from a type error.
    if (!err.includes("error [") || !err.includes("emit error")) {
      throw new Error(`expected an emit-stage error, got:\n${err}`);
    }
  },
});

// --- clean file --------------------------------------------------------------

Deno.test({
  name: "vl-check-codegen: a clean file passes both paths (exit 0 each)",
  ignore: !ENABLED,
  fn: async () => {
    const fast = await check(CLEAN_SRC);
    if (fast.code !== 0) throw new Error(`clean fast path should exit 0, got ${fast.code}`);
    const full = await check(CLEAN_SRC, ["--codegen"]);
    if (full.code !== 0) throw new Error(`clean --codegen should exit 0, got ${full.code}`);
  },
});
