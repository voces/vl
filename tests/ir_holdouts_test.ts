// The I8 holdout list (scripts/ir-i8-census/holdouts.tsv) is well formed and only shrinks: every
// row names a program that exists, rows are sorted and unique, and a row the base branch's list
// lacks fails, unless that list has no rows yet (the cutover seeds it). The graders hold each
// row to its refusal. Reads files only. No assertion library, per CLAUDE.md.

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
        Deno.statSync(new URL(f[0], ROOT));
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

Deno.test("holdouts: no row the base branch's list lacks", async () => {
  const base = Deno.env.get("HOLDOUTS_BASE") ?? "origin/master";
  const r = await new Deno.Command("git", {
    args: ["show", `${base}:${HOLDOUTS_PATH}`],
    cwd: ROOT,
    stdout: "piped",
    stderr: "null",
  }).output();
  if (!r.success) {
    console.warn(
      `[ir-holdouts] ${base} has no ${HOLDOUTS_PATH}; nothing to compare`,
    );
    return;
  }
  const was = new Set(
    rowsOf(new TextDecoder().decode(r.stdout)).map((l) => l.split("\t")[0]),
  );
  if (was.size === 0) return;
  const added = here.map((l) => l.split("\t")[0]).filter((p) => !was.has(p));
  if (added.length) {
    throw new Error(
      `want no new holdout (the list only shrinks), got ${added.length}:\n  ${
        added.join("\n  ")
      }`,
    );
  }
});
