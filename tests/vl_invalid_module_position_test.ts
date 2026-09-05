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

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

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
// asserts names its NAME token: `1:10`, ONE literal for all three channels. The host used to
// print `1:9` here — the guest's raw 0-based column — while the CLI pump shifted to 1-based,
// so one diagnostic reached two columns depending on which command found it. `cli-design.md`
// makes the output 1-based ("`col` (1-based, inclusive)"); the host shifts too now.
const WANT_AT = "take.vl:1:10";
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
  env: Record<string, string> = {},
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    // `VL_FAULT_INJECT: ""` is pinned rather than inherited: the host's explicit
    // "no fault", so a stray export in the surrounding shell cannot turn the
    // uninjected runs below into failures that prove the opposite of what they say.
    env: {
      RUST_BACKTRACE: "0",
      NO_COLOR: "1",
      VL_STD: `${ROOT}/std`,
      VL_FAULT_INJECT: "",
      ...env,
    },
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
      assertLocated("check --codegen", WANT_AT, r.code, r.out);
    });
  },
});

Deno.test({
  name: "vl run positions an invalid module at its function",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "take.vl": INVALID }, async (dir) => {
      const r = await run(["run", "take.vl"], dir);
      assertLocated("run", `${WANT_AT}:`, r.code, r.out);
    });
  },
});

Deno.test({
  name: "vl build positions an invalid module at its function",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "take.vl": INVALID }, async (dir) => {
      const r = await run(["build", "take.vl", "-o", "take.wasm"], dir);
      assertLocated("build", `${WANT_AT}:`, r.code, r.out);
    });
  },
});

// --- the bodies with no `FuncDecl` behind them (D1594) ------------------------
//
// D1578 mapped an offset back to the USER FUNCTION owning it. A failure in the
// SYNTHETIC START function — where every program's module-scope code runs — owned no
// span row at all, so it printed the bare offset and nothing else. That is the second
// report from the same consumer (VL-042): `at offset 39223`, no function, no position.
//
// The witness is FAULT-INJECTED rather than a live miscompile, for the reason
// tests/vl_check_codegen_test.ts gives at length: a test that must name a live defect
// gets re-pointed every time one is fixed. `$VL_FAULT_INJECT=corrupt-start-fn-body`
// corrupts the start function's body past its locals vector, so the engine's real
// validator refuses real emitted bytes and only the REASON they are bad is synthetic.
const START_FN_SRC = `function id(n: i32): i32 {
  return n
}
print(id(41) + 1)
`;

// The seam is in `vl build` only, and `vl run` is covered anyway: both render through
// the same `locate_invalid_module`, and the live-witness tests above already drive that
// function on the run channel. One seam is the smaller test-only surface.
Deno.test({
  name: "vl build positions an invalid module inside the module's top-level code",
  ignore: !ENABLED,
  fn: async () => {
    await withDir({ "top.vl": START_FN_SRC }, async (dir) => {
      // THE CONTROL, same source and same flags: without the fault the module is
      // valid and the program runs. Otherwise the injected runs prove nothing.
      const ok = await run(["run", "top.vl"], dir);
      if (ok.code !== 0 || ok.out.trim() !== "42") {
        throw new Error(`the control must run clean, got ${ok.code}: ${JSON.stringify(ok.out)}`);
      }
      {
        const what = "build";
        const r = await run(["build", "top.vl", "-o", "top.wasm"], dir, {
          VL_FAULT_INJECT: "corrupt-start-fn-body",
        });
        if (r.code !== EXIT_COMPILER_BUG) {
          throw new Error(`${what}: want exit ${EXIT_COMPILER_BUG}, got ${r.code}\n${r.out}`);
        }
        if (!r.out.includes("failed to validate inside the module's top-level code")) {
          throw new Error(`${what}: want the top-level code named, got:\n${r.out}`);
        }
        // The module-scope STATEMENT, not the whole body: `print(id(41) + 1)` is on
        // line 4. A message that names the body but points nowhere is the half of this
        // a substring check would miss.
        if (!r.out.includes("top.vl:4:")) {
          throw new Error(`${what}: want the statement's position (line 4), got:\n${r.out}`);
        }
        if (!r.out.includes(BUG_LINE)) {
          throw new Error(`${what}: want the standing "${BUG_LINE}" line, got:\n${r.out}`);
        }
      }
      // AND THE FAULT REACHED THE START FUNCTION, not merely "a body": the other fault
      // over the SAME source names `id`, so the pair discriminates. Without this, a
      // start-fn fault that silently fell back to the first body would still pass.
      const first = await run(["build", "top.vl", "-o", "top.wasm"], dir, {
        VL_FAULT_INJECT: "corrupt-validate-bytes",
      });
      if (!first.out.includes("failed to validate inside `id`")) {
        throw new Error(`the first-body fault must name \`id\`, got:\n${first.out}`);
      }
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
