// The I8 holdout list (scripts/ir-i8-census/holdouts/, one file per program) is well formed and
// grows only by a discovered gap: every file holds one row naming a program that exists, under the
// name its program's slug gives, and a row the base branch's list lacks fails unless its program's
// file is new in this branch (a program on the base that stops running is a regression). The
// graders hold each row to its refusal. No assertion library, per CLAUDE.md.

import { holdoutFile, holdoutRows, HOLDOUTS_DIR } from "./support/holdouts.ts";

const ROOT = new URL("../", import.meta.url);
const rows = holdoutRows();
const here = rows.map(([, l]) => l);

Deno.test("holdouts: each file is one <program> <unit> <class> <owner> row, named for its program", () => {
  const bad: string[] = [];
  const perFile = new Map<string, number>();
  for (const [n] of rows) perFile.set(n, (perFile.get(n) ?? 0) + 1);
  for (const [n, k] of perFile) {
    if (k !== 1) bad.push(`${n} holds ${k} rows, want 1`);
  }
  for (const [n, l] of rows) {
    const f = l.split("\t");
    if (f.length !== 4 || f.some((x) => x === "")) {
      bad.push(`${n}: not 4 fields: ${l}`);
      continue;
    }
    if (`${HOLDOUTS_DIR}/${n}` !== holdoutFile(f[0])) {
      bad.push(`${n}: want it named ${holdoutFile(f[0])} for ${f[0]}`);
    }
    try {
      Deno.statSync(new URL(f[0].split("#")[0], ROOT));
    } catch {
      bad.push(`${n}: no such program: ${f[0]}`);
    }
  }
  const progs = here.map((l) => l.split("\t")[0]);
  if (new Set(progs).size !== progs.length) bad.push("a program has two rows");
  if (bad.length) {
    throw new Error(
      `want a well-formed holdout directory, got:\n  ${bad.join("\n  ")}`,
    );
  }
});

Deno.test("holdouts: a new row names a program this branch adds", async () => {
  const ref = Deno.env.get("HOLDOUTS_BASE") ?? "origin/master";
  const git = async (
    ...args: string[]
  ): Promise<{ ok: boolean; out: string }> => {
    const r = await new Deno.Command("git", {
      args,
      cwd: ROOT,
      stdout: "piped",
      stderr: "null",
    })
      .output();
    return { ok: r.success, out: new TextDecoder().decode(r.stdout) };
  };
  // The fork point, not the tip: a row master deleted after this tree was cut is not one it adds.
  const mb = await git("merge-base", "HEAD", ref);
  const base = mb.ok && mb.out.trim() !== "" ? mb.out.trim() : ref;
  // Probed with commands that exit 0 or 1, never git's 128, which a harness reads as a death.
  if (!(await git("rev-parse", "--verify", "--quiet", `${base}^{commit}`)).ok) {
    console.warn(`[ir-holdouts] no commit ${base}; nothing to compare`);
    return;
  }
  // The base's rows: its directory's files, or the one-file list a base cut before the split has.
  const OLD = "scripts/ir-i8-census/holdouts.tsv";
  let baseText = "";
  if (
    (await git("ls-tree", "--name-only", base, "--", `${HOLDOUTS_DIR}/`)).out
      .trim() !== ""
  ) {
    baseText =
      (await git("grep", "-h", "-e", "", base, "--", `${HOLDOUTS_DIR}/*.tsv`))
        .out;
  } else if (
    (await git("ls-tree", "--name-only", base, "--", OLD)).out.trim() !== ""
  ) {
    baseText = (await git("show", `${base}:${OLD}`)).out;
  } else {
    console.warn(
      `[ir-holdouts] ${base} has no holdout list; nothing to compare`,
    );
    return;
  }
  const was = new Set(
    baseText.split("\n").filter((l) => l !== "" && !l.startsWith("#")).map((
      l,
    ) => l.split("\t")[0]),
  );
  if (was.size === 0) return;
  const added = here.map((l) => l.split("\t")[0]).filter((p) => !was.has(p));
  const onBase: string[] = [];
  for (const p of added) {
    const file = p.split("#")[0];
    if (
      (await git("ls-tree", "--name-only", base, "--", file)).out.trim() !== ""
    ) onBase.push(p);
  }
  if (onBase.length) {
    throw new Error(
      `want a new holdout only for a program this branch adds (one on ${base} that stops running ` +
        `is a regression), got ${onBase.length}:\n  ${onBase.join("\n  ")}`,
    );
  }
});
