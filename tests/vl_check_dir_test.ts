// NATIVE `vl check <directory>` — the directory walk + multi-file aggregation is
// VL policy (compiler/cli.vl), driven over the command-queue pump (CMD_LIST_DIR).
// The host only lists one directory at a time; recursion, the SKIP_DIRS list, the
// `.vl` filter, file sorting, the per-file check loop, and the aggregate summary
// all live in VL.
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
if (GATED && !ENABLED) {
  console.warn("[vl-check-dir] skipped — missing vl binary or seed wasm.");
}

const check = async (
  target: string,
  extraArgs: string[] = [],
): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", target, "--concise", "--compiler", COMPILER, ...extraArgs],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

Deno.test({
  name: "vl-check-dir: walks recursively, aggregates a multi-file summary, skips SKIP_DIRS",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/a.vl`, "print(1)\n");
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/sub/b.vl`, "print(2)\n");
      // A non-.vl file and a SKIP_DIRS subtree must be ignored even though the
      // latter holds a .vl file that would otherwise fail to type-check.
      await Deno.writeTextFile(`${dir}/notes.txt`, "ignore me\n");
      await Deno.mkdir(`${dir}/node_modules`);
      await Deno.writeTextFile(`${dir}/node_modules/c.vl`, "let q: string = 5\n");

      const r = await check(dir);
      if (r.code !== 0) {
        throw new Error(`expected clean exit 0, got ${r.code}:\n${r.err}`);
      }
      // Two files (a.vl + sub/b.vl); node_modules/c.vl is skipped, so its type
      // error never surfaces and the count is 2.
      if (!r.err.includes("Checked 2 files, no errors.")) {
        throw new Error(`expected "Checked 2 files, no errors.", got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-dir: a type error under the tree fails the run",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/ok.vl`, "print(1)\n");
      await Deno.writeTextFile(`${dir}/bad.vl`, "let q: string = 5\n");
      const r = await check(dir);
      if (r.code !== 1) {
        throw new Error(`expected exit 1, got ${r.code}:\n${r.err}`);
      }
      if (!r.err.includes(`${dir}/bad.vl: error [1:17]`)) {
        throw new Error(`expected bad.vl error line, got:\n${r.err}`);
      }
      // The aggregate summary carries no single-file `(type error)` stage note.
      if (!/Found 1 error\b/.test(r.err) || r.err.includes("(type error)")) {
        throw new Error(`expected aggregate "Found 1 error" with no stage note, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-dir: no path defaults to the current directory",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/only.vl`, "print(42)\n");
      const { code, stderr } = await new Deno.Command(VL, {
        args: ["check", "--concise", "--compiler", COMPILER],
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
      }).output();
      const err = new TextDecoder().decode(stderr);
      if (code !== 0 || !err.includes("Checked 1 file, no errors.")) {
        throw new Error(`expected cwd walk clean, got ${code}:\n${err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
