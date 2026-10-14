// The comment, kind-ladder and sentinel-index ratchets target `compiler/entry.vl`, and
// scripts/lint-self.sh grades them with `--findings` over its compiler-graph run. Both
// count only the modules entry.vl's imports reach, so a compiler/*.vl file outside that
// closure would leave all three ratchets without a word. This holds the closure whole.
// Pure: it reads source text, so it runs in the `ci` job without a seed.

import { ROOT } from "./support/tree.ts";

const BASELINES = [
  "scripts/comment-budget-baseline.json",
  "scripts/ladder-budget-baseline.json",
  "scripts/sentinel-budget-baseline.json",
];

/** Every compiler module reachable from `start` through relative `from "./x"` imports. */
function closure(start: string): Set<string> {
  const seen = new Set<string>();
  const todo = [start];
  while (todo.length > 0) {
    const name = todo.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const src = Deno.readTextFileSync(`${ROOT}/compiler/${name}`);
    for (const m of src.matchAll(/\bfrom\s+"\.\/([A-Za-z0-9_]+)(?:\.vl)?"/g)) {
      todo.push(`${m[1]}.vl`);
    }
  }
  return seen;
}

Deno.test("budget targets: compiler/entry.vl's import closure is every compiler/*.vl", () => {
  const all = [...Deno.readDirSync(`${ROOT}/compiler`)]
    .filter((e) => e.isFile && e.name.endsWith(".vl"))
    .map((e) => e.name);
  if (all.length < 10) throw new Error(`found only ${all.length} compiler/*.vl files`);
  const reached = closure("entry.vl");
  const outside = all.filter((f) => !reached.has(f)).sort();
  if (outside.length > 0) {
    throw new Error(
      `these compiler modules are not imported from compiler/entry.vl, so the ratchets ` +
        `targeting it never count them:\n  ${outside.join("\n  ")}\n` +
        `Import them, or add them to each baseline's \`targets\` and to lint-self.sh's graph run.`,
    );
  }
});

Deno.test("budget targets: the graph-counted baselines target compiler/entry.vl", () => {
  for (const path of BASELINES) {
    const b = JSON.parse(Deno.readTextFileSync(`${ROOT}/${path}`)) as { targets?: string[] };
    const want = JSON.stringify(["compiler/entry.vl"]);
    const got = JSON.stringify(b.targets ?? []);
    if (got !== want) {
      throw new Error(
        `${path} targets ${got}, want ${want}: scripts/lint-self.sh counts it with ` +
          `--findings over the entry's graph run, which reports nothing else`,
      );
    }
  }
});
