// NATIVE `vl check <directory>` — the directory walk + multi-file aggregation is
// VL policy (compiler/cli.vl), driven over the command-queue pump (CMD_LIST_DIR).
// The host only lists one directory at a time; recursion, the SKIP_DIRS list, the
// `.vl` filter, file sorting, the per-file check loop, and the aggregate summary
// all live in VL.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.
//
// @test-timing native

import { makeTempDir } from "./support/filePath.ts";
import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-dir] skipped — missing vl binary or seed wasm.");
}

const check = async (
  target: string,
  extraArgs: string[] = [],
): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", target, "--concise", "--compiler", COMPILER, ...extraArgs],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

Deno.test({
  name: "vl-check-dir: walks recursively, aggregates a multi-file summary, skips SKIP_DIRS",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/a.vl`, "print(1)\n");
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/sub/b.vl`, "print(2)\n");
      // A non-.vl file and a SKIP_DIRS subtree must be ignored even though the
      // latter holds a .vl file that would otherwise fail to type-check.
      await Deno.writeTextFile(`${dir}/notes.txt`, "ignore me\n");
      await Deno.mkdir(`${dir}/node_modules`);
      await Deno.writeTextFile(`${dir}/node_modules/c.vl`, "let q: string = 5\n");

      const r = await check(dir);
      if (r.code !== 0) {
        throw new Error(`expected clean exit 0, got ${r.code}:\n${r.err}`);
      }
      // Two files (a.vl + sub/b.vl); node_modules/c.vl is skipped, so its type
      // error never surfaces and the count is 2.
      if (!r.err.includes("Checked 2 files, no errors.")) {
        throw new Error(`expected "Checked 2 files, no errors.", got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-dir: a type error under the tree fails the run",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/ok.vl`, "print(1)\n");
      await Deno.writeTextFile(`${dir}/bad.vl`, "let q: string = 5\n");
      const r = await check(dir);
      if (r.code !== 1) {
        throw new Error(`expected exit 1, got ${r.code}:\n${r.err}`);
      }
      if (!r.err.includes(`${dir}/bad.vl: error [1:17]`)) {
        throw new Error(`expected bad.vl error line, got:\n${r.err}`);
      }
      // The aggregate summary carries no single-file `(type error)` stage note.
      if (!/Found 1 error\b/.test(r.err) || r.err.includes("(type error)")) {
        throw new Error(`expected aggregate "Found 1 error" with no stage note, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-dir: --exclude gates a subtree and a basename glob",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/a.vl`, "print(1)\n");
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/sub/b.vl`, "let bad: string = 5\n"); // error
      await Deno.writeTextFile(`${dir}/x.gen.vl`, "let bad: string = 5\n"); // error

      // Exclude the `sub` subtree (relPath match) AND the generated file
      // (basename glob) — both errors are gated, leaving a clean run over a.vl.
      const both = await check(dir, ["--exclude", "sub", "--exclude", "*.gen.vl"]);
      if (both.code !== 0 || !both.err.includes("Checked 1 file, no errors.")) {
        throw new Error(`expected clean 1-file run, got ${both.code}:\n${both.err}`);
      }

      // Excluding only the subtree still surfaces the generated file's error.
      const justSub = await check(dir, ["--exclude=sub"]);
      if (justSub.code !== 1 || !justSub.err.includes(`${dir}/x.gen.vl: error`)) {
        throw new Error(`expected x.gen.vl error to remain, got ${justSub.code}:\n${justSub.err}`);
      }
      if (justSub.err.includes(`${dir}/sub/b.vl`)) {
        throw new Error(`sub/ should have been excluded, got:\n${justSub.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-dir: no path defaults to the current directory",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_dir_" });
    try {
      await Deno.writeTextFile(`${dir}/only.vl`, "print(42)\n");
      const { code, stderr } = await new Deno.Command(VL, {
        args: ["check", "--concise", "--compiler", COMPILER],
        cwd: dir,
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ NO_COLOR: "1" }),
      }).output();
      const err = new TextDecoder().decode(stderr);
      if (code !== 0 || !err.includes("Checked 1 file, no errors.")) {
        throw new Error(`expected cwd walk clean, got ${code}:\n${err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The root pool checks each root in a fresh instance and folds its report back in root
// order, so its output must be the in-process run's byte for byte. The fixture holds the
// cases that could tell them apart: a root whose diagnostics depend on which file is the
// entry, the missing-import scan (whose multi-exporter text reads earlier roots' scans,
// so the parent checks those roots itself), a sibling that does not lex, and an
// import's withheld warning.
Deno.test({
  name: "vl-check-dir: the root pool's report is the in-process report, byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_pool_" });
    try {
      const files: Record<string, string> = {
        "a.vl": "export function f(x) { return x * 2 }\n",
        "b.vl": 'import { f } from "./a"\nprint(f("s"))\n',
        "c.vl": 'import { f } from "./a"\nprint(f(3))\n',
        "d.vl": "export function helper() { return 1 }\n",
        "e.vl": "print(helper())\n",
        "g.vl": "print(helper2())\nprint(helper())\n",
        "h.vl": "export function helper2() { return 2 }\nexport function helper() { return 3 }\n",
        "i.vl": 'let s = "unterminated\n',
        "j.vl": "let x = 1\nprint(x)\n",
        "k.vl": 'import { w } from "./j2"\nprint(w)\n',
        "j2.vl": "export const w = 1\nlet unused = 2\n",
      };
      for (const [name, src] of Object.entries(files)) {
        await Deno.writeTextFile(`${dir}/${name}`, src);
      }
      const named = ["b.vl", "e.vl", "j.vl", "k.vl", "missing.vl"].map((f) => `${dir}/${f}`);
      const shapes: string[][] = [
        [dir],
        [dir, "--json"],
        [dir, "--severity", "info", "--json"],
        [dir, "--concise", "--include-imports"],
        ["--batch", "--json", ...named],
      ];
      const run = async (args: string[], jobs: string) => {
        const r = await new Deno.Command(VL, {
          args: ["check", ...args, "--compiler", COMPILER],
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1", VL_JOBS: jobs, VL_TEST_TRACE: "1" }),
        }).output();
        const err = new TextDecoder().decode(r.stderr).split("\n");
        const trace = err.filter((l) => l.startsWith("vl-test-trace workers phase=check"));
        return {
          code: r.code,
          out: new TextDecoder().decode(r.stdout),
          err: err.filter((l) => !l.startsWith("vl-test-trace")).join("\n"),
          trace: trace.join("\n"),
        };
      };
      for (const args of shapes) {
        const serial = await run(args, "1");
        const pooled = await run(args, "4");
        // The control: a pool of two or more actually ran (memory may cap it below
        // four), so the comparison below is not vacuous.
        if (!/n=([2-9]|\d\d)/.test(pooled.trace)) {
          throw new Error(`${args.join(" ")}: want a pool of 2+ workers, got ${JSON.stringify(pooled.trace)}`);
        }
        for (const k of ["code", "out", "err"] as const) {
          if (serial[k] !== pooled[k]) {
            throw new Error(
              `${args.join(" ")}: ${k} differs\nwant (VL_JOBS=1):\n${serial[k]}\ngot (pool):\n${pooled[k]}`,
            );
          }
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// The pool keeps a root with the roots its check can serve (`cliCheckParentOf`): z.vl reaches
// a.vl, which reaches b.vl, so the three form one tree a worker checks in order, and a.vl
// meets z.vl's check on the same instance. An idle worker may steal a.vl's subtree instead,
// which the trace marks; either way a.vl is served or stolen, never just re-checked, and the
// report is the in-process one.
Deno.test({
  name: "vl-check-dir: the root pool checks an importee after its importer, on one worker",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await makeTempDir({ prefix: "vl_check_tree_" });
    try {
      const files: Record<string, string> = {
        "a.vl": 'import { g } from "./b"\nexport function f(): i32 { g() }\n',
        "b.vl": "export function g(): i32 { 1 }\n",
        "m1.vl": "print(1)\n",
        "m2.vl": "print(2)\n",
        "m3.vl": "print(3)\n",
        "z.vl": 'import { f } from "./a"\nprint(f())\n',
      };
      for (const [name, src] of Object.entries(files)) {
        await Deno.writeTextFile(`${dir}/${name}`, src);
      }
      const run = async (jobs: string) => {
        const r = await new Deno.Command(VL, {
          args: ["check", dir, "--compiler", COMPILER],
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv({ NO_COLOR: "1", VL_JOBS: jobs, VL_TEST_TRACE: "1", VL_CHECK_STATS: "1" }),
        }).output();
        return { code: r.code, err: new TextDecoder().decode(r.stderr) };
      };
      const pooled = await run("2");
      const err = pooled.err;
      if (!err.includes("vl-test-trace check trees=4 sizes=3,1,1,1")) {
        throw new Error(`want z.vl, a.vl and b.vl in one tree of four, got:\n${err}`);
      }
      if (!err.includes("[check] served: roots=1 ") && !/check root=1 ms=\d+ \w+ stolen/.test(err)) {
        throw new Error(`want a.vl served from z.vl's check, or stolen, got:\n${err}`);
      }
      const report = (s: string) =>
        s.split("\n").filter((l) => !l.startsWith("vl-test-trace") && !l.startsWith("[check]"))
          .join("\n");
      const serial = await run("1");
      if (pooled.code !== serial.code || report(pooled.err) !== report(serial.err)) {
        throw new Error(`want the in-process report, got:\n${pooled.err}\nwant:\n${serial.err}`);
      }
      if (pooled.code !== 0 || !err.includes("Checked 6 files, no errors.")) {
        throw new Error(`want a clean check of 6 files, got ${pooled.code}:\n${err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
