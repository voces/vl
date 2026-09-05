// EVERY LINT RULE'S SPAN IS THE THING ITS MESSAGE NAMES.
//
// Until this landed, `cli.vl` gave every lint finding `endCol = col + 1`: all 21,290
// findings over the tree were exactly ONE COLUMN wide, so `coalNarrowedPlace`'s
// kind-ladder finding underlined the `i` of `if` while its message named the function,
// and the sentinel rule underlined the `P` of `P.nodes[ix]`. The rules now carry their
// own `[col, endCol)` and this pins what each one covers.
//
// EVERY EXPECTATION IS DERIVED, never a recorded column: the span is sliced out of the
// source and compared with the thing the message names (the backticked identifier, the
// read, the line). A recorded column would pass over whatever the compiler happens to
// emit, which is the failure mode this file exists to prevent.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-lint-span] skipped — missing vl binary or seed wasm.");
}

type Diag = {
  file: string;
  code?: string;
  line: number;
  col: number;
  endCol: number;
  message: string;
};

const check = async (dir: string, file: string): Promise<Diag[]> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", file, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${file} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as Diag[];
  return all.filter((d) => d.file.endsWith(file));
};

/** The source text a finding's `[col, endCol)` actually underlines. */
const spanText = (src: string, d: Diag): string => {
  const line = src.split("\n")[d.line - 1] ?? "";
  return line.slice(d.col - 1, d.endCol - 1);
};

/** The first backticked run of a message — the thing the rule says it is about. */
const backticked = (msg: string): string => /`([^`]*)`/.exec(msg)?.[1] ?? "";

/** `line` from `col` to the end of its CODE (its `//` comment stripped, trailing space cut). */
const codeFrom = (src: string, d: Diag): string => {
  const line = src.split("\n")[d.line - 1] ?? "";
  const c = line.indexOf("//");
  return line.slice(d.col - 1, c < 0 ? line.length : c).replace(/\s+$/, "");
};

const run = async (name: string, src: string): Promise<{ src: string; diags: Diag[] }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_lint_span_" });
  await Deno.writeTextFile(`${dir}/${name}`, src);
  const diags = await check(dir, name);
  await Deno.remove(dir, { recursive: true });
  return { src, diags };
};

const one = (diags: Diag[], code: string): Diag => {
  const mine = diags.filter((d) => d.code === code);
  if (mine.length !== 1) {
    throw new Error(
      `want exactly one ${code}, got ${mine.length}: ` +
        JSON.stringify(mine.map((d) => `${d.line}:${d.col}-${d.endCol}`)),
    );
  }
  return mine[0];
};

const want = (got: string, expect: string, what: string) => {
  if (got !== expect) {
    throw new Error(`${what}: want the span to be ${JSON.stringify(expect)}, got ${JSON.stringify(got)}`);
  }
};

// ── the three ratcheted rules ───────────────────────────────────────────────

Deno.test({
  name: "lint span: sentinel-index-unguarded covers the whole read, not the table",
  ignore: !ENABLED,
  fn: async () => {
    const { src, diags } = await run(
      "sentinel.vl",
      [
        "type Node = { nKid: i32 }",
        "let nodes: Node[] = []",
        "function holeOf(n: Node) {",
        "  if n.nKid < 0 { return -1 }",
        "  n.nKid",
        "}",
        "function readIt(n: Node) {",
        "  const kid = nodes[n.nKid]",
        "  kid.nKid",
        "}",
        "print(holeOf({ nKid: 1 }) + readIt({ nKid: 0 }))",
        "",
      ].join("\n"),
    );
    const d = one(diags, "sentinel-index-unguarded");
    // The message opens with the read it is about; the span must BE that read.
    want(spanText(src, d), backticked(d.message), "sentinel-index-unguarded");
    want(spanText(src, d), "nodes[n.nKid]", "sentinel-index-unguarded (literal)");
  },
});

Deno.test({
  name: "lint span: kind-ladder-incomplete covers the ladder's first arm line",
  ignore: !ENABLED,
  fn: async () => {
    const { src, diags } = await run(
      "ladder.vl",
      [
        "function pick(k: string): i32 {",
        "  if k == \"nulbool\" { return 1 }   // a trailing comment is not the ladder",
        "  if k == \"f64list\" { return 2 }",
        "  if k == \"u8list\" { return 3 }",
        "  -1",
        "}",
        "",
      ].join("\n"),
    );
    const d = one(diags, "kind-ladder-incomplete");
    // The MESSAGE names the function; the SPAN is the first arm, because a function
    // may carry several ladders and the arm is where the fix is written.
    if (!d.message.startsWith("`pick`")) {
      throw new Error(`precondition: the message must name the function, got ${d.message}`);
    }
    want(spanText(src, d), codeFrom(src, d), "kind-ladder-incomplete");
    want(
      spanText(src, d),
      "if k == \"nulbool\" { return 1 }",
      "kind-ladder-incomplete (literal)",
    );
  },
});

Deno.test({
  name: "lint span: arena-scan-outside-pass covers the while head through its bound",
  ignore: !ENABLED,
  fn: async () => {
    const { src, diags } = await run(
      "scan.vl",
      [
        "type Node = { nKid: i32 }",
        "let sNames: string[] = []",
        "function perThing(seed: i32) {",
        "  let i = 0",
        "  let n = seed",
        "  while i < sNames.length {",
        "    n = n + i",
        "    i = i + 1",
        "  }",
        "  n",
        "}",
        "print(perThing(1))",
        "",
      ].join("\n"),
    );
    const d = one(diags, "arena-scan-outside-pass");
    want(spanText(src, d), "while i < sNames.length", "arena-scan-outside-pass");
  },
});

// ── the name-token family, and the control that says width 1 is sometimes right ──

Deno.test({
  name: "lint span: a name-token rule covers the whole NAME",
  ignore: !ENABLED,
  fn: async () => {
    const { src, diags } = await run(
      "names.vl",
      [
        "function neverCalledHelper(unusedParameterName: i32) {",
        "  let neverReassignedLocal = 1",
        "  neverReassignedLocal + 2",
        "}",
        "print(1)",
        "",
      ].join("\n"),
    );
    for (const code of ["unused-function", "unused-variable"]) {
      const d = diags.filter((x) => x.code === code)[0];
      if (d === undefined) throw new Error(`no ${code} fired`);
      want(spanText(src, d), backticked(d.message), code);
      if (spanText(src, d).length < 2) {
        throw new Error(`${code}: a multi-letter name must not span one column`);
      }
    }
    // `prefer-const` is anchored at the `let` KEYWORD — the token its fix rewrites —
    // so its span is that keyword and NOT the name its message names.
    const pc = one(diags, "prefer-const");
    want(spanText(src, pc), "let", "prefer-const");
  },
});

Deno.test({
  name: "lint span: a ONE-LETTER name is one column wide, and that is correct",
  ignore: !ENABLED,
  fn: async () => {
    // The control for the test above: 21,290 findings measured one column wide before
    // this change, and 2,091 of the `unused-variable` ones STILL do — because the name
    // really is one letter. Without this, "width 1" reads as the defect returning.
    const { src, diags } = await run(
      "short.vl",
      ["function f(q: i32) {", "  1", "}", "print(1)", ""].join("\n"),
    );
    for (const d of diags.filter((x) => x.code === "unused-variable" || x.code === "unused-function")) {
      want(spanText(src, d), backticked(d.message), String(d.code));
      if (d.endCol - d.col !== 1) {
        throw new Error(`${d.code}: a one-letter name must span exactly one column`);
      }
    }
  },
});

// ── the comment family ──────────────────────────────────────────────────────

Deno.test({
  name: "lint span: a comment rule covers the comment LINE it is about",
  ignore: !ENABLED,
  fn: async () => {
    const { src, diags } = await run(
      "comments.vl",
      [
        "print(0)",
        "",
        "// a block that runs past the four-line budget on purpose",
        "// second line",
        "// third line",
        "// fourth line",
        "// fifth line, ALWAYS SHOUTING here",
        "print(1)",
        "",
      ].join("\n"),
    );
    const lines = src.split("\n");
    for (const code of ["comment-block-too-long", "comment-shouting"]) {
      const d = diags.filter((x) => x.code === code)[0];
      if (d === undefined) throw new Error(`no ${code} fired`);
      want(spanText(src, d), lines[d.line - 1], code);
    }
    // The two point at different lines: the block's first, and the line that shouts.
    const tooLong = diags.filter((x) => x.code === "comment-block-too-long")[0];
    const shout = diags.filter((x) => x.code === "comment-shouting")[0];
    if (tooLong.line === shout.line) {
      throw new Error("precondition: the block rule and the line rule must differ here");
    }
  },
});

// ── the node-anchored residue, stated rather than assumed ───────────────────

Deno.test({
  name: "lint span: a node-anchored rule spans its anchor TOKEN, which is the node's last",
  ignore: !ENABLED,
  fn: async () => {
    // `nodeToks[i]` is the LAST token a node consumed and the arena carries no start
    // column, so these rules can span that token and no more. Pinned so the residue is
    // a stated contract rather than something nobody measured.
    const { src, diags } = await run(
      "anchored.vl",
      [
        "function f(n: i32): i32 {",
        "  if false { return 7 }",
        "  return n",
        "  print(99)",
        "}",
        "print(f(1))",
        "",
      ].join("\n"),
    );
    // Both anchor at the node's LAST token: the dead branch's `}` and the dead
    // statement's `)`. One column each, and it is the arena's limit rather than the
    // rule's choice.
    want(spanText(src, one(diags, "constant-condition")), "}", "constant-condition");
    want(spanText(src, one(diags, "unreachable-code")), ")", "unreachable-code");
    for (const d of diags) {
      const s = spanText(src, d);
      if (s.length === 0) throw new Error(`${d.code}: an empty span at ${d.line}:${d.col}`);
      if (d.endCol <= d.col) throw new Error(`${d.code}: endCol must exceed col`);
    }
  },
});

Deno.test({
  name: "lint span: no finding's span runs past its own line",
  ignore: !ENABLED,
  fn: async () => {
    // A one-line span is the diagnostic model's whole contract (`line`, `col`,
    // `endCol`). A rule that measured a multi-line lexeme would silently produce an
    // endCol past the line and the editor would clamp it somewhere arbitrary.
    const { src, diags } = await run(
      "wide.vl",
      [
        "// a header block that runs past the four-line budget on purpose",
        "// second line",
        "// third line",
        "// fourth line",
        "// fifth",
        "function neverCalledHelper(p: i32) {",
        "  const s = `a template",
        "spanning lines`",
        "  s.length + p",
        "}",
        "print(1)",
        "",
      ].join("\n"),
    );
    const lines = src.split("\n");
    if (diags.length === 0) throw new Error("precondition: this fixture must produce findings");
    for (const d of diags) {
      const len = (lines[d.line - 1] ?? "").length;
      if (d.endCol - 1 > len) {
        throw new Error(
          `${d.code} at ${d.line}:${d.col}: endCol ${d.endCol} runs past the ${len}-char line`,
        );
      }
    }
  },
});
