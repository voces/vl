// Tests for `vl check --codegen`: the opt-in full-pipeline flag that runs
// binaryen codegen so that codegen-only errors are also reported.
//
// Key invariants:
//   - A file that type-checks clean but crashes codegen (e.g. deep struct
//     recursion that overflows the binaryen stack):
//       `vl check <file>`          exits 0  (codegen-free, misses the error)
//       `vl check --codegen <file>` exits 1  (codegen runs, error surfaced)
//         and stderr contains "Codegen error:"
//   - A normal, fully valid file passes both paths (exit 0 each).
//
// The codegen-erroring fixture is a `Tree` type whose `kids` field holds a MAP
// whose VALUE is a LIST of `Tree` (`{ [string]: Tree[] }`), which causes binaryen
// to exceed its recursion limit during type layout. (Recursion through a struct
// field, an *array* element — `{ [i32]: Tree }` — and a *map value* —
// `{ [string]: Tree }` — are now supported via the WasmGC rec-group; the cycle
// passing through a NESTED collection, a map-of-lists here, remains a distinct
// still-unsupported recursion shape, so it is the stable codegen-error fixture.)
//
// Run with: deno test -A --no-check tests/cli_codegen_test.ts

const assert = (cond: boolean, msg: string): void => {
  if (!cond) throw new Error(msg);
};

// Run `vl check [flags] <file>` against a temp file containing `source`.
// Returns the exit code AND captured stderr (diagnostics go to stderr).
const runCheckCapture = async (
  source: string,
  flags: string[],
): Promise<{ code: number; stderr: string }> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_cg_" });
  const file = `${dir}/probe.vl`;
  await Deno.writeTextFile(file, source);
  try {
    const cmd = new Deno.Command(Deno.execPath(), {
      args: [
        "run",
        "-A",
        "--no-check",
        new URL("../compiler/cli.ts", import.meta.url).pathname,
        "check",
        file,
        ...flags,
      ],
      stdout: "null",
      stderr: "piped",
      env: { ...Deno.env.toObject(), NO_COLOR: "1" },
    });
    const { code, stderr } = await cmd.output();
    return { code, stderr: new TextDecoder().decode(stderr) };
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

// A file that type-checks cleanly but triggers "recursion limit exceeded" in
// binaryen codegen: the `Tree` type recurses through a MAP value that is itself a
// LIST of Tree (kids: `{ [string]: Tree[] }`), so the cycle passes through TWO
// nested collections, which overflows binaryen's stack during type layout. (The
// single-collection forms `{ [i32]: Tree }` and `{ [string]: Tree }` now compile,
// so this nested-collection rep is the stable codegen-error fixture.)
const CODEGEN_ERROR_SRC =
  `type Tree = { value: i32, kids: { [string]: Tree[] } | null }\n` +
  `let t: Tree = { value: 1, kids: null }\n` +
  `print(t.value)\n`;

// A normal, fully valid file — should pass both the fast and full paths.
const CLEAN_SRC = `let x = 1\nprint(x)\n`;

// --- codegen-erroring file ---------------------------------------------------

Deno.test(
  "check (no --codegen): codegen-erroring file exits 0 (fast path misses it)",
  async () => {
    const { code } = await runCheckCapture(CODEGEN_ERROR_SRC, []);
    assert(
      code === 0,
      `expected exit 0 on the fast (codegen-free) path, got ${code}`,
    );
  },
);

Deno.test(
  "check --codegen: codegen-erroring file exits non-zero",
  async () => {
    const { code } = await runCheckCapture(CODEGEN_ERROR_SRC, ["--codegen"]);
    assert(
      code !== 0,
      `expected non-zero exit with --codegen on a codegen-erroring file, got ${code}`,
    );
  },
);

Deno.test(
  "check --codegen: stderr contains 'Codegen error:' for codegen-erroring file",
  async () => {
    const { stderr } = await runCheckCapture(CODEGEN_ERROR_SRC, ["--codegen"]);
    assert(
      stderr.includes("Codegen error:"),
      `expected "Codegen error:" in stderr, got: ${stderr}`,
    );
  },
);

Deno.test(
  "check --codegen: stderr contains 'recursion limit exceeded'",
  async () => {
    const { stderr } = await runCheckCapture(CODEGEN_ERROR_SRC, ["--codegen"]);
    assert(
      stderr.includes("recursion limit exceeded"),
      `expected "recursion limit exceeded" in stderr, got: ${stderr}`,
    );
  },
);

// --- clean file --------------------------------------------------------------

Deno.test(
  "check (no --codegen): clean file exits 0",
  async () => {
    const { code } = await runCheckCapture(CLEAN_SRC, []);
    assert(code === 0, `expected exit 0 for a clean file, got ${code}`);
  },
);

Deno.test(
  "check --codegen: clean file exits 0",
  async () => {
    const { code } = await runCheckCapture(CLEAN_SRC, ["--codegen"]);
    assert(
      code === 0,
      `expected exit 0 with --codegen for a clean file, got ${code}`,
    );
  },
);

// --- flag interaction --------------------------------------------------------

// --codegen and --concise together: the concise one-line format still applies.
Deno.test(
  "check --codegen --concise: codegen error appears in concise format",
  async () => {
    const { code, stderr } = await runCheckCapture(CODEGEN_ERROR_SRC, [
      "--codegen",
      "--concise",
    ]);
    assert(code !== 0, `expected non-zero exit, got ${code}`);
    assert(
      stderr.includes("Codegen error:"),
      `expected "Codegen error:" in concise output, got: ${stderr}`,
    );
  },
);
