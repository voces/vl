// A LOCAL FUNCTION CALLED ONLY DIRECTLY BUILDS NO CLOSURE (SP-037).
//
// A `const` bound to a lambda, or a block-local `function`, whose every use is a direct call in
// the frame that declares it is lambda-lifted: its captures travel as parameters after the env,
// so the frame allocates no environment and calls through no table. The fixtures under
// `tests/cases/closures/lift-*` grade what such programs PRINT; this suite grades the lowering,
// which a correct print cannot show — a program that still builds its closure prints the same.
// Each program is built without optimisation (binaryen would hide an allocation the emitter
// still writes), disassembled, and its host function is held to: no `struct.new`, no
// `call_indirect`. A control whose closure escapes must keep both, so a scan that stopped
// seeing the opcodes cannot pass quietly.
//
// GATING: needs the built binary, the seed and `wasm-dis` (`node_modules/.bin`, not on PATH).
// `ci-native` installs no npm deps, so it self-ignores there; the `ci-release-shape` job names
// this file and runs it with npm deps.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) {
  console.warn(
    "[closure-lift-shape] skipped — missing vl, the seed or wasm-dis",
  );
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

const disassemble = async (src: string): Promise<Map<string, string>> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-closure-lift-" });
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
    const d = await new Deno.Command(WASM_DIS, {
      args: [out],
      stdout: "piped",
    }).output();
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

const count = (body: string, op: string): number => body.split(op).length - 1;

const LIFTED: [string, string, string[]][] = [
  [
    "a lambda capturing a loop-local const (SP-037's own shape)",
    [
      "export function sum(n: i32): i32 {",
      "  let s = 0",
      "  for i in 0 until n {",
      "    const o = i * 64",
      "    const f = (k: i32): i32 => o + k * 4",
      "    s += f(0) + f(1) + f(3)",
      "  }",
      "  s",
      "}",
    ].join("\n"),
    ["sum"],
  ],
  [
    "a recursive block-local function capturing a const",
    [
      "export function host(p: i32): i32 {",
      "  const base = p * 2",
      "  function g(n: i32): i32 { if n <= 0 { base } else { 1 + g(n - 1) } }",
      "  g(3)",
      "}",
    ].join("\n"),
    ["host", "g"],
  ],
  [
    "a lifted lambda inside a lifted lambda",
    [
      "export function host(p: i32): i32 {",
      "  const c = p * 2",
      "  const outer = (x: i32): i32 => {",
      "    const inner = (y: i32): i32 => y + x + c",
      "    inner(1) + inner(2)",
      "  }",
      "  outer(1) + outer(2)",
      "}",
    ].join("\n"),
    ["host", "outer"],
  ],
];

for (const [name, src, fns] of LIFTED) {
  Deno.test({
    name: `closure lift shape: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const all = await disassemble(src);
      for (const fn of fns) {
        const body = bodyOf(all, fn);
        const allocs = count(body, "struct.new");
        const indirect = count(body, "call_indirect");
        if (allocs !== 0 || indirect !== 0) {
          throw new Error(
            `${fn}: want 0 struct.new and 0 call_indirect, got ${allocs} and ${indirect}\n${body}`,
          );
        }
      }
    },
  });
}

Deno.test({
  name:
    "closure lift shape: an escaping closure keeps its environment (control)",
  ignore: !ENABLED,
  fn: async () => {
    const all = await disassemble([
      "function apply(g: (i32) => i32, v: i32): i32 { g(v) }",
      "export function host(p: i32): i32 {",
      "  const c = p * 2",
      "  const f = (x: i32): i32 => x + c",
      "  apply(f, 1) + f(2)",
      "}",
    ].join("\n"));
    const host = bodyOf(all, "host");
    const allocs = count(host, "struct.new");
    const indirect = count(host, "call_indirect");
    if (allocs === 0 || indirect === 0) {
      throw new Error(
        `want the escaping closure built and called through the table, got ${allocs} struct.new and ${indirect} call_indirect\n${host}`,
      );
    }
  },
});
