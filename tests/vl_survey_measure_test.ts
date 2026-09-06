// THE SURVEY'S NUMBERS MUST BE RE-RUNNABLE — the structural half, on every PR.
//
// `docs/internals/code-quality-survey-2026-09/` is a scheduling document made of numbers,
// and it decayed exactly the way a defect inventory does: one-directionally, because the
// person who lands a fix is not the person editing the survey. Two live instances, both
// found 2026-09-06 by an agent reading the page to pick its next lane — row 8 said
// "campaign" for an index #2607 had already built, and row 7 named `letListBuildKind` and
// `letListBuildSlot`, which #2567 merged into `letListBuild` (16% -> 1.58% inclusive).
//
// `scripts/survey-regrade.py` re-runs each row's `Measure:` block. This is the CHEAP half
// of that discipline, the same split `tests/vl_inventory_rows_test.ts` makes: it asserts
// the STRUCTURE a re-runnable row must have and never runs a command or reads a profile,
// so it costs milliseconds, needs no python and no compiler, and rides `deno task test`
// where every PR sees it. The behavioural half is the `survey measurements` gate row.
//
// THE KIND VOCABULARY IS READ OUT OF THE PYTHON, not re-spelled here. Two copies drift, and
// the drift is silent in the direction that matters: a kind the script accepts and this
// rejects reds a correct row, and one this accepts and the script rejects lets an
// ungradeable row through, which is the hole being closed.
//
// No assertion library, per CLAUDE.md: every failure is a `throw new Error` naming want/got.

import { ROOT } from "./support/tree.ts";

const DOC = `${ROOT}/docs/internals/code-quality-survey-2026-09/README.md`;
const SCRIPT = `${ROOT}/scripts/survey-regrade.py`;

// `### row 7 — title`. The ranking tables above use `| 7 |` cells, which cannot hold a
// block, so the blocks live in their own section keyed by the same row number.
const ROWHEAD = /^###\s+row\s+(\d+)\b/;
// A ranked row in one of the three tranche tables: `| 12 | finding | where | ... |`.
const TABLEROW = /^\|\s*(\d+)\s*\|/;
const LEAD = /^Measure:\s*$/;

/** The `KINDS` tuple from the grader, so the two cannot answer differently. */
function kinds(src: string): string[] {
  const m = /KINDS = \(([^)]*)\)/.exec(src);
  if (m === null) {
    throw new Error(
      `${SCRIPT}: no \`KINDS = (\` tuple found — the vocabulary moved, and this test reads ` +
        `it from there so the two cannot drift. Update the regex or restore the tuple.`,
    );
  }
  const out = [...m[1].matchAll(/"([^"]+)"/g)].map((k) => k[1]);
  if (out.length === 0) throw new Error(`${SCRIPT}: \`KINDS\` parsed to an empty list`);
  return out;
}

/** Every `### row N` heading with the `Measure:` block under it, parsed as the grader does. */
function blocks(lines: string[]): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>();
  for (let i = 0; i < lines.length; i++) {
    const h = ROWHEAD.exec(lines[i]);
    if (h === null) continue;
    let body: Record<string, string> | null = null;
    for (let j = i + 1; j < lines.length && ROWHEAD.exec(lines[j]) === null; j++) {
      if (!LEAD.test(lines[j])) continue;
      body = {};
      for (let k = j + 1; k < lines.length; k++) {
        if (lines[k].trim() === "") continue;
        if (!lines[k].startsWith("    ")) break;
        const t = lines[k].trim();
        const c = t.indexOf(":");
        if (c > 0) body[t.slice(0, c).trim()] = t.slice(c + 1).trim();
      }
      break;
    }
    if (body !== null) out.set(h[1], body);
    else out.set(h[1], {});
  }
  return out;
}

Deno.test("survey: every ranked row carries a parseable Measure: block", async () => {
  const src = await Deno.readTextFile(DOC);
  const lines = src.split("\n");
  const known = kinds(await Deno.readTextFile(SCRIPT));
  const found = blocks(lines);

  // THE POPULATION IS THE RANKING TABLES, not the blocks — a row that has no block at all
  // is invisible to a check that enumerates blocks, which is the whole failure mode.
  const ranked = new Set<string>();
  for (const l of lines) {
    const m = TABLEROW.exec(l);
    if (m !== null) ranked.add(m[1]);
  }
  if (ranked.size < 20) {
    throw new Error(
      `the premise of this test is that the survey ranks 20 rows in three tranche tables; ` +
        `found ${ranked.size} numbered table rows — did the tables change shape?`,
    );
  }

  const bad: string[] = [];
  for (const n of [...ranked].sort((a, b) => Number(a) - Number(b))) {
    const b = found.get(n);
    if (b === undefined) {
      bad.push(`row ${n}: ranked in a tranche table but has no \`### row ${n}\` block`);
      continue;
    }
    if (Object.keys(b).length === 0) {
      bad.push(`row ${n}: has a heading but no \`Measure:\` block under it`);
      continue;
    }
    const kind = b["kind"];
    if (kind === undefined || !known.includes(kind)) {
      bad.push(`row ${n}: kind is ${JSON.stringify(kind)}, want one of ${known.join("/")}`);
      continue;
    }
    if (kind === "none") {
      if (!b["why"]) bad.push(`row ${n}: kind: none must say \`why:\` no number is re-runnable`);
      continue;
    }
    if (b["filed"] === undefined || Number.isNaN(Number(b["filed"]))) {
      bad.push(`row ${n}: filed: is ${JSON.stringify(b["filed"])}, want a number`);
    }
    if (b["tol"] !== undefined && Number.isNaN(Number(b["tol"]))) {
      bad.push(`row ${n}: tol: is ${JSON.stringify(b["tol"])}, want a number`);
    }
    if (b["dir"] !== undefined && !["both", "at-most", "at-least"].includes(b["dir"])) {
      bad.push(`row ${n}: dir: is ${JSON.stringify(b["dir"])}, want both/at-most/at-least`);
    }
    if (kind === "shell" && !b["cmd"]) bad.push(`row ${n}: kind: shell needs a \`cmd:\``);
    if (kind.startsWith("profile-") && !b["what"]) {
      bad.push(`row ${n}: kind: ${kind} needs a \`what:\` naming a function`);
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} survey row(s) carry a number nothing can re-read:\n  ` +
        bad.join("\n  ") +
        `\n\nGive the row a \`Measure:\` block under a \`### row N\` heading in the ` +
        `Measurements section, or \`kind: none\` with a \`why:\` naming the gate that does ` +
        `grade it. See scripts/survey-regrade.py.`,
    );
  }
});
