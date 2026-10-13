// D3475 (sunpa SP-001) — BRACES OPENING `{ name, …` ARE AN OBJECT LITERAL IN EVERY BODY POSITION:
// a function body, statements then a tail, an `if`/`else` branch, a `match` arm and a lambda body,
// with a keyed second field, all shorthand, a trailing comma, across lines and nested.
//
// `vl fmt` keeps a shorthand field as written (D3478), including the comma that makes a lone
// `{ id, }` an object rather than a block; the formatted source must be a fixed point and print
// the same. The guards that a lone `{ name }` stays a block live in
// `tests/cases/parser/shorthand-lone-name-*.vl`.
//
// No assertion library, per CLAUDE.md.

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);

const SRC = [
  "type P = { id: i32, x: f64 }",
  "type Q = { id: i32 }",
  "type N = { id: i32, p: P }",
  "function make(id: i32, x: f64): P {",
  "  { id, x: x }",
  "}",
  "function makeShort(id: i32, x: f64): P {",
  "  { id, x }",
  "}",
  "function makeTrailing(id: i32): Q {",
  "  { id, }",
  "}",
  "function makeLines(id: i32, x: f64): P {",
  "  {",
  "    id,",
  "    x,",
  "  }",
  "}",
  "function makeAfterStmt(id: i32, x: f64): P {",
  "  const y = x * 2.0",
  "  { id, x: y }",
  "}",
  "function pick(id: i32, x: f64, b: boolean): P {",
  "  if b { id, x } else { id, x: 0.0 }",
  "}",
  "function arm(id: i32, x: f64, k: i32): P {",
  "  match k {",
  "    1 => { id, x: 1.0 },",
  "    _ => { id, x },",
  "  }",
  "}",
  "function nest(id: i32, x: f64): N {",
  "  { id, p: { id, x } }",
  "}",
  'function show(p: P) { "\\{p.id} \\{p.x}" }',
  "const id = 7",
  "const x = 2.5",
  "print(show(make(id, x)))",
  "print(show(makeShort(id, x)))",
  "print(makeTrailing(id).id)",
  "print(show(makeLines(id, x)))",
  "print(show(makeAfterStmt(id, x)))",
  "print(show(pick(id, x, true)))",
  "print(show(pick(id, x, false)))",
  "print(show(arm(id, x, 1)))",
  "print(show(arm(id, x, 2)))",
  "const n = nest(id, x)",
  'print("\\{n.id} \\{show(n.p)}")',
  "const lam = (id: i32, x: f64): P => { id, x }",
  "print(show(lam(1, 1.5)))",
  "const lamLines = (id: i32, x: f64): P => {",
  "  {",
  "    id,",
  "    x: x + 1.0,",
  "  }",
  "}",
  "print(show(lamLines(2, 1.5)))",
  "",
].join("\n");

const WANT = [
  "7 2.5",
  "7 2.5",
  "7",
  "7 2.5",
  "7 5",
  "7 2.5",
  "7 0",
  "7 1",
  "7 2.5",
  "7 7 2.5",
  "1 1.5",
  "2 2.5",
  "",
].join("\n");

const vl = async (
  args: string[],
  stdin?: string,
): Promise<{ code: number; out: string; err: string }> => {
  const child = new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdin: stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).spawn();
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
  name: "D3475: a body opening with a shorthand field is an object, and its formatted form agrees",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_shorthand_first_" });
    try {
      const a = `${dir}/a.vl`;
      await Deno.writeTextFile(a, SRC);
      const ra = await vl(["run", a]);
      if (ra.code !== 0 || ra.out !== WANT) {
        throw new Error(
          `the shorthand spelling: want rc 0 and ${JSON.stringify(WANT)}, got rc ${ra.code} and ` +
            `${JSON.stringify(ra.out)}\n${ra.err}`,
        );
      }
      const f = await vl(["fmt"], SRC);
      if (f.code !== 0) throw new Error(`vl fmt rejected it (rc ${f.code}):\n${f.err}`);
      for (const kept of ["{ id, x: x }", "{ { id, } }", "{ { id, p: { id, x } } }", "=> { id, x }"]) {
        if (!f.out.includes(kept)) {
          throw new Error(`want the formatted source to hold \`${kept}\`, got:\n${f.out}`);
        }
      }
      const again = await vl(["fmt"], f.out);
      if (again.out !== f.out) throw new Error(`the formatted form is not a fixed point:\n${again.out}`);
      const b = `${dir}/b.vl`;
      await Deno.writeTextFile(b, f.out);
      const rb = await vl(["run", b]);
      if (rb.code !== 0 || rb.out !== WANT) {
        throw new Error(
          `the formatted spelling: want rc 0 and ${JSON.stringify(WANT)}, got rc ${rb.code} and ` +
            `${JSON.stringify(rb.out)}\n${rb.err}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
