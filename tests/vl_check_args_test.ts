// NATIVE `vl check` / `vl fmt` STRICT ARG PARSING — usage errors are VL policy
// (compiler/cli.vl cliParseArgs) driven over the command-queue pump. An unknown
// flag or a second positional argument exits 2 with a usage message instead of
// being silently ignored (`vl check a.vl b.vl` must not quietly check only
// `a.vl`), and a value-taking flag never swallows the host-injected trailing
// `--color=<v>` as its value.
//
// GATING: same as tests/vl_check_dir_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-args] skipped — missing vl binary or seed wasm.");
}

// Run `vl <args>` with a clean, valid probe file available for positional use.
const run = async (
  args: string[],
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

// A tiny valid file to point the positional args at.
const withProbe = async (
  fn: (file: string, dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_args_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, "print(1)\n");
  try {
    await fn(file, dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name:
    "check: several paths are each checked in turn, files and directories alike (DV-102)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      const other = `${dir}/other.vl`;
      await Deno.writeTextFile(other, "print(2)\n");
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/sub/bad.vl`, "print(zz)\n");
      const two = await run(["check", file, other]);
      if (two.code !== 0 || !two.err.includes("Checked 2 files, no errors.")) {
        throw new Error(
          `two clean files: want rc 0 and "Checked 2 files", got ${two.code}: ${two.err}`,
        );
      }
      const mixed = await run(["check", file, `${dir}/sub`]);
      if (
        mixed.code !== 1 || !mixed.err.includes("undeclared identifier 'zz'")
      ) {
        throw new Error(
          `a file and a directory: want the directory's error, got ${mixed.code}: ${mixed.err}`,
        );
      }
      const missing = await run(["check", file, `${dir}/nope.vl`]);
      if (
        missing.code !== 2 ||
        !missing.err.includes(`cannot read ${dir}/nope.vl`)
      ) {
        throw new Error(
          `a missing second path: want exit 2 naming it, got ${missing.code}: ${missing.err}`,
        );
      }
    });
  },
});

Deno.test({
  name: "fmt and test: several paths are each handled in turn (DV-102)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      const other = `${dir}/other.vl`;
      await Deno.writeTextFile(other, "const   x=1\nprint(x)\n");
      const fmt = await run(["fmt", "-w", file, other]);
      if (fmt.code !== 0) {
        throw new Error(`fmt -w: want rc 0, got ${fmt.code}: ${fmt.err}`);
      }
      const after = await Deno.readTextFile(other);
      if (after !== "const x = 1\nprint(x)\n") {
        throw new Error(`fmt -w left: ${after}`);
      }
      const t =
        'import { it, expect } from "std:test"\nit("t", () => { expect(1).toEqual(1) })\n';
      await Deno.mkdir(`${dir}/sub`);
      await Deno.writeTextFile(`${dir}/a.test.vl`, t);
      await Deno.writeTextFile(`${dir}/sub/b.test.vl`, t);
      const test = await run(["test", `${dir}/a.test.vl`, `${dir}/sub`]);
      if (test.code !== 0 || !(test.out + test.err).includes("2 files")) {
        throw new Error(
          `test: want both files run, got ${test.code}: ${test.out}${test.err}`,
        );
      }
    });
  },
});

Deno.test({
  name: "check: an unknown flag is a usage error (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const { code, err } = await run(["check", file, "--frobnicate"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("unknown flag `--frobnicate`")) {
        throw new Error(`expected unknown-flag usage error, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name:
    "check: a trailing valueless --severity errors instead of swallowing the host's --color",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      // The host appends a synthetic `--color=<v>` AFTER user args; a bare
      // `--severity` must not consume it as its value.
      const { code, err } = await run(["check", file, "--severity"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("--severity requires a value")) {
        throw new Error(`expected severity-value usage error, got: ${err}`);
      }
      if (err.includes("--color")) {
        throw new Error(`--severity swallowed the injected --color: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "fmt: a check-only flag is a usage error (exit 2)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const { code, err } = await run(["fmt", file, "--fix"]);
      if (code !== 2) throw new Error(`expected exit 2, got ${code}: ${err}`);
      if (!err.includes("fmt: unknown flag `--fix`")) {
        throw new Error(`expected fmt unknown-flag usage error, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "check: valid flags still parse (severity value, exclude value)",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file) => {
      const ok = await run(["check", file, "--severity", "warning"]);
      if (ok.code !== 0) {
        throw new Error(`expected exit 0, got ${ok.code}: ${ok.err}`);
      }
      const eq = await run(["check", file, "--severity=warning"]);
      if (eq.code !== 0) {
        throw new Error(`expected exit 0, got ${eq.code}: ${eq.err}`);
      }
    });
  },
});

Deno.test({
  name:
    "several paths: two directories with different files, deduplicated, all checked to exist first",
  ignore: !ENABLED,
  fn: async () => {
    await withProbe(async (file, dir) => {
      await Deno.mkdir(`${dir}/d1`);
      await Deno.mkdir(`${dir}/d2`);
      await Deno.writeTextFile(`${dir}/d1/c.vl`, "print(1)\n");
      await Deno.writeTextFile(`${dir}/d1/e.vl`, "print(2)\n");
      await Deno.writeTextFile(`${dir}/d2/f.vl`, "print(3)\n");
      for (const args of [["d1", "d2"], ["d2", "d1"]]) {
        const r = await run(["check", ...args.map((a) => `${dir}/${a}`)]);
        if (r.code !== 0 || !r.err.includes("Checked 3 files, no errors.")) {
          throw new Error(
            `check ${args.join(" ")}: want 3 files, got ${r.code}: ${r.err}`,
          );
        }
      }
      const dup = await run([
        "check",
        file,
        file,
        `${dir}/./probe.vl`,
        `${dir}/d1`,
        `${dir}/d1/c.vl`,
      ]);
      if (dup.code !== 0 || !dup.err.includes("Checked 3 files, no errors.")) {
        throw new Error(
          `repeated paths count once: want 3 files, got ${dup.code}: ${dup.err}`,
        );
      }
      const t = (n: number) =>
        `import { it, expect } from "std:test"\nit("t${n}", () => { expect(1).toEqual(1) })\n`;
      await Deno.mkdir(`${dir}/t1`);
      await Deno.mkdir(`${dir}/t2`);
      await Deno.writeTextFile(`${dir}/t1/x.test.vl`, t(1));
      await Deno.writeTextFile(`${dir}/t2/y.test.vl`, t(2));
      await Deno.writeTextFile(`${dir}/t2/z.test.vl`, t(3));
      const tt = await run(["test", `${dir}/t1`, `${dir}/t2`, `${dir}/t1`]);
      const tout = tt.out + tt.err;
      if (
        tt.code !== 0 || !tout.includes("3 files · 3 passed · 0 failed") ||
        tout.includes("cannot read")
      ) {
        throw new Error(
          `test t1 t2 t1: want 3 files passed, got ${tt.code}: ${tout}`,
        );
      }
      const messy = `${dir}/messy.vl`;
      await Deno.writeTextFile(messy, "const   x=1\nprint(x)\n");
      const fm = await run(["fmt", "-w", messy, `${dir}/nope.vl`]);
      if (
        fm.code !== 2 || !fm.err.includes(`fmt: cannot read ${dir}/nope.vl`)
      ) {
        throw new Error(
          `a missing path: want exit 2 naming it, got ${fm.code}: ${fm.err}`,
        );
      }
      if ((await Deno.readTextFile(messy)) !== "const   x=1\nprint(x)\n") {
        throw new Error(
          "a missing path must stop the run before any file is written",
        );
      }
    });
  },
});
