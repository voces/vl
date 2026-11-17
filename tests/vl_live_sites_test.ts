// THE WITNESS-BACKED REFUSAL LIST MAY NOT GROW WITHOUT A WITNESS.
//
// `scripts/goal-scoreboard.vl` prints two counts of the compiler's capability refusals. One
// reads the WORDING — the literals whose sentence concedes the refused program was legal —
// and it is a floor by construction: 517 of the 533 emit-side refusal sites say nothing
// about legality, and `emitProgram: fromCodePoints argument must be a named i32[] binding`
// fired on a `vl check`-clean program for months while reading like a design rule.
//
// The other count reads `scripts/capability-probes/live-sites.json`: refusal literals a
// witness PROVABLY reaches. A list like that is only worth its name while every row rests
// on a program someone can run, so this test asserts the STRUCTURE — the probe exists, the
// literal is still in the compiler, the probe says which literal it witnesses — in
// milliseconds, without compiling anything. The BEHAVIOURAL half, does the witness still
// refuse, is `vl run scripts/capability-probes.vl -- --live-sites`, which compiles.
//
// No assertion library, per CLAUDE.md: every failure below throws with want and got.
const LIST = "scripts/capability-probes/live-sites.json";
const PROBES = "scripts/capability-probes";
const SRC = "compiler";

type Site = {
  literal: string;
  probe: string;
  witnessed: string;
  why: string;
  row?: string;
};

// An empty list's justification: when and where the probe runner was read, its passed/total, and
// every probe still refusing with the stage it refuses at. A GAP at emit is a live site, so the
// list may not be empty while one is named.
type Empty = {
  why: string;
  date: string;
  commit: string;
  probes: string;
  gaps: { probe: string; stage: string }[];
};

async function checkEmptyNote(e: Empty) {
  const bad: string[] = [];
  for (const f of ["why", "date", "commit", "probes"] as const) {
    if (typeof e[f] !== "string" || e[f].trim() === "") {
      bad.push(`missing the \`${f}\` field, got ${JSON.stringify(e[f])}`);
    }
  }
  if (typeof e.date === "string" && !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) {
    bad.push(`want \`date\` as YYYY-MM-DD, got ${JSON.stringify(e.date)}`);
  }
  const m = typeof e.probes === "string"
    ? /^(\d+)\/(\d+)$/.exec(e.probes)
    : null;
  if (!m) {
    bad.push(
      `want \`probes\` as the runner's passed/total, got ${
        JSON.stringify(e.probes)
      }`,
    );
  }
  if (!Array.isArray(e.gaps)) {
    bad.push(`want a \`gaps\` array, got ${JSON.stringify(e.gaps)}`);
  } else {
    if (m && Number(m[2]) - Number(m[1]) !== e.gaps.length) {
      bad.push(
        `want one \`gaps\` entry per probe still refusing (${
          Number(m[2]) - Number(m[1])
        } by ` +
          `${JSON.stringify(e.probes)}), got ${e.gaps.length}`,
      );
    }
    for (const g of e.gaps) {
      try {
        await Deno.stat(`${PROBES}/${g.probe}`);
      } catch {
        bad.push(
          `gap names probe ${
            JSON.stringify(g.probe)
          }, which does not exist in ${PROBES}/`,
        );
      }
      if (g.stage === "emit") {
        bad.push(
          `gap ${
            JSON.stringify(g.probe)
          } refuses at emit: that is a live site, so want its row in ` +
            `\`sites\`, not an empty list`,
        );
      } else if (g.stage !== "check" && g.stage !== "parse") {
        bad.push(
          `want gap ${
            JSON.stringify(g.probe)
          }'s \`stage\` as check, parse or emit, got ` +
            `${JSON.stringify(g.stage)}`,
        );
      }
    }
  }
  if (bad.length) {
    throw new Error(
      `${LIST}: the \`empty\` note does not justify an empty list:\n  ` +
        bad.join("\n  "),
    );
  }
}

/** A probe's header comment as one line, so a literal broken across `//` lines still reads. */
function header(text: string): string {
  const lines: string[] = [];
  for (const ln of text.split("\n")) {
    if (!ln.startsWith("//")) break;
    lines.push(ln.slice(2));
  }
  return lines.join(" ").replace(/\s+/g, " ");
}

Deno.test("every witness-backed refusal site rests on a probe that names it", async () => {
  const raw = JSON.parse(await Deno.readTextFile(LIST)) as {
    note: string;
    sites: Site[];
    empty?: Empty;
  };
  if (
    Array.isArray(raw.sites) && raw.sites.length === 0 &&
    raw.empty !== undefined
  ) {
    await checkEmptyNote(raw.empty);
    return;
  }
  if (raw.empty !== undefined) {
    throw new Error(
      `${LIST}: want no \`empty\` note beside a non-empty \`sites\` list, got one dated ` +
        `${
          JSON.stringify(raw.empty.date)
        }. Delete the note when a row comes back.`,
    );
  }
  if (!Array.isArray(raw.sites) || raw.sites.length === 0) {
    throw new Error(
      `${LIST}: want a non-empty \`sites\` array, got ${
        JSON.stringify(raw.sites)
      }. An empty ` +
        `list is not "clause 2 met" — it is a list nobody has written a witness for.`,
    );
  }

  let src = "";
  for await (const e of Deno.readDir(SRC)) {
    if (e.isFile && e.name.endsWith(".vl")) {
      src += await Deno.readTextFile(`${SRC}/${e.name}`) + "\n";
    }
  }

  const bad: string[] = [];
  const seen = new Set<string>();
  for (const s of raw.sites) {
    const at = `${LIST}: ${JSON.stringify((s.literal ?? "").slice(0, 50))}`;
    for (const f of ["literal", "probe", "witnessed", "why"] as const) {
      if (typeof s[f] !== "string" || s[f].trim() === "") {
        bad.push(
          `${at} — missing the \`${f}\` field, got ${JSON.stringify(s[f])}`,
        );
      }
    }
    if (typeof s.literal !== "string" || typeof s.probe !== "string") continue;
    if (seen.has(s.literal)) {
      bad.push(`${at} — listed twice; one literal, one row`);
    }
    seen.add(s.literal);
    // THE LITERAL IS STILL IN THE COMPILER. A row whose site was deleted or reworded would
    // otherwise be counted as a standing clause-2 violation forever.
    if (!src.includes('"' + s.literal)) {
      bad.push(
        `${at} — no such literal in ${SRC}/*.vl. Want the quoted spelling to appear ` +
          `verbatim; the site was deleted or reworded, so retire the row.`,
      );
    }
    let probe: string;
    try {
      probe = await Deno.readTextFile(`${PROBES}/${s.probe}`);
    } catch {
      bad.push(
        `${at} — names probe ${
          JSON.stringify(s.probe)
        }, which does not exist in ` +
          `${PROBES}/. A row may only be added with a witness.`,
      );
      continue;
    }
    // THE PROBE SAYS WHICH SITE IT WITNESSES. Without this the list and the directory drift:
    // a probe gets rewritten for a neighbouring gap and its row silently stops being evidence.
    const head = header(probe);
    if (!head.includes(s.literal.replace(/\s+/g, " "))) {
      bad.push(
        `${at} — ${s.probe}'s header does not quote the literal it witnesses.\n` +
          `      want: the header comment to contain ${
            JSON.stringify(s.literal.slice(0, 60))
          }\n` +
          `      got:  ${JSON.stringify(head.slice(0, 160))}`,
      );
    }
    if (!/Should print /.test(head)) {
      bad.push(
        `${at} — ${s.probe} has no \`Should print ...\` contract in its header`,
      );
    }
  }

  if (bad.length) {
    throw new Error(
      `${bad.length} witness-backed refusal row(s) do not rest on a runnable witness:\n  ` +
        bad.join("\n  "),
    );
  }
});
