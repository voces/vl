// scripts/queue-candidate.sh resolves only purely additive list conflicts, and refuses the rest.
// Each case builds a throwaway repository: a base, two branches, and the candidate built from them.

const SCRIPT = new URL("../scripts/queue-candidate.sh", import.meta.url).pathname;
const ENV = {
  GIT_AUTHOR_NAME: "queue-test",
  GIT_AUTHOR_EMAIL: "queue-test@example.invalid",
  GIT_COMMITTER_NAME: "queue-test",
  GIT_COMMITTER_EMAIL: "queue-test@example.invalid",
};
const dec = new TextDecoder();

async function run(cwd: string, cmd: string, args: string[]) {
  const p = await new Deno.Command(cmd, { args, cwd, env: ENV, stdout: "piped", stderr: "piped" })
    .output();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
}

async function git(cwd: string, ...args: string[]) {
  const r = await run(cwd, "git", args);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
  return r.out.trim();
}

// A repository whose base commits `base`, with branch `a` and branch `b` each replacing it whole.
async function repo(base: string, a: string, b: string): Promise<string> {
  const dir = await Deno.makeTempDir({ prefix: "queue_candidate_" });
  await git(dir, "init", "-q", "-b", "main");
  await Deno.writeTextFile(`${dir}/f.vl`, base);
  await git(dir, "add", "f.vl");
  await git(dir, "commit", "-q", "-m", "base");
  for (const [name, text] of [["a", a], ["b", b]]) {
    await git(dir, "checkout", "-q", "-b", name, "main");
    await Deno.writeTextFile(`${dir}/f.vl`, text);
    await git(dir, "commit", "-q", "-am", name);
  }
  await git(dir, "checkout", "-q", "main");
  return dir;
}

async function candidate(dir: string) {
  const r = await run(dir, "bash", [SCRIPT, "main", "a", "b"]);
  const worktrees = (await git(dir, "worktree", "list")).split("\n").length;
  if (worktrees !== 1) throw new Error(`want no worktree left behind, got ${worktrees} listed`);
  return r;
}

const UNION = "type U = RA\n  | RC\n  | RE\n\nconst ks = [\n  \"RA\",\n  \"RC\",\n  \"RE\",\n]\n";

Deno.test("queue-candidate: two members added at one slot of a sorted list merge, sorted", async () => {
  const a = UNION.replace("  | RC\n", "  | RC\n  | RD\n").replace('  "RC",\n', '  "RC",\n  "RD",\n');
  const b = UNION.replace("  | RC\n", "  | RC\n  | RCc\n").replace('  "RC",\n', '  "RC",\n  "RCc",\n');
  const dir = await repo(UNION, a, b);
  try {
    const r = await candidate(dir);
    if (r.code !== 0) throw new Error(`want exit 0, got ${r.code}:\n${r.out}${r.err}`);
    const sha = /^candidate ([0-9a-f]{40})$/m.exec(r.out)?.[1];
    if (!sha) throw new Error(`want a candidate sha, got:\n${r.out}`);
    const got = await git(dir, "show", `${sha}:f.vl`);
    const want = UNION.replace("  | RC\n", "  | RC\n  | RCc\n  | RD\n")
      .replace('  "RC",\n', '  "RC",\n  "RCc",\n  "RD",\n').trim();
    if (got !== want) throw new Error(`want the sorted union:\n${want}\ngot:\n${got}`);
    if (!/resolved f\.vl:\d+: 1 \+ 1 lines \(sorted\)/.test(r.out)) {
      throw new Error(`want each resolved hunk printed, got:\n${r.out}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("queue-candidate: two arms that end alike are refused, not joined (control)", async () => {
  const base = "match r {\n    RA => {\n      f()\n    }\n}\n";
  const a = "match r {\n    RA => {\n      f()\n    }\n    RB => {\n      g()\n    }\n}\n";
  const b = "match r {\n    RA => {\n      f()\n    }\n    RC => {\n      h()\n    }\n}\n";
  const dir = await repo(base, a, b);
  try {
    const r = await candidate(dir);
    if (r.code !== 1 || !/REFUSED f\.vl:\d+: a side adds a line that is not a list member/.test(r.err)) {
      throw new Error(`want exit 1 naming the hunk, got ${r.code}:\n${r.out}${r.err}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("queue-candidate: a conflict that edits a base line is refused", async () => {
  const dir = await repo(UNION, UNION.replace("  | RC\n", "  | RX\n"), UNION.replace("  | RC\n", "  | RY\n"));
  try {
    const r = await candidate(dir);
    if (r.code !== 1 || !/REFUSED f\.vl:\d+: the hunk changes a base line/.test(r.err)) {
      throw new Error(`want exit 1 naming the hunk, got ${r.code}:\n${r.out}${r.err}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});

Deno.test("queue-candidate: disjoint branches merge clean", async () => {
  const dir = await repo(UNION, UNION.replace("  | RE\n", "  | RE\n  | RF\n"), UNION.replace('  "RA",\n', '  "RA",\n  "RB",\n'));
  try {
    const r = await candidate(dir);
    if (r.code !== 0 || (r.out.match(/: clean$/gm) ?? []).length !== 2) {
      throw new Error(`want two clean merges, got ${r.code}:\n${r.out}${r.err}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
