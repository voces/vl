// THE ROW DISCIPLINE, ENFORCED — every filed defect row carries a witness the checker can RUN.
//
// `scripts/check-filed-witnesses.py` exists because a defect inventory goes stale in ONE
// direction: a fixed defect keeps reading as live. It re-runs each row's own program and
// reports which no longer behave as filed. But it had a hole, and the hole was the shape of
// the defects it was written to catch — A REAL CONDITION THAT NO INSTRUMENT REPORTED:
//
//   * a row with no `Repro:` block, or a status line naming no outcome the grader knows,
//     is reported in a FOURTH column as `not graded` — and the script exits 0 anyway.
//   * so `92 graded · 92 as filed · 0 MOVED · 2 not graded` and `... · 0 not graded` are
//     the same exit code, and a summary quoting the first three numbers reads identically.
//   * nothing else in the gate ladder looks at inventories at all, so a PR could add rows
//     with no runnable witness and every gate stayed green. The discipline was enforced by
//     nothing.
//
// This is the enforcement, and it is deliberately the CHEAP half: it asserts the STRUCTURE
// a gradeable row must have and never runs a program, so it costs milliseconds, needs no
// compiler and no python, and can therefore sit in `deno task test` where it is seen on
// every PR. The BEHAVIOURAL half — does the witness still do what the row says — stays in
// `check-filed-witnesses.py --strict`, which is slower (it compiles and runs ~100 programs)
// and is the manual gate CLAUDE.md names.
//
// THE VOCABULARY IS READ OUT OF THE PYTHON, NOT RE-SPELLED HERE. Two copies of a list like
// this drift, and the drift is silent in exactly the direction that matters: a status word
// the script accepts and this test does not would red the tree for a correct row, and one
// this accepts and the script does not would let an ungradeable row through — which is the
// hole being closed. One source of truth, parsed.
//
// No assertion library, per CLAUDE.md: every failure below is a `throw new Error` naming
// want and got.

// BOTH INVENTORIES. Inventory #2 was held out until 2026-08-27: until #1966 its rows could
// not be parsed at all (it writes the program with no `Repro:` lead-in), so none of its 14
// was ever graded, and the first grading reported 9 MOVED + 2 ungradeable — fixed long ago,
// still filed as live. A gate that reds for pre-existing debt in a file the author is not
// editing gets bypassed rather than obeyed, so the debt was closed FIRST — ten rows re-graded
// to CLOSED against their measured behaviour, D3 given the `// PRINTS` line the grader needs,
// D14 given the witness it had never had — and the doc admitted here in the same change. Both
// now report `... · 0 MOVED · 0 not graded` under `--strict`.
//
// Adding a doc here is cheap and it is the point: this test is what stops a NEW row landing
// without a runnable witness. A doc of this shape that is not in this list is enforced by
// nothing.
const DOCS = [
  "docs/internals/silent-class-inventory.md",
  "docs/internals/silent-class-inventory-2.md",
];
const CHECKER = "scripts/check-filed-witnesses.py";

// `### D12 — title` / `## A1 - title`, the same shape `check-filed-witnesses.py`'s `SEC`
// matches. Analysis sections (`### Root A — …`) are deliberately NOT rows and are not
// matched by either, so this cannot red on a heading that was never a defect.
const SEC = /^#{2,4}\s+(D\d+[A-Za-z]?|[A-Z]\d+)\s+[—-]\s+(.*)$/;
// ANY heading, row or not — a row's scope must END at one. `SEC` alone only closes a row at
// the NEXT ROW, so the last row of a doc absorbed everything after it, including the whole
// of `## 3. Shared-root analysis`. Found by sabotage: deleting a row's repro outright left
// it still reporting as gradeable, because an indented block far below stood in for it.
const ANYHEAD = /^#{1,6}\s/;

/** The declared-status vocabulary, read from the grader so the two cannot drift. */
function vocabulary(src: string): string[] {
  const block = src.split("DECLARED = [")[1];
  if (block === undefined) {
    throw new Error(
      `${CHECKER}: no \`DECLARED = [\` list found — the status vocabulary moved, and this ` +
        `test reads it from there so the two cannot drift. Update the parse.`,
    );
  }
  const phrases = [...block.split("\n]")[0].matchAll(/\(\s*"([^"]+)"/g)].map((m) => m[1]);
  if (phrases.length === 0) {
    throw new Error(`${CHECKER}: parsed \`DECLARED\` but found no phrases in it`);
  }
  return phrases;
}

type Row = {
  id: string;
  title: string;
  line: number;
  status?: string;
  sawReproLabel: boolean;
  hasRepro: boolean;
};

/** Rows and the two properties that make one gradeable — the grader's own rules. */
function parseRows(text: string): Row[] {
  const lines = text.split("\n");
  const rows: Row[] = [];
  let cur: Row | undefined;
  for (let i = 0; i < lines.length; i++) {
    const m = SEC.exec(lines[i]);
    if (m) {
      if (cur) rows.push(cur);
      cur = {
        id: m[1],
        title: m[2].trim(),
        line: i + 1,
        sawReproLabel: false,
        hasRepro: false,
      };
      continue;
    }
    if (ANYHEAD.test(lines[i])) {
      if (cur) rows.push(cur);
      cur = undefined;
      continue;
    }
    if (!cur) continue;
    const ln = lines[i];
    // A status line may WRAP onto a second line and still be a status line — the grader
    // joins it, so this must too or the two disagree about which rows are gradeable.
    if (cur.status === undefined && ln.startsWith("**")) {
      if (ln.trimEnd().endsWith("**") && ln.trimEnd().length > 2) {
        cur.status = ln.replaceAll("*", "").trim();
      } else {
        const parts = [ln];
        for (let k = i + 1; k < lines.length && k - i <= 5; k++) {
          parts.push(lines[k]);
          if (lines[k].trimEnd().endsWith("**")) {
            cur.status = parts.join(" ").replaceAll("*", "").trim();
            break;
          }
          if (lines[k].trim() === "") break;
        }
      }
    }
    // THE LABEL IS NOT THE WITNESS. The grader only accepts a `Repro:` lead-in when a
    // non-empty indented block actually follows it (`if src.strip()`), so requiring the
    // label alone here would pass a row the grader reports as `no Repro block` — the exact
    // drift this test exists to prevent. Found by sabotage: deleting a row's program while
    // leaving its `Repro (…):` line made this pass and the grader fail.
    if (/^Repro\b/.test(ln)) cur.sawReproLabel = true;
    if (
      !cur.hasRepro &&
      (cur.sawReproLabel || cur.status !== undefined) &&
      ln.startsWith("    ") &&
      ln.trim() !== ""
    ) {
      cur.hasRepro = true;
    }
  }
  if (cur) rows.push(cur);
  return rows;
}

Deno.test("every filed inventory row carries a witness the checker can run", async () => {
  const phrases = vocabulary(await Deno.readTextFile(CHECKER));
  const bad: string[] = [];
  let total = 0;

  for (const doc of DOCS) {
    for (const r of parseRows(await Deno.readTextFile(doc))) {
      total++;
      const status = (r.status ?? "").toLowerCase();
      if (!phrases.some((p) => status.includes(p))) {
        bad.push(
          `${doc}:${r.line}  ${r.id} — status line names no known outcome\n` +
            `      want: a status containing one of [${phrases.join(", ")}]\n` +
            `      got:  ${r.status ?? "(no **bold** status line at all)"}`,
        );
      }
      if (!r.hasRepro) {
        bad.push(
          `${doc}:${r.line}  ${r.id} — no repro block\n` +
            `      want: a \`Repro:\` block, or an indented program after the status line\n` +
            `      got:  neither`,
        );
      }
    }
  }

  if (total === 0) {
    throw new Error(
      `parsed 0 rows from ${DOCS.join(", ")} — the heading shape moved and this test ` +
        `would now pass vacuously. want: > 0 rows, got: 0`,
    );
  }
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} filed row(s) cannot be graded by ${CHECKER}, so they are prose ` +
        `rather than witnesses:\n  ${bad.join("\n  ")}\n\n` +
        `A defect reachable only under a change that was REFUSED is a refutation pin: ` +
        `file the program that must keep RUNNING, with the status ` +
        `\`runs today and must keep running\`.`,
    );
  }
});
