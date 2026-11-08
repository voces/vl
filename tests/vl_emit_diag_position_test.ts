// NATIVE `vl check --codegen` — an EMIT-side refusal must carry a POSITION, and in a module
// graph that position's file must be the DEFINING module's (D1519, reported by the glean
// session as VL-024 / VL-026).
//
// The check path already had both properties (tests/vl_check_module_diag_test.ts is its
// guard); the emit path had neither in two places. A refusal raised by a program-wide COLLECT
// pass printed `at <file>` with no line at all, because `emitFail` anchors at
// `emitCurStmtIx`/`emitCurFnIx` and neither is armed before the first body is lowered. And
// `driver.vl`'s `diagModule` had no arm for the emit diagnostic at all — `diagLine`/`diagCol`
// resolved it through `emitErrTokIx` and got the defining module's own line, while this one
// fell through to module 0, so a refusal at `lib.vl:15` printed as `main.vl:15`.
//
// THE WITNESS MUST STILL REFUSE. `emitFail` records and keeps emitting, so a probe built on a
// program that COMPILES reports nothing at all — a green run over a fixed witness is the
// instrument saying nothing, not the property holding. Both cases therefore assert the
// refusal fired FIRST and name the replacement work if it stops.
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` plus the built binary and seed, as vl_check_dir_test.ts.
//
// @test-timing native

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-emit-diag-position] skipped — missing vl binary or seed wasm.",
  );
}

const checkCodegen = async (
  target: string,
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", "--codegen", target, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
  };
};

// The `[ERROR]` block alone. A HINT or WARNING block carries its own `at file:line:col`, and
// matching anywhere in the output reads one of THOSE — which graded a positionless emit
// refusal as positioned while this test was being written.
const errorBlock = (out: string): string => {
  const lines = out.split("\n");
  const start = lines.findIndex((l) => l.startsWith("[ERROR]"));
  if (start < 0) return "";
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("[")) end += 1;
  return lines.slice(start, end).join("\n");
};

// A BODY-phase refusal: a `let` with no initializer whose type has no zero value, shared with a
// closure (D2340), anchored at that `let` on line 7.
const BODY_WITNESS = `function twice(n: i32) {
  n * 2
}
type P = { x: i32 }
function main() {
  print(twice(1))
  let p: P
  const g = () => p.x
  p = { x: 7 }
  print(g())
}
main()
`;

Deno.test({
  name:
    "vl-emit-diag-position: a function body's emit refusal carries file:line:col",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_pos_" });
    try {
      await Deno.writeTextFile(`${dir}/body.vl`, BODY_WITNESS);
      const r = await checkCodegen("body.vl", dir);
      if (!r.out.includes("emit error")) {
        throw new Error(
          "the top-level witness no longer reaches an emit refusal, so this guard is " +
            "measuring nothing — replace BODY_WITNESS with another program whose refusal " +
            `carries a position.\n${r.out}`,
        );
      }
      const blk = errorBlock(r.out);
      if (!/at \S*body\.vl:\d+:\d+/.test(blk)) {
        throw new Error(
          `expected the emit refusal to carry body.vl:<line>:<col>, got:\n${blk}`,
        );
      }
      // The anchor is the refused `let` on line 7, not the last statement in the file.
      if (!/at \S*body\.vl:7:\d+/.test(blk)) {
        throw new Error(
          `expected the anchor on line 7 (the refused let), got:\n${blk}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "vl-emit-diag-position: a refusal inside an imported module names THAT file",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_emit_mod_" });
    try {
      // `lib.vl` carries the same refusal, on its own line 7. `main.vl` is two lines, so a
      // merged-module line would land past the end of the file it names — the shape the
      // reporter bisected the wrong file for.
      await Deno.writeTextFile(
        `${dir}/lib.vl`,
        BODY_WITNESS + "export function one(): i32 { 1 }\n",
      );
      await Deno.writeTextFile(
        `${dir}/main.vl`,
        'import { one } from "./lib"\nprint(one())\n',
      );
      const r = await checkCodegen("main.vl", dir);
      if (!r.out.includes("emit error")) {
        throw new Error(
          "the imported witness no longer reaches an emit refusal, so this guard is " +
            `measuring nothing — replace it with another cross-module refusal.\n${r.out}`,
        );
      }
      const blk = errorBlock(r.out);
      if (!/at \S*lib\.vl:\d+:\d+/.test(blk)) {
        throw new Error(
          `expected the emit refusal attributed to lib.vl with a line:col, got:\n${blk}`,
        );
      }
      if (/at \S*main\.vl:/.test(blk)) {
        throw new Error(
          `the emit refusal is still labelled against the ENTRY file:\n${blk}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// A refusal raised while a hole parameter's instance is lowered (D15566, D15010's witness plus a
// slot write, since D15010's spelling and D15529's push run): the instance's body is rebuilt into nodes minted after
// parsing, and the anchor is the line they were rebuilt from, line 7 inside `take`, in the module
// that declares it (D15155, D15157). The same shapes with `use` generic.
const INSTANCE_WITNESS = `function id<T>(x: T): T { x }
function use(ys) { print(ys.length) }
function take(a) {
  const xs = [a]
  xs[0] = a
  use(xs)
  print(xs[0]("abc").length + xs[0](2))
}
`;

Deno.test({
  name:
    "vl-emit-diag-position: a refusal inside a parameter's instance names its body line, in its own module",
  ignore: !ENABLED,
  fn: async () => {
    const generic = INSTANCE_WITNESS.replace(
      "function use(ys)",
      "function use<T>(ys: T[])",
    );
    const shapes: { name: string; lib: string; main: string | null }[] = [
      { name: "one file", lib: INSTANCE_WITNESS + "take(id)\n", main: null },
      {
        name: "a function after it",
        lib: INSTANCE_WITNESS + "take(id)\nexport function one(): i32 { 1 }\n",
        main: null,
      },
      {
        name: "a wrapper call",
        lib: INSTANCE_WITNESS + "function run() { take(id) }\nrun()\n",
        main: null,
      },
      {
        name: "imported, at the module's top level",
        lib: INSTANCE_WITNESS + "take(id)\nexport function one(): i32 { 1 }\n",
        main: 'import { one } from "./lib"\nprint(one())\n',
      },
      {
        name: "imported, a generic instance",
        lib: generic + "export function run() { take(id) }\n",
        main: 'import { run } from "./lib"\nrun()\n',
      },
    ];
    for (const s of shapes) {
      const dir = await Deno.makeTempDir({ prefix: "vl_emit_inst_" });
      try {
        await Deno.writeTextFile(`${dir}/lib.vl`, s.lib);
        if (s.main !== null) await Deno.writeTextFile(`${dir}/main.vl`, s.main);
        const r = await checkCodegen(
          s.main === null ? "lib.vl" : "main.vl",
          dir,
        );
        if (!r.out.includes("emit error")) {
          throw new Error(
            `${s.name}: the instance witness no longer reaches an emit refusal, so this guard ` +
              `is measuring nothing — replace INSTANCE_WITNESS (D15566 closed?).\n${r.out}`,
          );
        }
        const blk = errorBlock(r.out);
        if (!/at \S*lib\.vl:7:\d+/.test(blk)) {
          throw new Error(
            `${s.name}: want the anchor at lib.vl:7 (the refused read in \`take\`), got:\n${blk}`,
          );
        }
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    }
  },
});

// A refusal raised before any body is lowered (D15154): a `monomorphize:` refusal is anchored at
// the call being instantiated, line 8. The collect phase has no known check-clean refusal left
// (D15150, the last, now runs); add the next one found here, anchored at its declaration. The
// instance case above is the restore's control: `take(id)` is instantiated before `take`'s body
// refuses, and a cursor left armed would name the call instead of `take`.
const MONO_WITNESS = `function id<T>(x: T): T { x }
function use<T>(ys: T[]) { print(ys.length) }
function take<T>(a: T) {
  const xs = [a]
  use(xs)
  print(xs[0]("abc").length + xs[0](2))
}
take(id)
`;

Deno.test({
  name:
    "vl-emit-diag-position: a refusal raised before any body is lowered names the call",
  ignore: !ENABLED,
  fn: async () => {
    const cases: { name: string; src: string; line: number }[] = [
      { name: "monomorphize", src: MONO_WITNESS, line: 8 },
    ];
    for (const c of cases) {
      const dir = await Deno.makeTempDir({ prefix: "vl_emit_early_" });
      try {
        await Deno.writeTextFile(`${dir}/early.vl`, c.src);
        const r = await checkCodegen("early.vl", dir);
        if (!r.out.includes("emit error")) {
          throw new Error(
            `${c.name}: the witness no longer reaches an emit refusal, so this guard is ` +
              `measuring nothing — replace it with another refusal of that phase.\n${r.out}`,
          );
        }
        const blk = errorBlock(r.out);
        if (!new RegExp(`at \\S*early\\.vl:${c.line}:\\d+`).test(blk)) {
          throw new Error(
            `${c.name}: want the anchor at early.vl:${c.line}, got:\n${blk}`,
          );
        }
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    }
  },
});
