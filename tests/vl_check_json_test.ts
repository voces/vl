// NATIVE `vl check --json` — machine-readable diagnostics as one JSON array on
// stdout (docs/internals/cli-design.md), rendered by VL policy (compiler/cli.vl)
// over the command-queue pump. Exit codes and `--severity` gating match the
// pretty renderer; stdout is pure JSON (no ANSI, no summary line).
//
// GATING: same as tests/vl_check_args_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-json] skipped — missing vl binary or seed wasm.");
}

type Diag = {
  file: string;
  severity: string;
  code?: string;
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
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

// stdout must be exactly one JSON array line — parse or throw.
const parseDiags = (out: string): Diag[] => {
  const trimmed = out.trim();
  if (trimmed.includes("\x1b")) {
    throw new Error(`--json stdout contains ANSI escapes: ${trimmed}`);
  }
  const parsed = JSON.parse(trimmed);
  if (!Array.isArray(parsed)) {
    throw new Error(`--json stdout is not a JSON array: ${trimmed}`);
  }
  return parsed as Diag[];
};

const withDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_json_" });
  try {
    await fn(dir);
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

Deno.test({
  name: "check --json: a clean file emits [] on stdout, exit 0, empty stderr",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/clean.vl`;
      await Deno.writeTextFile(file, "print(1)\n");
      const { code, out, err } = await run(["check", file, "--json"]);
      if (code !== 0) throw new Error(`expected exit 0, got ${code}: ${err}`);
      const diags = parseDiags(out);
      if (diags.length !== 0) {
        throw new Error(`expected no diagnostics, got: ${out}`);
      }
      if (err.trim() !== "") {
        throw new Error(`expected empty stderr in --json mode, got: ${err}`);
      }
    });
  },
});

Deno.test({
  name: "check --json: a type error is a positioned error object, exit 1",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/err.vl`;
      await Deno.writeTextFile(file, 'const x: i32 = "s"\nprint(x)\n');
      const { code, out, err } = await run(["check", file, "--json"]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${err}`);
      const diags = parseDiags(out);
      const d = diags.find((x) => x.severity === "error");
      if (!d) throw new Error(`expected an error diagnostic, got: ${out}`);
      if (d.file !== file) {
        throw new Error(`expected file ${file}, got ${d.file}`);
      }
      if (d.line !== 1 || typeof d.col !== "number" || d.col < 1) {
        throw new Error(`expected 1-based position on line 1, got: ${out}`);
      }
      if (typeof d.endCol !== "number" || d.endCol <= d.col) {
        throw new Error(`expected exclusive endCol > col, got: ${out}`);
      }
      if ("code" in d) {
        throw new Error(`a compile error must carry no code field: ${out}`);
      }
      if (!d.message.includes("i32")) {
        throw new Error(`unexpected message: ${d.message}`);
      }
      if (err.trim() !== "") {
        throw new Error(`expected empty stderr (no summary), got: ${err}`);
      }
    });
  },
});

Deno.test({
  name:
    "check --json: lint carries its stable code; --severity is both floor and gate",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/lint.vl`;
      await Deno.writeTextFile(file, "let x = 1\nprint(x)\n");
      // Default severity (error): the info-tier lint displays, does not gate.
      const dflt = await run(["check", file, "--json"]);
      if (dflt.code !== 0) {
        throw new Error(`expected exit 0, got ${dflt.code}: ${dflt.err}`);
      }
      const diags = parseDiags(dflt.out);
      const d = diags.find((x) => x.code === "prefer-const");
      if (!d) throw new Error(`expected a prefer-const finding, got: ${dflt.out}`);
      if (d.severity !== "info") {
        throw new Error(`expected info severity, got: ${d.severity}`);
      }
      // Floor above the finding's tier: filtered from the output, exit stays 0.
      const warn = await run(["check", file, "--json", "--severity", "warning"]);
      if (warn.code !== 0 || parseDiags(warn.out).length !== 0) {
        throw new Error(
          `expected [] and exit 0 at --severity warning, got ${warn.code}: ${warn.out}`,
        );
      }
      // Floor at the finding's tier: displayed AND gating (exit 1).
      const info = await run(["check", file, "--json", "--severity", "info"]);
      if (info.code !== 1 || parseDiags(info.out).length !== 1) {
        throw new Error(
          `expected 1 diagnostic and exit 1 at --severity info, got ${info.code}: ${info.out}`,
        );
      }
    });
  },
});

Deno.test({
  name: "check --json: a directory run aggregates per-file diagnostics",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      await Deno.writeTextFile(`${dir}/a.vl`, 'const x: i32 = "s"\nprint(x)\n');
      await Deno.writeTextFile(`${dir}/b.vl`, "let y = 2\nprint(y)\n");
      const { code, out } = await run([
        "check",
        dir,
        "--json",
        "--severity",
        "hint",
      ]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${out}`);
      const diags = parseDiags(out);
      const files = new Set(diags.map((d) => d.file.split("/").pop()));
      if (!files.has("a.vl") || !files.has("b.vl")) {
        throw new Error(`expected findings in both files, got: ${out}`);
      }
    });
  },
});

Deno.test({
  name: "check --json: message escaping survives JSON.parse round-trip",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/imp.vl`;
      // The resolution error quotes the specifier with double quotes.
      await Deno.writeTextFile(file, 'import { a } from "./nope"\nprint(1)\n');
      const { code, out } = await run(["check", file, "--json"]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${out}`);
      const diags = parseDiags(out);
      if (!diags.some((d) => d.message.includes('"./nope"'))) {
        throw new Error(`expected the quoted specifier in a message: ${out}`);
      }
    });
  },
});

// The SPAN half of the schema: `endCol` is exclusive, so `endCol - col` is the
// caret width. A TOKENLESS diagnostic — a lex error, a module-resolution error —
// has no token anchor for `diagEndCol` to derive a width from, so every one of
// them rendered as a single-column caret however much source it was about. The
// cases below carry their own end, and are why the side table grew a column.
Deno.test({
  name: "check --json: a char-literal length error spans the whole literal",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      // source, message fragment, 1-based col, 1-based EXCLUSIVE endCol
      const cases: [string, string, number, number][] = [
        ["let c = 'xy'\n", "exactly one character", 9, 13],
        ["let c = ''\n", "Empty char literal", 9, 11],
        // Unterminated: the opening quote through the end of the line.
        ["let c = 'ab\n", "Unterminated char literal", 9, 12],
      ];
      for (const [src, frag, col, endCol] of cases) {
        const file = `${dir}/lex.vl`;
        await Deno.writeTextFile(file, src);
        const { out } = await run(["check", file, "--json"]);
        const d = parseDiags(out).find((x) => x.message.includes(frag));
        if (!d) throw new Error(`no diagnostic matching "${frag}": ${out}`);
        if (d.line !== 1 || d.col !== col || d.endCol !== endCol) {
          throw new Error(
            `expected [1:${col}, ${endCol}) for "${frag}", got ` +
              `[${d.line}:${d.col}, ${d.endCol}): ${out}`,
          );
        }
      }
    });
  },
});

Deno.test({
  name:
    "check --json: a char-quoted import specifier spans it and steals nothing",
  ignore: !ENABLED,
  fn: async () => {
    await withDir(async (dir) => {
      const file = `${dir}/imp.vl`;
      // The bait on line 2 is what the unbounded specifier walk used to adopt as
      // this import's specifier — it must appear in no message.
      await Deno.writeTextFile(
        file,
        'import { readTextFile } from \'std:fs\'\nprint("the story")\n',
      );
      const { code, out } = await run(["check", file, "--json"]);
      if (code !== 1) throw new Error(`expected exit 1, got ${code}: ${out}`);
      const diags = parseDiags(out).filter((d) => d.severity === "error");
      if (diags.length !== 1) {
        throw new Error(`expected exactly one error, got: ${out}`);
      }
      const d = diags[0];
      if (!d.message.includes('write "std:fs"')) {
        throw new Error(`expected the re-quote suggestion, got: ${out}`);
      }
      if (d.message.includes("the story")) {
        throw new Error(`the import stole a later string literal: ${out}`);
      }
      // `'std:fs'` sits at 1-based col 30 and is 8 characters wide.
      if (d.line !== 1 || d.col !== 30 || d.endCol !== 38) {
        throw new Error(
          `expected [1:30, 38), got [${d.line}:${d.col}, ${d.endCol}): ${out}`,
        );
      }
    });
  },
});
