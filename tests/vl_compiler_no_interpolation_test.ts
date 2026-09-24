// `compiler-no-interpolation` and `prefer-interpolation`'s `compiler/` exclusion —
// two halves of one rule, fired on PLANTED sources and only in the right direction.
//
// compiler/*.vl becomes `build/vl-compiler.wasm`, the seed, which must load with no
// host imports; an interpolated string desugars into a call needing
// `std:fmt`/`std:str`, which pulls one in transitively (see CLAUDE.md, "After
// editing compiler/*.vl"). So under `compiler/`: an actual interpolation is a hard
// `compiler-no-interpolation` finding, and a `+` chain of three or more literals
// gets no `prefer-interpolation` suggestion (the fix it would name is impossible
// there). Under any OTHER tree, it is the other way around — a `+` chain is
// suggested and an interpolation is unremarkable — which is the CONTROL: the rule
// is scoped by the path `vl check` was handed, the same mechanism
// `std-comment-audience` uses (`scaIsCompiler`/`scaIsStd`, compiler/lint.vl), and a
// scoping bug would otherwise show up as silence under `compiler/` and noise
// everywhere else rather than as a red here. Both paths are checked RELATIVE to a
// temp root, since the scope is a target rooted at `compiler/` — the shape
// `lint-self.sh`'s `vl check compiler/entry.vl` and `scripts/interp-budget.py`
// produce — not a `/compiler/` anywhere.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_*` suites.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const INTERP = "prefer-interpolation";
const FORBIDDEN = "compiler-no-interpolation";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-compiler-no-interpolation] skipped — missing vl binary or seed wasm.");
}

// Line 2 is real interpolation (`compiler-no-interpolation`'s target); line 6 is a
// four-literal `+` chain (`prefer-interpolation`'s target). Neither rule's own
// exemptions apply: `x` is not annotated as anything but `i32`, and the chain's
// literals are plain strings with no declared `+` operator in scope.
const FIXTURE = `export function needsInterp(x: i32): string {
  "n=\\{x}"
}

export function needsChain(): string {
  "a" + "b" + "c" + "d"
}
`;

/** `code`'s findings on `path` (relative to `cwd`), as `{line, message}`. */
const findings = async (
  cwd: string,
  path: string,
  code: string,
): Promise<{ line: number; message: string }[]> => {
  const { code: rc, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (rc > 1) {
    throw new Error(`vl check ${path} exited ${rc}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as {
    code?: string;
    line: number;
    message: string;
  }[];
  return all.filter((d) => d.code === code).map((d) => ({ line: d.line, message: d.message }));
};

Deno.test({
  name:
    "compiler-no-interpolation / prefer-interpolation: opposite findings under compiler/ and elsewhere",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_compiler_no_interp_" });
    await Deno.mkdir(`${dir}/compiler`);
    await Deno.mkdir(`${dir}/lib`);
    const under = "compiler/dirty.vl";
    const control = "lib/dirty.vl";
    await Deno.writeTextFile(`${dir}/${under}`, FIXTURE);
    await Deno.writeTextFile(`${dir}/${control}`, FIXTURE);

    // Under compiler/: the interpolation is refused, at its own line; the chain
    // gets no interpolation advice at all — the fix it would name does not exist
    // in this tree.
    const forbiddenUnder = await findings(dir, under, FORBIDDEN);
    if (forbiddenUnder.length !== 1 || forbiddenUnder[0].line !== 2) {
      throw new Error(
        `${FORBIDDEN} on ${under}: want one finding at line 2, got ` +
          `${JSON.stringify(forbiddenUnder)}`,
      );
    }
    if (!forbiddenUnder[0].message.includes("import-free")) {
      throw new Error(
        `${FORBIDDEN} message: want it to name the import-free seed, got ` +
          `${JSON.stringify(forbiddenUnder[0].message)}`,
      );
    }
    const interpUnder = await findings(dir, under, INTERP);
    if (interpUnder.length !== 0) {
      throw new Error(
        `${INTERP} fired on ${under}: want none (the fix is impossible under ` +
          `compiler/), got ${JSON.stringify(interpUnder)}`,
      );
    }

    // Outside compiler/: the chain is suggested, at its own line; the interpolation
    // is unremarkable and never refused.
    const interpControl = await findings(dir, control, INTERP);
    if (interpControl.length !== 1 || interpControl[0].line !== 6) {
      throw new Error(
        `${INTERP} on ${control}: want one finding at line 6, got ` +
          `${JSON.stringify(interpControl)}`,
      );
    }
    const forbiddenControl = await findings(dir, control, FORBIDDEN);
    if (forbiddenControl.length !== 0) {
      throw new Error(
        `${FORBIDDEN} fired on ${control}, which is not under compiler/: got ` +
          `${JSON.stringify(forbiddenControl)}`,
      );
    }

    await Deno.remove(dir, { recursive: true });
  },
});

// THE ABSOLUTE-PATH REGRESSION THE REVIEW CAUGHT (round 2): an unrelated project's
// own `src/compiler/x.vl`, checked by its ABSOLUTE path (as an editor extension or a
// hand invocation would), must behave exactly like `control` above — the `+` chain
// suggested, the interpolation unremarkable — never like `under`. A prefix-only
// match on the raw path cannot tell this apart from a real `compiler/…` target; the
// CLI relativizes an absolute target against the VL checkout it resolves `std:`
// from (`lintScopeKeyOf`, driver.vl) and declines scoping when the target sits
// outside it, which `dir` here — an ordinary temp directory, no VL checkout marker
// anywhere up its tree — always does.
Deno.test({
  name: "compiler-no-interpolation / prefer-interpolation: an unrelated project's own compiler/, by ABSOLUTE path, is never scoped",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fake_game_" });
    await Deno.mkdir(`${dir}/src/compiler`, { recursive: true });
    const abs = `${dir}/src/compiler/parse.vl`;
    await Deno.writeTextFile(abs, FIXTURE);

    const forbidden = await findings("/", abs, FORBIDDEN);
    if (forbidden.length !== 0) {
      throw new Error(
        `${FORBIDDEN} fired on an unrelated project's own compiler/ (absolute path): ` +
          `${JSON.stringify(forbidden)}`,
      );
    }
    const interp = await findings("/", abs, INTERP);
    if (interp.length !== 1 || interp[0].line !== 6) {
      throw new Error(
        `${INTERP} on the same file: want one finding at line 6 (unrelated projects ` +
          `are ordinary code), got ${JSON.stringify(interp)}`,
      );
    }

    await Deno.remove(dir, { recursive: true });
  },
});
