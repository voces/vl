// NATIVE `vl check --exclude <glob>` — the glob-aware exclude matcher + the
// directory-walk filtering, all VL policy (compiler/cli.vl). A candidate is
// matched two ways and skipped on either: the path RELATIVE TO THE CHECK ROOT and
// the BASENAME. `*` stops at a path separator; `**` crosses it. Leading `./` and a
// trailing `/` are normalized away.
//
// The retired tests/cli_excludes_test.ts poked the TS `makeExcludeMatcher` /
// `collectVlFiles` internals directly. Here the same behaviour is pinned end to end:
// each excluded file holds a TYPE ERROR, so "excluded" is observable as its error
// (and path) being absent from the run. tests/vl_check_dir_test.ts already covers
// the basic subtree+glob exclude; this file pins the matcher's edges — prefix
// collision, deep basename glob, `**` crossing separators, and `./`/trailing-slash
// normalization.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) + needs the built binary + seed.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-exclude] skipped — missing vl binary or seed wasm.");
}

const check = async (
  target: string,
  flags: string[] = [],
): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", target, "--concise", "--compiler", COMPILER, ...flags],
    stdout: "null",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

const BAD = "let bad: string = 5\n"; // a type error — surfaces unless excluded
const OK = "print(1)\n";

// Build a throwaway tree exercising every matcher edge. Every `BAD` file errors
// unless its path is excluded, so the run's output is the ground truth.
const makeTree = async (): Promise<string> => {
  const root = await Deno.makeTempDir({ prefix: "vl_check_excl_" });
  await Deno.mkdir(`${root}/src`, { recursive: true });
  await Deno.mkdir(`${root}/tests`, { recursive: true });
  await Deno.mkdir(`${root}/attests`, { recursive: true }); // prefix collision with `tests`
  await Deno.mkdir(`${root}/tests/deep/inner`, { recursive: true });
  await Deno.writeTextFile(`${root}/src/main.vl`, OK);
  await Deno.writeTextFile(`${root}/src/gen.gen.vl`, BAD); // basename-glob target
  await Deno.writeTextFile(`${root}/tests/a.vl`, BAD);
  await Deno.writeTextFile(`${root}/attests/c.vl`, BAD);
  await Deno.writeTextFile(`${root}/tests/deep/inner/skip.vl`, BAD); // ** target
  return root;
};

Deno.test({
  name: "vl-check-exclude: `*.gen.vl` basename glob excludes the generated file anywhere",
  ignore: !ENABLED,
  fn: async () => {
    const root = await makeTree();
    try {
      const r = await check(root, ["--exclude", "*.gen.vl"]);
      if (r.err.includes("gen.gen.vl")) {
        throw new Error(`generated file should be excluded, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-exclude: `tests` gates the subtree but spares the `attests` prefix collision",
  ignore: !ENABLED,
  fn: async () => {
    const root = await makeTree();
    try {
      const r = await check(root, ["--exclude", "tests"]);
      if (r.err.includes("tests/a.vl")) {
        throw new Error(`tests/ subtree should be excluded, got:\n${r.err}`);
      }
      if (!r.err.includes("attests/c.vl")) {
        throw new Error(`attests/ must NOT be excluded (prefix collision), got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-exclude: `tests/**/skip.vl` — `**` crosses separators",
  ignore: !ENABLED,
  fn: async () => {
    const root = await makeTree();
    try {
      const r = await check(root, ["--exclude", "tests/**/skip.vl"]);
      if (r.err.includes("deep/inner/skip.vl")) {
        throw new Error(`** should cross separators to exclude the nested file, got:\n${r.err}`);
      }
      // A sibling under tests/ that the glob does not match still surfaces.
      if (!r.err.includes("tests/a.vl")) {
        throw new Error(`the glob must not over-match siblings, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-exclude: `./tests/` normalizes the leading `./` and trailing `/`",
  ignore: !ENABLED,
  fn: async () => {
    const root = await makeTree();
    try {
      const r = await check(root, ["--exclude", "./tests/"]);
      if (r.err.includes("tests/a.vl")) {
        throw new Error(`./tests/ should behave like tests, got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(root, { recursive: true });
    }
  },
});
