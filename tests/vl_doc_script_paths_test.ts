// A DOC THAT NAMES A SCRIPT NAMES ONE THAT EXISTS.
//
// The Python-removal and kill-TS lanes deleted dozens of `scripts/` tools, and the docs
// that told a reader to run them kept doing so: a reader following `scripts/foo.py --check`
// found nothing, with no hint of what replaced it. This test reads every Markdown file and
// fails on a `scripts/<path>` mention that resolves to no file or directory.
//
// A mention of a tool that is GONE is fine when the line says so — `deleted`, `retired`,
// `removed`, `replaced`, `ported`, `never committed`, or `binaryen` (whose own
// `scripts/fuzz_opt.py` is not ours). A dated snapshot whose command blocks record what was
// run on its date carries `<!-- paths-as-of: <date> -->` instead, next to a note naming
// what replaced each tool. No assertion library, per CLAUDE.md.

// History by construction: the changelog, the one-file-per-row inventories (each row's
// witness and record are dated), and the Python-removal ledger, which names planned ports.
const SKIP_FILE = [/^CHANGELOG\.md$/, /^docs\/internals\/inventory(-2)?\/D[^/]*\.md$/, /^docs\/internals\/python-removal\.md$/];
const SKIP_DIR = new Set([".git", ".claude", "node_modules", "target", "build", "reference", "cells", "named"]);
const MENTION = /(?<![A-Za-z0-9_./-])scripts\/[A-Za-z0-9_./*{},<>-]*[A-Za-z0-9_*}>]/g;
// A glob or a placeholder (`scripts/p7-*`, `named/d199_*.vl`, `<name>`) names a family, not a file.
const PATTERN = /[*{<]/;
const HISTORICAL = /\b(deleted|retired?|removed|replaced|ported|never committed|binaryen)\b/i;
const DATED = /<!--\s*paths-as-of:\s*\d{4}-\d{2}-\d{2}\s*-->/;

function markdownFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of Deno.readDirSync(dir || ".")) {
      const p = dir ? `${dir}/${e.name}` : e.name;
      if (e.isDirectory) {
        if (!SKIP_DIR.has(e.name)) walk(p);
      } else if (e.isFile && p.endsWith(".md") && !SKIP_FILE.some((r) => r.test(p))) {
        out.push(p);
      }
    }
  };
  walk("");
  return out.sort();
}

function exists(p: string): boolean {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
}

Deno.test("every scripts/ path a doc names exists, or the line says it is gone", () => {
  const dangling: string[] = [];
  let mentions = 0;
  for (const f of markdownFiles()) {
    const text = Deno.readTextFileSync(f);
    if (DATED.test(text)) continue;
    text.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(MENTION)) {
        mentions++;
        if (!PATTERN.test(m[0]) && !exists(m[0]) && !HISTORICAL.test(line)) dangling.push(`${f}:${i + 1}: ${m[0]}`);
      }
    });
  }
  if (mentions < 500) {
    throw new Error(`want at least 500 scripts/ mentions scanned (the walk found the docs), got ${mentions}`);
  }
  if (dangling.length > 0) {
    throw new Error(
      `want every scripts/ path named in a doc to exist, got ${dangling.length} that do not — ` +
        `repoint each to the current tool, or say on its line that it was deleted/retired/replaced:\n  ` +
        dangling.join("\n  "),
    );
  }
});

// A control: the matcher must see a dangling path, or a green run means nothing.
Deno.test("the scripts/ path matcher sees a dangling path and honours the historical words", () => {
  const got = [..."run `scripts/no-such-tool.py --check` now".matchAll(MENTION)].map((m) => m[0]);
  if (got.join() !== "scripts/no-such-tool.py") throw new Error(`want [scripts/no-such-tool.py], got [${got}]`);
  if (exists(got[0])) throw new Error(`want ${got[0]} absent, got present`);
  if (HISTORICAL.test("run `scripts/no-such-tool.py --check` now")) throw new Error("want a live line, got historical");
  if (!HISTORICAL.test("the retired `scripts/ratchet.py`")) throw new Error("want historical, got live");
});
