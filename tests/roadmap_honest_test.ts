// THE ROADMAP STAYS AN INDEX OF OPEN WORK.
//
// ROADMAP.md rotted five times the same way: done markers left where the entry should
// have been deleted, citations of defects long closed, effort estimates, and links to docs
// that had moved. This reads ROADMAP.md and the track docs under docs/roadmap/ and fails on
// each of those. It runs no compiler, and it does not count lines (owner, 2026-10-26: size
// is a symptom). No assertion library, per CLAUDE.md.

const ROOT = new URL("..", import.meta.url).pathname;
const INVENTORIES = ["docs/internals/inventory", "docs/internals/inventory-2"];
const TRACK_DIR = "docs/roadmap";

// A row heading, as tests/vl_inventory_refs_test.ts reads it, widened to five digits.
const HEAD = /^#{2,4}\s+(D\d{1,5}(?:-?[A-Za-z][A-Za-z0-9]*)?)\b/;
const ANY_HEAD = /^#{1,6}\s/;
const CITE = /(?<![A-Za-z0-9_])D(\d{1,5})(?![0-9A-Za-z_])/g;

// scripts/inventory/ls.vl's `--status closed`, ported: the outcome is `runs`, or the
// status's first clause says closed/fixed/resolved/ruled un-negated. One deviation: a
// status with a clause that is just `open` is open. D4000 files `runs today and must keep
// running · open` because it is a cost row, and ls.vl counts it closed.
const NEEDLES: [string, string][] = [
  ["now a loud check reject", "check_reject"],
  ["now a loud emit reject", "emit_reject"],
  ["runs today and must keep running", "runs"],
  ["closed", "runs"],
  ["loads then traps", "trap_loads"],
  ["trap after load", "trap_loads"],
  ["check-clean invalid wasm", "silent_invalid_wasm"],
  ["check-clean silently wrong", "silent_wrong_value"],
  ["check-clean wrong evaluation", "silent_wrong_evalcount"],
  ["compiler trap", "compiler_trap"],
  ["loud emit reject", "emit_reject"],
  ["loud check reject", "check_reject"],
];
const NEGATIONS = [
  " not ",
  " never ",
  " no longer ",
  " isn't ",
  " is not ",
  " nor ",
  " rather than ",
];
const CLAUSE_SEPS = [".", ";", "·", "—", ","];
const SETTLED_WORDS = ["closed", "fixed", "resolved", "ruled"];
const WORD_BYTE = /[A-Za-z0-9_-]/;

function negatedBefore(low: string, pos: number): boolean {
  let w = low.slice(0, pos);
  for (const sep of CLAUSE_SEPS) {
    const cut = w.lastIndexOf(sep);
    if (cut !== -1) w = w.slice(cut + sep.length);
  }
  w = ` ${w} `;
  return NEGATIONS.some((n) => w.includes(n));
}

function outcomeOf(status: string): string {
  const low = status.toLowerCase();
  for (const [needle, outcome] of NEEDLES) {
    const pos = low.indexOf(needle);
    if (pos !== -1) return negatedBefore(low, pos) ? "" : outcome;
  }
  return "";
}

function settled(status: string): boolean {
  let low = status.toLowerCase();
  const cut = low.indexOf(" · ");
  if (cut !== -1) low = low.slice(0, cut);
  for (const w of SETTLED_WORDS) {
    for (
      let at = low.indexOf(w);
      at !== -1;
      at = low.indexOf(w, at + w.length)
    ) {
      const end = at + w.length;
      const before = at === 0 || !WORD_BYTE.test(low[at - 1]);
      const after = end >= low.length || !WORD_BYTE.test(low[end]);
      if (before && after && !negatedBefore(low, at)) return true;
    }
  }
  return false;
}

function saysOpen(status: string): boolean {
  return status.toLowerCase().split(" · ").some((c) =>
    /^(still )?open[.;,]?$/.test(c.trim())
  );
}

function isClosed(status: string): boolean {
  if (saysOpen(status)) return false;
  return outcomeOf(status) === "runs" || settled(status);
}

/** The row's first `**` line, joined across a wrap; else its first bold line; else "". */
function statusOf(body: string[]): string {
  const strip = (s: string) => s.replaceAll("*", "").trim();
  for (let i = 0; i < body.length; i++) {
    const ln = body[i];
    if (!ln.startsWith("**")) continue;
    const r = ln.trimEnd();
    if (r.endsWith("**") && r.length > 2) return strip(ln);
    const parts = [ln];
    for (let k = i + 1; k < body.length; k++) {
      if (
        body[k].trim() === "" || HEAD.test(body[k]) || ANY_HEAD.test(body[k])
      ) break;
      parts.push(body[k]);
      if (body[k].trimEnd().endsWith("**")) return strip(parts.join(" "));
    }
    break;
  }
  const bold = body.find((l) => l.startsWith("**"));
  return bold === undefined ? "" : strip(bold);
}

/** Every inventory row as id -> one closed flag per row bearing that id. */
function rowStates(): Map<string, boolean[]> {
  const out = new Map<string, boolean[]>();
  for (const dir of INVENTORIES) {
    for (const e of Deno.readDirSync(`${ROOT}${dir}`)) {
      if (!e.isFile || !/^D\d.*\.md$/.test(e.name)) continue;
      const lines = Deno.readTextFileSync(`${ROOT}${dir}/${e.name}`).split(
        "\n",
      );
      for (let i = 0; i < lines.length; i++) {
        const m = HEAD.exec(lines[i]);
        if (m === null) continue;
        let j = i + 1;
        while (
          j < lines.length && !HEAD.test(lines[j]) &&
          !/^#{1,2}\s/.test(lines[j])
        ) j++;
        const closed = isClosed(statusOf(lines.slice(i + 1, j)));
        // `D1009-N` also answers to `D1009`: a citation cannot spell the hyphen suffix.
        for (
          const id of new Set([
            m[1],
            m[1].replace(/-[A-Za-z][A-Za-z0-9]*$/, ""),
          ])
        ) {
          (out.get(id) ?? out.set(id, []).get(id)!).push(closed);
        }
        i = j - 1;
      }
    }
  }
  return out;
}

function files(): string[] {
  const out = ["ROADMAP.md"];
  for (const e of Deno.readDirSync(`${ROOT}${TRACK_DIR}`)) {
    if (e.isFile && e.name.endsWith(".md")) out.push(`${TRACK_DIR}/${e.name}`);
  }
  return out.sort();
}

type Line = { file: string; n: number; text: string; bare: string };

/** Each prose line, with fenced blocks skipped and inline code spans blanked in `bare`. */
function proseLines(file: string): Line[] {
  const out: Line[] = [];
  let fenced = false;
  const lines = Deno.readTextFileSync(`${ROOT}${file}`).split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    out.push({
      file,
      n: i + 1,
      text: lines[i],
      bare: lines[i].replace(/`[^`]*`/g, "``"),
    });
  }
  return out;
}

// A word used as a status: bold, a heading, leading a list item, leading a parenthesis, or
// set off by a dash in capitals. Prose ("closes the gap", "landed in #4816") does not match.
const STATUS = "(?:done|shipped|closed|landed)";
const MARKERS: [string, RegExp][] = [
  ["a check-mark emoji", /[✅✔☑]/],
  ["strikethrough `~~`", /~~/],
  ["a bold status word", new RegExp(`\\*\\*\\s*${STATUS}\\b`, "i")],
  [
    "a status word in a heading",
    new RegExp(`^#{1,6}\\s.*\\b${STATUS}\\b`, "i"),
  ],
  [
    "a status word leading a list item",
    new RegExp(`^\\s*(?:[-*+]|\\d+\\.)\\s+${STATUS}\\b`, "i"),
  ],
  [
    "a status word leading a parenthesis",
    new RegExp(`\\(\\s*${STATUS}\\b`, "i"),
  ],
  ["a dash-set status word", /[—–-]\s*(?:DONE|SHIPPED|CLOSED|LANDED)\b/],
];

// An amount of effort or time given as an estimate.
const EFFORT: RegExp[] = [
  /(?:\b\d+(?:[.,]\d+)?|[½¼¾])\s*(?:[–-]\s*\d+(?:[.,]\d+)?\s*)?-?\s*(?:days?|weeks?|hours?|months?|sprints?|person-days?)\b/i,
  /\bhalf[- ]a[- ]day\b/i,
  /\b(?:quick|easy|trivial)\s+(?:fix|win)\b/i,
];

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** GitHub's heading anchors for a markdown file. */
function anchorsOf(path: string): Set<string> {
  const out = new Set<string>();
  const seen = new Map<string, number>();
  let fenced = false;
  for (const ln of Deno.readTextFileSync(path).split("\n")) {
    if (/^\s*(```|~~~)/.test(ln)) fenced = !fenced;
    if (fenced) continue;
    const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(ln);
    if (m === null) continue;
    const base = m[1].toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(
      /\s/g,
      "-",
    );
    const k = seen.get(base) ?? 0;
    seen.set(base, k + 1);
    out.add(k === 0 ? base : `${base}-${k}`);
  }
  return out;
}

function exists(path: string): Deno.FileInfo | null {
  try {
    return Deno.statSync(path);
  } catch {
    return null;
  }
}

/** The fault in one relative link, or "" when it resolves. */
function linkFault(file: string, target: string): string {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return "";
  const hash = target.indexOf("#");
  const pathPart = hash === -1 ? target : target.slice(0, hash);
  const anchor = hash === -1 ? "" : decodeURIComponent(target.slice(hash + 1));
  const dir = file.includes("/")
    ? file.slice(0, file.lastIndexOf("/") + 1)
    : "";
  const abs = pathPart === ""
    ? `${ROOT}${file}`
    : new URL(pathPart, `file://${ROOT}${dir}`).pathname;
  const info = exists(abs);
  if (info === null) return `no file or directory at ${abs.slice(ROOT.length)}`;
  if (
    anchor !== "" && info.isFile && abs.endsWith(".md") &&
    !anchorsOf(abs).has(anchor)
  ) {
    return `${
      abs.slice(ROOT.length)
    } has no heading whose anchor is #${anchor}`;
  }
  return "";
}

Deno.test("the roadmap cites no closed row, marks nothing done, estimates nothing, and links resolve", () => {
  const states = rowStates();
  if (states.size === 0) {
    throw new Error(
      `want rows under ${
        INVENTORIES.join(", ")
      }, got none: the heading shape moved`,
    );
  }
  const faults: string[] = [];
  for (const file of files()) {
    for (const ln of proseLines(file)) {
      const at = `${ln.file}:${ln.n}`;
      for (const m of ln.text.matchAll(CITE)) {
        const id = `D${m[1]}`;
        const rows = states.get(id);
        if (rows !== undefined && rows.every((c) => c)) {
          faults.push(
            `${at}  cites ${id}, whose inventory row is closed\n` +
              `      want: only open rows cited (delete the citation, or name the ruling or doc)\n` +
              `      got:  ${ln.text.trim()}`,
          );
        }
      }
      for (const [kind, re] of MARKERS) {
        const m = re.exec(ln.bare);
        if (m !== null) {
          faults.push(
            `${at}  done marker: ${kind} ("${m[0].trim()}")\n` +
              `      want: a finished item deleted here, with its line in CHANGELOG.md\n` +
              `      got:  ${ln.text.trim()}`,
          );
        }
      }
      for (const re of EFFORT) {
        const m = re.exec(ln.bare);
        if (m !== null) {
          faults.push(
            `${at}  effort or time estimate ("${m[0].trim()}")\n` +
              `      want: scope (what changes, which files, the risks), never a duration\n` +
              `      got:  ${ln.text.trim()}`,
          );
        }
      }
      for (const m of ln.bare.matchAll(LINK)) {
        const fault = linkFault(ln.file, m[1]);
        if (fault !== "") {
          faults.push(
            `${at}  broken link (${
              m[1]
            })\n      want: a target that resolves\n      got:  ${fault}`,
          );
        }
      }
    }
  }
  if (faults.length > 0) {
    throw new Error(`${faults.length} roadmap fault(s):\n${faults.join("\n")}`);
  }
});
