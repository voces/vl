// NATIVE `vl check <file>`: AN IMPORT'S WARNINGS AND HINTS ARE NOT THE NAMED FILE'S.
//
// A single-file check resolves and lints the whole module graph, so every import's
// own findings were reported against a check of the file that imports it. plumb's
// `vl check src/ntempest/hierarchy.vl` printed 103 diagnostics, 62 of them from the
// three modules it imports, and `--exclude` did not filter them (plumb PL-055).
//
// Policy pinned here (compiler/cli.vl, `cliDiagWithheld`):
//   - a non-error owned by an imported (non-std) module is WITHHELD unless
//     `--include-imports` is passed, and counts nowhere while withheld — not in the
//     tally, not in the `--severity` gate, not in the `--json` array;
//   - an import's ERROR is ALWAYS shown: it blocks the build of the named file;
//   - a withheld run SAYS SO on stderr, in human and `--json` mode alike;
//   - `--exclude` drops a matching import's warnings and hints even under
//     `--include-imports` (explicitly asked for, so not announced);
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

const NOTE = /\(1 import warning hidden — --include-imports shows them\)/;

Deno.test({
  name:
    "vl-check-import-diag: an import's warning is withheld, counted nowhere, and announced",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_WARN);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (/leftover/.test(all) || /warn\.vl:/.test(all)) {
        throw new Error(`the import's own warning was reported:\n${all}`);
      }
      if (!/main\.vl: warning \[3:\d+\] Unused variable `mineToFix`/.test(all)) {
        throw new Error(`the named file's own warning was suppressed:\n${all}`);
      }
      // Counted nowhere: the only warning left in the tally is the named file's.
      if (!/Found 0 errors, 1 warning\./.test(all)) {
        throw new Error(`the withheld warning still reached the tally:\n${all}`);
      }
      if (!NOTE.test(r.err)) {
        throw new Error(`the run must say what it withheld, on stderr; got:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: a withheld import warning does not gate the exit",
  ignore: !ENABLED,
  fn: async () => {
    // The named file is clean; only the import warns.
    const dir = await setup(`import { twice } from "./warn"\nprint(twice(21))\n`);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (r.code !== 0) {
        throw new Error(`a withheld import warning still gated (exit ${r.code}):\n${all}`);
      }
      if (!/no errors/.test(all) || !NOTE.test(r.err)) {
        throw new Error(`expected a clean summary plus the withheld note:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: --include-imports brings the import's warning back, gate and all",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(`import { twice } from "./warn"\nprint(twice(21))\n`);
    try {
      const r = await check(dir, ["--include-imports"]);
      const all = r.out + r.err;
      if (!/warn\.vl: warning \[2:\d+\] Unused variable `leftover`/.test(all)) {
        throw new Error(`--include-imports did not show the import's warning:\n${all}`);
      }
      if (/hidden/.test(all)) {
        throw new Error(`--include-imports must withhold nothing:\n${all}`);
      }
      if (r.code === 0) {
        throw new Error(`the shown warning must gate at --severity info:\n${all}`);
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
    const dir = await setup(`import { twice } from "./warn"\nprint(twice(21))\n`);
    try {
      for (const pat of ["lib/warn.vl", "warn.vl", "lib/*.vl"]) {
        const r = await check(dir, ["--include-imports", "--exclude", pat]);
        const all = r.out + r.err;
        if (/leftover/.test(all) || /hidden/.test(all)) {
          throw new Error(`--exclude ${pat} did not drop the import's warning:\n${all}`);
        }
        if (r.code !== 0) {
          throw new Error(`an excluded warning still gated (--exclude ${pat}):\n${all}`);
        }
      }
      // A pattern that matches nothing leaves it alone.
      const miss = await check(dir, ["--include-imports", "--exclude", "other.vl"]);
      if (!/leftover/.test(miss.out + miss.err)) {
        throw new Error(`a non-matching --exclude dropped the warning:\n${miss.out}${miss.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-import-diag: an import's ERROR is shown without the flag, and --exclude keeps it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(MAIN_ERR);
    try {
      for (const extra of [[], ["--exclude", "err.vl"]]) {
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
  name: "vl-check-import-diag: --json drops it from the array and says so on stderr",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(`import { twice } from "./warn"\nprint(twice(21))\n`);
    try {
      const r = await check(dir, ["--json"]);
      const items = JSON.parse(r.out.trim()) as { file: string }[];
      if (items.length !== 0) {
        throw new Error(`the JSON array must carry no withheld diagnostic, got ${r.out}`);
      }
      if (!NOTE.test(r.err)) {
        throw new Error(`--json must still announce the withheld count; got:\n${r.err}`);
      }
      const inc = await check(dir, ["--json", "--include-imports"]);
      const incItems = JSON.parse(inc.out.trim()) as { file: string }[];
      if (incItems.length !== 1 || !/warn\.vl$/.test(incItems[0].file)) {
        throw new Error(`--include-imports --json must carry the import's diagnostic, got ${inc.out}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
