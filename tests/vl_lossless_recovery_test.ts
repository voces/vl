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
//   THE REMAINING PHANTOMS — the corpus cases whose LOSSY recoveries invent
//   fiction the checker would then diagnose. Measured by lifting the bail
//   wholesale (2026-09-01, and again by this change's author before writing it):
//   FIVE cases, five phantom type errors over programs the parser guessed at.
//   Each is pinned here by the message that must NOT appear. Stage 2 converts
//   the lossy skip sites one at a time; each conversion must DELETE its pin here
//   deliberately, having made the recovery faithful — never quietly, by widening
//   the gate. That is the whole reason these are written down.
//
//   FOUR REMAIN. `parser/call-missing-comma-recovers.vl` was the first to go
//   (stage 2, `expectClose`): a missing list separator is now INSERTED rather
//   than skipped past, so `f(1 2)` is the two-argument call it looks like and
//   there is no phantom arity left to forbid. Its replacement is the POSITIVE
//   section below — deleting a pin without standing a witness in its place is
//   how this file would quietly stop meaning anything.
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

// The COUNT is asserted, not just the contents: a pin deleted without its
// conversion would otherwise shrink this list silently, which is the exact
// failure mode the header warns about. Bump it WITH the conversion.
Deno.test({
  name: "the phantom pins: four remain, and the list is not shrunk by accident",
  ignore: !ENABLED,
  fn: () => {
    if (PHANTOMS.length !== 4) {
      throw new Error(
        `want 4 phantom pins (five were filed 2026-09-01; stage 2's expectClose ` +
          `conversion retired parser/call-missing-comma-recovers.vl), got ${PHANTOMS.length}: ` +
          PHANTOMS.map((p) => p.case).join(", "),
      );
    }
  },
});

Deno.test({
  name: "the phantoms: a LOSSY recovery reports only its parse diagnostics",
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

// ── THE RETIRED PIN, STANDING AS A WITNESS ───────────────────────────────────
// `parser/call-missing-comma-recovers.vl` left the PHANTOMS list because the
// recovery it named became faithful, not because the gate was widened. What
// follows is the evidence for that sentence, and it is deliberately stronger
// than "the phantom is absent": absence is also what a file that never reaches
// the checker looks like, so every case below places a REAL type error after the
// mistake and requires it to be REPORTED.

const PHANTOM_ARITY = "wrong number of arguments: expected 2, got 1";

// One spelling of the separator recovery: `src` must report exactly `parse` (the
// inserted-separator diagnostic) followed by the type error four-ish lines down,
// and never the phantom.
const gradeSpelling = async (
  dir: string,
  name: string,
  src: string,
  parse: string[],
) => {
  const errs = await errorsOf(dir, name, src);
  const msgs = errs.map((d) => d.message);
  const want = [...parse, TYPE_ERR];
  if (msgs.some((m) => m.includes(PHANTOM_ARITY))) {
    throw new Error(
      `${name}: the PHANTOM arity error is back — the separator is being ` +
        `skipped past again, not inserted: ${fmtDiags(errs)}`,
    );
  }
  if (msgs.length !== want.length || msgs.some((m, i) => m !== want[i])) {
    throw new Error(
      `${name}: want ${JSON.stringify(want)}, got: ${fmtDiags(errs)}`,
    );
  }
};

Deno.test({
  name: "stage 2: a missing list separator is INSERTED, and the file typechecks",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const F2 = "function f(a: i32, b: i32) { a + b }\n";
      const TE = 'const n: i32 = "hi"\n';
      // The retired pin's own program, minus the unrelated lossy `o.x++`.
      await gradeSpelling(
        dir,
        "call2",
        `${F2}print(f(1 2))\n${TE}`,
        ["expected `,` but found `2`"],
      );
      // Two separators missing in one list — each reported once, both inserted.
      await gradeSpelling(
        dir,
        "call3",
        'function g(a: i32, b: i32, c: i32) { a + b + c }\nprint(g(1 2 3))\nconst n: i32 = "hi"\n',
        ["expected `,` but found `2`", "expected `,` but found `3`"],
      );
      // NESTED: the inner call recovers and the outer list is untouched.
      await gradeSpelling(
        dir,
        "nested",
        `${F2}function g(a: i32, b: i32) { a * b }\nprint(g(f(1 2), 3))\n${TE}`,
        ["expected `,` but found `2`"],
      );
      // An ARRAY literal — `expectClose("RBRACK")`'s list.
      await gradeSpelling(
        dir,
        "array",
        'const a = [1 2]\nprint(a.length)\nconst n: i32 = "hi"\n',
        ["expected `,` but found `2`"],
      );
      // An OBJECT literal — `expectClose("RBRACE")`'s list; the element start is
      // the field KEY, not an expression.
      await gradeSpelling(
        dir,
        "objlit",
        'const o = { x: 1 y: 2 }\nprint(o.x + o.y)\nconst n: i32 = "hi"\n',
        ["expected `,` but found `y`"],
      );
      // A PARAMETER list — the declaration side of the same `expectClose`.
      await gradeSpelling(
        dir,
        "params",
        'function h(a: i32 b: i32) { a + b }\nprint(h(1, 2))\nconst n: i32 = "hi"\n',
        ["expected `,` but found `b`"],
      );
    });
  },
});

// THE TREE, NOT THE ABSENCE. An arity error that is REAL must still fire, and it
// must name the arity the user wrote: `f(1 2 3)` against a two-parameter `f` is
// `got 3`. This is what separates "the separator was inserted" from "the checker
// happened not to run" — the phantom's own message, with the right number in it.
Deno.test({
  name: "stage 2: the recovered call really holds every argument (`got 3`)",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const errs = await errorsOf(
        dir,
        "arity",
        "function f(a: i32, b: i32) { a + b }\nprint(f(1 2 3))\n",
      );
      const want = [
        "expected `,` but found `2`",
        "expected `,` but found `3`",
        "wrong number of arguments: expected 2, got 3",
      ];
      if (
        errs.length !== want.length ||
        errs.some((d, i) => d.message !== want[i])
      ) {
        throw new Error(`want ${JSON.stringify(want)}, got: ${fmtDiags(errs)}`);
      }
    });
  },
});

// STILL GATED, ON PURPOSE. `{` is not an element-start for this recovery (it is
// `expectClose`'s own scan bound, and after a complete element it is far more
// often a missing closer than a missing comma), so `[{x: 1} {x: 2}]` keeps the
// LOSSY skip — and must therefore keep the bail. A conversion that quietly
// widened to `{` would show up here as a type error appearing.
Deno.test({
  name: "stage 2: an element-start the recovery excludes is correctly still gated",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const errs = await errorsOf(
        dir,
        "objelem",
        'const a = [{ x: 1 } { x: 2 }]\nprint(a.length)\nconst n: i32 = "hi"\n',
      );
      const msgs = errs.map((d) => d.message);
      if (msgs.includes(TYPE_ERR)) {
        throw new Error(
          `a LOSSY skip-to-closer must still bail: ${fmtDiags(errs)}`,
        );
      }
      if (!msgs.includes("expected `]` but found `{`")) {
        throw new Error(
          `the parse diagnostic this case rests on is gone: ${fmtDiags(errs)}`,
        );
      }
    });
  },
});

// THE FORMATTER STILL KEEPS THE AS-WRITTEN READING. The comma is inserted into
// the TREE, not into the file: `fmt` is the one consumer that keeps the old
// `P.diags.length > 0` bail, so it must refuse and leave the source byte-
// identical rather than silently spelling the missing `,` in.
Deno.test({
  name: "`vl fmt` does not write the inserted `,` back into the file",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/fmtcomma.vl`;
      const src = "function f(a: i32, b: i32) { a + b }\nprint(f(1 2))\n";
      await Deno.writeTextFile(file, src);
      const r = await run(["fmt", "-w", file]);
      if (r.code === 0) {
        throw new Error("want `vl fmt` to refuse a file with a parse diagnostic");
      }
      const after = await Deno.readTextFile(file);
      if (after !== src) {
        throw new Error(`fmt re-spelled the mistake: ${JSON.stringify(after)}`);
      }
    });
  },
});

// ── THE NEWLINE GATE, PINNED AS THE PHANTOMS IT WOULD OTHERWISE INVENT ────────
// The separator insert is SAME-LINE ONLY, and these four programs are why. Every
// list site skips NEWLINEs before asking whether the list continues (a list may
// legally span lines), so an ungated insert reads a missing CLOSER at end of line
// as a missing COMMA and swallows the NEXT STATEMENT as an element — after which
// `expectClose` reaches EOF having consumed nothing, marks the diagnostic
// LOSSLESS, and the checker runs over a program nobody wrote. Measured on the
// first cut of this change, and caught in review before it merged:
//
//     const xs = [1, 2      ->  `expected `,` but found `print``, then
//     print(xs.length)          ``xs` is used before it is assigned` AND
//                               `list element expects a value, got void`
//
// Each row therefore pins MASTER'S OWN OUTPUT — the exact diagnostics the
// pre-change compiler produced, no more — and requires that the file is NOT
// typechecked, by placing a real type error after the mistake and forbidding it.
// That is the inverse assertion of the positive section above, and it is the one
// that fails if the gate is ever dropped.
//
// The FOURTH row is the PRICE, deliberately recorded beside the phantoms: a
// missing comma at a line end inside a MULTI-LINE list is not inserted either,
// because a missing closer and a missing separator are indistinguishable there —
// the tokens are identical. It behaves exactly as master does; it is a capability
// this change does not GAIN, not one it loses.
const NEWLINE_GATED: { name: string; why: string; src: string; want: string[] }[] = [
  {
    name: "array-eol",
    why: "a missing `]` at end of line must not eat the next statement",
    src: 'const xs = [1, 2\nprint(xs.length)\nconst n: i32 = "hi"\n',
    want: ["expected `]` but found `print`"],
  },
  {
    name: "call-eol",
    why: "a missing `)` at end of line must not eat the next call",
    src: 'print(1\nfoo()\nconst n: i32 = "hi"\n',
    want: ["expected `)` but found `foo`"],
  },
  {
    name: "objlit-eol",
    why: "a missing `}` at end of line must not eat the next statement",
    src: 'const a = { x: 1\nprint(a.x)\nconst n: i32 = "hi"\n',
    want: ["expected `}` but found `print`"],
  },
  {
    name: "multiline-list",
    why: "THE PRICE: a separator missing at a line end is not inserted either",
    src: 'const xs = [\n  1\n  2\n]\nprint(xs.length)\nconst n: i32 = "hi"\n',
    want: [
      "expected `]` but found `2`",
      "expected an expression but found RBRACK",
    ],
  },
];

Deno.test({
  name: "the newline gate: a missing CLOSER at end of line is never read as a missing COMMA",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      for (const c of NEWLINE_GATED) {
        const errs = await errorsOf(dir, `nl_${c.name}`, c.src);
        const msgs = errs.map((d) => d.message);
        if (msgs.some((m) => m.startsWith("expected `,`"))) {
          throw new Error(
            `${c.name} (${c.why}): a separator was INSERTED across a newline — ` +
              `the next statement is now an element: ${fmtDiags(errs)}`,
          );
        }
        if (msgs.includes(TYPE_ERR)) {
          throw new Error(
            `${c.name} (${c.why}): the file was TYPECHECKED — a skip-to-closer ` +
              `recovery must keep the bail: ${fmtDiags(errs)}`,
          );
        }
        if (msgs.length !== c.want.length || msgs.some((m, i) => m !== c.want[i])) {
          throw new Error(
            `${c.name} (${c.why}): want exactly master's ${
              JSON.stringify(c.want)
            }, got: ${fmtDiags(errs)}`,
          );
        }
      }
    });
  },
});
