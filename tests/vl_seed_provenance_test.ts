// A GRADE IS A STATEMENT ABOUT THE COMPILER THE SEED WAS BUILT FROM, NOT ABOUT THE TREE.
//
// `build/vl-compiler.wasm` is the compiler's own codegen of itself, so `check-filed-witnesses.vl`
// and `survey-regrade.vl` both grade against whatever source that artifact came from. On
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
// The recorder is `scripts/seed-provenance.vl` (the Python it replaced is deleted). The first case
// drives its `--self-test`, which builds a specimen per verdict (match / differ / unknown) and
// sabotages the comparison to prove the specimens would notice. The second runs it over a fixed
// four-file tree and holds the fold, the sidecar and every verdict line to the values the Python
// printed on that same tree before it was deleted, so the identity cannot drift silently.
//
// No assertion library, per CLAUDE.md.
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";
import { builtScript } from "./support/builtScript.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[vl-seed-provenance] skipped — missing vl binary or seed wasm.",
  );
}

const dec = new TextDecoder();

/** `scripts/seed-provenance.vl <argv>` from `cwd` (it resolves every path against the cwd). */
async function provenance(argv: string[], cwd = ROOT) {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "run",
      await builtScript(`${ROOT}/scripts/seed-provenance.vl`, { cwd: ROOT }),
      "--",
      ...argv,
    ],
    cwd,
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

// The fixed tree: byte-order sorting (`B` before `a`), a multi-byte source (the fold feeds the
// BYTE length), an empty source, and a non-`.vl` file the fold must skip. Every hex value below
// is what `seed_provenance.py` printed on this tree, and the VL tool agreed on each. The one
// place they did not agree is which tree `--write` folds: the Python folded the checkout its own
// file sat in, the VL tool folds the working directory, which is what lets this case run.
const FIXTURE: [string, string][] = [
  ["compiler/a.vl", "const a = 1\n"],
  ["compiler/B.vl", "// é ü — multi-byte\n"],
  ["compiler/empty.vl", ""],
  ["compiler/notes.md", "not folded\n"],
];
const FOLD = "589354f9bc116d5f";
const FOLD_AFTER_EDIT = "225cf8e641f0b95c";

function expectLine(
  what: string,
  got: { code: number; out: string },
  rc: number,
  line: string,
) {
  if (got.code !== rc || got.out !== line + "\n") {
    throw new Error(
      `${what}: want rc ${rc} and ${
        JSON.stringify(line)
      }, got rc ${got.code} and ${JSON.stringify(got.out)}`,
    );
  }
}

Deno.test({
  name:
    "seed provenance: the fold, the sidecar and each verdict line over a fixed tree",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_seed_prov_" });
    try {
      await Deno.mkdir(`${dir}/compiler`);
      await Deno.mkdir(`${dir}/build`);
      for (const [f, text] of FIXTURE) {
        await Deno.writeTextFile(`${dir}/${f}`, text);
      }
      expectLine(
        "no sidecar",
        await provenance([], dir),
        1,
        `seed provenance: UNKNOWN (no build/vl-compiler.wasm.src) · compiler/*.vl is ${FOLD} over 3 files`,
      );
      expectLine(
        "--write",
        await provenance(["--write"], dir),
        0,
        `wrote build/vl-compiler.wasm.src (${FOLD} over 3 files)`,
      );
      const written = await Deno.readTextFile(
        `${dir}/build/vl-compiler.wasm.src`,
      );
      const want =
        `${FOLD}\n# fnv1a-64 over 3 compiler/*.vl, \`std_hash\`'s fold; ` +
        "written by scripts/refresh-compiler.sh\n";
      if (written !== want) {
        throw new Error(
          `sidecar: want ${JSON.stringify(want)}, got ${
            JSON.stringify(written)
          }`,
        );
      }
      expectLine(
        "match",
        await provenance([], dir),
        0,
        `seed provenance: ${FOLD} · compiler/*.vl ${FOLD} over 3 files — match`,
      );
      await Deno.writeTextFile(`${dir}/compiler/a.vl`, "changed\n", {
        append: true,
      });
      expectLine(
        "one source changed",
        await provenance([], dir),
        1,
        `seed provenance: ${FOLD} · compiler/*.vl ${FOLD_AFTER_EDIT} over 3 files — DIFFER`,
      );
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
  const callers: [string, string][] = [
    ["check-filed-witnesses.vl", "provenance(moved.length)"],
    ["survey-regrade.vl", "= provenance("],
  ];
  for (const [f, call] of callers) {
    const src = await Deno.readTextFile(`${ROOT}/scripts/${f}`);
    if (!src.includes(call)) {
      throw new Error(
        `scripts/${f} does not call ${
          call.replace(/^= /, "")
        }) — a grade would be reported ` +
          `without saying which compiler produced it`,
      );
    }
  }
});
