// The release suite's STANDALONE rows: the binaryen feature-enable lists, `-O3`
// outranking `-O`, and the two no-wasm-opt arms. The table-driven rows moved to
// `selfhost_native_release_{shape,melt,loops}_test.ts` so `deno test --parallel`
// can spread them; the machinery is in the shared support module.
//
// @test-timing opt
import {
  COMPILER,
  ENABLED,
  MELT,
  ROOT,
  VL,
  WASM_DIS,
  WASM_OPT,
  buildAndCount,
  exists,
  nativeEnv,
  rustList,
  vl,
} from "./support/nativeRelease.ts";

Deno.test({
  name: "native-release: the feature enables accept a return_call module at BOTH rungs",
  ignore: !ENABLED,
  fn: async () => {
    const mainRs = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
    const features = rustList(mainRs, "BINARYEN_FEATURES");
    if (!features.includes("--enable-tail-call")) {
      throw new Error(
        "BINARYEN_FEATURES is missing --enable-tail-call.\n" +
          "  Without it `wasm-opt` exits 1 on any module containing `return_call`\n" +
          "  and writes NO output file, so `vl build -O`/`-O3` bail on every\n" +
          "  tail-recursive program. See opt-profile-design.md §8.",
      );
    }
    const wat = `${ROOT}/tests/fixtures/opt-tailcall/tailcall.wat`;
    const tmp = await Deno.makeTempDir();
    const sh = async (bin: string, args: string[]) => {
      const { code, stderr } = await new Deno.Command(bin, { args, stdout: "piped", stderr: "piped" })
        .output();
      return { code, err: new TextDecoder().decode(stderr) };
    };
    try {
      const base = `${tmp}/tc.wasm`;
      const asm = await sh(`${ROOT}/node_modules/.bin/wasm-as`, [wat, ...features, "-o", base]);
      if (asm.code !== 0) throw new Error(`wasm-as rejected the fixture: ${asm.err.trim()}`);

      for (const [label, passes] of [
        ["-O", rustList(mainRs, "OPT_PASSES")],
        ["-O3", rustList(mainRs, "RELEASE_PASSES")],
      ] as const) {
        const out = `${tmp}/opt${label}.wasm`;
        const r = await sh(WASM_OPT, [base, ...passes, ...features, "-o", out]);
        if (r.code !== 0) {
          throw new Error(
            `${label} (${passes.join(" ")}) rejected a return_call module: ${r.err.trim()}\n` +
              "  wasm-opt writes no output on a validation failure, so this is a hard\n" +
              "  build failure for every tail-recursive program, not a lost optimization.",
          );
        }
        // The opcode must SURVIVE: an optimizer that silently rewrote it back to a
        // plain `call` would pass the exit-status check while undoing the 2.0x.
        const dis = await new Deno.Command(WASM_DIS, {
          args: [out, ...features],
          stdout: "piped",
          stderr: "piped",
        }).output();
        if (!new TextDecoder().decode(dis.stdout).includes("return_call")) {
          throw new Error(`${label} removed the return_call (the tail call did not survive)`);
        }
        const run = await vl(["run", out]);
        if (run.code !== 0 || run.out.trim() !== "5050") {
          throw new Error(`${label}: optimized module printed ${JSON.stringify(run.out)}, want "5050"`);
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// `-O3` outranks `-O` when both are passed: the release profile is a superset of
// `-O`'s effect on every measured shape, so running the shrink rung first would
// only buy a process spawn.
Deno.test({
  name: "native-release: -O3 wins over -O when both are given",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const both = await buildAndCount(src, ["-O", "-O3"], tmp);
      const only = await buildAndCount(src, ["-O3"], tmp);
      if (both.sites !== only.sites || both.sites !== 0) {
        throw new Error(
          `-O -O3 did not take the release path (sites: both=${both.sites}, -O3 alone=${only.sites}, want 0)`,
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// A missing `wasm-opt` must FAIL both rungs, identically. `-O` / `-O3` are never
// implied, so reaching the optimizer means the caller asked for it, and handing back
// an unoptimized module at exit 0 makes every downstream check believe it got an
// optimized one — which has produced published `-O3` timings that were re-runs of the
// `-O0` module. The error must name the flag and say how to get binaryen.
//
// This test formerly asserted the OPPOSITE (exit 0 + a note + the unoptimized module
// on disk). The soft no-op was deliberate under webcraft P1.3, and is deliberately
// reversed here: a soft default build is worth protecting, an ignored explicit flag
// is not. A plain `vl build` never shells out to wasm-opt, so a toolchain without
// binaryen still builds everything that did not ask to be optimized.
//
// Runs with an emptied environment so neither PATH nor an ambient `$VL_WASM_OPT`
// can find a binaryen. `nativeEnv` puts back only the two tree pins, neither of
// which is PATH or `$VL_WASM_OPT`, so the probe is unchanged and the fixture is
// compiled against THIS tree's std rather than the EXE's checkout.
Deno.test({
  name: "native-release: -O/-O3 FAIL LOUDLY with no wasm-opt (never a silent no-op)",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      for (const flag of ["-O", "-O3"]) {
        const out = `${tmp}/none${flag}.wasm`;
        const { code, stderr } = await new Deno.Command(VL, {
          args: ["build", src, flag, "-o", out, "--compiler", COMPILER],
          stdout: "piped",
          stderr: "piped",
          clearEnv: true,
          env: nativeEnv({ PATH: "" }),
        }).output();
        const err = new TextDecoder().decode(stderr);
        if (code === 0) {
          throw new Error(
            `${flag} without wasm-opt exited 0 — a silently unoptimized module is exactly ` +
              `the failure this test exists to prevent; stderr was:\n${err}`,
          );
        }
        if (!err.includes(flag) || !err.includes("wasm-opt")) {
          throw new Error(
            `${flag} without wasm-opt must name the flag AND wasm-opt in its error; stderr was:\n${err}`,
          );
        }
        if (!err.includes("VL_WASM_OPT")) {
          throw new Error(
            `${flag} without wasm-opt must tell the user how to point at a binaryen; stderr was:\n${err}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// The INVERTED control for the test above: a plain `vl build` — no optimizer flag —
// must still succeed in the same wasm-opt-less environment. Without this, making the
// optimizer strict could have broken every build on a toolchain lacking binaryen and
// the suite above would still be green.
Deno.test({
  name: "native-release: a plain `vl build` still succeeds with no wasm-opt",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${MELT}/union-box-call.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const out = `${tmp}/plain.wasm`;
      const { code, stderr } = await new Deno.Command(VL, {
        args: ["build", src, "-o", out, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        clearEnv: true,
        env: nativeEnv({ PATH: "" }),
      }).output();
      if (code !== 0) {
        throw new Error(
          `plain build without wasm-opt exited ${code}: ${new TextDecoder().decode(stderr).trim()}`,
        );
      }
      if (!exists(out) || Deno.statSync(out).size <= 0) {
        throw new Error(`plain build without wasm-opt left no module at ${out}`);
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
