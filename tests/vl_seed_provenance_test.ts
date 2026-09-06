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
// compiled and `scripts/seed_provenance.py` recomputes it — identities, not clocks.
//
// This is the cheap half: it drives the python's own `--self-test`, which builds a specimen per
// verdict (match / differ / unknown) and sabotages the comparison to prove the specimens would
// notice. No compiler, no seed, milliseconds.
//
// No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/seed_provenance.py`;

/** A python that actually runs: `$PYTHON`, then /usr/bin/python3, then whatever is on PATH. */
async function python(): Promise<string> {
  const tried: string[] = [];
  for (const p of [Deno.env.get("PYTHON"), "/usr/bin/python3", "python3"]) {
    if (p === undefined) continue;
    tried.push(p);
    try {
      const { code } = await new Deno.Command(p, {
        args: ["-c", "print(1)"],
        stdout: "null",
        stderr: "null",
      }).output();
      if (code === 0) return p;
    } catch { /* not on PATH — try the next */ }
  }
  throw new Error(`no working python3 found (tried ${tried.join(", ")})`);
}

async function run(args: string[]) {
  const { code, stdout, stderr } = await new Deno.Command(await python(), {
    args: [SCRIPT, ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const d = new TextDecoder();
  return { code, out: d.decode(stdout) + d.decode(stderr) };
}

Deno.test("seed provenance: every verdict fires on a specimen that must produce it", async () => {
  const { code, out } = await run(["--self-test"]);
  if (code !== 0) {
    throw new Error(`seed_provenance.py --self-test failed (rc ${code}):\n${out}`);
  }
  // The summary has to name what was proved, or a self-test that stopped testing reads the same.
  for (const want of ["match passes", "refresh-compiler.sh", "MOVED"]) {
    if (!out.includes(want)) {
      throw new Error(`the self-test summary must mention ${JSON.stringify(want)}; got:\n${out}`);
    }
  }
});

const RECORD = `${ROOT}/scripts/record-seed-provenance.sh`;

/** Run the recorder against a throwaway seed path; returns its rc, output and sidecar state. */
async function record(env: Record<string, string>) {
  const seed = await Deno.makeTempFile({ suffix: ".wasm" });
  const { code, stdout, stderr } = await new Deno.Command("bash", {
    args: [RECORD, seed],
    cwd: ROOT,
    env,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const d = new TextDecoder();
  let sidecar: string | null = null;
  try {
    sidecar = await Deno.readTextFile(`${seed}.src`);
  } catch { /* the refusal path leaves none, which is the point */ }
  await Deno.remove(seed).catch(() => {});
  await Deno.remove(`${seed}.src`).catch(() => {});
  return { code, out: d.decode(stdout) + d.decode(stderr), sidecar };
}

Deno.test("seed provenance: a `python3` that cannot start falls back rather than skipping", async () => {
  // The box this was found on has a Homebrew python3 first on PATH that exits before running a
  // line. `/bin/false` stands in for it: same observable — rc != 0, nothing recorded.
  const { code, out, sidecar } = await record({ PYTHON: "/bin/false" });
  if (code !== 0) throw new Error(`want rc 0 via the fallback, got ${code}:\n${out}`);
  if (sidecar === null) throw new Error(`the fallback recorded no sidecar; output:\n${out}`);
  if (!/^[0-9a-f]{16}\n/.test(sidecar)) {
    throw new Error(`want a 16-hex identity as the sidecar's first line, got:\n${sidecar}`);
  }
  if (!out.includes("could not run")) {
    throw new Error(`the fallback must say which interpreter failed; got:\n${out}`);
  }
});

Deno.test("seed provenance: with no working interpreter it REFUSES and leaves no sidecar", async () => {
  // The control this guard would otherwise never be watched refuse. A stale sidecar would be
  // worse than none — a grader reads it as THIS seed's identity — so the refusal must clear it.
  const { code, out, sidecar } = await record({
    PYTHON: "/bin/false",
    PYTHON_FALLBACK: "/bin/false",
  });
  if (code === 0) throw new Error(`want a non-zero refusal, got rc 0:\n${out}`);
  if (sidecar !== null) throw new Error(`the refusal left a sidecar behind:\n${sidecar}`);
  if (!out.includes("PYTHON")) {
    throw new Error(`the refusal must name PYTHON so the fix is in the message; got:\n${out}`);
  }
});

Deno.test("seed provenance: refresh-compiler.sh does not degrade the miss to a note", async () => {
  // The regression this pair exists for: the step ran with `|| echo note:`, so a seed with no
  // recorded identity shipped while the refresh reported success. Assert the wiring, not trust.
  const src = await Deno.readTextFile(`${ROOT}/scripts/refresh-compiler.sh`);
  if (!src.includes("record-seed-provenance.sh")) {
    throw new Error(
      "refresh-compiler.sh must record the seed's provenance through " +
        "scripts/record-seed-provenance.sh, which fails loud when no interpreter runs",
    );
  }
  if (/seed_provenance\.py[^\n]*\|\|/.test(src)) {
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
