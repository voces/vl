// NATIVE — a module the engine refuses for a heap-type mismatch names the two types, on all
// three channels (`vl run`, `vl build`, `vl check --codegen`), and names the function as the
// source spells it (lane DG, sunpa diagnostics C).
//
// The validator prints every concrete reference as `(ref $type)`, so the sentence was
// `expected (ref $type), found (ref null $type)` and named nothing. The host re-validates the
// module, reads the two types off the failing operator, and writes each module type index with
// its VL name (asked of the compiler that emitted the module) and its struct or array shape.
//
// THE WITNESSES MUST STILL BE INVALID: D3832 (two spellings) and D3817 are
// check-clean invalid wasm on the seed this lands on. When one is fixed its case goes red at the
// "still check-clean" or exit-code assertion; replace it with any other such program.
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
    name: "D3832: a record expected where an i32 arrives names the record",
    files: {
      "r.vl": "type A = { x: i32 }\n" +
        'function tag(self: A): string { "A" }\n' +
        "function mk(x: string) {\n" +
        "  const c = (y) => y.tag()\n" +
        "  x\n" +
        "}\n" +
        'print(mk("a"))\n',
    },
    entry: "r.vl",
    want: [
      "failed to validate inside `c`",
      "type mismatch: expected (ref $0), found i32; $0 is `A`, struct {mut i32}",
    ],
    never: ["$type"],
  },
  {
    name: "D3832: a string expected where an i32 arrives names `string` and its shape",
    files: {
      "s.vl": "function mk(x: string) {\n" +
        '  const c = (y) => y + "C"\n' +
        "  x\n" +
        "}\n" +
        'print(mk("a"))\n',
    },
    entry: "s.vl",
    want: [
      "failed to validate inside `c`",
      "type mismatch: expected (ref $2), found i32; $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["$type"],
  },
  {
    name:
      "D3817: a canonical type id is a module index, and a merged function its source name",
    files: {
      "s.vl":
        'export function describe(self: string): string { "string " + self }\n',
      "main.vl":
        'import { describe } from "./s"\nexport function d(x) { x.describe() }\nprint(1)\n',
    },
    entry: "main.vl",
    want: [
      "failed to validate inside `d`",
      "callee returns [(ref $2)]; $2 is `string`, struct {(ref $1), i32, i32, mut i32}",
    ],
    never: ["(id ", "d$m0"],
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
