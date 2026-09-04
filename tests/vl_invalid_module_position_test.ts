// NATIVE — a module the ENGINE refuses must name the FUNCTION it came from and the
// `file:line:col` of that function's declaration, on all three channels, and exit 70
// (D1578; reported by the glean session as VL-035).
//
// The failure it replaces reported a byte offset into a module the author never sees —
// `Invalid input WebAssembly code at offset 188: type mismatch` and nothing else — which
// cost the first external VL consumer an hour of bisecting a 480-line file. The emit
// channel got positions in D1519; the VALIDATE channel had none.
//
// THE PIN IS BOTH DIRECTIONS. A test that only proves the banner fires would pass a host
// that printed it for every program, so the controls below assert that a VALID module is
// unchanged: rc 0, no banner, and the program's own output.
//
// THE WITNESS MUST STILL BE INVALID. This is D1471's filed witness — an un-annotated param
// giving an empty-collection hole nothing to pin from — and it is check-clean invalid wasm
// on the current seed. When D1471 is fixed this suite goes RED at the "still invalid"
// assertion rather than silently measuring nothing; the replacement is any other
// check-clean invalid-wasm program (`scripts/goal-scoreboard.py` names the population).
//
// GATING: `SELFHOST_NATIVE_ALIGN=1` plus the built binary and seed, as vl_check_dir_test.ts.

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
  console.warn("[vl-invalid-module-position] skipped — missing vl binary or seed wasm.");
}

/** The exit code a compiler bug uses (sysexits EX_SOFTWARE) — #2483's, reused here. */
const EXIT_COMPILER_BUG = 70;
const BUG_LINE = "this is a bug in vl, not in your program";

// D1471's witness, verbatim from docs/internals/inventory/D1471.md: `vl check` rc 0, and
// the engine refuses the module. `take` is declared on line 1, so the position this suite
// asserts names its NAME token — `1:10` from the CLI renderer (1-based columns, which is
// what `vl check` has always printed) and `1:9` from the host's own error printer (raw
// 0-based, what `render_diags` prints for an emit refusal). The two conventions predate
// this row; the assertion carries each channel's own rather than papering over them.
const INVALID = `function take(a) {
  const v = a
  v[0] = 1.25
  print(v[0] + 0.25)
}
take(__array_new_default__(3))
`;

const VALID = `print(6 * 7)\n`;

const run = async (
  args: string[],
  cwd: string,
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
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

const withDir = async (
  files: Record<string, string>,
  body: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = Deno.makeTempDirSync({ prefix: "vl-invalid-module-" });
  try {
    for (const [name, src] of Object.entries(files)) {
      Deno.writeTextFileSync(`${dir}/${name}`, src);
    }
    await body(dir);
  } finally {
    Deno.removeSync(dir, { recursive: true });
  }
};

/** Every assertion this suite makes about a located invalid-module report. */
const assertLocated = (what: string, want: string, code: number, out: string) => {
  if (code !== EXIT_COMPILER_BUG) {
    throw new Error(
      `${what}: want exit ${EXIT_COMPILER_BUG} (a vl bug), got ${code}\n${out}`,
    );
  }
  if (!out.includes(want)) {
    throw new Error(`${what}: want the declaration position \`${want}\`, got:\n${out}`);
  }
  if (!out.includes("failed to validate inside `take`")) {
    throw new Error(`${what}: want the owning function named \`take\`, got:\n${out}`);
  }
  if (!out.includes(BUG_LINE)) {
    throw new Error(`${what}: want the standing "${BUG_LINE}" line, got:\n${out}`);
  }
};

Deno.test({
  name: "vl check --codegen positions an invalid module at its function",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "take.vl": INVALID }, async (dir) => {
      // The premise: `vl check` (no --codegen) still passes, so this really is the
      // check-clean half of a clause-1 miscompile and not a type error.
      const chk = await run(["check", "take.vl"], dir);
      if (chk.code !== 0) {
        throw new Error(
          `the witness no longer check-cleans (D1471 fixed?) — replace it: ${chk.out}`,
        );
      }
      const r = await run(["check", "--codegen", "take.vl"], dir);
      assertLocated("check --codegen", "take.vl:1:10", r.code, r.out);
    });
  },
});

Deno.test({
  name: "vl run positions an invalid module at its function",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "take.vl": INVALID }, async (dir) => {
      const r = await run(["run", "take.vl"], dir);
      assertLocated("run", "take.vl:1:9:", r.code, r.out);
    });
  },
});

Deno.test({
  name: "vl build positions an invalid module at its function",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "take.vl": INVALID }, async (dir) => {
      const r = await run(["build", "take.vl", "-o", "take.wasm"], dir);
      assertLocated("build", "take.vl:1:9:", r.code, r.out);
    });
  },
});

Deno.test({
  name: "a valid module is unchanged on every channel",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "ok.vl": VALID }, async (dir) => {
      for (const args of [
        ["run", "ok.vl"],
        ["build", "ok.vl", "-o", "ok.wasm"],
        ["check", "--codegen", "ok.vl"],
      ]) {
        const r = await run(args, dir);
        if (r.code !== 0) {
          throw new Error(`${args.join(" ")}: want exit 0, got ${r.code}\n${r.out}`);
        }
        if (r.out.includes(BUG_LINE) || r.out.includes("failed to validate")) {
          throw new Error(`${args.join(" ")}: a valid module drew the bug banner:\n${r.out}`);
        }
      }
      // …and the program still prints what it prints.
      const r = await run(["run", "ok.vl"], dir);
      if (r.out.trim() !== "42") {
        throw new Error(`vl run ok.vl: want \`42\`, got ${JSON.stringify(r.out)}`);
      }
    });
  },
});
