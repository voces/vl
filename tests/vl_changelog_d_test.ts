// CHANGELOG.md IS WRITTEN ONLY BY THE FOLD — a PR adds a `changelog.d/` file instead.
//
// Concurrent PRs each adding a CHANGELOG line conflicted on GitHub, whose mergeability check
// ignores the `merge=union` driver, so a conflicted PR got no CI run. `changelog.d/FOLDED`
// pins CHANGELOG.md's byte count and FNV-1a hash as `scripts/changelog-fold.vl` last wrote it;
// a direct edit moves the hash and fails here. Every entry file must also parse as the fold
// reads it: a `## ` heading naming an existing section, then a `- ` bullet.
// No assertion library, per CLAUDE.md.

const ROOT = new URL("..", import.meta.url).pathname;
const DIR = `${ROOT}changelog.d`;

const pinOf = (bytes: Uint8Array) => {
  let h = 2166136261;
  for (const x of bytes) h = Math.imul(h ^ x, 16777619) >>> 0;
  return `bytes ${bytes.length} fnv1a32 ${h}`;
};

Deno.test("CHANGELOG.md matches the pin the last fold wrote", () => {
  const want = Deno.readTextFileSync(`${DIR}/FOLDED`).trim();
  const got = pinOf(Deno.readFileSync(`${ROOT}CHANGELOG.md`));
  if (want !== got) {
    throw new Error(
      `CHANGELOG.md was edited directly: want ${want}, got ${got}. ` +
        "Fix: `git checkout origin/master -- CHANGELOG.md`, then put your entry in a new " +
        "changelog.d/<branch>.md: its CHANGELOG `## ` section heading, then the `- ` bullet " +
        "(changelog.d/README.md). If this is red on master itself, the orchestrator runs " +
        "`vl run scripts/changelog-fold.vl -- --repin`.",
    );
  }
});

Deno.test("every changelog.d entry names a CHANGELOG section and starts with a bullet", () => {
  const heads = new Set(
    Deno.readTextFileSync(`${ROOT}CHANGELOG.md`).split("\n").filter((l) =>
      l.startsWith("## ")
    ),
  );
  for (const e of Deno.readDirSync(DIR)) {
    if (!e.isFile || !e.name.endsWith(".md") || e.name === "README.md") {
      continue;
    }
    const lines = Deno.readTextFileSync(`${DIR}/${e.name}`).replace(
      /\r\n?/g,
      "\n",
    )
      .split("\n").filter((l) => l.trim() !== "");
    if (
      lines.length < 2 || !heads.has(lines[0]) || !lines[1].startsWith("- ")
    ) {
      throw new Error(
        `changelog.d/${e.name}: want a line naming one of ${
          [...heads].join(" / ")
        }, ` +
          `then a "- " bullet; got ${JSON.stringify(lines.slice(0, 2))}`,
      );
    }
  }
});
