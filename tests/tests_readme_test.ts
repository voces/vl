// tests/README.md IS AN INDEX OF tests/, and an index nobody checks drifts. Every
// `tests/*_test.ts` must match a backticked `*_test.ts` pattern in the README's first
// table column, and every such pattern must match a file. No assertion library, per
// CLAUDE.md: a failure is a `throw new Error` with want/got.

const readme = Deno.readTextFileSync(new URL("./README.md", import.meta.url));

const patterns = new Set<string>();
for (const line of readme.split("\n")) {
  if (!line.startsWith("| `")) continue;
  const firstCell = line.split("|")[1] ?? "";
  for (const m of firstCell.matchAll(/`([^`]*_test\.ts)`/g)) patterns.add(m[1]);
}

const toRegExp = (glob: string): RegExp =>
  new RegExp("^" + glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$");

const files: string[] = [];
for (const e of Deno.readDirSync(new URL(".", import.meta.url))) {
  if (e.isFile && e.name.endsWith("_test.ts")) files.push(e.name);
}

Deno.test("every tests/*_test.ts matches a family row in tests/README.md", () => {
  if (patterns.size === 0) throw new Error("tests/README.md has no family rows");
  const res = [...patterns].map(toRegExp);
  const orphans = files.filter((f) => !res.some((r) => r.test(f))).sort();
  if (orphans.length > 0) {
    throw new Error(
      `want every test file named by a family row in tests/README.md, got no row for:\n  ${orphans.join("\n  ")}`,
    );
  }
});

Deno.test("every family pattern in tests/README.md matches a file", () => {
  const dead = [...patterns].filter((p) => {
    const r = toRegExp(p);
    return !files.some((f) => r.test(f));
  });
  if (dead.length > 0) {
    throw new Error(`want each README pattern to match a file, got none for: ${dead.join(", ")}`);
  }
});
