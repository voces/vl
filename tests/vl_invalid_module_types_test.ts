// NATIVE — a module the engine refuses for a heap-type mismatch names the two types, on all
// three channels (`vl run`, `vl build`, `vl check --codegen`), and names the function as the
// source spells it (lane DG, sunpa diagnostics C).
//
// The validator prints every concrete reference as `(ref $type)`, so the sentence was
// `expected (ref $type), found (ref null $type)` and named nothing. The host re-validates the
// module, reads the two types off the failing operator, and writes each module type index with
// its VL name (asked of the compiler that emitted the module) and its struct or array shape.
//
// THE WITNESSES MUST STILL BE INVALID: D2416 and D1974 (one module and two) are check-clean
// invalid wasm on the seed this lands on. When one is fixed its case goes red at the "still
// check-clean" or exit-code assertion; replace it with any other such program.
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
  // Each text must appear on every channel.
  want: string[];
  // Text no channel may print.
  never: string[];
};

const CASES: Case[] = [
  {
    name: "D2416: a record arriving where an i32 is expected names the record",
    files: {
      "r.vl": "type A = { r: i32 }\n" +
        "function st(): A { return { r: 8 } }\n" +
        "function mkB(): boolean | null { return null }\n" +
        "function take(a) {\n" +
        "  const f = a ?? st()\n" +
        "  if f is A { print(f.r) } else { print(0) }\n" +
        "}\n" +
        "take(mkB())\n",
    },
    entry: "r.vl",
    want: [
      "failed to validate inside `take`",
      "type mismatch: expected i32, found (ref $0); $0 is `A`, struct {mut i32}",
    ],
    never: ["$type"],
  },
  {
    name:
      "D1974: a string expected where an i32 arrives names `string` and its shape",
    files: {
      "s.vl": "function f(k: i32): string {\n" +
        "  {\n" +
        '    return "a"\n' +
        "  }\n" +
        "  5\n" +
        "}\n" +
        "print(f(1))\n",
    },
    entry: "s.vl",
    want: [
      "failed to validate inside `f`",
      "type mismatch: expected (ref $2), found i32; $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["$type"],
  },
  {
    // D1974's function moved into an imported module.
    name:
      "D1974: a canonical type id is a module index, and a merged function its source name",
    files: {
      "s.vl": "export function f(k: i32): string {\n" +
        "  {\n" +
        '    return "a"\n' +
        "  }\n" +
        "  5\n" +
        "}\n",
      "main.vl": 'import { f } from "./s"\n' +
        "function d(x: i32) {\n" +
        "  print(f(x))\n" +
        "}\n" +
        "d(1)\n",
    },
    entry: "main.vl",
    want: [
      "failed to validate inside `f`",
      "type mismatch: expected (ref $2), found i32; $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["(id ", "f$m", "d$m0"],
  },
  // The string-keyed map struct is one heap type for every string-keyed map and set, so it is
  // named by its rep: a `Set<string>` must not be called `{[string]: i32}`.
  {
    name:
      "a heap type several VL types share is named by its rep, not by one of them",
    files: {
      "s.vl": "type T = Set<string>\n" +
        'function d(self: T): string { "RS" }\n' +
        "function h<T>(x: T): string { x.d() }\n" +
        "const a: T = Set()\n" +
        "print([a].map((x) => h(x))[0])\n",
    },
    entry: "s.vl",
    want: [
      "type mismatch: expected (ref $",
      "is `string-keyed map or set`, struct {",
    ],
    never: ["$type", "{[string]: i32}"],
  },
];

for (const c of CASES) {
  Deno.test({
    name: `vl-invalid-module-types: ${c.name}`,
    ignore: !ENABLED,
    fn: async () => {
      await withDir(c.files, async (dir) => {
        const chk = await run(["check", c.entry], dir);
        if (chk.code !== 0) {
          throw new Error(
            `the witness no longer check-cleans (fixed?) — replace it:\n${chk.out}`,
          );
        }
        const channels: [string, string[]][] = [
          ["run", ["run", c.entry]],
          ["build", ["build", c.entry, "-o", `${dir}/out.wasm`]],
          ["check --codegen", ["check", "--codegen", c.entry]],
        ];
        for (const [what, args] of channels) {
          const r = await run(args, dir);
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
          for (const n of c.never) {
            if (r.out.includes(n)) {
              throw new Error(`${what}: must not print \`${n}\`:\n${r.out}`);
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
