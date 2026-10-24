// NATIVE `vl check <file>`: A RELATIVE IMPORT IS LINTED AND REPORTED WITH THE FILE.
//
// A single-file check resolves the whole module graph. A module reached by a
// relative specifier is the author's own code, so its warnings and hints are
// reported with the named file's (owner ruling 2026-10-24, reversing PL-055's
// withholding default). `--skip-imports` is plumb's escape hatch: those modules
// are not linted at all.
//
// Policy pinned here (compiler/cli.vl, `cliImportScope`; driver.vl, `lintGraphOf`):
//   - by default an import's warning is shown, tallied, gated and in the JSON array;
//   - `--skip-imports` lints no relative import: its findings count nowhere, and
//     the run announces nothing, since it was explicitly asked for;
//   - `--include-imports` is accepted and undoes an earlier `--skip-imports`;
//   - an import's ERROR is ALWAYS shown: it blocks the build of the named file;
//   - `--exclude` drops a matching import's warnings and hints (not announced);
//   - the named file's own diagnostics are untouched.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_check_*` suites.
//
// @test-timing native

import { COMPILER, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-import-diag] skipped — missing vl binary or seed wasm.");
}

// An import carrying a plain `unused-binding` warning of its own.
const LIB_WARN = `export function twice(n: i32): i32 {
  let leftover = 1
  n * 2
}
`;
// An import carrying a type error.
const LIB_ERR = `export function thrice(n: i32): i32 {
  const broken: i32 = "not an i32"
  n * 3
}
`;
// The named file, with a warning of its OWN, so suppression is provably not a blanket.
const MAIN_WARN = `import { twice } from "./warn"
function go() {
  let mineToFix = 5
  print(twice(21))
}
go()
`;
const MAIN_CLEAN = `import { twice } from "./warn"\nprint(twice(21))\n`;
const MAIN_ERR = `import { thrice } from "./err"
print(thrice(14))
`;

type Run = { code: number; out: string; err: string };

const setup = async (main: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_impdiag_" });
  await Deno.mkdir(`${dir}/lib`);
  await Deno.writeTextFile(`${dir}/lib/warn.vl`, LIB_WARN);
  await Deno.writeTextFile(`${dir}/lib/err.vl`, LIB_ERR);
  await Deno.writeTextFile(`${dir}/lib/main.vl`, main);
  return dir;
};

const check = async (dir: string, extra: string[] = []): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "check",
      "lib/main.vl",
      "--concise",
      "--severity",
      "info",
      "--compiler",
      COMPILER,
      ...extra,
    ],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// Any announcement of something not linted or withheld.
const NOTE = /not linted|hidden/;

Deno.test({
  name: "vl-check-import-diag: an import's warning is shown by default, tallied and gated",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_WARN);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (!/warn\.vl: warning \[2:\d+\] Unused variable `leftover`/.test(all)) {
        throw new Error(`the import's own warning was not reported:\n${all}`);
      }
      if (!/main\.vl: warning \[3:\d+\] Unused variable `mineToFix`/.test(all)) {
        throw new Error(`the named file's own warning was suppressed:\n${all}`);
      }
      if (!/Found 0 errors, 2 warnings\./.test(all)) {
        throw new Error(`both warnings must reach the tally:\n${all}`);
      }
      if (NOTE.test(all)) {
        throw new Error(`nothing was skipped, so nothing may be announced:\n${all}`);
      }
      if (r.code === 0) {
        throw new Error(`the shown warnings must gate at --severity info:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: --skip-imports lints no import, counts nothing, gates nothing",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_CLEAN);
    try {
      const r = await check(dir, ["--skip-imports"]);
      const all = r.out + r.err;
      if (/leftover/.test(all) || /warn\.vl:/.test(all)) {
        throw new Error(`--skip-imports still reported the import's warning:\n${all}`);
      }
      if (r.code !== 0) {
        throw new Error(`a skipped import's warning still gated (exit ${r.code}):\n${all}`);
      }
      if (!/no errors/.test(all)) {
        throw new Error(`expected a clean summary:\n${all}`);
      }
      if (NOTE.test(all)) {
        throw new Error(`--skip-imports is explicit, so it is not announced:\n${all}`);
      }
      // The named file's own findings survive the flag.
      const own = await setup(MAIN_WARN);
      try {
        const o = await check(own, ["--skip-imports"]);
        const oAll = o.out + o.err;
        if (!/main\.vl: warning \[3:\d+\] Unused variable `mineToFix`/.test(oAll)) {
          throw new Error(`--skip-imports suppressed the named file's warning:\n${oAll}`);
        }
        if (!/Found 0 errors, 1 warning\./.test(oAll)) {
          throw new Error(`only the named file's warning may reach the tally:\n${oAll}`);
        }
      } finally {
        await Deno.remove(own, { recursive: true });
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: --include-imports undoes an earlier --skip-imports",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_CLEAN);
    try {
      const base = await check(dir);
      for (const extra of [["--include-imports"], ["--skip-imports", "--include-imports"]]) {
        const r = await check(dir, extra);
        if (r.out !== base.out || r.err !== base.err || r.code !== base.code) {
          throw new Error(
            `${extra.join(" ")} must report what the default reports:\n` +
              `want ${base.out}${base.err}\ngot ${r.out}${r.err}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: --exclude drops a matching import's warning, by path or basename",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_CLEAN);
    try {
      for (const pat of ["lib/warn.vl", "warn.vl", "lib/*.vl"]) {
        const r = await check(dir, ["--exclude", pat]);
        const all = r.out + r.err;
        if (/leftover/.test(all) || NOTE.test(all)) {
          throw new Error(`--exclude ${pat} did not drop the import's warning:\n${all}`);
        }
        if (r.code !== 0) {
          throw new Error(`an excluded warning still gated (--exclude ${pat}):\n${all}`);
        }
      }
      // A pattern that matches nothing leaves it alone.
      const miss = await check(dir, ["--exclude", "other.vl"]);
      if (!/leftover/.test(miss.out + miss.err)) {
        throw new Error(`a non-matching --exclude dropped the warning:\n${miss.out}${miss.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: an import's ERROR is shown under --skip-imports and --exclude",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_ERR);
    try {
      for (const extra of [[], ["--skip-imports"], ["--exclude", "err.vl"]]) {
        const r = await check(dir, extra);
        const all = r.out + r.err;
        if (!/err\.vl: error \[2:\d+\]/.test(all)) {
          throw new Error(
            `an import's error must never be withheld (${extra.join(" ")}):\n${all}`,
          );
        }
        if (r.code === 0) {
          throw new Error(`an import's error must gate:\n${all}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: --json carries the import's finding, and --skip-imports drops it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_CLEAN);
    try {
      const r = await check(dir, ["--json"]);
      const items = JSON.parse(r.out.trim()) as { file: string }[];
      if (items.length !== 1 || !/warn\.vl$/.test(items[0].file)) {
        throw new Error(`--json must carry the import's diagnostic, got ${r.out}`);
      }
      const skip = await check(dir, ["--json", "--skip-imports"]);
      const skipItems = JSON.parse(skip.out.trim()) as { file: string }[];
      if (skipItems.length !== 0) {
        throw new Error(`--skip-imports --json must carry nothing, got ${skip.out}`);
      }
      if (NOTE.test(skip.err)) {
        throw new Error(`--skip-imports --json must announce nothing; got:\n${skip.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
