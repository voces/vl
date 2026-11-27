// The I8 holdout list (scripts/ir-i8-census/holdouts.tsv) is well formed and grows only by a
// discovered gap: every row names a program that exists, rows are sorted and unique, and a row the
// base branch's list lacks fails unless its program's file is new in this branch (a program on the
// base that stops running is a regression). The graders hold each row to its refusal. No
// assertion library, per CLAUDE.md.

import { HOLDOUTS_PATH } from "./support/holdouts.ts";

const ROOT = new URL("../", import.meta.url);
const rowsOf = (text: string): string[] =>
  text.split("\n").filter((l) => l !== "" && !l.startsWith("#"));
const here = rowsOf(Deno.readTextFileSync(new URL(HOLDOUTS_PATH, ROOT)));

Deno.test("holdouts: rows are <program> <unit> <class> <owner>, sorted, unique, existing", () => {
  const bad: string[] = [];
  const progs = here.map((l) => l.split("\t")[0]);
  for (const l of here) {
    const f = l.split("\t");
    if (f.length !== 4 || f.some((x) => x === "")) {
      bad.push(`not 4 fields: ${l}`);
    } else {
      try {
        Deno.statSync(new URL(f[0].split("#")[0], ROOT));
      } catch {
        bad.push(`no such program: ${f[0]}`);
      }
    }
  }
  const sorted = [...progs].sort();
  if (progs.join("\n") !== sorted.join("\n")) {
    bad.push("rows are not sorted by program");
  }
  if (new Set(progs).size !== progs.length) bad.push("a program has two rows");
  if (bad.length) {
    throw new Error(
      `want a well-formed holdout list, got:\n  ${bad.join("\n  ")}`,
    );
  }
});

Deno.test("holdouts: a new row names a program this branch adds", async () => {
  const ref = Deno.env.get("HOLDOUTS_BASE") ?? "origin/master";
  const git = async (...args: string[]): Promise<{ ok: boolean; out: string }> => {
    const r = await new Deno.Command("git", { args, cwd: ROOT, stdout: "piped", stderr: "null" })
      .output();
    return { ok: r.success, out: new TextDecoder().decode(r.stdout) };
  };
  // The fork point, not the tip: a row master deleted after this tree was cut is not one it adds.
  const mb = await git("merge-base", "HEAD", ref);
  const base = mb.ok && mb.out.trim() !== "" ? mb.out.trim() : ref;
  // Probed with commands that exit 0 or 1, never git's 128, which a harness reads as a death.
  const has = (await git("rev-parse", "--verify", "--quiet", `${base}^{commit}`)).ok &&
    (await git("ls-tree", "--name-only", base, "--", HOLDOUTS_PATH)).out.trim() !== "";
  if (!has) {
    console.warn(`[ir-holdouts] ${base} has no ${HOLDOUTS_PATH}; nothing to compare`);
    return;
  }
  const baseText = (await git("show", `${base}:${HOLDOUTS_PATH}`)).out;
  const was = new Set(rowsOf(baseText).map((l) => l.split("\t")[0]));
  if (was.size === 0) return;
  const added = here.map((l) => l.split("\t")[0]).filter((p) => !was.has(p));
  const onBase: string[] = [];
  for (const p of added) {
    const file = p.split("#")[0];
    if ((await git("ls-tree", "--name-only", base, "--", file)).out.trim() !== "") onBase.push(p);
  }
  if (onBase.length) {
    throw new Error(
      `want a new holdout only for a program this branch adds (one on ${base} that stops running ` +
        `is a regression), got ${onBase.length}:\n  ${onBase.join("\n  ")}`,
    );
  }
});
