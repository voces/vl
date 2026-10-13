// NATIVE — a module the engine refuses for a heap-type mismatch names the two types, on all
// three channels (`vl run`, `vl build`, `vl check --codegen`), and names the function as the
// source spells it (lane DG, sunpa diagnostics C).
//
// The validator prints every concrete reference as `(ref $type)`, so the sentence was
// `expected (ref $type), found (ref null $type)` and named nothing. The host re-validates the
// module, reads the two types off the failing operator, and writes each module type index with
// its VL name (asked of the compiler that emitted the module) and its struct or array shape.
//
// NO WITNESS IS A LIVE COMPILER DEFECT. The invalid module is made by
// `$VL_FAULT_INJECT=wrong-ref:<type>[:<body>]`, which rewrites one emitted body to hand
// `ref.null $type` to a `struct.get` of another struct type, so the validator's sentence is the
// production one (`expected (ref null $type), found (ref null $type)`) over a VALID program.
// Which type index is the record, the string or the map, and which body is `f`, is the
// emitter's layout and changes with it, so each case sweeps the index until the namer's output
// names what the case is about, then checks all three channels at that index.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` plus the built binary and seed.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-invalid-module-types] skipped — missing vl binary or seed wasm.",
  );
}

const EXIT_COMPILER_BUG = 70;

const run = async (
  args: string[],
  cwd: string,
  fault = "",
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: {
      RUST_BACKTRACE: "0",
      NO_COLOR: "1",
      VL_STD: `${ROOT}/std`,
      VL_FAULT_INJECT: fault,
    },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

const withDir = async (
  files: Record<string, string>,
  body: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-invalid-module-types-" });
  try {
    for (const [name, src] of Object.entries(files)) {
      Deno.writeTextFileSync(`${dir}/${name}`, src);
    }
    await body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

type Case = {
  name: string;
  files: Record<string, string>;
  entry: string;
  // Sweep the faulted TYPE or the faulted function BODY until `hit` accepts the output.
  sweep: "type" | "body";
  hit: (out: string) => boolean;
  // Each text must appear on every channel.
  want: string[];
  // Text no channel may print.
  never: string[];
};

const CASES: Case[] = [
  {
    name: "a record arriving where another type is expected names the record",
    files: {
      "r.vl": "type A = { r: i32 }\n" +
        "function mk(): A[] { [{ r: 1 }] }\n" +
        "print(mk().length)\n",
    },
    entry: "r.vl",
    sweep: "type",
    hit: (o) => o.includes("is `A`, struct {mut i32}"),
    want: ["failed to validate inside `mk`", "is `A`, struct {mut i32}"],
    never: ["$type"],
  },
  {
    name:
      "a string where another type is expected names `string` and its shape",
    files: {
      "s.vl": 'function f(k: i32): string { "a" }\n' + "print(f(1))\n",
    },
    entry: "s.vl",
    sweep: "type",
    hit: (o) => o.includes("is `string`, struct {"),
    want: ["failed to validate inside", "is `string`, struct {"],
    never: ["$type"],
  },
  {
    name:
      "a canonical type id is a module index, and a merged function its source name",
    files: {
      // A loop, so `f` is neither inlined away nor too short for the fault to rewrite.
      "s.vl": 'export function f(k: i32): string {\n  let s = "a"\n' +
        '  for i in 0 to k {\n    s = s + "b"\n  }\n  return s\n}\n',
      "main.vl": 'import { f } from "./s"\n' +
        "function d(x: i32) {\n" +
        "  print(f(x))\n" +
        "}\n" +
        "d(1)\n",
    },
    entry: "main.vl",
    sweep: "body",
    hit: (o) => o.includes("inside `f`"),
    want: [
      "failed to validate inside `f`",
      "type mismatch: expected (ref null $",
    ],
    never: ["(id ", "f$m", "d$m0", "$type"],
  },
  // The string-keyed map struct is one heap type for every string-keyed map and set, so it is
  // named by its rep: a `Set<string>` must not be called `{[string]: i32}`.
  {
    name:
      "a heap type several VL types share is named by its rep, not by one of them",
    files: {
      "s.vl": 'const a: Set<string> = Set()\na.add("x")\nprint(a.length)\n',
    },
    entry: "s.vl",
    sweep: "type",
    hit: (o) => o.includes("is `string-keyed map or set`, struct {"),
    want: ["is `string-keyed map or set`, struct {"],
    never: ["$type", "{[string]: i32}"],
  },
];

const faultOf = (c: Case, i: number) =>
  c.sweep === "type" ? `wrong-ref:${i}` : `wrong-ref:0:${i}`;

// How many types (or bodies) the emitted module has: the fault's own refusal says.
const countOf = async (c: Case, dir: string): Promise<number> => {
  const r = await run(["check", "--codegen", c.entry], dir, faultOf(c, 100000));
  const word = c.sweep === "type" ? "types" : "bodies";
  const m = r.out.match(new RegExp(`has (\\d+) ${word}`));
  if (!m) throw new Error(`the fault did not report a count:\n${r.out}`);
  return Number(m[1]);
};

for (const c of CASES) {
  Deno.test({
    name: `vl-invalid-module-types: ${c.name}`,
    ignore: !ENABLED,
    fn: async () => {
      await withDir(c.files, async (dir) => {
        // The control: with no fault the program is valid and runs.
        const chk = await run(["check", c.entry], dir);
        const clean = await run(["run", c.entry], dir);
        if (chk.code !== 0 || clean.code !== 0) {
          throw new Error(
            `the program must check and run clean:\n${chk.out}${clean.out}`,
          );
        }
        const n = await countOf(c, dir);
        let at = -1;
        for (let lo = 0; lo < n && at < 0; lo += 8) {
          const idx = Array.from(
            { length: Math.min(8, n - lo) },
            (_, k) => lo + k,
          );
          const outs = await Promise.all(
            idx.map((i) =>
              run(["check", "--codegen", c.entry], dir, faultOf(c, i))
            ),
          );
          const k = outs.findIndex((o) => c.hit(o.out));
          if (k >= 0) at = idx[k];
        }
        if (at < 0) {
          throw new Error(
            `none of the ${n} faulted ${c.sweep}s satisfied the case`,
          );
        }
        const channels: [string, string[]][] = [
          ["run", ["run", c.entry]],
          ["build", ["build", c.entry, "-o", `${dir}/out.wasm`]],
          ["check --codegen", ["check", "--codegen", c.entry]],
        ];
        for (const [what, args] of channels) {
          const r = await run(args, dir, faultOf(c, at));
          if (r.code !== EXIT_COMPILER_BUG) {
            throw new Error(
              `${what}: want exit ${EXIT_COMPILER_BUG}, got ${r.code}\n${r.out}`,
            );
          }
          for (const w of c.want) {
            if (!r.out.includes(w)) {
              throw new Error(`${what}: want \`${w}\`, got:\n${r.out}`);
            }
          }
          for (const x of c.never) {
            if (r.out.includes(x)) {
              throw new Error(`${what}: must not print \`${x}\`:\n${r.out}`);
            }
          }
        }
      });
    },
  });
}

// `array.new_fixed`'s element count is read off the module, so a corrupt count must not size
// the namer's allocation: 2^32-1 aborted the host with `memory allocation of … failed`. The
// fault rewrites real emitted bytes between emission and validation (`$VL_FAULT_INJECT`).
Deno.test({
  name:
    "vl-invalid-module-types: a corrupt array.new_fixed count is reported, not allocated",
  ignore: !ENABLED,
  fn: async () => {
    const src = "function first(xs: string[]): string { xs[0] }\n" +
      'const xs: string[] = ["a", "b"]\n' +
      "print(first(xs))\n";
    await withDir({ "l.vl": src }, async (dir) => {
      const channels: [string, string[]][] = [
        ["build", ["build", "l.vl", "-o", `${dir}/out.wasm`]],
        ["check --codegen", ["check", "--codegen", "l.vl"]],
      ];
      for (const [what, args] of channels) {
        const r = await run(args, dir, "huge-array-new-fixed");
        if (r.code !== EXIT_COMPILER_BUG) {
          throw new Error(
            `${what}: want exit ${EXIT_COMPILER_BUG}, got ${r.code}\n${r.out}`,
          );
        }
        const want = "failed to validate inside `first`";
        if (!r.out.includes(want)) {
          throw new Error(`${what}: want \`${want}\`, got:\n${r.out}`);
        }
        if (r.out.includes("memory allocation")) {
          throw new Error(
            `${what}: the host sized an allocation off the module:\n${r.out}`,
          );
        }
      }
    });
  },
});
