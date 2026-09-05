// NATIVE diagnostic POSITIONS (spans rung 2/3) — `vl check --concise` renders
// each diagnostic as `path: <severity> [line:col] message` when the self-hosted
// front end knows the source position of the offending construct. Line and
// column are both 1-based here (the human-facing editor convention); internally
// the front end carries a 1-based line and 0-based column — the lexer's and the
// corpus `@error-at` directive's convention — which the concise formatter shifts
// to 1-based for display.
//
// The position plumbing under test:
//   • lex diags    — the lexer's own `line`/`col`, threaded through the driver's
//                    `vcLexLines`/`vcLexCols` side arrays.
//   • parse diags  — `Diag.at` is a TOKEN index; rendered via `P.toks[at].line/col`
//                    (rung 1's bridge positions).
//   • type diags   — `tErr` resolves the AST node's anchor token through the
//                    `nodeToks` side table (ast.vl) into `TDiag.tline/tcol`.
// The legacy `diagLen`/`diagAt` export stays byte-compatible (bare messages);
// the host reads the PARALLEL structured exports (`diagCount`/`diagMsg*`/
// `diagLine`/`diagCol`) and does the `path:line:col:` formatting itself.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm, so a
// plain `deno task test` stays fast and green while CI's native job opts in.

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[native-diag-pos] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

const check = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--concise", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

/// Write `src` to a temp .vl file, `vl check --concise` it, assert a NONZERO
/// exit whose stderr names `stage` and contains `path<want>` (i.e. the absolute
/// input path immediately followed by the expected `: <severity> [line:col]
/// message…` fragment — concise form, 1-based line:col).
const assertPositioned = async (
  src: string,
  stage: string,
  want: string,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_" });
  try {
    const path = `${dir}/case.vl`;
    await Deno.writeTextFile(path, src);
    const r = await check(path);
    if (r.code === 0) {
      throw new Error(`expected rejection, vl check exited 0 for:\n${src}`);
    }
    if (!r.err.includes(`${stage} error`)) {
      throw new Error(`expected "${stage} error" in stderr, got:\n${r.err}`);
    }
    const needle = `${path}${want}`;
    if (!r.err.includes(needle)) {
      throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "native-diag-pos: type error carries path:line:col of the offending token",
  ignore: !ENABLED,
  fn: async () => {
    // Line 2, col 16 (0-based) is the `x` initializer — the type-diag anchor;
    // the concise formatter displays it 1-based as [2:17].
    await assertPositioned(
      "let x: i32 = 1\nlet y: string = x\n",
      "type",
      ": error [2:17] cannot assign i32 to 'y' of type string",
    );
  },
});

Deno.test({
  name: "native-diag-pos: parse error carries path:line:col of the unexpected token",
  ignore: !ENABLED,
  fn: async () => {
    // Line 2, col 4 (0-based) is the `=` where an IDENT was expected; shown
    // 1-based as [2:5].
    await assertPositioned(
      "let x: i32 = 1\nlet = 5\n",
      "parse",
      ": error [2:5] expected an identifier but found `=`",
    );
  },
});

Deno.test({
  name: "native-diag-pos: lex diagnostic carries the lexer's own line:col",
  ignore: !ENABLED,
  fn: async () => {
    // A multi-char char literal is a LEX error (folded into the parse stage);
    // the lexer anchors it at line 1, col 8 (0-based) — the literal's OPENING
    // quote (`diagAt`, not the scanner's one-past position) — shown 1-based
    // as [1:9].
    await assertPositioned("let c = 'ab'\n", "parse", ": error [1:9] ");
  },
});

Deno.test({
  name: "native-diag-pos: corpus lambda-uninferable-param pins the parameter token",
  ignore: !ENABLED,
  fn: async () => {
    // The real corpus file: a lambda passed to an un-annotated HOF param, `apply((n) => n * 2)` on
    // line 11 — the uninferable parameter `n` sits at col 13 (0-based), shown 1-based as [11:14].
    // (A `const`-bound lambda now value-flow-monomorphizes; this non-binding form stays uninferable.)
    const path = `${ROOT}/tests/cases/functions/lambda-uninferable-param.vl`;
    const r = await check(path);
    if (r.code === 0) throw new Error("expected rejection, vl check exited 0");
    const needle = `${path}: error [11:14] cannot infer a type for parameter \`n\``;
    if (!r.err.includes(needle)) {
      throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
    }
  },
});

Deno.test({
  name: "native-diag-pos: unused-function anchors at the declaration's NAME token",
  ignore: !ENABLED,
  fn: async () => {
    // A LINT diagnostic's position: `dead` starts at line 1, col 9 (0-based) —
    // shown 1-based as [1:10]. Pins the name-token anchor (`declNameTokOf`,
    // matching unused-variable/prefer-const); the node's own anchor is its LAST
    // token — the closing `}` on line 3 — which is the wrong line entirely.
    const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_" });
    try {
      const path = `${dir}/case.vl`;
      await Deno.writeTextFile(
        path,
        "function dead(n: i32) {\n  print(n)\n}\nprint(1)\n",
      );
      const r = await check(path);
      if (r.code !== 0) {
        throw new Error(`expected exit 0 (warning only), got ${r.code}:\n${r.err}`);
      }
      const needle = `${path}: warning [1:10] Unused function \`dead\``;
      if (!r.err.includes(needle)) {
        throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// `vl build` (codegen) an emit-error program, and return the exit code + stderr.
// `check` above runs only parse+type; an EMIT-stage failure surfaces solely under
// codegen, so its diagnostic position needs the build path.
const build = async (path: string): Promise<{ code: number; err: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_out_" });
  try {
    const { code, stderr } = await new Deno.Command(VL, {
      args: [
        "build",
        path,
        "-o",
        `${dir}/out.wasm`,
        "--concise",
        "--compiler",
        COMPILER,
      ],
      stdout: "piped",
      stderr: "piped",
      env: nativeEnv(),
    }).output();
    return { code, err: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "native-diag-pos: EMIT-stage failure anchors at the failing function's name",
  ignore: !ENABLED,
  fn: async () => {
    // A closure whose result struct carries a nullable REF-list field
    // (`{f: (i32 | null)[] | null}`) has no lowerable rep — the call `v(1)` inside
    // `useIt` (line 4) fails at the EMIT stage. The diagnostic anchors at the
    // enclosing function's NAME token (`useIt`, col 8 0-based, printed 1-based as 4:10), not
    // positionless (line 0) as before — so a build/playground/LSP consumer can
    // point the reader at the offending function instead of rendering the message
    // bare. (`declNameTokOf` anchoring, matching the lint/type-diag convention.)
    const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_" });
    try {
      const path = `${dir}/case.vl`;
      await Deno.writeTextFile(
        path,
        "function makeIt(): (i32) => {f: (i32 | null)[] | null} {\n" +
          "  return (q0) => ({ f: [1, 2] })\n" +
          "}\n" +
          "function useIt() {\n" +
          "  const v: (i32) => {f: (i32 | null)[] | null} = makeIt()\n" +
          "  const s = v(1)\n" +
          "  print(0)\n" +
          "}\n" +
          "useIt()\n",
      );
      const r = await build(path);
      if (r.code === 0) throw new Error("expected emit-stage rejection, got exit 0");
      if (!r.err.includes("emit error")) {
        throw new Error(`expected "emit error" in stderr, got:\n${r.err}`);
      }
      const needle = `${path}:4:10:`;
      if (!r.err.includes(needle)) {
        throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "native-diag-pos: a TOP-LEVEL emit failure anchors at the read, not at the last function",
  ignore: !ENABLED,
  fn: async () => {
    // The function-name anchor above is the right one for a failure raised deep inside a
    // body, and the WRONG one twice over for a top-level statement. The synthetic start
    // function is lowered AFTER every user body, so the "function being lowered" cursor
    // still names the file's LAST `function` — `print(g(true).xs.length)` on line 11
    // reported line 3, inside an unrelated `g`, and a reader following it looked at code
    // that had nothing to do with the failure.
    //
    // Two things fix it and this pins both: the field-access floors are NODE-anchored
    // (`emitFailAt`, the `Member` node → its property token, 0-based col 14 of line 11,
    // printed 1-based as 11:15), and the start function arms a top-level STATEMENT cursor so
    // any other failure it raises lands on the statement instead of on a stale function.
    //
    // The shared field here is a LIST (`xs`), which has no single-block result rep to
    // dispatch on — so this is still a loud reject after call receivers were taught to
    // dispatch, which is exactly why it is usable as a position witness.
    const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_top_" });
    try {
      const path = `${dir}/case.vl`;
      await Deno.writeTextFile(
        path,
        "type A = { xs: i32[], a: i32 }\n" +
          "type B = { pad: boolean, xs: i32[] }\n" +
          "function g(flag: boolean): A | B {\n" +
          "  if flag { return { xs: [1, 2], a: 3 } }\n" +
          "  return { pad: true, xs: [4] }\n" +
          "}\n" +
          "function pad(x: i32): i32 {\n" +
          "  return x + 1\n" +
          "}\n" +
          "print(pad(1))\n" +
          "print(g(true).xs.length)\n",
      );
      const r = await build(path);
      if (r.code === 0) throw new Error("expected emit-stage rejection, got exit 0");
      const needle = `${path}:11:15:`;
      if (!r.err.includes(needle)) {
        throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// ── WHICH FILE a diagnostic is labelled with (multi-module) ──────────────────
//
// A positioned diagnostic's line and column belong to the module that OWNS it,
// so labelling every one with the ENTRY's path prints a real location against the
// wrong file. `vl check` has always resolved the owner (`compiler/cli.vl` reads
// `diagModule`); `vl run` / `vl build` did not, and the two disagreed — an error
// on line 2 of `dep.vl` printed as `entry.vl:2:20`, which points at whatever
// happens to be on line 2 of the entry.
//
// `vl check --concise` is the ORACLE here: same front end, same diagnostics, and
// it has been right all along. The two channels are compared on the FILE and the
// LINE only — the COLUMN differs by design (`render_diags` prints the front end's
// 0-based column, the concise formatter shifts to 1-based for display), which the
// header of this file states.

/** Write a `{relative path: source}` tree into a fresh temp dir. */
const writeTree = async (files: Record<string, string>): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_diag_mod_" });
  for (const [rel, body] of Object.entries(files)) {
    const path = `${dir}/${rel}`;
    const slash = path.lastIndexOf("/");
    await Deno.mkdir(path.slice(0, slash), { recursive: true });
    await Deno.writeTextFile(path, body);
  }
  return dir;
};

/** `vl run` on `dir/entry.vl` — the host-driven channel (`--concise` does not
 * reach it; `vl build` shares the same `render_diags` formatting). */
const runIn = async (dir: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["run", `${dir}/entry.vl`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

const buildIn = async (dir: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["build", `${dir}/entry.vl`, "-o", `${dir}/out.wasm`, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

/** The `file:line` pairs `vl run`/`vl build` printed (`file:line:col: message`). */
const runLocs = (err: string): string[] =>
  err.split("\n")
    .map((l) => /^(.*?):(\d+):(\d+): /.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]}:${m[2]}`);

/** The ERROR-tier `file:line` pairs `vl check --concise` printed
 * (`file: error [line:col] message`); warnings are not comparable — the run
 * channel emits none. */
const checkLocs = (err: string): string[] =>
  err.split("\n")
    .map((l) => /^(.*?): error \[(\d+):(\d+)\] /.exec(l.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => `${m[1]}:${m[2]}`);

/** Assert `vl run`, `vl build` and `vl check --concise` name the same files and
 * lines, and that the set is exactly `want`. */
const assertOwnerAgreement = async (
  files: Record<string, string>,
  want: (dir: string) => string[],
): Promise<void> => {
  const dir = await writeTree(files);
  try {
    const [r, b, c] = [await runIn(dir), await buildIn(dir), await check(`${dir}/entry.vl`)];
    const expect = want(dir).slice().sort();
    const got = runLocs(r.err).slice().sort();
    const gotB = runLocs(b.err).slice().sort();
    const oracle = checkLocs(c.err).slice().sort();
    if (JSON.stringify(got) !== JSON.stringify(expect)) {
      throw new Error(`vl run: expected ${JSON.stringify(expect)}, got ${JSON.stringify(got)}\n${r.err}`);
    }
    if (JSON.stringify(gotB) !== JSON.stringify(expect)) {
      throw new Error(`vl build: expected ${JSON.stringify(expect)}, got ${JSON.stringify(gotB)}\n${b.err}`);
    }
    if (JSON.stringify(oracle) !== JSON.stringify(expect)) {
      throw new Error(
        `vl check (the oracle) disagrees: expected ${JSON.stringify(expect)}, got ${JSON.stringify(oracle)}\n${c.err}`,
      );
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "native-diag-owner: a type error in a DEPENDENCY is labelled with the dependency's path",
  ignore: !ENABLED,
  fn: async () => {
    // Before the fix `vl run` printed `entry.vl:2:20` — the dependency's line and
    // column against the entry's name.
    await assertOwnerAgreement({
      "entry.vl": 'import { bad } from "./dep"\nprint(bad())\n',
      "dep.vl": "export function bad(): i32 {\n  const s: string = 42\n  return 1\n}\n",
    }, (d) => [`${d}/dep.vl:2`]);
  },
});

Deno.test({
  name: "native-diag-owner: a PARSE error in a dependency is labelled with the dependency's path",
  ignore: !ENABLED,
  fn: async () => {
    // The parse tier resolves its owner through a TOKEN index (`modOfTok`), the
    // type tier through `nodeToks` — two different anchor paths in `diagModule`.
    await assertOwnerAgreement({
      "entry.vl": 'import { bad } from "./dep"\nprint(bad())\n',
      "dep.vl": "export function bad(): i32 {\n  const s: = 42\n  return 1\n}\n",
    }, (d) => [`${d}/dep.vl:2`]);
  },
});

Deno.test({
  name: "native-diag-owner: a TRANSITIVE dependency's error names that file, not the entry or the middle",
  ignore: !ENABLED,
  fn: async () => {
    await assertOwnerAgreement({
      "entry.vl": 'import { a } from "./mid"\nprint(a())\n',
      "mid.vl": 'import { deep } from "./deep"\nexport function a(): i32 { return deep() }\n',
      "deep.vl": "export function deep(): i32 {\n  const s: string = 42\n  return 1\n}\n",
    }, (d) => [`${d}/deep.vl:2`]);
  },
});

Deno.test({
  name: "native-diag-owner: two errors in two files are labelled per-diagnostic",
  ignore: !ENABLED,
  fn: async () => {
    // The decisive shape: one label for the whole run cannot be right for both.
    await assertOwnerAgreement({
      "entry.vl": 'import { bad } from "./dep"\nconst t: string = 7\nprint(bad())\n',
      "dep.vl": "export function bad(): i32 {\n  const s: string = 42\n  return 1\n}\n",
    }, (d) => [`${d}/dep.vl:2`, `${d}/entry.vl:2`]);
  },
});

Deno.test({
  name: "native-diag-owner: a subdirectory dependency keeps its `sub/dep.vl` key",
  ignore: !ENABLED,
  fn: async () => {
    // The module KEY is the path the host was asked to read, slashes and all.
    await assertOwnerAgreement({
      "entry.vl": 'import { bad } from "./sub/dep"\nprint(bad())\n',
      "sub/dep.vl": "export function bad(): i32 {\n  const s: string = 42\n  return 1\n}\n",
    }, (d) => [`${d}/sub/dep.vl:2`]);
  },
});

Deno.test({
  name: "native-diag-owner: CONTROL — an error in the ENTRY of a multi-module program is unchanged",
  ignore: !ENABLED,
  fn: async () => {
    // Module 0's key IS the entry path, so this row must read exactly as before.
    await assertOwnerAgreement({
      "entry.vl": 'import { ok } from "./dep"\nconst s: string = 42\nprint(ok())\n',
      "dep.vl": "export function ok(): i32 { return 1 }\n",
    }, (d) => [`${d}/entry.vl:2`]);
  },
});

// ── ONE DIAGNOSTIC, ONE COLUMN, WHICHEVER COMMAND FINDS IT ───────────────────
//
// The renderers are two: `vl check` formats inside the CLI pump (VL, `cliFmtConcise`
// and `cliFmtJson`), `vl run` and `vl build` format in the host (`render_diags`). Both
// read the same 0-based `diagCol` export and only the pump used to shift it, so the
// same type error was `[1:16]` under `check` and `1:15` under `run` — a one-column
// disagreement that anything scraping either channel inherits. `cli-design.md` settles
// it: "`line` (1-based), `col` (1-based, inclusive)".

const runProg = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["run", path, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

const checkJson = async (path: string): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["check", path, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return { code, out: new TextDecoder().decode(stdout) };
};

Deno.test({
  name: "native-diag-pos: the same diagnostic reaches the same column through check and run",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_diag_pos_base_" });
    try {
      const path = `${dir}/case.vl`;
      // `"s"` opens at 1-based column 16 of line 1 — counted by hand, because a test that
      // only compared the channels would pass on all three agreeing about 15.
      await Deno.writeTextFile(path, 'const x: i32 = "s"\nprint(x)\n');
      const WANT = 16;

      const concise = await check(path);
      const cm = concise.err.match(/: error \[(\d+):(\d+)\]/);
      if (!cm) throw new Error(`no concise [line:col] in:\n${concise.err}`);

      const json = await checkJson(path);
      const jm = json.out.match(/"line":(\d+),"col":(\d+)/);
      if (!jm) throw new Error(`no --json line/col in:\n${json.out}`);

      const ran = await runProg(path);
      const rm = ran.err.match(/case\.vl:(\d+):(\d+): /);
      if (!rm) throw new Error(`no run path:line:col in:\n${ran.err}`);

      for (const [chan, m] of Object.entries({ concise: cm, json: jm, run: rm })) {
        if (Number(m[1]) !== 1 || Number(m[2]) !== WANT) {
          throw new Error(
            `${chan}: want 1:${WANT} (1-based, the opening quote of \`"s"\`), got ` +
              `${m[1]}:${m[2]}. Every channel renders the guest's 0-based \`diagCol\`, ` +
              `and each must shift it exactly once.`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
