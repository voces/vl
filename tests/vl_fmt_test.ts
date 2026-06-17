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
  name: "vl-fmt: a wrapped object literal indents fields/`}` to its own depth (no over- or under-indent)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // Each object is wide enough to force the multi-line (wrapped) form. The
      // statement is one indent deep (a function body) and the value is also
      // nested one object deep, exercising both directions the indent used to
      // drift: emitMultiline double-counting the statement indent (fields landed
      // at col 6, `}` at col 4) and a nested field value never deepening (it
      // landed back at col 2/0).
      const f = `${dir}/w.vl`;
      const src =
        "function f(): void {\n" +
        "  const body = { onefield: 1, twofield: 2, threefield: 3, fourfield: 4, fivefield: 5, sixfield: 6 }\n" +
        "  const wrap = { outerkey: { alphaval: 1, betaval: 2, gammaval: 3, deltaval: 4, epsival: 5, zeta: 6 } }\n" +
        "}\n";
      await Deno.writeTextFile(f, src);
      const once = await run([f]);
      if (once.code !== 0) throw new Error(`fmt failed: ${once.err}`);
      // `body`'s fields sit one level past `const body` (col 4), its `}` aligns
      // with the declaration (col 2). Col 6 / col 4 is the over-indent bug.
      if (!once.out.includes("\n    onefield: 1,\n") || !once.out.includes("\n  }\n")) {
        throw new Error(`expected fields at col 4, \`}\` at col 2, got:\n${once.out}`);
      }
      if (once.out.includes("\n      onefield: 1,")) {
        throw new Error(`over-indented fields (col 6):\n${once.out}`);
      }
      // The nested `outerkey` value deepens by one level: its key at col 4, its
      // own fields at col 6, its `}` at col 4 (vs the under-indent bug that put
      // them back at col 2 / col 0).
      if (
        !once.out.includes("\n    outerkey: {\n") ||
        !once.out.includes("\n      alphaval: 1,\n") ||
        !once.out.includes("\n    },\n")
      ) {
        throw new Error(`nested object did not deepen correctly:\n${once.out}`);
      }
      // Idempotent.
      const f2 = `${dir}/w2.vl`;
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
  name: "vl-fmt: aligns a run of trailing comments to a common column (gaps tolerated, outlier excluded)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // A block of trailing comments aligns to (widest commented code)+1. A
      // comment-LESS line in the middle is tolerated (it neither breaks the run
      // nor pulls the column). A line wide enough to crowd the 80-col width keeps
      // its single space instead of dragging the whole column right.
      const wide = "const " + "x".repeat(72) + " = 0"; // 82-col code, over the budget
      const f = `${dir}/c.vl`;
      const src =
        "const aaa = 1 // first\n" +
        "const noComment = 5\n" +
        "const c = 3 // third\n" +
        `${wide} // outlier\n` +
        "print(0)\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      // Widest commented-and-fitting code is `const aaa = 1` (13) → column 14.
      if (
        !r.out.includes("const aaa = 1 // first\n") ||      // 13 + 1 space
        !r.out.includes("const c = 3   // third\n")         // 11 + 3 spaces → col 14
      ) {
        throw new Error(`run not aligned to column 14:\n${r.out}`);
      }
      if (!r.out.includes("const noComment = 5\n")) {
        throw new Error(`comment-less line altered:\n${r.out}`);
      }
      // The over-wide line keeps a single space and did not drag the column.
      if (!r.out.includes(`${wide} // outlier\n`)) {
        throw new Error(`outlier line should keep a single space:\n${r.out}`);
      }
      // Idempotent.
      const f2 = `${dir}/c2.vl`;
      await Deno.writeTextFile(f2, r.out);
      const twice = await run([f2]);
      if (twice.out !== r.out) {
        throw new Error(`alignment not idempotent:\n--- once ---\n${r.out}\n--- twice ---\n${twice.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-fmt: a comment inside a block stays in that block (no leak into the next branch)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // The then-branch holds ONLY a comment; the else-if branch has a statement.
      // The comment used to leak out of the empty branch and reappear inside the
      // following `else if` branch (it bound to the next emitted statement).
      const f = `${dir}/c.vl`;
      const src =
        "function classify(seg: string): i32 {\n" +
        "  if seg == \"\" {\n" +
        "    // skip\n" +
        "  } else if seg == \"..\" {\n" +
        "    pop()\n" +
        "  }\n" +
        "  0\n" +
        "}\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      // The comment sits in the then-branch (right after its `{`), NOT above pop().
      if (!r.out.includes("if seg == \"\" {\n    // skip\n  } else if")) {
        throw new Error(`comment not kept in the then-branch:\n${r.out}`);
      }
      if (r.out.includes("// skip\n    pop()")) {
        throw new Error(`comment leaked into the else-if branch:\n${r.out}`);
      }
      // Idempotent.
      const f2 = `${dir}/c2.vl`;
      await Deno.writeTextFile(f2, r.out);
      const twice = await run([f2]);
      if (twice.out !== r.out) {
        throw new Error(`fmt not idempotent:\n--- once ---\n${r.out}\n--- twice ---\n${twice.out}`);
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
