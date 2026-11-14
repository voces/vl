// THE PHASE-STATE RATCHET, VALIDATED AGAINST A CONTROL IT MUST FIRE ON.
//
// `scripts/phase-state-census.vl -- --check` is silent on a healthy tree, and a silent detector
// proves nothing about itself (CLAUDE.md, "never trust a probe until a control you KNOW should
// trigger it does"). This builds a two-module miniature under `--root`: a checker module whose
// function consumes a global its caller in an emit module sets. It asserts that the census names
// that global under all three metrics, that an empty baseline reds on each, that a written
// baseline passes, and that a second hidden global (a scoped one) reds it again.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed.

import { builtScript } from "./support/builtScript.ts";
import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/phase-state-census.vl`;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-phase-state] skipped — missing vl binary or seed wasm.");
}

const census = async (
  args: string[],
): Promise<{ code: number; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", await builtScript(SCRIPT, { cwd: ROOT }), "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

// `take` consumes `seat` at entry; `give`, in another phase, sets it before the call.
const CHECKER = `export let seat = -1

export function take(): i32 {
  const s = seat
  seat = -1
  s
}
`;
const EMITTER = `import { seat, take } from "./check_seat"

export function give(): i32 {
  seat = 3
  take()
}
`;
// A scoped global: saved, set and restored around a call.
const SCOPED = `let depth = 0

export function walk(n: i32): i32 {
  const was = depth
  depth = n
  const r = depth + 1
  depth = was
  r
}
`;

const want = (cond: boolean, what: string, got: string) => {
  if (!cond) throw new Error(`want ${what}, got:\n${got}`);
};

Deno.test({
  name:
    "phase-state ratchet: fires on a hidden argument, passes on its baseline",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_phase_state_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/scripts`);
      await Deno.writeTextFile(`${dir}/compiler/check_seat.vl`, CHECKER);
      await Deno.writeTextFile(`${dir}/compiler/emit_user.vl`, EMITTER);
      const base = `${dir}/scripts/phase-state-baseline.txt`;

      const list = await census(["--root", dir, "--list"]);
      want(list.code === 0, "--list to exit 0", list.out);
      want(
        list.out.includes(
          "hidden\tcheck_seat.vl:1\tseat\tconsumed in take check_seat.vl:4",
        ),
        "the consumed global named with its consuming function",
        list.out,
      );
      want(
        list.out.includes("cross\tcheck_seat.vl:1\tseat\tw[check,emit]"),
        "the global written by two phases counted as cross-phase",
        list.out,
      );
      want(
        list.out.includes(
          "surface 2 imports of 2 distinct checker symbols",
        ),
        "the emit module's two checker imports",
        list.out,
      );

      // An empty baseline reds every metric the control moves.
      await Deno.writeTextFile(base, "# empty\n");
      const red = await census(["--root", dir, "--check"]);
      want(
        red.code === 1,
        "--check against an empty baseline to exit 1",
        red.out,
      );
      for (
        const row of [
          "hidden rose in compiler/check_seat.vl: 0 -> 1",
          "cross rose in compiler/check_seat.vl: 0 -> 1",
          "surface rose in compiler/emit_user.vl: 0 -> 2",
        ]
      ) {
        want(red.out.includes(row), JSON.stringify(row), red.out);
      }

      // The written baseline passes ...
      const wrote = await census(["--root", dir, "--write-baseline"]);
      want(wrote.code === 0, "--write-baseline to exit 0", wrote.out);
      const ok = await census(["--root", dir, "--check"]);
      want(
        ok.code === 0 && ok.out.includes("phase-state-census: ok"),
        "--check ok",
        ok.out,
      );

      // ... and a scoped global added to another module reds it again.
      await Deno.writeTextFile(`${dir}/compiler/emit_walk.vl`, SCOPED);
      const again = await census(["--root", dir, "--check"]);
      want(
        again.code === 1 &&
          again.out.includes("hidden rose in compiler/emit_walk.vl: 0 -> 1"),
        "a new scoped global to red --check",
        again.out,
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
