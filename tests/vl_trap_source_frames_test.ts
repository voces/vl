// THE TRAP FRAME NAMES THE LINE THE INSTRUCTION CAME FROM (ROADMAP row 22).
//
// A trap frame is an offset plus a name-section string — `0x118 - vl!boom@3` — and a
// name-section string can only be per FUNCTION, so the `@3` is where `boom` was DECLARED.
// The emitter's `vl-src` custom section carries one row per body and per statement over the
// same module bytes, and the host joins the frame's `module_offset()` against it.
//
// The assertions are the LINES, at three depths and across two files, because that is the
// whole claim. Each control's trapping statement is on a line that differs from its
// declaration's, so a regression to the old behaviour cannot pass: `boom` is declared on 3
// and traps on 7, the lambda is anchored at 9 and traps on 7, `outer` is declared on 4 and
// traps on 10.
//
// @test-timing instrument

import { COMPILER, STD, VL, exists } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) {
  console.warn("[vl-trap-source-frames] skipped — missing vl binary or seed wasm.");
}

/** Run `files` (the last is the entry) and return the `at …` lines under the trap. */
const frames = async (files: Record<string, string>, entry: string): Promise<string[]> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-trap-frames-" });
  try {
    for (const [name, body] of Object.entries(files)) {
      await Deno.writeTextFile(`${dir}/${name}`, body);
    }
    const p = new Deno.Command(VL, {
      args: ["run", `${dir}/${entry}`, "--compiler", COMPILER],
      env: { VL_STD: STD },
      stdout: "piped",
      stderr: "piped",
    });
    const out = await p.output();
    const text = new TextDecoder().decode(out.stderr);
    if (out.code === 0) {
      throw new Error(`want a trap, got exit 0\n${text}`);
    }
    return text
      .split("\n")
      .filter((l) => l.startsWith("    at "))
      .map((l) => l.trim());
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

const want = (got: string[], expect: string[], what: string) => {
  const g = JSON.stringify(got);
  const e = JSON.stringify(expect);
  if (g !== e) throw new Error(`${what}\n  want ${e}\n  got  ${g}`);
};

Deno.test({
  name: "a module-scope trap names its own line",
  ignore: !ENABLED,
  fn: async () => {
    const src = [
      "// depth 1 — the trap is at MODULE SCOPE.",
      "// line 2",
      "const xs = [1, 2]",
      "// line 4",
      "print(xs[9])",
      "",
    ].join("\n");
    want(await frames({ "m.vl": src }, "m.vl"), ["at 5:1  in `__start__`"], "module scope");
  },
});

Deno.test({
  name: "a trap inside a function names the statement, not the declaration",
  ignore: !ENABLED,
  fn: async () => {
    const src = [
      "// line 1",
      "// line 2",
      "function boom(n: i32): i32 {",
      "  // line 4",
      "  const xs = [1, 2]",
      "  // line 6",
      "  xs[n]",
      "}",
      "// line 9",
      "print(boom(0))",
      "print(boom(9))",
      "",
    ].join("\n");
    // `boom` is DECLARED on line 3 — the name section's own suffix says `@3`.
    want(await frames({ "m.vl": src }, "m.vl"), [
      "at 7:3  in `boom`",
      "at 11:1  in `__start__`",
    ], "inside a function");
  },
});

Deno.test({
  name: "a trap inside a lifted lambda names the statement in the lambda",
  ignore: !ENABLED,
  fn: async () => {
    const src = [
      "// depth 3 — the trap is inside a NESTED (lambda-lifted) function.",
      "const xs = [1, 2]",
      "",
      "function outer(): i32 {",
      "  const f = (k: i32) => {",
      "    // line 6",
      "    const y = xs[k]",
      "    y",
      "  }",
      "  f(9)",
      "}",
      "",
      "print(outer())",
      "",
    ].join("\n");
    want(await frames({ "m.vl": src }, "m.vl"), [
      "at 7:11  in `f`",
      "at 10:3  in `outer`",
      "at 13:1  in `__start__`",
    ], "inside a lifted lambda");
  },
});

Deno.test({
  name: "a two-file trap spells each file entry-relative",
  ignore: !ENABLED,
  fn: async () => {
    const lib = [
      "// lib.vl",
      "// line 2",
      "export function boom(n: i32): i32 {",
      "  const xs = [1, 2]",
      "  // line 5",
      "  xs[n]",
      "}",
      "",
    ].join("\n");
    const entry = [
      'import { boom } from "./lib"',
      "",
      "// line 3",
      "print(boom(0))",
      "print(boom(9))",
      "",
    ].join("\n");
    // open-rulings.md §trap-frame-path-spelling: entry-relative, one speller
    // (`srcmapPathOf`) shared with the name section's own `@lib.vl:3` suffix.
    want(await frames({ "lib.vl": lib, "entry.vl": entry }, "entry.vl"), [
      "at lib.vl:6:3  in `boom$m1`",
      "at entry.vl:5:1  in `__start__`",
    ], "two files");
  },
});
