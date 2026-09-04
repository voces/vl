// A CITED ROW MUST EXIST — the referential half of the row discipline.
//
// PR #2405 resolved a conflict in the inventory's tail and SILENTLY DELETED row D1230:
// present at its merge-base, absent at its head, with its citations still standing in
// DECISIONS.md, ROADMAP.md, compiler/check_state.vl and a test. Every gate stayed green,
// because every instrument the tree has reads rows that ARE there — the python grades the
// rows it finds, `vl_inventory_rows_test.ts` checks the shape of the rows it finds. Neither
// can see a row that stopped being found. This test asks the other question: of every
// `D<id>` the tree CITES, which one has no row?

// The one-file-per-row split makes that class rare (two PRs filing two rows now touch two
// files) and cannot remove it: a delete is still a delete, and a rename is a delete with a
// new file beside it. No assertion library, per CLAUDE.md — every failure is a
// `throw new Error` naming want, got, and the file:line of each citation.
//
// and those mentions are not what the gate should red on. Delete this marker the day the
// restoring PR lands: the test fails while a marker names a row that EXISTS, so it cannot
// be left behind.

const INVENTORIES = ["docs/internals/inventory", "docs/internals/inventory-2"];
const SOURCE_MARK = /^<!--\s*inventory-split:\s*source\s+(\S+)\s*-->\s*$/m;

// Where a citation may appear. `scripts/inventory/` is the split TOOLING: the ids in its
// template and its self-test are specimens, not citations, and it is the one place in the
// tree that mints ids it never intends to file.
//
// `RESERVED.md` IS THE SECOND SUCH PLACE, AND FOR THE SAME REASON — it is a ledger of id
// ranges CLAIMED AHEAD OF THEIR ROWS, so naming an id no row carries is its normal and
// correct state, not a dangling citation. Every reservation would fail this test on the day
// it is taken and pass only once the work lands, which inverts what the file is for. It is
// exempt by PATH, and deliberately so: do not "fix" this by filing placeholder rows for
// reserved ids, and do not delete the exemption because the file happens to be green — a
// range is usually unfiled at exactly the moment it matters most.
//
// The range spelling (`D<lo>-D<hi>`) also reads as two separate citations to `CITE`, which
// is why this comment writes it with placeholders: spelling a real reserved range here
// failed THIS test from inside the paragraph explaining the exemption, because `tests/`
// is scanned too.
// the path exemption makes moot; if this file ever stops being exempt, that is the second
// thing to handle. Staleness is caught elsewhere: `tests/vl_inventory_rows_test.ts` fails
// when every id in a reserved range IS filed, which is the real hazard here.
const ROOT_FILES = ["DECISIONS.md", "ROADMAP.md", "CLAUDE.md", "CHANGELOG.md"];
const ROOT_DIRS = ["docs", "std", "compiler", "tests", "scripts"];
const SKIP_PREFIX = ["scripts/inventory/", "docs/internals/inventory/RESERVED.md"];
const SCAN_EXT = /\.(md|vl|ts|py|sh|rs|yml)$/;

// A row heading, in ANY doc: `docs/internals/std-design.md` and
// `destringify-types-program.md` number their own slices D0..D6, and a citation to one of
// those is a citation to a real heading. Resolving against every heading in the tree rather
// than against the inventories alone is what keeps 53 references to the destringify D0 out
// of the failure list — measured, not assumed.
//
// THE SUFFIX IS PART OF THE ID. `### D1009-N` and `### D1009` are two rows, and reading the
// first as `D1009` reported a duplicate that does not exist — the same widening
// `check-filed-witnesses.py`'s `SEC` needed, for the same reason.
const HEAD = /^#{2,4}\s+(D\d{1,4}(?:-?[A-Za-z][A-Za-z0-9]*)?)\b/;
// A cited id. Word-bounded on both sides so `D1042` matches and `AD10`, `D1042x` do not.
const CITE = /(?<![A-Za-z0-9_])D(\d{1,4})(?![0-9A-Za-z_])/g;
// An id deliberately mentioned before its row exists — the D1230 citations landed one PR
// ahead of the row. Scoped to the file that carries it, and it must be REMOVED when the row
// lands: a marker naming an existing row fails below, so this cannot rot into a permanent
// exemption the way a bare allowlist does.
const UNFILED_MARK = /unfiled:\s*(D\d{1,4})/g;

// NOT ROW IDS AT ALL — and that is now the ONLY reason an entry may be here. This list
// landed holding nine: three numbers that were never row ids, and six ids that shipped work
// cited with no row behind them. The six are gone. Four turned out to be real defects and
// are FILED under their original ids — D705, D949, D973, D974 — witnesses re-measured rather
// than copied from the citation. Two were WORK LABELS a row would have fictionalised, and
// their citations now name the PR that did the work: the scoreboard phrase-list audit is
// #2122, the `is <literal>` hint is #2404.

// A CODE RULE WAS CONSIDERED AND IS WORSE THAN THE LIST. Skipping the right side of a
// `D<n>–D<n>` range covers two of the three and would also hide a genuinely missing row cited
// as a range end; nothing syntactic covers `U+D800`, `(D800)` and `D800..DFFF` at once. So
// the exemption stays NAMED and may only SHRINK — an entry that starts resolving is a
// failure below, which is what stops this becoming the allowlist that would hide the next
// D1230, deliberately NOT in it. Counts are citations OUTSIDE this file, measured 2026-09-03.
const KNOWN_UNFILED = new Map<string, string>([
  ["D800", "x5 — the UTF-16 surrogate range D800–DFFF / the code point U+D800: " +
    "strings-design.md, emit_base.vl, emit_sections.vl, two string fixtures"],
  ["D1000", "x2 — the CLOSING endpoint of the reservation range `D981–D1000` in " +
    "inventory/README.md. The opening endpoint D981 is a real row and resolves"],
  ["D174", "x1 — the CLOSING endpoint of `D171–D174` in silent-sweep/d156/README.md. " +
    "D171 is a real row and resolves"],
]);

type Cite = { id: string; where: string };

/** `D1009-N` also answers to `D1009`, because a citation cannot spell the difference:
 *  `CITE`'s lookahead stops at the hyphen, so prose naming `D1009-N` reads as `D1009`.
 *  A LETTER suffix is left alone — `D661A` matches no citation at all. */
function bare(id: string): string {
  return id.replace(/-[A-Za-z][A-Za-z0-9]*$/, "");
}

/** Every file a citation may live in, as repo-relative paths. */
function scanFiles(): string[] {
  const out = [...ROOT_FILES];
  const walk = (dir: string) => {
    for (const e of Deno.readDirSync(dir)) {
      const p = `${dir}/${e.name}`;
      if (SKIP_PREFIX.some((s) => p.startsWith(s))) continue;
      if (e.isDirectory) walk(p);
      else if (e.isFile && SCAN_EXT.test(e.name)) out.push(p);
    }
  };
  for (const d of ROOT_DIRS) walk(d);
  return out;
}

/** The docs one inventory stands for: its `D*.md` rows, or the monolith it came from. */
function docsOf(dir: string): string[] {
  const rows: string[] = [];
  for (const e of Deno.readDirSync(dir)) {
    if (e.isFile && /^D\d.*\.md$/.test(e.name)) rows.push(`${dir}/${e.name}`);
  }
  if (rows.length > 0) return rows;
  const m = SOURCE_MARK.exec(Deno.readTextFileSync(`${dir}/README.md`));
  if (m === null) {
    throw new Error(
      `${dir}: holds no D*.md rows and ${dir}/README.md carries no ` +
        `\`<!-- inventory-split: source ... -->\` line to fall back to`,
    );
  }
  return [m[1]];
}

Deno.test("every cited inventory row id has a row", () => {
  const files = scanFiles();

  // 1. THE ROWS THAT EXIST, and a per-inventory duplicate check. Per inventory, not across
  // both: the two number independently and D1..D14 exist in each.
  const rows = new Set<string>();
  const dupes: string[] = [];
  for (const dir of INVENTORIES) {
    const seen = new Map<string, string>();
    for (const doc of docsOf(dir)) {
      const lines = Deno.readTextFileSync(doc).split("\n");
      for (let i = 0; i < lines.length; i++) {
        const m = HEAD.exec(lines[i]);
        if (m === null) continue;
        rows.add(m[1]);
        rows.add(bare(m[1]));
        const prior = seen.get(m[1]);
        if (prior !== undefined) {
          dupes.push(
            `${doc}:${i + 1}  ${m[1]} — DUPLICATE row id, already filed at ${prior}\n` +
              `      want: one row per id within ${dir}\n      got:  ${m[1]} twice`,
          );
        }
        seen.set(m[1], `${doc}:${i + 1}`);
      }
    }
  }
  if (rows.size === 0) {
    throw new Error(
      `no rows found under ${INVENTORIES.join(", ")} — the heading shape moved and this ` +
        `test would now fail every citation. want: > 0 rows, got: 0`,
    );
  }

  // 2. EVERY HEADING IN THE TREE, so a citation to a doc with its OWN D-namespace
  // (std-design's D1..D6, destringify's D0..D6) resolves instead of failing.
  const headings = new Set(rows);
  const cites: Cite[] = [];
  const unfiled = new Map<string, string[]>();
  const text = new Map<string, string>();
  for (const f of files) {
    let src: string;
    try {
      src = Deno.readTextFileSync(f);
    } catch {
      continue;
    }
    text.set(f, src);
    if (!f.endsWith(".md")) continue;
    for (const ln of src.split("\n")) {
      const m = HEAD.exec(ln);
      if (m !== null) {
        headings.add(m[1]);
        headings.add(bare(m[1]));
      }
    }
  }

  // 3. THE CITATIONS. A row's OWN heading line is not a citation to itself.
  for (const [f, src] of text) {
    const lines = src.split("\n");
    for (const m of src.matchAll(UNFILED_MARK)) {
      (unfiled.get(f) ?? unfiled.set(f, []).get(f)!).push(m[1]);
    }
    for (let i = 0; i < lines.length; i++) {
      if (HEAD.test(lines[i])) continue;
      for (const m of lines[i].matchAll(CITE)) {
        cites.push({ id: `D${m[1]}`, where: `${f}:${i + 1}` });
      }
    }
  }

  // 4. THE VERDICT.
  const bad: string[] = [...dupes];
  const missing = new Map<string, string[]>();
  for (const c of cites) {
    if (headings.has(c.id) || KNOWN_UNFILED.has(c.id)) continue;
    if ((unfiled.get(c.where.split(":")[0]) ?? []).includes(c.id)) continue;
    (missing.get(c.id) ?? missing.set(c.id, []).get(c.id)!).push(c.where);
  }
  for (const [id, where] of [...missing].sort()) {
    bad.push(
      `${id} — CITED ${where.length}x, but NO ROW has this id\n` +
        `      want: \`### ${id} — …\` in an inventory, or \`docs/internals/inventory/${id}.md\`\n` +
        `      got:  nothing. Cited at: ${where.slice(0, 8).join(", ")}` +
        (where.length > 8 ? `, +${where.length - 8} more` : ""),
    );
  }
  // A MARKER THAT NAMES AN EXISTING ROW IS STALE, and so is a KNOWN_UNFILED entry that
  // started resolving. Both must be removed the day the row lands, or the exemption
  // outlives the reason for it — which is the failure mode of every allowlist.
  for (const [f, ids] of unfiled) {
    for (const id of ids) {
      if (headings.has(id)) {
        bad.push(
          `${f}  ${id} — \`unfiled: ${id}\` marker names a row that EXISTS\n` +
            `      want: the marker removed now the row has landed\n      got:  still there`,
        );
      }
    }
  }
  for (const [id, why] of KNOWN_UNFILED) {
    if (headings.has(id)) {
      bad.push(
        `${id} — listed in KNOWN_UNFILED ("${why}") but a row now EXISTS\n` +
          `      want: the entry deleted from tests/vl_inventory_refs_test.ts\n` +
          `      got:  still listed`,
      );
    }
  }

  if (bad.length > 0) {
    throw new Error(
      `${bad.length} inventory reference fault(s) over ${cites.length} citations in ` +
        `${files.length} files:\n  ${bad.join("\n  ")}\n\n` +
        `A row deleted by a conflict resolution is invisible to every other gate — that is ` +
        `what this test is for. If the id is planned but not yet filed, put an ` +
        `\`unfiled: D<id>\` marker in the citing file and remove it when the row lands.`,
    );
  }
});
