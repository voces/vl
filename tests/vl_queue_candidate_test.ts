// scripts/queue-candidate.sh resolves only purely additive list conflicts, and refuses the rest.
// Each case builds a throwaway repository: a base, two branches, and the candidate built from them.

const ROOT = new URL("../", import.meta.url).pathname;
const SCRIPT = `${ROOT}scripts/queue-candidate.sh`;
const VL = `${ROOT}scripts/vl-host/target/release/vl`;
const SEED = `${ROOT}build/vl-compiler.wasm`;
const exists = (f: string) => {
  try {
    return Deno.statSync(f).isFile;
  } catch {
    return false;
  }
};
// A resolved .vl file is checked with `vl fmt --check`, so the cases that resolve need the host.
const HAS_VL = exists(VL) && exists(SEED);
const ENV = {
  VL,
  SEED,
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

Deno.test({ name: "queue-candidate: two members added at one slot of a sorted list merge, sorted", ignore: !HAS_VL, fn: async () => {
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
} });

const ARMS = "function f(r: U): i32 {\n  return match r {\n    RA => 1\n    RZ => 9\n  }\n}\n";
const withArm = (arm: string) => ARMS.replace("    RZ => 9\n", `${arm}    RZ => 9\n`);

Deno.test({ name: "queue-candidate: two whole one-line arms, or two type declarations, at one slot merge", ignore: !HAS_VL, fn: async () => {
  for (const [a, b] of [
    [withArm("    RB => 2\n"), withArm("    RC => 3\n")],
    [
      ARMS + "// A.\nexport type TA = { a: i32 }\n",
      ARMS + "// B, which\n// takes two lines.\nexport type TB = { b: i32 }\n",
    ],
  ]) {
    const dir = await repo(ARMS, a, b);
    try {
      const r = await candidate(dir);
      const sha = /^candidate ([0-9a-f]{40})$/m.exec(r.out)?.[1];
      if (r.code !== 0 || !sha || !/whole items, ours then theirs/.test(r.out)) {
        throw new Error(`want both items resolved, got ${r.code}:\n${r.out}${r.err}`);
      }
      const got = await git(dir, "show", `${sha}:f.vl`);
      for (const want of [a, b]) {
        for (const line of want.split("\n").filter((l) => l && !ARMS.includes(l))) {
          if (!got.includes(line)) throw new Error(`want "${line}" in the candidate, got:\n${got}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  }
} });

Deno.test({ name: "queue-candidate: a duplicate head, an or-pattern arm or a non-fmt-clean result is refused", ignore: !HAS_VL, fn: async () => {
  const cases: [string, string, RegExp][] = [
    [withArm("    RB => 2\n"), withArm("    RB => 3\n"), /both sides add an item headed arm RB/],
    [withArm("    RB | RC => 2\n"), withArm("    RD => 3\n"), /neither a list member nor a whole one-line arm or type/],
    [ARMS + "export type TA = { a: i32 }   \n", ARMS + "export type TB = { b: i32 }\n", /not vl fmt clean/],
  ];
  for (const [a, b, want] of cases) {
    const dir = await repo(ARMS, a, b);
    try {
      const r = await candidate(dir);
      if (r.code !== 1 || !want.test(r.err)) {
        throw new Error(`want exit 1 and ${want}, got ${r.code}:\n${r.out}${r.err}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  }
} });

Deno.test("queue-candidate: two arms that end alike are refused, not joined (control)", async () => {
  const base = "match r {\n    RA => {\n      f()\n    }\n}\n";
  const a = "match r {\n    RA => {\n      f()\n    }\n    RB => {\n      g()\n    }\n}\n";
  const b = "match r {\n    RA => {\n      f()\n    }\n    RC => {\n      h()\n    }\n}\n";
  const dir = await repo(base, a, b);
  try {
    const r = await candidate(dir);
    if (r.code !== 1 || !/REFUSED f\.vl:\d+: ours adds a line that is neither a list member nor a whole one-line arm or type/.test(r.err)) {
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
