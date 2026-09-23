// EVERY EMITTED GETTER BODY KEEPS THE CONTRACT THE CHECKER PROMISED (property-access-design.md
// §D3a-contract).
//
// The checker admits a getter body by reading its SOURCE; the promise is about its LOWERING. The
// two drifted three times in the first review (D2061, D2062, D2063: an `is "z"` that called a
// looping helper, a float `%` that looped). This suite builds every run-fixture under
// `tests/cases/getters/` and a program reading std:simd's four lane getters, disassembles each
// module, and holds each getter's own function body to the promise: no `loop`, no
// `struct.new`/`array.new*`, no indirect call, and a direct call only to another getter or to a
// leaf the contract admits (`__str_eq__`, which the checker charges a literal's length). A
// control program's method is held to the same scan and must be flagged, so a scan that stopped
// seeing an opcode cannot pass quietly.
//
// What it cannot see: HOW LONG a `__str_eq__` call walks. That helper is on the leaf list, so a
// compare the checker charged 0 (a literal it wrongly took for a tag compare) passes here; the
// step cost of a string compare is graded only by the checker fixtures. A trap arm — a `then`
// that prints the trap message through `__print_*` helpers and ends in `unreachable` — is
// stripped before the scan: a getter may trap, and the message is part of trapping.
//
// GATING: needs the built binary, the seed and `wasm-dis` (`node_modules/.bin`, not on PATH).
// `ci-native` installs no npm deps, so it self-ignores there; the `ci-release-shape` job names
// this file and runs it with npm deps.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_DIS);
if (!ENABLED) {
  console.warn(
    "[getter-body-shape] skipped — missing vl, the seed or wasm-dis",
  );
}

const CASES = `${ROOT}/tests/cases/getters`;
const SIMD = `${ROOT}/std/simd.vl`;

// The helpers a getter body may call: each is bounded by what the checker charged for it.
const LEAVES = new Set(["__str_eq__"]);

const SIMD_PROGRAM = [
  'import { f32x4 } from "std:simd"',
  "const v = f32x4(1.0, 2.0, 3.0, 4.0)",
  "print(v.x + v.y + v.z + v.w)",
].join("\n") + "\n";

// A method that loops, allocates and calls a user function: the scan must flag all three.
const CONTROL_PROGRAM = [
  "type P = { a: i32 }",
  "type C = new i32",
  "function helper(n: i32): i32 { return n + 1 }",
  "function spin(self: C): i32 {",
  "  let s = 0",
  "  while s < (self as! i32) { s = s + 1 }",
  "  const p: P = { a: helper(s) }",
  "  return p.a",
  "}",
  "print((3 as! C).spin())",
].join("\n") + "\n";

// The `(receiver, property)` pairs a source declares with `get p(self: T)`.
const gettersOf = (src: string): [string, string][] =>
  [...src.matchAll(/\bget\s+(\w+)\s*\(\s*self\s*:\s*(\w+)\s*\)/g)].map((
    m,
  ) => [m[2], m[1]]);

// Each function in a `wasm-dis` listing, by its `$name`, with its body text.
const functionsOf = (wat: string): Map<string, string> => {
  const out = new Map<string, string>();
  const lines = wat.split("\n");
  let name = "";
  let body: string[] = [];
  const flush = () => {
    if (name !== "") out.set(name, body.join("\n"));
  };
  for (const line of lines) {
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

// The function names that are getter `T.p`'s instances: `$T.p` then `@` or `$`.
const isGetterFn = (fn: string, getters: [string, string][]): boolean =>
  getters.some(([t, p]) =>
    fn.startsWith(`${t}.${p}@`) || fn.startsWith(`${t}.${p}$`)
  );

// What a body does that the contract forbids, one entry per fact.
// `body` with every trap arm removed: a `(then …)` whose last form is `(unreachable)` and whose
// only calls are to the `__print_*` trap-message helpers.
const stripTrapArms = (body: string): string => {
  let out = body;
  let from = 0;
  for (;;) {
    const at = out.indexOf("(then", from);
    if (at < 0) return out;
    let depth = 0;
    let end = at;
    for (; end < out.length; end++) {
      if (out[end] === "(") depth++;
      else if (out[end] === ")" && --depth === 0) break;
    }
    const arm = out.slice(at, end + 1);
    const inner = arm.slice(0, -1).trimEnd();
    const calls = [...arm.matchAll(/\(call \$(\S+)/g)].map((m) => m[1]);
    if (
      inner.endsWith("(unreachable)") &&
      calls.every((c) => c.startsWith("__print_"))
    ) {
      out = out.slice(0, at) + out.slice(end + 1);
    } else {
      from = at + 1;
    }
  }
};

const violations = (
  body: string,
  isGetter: (fn: string) => boolean,
): string[] => {
  const bad: string[] = [];
  if (/\(loop\b/.test(body)) bad.push("a loop");
  const alloc = body.match(/\((struct\.new\w*|array\.new\w*)/);
  if (alloc) bad.push(`an allocation (${alloc[1]})`);
  const indirect = body.match(/\(((?:return_)?call_(?:ref|indirect))/);
  if (indirect) bad.push(`an indirect call (${indirect[1]})`);
  // A tail call (`return_call`) is still a direct call to a named function.
  for (const m of body.matchAll(/\((?:return_)?call \$(\S+)/g)) {
    const callee = m[1];
    if (!LEAVES.has(callee) && !isGetter(callee)) {
      bad.push(`a call to $${callee}`);
    }
  }
  return bad;
};

const build = async (
  dir: string,
  src: string,
  name: string,
): Promise<string> => {
  const out = `${dir}/${name}.wasm`;
  const p = await new Deno.Command(VL, {
    args: ["build", src, "--names", "-o", out, "--compiler", COMPILER],
    env: nativeEnv(),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!p.success) {
    const err = new TextDecoder().decode(p.stdout) +
      new TextDecoder().decode(p.stderr);
    throw new Error(`vl build ${name} failed: ${err}`);
  }
  const d = await new Deno.Command(WASM_DIS, { args: [out], stdout: "piped" })
    .output();
  return new TextDecoder().decode(d.stdout);
};

// Builds `src` and returns every getter function's violations, and how many getters it saw.
const scan = async (
  src: string,
  name: string,
  getters: [string, string][],
): Promise<{ seen: number; bad: string[] }> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-getter-shape-" });
  try {
    const fns = functionsOf(await build(dir, src, name));
    const isGetter = (fn: string) => isGetterFn(fn, getters);
    let seen = 0;
    const bad: string[] = [];
    for (const [fn, body] of fns) {
      if (!isGetter(fn)) continue;
      seen++;
      for (const v of violations(stripTrapArms(body), isGetter)) {
        bad.push(`$${fn}: ${v}`);
      }
    }
    return { seen, bad };
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

const runFixtures = ENABLED
  ? [...Deno.readDirSync(CASES)]
    .filter((e) => e.isFile && e.name.endsWith(".vl"))
    .map((e) => e.name)
    .filter((n) => Deno.readTextFileSync(`${CASES}/${n}`).startsWith("// @run"))
    .sort()
  : [];

for (const name of runFixtures) {
  Deno.test({
    name: `getter body shape: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const path = `${CASES}/${name}`;
      const getters = gettersOf(Deno.readTextFileSync(path));
      const { seen, bad } = await scan(
        path,
        name.replace(/\.vl$/, ""),
        getters,
      );
      if (getters.length > 0 && seen === 0) {
        throw new Error(
          `${name}: declares ${getters.length} getter(s) and none was found`,
        );
      }
      if (bad.length > 0) {
        throw new Error(
          `${name}: a getter body breaks the contract:\n${bad.join("\n")}`,
        );
      }
    },
  });
}

Deno.test({
  name: "getter body shape: std:simd lane getters",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-getter-simd-" });
    try {
      const src = `${dir}/simd.vl`;
      Deno.writeTextFileSync(src, SIMD_PROGRAM);
      const getters = gettersOf(Deno.readTextFileSync(SIMD));
      const { seen, bad } = await scan(src, "simd", getters);
      if (seen !== 4) {
        throw new Error(
          `std:simd: want the 4 lane getters emitted, saw ${seen}`,
        );
      }
      if (bad.length > 0) {
        throw new Error(
          `std:simd: a lane getter breaks the contract:\n${bad.join("\n")}`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "getter body shape: the scan flags a looping, allocating, calling body (control)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-getter-ctl-" });
    try {
      const src = `${dir}/control.vl`;
      Deno.writeTextFileSync(src, CONTROL_PROGRAM);
      // Scan `spin` as though it were a getter of `C`.
      const fns = functionsOf(await build(dir, src, "control"));
      const spin = [...fns].find(([fn]) => fn.startsWith("spin"));
      if (!spin) {
        throw new Error(
          `control: no $spin function in ${[...fns.keys()].join(", ")}`,
        );
      }
      const got = violations(spin[1], () => false).map((v) =>
        v.replace(/ \(.*\)$/, "")
      );
      for (const want of ["a loop", "an allocation"]) {
        if (!got.includes(want)) {
          throw new Error(
            `control: want "${want}" flagged, got ${JSON.stringify(got)}`,
          );
        }
      }
      if (!got.some((v) => v.startsWith("a call to $helper"))) {
        throw new Error(
          `control: want the call to helper flagged, got ${
            JSON.stringify(got)
          }`,
        );
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
