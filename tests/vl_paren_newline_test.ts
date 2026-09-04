// NATIVE parser: a newline may sit immediately after `(` and immediately before
// `)`. The self-host parser (compiler/parser.vl) had dropped the `skipNewlines`
// the TS host has around a parenthesized expression, so `vl fmt`'s forced-paren
// condition form —
//   if (
//     a &&
//     b
//   ) {
// — produced source the parser then REJECTED ("expected an expression but found
// NEWLINE"). `vl fmt` returns unparseable input verbatim, so an idempotency check
// can't catch it; this asserts the formatted output actually RE-PARSES.
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
  console.warn("[vl-paren-newline] skipped — missing vl binary or seed wasm.");
}

const runVL = async (
  sub: string,
  file: string,
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [sub, file, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

Deno.test({
  name: "vl-parse: a newline after `(` / before `)` parses",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_paren_" });
    try {
      const f = `${dir}/a.vl`;
      await Deno.writeTextFile(
        f,
        "const x = (\n  1 + 2\n)\n" +
          "function f(a: i32, b: i32): i32 {\n" +
          "  if (\n    a == 1 &&\n    b == 2\n  ) {\n    return 1\n  }\n  0\n}\n" +
          "print(x)\n" +
          "print(f(1, 2))\n",
      );
      const r = await runVL("check", f);
      if (r.code !== 0) {
        throw new Error(`newline-in-parens should parse, got code ${r.code}:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-parse: `vl fmt`'s forced-paren condition output re-parses",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_paren_" });
    try {
      // A condition too wide for one line → fmt wraps it in the forced-paren form.
      const f = `${dir}/w.vl`;
      await Deno.writeTextFile(
        f,
        "function f(aaaaaaaa: i32, bbbbbbbb: i32, cccccccc: i32, dddddddd: i32, eeeeeeee: i32): i32 {\n" +
          "  if aaaaaaaa == 1 && bbbbbbbb == 2 && cccccccc == 3 && dddddddd == 4 && eeeeeeee == 5 {\n" +
          "    return 1\n" +
          "  }\n  0\n}\n",
      );
      const fmt = await runVL("fmt", f);
      if (fmt.code !== 0) throw new Error(`fmt failed: ${fmt.err}`);
      if (!fmt.out.includes("  if (\n")) {
        throw new Error(`expected the forced-paren form, got:\n${fmt.out}`);
      }
      // The formatted output must itself parse (the bug #448's idempotency missed).
      const g = `${dir}/w.formatted.vl`;
      await Deno.writeTextFile(g, fmt.out);
      const chk = await runVL("check", g);
      if (chk.code !== 0) {
        throw new Error(`formatted forced-paren output did not re-parse, code ${chk.code}:\n${chk.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// D1581 — a newline inside an open bracket is whitespace before a binary operator, so
// a continuation line may LEAD with the operator. `vl fmt` prints operators TRAILING,
// so the leading spelling is one fmt normalises AWAY: what has to hold is that the new
// spelling parses, that fmt's output for it re-parses and means the same thing, and
// that STATEMENT level is untouched (a lambda body's `v` NEWLINE `-v` is still two
// statements, so `sep(1)` is -1 and not 0).
Deno.test({
  name: "vl-parse: a continuation line inside brackets may lead with a binary operator",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_leadop_" });
    try {
      const src = "const a = 1\nconst b = 2\n" +
        "const ok = (a == 1\n  || b == 2)\n" +
        "const xs = [a * 4\n  + 8, 99]\n" +
        "const obj = { v: a\n  + 1 }\n" +
        "const sep = (x: i32) => {\n  let v = x\n  v\n  -v\n}\n" +
        "print(ok)\nprint(xs[0])\nprint(obj.v)\nprint(sep(1))\n";
      const f = `${dir}/a.vl`;
      await Deno.writeTextFile(f, src);
      const r = await runVL("run", f);
      if (r.code !== 0) {
        throw new Error(`leading-operator continuation should run, got code ${r.code}:\n${r.err}`);
      }
      if (r.out !== "true\n12\n2\n-1\n") {
        throw new Error(`want "true\\n12\\n2\\n-1\\n", got ${JSON.stringify(r.out)}`);
      }
      // fmt rewrites it to the trailing-operator spelling; that output must re-parse
      // and print the same four lines.
      const fmt = await runVL("fmt", f);
      if (fmt.code !== 0) throw new Error(`fmt failed: ${fmt.err}`);
      const g = `${dir}/a.formatted.vl`;
      await Deno.writeTextFile(g, fmt.out);
      const again = await runVL("run", g);
      if (again.code !== 0) {
        throw new Error(`formatted output did not re-parse, code ${again.code}:\n${again.err}`);
      }
      if (again.out !== r.out) {
        throw new Error(
          `fmt changed the meaning: ${JSON.stringify(r.out)} vs ${JSON.stringify(again.out)}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The other half of the same rule: at statement level the newline is still the
// terminator. `a` NEWLINE `-b` at top level is two statements, and a leading `||` there
// stays a parse error — neither may be quietly joined.
Deno.test({
  name: "vl-parse: statement level still terminates at the newline",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_leadop_" });
    try {
      const f = `${dir}/s.vl`;
      await Deno.writeTextFile(
        f,
        "function f() {\n  let a = 1\n  a\n  -a\n}\nprint(f())\n",
      );
      const r = await runVL("run", f);
      if (r.code !== 0) throw new Error(`statement-level probe failed: ${r.err}`);
      if (r.out !== "-1\n") throw new Error(`want "-1\\n", got ${JSON.stringify(r.out)}`);

      const g = `${dir}/t.vl`;
      await Deno.writeTextFile(
        g,
        "const a = 1\nconst b = 2\nconst ok = a == 1\n  || b == 2\nprint(ok)\n",
      );
      const bad = await runVL("check", g);
      if (bad.code === 0) {
        throw new Error("a leading `||` at statement level must stay a parse error");
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
