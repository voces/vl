// NATIVE `vl fmt` — formatting (format.vl / formatSrc) is VL; the file/dir/stdin
// policy (stdout vs `-w` write vs `--check` gate, the directory walk) is VL too,
// driven over the command-queue pump (CMD_READ_STDIN / CMD_WRITE_FILE / raw
// CMD_PRINT_OUT). The host only does the raw I/O.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

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
if (GATED && !ENABLED) console.warn("[vl-fmt] skipped — missing vl binary or seed wasm.");

const UNFORMATTED = "const   x=1\nprint( x )\n";
const FORMATTED = "const x = 1\nprint(x)\n";

const run = async (
  args: string[],
  stdin?: string,
): Promise<{ code: number; out: string; err: string }> => {
  const cmd = new Deno.Command(VL, {
    args: ["fmt", ...args, "--compiler", COMPILER],
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
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
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

Deno.test({
  name: "vl-fmt: a file prints its formatted source to stdout (byte-exact)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/a.vl`;
      await Deno.writeTextFile(f, UNFORMATTED);
      const r = await run([f]);
      if (r.code !== 0 || r.out !== FORMATTED) {
        throw new Error(`expected formatted stdout, got code ${r.code}, out=${JSON.stringify(r.out)}`);
      }
      // The file on disk is untouched without -w.
      if ((await Deno.readTextFile(f)) !== UNFORMATTED) {
        throw new Error("stdout mode must not modify the file");
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-fmt: stdin formats to stdout",
  ignore: !ENABLED,
  fn: async () => {
    const r = await run([], UNFORMATTED);
    if (r.code !== 0 || r.out !== FORMATTED) {
      throw new Error(`expected stdin→stdout format, got code ${r.code}, out=${JSON.stringify(r.out)}`);
    }
  },
});

Deno.test({
  name: "vl-fmt: -w rewrites a drifted file in place (idempotent)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/a.vl`;
      await Deno.writeTextFile(f, UNFORMATTED);
      const r = await run(["-w", f]);
      if (r.code !== 0) throw new Error(`-w exited ${r.code}:\n${r.err}`);
      if ((await Deno.readTextFile(f)) !== FORMATTED) {
        throw new Error("file should be formatted in place after -w");
      }
      // Re-running --check sees no drift.
      const chk = await run(["--check", f]);
      if (chk.code !== 0) throw new Error(`expected clean --check after -w, got ${chk.code}:\n${chk.err}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-fmt: preserves `export` on type decls + doesn't duplicate field comments (idempotent)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/t.vl`;
      // An exported type with a trailing comment on its opening line + a field
      // comment — the two constructs the formatter used to mishandle (drop the
      // `export`, and re-emit the inline comments as own-line copies each pass).
      const src =
        "export type T = {                 // a T\n  a: i32, // first\n  b: i32,\n}\nprint(0)\n";
      await Deno.writeTextFile(f, src);
      const once = await run([f]);
      if (once.code !== 0) throw new Error(`fmt failed: ${once.err}`);
      if (!once.out.includes("export type T")) {
        throw new Error(`export dropped from type decl:\n${once.out}`);
      }
      const comments = (once.out.match(/\/\//g) ?? []).length;
      if (comments !== 2) {
        throw new Error(`expected exactly 2 comments (no duplication), got ${comments}:\n${once.out}`);
      }
      // Idempotent: formatting the formatted output is a no-op.
      const f2 = `${dir}/t2.vl`;
      await Deno.writeTextFile(f2, once.out);
      const twice = await run([f2]);
      if (twice.out !== once.out) {
        throw new Error(`fmt not idempotent:\n--- once ---\n${once.out}\n--- twice ---\n${twice.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-fmt: --check over a directory flags drift on stderr and exits nonzero",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      await Deno.writeTextFile(`${dir}/ok.vl`, FORMATTED);
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/sub/bad.vl`, UNFORMATTED);
      const r = await run(["--check", dir]);
      if (r.code !== 1) throw new Error(`expected exit 1, got ${r.code}:\n${r.err}`);
      if (!r.err.includes(`${dir}/sub/bad.vl: not formatted`)) {
        throw new Error(`expected drift line for sub/bad.vl, got:\n${r.err}`);
      }
      if (r.err.includes(`${dir}/ok.vl`)) {
        throw new Error(`the already-formatted file must not be flagged:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
