// NATIVE `vl check` — the redundant-type-annotation lint + `--fix` (lean on
// inference). A `let x: T = init` whose initializer ALREADY infers to exactly `T`
// carries a redundant annotation: removing `: T` yields the identical type. The
// checker (compiler/typecheck.vl) flags it during the `LetDecl` check — comparing
// the init's CONTEXT-FREE type (typed before the annotation is consulted) to the
// annotation — and cli.vl surfaces a `hint` + a `--fix` that rewrites
// `let x: T = init` → `let x = init`.
//
// Conservatism is the rule: only flag when removal is PROVABLY type-identical. The
// widening / hole cases (`let x: i64 = 5`, `: f64 = 5`, `: i32[] = []`,
// `: i32 | null = null`) are NOT flagged — their context-free init type differs
// from the annotation, so the annotation is load-bearing.
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
  console.warn("[vl-check-redundant-type] skipped — missing vl binary or seed wasm.");
}

// `vl check <file> --concise` → captured stderr (diagnostics) + exit code.
const check = async (source: string): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_redun_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: ["check", file, "--concise", "--compiler", COMPILER],
      stdout: "null",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
    }).output();
    return { code, err: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// `vl check <file> --fix` → the file's text AFTER the run.
const fix = async (source: string): Promise<{ after: string; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_redun_fix_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const { stderr } = await new Deno.Command(VL, {
      args: ["check", file, "--fix", "--compiler", COMPILER],
      stdout: "null",
      stderr: "piped",
      env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
    }).output();
    return { after: await Deno.readTextFile(file), err: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const redundantLines = (err: string): string[] =>
  err.split("\n").filter((l) => l.includes("redundant type annotation"));

Deno.test({
  name: "vl-check-redundant-type: flags `let`/`const` whose init already infers to the annotation",
  ignore: !ENABLED,
  fn: async () => {
    const r = await check(
      "let a: i32 = 5\nconst b: string = \"hi\"\nprint(a + b.length)\n",
    );
    const hits = redundantLines(r.err);
    if (hits.length !== 2) {
      throw new Error(`expected 2 redundant hints, got ${hits.length}:\n${r.err}`);
    }
    if (!hits[0].includes("`a` is inferred as `i32`")) {
      throw new Error(`expected the i32 hint, got:\n${hits[0]}`);
    }
    if (!hits[1].includes("`b` is inferred as `string`")) {
      throw new Error(`expected the string hint, got:\n${hits[1]}`);
    }
  },
});

Deno.test({
  name: "vl-check-redundant-type: does NOT flag widening / hole annotations (load-bearing)",
  ignore: !ENABLED,
  fn: async () => {
    // i64/f64 widen the i32-default literal; `[]`/`null` need the annotation to
    // infer their element/nullable type — none is redundant.
    const r = await check(
      "let w: i64 = 5\nlet f: f64 = 5\nlet xs: i32[] = []\nlet n: i32 | null = null\n" +
        "xs.push(1)\nprint(w + f + xs.length)\n",
    );
    const hits = redundantLines(r.err);
    if (hits.length !== 0) {
      throw new Error(`expected NO redundant hints, got ${hits.length}:\n${r.err}`);
    }
  },
});

Deno.test({
  name: "vl-check-redundant-type: --fix removes `: T`, keeps a multi-token init intact, idempotent",
  ignore: !ENABLED,
  fn: async () => {
    const src =
      "let a: i32 = 5\nconst b: i32 = 1 + 2\nlet c: string = \"hi\" + \"x\"\n" +
      "let xs: i32[] = [1, 2, 3]\nprint(a + b + c.length + xs.length)\n";
    const r = await fix(src);
    const want =
      // `: T` gone; the initializers (incl. `1 + 2`, `[1, 2, 3]`) are untouched.
      // (prefer-const independently rewrites the never-reassigned `let`s.)
      "const a = 5\nconst b = 1 + 2\nconst c = \"hi\" + \"x\"\n" +
      "const xs = [1, 2, 3]\nprint(a + b + c.length + xs.length)\n";
    if (r.after !== want) {
      throw new Error(`unexpected --fix result:\n${JSON.stringify(r.after)}`);
    }
    // Re-fixing the result changes nothing (no redundant annotations remain).
    const r2 = await fix(r.after);
    if (r2.after !== want) {
      throw new Error(`--fix not idempotent:\n${JSON.stringify(r2.after)}`);
    }
    if (redundantLines((await check(r.after)).err).length !== 0) {
      throw new Error(`fixed source still reports a redundant annotation:\n${r.after}`);
    }
  },
});

Deno.test({
  name: "vl-check-redundant-type: --fix leaves widening / hole annotations in place",
  ignore: !ENABLED,
  fn: async () => {
    const src = "let w: i64 = 5\nlet xs: i32[] = []\nxs.push(1)\nprint(w + xs.length)\n";
    const r = await fix(src);
    // The annotations must survive (prefer-const may independently flip `let`→`const`,
    // so assert on the `name: T = …` shape, not the keyword).
    if (!r.after.includes("w: i64 = 5") || !r.after.includes("xs: i32[] = []")) {
      throw new Error(`a load-bearing annotation was wrongly removed:\n${r.after}`);
    }
  },
});

Deno.test({
  name: "vl-check-redundant-type: module-aware — reports + fixes the ENTRY's findings, not a dep's",
  ignore: !ENABLED,
  fn: async () => {
    // A graph compile merges modules, so each finding is attributed to its owning
    // module (`redunModuleAt`) and only the ENTRY's (module 0) are reported/fixed.
    // The check resolves imports first, so an import-DEPENDENT redundancy
    // (`let e: i32 = f()`, `f` imported) is detected reliably too.
    const dir = await Deno.makeTempDir({ prefix: "vl_redun_mod_" });
    try {
      // dep has its own redundant annotation (`let z: i32 = 9`) — must NOT be touched.
      await Deno.writeTextFile(
        `${dir}/dep.vl`,
        "export function f(): i32 {\n  let z: i32 = 9\n  z\n}\n",
      );
      await Deno.writeTextFile(
        `${dir}/entry.vl`,
        // `e` is import-dependent (= f()); `arr` is an empty-array hole (keep).
        "import { f } from \"./dep\"\nlet e: i32 = f()\nlet arr: i32[] = []\narr.push(e)\nprint(arr.length)\n",
      );
      // Report (real path so imports resolve): the entry's `e` IS flagged; the
      // dep's `z` is NOT (different module).
      const rep = await new Deno.Command(VL, {
        args: ["check", `${dir}/entry.vl`, "--concise", "--compiler", COMPILER],
        stdout: "null",
        stderr: "piped",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
      }).output();
      const err = new TextDecoder().decode(rep.stderr);
      const hits = redundantLines(err);
      if (hits.length !== 1 || !hits[0].includes("`e`")) {
        throw new Error(`expected exactly the entry's \`e\` flagged, got:\n${err}`);
      }
      // --fix: removes the entry's `e` annotation, keeps the empty-array `arr`, and
      // leaves dep.vl untouched.
      await new Deno.Command(VL, {
        args: ["check", `${dir}/entry.vl`, "--fix", "--compiler", COMPILER],
        stdout: "null",
        stderr: "null",
        env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
      }).output();
      const entryAfter = await Deno.readTextFile(`${dir}/entry.vl`);
      const depAfter = await Deno.readTextFile(`${dir}/dep.vl`);
      if (entryAfter.includes(": i32 = f()") || !/\b(let|const) e = f\(\)/.test(entryAfter)) {
        throw new Error(`entry's import-dependent annotation not removed:\n${entryAfter}`);
      }
      if (!entryAfter.includes("arr: i32[] = []")) {
        throw new Error(`empty-array annotation wrongly removed:\n${entryAfter}`);
      }
      if (!depAfter.includes("let z: i32 = 9")) {
        throw new Error(`a dependency file was wrongly modified:\n${depAfter}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
