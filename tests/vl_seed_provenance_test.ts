// A GRADE IS A STATEMENT ABOUT THE COMPILER THE SEED WAS BUILT FROM, NOT ABOUT THE TREE.
//
// `build/vl-compiler.wasm` is the compiler's own codegen of itself, so `check-filed-witnesses.py`
// and `survey-regrade.py` both grade against whatever source that artifact came from. On
// 2026-09-06 that produced a confidently reported red: the witness checker was run by hand after
// a branch switch, WITHOUT `refresh-compiler.sh`, so the row files were from one commit and the
// seed from another, and three rows whose fixes had landed graded as MOVED against a compiler
// that did not have them. `gate.sh` never hits it, because it refreshes the seed first — which
// is exactly why the hand path needed its own guard.
//
// NOT A TIMESTAMP. `git archive`, `cp`, a rebase and a checkout all hand a stale artifact a
// fresh mtime and a fresh one an old mtime, which is why CLAUDE.md's cargo rule reads "verify
// BEHAVIORALLY, never by timestamp". `refresh-compiler.sh` records the FOLD of the sources it
// compiled and `scripts/seed-provenance.vl` recomputes it — identities, not clocks.
//
// The recorder is a VL program now (it was `seed_provenance.py`, which stays only because the
// two Python graders still import it). The first case drives its `--self-test`, which builds a
// specimen per verdict (match / differ / unknown) and sabotages the comparison to prove the
// specimens would notice. The second pins the VL fold to the Python's, byte for byte, so the two
// cannot drift while both exist.
//
// No assertion library, per CLAUDE.md.
// @test-timing native

import {
  COMPILER,
  exists,
  nativeEnv,
  pythonBin,
  ROOT,
  VL,
} from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-seed-provenance] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();

/** `scripts/seed-provenance.vl <argv>` from the checkout root (it resolves paths against the cwd). */
async function provenance(argv: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      "scripts/seed-provenance.vl",
      "--compiler",
      COMPILER,
      "--",
      ...argv,
    ],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
}

Deno.test({
  name:
    "seed provenance: every verdict fires on a specimen that must produce it",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out } = await provenance(["--self-test"]);
    if (code !== 0) {
      throw new Error(
        `seed-provenance.vl --self-test failed (rc ${code}):\n${out}`,
      );
    }
    // The summary has to name what was proved, or a self-test that stopped testing reads the same.
    for (const want of ["match passes", "refresh-compiler.sh", "MOVED"]) {
      if (!out.includes(want)) {
        throw new Error(
          `the self-test summary must mention ${
            JSON.stringify(want)
          }; got:\n${out}`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "seed provenance: the VL fold writes the Python fold's sidecar byte for byte",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_prov_" });
    try {
      const viaVl = await provenance(["--write", "--seed", `${dir}/vl.wasm`]);
      if (viaVl.code !== 0) {
        throw new Error(`--write failed (rc ${viaVl.code}):\n${viaVl.out}`);
      }
      const py = await new Deno.Command(pythonBin(), {
        args: [
          "scripts/seed_provenance.py",
          "--write",
          "--seed",
          `${dir}/py.wasm`,
        ],
        cwd: ROOT,
        stdout: "null",
        stderr: "piped",
      }).output();
      if (py.code !== 0) {
        throw new Error(`python --write failed:\n${dec.decode(py.stderr)}`);
      }
      const a = await Deno.readTextFile(`${dir}/vl.wasm.src`);
      const b = await Deno.readTextFile(`${dir}/py.wasm.src`);
      if (a !== b) {
        throw new Error(
          `sidecars differ.\nvl: ${JSON.stringify(a)}\npy: ${
            JSON.stringify(b)
          }`,
        );
      }
      if (!/^[0-9a-f]{16}\n/.test(a)) {
        throw new Error(`want a 16-hex identity first, got ${a}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

const RECORD = `${ROOT}/scripts/record-seed-provenance.sh`;

/** Run the recorder against a throwaway seed path; returns its rc, output and sidecar state. */
async function record(env: Record<string, string>) {
  const seed = await Deno.makeTempFile({ suffix: ".wasm" });
  const { code, stdout, stderr } = await new Deno.Command("bash", {
    args: [RECORD, seed],
    cwd: ROOT,
    env: { ...nativeEnv(), VL, ...env },
    stdout: "piped",
    stderr: "piped",
  }).output();
  let sidecar: string | null = null;
  try {
    sidecar = await Deno.readTextFile(`${seed}.src`);
  } catch { /* the refusal path leaves none, which is the point */ }
  await Deno.remove(seed).catch(() => {});
  await Deno.remove(`${seed}.src`).catch(() => {});
  return { code, out: dec.decode(stdout) + dec.decode(stderr), sidecar };
}

Deno.test({
  name:
    "seed provenance: the recorder writes a 16-hex identity through a working compiler",
  ignore: !ENABLED,
  fn: async () => {
    const { code, out, sidecar } = await record({ COMPILER });
    if (code !== 0) throw new Error(`want rc 0, got ${code}:\n${out}`);
    if (sidecar === null || !/^[0-9a-f]{16}\n/.test(sidecar)) {
      throw new Error(
        `want a 16-hex identity as the sidecar's first line, got:\n${sidecar}`,
      );
    }
  },
});

Deno.test({
  name:
    "seed provenance: with a compiler that cannot run it REFUSES and leaves no sidecar",
  ignore: !ENABLED,
  fn: async () => {
    // The control this guard would otherwise never be watched refuse. A stale sidecar would be
    // worse than none — a grader reads it as THIS seed's identity — so the refusal must clear it.
    // `/bin/false` stands in for a compiler that cannot start: same observable, rc != 0.
    const { code, out, sidecar } = await record({ COMPILER: "/bin/false" });
    if (code === 0) {
      throw new Error(`want a non-zero refusal, got rc 0:\n${out}`);
    }
    if (sidecar !== null) {
      throw new Error(`the refusal left a sidecar behind:\n${sidecar}`);
    }
    if (!out.includes("COMPILER")) {
      throw new Error(
        `the refusal must name COMPILER so the fix is in the message; got:\n${out}`,
      );
    }
  },
});

Deno.test("seed provenance: refresh-compiler.sh does not degrade the miss to a note", async () => {
  // The regression this pair exists for: the step ran with `|| echo note:`, so a seed with no
  // recorded identity shipped while the refresh reported success. Assert the wiring, not trust.
  const src = await Deno.readTextFile(`${ROOT}/scripts/refresh-compiler.sh`);
  if (!src.includes("record-seed-provenance.sh")) {
    throw new Error(
      "refresh-compiler.sh must record the seed's provenance through " +
        "scripts/record-seed-provenance.sh, which fails loud when the recorder cannot run",
    );
  }
  if (/record-seed-provenance\.sh[^\n]*\|\|/.test(src)) {
    throw new Error(
      "refresh-compiler.sh swallows the provenance step's failure with `||` — a seed with " +
        "no sidecar would ship while the refresh reports success",
    );
  }
});

Deno.test("seed provenance: the graders consult it", async () => {
  // The guard is worthless if nobody calls it. Assert the wiring rather than trusting it —
  // a helper with a green self-test and no caller is the shape this repo has shipped before.
  for (const f of ["check-filed-witnesses.py", "survey-regrade.py"]) {
    const src = await Deno.readTextFile(`${ROOT}/scripts/${f}`);
    if (!src.includes("seed_provenance.guard(")) {
      throw new Error(
        `scripts/${f} does not call seed_provenance.guard() — a grade would be reported ` +
          `without saying which compiler produced it`,
      );
    }
  }
});
