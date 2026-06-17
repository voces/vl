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
  name: "vl-fmt: aligns a trailing-comment run only when the author signals intent (≥2 spaces)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // First run: some line has ≥2 spaces before `//` → alignment intent, so the
      // run aligns to (widest fitting code)+1. A comment-LESS line is tolerated; a
      // line too wide for the 80-col budget keeps one space and doesn't drag the
      // column. Second run (blank-separated): all one space → no intent → left as
      // written, so unequal-width lines do NOT get force-aligned.
      const wide = "const " + "x".repeat(72) + " = 0"; // 82-col code, over the budget
      const f = `${dir}/c.vl`;
      const src =
        "const aaa = 1  // first\n" +     // 2 spaces → signals intent
        "const noComment = 5\n" +
        "const c = 3  // third\n" +
        `${wide} // outlier\n` +
        "print(0)\n" +
        "\n" +
        "const dd = 1 // x\n" +           // 1 space, on its own run
        "const eeeee = 22 // y\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      // Run 1 aligns to column 14 (widest fitting code `const aaa = 1` = 13).
      if (
        !r.out.includes("const aaa = 1 // first\n") ||      // 13 + 1 space
        !r.out.includes("const c = 3   // third\n")         // 11 + 3 spaces → col 14
      ) {
        throw new Error(`intent run not aligned to column 14:\n${r.out}`);
      }
      if (!r.out.includes("const noComment = 5\n")) {
        throw new Error(`comment-less line altered:\n${r.out}`);
      }
      if (!r.out.includes(`${wide} // outlier\n`)) {
        throw new Error(`outlier line should keep a single space:\n${r.out}`);
      }
      // Run 2: one space, differing widths — NOT force-aligned.
      if (!r.out.includes("const dd = 1 // x\n") || !r.out.includes("const eeeee = 22 // y\n")) {
        throw new Error(`one-space run should be left as written:\n${r.out}`);
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
  name: "vl-fmt: a lone wide comment's spacing does not force-align the narrower lines",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // Only the WIDEST line carries ≥2 spaces; the narrower line has one. That is
      // not an alignment signal (you align by padding the SHORTER lines), so the
      // run is left as written — both end at one space.
      const f = `${dir}/r.vl`;
      const src = "const short = 1 // a\nconst longername = 2  // b\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      if (!r.out.includes("const short = 1 // a\n") || !r.out.includes("const longername = 2 // b\n")) {
        throw new Error(`widest line's spacing should not force alignment:\n${r.out}`);
      }
      const f2 = `${dir}/r2.vl`;
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
  name: "vl-fmt: a single-statement while/for body stays inline",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/l.vl`;
      const src =
        "function f(): void {\n" +
        "  while nx < slots.length && slots[nx] >= 0 { nx = nx + 1 }\n" +
        "  for i in 0 to n { sum = sum + i }\n" +
        "}\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      if (!r.out.includes("  while nx < slots.length && slots[nx] >= 0 { nx = nx + 1 }\n")) {
        throw new Error(`while one-liner was expanded:\n${r.out}`);
      }
      if (!r.out.includes("  for i in 0 to n { sum = sum + i }\n")) {
        throw new Error(`for one-liner was expanded:\n${r.out}`);
      }
      const f2 = `${dir}/l2.vl`;
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
  name: "vl-fmt: an overflowing if/while condition wraps in forced parens (idempotent)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // A condition too wide for one line wraps Prettier-style: `if (` / one
      // operand per line / `) {`, so the `)` row separates the condition from the
      // body. fmt ADDS the parens, so the re-parse sees a `Paren` node — the
      // formatter peels one layer before re-wrapping, keeping it idempotent. A
      // short condition stays inline.
      const f = `${dir}/c.vl`;
      const src =
        "function f(): void {\n" +
        "  if aaaaaaaaaa && bbbbbbbbbb && cccccccccc && dddddddddd && eeeeeeeeee && ffffffffff {\n" +
        "    step()\n" +
        "  }\n" +
        "  if short {\n" +
        "    g()\n" +
        "  }\n" +
        "}\n";
      await Deno.writeTextFile(f, src);
      const once = await run([f]);
      if (once.code !== 0) throw new Error(`fmt failed: ${once.err}`);
      // Paren form: `if (` then operands at +4, then `) {`.
      if (
        !once.out.includes("  if (\n") ||
        !once.out.includes("\n    aaaaaaaaaa &&\n") ||
        !once.out.includes("\n    ffffffffff\n") ||
        !once.out.includes("\n  ) {\n")
      ) {
        throw new Error(`condition did not wrap in forced parens:\n${once.out}`);
      }
      // The short condition stays inline (no parens added).
      if (!once.out.includes("if short {")) {
        throw new Error(`short condition should stay inline:\n${once.out}`);
      }
      // Idempotent across the added-paren round-trip.
      const f2 = `${dir}/c2.vl`;
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
  name: "vl-fmt: a single-statement function body stays inline; a compound one expands",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/f.vl`;
      const src =
        "export function rbyteLen(): i32 { W.bytes.length }\n" +
        "function big(): i32 {\n  const x = 1\n  x\n}\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      // The single-expression body is kept on one line (not expanded).
      if (!r.out.includes("export function rbyteLen(): i32 { W.bytes.length }\n")) {
        throw new Error(`inline body was expanded:\n${r.out}`);
      }
      // The two-statement body stays multi-line.
      if (!r.out.includes("function big(): i32 {\n  const x = 1\n")) {
        throw new Error(`compound body should stay multi-line:\n${r.out}`);
      }
      const f2 = `${dir}/f2.vl`;
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
  name: "vl-fmt: keeps a single blank line between/around comments (idempotent)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      const f = `${dir}/b.vl`;
      // A blank separates a section header from the comment after it, and the
      // last comment from the code; consecutive comments with no blank stay
      // grouped. These separators used to be dropped.
      const src =
        "// section header\n\n// detail comment\nconst a = 1\n\n// group one\n// group two\nconst b = 2\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      if (!r.out.includes("// section header\n\n// detail comment\n")) {
        throw new Error(`blank between comments dropped:\n${r.out}`);
      }
      if (!r.out.includes("// group one\n// group two\n")) {
        throw new Error(`grouped comments wrongly separated:\n${r.out}`);
      }
      const f2 = `${dir}/b2.vl`;
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
  name: "vl-fmt: a function header wraps its params when the whole line overflows",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_" });
    try {
      // The header is 84 cols including `export ` and ` {` — over the budget — so
      // the params wrap one-per-line with `): T {` on its own row. A short header
      // stays inline. (The width check used to omit `export ` + ` {`.)
      const f = `${dir}/f.vl`;
      const src =
        "export function mkLet(kw: string, name: string, ty: i32, init: i32, pos: i32): i32 {\n" +
        "  addNode(n)\n" +
        "}\n" +
        "function short(a: i32, b: i32): i32 { a + b }\n";
      await Deno.writeTextFile(f, src);
      const r = await run([f]);
      if (r.code !== 0) throw new Error(`fmt failed: ${r.err}`);
      const wrapped =
        "export function mkLet(\n" +
        "  kw: string,\n  name: string,\n  ty: i32,\n  init: i32,\n  pos: i32,\n" +
        "): i32 {\n";
      if (!r.out.includes(wrapped)) {
        throw new Error(`params did not wrap one-per-line:\n${r.out}`);
      }
      if (!r.out.includes("function short(a: i32, b: i32): i32 { a + b }\n")) {
        throw new Error(`short header should stay inline:\n${r.out}`);
      }
      const f2 = `${dir}/f2.vl`;
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
