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
  if (all.length < 10) {
    throw new Error(`found only ${all.length} compiler/*.vl files`);
  }
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
    const b = JSON.parse(Deno.readTextFileSync(`${ROOT}/${path}`)) as {
      targets?: string[];
    };
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

// arena-scan and interp are counted with `--findings` over lint-self.sh's joined reports:
// the compiler graph, `std/`, and (interp only) `scripts/` linted with the baseline's own
// `exclude` globs, which lint-self reads from the baseline's one-line `"exclude"` key.
const JOINED: Record<string, string[]> = {
  "scripts/scan-budget-baseline.json": ["compiler/entry.vl", "std"],
  "scripts/interp-budget-baseline.json": [
    "compiler/entry.vl",
    "std",
    "scripts",
  ],
};

Deno.test("budget targets: the joined-report baselines target what lint-self.sh lints", () => {
  for (const [path, want] of Object.entries(JOINED)) {
    const text = Deno.readTextFileSync(`${ROOT}/${path}`);
    const b = JSON.parse(text) as { targets?: string[]; exclude?: string[] };
    const got = JSON.stringify(b.targets ?? []);
    if (got !== JSON.stringify(want)) {
      throw new Error(
        `${path} targets ${got}, want ${
          JSON.stringify(want)
        }: scripts/lint-self.sh ` +
          `counts it with --findings over exactly those runs`,
      );
    }
    const excl = b.exclude ?? [];
    if (path.includes("interp")) {
      const line = text.split("\n").find((l) => l.startsWith('"exclude": ['));
      const parsed = line === undefined ? [] : line
        .replace(/^"exclude": \[(.*)\],?$/, "$1").split(",")
        .map((s) => s.trim().replace(/^"|"$/g, ""));
      if (
        excl.length === 0 || JSON.stringify(parsed) !== JSON.stringify(excl)
      ) {
        throw new Error(
          `${path}: lint-self.sh reads the exclude globs ${
            JSON.stringify(parsed)
          } ` +
            `from its one-line "exclude" key, but the baseline holds ${
              JSON.stringify(excl)
            }`,
        );
      }
    } else if (excl.length > 0) {
      throw new Error(
        `${path}: lint-self.sh's graph and std/ runs apply no exclude globs`,
      );
    }
  }
});
