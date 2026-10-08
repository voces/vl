// NATIVE `vl check --fix` — the lint auto-fix, computed and applied in VL
// (compiler/cli.vl) and written back via the command-queue pump (CMD_WRITE_FILE).
// The fixes: prefer-const, a redundant type annotation, an unused import. They run in
// rounds to a fixpoint, since one can expose another.
// `--fix` deliberately does NOT touch unused variables OR parameters: the
// `_`-prefix silences a warning, and whether that's right depends on intent
// (genuinely-unused vs forgotten-after-refactor), so it stays a human choice.
// The lint still reports them.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) console.warn("[vl-check-fix] skipped — missing vl binary or seed wasm.");

const fix = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--fix", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

Deno.test({
  name: "vl-check-fix: applies prefer-const only; leaves unused var/param (still reported); idempotent",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_fix_" });
    try {
      const f = `${dir}/a.vl`;
      // The `: i64` return is NOT redundant (the i32 body widens to it), so the
      // redundant-return fix leaves it — keeping this case focused on prefer-const.
      const before =
        "function f(a: i32, b: i32): i64 { b }\nlet unusedLocal = 1\nlet keep = 2\nprint(f(keep, keep))\n";
      await Deno.writeTextFile(f, before);
      const r = await fix(f);
      if (r.code !== 0) throw new Error(`--fix exited ${r.code}:\n${r.err}`);
      // Only `let keep` → `const keep`. The unused param `a` and unused local are
      // untouched.
      const want =
        "function f(a: i32, b: i32): i64 { b }\nlet unusedLocal = 1\nconst keep = 2\nprint(f(keep, keep))\n";
      const after = await Deno.readTextFile(f);
      if (after !== want) throw new Error(`unexpected fixed source:\n${after}`);
      // The unused param + local are still reported, and nothing more is applied.
      const r2 = await fix(f);
      if (r2.code !== 0 || r2.err.includes("Applied")) {
        throw new Error(`expected idempotent re-run, got ${r2.code}:\n${r2.err}`);
      }
      if (
        !r2.err.includes("Unused parameter `a`") ||
        !r2.err.includes("Unused variable `unusedLocal`")
      ) {
        throw new Error(`expected unused param + local still reported:\n${r2.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl-check-fix: iterates to a fixpoint, removes the import it orphaned, keeps exported signatures (D3597)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_fix_rounds_" });
    try {
      const f = `${dir}/a.vl`;
      // Removing `: Buf` orphans the `Buf` import, which only the next round can see. The
      // exported function's return and the exported const's type are API and stay.
      const before = 'import { Buffer, Buf } from "std:buffer"\n' +
        "export function f(x: i32): i32 { x + 1 }\n" +
        "export const m: i32 = 4\n" +
        "const b: Buf = Buffer(8)\n" +
        "print(f(m) + b.length)\n";
      await Deno.writeTextFile(f, before);
      const r = await fix(f);
      if (r.code !== 0) throw new Error(`--fix exited ${r.code}:\n${r.err}`);
      const want = 'import { Buffer } from "std:buffer"\n' +
        "export function f(x: i32): i32 { x + 1 }\n" +
        "export const m: i32 = 4\n" +
        "const b = Buffer(8)\n" +
        "print(f(m) + b.length)\n";
      const after = await Deno.readTextFile(f);
      if (after !== want) throw new Error(`unexpected fixed source:\n${after}`);
      const note = "Applied 2 fix(es) in 2 round(s): 1 redundant type annotation, 1 unused import.";
      if (!r.err.includes(note)) throw new Error(`expected the summary "${note}", got:\n${r.err}`);
      const r2 = await fix(f);
      if (r2.code !== 0 || r2.err.includes("Applied") || r2.err.includes("Unused import")) {
        throw new Error(`expected a clean idempotent re-run, got ${r2.code}:\n${r2.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-fix: an unused import of the program's own module stays whole (it may run code)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_check_fix_own_" });
    try {
      await Deno.writeTextFile(
        `${dir}/dep.vl`,
        'print("dep runs")\nexport const x = 1\nexport const y = 2\n',
      );
      const f = `${dir}/a.vl`;
      await Deno.writeTextFile(
        f,
        'import { x } from "./dep"\nimport { x as x2, y } from "./dep"\nprint(y)\n',
      );
      const r = await fix(f);
      if (r.code !== 0) throw new Error(`--fix exited ${r.code}:\n${r.err}`);
      // Dropping the first import would skip dep's top-level `print`; one specifier of the
      // second can go, since that statement stays.
      const want = 'import { x } from "./dep"\nimport { y } from "./dep"\nprint(y)\n';
      const after = await Deno.readTextFile(f);
      if (after !== want) throw new Error(`unexpected fixed source:\n${after}`);
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// ---- missing imports (lane IM): an error whose one exporter names the edit ------------

const check = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

// Writes `files` to a temp dir, runs `--fix` on `main.vl`, and compares the result with
// `want`. A `want` equal to the input is the no-edit case: nothing may be applied. Else the
// fixed file must re-check clean, which is the proof the edit was the right one.
const fixCase = (name: string, files: Record<string, string>, want: string) =>
  Deno.test({
    name: `vl-check-fix: ${name}`,
    ignore: !ENABLED,
    fn: async () => {
      const dir = await Deno.makeTempDir({ prefix: "vl_check_fix_imp_" });
      try {
        for (const [rel, src] of Object.entries(files)) {
          await Deno.mkdir(`${dir}/${rel}`.replace(/\/[^/]*$/, ""), { recursive: true });
          await Deno.writeTextFile(`${dir}/${rel}`, src);
        }
        const f = `${dir}/main.vl`;
        const r = await fix(f);
        const after = await Deno.readTextFile(f);
        if (after !== want) {
          throw new Error(`fixed source: want\n${want}\ngot\n${after}\n(stderr:\n${r.err})`);
        }
        if (want === files["main.vl"]) {
          if (r.err.includes("Applied")) throw new Error(`nothing may be applied:\n${r.err}`);
          if (r.code === 0) throw new Error("the errors must stand");
          return;
        }
        const r2 = await check(f);
        if (r2.code !== 0) throw new Error(`the fixed file must check clean:\n${r2.err}`);
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    },
  });

const TERRAIN = "export function height(x: i32): i32 { x * 2 }\n" +
  "export const SEA = 3\nexport function other(): i32 { 1 }\n";

fixCase(
  "an undeclared name joins its module's existing import, or a new one, local or std",
  {
    "terrain.vl": TERRAIN,
    "sub/side.vl": "export function side(): i32 { 5 }\n",
    "mid.vl": 'import { side } from "./sub/side"\nexport function mid(): i32 { side() }\n',
    "main.vl": 'import { mid } from "./mid"\nimport { other } from "./terrain"\n' +
      "print(mid() + height(2) + SEA + other() + side())\nprint(hypotF64(3.0, 4.0))\n" +
      "const xs = [1, 2, 3]\nprint(xs.includes(2))\n",
  },
  'import { mid } from "./mid"\nimport { other, height, SEA } from "./terrain"\n' +
    'import { side } from "./sub/side"\nimport { hypotF64 } from "std:math"\n' +
    'import { includes } from "std:array"\n' +
    "print(mid() + height(2) + SEA + other() + side())\nprint(hypotF64(3.0, 4.0))\n" +
    "const xs = [1, 2, 3]\nprint(xs.includes(2))\n",
);

fixCase(
  "a name imported from a module that does not export it moves to the one that does",
  {
    "terrain.vl": TERRAIN,
    "mid.vl": 'import { height } from "./terrain"\nexport function mid(): i32 { height(1) }\n',
    "main.vl": 'import { height } from "./mid"\nimport { mid, SEA } from "./mid"\n' +
      "print(height(1) + mid() + SEA)\n",
  },
  // `height` is its import's only name, so the specifier changes; `SEA` leaves a list and
  // joins that import in the next round.
  'import { height, SEA } from "./terrain"\nimport { mid } from "./mid"\n' +
    "print(height(1) + mid() + SEA)\n",
);

fixCase(
  "a std name imported from the wrong std module moves to the one that declares it",
  {
    "main.vl": 'import { includes, join } from "std:array"\nconst xs = [1, 2]\n' +
      'print(xs.includes(1))\nprint(["a", "b"].join("-"))\n',
  },
  'import { includes } from "std:array"\nimport { join } from "std:str"\nconst xs = [1, 2]\n' +
    'print(xs.includes(1))\nprint(["a", "b"].join("-"))\n',
);

fixCase(
  "a method's receiver picks the module, and a re-export counts as its declaring module",
  {
    "main.vl": 'const s = "a,b"\nconst parts = ["a", "b"]\n' +
      'print(s.lastIndexOf(","))\nprint(parts.join("/"))\n',
  },
  'import { lastIndexOf, join } from "std:str"\nconst s = "a,b"\nconst parts = ["a", "b"]\n' +
    'print(s.lastIndexOf(","))\nprint(parts.join("/"))\n',
);

fixCase(
  "two exporters: the message lists both and nothing is edited",
  {
    "a.vl": "export function dup(): i32 { 1 }\n",
    "b.vl": "export function dup(): i32 { 2 }\n",
    "main.vl": 'import { dup as one } from "./a"\nimport { dup as two } from "./b"\n' +
      "print(one() + two() + dup())\n",
  },
  'import { dup as one } from "./a"\nimport { dup as two } from "./b"\n' +
    "print(one() + two() + dup())\n",
);

fixCase(
  "one name asked of two modules by two receivers: neither import is added",
  {
    "main.vl": 'const s = "a,b"\nconst xs = [1, 2]\n' +
      'print(s.lastIndexOf(","))\nprint(xs.lastIndexOf(2))\n',
  },
  'const s = "a,b"\nconst xs = [1, 2]\n' +
    'print(s.lastIndexOf(","))\nprint(xs.lastIndexOf(2))\n',
);
