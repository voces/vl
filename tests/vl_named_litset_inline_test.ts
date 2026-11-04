// A NAMED STRING-LITERAL SET COMPARES INLINE, AS ITS SPELLED-OUT TWIN DOES (D15253).
//
// `x is K` with `type K = "a" | "b"` over a `string` and `x is "a" | "b"` are one test. Whether
// the emitter stages the string scratch frame the inline compare needs is read from the pattern's
// own type (`isPatTyIx`), so both spellings inline it. When it read the pattern's text, a named
// set was not staged and called `__str_eq__` once per member instead. Both spellings print the
// same either way, so a fixture cannot see this; this suite grades the lowering. A control that
// compares two runtime strings must keep its call, so a scan that stopped seeing calls fails.
//
// GATING: needs the built binary, the seed and `wasm-dis` (`node_modules/.bin`, not on PATH).
// `ci-native` installs no npm deps, so it self-ignores there; the `ci-release-shape` job names
// this file and runs it with npm deps.

import { binaryen, COMPILER, exists, nativeEnv, VL, wasmDis } from "./support/tree.ts";

const WASM_DIS = binaryen("wasm-dis");
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) {
  console.warn("[named-litset-inline] skipped — missing vl, the seed or wasm-dis");
}

// Each function in a `wasm-dis` listing, by its `$name`, with its body text.
const functionsOf = (wat: string): Map<string, string> => {
  const out = new Map<string, string>();
  let name = "";
  let body: string[] = [];
  const flush = () => {
    if (name !== "") out.set(name, body.join("\n"));
  };
  for (const line of wat.split("\n")) {
    if (line.startsWith(" (")) {
      flush();
      const m = line.match(/^ \(func \$(\S+)/);
      name = m ? m[1] : "";
      body = [line];
    } else if (name !== "") {
      body.push(line);
    }
  }
  flush();
  return out;
};

// Builds `src` with names kept and disassembles it.
const disassemble = async (src: string): Promise<Map<string, string>> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-named-litset-" });
  try {
    const file = `${dir}/p.vl`;
    const out = `${dir}/p.wasm`;
    Deno.writeTextFileSync(file, src);
    const p = await new Deno.Command(VL, {
      args: ["build", file, "--names", "-o", out, "--compiler", COMPILER],
      env: nativeEnv(),
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!p.success) {
      const err = new TextDecoder().decode(p.stdout) +
        new TextDecoder().decode(p.stderr);
      throw new Error(`vl build failed: ${err}`);
    }
    const d = await wasmDis([out]);
    return functionsOf(new TextDecoder().decode(d.stdout));
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

// The body of the one function whose name starts with `prefix@`.
const bodyOf = (fns: Map<string, string>, prefix: string): string => {
  const hits = [...fns.keys()].filter((n) => n.startsWith(`${prefix}@`));
  if (hits.length !== 1) {
    throw new Error(
      `want one function ${prefix}@…, got ${JSON.stringify(hits)} of ${
        JSON.stringify([...fns.keys()])
      }`,
    );
  }
  return fns.get(hits[0])!;
};

const STR_EQ_CALL = "(call $__str_eq__";
const count = (body: string, op: string): number => body.split(op).length - 1;

const PROGRAM = [
  'type K = "a" | "b"',
  "function named(x: string): i32 {",
  "  if x is K { return 1 }",
  "  0",
  "}",
  "function spelled(x: string): i32 {",
  '  if x is "a" | "b" { return 1 }',
  "  0",
  "}",
  "function runtime(a: string, b: string): i32 {",
  "  if a == b { return 1 }",
  "  0",
  "}",
  'print(named("a"))',
  'print(spelled("zz"))',
  'print(runtime("a", "b"))',
].join("\n");

Deno.test({
  name: "named-litset-inline: `x is K` over a string compares inline, as `x is \"a\" | \"b\"` does",
  ignore: !ENABLED,
  async fn() {
    const fns = await disassemble(PROGRAM);
    for (const fn of ["named", "spelled"]) {
      const got = count(bodyOf(fns, fn), STR_EQ_CALL);
      if (got !== 0) {
        throw new Error(`${fn}: want 0 calls to __str_eq__ (an inline compare), got ${got}`);
      }
    }
    // The control: two runtime strings compare through the helper.
    const ctl = count(bodyOf(fns, "runtime"), STR_EQ_CALL);
    if (ctl < 1) {
      throw new Error(`runtime: want a call to __str_eq__ (the control), got ${ctl}`);
    }
  },
});
