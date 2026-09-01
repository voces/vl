// LOSSLESS RECOVERY, STAGE 1 — a recovered parse still gets TYPECHECKED, and a
// lossy one still does not.
//
// The rule (DECISIONS.md, owner ruling 2026-09-01): the checker runs past parse
// diagnostics IFF EVERY parse diagnostic in the file carries the lossless flag.
// Exactly one site sets it — `parseBracedBody`'s unbraced-body recovery, where
// the recovered arm IS the statement the user wrote, nothing dropped and nothing
// invented. Emit never proceeds past ANY parse diagnostic: a recovered program
// CHECKS, it does not BUILD.
//
// Two halves, and the second is the load-bearing one:
//
//   THE PAYOFF — an unbraced `if` and a genuine type error four lines down are
//   reported TOGETHER. Before this, the type error was swallowed by the parse
//   bail, which is what made a missing brace mid-typing blank the LSP's entire
//   type feedback.
//
//   THE FIVE PHANTOMS — the exact five corpus cases whose LOSSY recoveries
//   invent fiction the checker would then diagnose. Measured by lifting the bail
//   wholesale (2026-09-01, and again by this change's author before writing it):
//   five cases, five phantom type errors over programs the parser guessed at.
//   Each is pinned here by the message that must NOT appear. Stage 2 converts
//   the lossy skip sites one at a time; each conversion must DELETE its pin here
//   deliberately, having made the recovery faithful — never quietly, by widening
//   the gate. That is the whole reason these are written down.
//
// GATING: same as tests/vl_unbraced_body_recovery_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

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
  console.warn("[vl-lossless-recovery] skipped — missing vl binary or seed wasm.");
}

type Diag = {
  severity: string;
  line?: number;
  col?: number;
  endCol?: number;
  message: string;
};

const run = async (
  args: string[],
): Promise<{ code: number; out: string; err: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    // The host resolves `std:` from the BINARY's checkout, and a worktree's
    // binary is a symlink into the main repo — pin std to THIS tree.
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

const jsonDiags = async (file: string): Promise<Diag[]> => {
  const { out, err } = await run(["check", file, "--json"]);
  try {
    return JSON.parse(out.trim()) as Diag[];
  } catch {
    throw new Error(`${file}: --json stdout is not JSON: ${out}\n${err}`);
  }
};

// Only the ERROR tier. Lint warnings and hints now reach a recovered file too
// (that is a second, smaller payoff of the same change — `lintSrc` shares the
// gate), and they are asserted separately rather than woven through every case.
const errorsOf = async (dir: string, name: string, src: string) => {
  const file = `${dir}/${name}.vl`;
  await Deno.writeTextFile(file, src);
  return (await jsonDiags(file)).filter((d) => d.severity === "error");
};

const fmtDiags = (ds: Diag[]) =>
  ds.map((d) => `${d.line}:${d.col} [${d.severity}] ${d.message}`).join("; ") ||
  "(none)";

const withDir = async (fn: (dir: string) => Promise<void>): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_lossless_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const BRACES = "an `if` body requires braces: `if cond { … }`";
const TYPE_ERR = "cannot assign string to 'n' of type i32";

// ── THE PAYOFF ────────────────────────────────────────────────────────────────

Deno.test({
  name: "payoff: an unbraced `if` and a later type error are reported TOGETHER",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const errs = await errorsOf(
        dir,
        "payoff",
        'const c = true\nif c print(1)\nconst n: i32 = "hi"\n',
      );
      const want: { message: string; line: number; col: number }[] = [
        { message: BRACES, line: 2, col: 6 },
        { message: TYPE_ERR, line: 3, col: 16 },
      ];
      if (errs.length !== want.length) {
        throw new Error(
          `want ${want.length} errors (the parse diagnostic AND the type error), got ${errs.length}: ${
            fmtDiags(errs)
          }`,
        );
      }
      for (let i = 0; i < want.length; i++) {
        if (
          errs[i].message !== want[i].message ||
          errs[i].line !== want[i].line || errs[i].col !== want[i].col
        ) {
          throw new Error(
            `error ${i}: want ${JSON.stringify(want[i])}, got ${
              JSON.stringify(errs[i])
            }`,
          );
        }
      }
    });
  },
});

// EMIT NEVER PROCEEDS. `vl run` / `vl build` keep rc 1 and produce no module;
// the only change is that the type error now rides along with the parse error.
Deno.test({
  name: "payoff: a recovered program CHECKS but does not BUILD",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/nobuild.vl`;
      await Deno.writeTextFile(
        file,
        'const c = true\nif c print(1)\nconst n: i32 = "hi"\n',
      );
      const out = `${dir}/nobuild.wasm`;
      const built = await run(["build", file, "-o", out]);
      if (built.code === 0) throw new Error("want a non-zero exit from `vl build`");
      if (exists(out)) throw new Error("`vl build` wrote a module for a parse-error file");
      if (!built.err.includes(BRACES) || !built.err.includes(TYPE_ERR)) {
        throw new Error(`want both diagnostics on stderr, got: ${built.err}`);
      }
      const ran = await run(["run", file]);
      if (ran.code === 0) throw new Error("want a non-zero exit from `vl run`");
      if (ran.out.length !== 0) {
        throw new Error(`a parse-error program must not RUN, got stdout: ${ran.out}`);
      }
    });
  },
});

// The ALL quantifier. One lossy diagnostic anywhere in the file restores the old
// bail for the WHOLE file — the type error below must NOT be reported, because
// the AST it would be read off has had tokens dropped from it.
Deno.test({
  name: "the quantifier is ALL: one lossy diagnostic beside a lossless one bails",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const errs = await errorsOf(
        dir,
        "mixed",
        'const c = true\nif c print(1)\nconst n: i32 = "hi"\nlet o = { x: 1 }\no.x++\n',
      );
      const want = [BRACES, "postfix `++` target must be an identifier"];
      if (errs.length !== want.length) {
        throw new Error(
          `want exactly the ${want.length} PARSE diagnostics, got ${errs.length}: ${
            fmtDiags(errs)
          }`,
        );
      }
      for (let i = 0; i < want.length; i++) {
        if (errs[i].message !== want[i]) {
          throw new Error(
            `error ${i}: want ${JSON.stringify(want[i])}, got ${
              JSON.stringify(errs[i].message)
            }`,
          );
        }
      }
      // The CONTROL for this case is the payoff test above: the identical type
      // error IS reported once the lossy `o.x++` is removed.
    });
  },
});

// Several lossless recoveries are still all-lossless.
Deno.test({
  name: "three unbraced bodies and a type error report FOUR errors",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const errs = await errorsOf(
        dir,
        "multi",
        "const c = true\nif c print(1)\nwhile c print(2)\nfor i in 0 to 2 print(i)\n" +
          'const n: i32 = "hi"\n',
      );
      const want = [
        BRACES,
        "a `while` body requires braces: `while cond { … }`",
        "a `for` body requires braces: `for v in … { … }`",
        TYPE_ERR,
      ];
      if (errs.length !== want.length) {
        throw new Error(
          `want ${want.length} errors, got ${errs.length}: ${fmtDiags(errs)}`,
        );
      }
      for (let i = 0; i < want.length; i++) {
        if (errs[i].message !== want[i]) {
          throw new Error(
            `error ${i}: want ${JSON.stringify(want[i])}, got ${
              JSON.stringify(errs[i].message)
            }`,
          );
        }
      }
    });
  },
});

// ORDERING. The driver's diagnostic STREAM is parse-then-type (`diagCount` reads
// `P.diags` before `T.diags`), and `vl run`/`vl build` print it in that order.
// The `vl check` REPORT stable-sorts every tier by (line, col) — it has merged
// error, lint and hint streams that way since long before this change — so the
// two now INTERLEAVE by position, ties keeping stream order. Nothing here is a
// new decision; this pins that the existing sink was left coherent.
Deno.test({
  name: "ordering: `check` interleaves parse and type diagnostics by position",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/order.vl`;
      // The TYPE error is on line 1, the PARSE error on line 3 — so stream order
      // and position order disagree, which is the only way to tell them apart.
      await Deno.writeTextFile(
        file,
        'const n: i32 = "hi"\nconst c = true\nif c print(1)\n',
      );
      const errs = (await jsonDiags(file)).filter((d) => d.severity === "error");
      if (errs.length !== 2) {
        throw new Error(`want 2 errors, got ${errs.length}: ${fmtDiags(errs)}`);
      }
      if (errs[0].message !== TYPE_ERR || errs[1].message !== BRACES) {
        throw new Error(
          `want the line-1 TYPE error first, then the line-3 parse error; got ${
            fmtDiags(errs)
          }`,
        );
      }
      // …and the raw stream `vl run` prints is the other order.
      const ran = await run(["run", file]);
      const pi = ran.err.indexOf(BRACES);
      const ti = ran.err.indexOf(TYPE_ERR);
      if (pi < 0 || ti < 0 || pi > ti) {
        throw new Error(
          `want the PARSE diagnostic first in \`vl run\`'s raw stream, got: ${ran.err}`,
        );
      }
    });
  },
});

// The lint tier shares the gate, so a recovered file keeps its lint feedback
// too. (`lintSrc` returned -1 on any parse diagnostic before.)
Deno.test({
  name: "lint runs over a lossless-recovered AST",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/lint.vl`;
      await Deno.writeTextFile(file, "const c = true\nif c print(1)\nlet unusedX = 5\n");
      const diags = await jsonDiags(file);
      if (!diags.some((d) => d.code === "unused-variable" && d.line === 3)) {
        throw new Error(`want the unused-variable lint on line 3, got ${fmtDiags(diags)}`);
      }
    });
  },
});

// THE FORMATTER KEEPS THE OLD BAIL, deliberately: it writes its output back over
// the file, so printing a recovered AST would silently re-spell the user's
// mistake as the braced form and erase the diagnostic with it.
Deno.test({
  name: "`vl fmt` still refuses a recovered file and leaves it byte-identical",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/fmt.vl`;
      const src = "const c = true\nif c print(1)\n";
      await Deno.writeTextFile(file, src);
      const r = await run(["fmt", "-w", file]);
      if (r.code === 0) throw new Error("want `vl fmt` to refuse a parse-error file");
      const after = await Deno.readTextFile(file);
      if (after !== src) {
        throw new Error(`fmt rewrote a recovered file: ${JSON.stringify(after)}`);
      }
    });
  },
});

// ── THE FIVE PHANTOMS ────────────────────────────────────────────────────────
// Each entry is a REAL corpus case (the population the bail-lifting experiment
// was measured against), its exact parse diagnostics, and the phantom type
// error(s) running the checker over its lossy AST invents. `forbidden` is the
// assertion that matters; `want` is there so a case that stops reproducing its
// parse error fails LOUDLY instead of passing vacuously.
type Phantom = {
  case: string;
  why: string;
  want: string[];
  forbidden: string[];
};

const PHANTOMS: Phantom[] = [
  {
    case: "parser/call-missing-comma-recovers.vl",
    // The one DECISIONS.md names: `f(1 2)` resyncs at the `)`, so the call
    // parses HOLE-FREE as `f(1)` — there is no `ErrExpr` in the tree to detect,
    // and the arity the checker then reads is a number nobody wrote.
    why: "`f(1 2)` re-parses to a hole-free `f(1)`",
    want: [
      "expected `)` but found `2`",
      "postfix `++` target must be an identifier",
    ],
    forbidden: ["wrong number of arguments: expected 2, got 1"],
  },
  {
    case: "functions/trailing-comma-illegal.vl",
    why: "the dropped trailing argument leaves a call the declaration disagrees with",
    want: ["expected an expression but found COMMA"],
    forbidden: ["wrong number of arguments: expected 0, got 1"],
  },
  {
    case: "objects/error-equality-not-overloadable.vl",
    // The mis-parsed overload DECLARATIONS collide with each other.
    why: "the refused `function \"==\"` declarations re-enter as duplicates",
    want: [
      "`==` is not overloadable — every type compares structurally, and a `function \"==\"` declaration would be ignored",
      "`!=` is not overloadable — every type compares structurally, and a `function \"!=\"` declaration would be ignored",
    ],
    forbidden: ["redeclared ==", "redeclared !="],
  },
  {
    case: "index/operator-unannotated-self.vl",
    why: "the refused index-operator declaration leaves the receiver un-indexable",
    want: [
      "an index operator needs an annotated `self` parameter — write `function \"[]\"(self: T, …)` (the receiver TYPE is what it dispatches on)",
    ],
    forbidden: ["cannot index non-array Box"],
  },
  {
    case: "parser/coalesce-logical-mix-error.vl",
    why: "the refused `??`/`&&` chain re-groups into operands it never had",
    want: [
      "unparenthesized `??` mixed with `||` — add parentheses to make the grouping explicit",
      "unparenthesized `??` mixed with `&&` — add parentheses to make the grouping explicit",
    ],
    forbidden: ["operator '&&' expects boolean operands"],
  },
];

Deno.test({
  name: "the five phantoms: a LOSSY recovery reports only its parse diagnostics",
  ignore: !ENABLED,
  fn: async () => {
    for (const p of PHANTOMS) {
      const file = `${ROOT}/tests/cases/${p.case}`;
      if (!exists(file)) {
        throw new Error(
          `${p.case}: the pinned corpus case is gone — a phantom pin must name a ` +
            `real program, so move the pin rather than deleting the case`,
        );
      }
      const errs = (await jsonDiags(file)).filter((d) => d.severity === "error");
      const msgs = errs.map((d) => d.message);
      for (const bad of p.forbidden) {
        if (msgs.some((m) => m.includes(bad))) {
          throw new Error(
            `${p.case}: PHANTOM type error leaked (${p.why}): ${
              JSON.stringify(bad)
            }\n  got: ${fmtDiags(errs)}`,
          );
        }
      }
      for (const good of p.want) {
        if (!msgs.some((m) => m === good)) {
          throw new Error(
            `${p.case}: the parse diagnostic this pin rests on is gone — want ${
              JSON.stringify(good)
            }, got: ${fmtDiags(errs)}`,
          );
        }
      }
      // No diagnostic outside the parse tier at all: the checker never ran.
      for (const m of msgs) {
        if (!p.want.includes(m)) {
          throw new Error(
            `${p.case}: an unexpected error appeared — the checker must not run on a ` +
              `lossy parse: ${JSON.stringify(m)}\n  got: ${fmtDiags(errs)}`,
          );
        }
      }
    }
  },
});
