// AN IR CLAIM THAT WRITES AN INVALID MODULE FALLS BACK TO LEGACY'S EMITTER (coordinator ruling,
// 2026-11-24). A claimed unit never runs legacy's lowering, so a refusal legacy raises there never
// fired, and the claim's module could fail validation instead. The host now rebuilds such a unit
// with claims off:
//
//   legacy refuses        — legacy's refusal, rc 1, with a note naming the claim (both modes);
//   legacy builds, normal — legacy's bytes, and one stderr line naming the function;
//   legacy builds, strict — `$VL_IR_STRICT=1`, as gates and CI run: the invalid module, rc 70.
//
// `tests/ir-claim-fallback/*-refused.vl` are programs a claim once escaped legacy's refusal on. The
// two graded here stay refused after #9839, and the IR now declines them (`bundlePickRefused`), so
// the note names the decline; D17095's and D17096's witnesses
// beside them are graded by `ir-parity.vl --pop refusals` instead, since a legacy rung lifts them. `claimed-and-valid.vl`
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
const NOTE = "the IR declined this statement (bundle result pick refused)";
const FELL_BACK = "IR claim produced an invalid module; used the legacy emitter";

/** `vl <cmd> <file>` against the seed, uncached, with `env` added; its exit code and streams. */
const vl = (cmd: string[], env: Record<string, string> = {}) => {
  const out = new Deno.Command(VL, {
    args: [...cmd, "--compiler", COMPILER],
    cwd: ROOT,
    // Non-strict unless a case asks: gate.sh and CI export VL_IR_STRICT=1, and the child inherits it.
    env: { VL_STD: `${ROOT}/std`, VL_NO_CACHE: "1", RUST_BACKTRACE: "0", VL_IR_STRICT: "0", ...env },
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
          throw new Error(`want rc 1 with legacy's refusal and the decline's note, got rc ${r.code}:\n${r.err.slice(0, 1500)}`);
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

// A CLAIM THAT MEETS A SHARED LEGACY HELPER'S REFUSAL DECLINES (D17123; coordinator ruling (a)): the
// guest records the refusal instead of latching it, legacy writes the unit, and the host reports
// it as the same G3 event. `$VL_TEST_CLAIM_REFUSAL` (1 before the body, 2 after) makes every claimed
// function or start refuse, the control for the case legacy builds.
const SOFT_NOTE = "an IR claim refused inside `";
const SOFT_FELL = "IR claim refused; used the legacy emitter";
const UNION_ROWS = "emitProgram: a union's arm rows were asked of a type no row holds";

for (const strict of [false, true]) {
  Deno.test({
    name: `ir claim fallback: D17123's claim declines on a helper's refusal; legacy's refusal stands${strict ? " (strict)" : ""}`,
    ignore,
    fn: () => {
      const r = vl(["run", `${DIR}/claim-helper-refusal-legacy-refused.vl`], strict ? { VL_IR_STRICT: "1" } : {});
      const note = `${SOFT_NOTE}take\` (emitProgram: scalar map read has no value-box type); legacy's emitter refuses the program`;
      if (r.code !== 1 || !r.err.includes(UNION_ROWS) || !r.err.includes(note)) {
        throw new Error(`want rc 1 with legacy's refusal and the note on \`take\`, got rc ${r.code}:\n${r.err.slice(0, 1500)}`);
      }
    },
  });
}

for (const k of ["1", "2"]) {
  Deno.test({
    name: `ir claim fallback: a claim refusing ${k === "1" ? "before" : "after"} its body falls back; strict is rc 70`,
    ignore,
    fn: () => {
      const r = vl(["run", VALID], { VL_TEST_CLAIM_REFUSAL: k });
      if (r.code !== 0 || r.out.trim() !== "3" || !r.err.includes(SOFT_FELL) || !r.err.includes("test claim refusal")) {
        throw new Error(`want rc 0 printing 3 and the fallback line, got rc ${r.code}, stdout ${JSON.stringify(r.out)}:\n${r.err}`);
      }
      const s = vl(["run", VALID], { VL_TEST_CLAIM_REFUSAL: k, VL_IR_STRICT: "1" });
      if (s.code !== 70 || !s.err.includes("VL_IR_STRICT=1") || s.out.trim() !== "") {
        throw new Error(`want rc 70 under VL_IR_STRICT=1, got rc ${s.code}:\n${s.err}`);
      }
    },
  });
}

// Whatever a claim wrote before it refused is undone: with every claim refusing, the module is
// legacy's byte for byte (the armed shadow writes legacy's bytes for every unit).
const ROLLBACK = [VALID, `${ROOT}/tests/cases/closures/hole-fn-choice-to-generic-hof-at-two-types.vl`];
for (const k of ["1", "2"]) {
  Deno.test({
    name: `ir claim fallback: a claim refusing ${k === "1" ? "before" : "after"} its body leaves legacy's bytes`,
    ignore,
    fn: () => {
      const tmp = Deno.makeTempDirSync();
      try {
        for (const p of ROLLBACK) {
          const a = vl(["build", p, "-o", `${tmp}/soft.wasm`], { VL_TEST_CLAIM_REFUSAL: k });
          const b = vl(["build", p, "-o", `${tmp}/legacy.wasm`], { VL_IR_SHADOW: "1" });
          if (a.code !== 0 || b.code !== 0) throw new Error(`${p}: want both builds rc 0, got ${a.code} and ${b.code}:\n${a.err}\n${b.err}`);
          const x = Deno.readFileSync(`${tmp}/soft.wasm`), y = Deno.readFileSync(`${tmp}/legacy.wasm`);
          if (x.length !== y.length || x.some((v, i) => v !== y[i])) {
            throw new Error(`${p}: want legacy's bytes after every claim refused, got ${x.length} vs ${y.length} bytes that differ`);
          }
        }
      } finally {
        Deno.removeSync(tmp, { recursive: true });
      }
    },
  });
}

Deno.test({
  name: "ir claim fallback: after an earlier claim falls back, the refusal reported is the later unit's, legacy's",
  ignore,
  fn: () => {
    const r = vl(["run", `${DIR}/claim-refusal-then-legacy-refusal.vl`], { VL_TEST_CLAIM_REFUSAL: "1" });
    // The diagnostic line the build reports, `<file>:<line>:<col>: emitProgram: …`, is `take`'s (line 8).
    const reported = r.err.split("\n").find((l) => /:\d+:\d+: emitProgram: /.test(l)) ?? "";
    if (r.code !== 1 || !reported.includes(`:8:10: ${UNION_ROWS}`)) {
      throw new Error(`want rc 1 reporting \`take\`'s legacy refusal at 8:10, got rc ${r.code}, "${reported}":\n${r.err.slice(0, 1500)}`);
    }
  },
});

Deno.test({
  name: "ir claim fallback: a refusal legacy raises outside any claim stays hard, with no note",
  ignore,
  fn: () => {
    const r = vl(["run", `${ROOT}/tests/cases/types/error-record-join-lambda-to-generic.vl`]);
    if (r.code !== 1 || !r.err.includes("emitProgram:") || r.err.includes(SOFT_NOTE) || r.err.includes("IR claim")) {
      throw new Error(`want rc 1 with legacy's refusal and no claim note, got rc ${r.code}:\n${r.err.slice(0, 1500)}`);
    }
  },
});

// The compile cache keys on `$VL_TEST_CLAIM_REFUSAL` (every non-inert `VL_*` is keyed): a repeat of
// a plain build is a hit, and the hooked build of the same source misses and prints its fallback.
Deno.test({
  name: "ir claim fallback: the compile cache does not reuse a build made without the claim-refusal hook",
  ignore,
  fn: () => {
    const tmp = Deno.makeTempDirSync();
    try {
      const cached = { VL_NO_CACHE: "", VL_CACHE_DIR: `${tmp}/cache`, VL_COMPILE_CACHE: "1", VL_COMPILE_CACHE_TRACE: "1" };
      const traced = (err: string) => err.split("\n").filter((l) => l.startsWith("vl: compile cache ")).join(" | ");
      for (const want of ["miss", "hit"]) {
        const r = vl(["build", VALID, "-o", `${tmp}/plain.wasm`], cached);
        if (r.code !== 0 || r.err.includes(SOFT_FELL) || !traced(r.err).includes(want)) {
          throw new Error(`want a plain build rc 0, cache ${want}, no fallback; got rc ${r.code}, "${traced(r.err)}":\n${r.err}`);
        }
      }
      const h = vl(["build", VALID, "-o", `${tmp}/hook.wasm`], { ...cached, VL_TEST_CLAIM_REFUSAL: "1" });
      if (h.code !== 0 || !h.err.includes(SOFT_FELL) || !traced(h.err).includes("miss") || traced(h.err).includes("hit")) {
        throw new Error(`want the hooked build a cache miss printing the fallback line, got rc ${h.code}, "${traced(h.err)}":\n${h.err}`);
      }
    } finally {
      Deno.removeSync(tmp, { recursive: true });
    }
  },
});
