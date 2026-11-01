// THE FUNCTION-SLOT NOTES, ENFORCED — every in-place write in `compiler/emit_mono.vl` that
// re-points a function slot or rewrites a field `buildFnMap` classifies tells `buildFnMap`.
//
// `buildFnMap` resumes on the `fnStmts` PREFIX while the monomorphizer runs (one call per
// minted instance, `monoRegisterInstance`), and it reads `P.nodes[fnStmts[i]]`, `fnParent[i]`
// and the `FuncDecl`'s own `fnRet`/`fnName`. So every in-place write to one of those must be
// preceded, within `NOTE_WINDOW` lines, by `buildFnMapNoteFnSlotWrite()` (or, for a `fnStmts`
// slot, `buildFnMapNoteFnStmtWrite(slot, node)`), or carry `// arena-tick exempt: <reason>`
// on one of the two lines above it with a reason that is not empty.
//
// THE PATTERN, stated once so a reviewer can check it against the file. Comments are
// stripped (quote-aware, so a `//` inside a string literal is not a comment); a line that
// DECLARES a name (`const` / `let` / `export`) is skipped, because a declaration binds a
// fresh name rather than writing through one; and what is left is a write whose left side
// ends in a FIELD (`x.f = `) or an INDEX (`t[i] = `). `=` is required not to be `==` / `!=`
// / `>=` / `<=`. The slot rule then reads only the writes `SLOT_WRITE` names.
//
// Each scanner is validated against a CONTROL on every run: a synthetic untold write must be
// reported, because a classifier that silently matches nothing would report a clean file forever.
//
// No assertion library, per CLAUDE.md: every failure is a `throw new Error` naming want and got.

import { ROOT } from "./support/tree.ts";

const SRC = `${ROOT}/compiler/emit_mono.vl`;

// How many lines above a write an `arena-tick exempt:` line may sit.
const EXEMPT_WINDOW = 2;

const EXEMPT_MARK = "arena-tick exempt:";

// A write that re-points a function SLOT or rewrites a `FuncDecl` field `buildFnMap` classifies,
// and the call that tells it its per-function row cache no longer covers that function. Above
// the write, where the old row still stands. `.fnRet`/`.fnName` have no site in this file today: they are
// here because a resume armed over a stale row re-seeds it rather than re-classifying it.
const SLOT_WRITE =
  /\b(?:fnStmts|fnParent)\s*\[[^\]]*\]\s*=(?!=)|\.(?:fnRet|fnName)\s*=(?!=)/;
const SLOT_NOTE_CALL = "buildFnMapNoteFnSlotWrite(";
const NOTE_WINDOW = 3;
// The row-scoped note a same-name `fnStmts` slot write may use instead (D3761).
const SLOT_ROW_NOTE_CALL = "buildFnMapNoteFnStmtWrite(";
// The row note covers only a `fnStmts` slot: a `fnParent` or `.fnRet`/`.fnName` write moves what
// the note assumes stands, so it still needs the retiring note.
const FN_STMTS_SLOT = /\bfnStmts\s*\[/;

/** The code half of a line: everything before an unquoted `//`. */
const stripComment = (line: string): string => {
  let inStr = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr && c === "\\") {
      i++;
      continue;
    }
    if (c === '"') inStr = !inStr;
    else if (!inStr && c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
};

// A write whose left side ends in `.field` or `[index]`, the `=` not part of a comparison.
const WRITE = /[A-Za-z0-9_\]\)](?:\.[A-Za-z_][A-Za-z0-9_]*|\[[^\]]*\])\s*=(?!=)/;
// A binding, not a write through an existing name.
const DECL = /^\s*(?:const|let|export)\b/;

type Hit = {
  /** 1-based, as an editor and a `grep -n` report it. */
  line: number;
  text: string;
  /** The reason text after the marker, or null when no exemption line is present. */
  exempt: string | null;
  /** A `fnStmts`/`fnParent` slot write, and whether the `buildFnMap` note sits above it. */
  repoints: boolean;
  slotNoted: boolean;
};

const classify = (lines: string[]): Hit[] => {
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const code = stripComment(lines[i]);
    if (DECL.test(code) || !WRITE.test(code)) continue;
    const before = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i);
    const mark = before.find((l) => l.includes(EXEMPT_MARK));
    const above = lines.slice(Math.max(0, i - NOTE_WINDOW), i);
    hits.push({
      line: i + 1,
      text: lines[i].trim(),
      repoints: SLOT_WRITE.test(code),
      slotNoted: above.some((l) =>
        l.includes(SLOT_NOTE_CALL) || (FN_STMTS_SLOT.test(code) && l.includes(SLOT_ROW_NOTE_CALL))
      ),
      exempt: mark === undefined ? null : mark.slice(mark.indexOf(EXEMPT_MARK) + EXEMPT_MARK.length).trim(),
    });
  }
  return hits;
};

Deno.test("mono arena tick: every function-slot write tells buildFnMap or is named exempt", () => {
  const hits = classify(Deno.readTextFileSync(SRC).split("\n"));

  // A classifier that matched nothing would pass this file silently forever. The floor is
  // well under the 13 sites standing today, so it fails only on a broken pattern.
  if (hits.length < 8) {
    throw new Error(
      `the in-place-write pattern found ${hits.length} site(s) in compiler/emit_mono.vl — ` +
        `want at least 8. Either the file lost most of its writes or the pattern in ` +
        `tests/vl_mono_arena_tick_test.ts stopped matching; check the pattern first.`,
    );
  }

  const unslotted = hits.filter((h) => h.repoints && !h.slotNoted && h.exempt === null);
  if (unslotted.length > 0) {
    throw new Error(
      `${unslotted.length} function-slot write(s) in compiler/emit_mono.vl do not tell ` +
        `buildFnMap:\n` +
        unslotted.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\nbuildFnMap resumes on the fnStmts prefix between two monoRegisterInstance calls, and its ` +
        `row comes off P.nodes[fnStmts[i]] and fnParent[i] — so re-pointing either must call ` +
        `${SLOT_NOTE_CALL}) within ${NOTE_WINDOW} lines ABOVE the write.`,
    );
  }

  const mute = hits.filter((h) => h.exempt !== null && h.exempt.length === 0);
  if (mute.length > 0) {
    throw new Error(
      `${mute.length} "${EXEMPT_MARK}" line(s) in compiler/emit_mono.vl carry no reason:\n` +
        mute.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\nThe marker is not a mute button — it is the claim that buildFnMap cannot ` +
        `see this write, and the next reader has to be able to check it.`,
    );
  }
});

Deno.test("mono arena tick: the scanner reports a slot write that does not tell buildFnMap (control)", () => {
  // The slot rule's own control, both exits exercised, for the reason every scanner here has one.
  const control = [
    "  fnStmts[tSlot] = clone", //                 1 — re-points, unnoted
    "  k = k + 1",
    "  buildFnMapNoteFnSlotWrite()",
    "  fnParent[msl] = instFe", //                 4 — re-points, noted
    "  k = k + 1",
    "  cal.identName = specName", //               6 — a rename, so the slot rule ignores it
    "  k = k + 1",
    "  fn.fnRet = synthTypeRef(nm, -1)", //         8 — a classified field, and a bump is not a note
    "  k = k + 1",
    "  buildFnMapNoteFnStmtWrite(origFe, nfn)",
    "  fnStmts[origFe] = nfn", //                  11 — the row note covers a `fnStmts` slot
    "  k = k + 1",
    "  buildFnMapNoteFnStmtWrite(origFe, nfn)",
    "  fnParent[origFe] = instFe", //              14 — but not a `fnParent` write
    "  k = k + 1",
    "  buildFnMapNoteFnStmtWrite(origFe, nfn)",
    "  fn.fnName = nm", //                          17 — nor a `.fnName` write
    "  k = k + 1",
  ];
  const got = classify(control).map((h) =>
    `${h.line}:${h.repoints ? (h.slotNoted ? "noted" : "UNNOTED") : "n/a"}`
  );
  const want = ["1:UNNOTED", "4:noted", "6:n/a", "8:UNNOTED", "11:noted", "14:UNNOTED", "17:UNNOTED"];
  if (got.join(" ") !== want.join(" ")) {
    throw new Error(
      `the slot scanner mis-read its own control — want [${want.join(", ")}], got ` +
        `[${got.join(", ")}]. A classifier blind to an untold slot write cannot guard the resume.`,
    );
  }
});

Deno.test("mono arena tick: a `//` inside a string literal is not a comment (control)", () => {
  // The comment strip decides which text the pattern reads. Getting it wrong in this
  // direction would drop real writes on any line whose string holds a `//`.
  const control = ['  nd.identName = "a//b"', '  // nd.identName = "dead"'];
  const hits = classify(control);
  if (hits.length !== 1 || hits[0].line !== 1) {
    throw new Error(
      `comment stripping is wrong — want exactly the line-1 write, got ` +
        `[${hits.map((h) => `${h.line}:${h.text}`).join(", ")}]`,
    );
  }
});
