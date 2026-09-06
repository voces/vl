// A MISSING SEED IS A USAGE ERROR, NEVER A GRADE.
//
// `regress.py` takes the seed POSITIONALLY, so `regress.py --verify-fresh` bound the seed
// to the string `--verify-fresh`. Every one of the 7,565 corpus cells was then graded
// against a path that cannot instantiate, and the tool printed
// `4655 classes runs -> NOT-RUNS` — a catastrophic-looking answer produced by a correct
// instrument given the wrong input, and the single most alarming line this repo's ladder
// can emit. It was relayed to a coordinator as a possible mass regression.
//
// The fix is to refuse: argv[1] must name an existing file, and anything else exits 2 with
// a message that names the argument. This is the guard's control — the exact invocation
// that produced the false alarm, asserted to refuse rather than to grade.
//
// No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/silent-sweep/distilled/regress.py`;

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

Deno.test("regress.py: a flag in the seed slot refuses instead of grading", async () => {
  const { code, out } = await run(["--verify-fresh"]);
  if (code !== 2) {
    throw new Error(
      `want exit 2 for a missing seed, got ${code}. Output:\n${out.slice(0, 600)}`,
    );
  }
  if (!out.includes("--verify-fresh") || !out.toLowerCase().includes("seed")) {
    throw new Error(
      `the refusal must name the offending argument and the word "seed"; got:\n` +
        out.slice(0, 400),
    );
  }
  // The failure this guards against is a GRADE, so assert no grade was produced.
  if (/NOT-RUNS|classes|cells graded/i.test(out)) {
    throw new Error(`a missing seed must not grade anything; got:\n${out.slice(0, 600)}`);
  }
});

Deno.test("regress.py: a seed path that does not exist refuses too", async () => {
  const { code, out } = await run(["build/no-such-seed.wasm", "--verify-fresh"]);
  if (code !== 2) {
    throw new Error(
      `want exit 2 for a non-existent seed path, got ${code}. Output:\n${out.slice(0, 600)}`,
    );
  }
  if (!out.includes("no-such-seed.wasm")) {
    throw new Error(`the refusal must name the path it was given; got:\n` + out.slice(0, 400));
  }
});
