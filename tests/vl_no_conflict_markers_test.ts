// A merge conflict marker that survives a resolution is invisible to every other gate: the
// inventory graders read rows, the linters read `.vl`, and a `>>>>>>> <sha>` line in
// CHANGELOG.md or a doc is just text. Twice on 2026-09-02 a "keep both sides" resolution
// left one behind (D1013's doubled body; #2421's CHANGELOG). This scans every tracked text
// file for the three marker shapes at line start. `=======` alone is NOT a marker here — it
// is a legitimate setext underline in markdown — so only the `<<<<<<< ` / `>>>>>>> ` forms
// count, plus `=======` when it sits between them.
//
// Repro (any file): `git merge` with a conflict, `git add` without editing, commit.

const BINARY = /\.(wasm|png|jpg|jpeg|gif|ico|woff2?|ttf|pdf|zip|gz|cwasm)$/i;
// The generated corpora are thousands of one-line files a conflict would break outright
// (regress.py refuses to load them), so they are skipped for speed, not for tolerance.
const GENERATED = /^scripts\/silent-sweep\//;

const listTracked = (): string[] => {
  const out = new Deno.Command("git", { args: ["ls-files", "-z"], stdout: "piped" })
    .outputSync();
  return new TextDecoder().decode(out.stdout).split("\0").filter((p) => p !== "");
};

Deno.test("no tracked file carries a merge conflict marker", () => {
  const hits: string[] = [];
  for (const path of listTracked()) {
    if (BINARY.test(path) || GENERATED.test(path)) continue;
    let text: string;
    try {
      text = Deno.readTextFileSync(path);
    } catch {
      continue; // a submodule entry or a path git lists but the checkout lacks
    }
    const lines = text.split("\n");
    let open = -1;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l.startsWith("<<<<<<< ")) {
        hits.push(`${path}:${i + 1}: ${l.slice(0, 60)}`);
        open = i;
      } else if (l.startsWith(">>>>>>> ")) {
        hits.push(`${path}:${i + 1}: ${l.slice(0, 60)}`);
        open = -1;
      } else if (l === "=======" && open >= 0) {
        hits.push(`${path}:${i + 1}: ======= (inside an open <<<<<<< block)`);
      }
    }
  }
  if (hits.length > 0) {
    throw new Error(
      `want no merge conflict markers in tracked files, got ${hits.length}:\n  ` +
        hits.join("\n  "),
    );
  }
});
