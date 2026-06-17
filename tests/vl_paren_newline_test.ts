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
