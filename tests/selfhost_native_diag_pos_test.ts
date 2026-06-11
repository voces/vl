// NATIVE diagnostic POSITIONS (spans rung 2/3) — `vl check` renders each
// diagnostic as `path:line:col: message` when the self-hosted front end knows
// the source position of the offending construct (1-based line, 0-based column
// — the lexer's and the corpus `@error-at` directive's convention).
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
  console.warn(
    "[native-diag-pos] skipped — missing vl binary or seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  deno run -A scripts/build-compiler-wasm.ts",
  );
}

const check = async (path: string): Promise<{ code: number; err: string }> => {
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0" },
  }).output();
  return { code, err: new TextDecoder().decode(stderr) };
};

/// Write `src` to a temp .vl file, `vl check` it, assert a NONZERO exit whose
/// stderr names `stage` and contains `path:<want>` (i.e. the absolute input
/// path immediately followed by the expected `:line:col: message…` fragment).
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
    // Line 2, col 16 (0-based) is the `x` initializer — the type-diag anchor.
    await assertPositioned(
      "let x: i32 = 1\nlet y: string = x\n",
      "type",
      ":2:16: cannot assign i32 to 'y' of type string",
    );
  },
});

Deno.test({
  name: "native-diag-pos: parse error carries path:line:col of the unexpected token",
  ignore: !ENABLED,
  fn: async () => {
    // Line 2, col 4 (0-based) is the `=` where an IDENT was expected.
    await assertPositioned(
      "let x: i32 = 1\nlet = 5\n",
      "parse",
      ":2:4: expected IDENT but found EQUAL",
    );
  },
});

Deno.test({
  name: "native-diag-pos: lex diagnostic carries the lexer's own line:col",
  ignore: !ENABLED,
  fn: async () => {
    // A multi-char char literal is a LEX error (folded into the parse stage);
    // the lexer anchors it at line 1, col 12 (0-based) — the closing quote.
    await assertPositioned("let c = 'ab'\n", "parse", ":1:12: ");
  },
});

Deno.test({
  name: "native-diag-pos: corpus lambda-uninferable-param pins the parameter token",
  ignore: !ENABLED,
  fn: async () => {
    // The real corpus file: `const f = function(n) n * 2` on line 7 — the
    // uninferable parameter `n` sits at col 19 (0-based).
    const path = `${ROOT}/tests/cases/functions/lambda-uninferable-param.vl`;
    const r = await check(path);
    if (r.code === 0) throw new Error("expected rejection, vl check exited 0");
    const needle = `${path}:7:19: cannot infer a type for parameter \`n\``;
    if (!r.err.includes(needle)) {
      throw new Error(`expected stderr to contain "${needle}", got:\n${r.err}`);
    }
  },
});
