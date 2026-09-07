// THE TRAP FRAME NAMES THE LINE THE INSTRUCTION CAME FROM — IN BOTH HOSTS (ROADMAP row 22).
//
// A trap frame is an offset plus a name-section string — `0x118 - vl!boom@3` — and a
// name-section string can only be per FUNCTION, so the `@3` is where `boom` was DECLARED.
// The emitter's `vl-src` custom section carries one row per body and per statement over the
// same module bytes, and a host joins the frame's byte offset against it.
//
// ONE EXPECTED BLOCK GRADES BOTH HOSTS, which is the point of this file's shape. The native
// host reads the section in Rust and the Deno host in TypeScript, and two readers of one
// format drift silently — so every case asserts the SAME array against both. That is sound
// because the join key is the same number in each engine: wasmtime's
// `FrameInfo::module_offset()` and V8's `wasm-function[N]:0xNNN` print the same offsets for
// the same trap, measured on these very controls.
//
// The assertions are the LINES, at three depths and across two files, because that is the
// whole claim. Each control's trapping statement is on a line that differs from its
// declaration's, so a regression to the old behaviour cannot pass: `boom` is declared on 3
// and traps on 7, the lambda is anchored at 9 and traps on 7, `outer` is declared on 4 and
// traps on 10.
//
// @test-timing instrument

import { COMPILER, STD, VL, exists } from "./support/tree.ts";
import { VLRuntimeError, runWasm } from "./support/runWasm.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) {
  console.warn("[vl-trap-source-frames] skipped — missing vl binary or seed wasm.");
}

/** Write `files` into a fresh directory and hand back its path. */
const materialise = async (files: Record<string, string>): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-trap-frames-" });
  for (const [name, body] of Object.entries(files)) {
    await Deno.writeTextFile(`${dir}/${name}`, body);
  }
  return dir;
};

/** The `at …` lines the NATIVE host prints under a trap, in order. */
const nativeFrames = async (dir: string, entry: string): Promise<string[]> => {
  const p = new Deno.Command(VL, {
    args: ["run", `${dir}/${entry}`, "--compiler", COMPILER],
    env: { VL_STD: STD },
    stdout: "piped",
    stderr: "piped",
  });
  const out = await p.output();
  const text = new TextDecoder().decode(out.stderr);
  if (out.code === 0) throw new Error(`native: want a trap, got exit 0\n${text}`);
  return text.split("\n").filter((l) => l.startsWith("    at ")).map((l) => l.trim());
};

/** The same lines the DENO host attaches to its `VLRuntimeError`.
 *
 * The module is built by the native `vl build --names` — this grades the READER, not a
 * second compile path, and `--names` is what the section rides. `vl run` enables names for
 * itself, which is why the native arm above needs no flag. */
const denoFrames = async (dir: string, entry: string): Promise<string[]> => {
  const out = `${dir}/__m.wasm`;
  const p = new Deno.Command(VL, {
    args: ["build", `${dir}/${entry}`, "--compiler", COMPILER, "-o", out, "--names"],
    env: { VL_STD: STD },
    stdout: "piped",
    stderr: "piped",
  });
  const built = await p.output();
  if (built.code !== 0) {
    throw new Error(`deno: build failed\n${new TextDecoder().decode(built.stderr)}`);
  }
  const bytes = await Deno.readFile(out);
  try {
    await runWasm(bytes);
  } catch (e) {
    if (e instanceof VLRuntimeError) return [...e.sourceFrames];
    throw e;
  }
  throw new Error("deno: want a trap, got a clean run");
};

/** Grade BOTH hosts against one expected block. */
const bothHosts = async (
  files: Record<string, string>,
  entry: string,
  expect: string[],
  what: string,
) => {
  const dir = await materialise(files);
  try {
    const native = await nativeFrames(dir, entry);
    const deno = await denoFrames(dir, entry);
    const e = JSON.stringify(expect);
    if (JSON.stringify(native) !== e) {
      throw new Error(`${what} (native)\n  want ${e}\n  got  ${JSON.stringify(native)}`);
    }
    if (JSON.stringify(deno) !== e) {
      throw new Error(`${what} (deno)\n  want ${e}\n  got  ${JSON.stringify(deno)}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "a module-scope trap names its own line, in both hosts",
  ignore: !ENABLED,
  fn: () =>
    bothHosts({
      "m.vl": [
        "// depth 1 — the trap is at MODULE SCOPE.",
        "// line 2",
        "const xs = [1, 2]",
        "// line 4",
        "print(xs[9])",
        "",
      ].join("\n"),
    }, "m.vl", ["at 5:1  in `__start__`"], "module scope"),
});

Deno.test({
  name: "a trap inside a function names the statement, not the declaration, in both hosts",
  ignore: !ENABLED,
  fn: () =>
    // `boom` is DECLARED on line 3 — the name section's own suffix says `@3`.
    bothHosts({
      "m.vl": [
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
      ].join("\n"),
    }, "m.vl", [
      "at 7:3  in `boom`",
      "at 11:1  in `__start__`",
    ], "inside a function"),
});

Deno.test({
  name: "a trap inside a lifted lambda names the statement in the lambda, in both hosts",
  ignore: !ENABLED,
  fn: () =>
    bothHosts({
      "m.vl": [
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
      ].join("\n"),
    }, "m.vl", [
      "at 7:11  in `f`",
      "at 10:3  in `outer`",
      "at 13:1  in `__start__`",
    ], "inside a lifted lambda"),
});

Deno.test({
  name: "a two-file trap spells each file entry-relative, in both hosts",
  ignore: !ENABLED,
  fn: () =>
    // open-rulings.md §trap-frame-path-spelling: entry-relative, one speller
    // (`srcmapPathOf`) shared with the name section's own `@lib.vl:3` suffix.
    bothHosts({
      "lib.vl": [
        "// lib.vl",
        "// line 2",
        "export function boom(n: i32): i32 {",
        "  const xs = [1, 2]",
        "  // line 5",
        "  xs[n]",
        "}",
        "",
      ].join("\n"),
      "entry.vl": [
        'import { boom } from "./lib"',
        "",
        "// line 3",
        "print(boom(0))",
        "print(boom(9))",
        "",
      ].join("\n"),
    }, "entry.vl", [
      "at lib.vl:6:3  in `boom$m1`",
      "at entry.vl:5:1  in `__start__`",
    ], "two files"),
});

Deno.test({
  name: "a module with no `vl-src` section resolves no frames, and says so by being empty",
  ignore: !ENABLED,
  fn: async () => {
    // The control that proves the reader is reading the SECTION and not inventing lines: the
    // same program built WITHOUT `--names` carries none, and the block is empty rather than
    // wrong. Without this a reader that always answered would grade identically above.
    const dir = await materialise({
      "m.vl": ["const xs = [1, 2]", "print(xs[9])", ""].join("\n"),
    });
    try {
      const out = `${dir}/__m.wasm`;
      const p = new Deno.Command(VL, {
        args: ["build", `${dir}/m.vl`, "--compiler", COMPILER, "-o", out],
        env: { VL_STD: STD },
        stdout: "piped",
        stderr: "piped",
      });
      const built = await p.output();
      if (built.code !== 0) throw new Error("build failed");
      const bytes = await Deno.readFile(out);
      try {
        await runWasm(bytes);
      } catch (e) {
        if (!(e instanceof VLRuntimeError)) throw e;
        if (e.sourceFrames.length !== 0) {
          throw new Error(
            `want no frames without the section, got ${JSON.stringify(e.sourceFrames)}`,
          );
        }
        return;
      }
      throw new Error("want a trap, got a clean run");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
