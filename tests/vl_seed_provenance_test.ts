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
