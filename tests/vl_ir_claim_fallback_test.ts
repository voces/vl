// AN IR CLAIM THAT WRITES AN INVALID MODULE FALLS BACK TO LEGACY'S EMITTER (coordinator ruling,
// 2026-11-24). A claimed unit never runs legacy's lowering, so a refusal legacy raises there never
// fired, and the claim's module could fail validation instead. The host now rebuilds such a unit
// with claims off:
//
//   legacy refuses        — legacy's refusal, rc 1, with a note naming the claim (both modes);
//   legacy builds, normal — legacy's bytes, and one stderr line naming the function;
//   legacy builds, strict — `$VL_IR_STRICT=1`, as gates and CI run: the invalid module, rc 70.
//
// `tests/ir-claim-fallback/*-refused.vl` are programs a claim escapes legacy's refusal on. The two
// graded here stay refused after #9839; D17095's and D17096's witnesses beside them are graded by
// `ir-parity.vl --pop refusals` instead, since a legacy rung lifts them. `claimed-and-valid.vl`
// with `$VL_FAULT_INJECT_CLAIMED` (the claimed module corrupted, the rebuild not) is the control
// for the two outcomes legacy builds. No assertion library, per CLAUDE.md.
//
// Run with:  SELFHOST_NATIVE_ALIGN=1 deno test -A tests/vl_ir_claim_fallback_test.ts

import { COMPILER, exists, ROOT, VL } from "./support/tree.ts";

const ignore = !exists(VL) || !exists(COMPILER);
if (ignore) console.warn("[ir-claim-fallback] skipped — needs the vl binary and build/vl-compiler.wasm");

const DIR = `${ROOT}/tests/ir-claim-fallback`;
const STABLE = ["closure-stored-from-function-refused.vl", "other-bundle-stored-from-function-refused.vl"];
const REFUSAL = "emitProgram: a function returning a parameter called at two signatures";
const NOTE = "an IR claim wrote an invalid module";
const FELL_BACK = "IR claim produced an invalid module; used the legacy emitter";

/** `vl <cmd> <file>` against the seed, uncached, with `env` added; its exit code and streams. */
const vl = (cmd: string[], env: Record<string, string> = {}) => {
  const out = new Deno.Command(VL, {
    args: [...cmd, "--compiler", COMPILER],
    cwd: ROOT,
    env: { VL_STD: `${ROOT}/std`, VL_NO_CACHE: "1", RUST_BACKTRACE: "0", ...env },
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  const dec = new TextDecoder();
  return { code: out.code, out: dec.decode(out.stdout), err: dec.decode(out.stderr) };
};

for (const strict of [false, true]) {
  for (const f of STABLE) {
    Deno.test({
      name: `ir claim fallback: ${f} is legacy's refusal, rc 1${strict ? " (strict)" : ""}`,
      ignore,
      fn: () => {
        const r = vl(["run", `${DIR}/${f}`], strict ? { VL_IR_STRICT: "1" } : {});
        if (r.code !== 1 || !r.err.includes(REFUSAL) || !r.err.includes(NOTE) || r.err.includes("invalid module\n")) {
          throw new Error(`want rc 1 with legacy's refusal and the claim's note, got rc ${r.code}:\n${r.err.slice(0, 1500)}`);
        }
      },
    });
  }
}

const VALID = `${DIR}/claimed-and-valid.vl`;
const FAULT = { VL_FAULT_INJECT_CLAIMED: "corrupt-validate-bytes" };

Deno.test({
  name: "ir claim fallback: an invalid claimed module legacy builds ships legacy's bytes, naming the function",
  ignore,
  fn: () => {
    const r = vl(["run", VALID], FAULT);
    if (r.code !== 0 || r.out.trim() !== "3" || !r.err.includes(FELL_BACK)) {
      throw new Error(`want rc 0 printing 3 and the fallback line, got rc ${r.code}, stdout ${JSON.stringify(r.out)}:\n${r.err}`);
    }
    const tmp = Deno.makeTempDirSync();
    try {
      const b = vl(["build", VALID, "-o", `${tmp}/x.wasm`], FAULT);
      if (b.code !== 0 || !b.err.includes(FELL_BACK)) throw new Error(`want vl build rc 0 with the fallback line, got rc ${b.code}:\n${b.err}`);
    } finally {
      Deno.removeSync(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "ir claim fallback: under VL_IR_STRICT=1 an invalid claimed module is rc 70, even where legacy builds it",
  ignore,
  fn: () => {
    const r = vl(["run", VALID], { ...FAULT, VL_IR_STRICT: "1" });
    if (r.code !== 70 || !r.err.includes("invalid module") || !r.err.includes("VL_IR_STRICT=1") || r.out.trim() !== "") {
      throw new Error(`want rc 70 naming VL_IR_STRICT=1 and no output, got rc ${r.code}, stdout ${JSON.stringify(r.out)}:\n${r.err}`);
    }
  },
});

Deno.test({
  name: "ir claim fallback: a valid claimed module takes no fallback",
  ignore,
  fn: () => {
    const r = vl(["run", VALID]);
    if (r.code !== 0 || r.out.trim() !== "3" || r.err.includes("legacy emitter") || r.err.includes(NOTE)) {
      throw new Error(`want rc 0 printing 3 and no fallback, got rc ${r.code}:\n${r.err}`);
    }
  },
});
