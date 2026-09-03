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
// not be parsed at all — it wrote every program with no `Repro:` lead-in, which is why the
// fallback existed and is now why all 16 of its unlabelled rows carry one — so none of its
// 14 was ever graded, and the first grading reported 9 MOVED + 2 ungradeable, fixed long ago
// and still filed as live. A gate that reds for pre-existing debt in a file the author is
// not editing gets bypassed rather than obeyed, so the debt was closed FIRST — ten rows
// re-graded to CLOSED against their measured behaviour, D3 given the `// PRINTS` line the
// grader needs, D14 given the witness it had never had.
//
// Adding an inventory here is cheap and it is the point: this test is what stops a NEW row
// landing without a runnable witness. An inventory of this shape that is not in this list is
// enforced by nothing.

// ONE FILE PER ROW. The inventories are `docs/internals/inventory/D1042.md` and friends:
// every defect PR appended to one file's tail, so two concurrent PRs conflicted there
// nearly every hour, once splicing two rows into the middle of a third. This reads a
// DIRECTORY of one-row files, and a directory holding none yet falls back to the monolith
// named in its own README — the same rule `check-filed-witnesses.py`'s `resolve` applies,
// and read from the same marker line, so the two cannot answer differently while the split
// is in flight. Two directories, not one: the inventories number independently and D1..D14
// exist in both, which is also why the duplicate-id check below is per document.
const DIRS = [
  "docs/internals/inventory",
  "docs/internals/inventory-2",
];
const CHECKER = "scripts/check-filed-witnesses.py";
const SOURCE_MARK = /^<!--\s*inventory-split:\s*source\s+(\S+)\s*-->\s*$/m;

/** The docs a directory stands for: its `D*.md` rows, or the monolith it came from. */
async function docsOf(dir: string): Promise<string[]> {
  const rows: string[] = [];
  try {
    for await (const e of Deno.readDir(dir)) {
      if (e.isFile && /^D\d.*\.md$/.test(e.name)) rows.push(`${dir}/${e.name}`);
    }
  } catch {
    throw new Error(`${dir}: not readable — the inventory directory must exist`);
  }
  if (rows.length > 0) {
    return rows.sort((a, b) =>
      Number(a.match(/D(\d+)/)![1]) - Number(b.match(/D(\d+)/)![1]) || a.localeCompare(b)
    );
  }
  const readme = await Deno.readTextFile(`${dir}/README.md`);
  const m = SOURCE_MARK.exec(readme);
  if (m === null) {
    throw new Error(
      `${dir}: holds no D*.md rows and ${dir}/README.md carries no ` +
        `\`<!-- inventory-split: source ... -->\` line to fall back to`,
    );
  }
  return [m[1]];
}

// `### D12 — title` / `## A1 - title`, the same shape `check-filed-witnesses.py`'s `SEC`
// matches. Analysis sections (`### Root A — …`) are deliberately NOT rows and are not
// matched by either, so this cannot red on a heading that was never a defect.
//
// THE SUFFIX GRAMMAR IS WHATEVER AUTHORS REACHED FOR — `D661A`, `D804b`, `D1009-N` — and
// the python was widened for the hyphen while this copy was not, so `D1009-N` was a row
// this test could not see: it would have accepted that row with no `Repro:` label at all.
// `ROWHEAD` is the audit the widening cannot replace — count the POPULATION of row-shaped
// headings and fail on any `SEC` misses, so the next id shape nobody anticipated reds
// instead of vanishing. A parser that silently drops what it does not recognise cannot be
// checked by reading its output.
const SEC = /^#{2,4}\s+(D\d+(?:-?[A-Za-z][A-Za-z0-9]*)?|[A-Z]\d+)\s+[—-]\s+(.*)$/;
const ROWHEAD = /^#{2,4}\s+D\d/;
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

// THE `Repro:` LABEL IS THE ONLY WAY IN, and that is now a rule about SHAPE rather than a
// guess about content. A row's first indented block used to stand in for a missing label,
// and prose is indented too — a numbered list's continuation lines are five spaces in,
// which is correct Markdown — so "the first indented block after the status line" handed
// D957's grader an English witness, `vl check` called it a parse error, the row's declared
// `check reject` matched, and `--strict` passed on a program nobody wrote. This test once
// carried a "looks like VL" predicate to tell the two apart; labelling the 25 rows that
// relied on the fallback retired the rule that needed it, so the predicate is gone and a
// block with no label is simply not a repro. The grader stays the behavioural half: a
// LABELLED paragraph still parses to nothing, and only running it says so.
const REPRO = /^Repro\b/;
const SCAN = 6; // the grader's `block_at` window, in lines past the lead-in

/** `block_at` mirrored: does the `Repro` lead-in at `at` introduce a non-empty program?
 * A row this calls gradeable must be one the grader reports the same way, and the lead-in
 * may WRAP onto prose before its block (D16 does), so the scan is bounded, not immediate. */
function blockFollows(lines: string[], at: number): boolean {
  let j = at + 1;
  for (
    let n = 0;
    j < lines.length && n < SCAN && !lines[j].startsWith("    ") &&
    !/^#{2,4}\s/.test(lines[j]);
    n++
  ) j++;
  for (; j < lines.length && (lines[j].startsWith("    ") || lines[j].trim() === ""); j++) {
    if (lines[j].trim() !== "") return true;
  }
  return false;
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
    // non-empty indented block actually follows it within its scan window, so requiring the
    // label alone here would pass a row the grader reports as `no Repro block` — the exact
    // drift this test exists to prevent. Found by sabotage: deleting a row's program while
    // leaving its `Repro (…):` line made this pass and the grader fail.
    if (!cur.hasRepro && REPRO.test(ln)) {
      cur.sawReproLabel = true;
      cur.hasRepro = blockFollows(lines, i);
    }
  }
  if (cur) rows.push(cur);
  return rows;
}

Deno.test("every filed inventory row carries a witness the checker can run", async () => {
  const phrases = vocabulary(await Deno.readTextFile(CHECKER));
  const bad: string[] = [];
  let total = 0;

  const ids: Array<[string, string, string]> = [];
  for (const dir of DIRS) {
    for (const doc of await docsOf(dir)) {
      // ONE FILE PER ROW MEANS THE FILE NAME IS PART OF THE ROW. Everything that cites a
      // row by id resolves it as `<dir>/D<id>.md`, so a file whose heading disagrees with
      // its stem is a row nothing can find — and it is the failure a rename makes.
      const stem = doc.match(/\/(D\d[^/]*)\.md$/)?.[1];
      const text = await Deno.readTextFile(doc);
      // The POPULATION of row-shaped headings, against what `SEC` actually parsed. A row
      // this cannot see is in no check above — not its status, not its repro, not its id.
      text.split("\n").forEach((ln, n) => {
        if (ROWHEAD.test(ln) && !SEC.test(ln)) {
          bad.push(
            `${doc}:${n + 1}  — row heading this parser did NOT recognise, so the row is ` +
              `in no check above\n      want: \`SEC\` to match every \`### D…\` heading\n` +
              `      got:  ${JSON.stringify(ln.trim().slice(0, 90))}. Widen \`SEC\`'s id ` +
              `pattern to admit the suffix (and \`check-filed-witnesses.py\`'s), or ` +
              `rename the row.`,
          );
        }
      });
      for (const r of parseRows(text)) {
        total++;
        ids.push([dir, r.id, `${doc}:${r.line}`]);
        if (stem !== undefined && stem !== r.id) {
          bad.push(
            `${doc}:${r.line}  ${r.id} — file name and row id disagree\n` +
              `      want: the heading id to equal the file stem\n` +
              `      got:  heading ${r.id}, file ${stem}.md`,
          );
        }
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
              `      want: a \`Repro:\` line with an indented program under it\n` +
              `      got:  ${
                r.sawReproLabel
                  ? "a `Repro:` label with no indented block under it. The label is not " +
                    "the witness — the grader reports the row as `no Repro block`."
                  : "no `Repro:` label. An indented block alone is NOT a witness: that " +
                    "fallback was retired, because prose is indented too and D957 graded " +
                    "on an English paragraph for weeks."
              }`,
          );
        }
      }
    }
  }

  // A DUPLICATE ROW ID IS INVISIBLE TO EVERY OTHER INSTRUMENT, and it reached master on
  // 2026-08-30. Two agents working concurrently each filed a `D626`; both landed, and
  // `check-filed-witnesses.py --strict` reported `192 graded · 192 as filed · 0 MOVED ·
  // 0 not graded` — because a duplicate id is not an ungradeable row. Both rows graded
  // fine INDIVIDUALLY. What breaks is everything that refers to a row BY ITS NUMBER:
  // a brief, a CHANGELOG entry, a `named/` set, the next agent told to "read D626".
  //
  // PER INVENTORY, not across both: the two number independently and each has its own D1,
  // D2, D3. A global check reds 14 rows that are correct, which is how this check was first
  // written and what running it caught. On the split form the key is the DIRECTORY, not the
  // file — one file per row would otherwise make every id trivially unique and the check
  // vacuous exactly when it starts to matter, since two PRs can now each add a `D626.md`.
  //
  // Cheap and structural, so it belongs here rather than in the python.
  const seen = new Map<string, string>();
  for (const [doc, id, where] of ids) {
    const prior = seen.get(`${doc}\u0000${id}`);
    if (prior !== undefined) {
      bad.push(
        `${where}  ${id} — DUPLICATE row id, already filed at ${prior}\n` +
          `      want: every \`### <ID>\` unique across both inventories\n` +
          `      got:  ${id} twice. Renumber the later one; do NOT renumber the earlier, ` +
          `other files cite it.`,
      );
    } else {
      seen.set(`${doc}\u0000${id}`, where);
    }
  }

  if (total === 0) {
    throw new Error(
      `parsed 0 rows from ${DIRS.join(", ")} — the heading shape moved and this test ` +
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

// THE LABEL RULE, SEEN TO FIRE — on specimens whose answer is known by construction, the
// same discipline `check-filed-witnesses.py --self-test` applies to the outcome vocabulary.
// A rule that has never rejected anything is not known to reject anything, and the test
// above cannot show it: every filed row passes, so a rule that accepted everything would
// look identical. The retired fallback is a specimen here, so it stays retired. In process,
// no files planted, no compiler.
const SHAPE_SPECIMENS: Array<[string, boolean, string]> = [
  ["a plain VL witness", true, "Repro:\n\n    print(6 * 7)\n"],
  ["prose alone", false, "  1. **Why.** `i32[]`,\n     `boolean[]` share one kind, and\n"],
  ["prose ABOVE a real block", true, "  1. **Why.** `i32[]`,\n     `boolean[]` share it\n" +
    "\nRepro:\n\n    print(6 * 7)\n"],
  ["a `// directive` first line", true, "Repro:\n\n    // @hint x\n    print(1)\n"],
  // THE RETIRED FALLBACK, pinned: a perfectly good program with no label is not a witness.
  ["an unlabelled program block", false, "\n    print(6 * 7)\n"],
  // ... and the label alone is not one either, which is what makes the rule about the BLOCK.
  ["a `Repro:` label with no block", false, "Repro (prints 42):\n\nand then prose.\n"],
  ["a parenthesised lead-in", true, "Repro (now runs, printing `42`):\n\n    print(6 * 7)\n"],
];

Deno.test("only a labelled indented block counts as a repro", () => {
  const bad: string[] = [];
  for (const [name, want, body] of SHAPE_SPECIMENS) {
    const text = `### D1 — specimen\n**closed**\n\n${body}`;
    const rows = parseRows(text);
    if (rows.length !== 1) {
      bad.push(`${name}: want 1 parsed row, got ${rows.length}`);
      continue;
    }
    if (rows[0].hasRepro !== want) {
      bad.push(`${name}: want hasRepro ${want}, got ${rows[0].hasRepro}`);
    }
  }
  if (bad.length > 0) {
    throw new Error(`the repro-shape rule misroutes:\n  ${bad.join("\n  ")}`);
  }
});
