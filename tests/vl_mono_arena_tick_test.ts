// THE ARENA-TICK ENUMERATION, ENFORCED — every in-place write in `compiler/emit_mono.vl`
// bumps the stamp, or says in one line why it does not.
//
// `monoRebuild` skips its four whole-program passes when the arena stamp has not moved.
// The stamp is `P.nodes.length + fnStmts.length + fnParent.length + monoArenaTick`: the
// three lengths see every APPEND, and `monoArenaTick` is what sees a write that lands IN
// PLACE — a node field rewritten, an `fnStmts`/`fnParent` slot replaced. A registry hit
// renames a callee (`cal.identName = monoInstName[k]`) and mints nothing, and
// `computeVoidFns` resolves a call by that name, so a missed bump is a rebuild skipped
// that should have run: stale voidness, and a miscompile with nothing loud in it.
//
// That soundness argument was an ENUMERATION — ten sites found by one grep on one day.
// An enumeration is not a guard: the next in-place write lands with nothing to notice it,
// and CLAUDE.md's stale-index history is a list of exactly that. This is the guard, and it
// is the cheap half — it reads the source as text, runs no compiler, and costs milliseconds.
//
// THE PATTERN, stated once so a reviewer can check it against the file. Comments are
// stripped (quote-aware, so a `//` inside a string literal is not a comment); a line that
// DECLARES a name (`const` / `let` / `export`) is skipped, because a declaration binds a
// fresh name rather than writing through one; and what is left is a write whose left side
// ends in a FIELD (`x.f = `) or an INDEX (`t[i] = `) — a write that lands in something the
// line did not create. `=` is required not to be `==` / `!=` / `>=` / `<=`.
//
// Each hit must then be EITHER followed within `TICK_WINDOW` lines by a `monoArenaTouch()`
// call, OR carry `// arena-tick exempt: <reason>` on one of the two lines above it, with a
// reason that is not empty. The window is a window and not an exact line because two real
// sites tick after their loop or after a multi-line `mkFunc(` argument list.
//
// WHAT THIS DOES NOT CATCH, said plainly: a write that needs no tick and happens to sit
// within the window of an unrelated one passes without an exemption line. That direction is
// harmless — a spurious tick only costs a rebuild that would have been skipped. The
// direction that matters, a real arena write with no bump anywhere near it, cannot pass.
//
// The scanner is validated against a CONTROL on every run (the second test below): a
// synthetic write with no bump and no exemption must be reported, because a classifier that
// silently matches nothing would report a clean file forever.
//
// THE SECOND DISCIPLINE, same file, different reader. `collectA` resumes on the arena PREFIX
// while the monomorphizer runs, so a write that changes what its walk would answer for a node
// already walked has to retire that prefix. Nine of the ten writes land in `fnStmts`,
// `fnParent` or a `Param`, which the walk never reads; the exception is a callee RENAME, whose
// name the `Call` arm classifies. So every `<x>.identName =` must be preceded, within
// `NOTE_WINDOW` lines, by `collectANoteIdentRename(<the old name>)` — before the write, since
// the note reads the name being replaced — or carry the same exemption line.
//
// THE THIRD DISCIPLINE, same file again. `buildFnMap` resumes on the `fnStmts` PREFIX for the
// same reason, and it reads things a rename cannot touch: `P.nodes[fnStmts[i]]`, `fnParent[i]`
// and the `FuncDecl`'s own `fnRet`/`fnName`. So every in-place write to one of those must be
// preceded, within `NOTE_WINDOW` lines, by `buildFnMapNoteFnSlotWrite()` — or carry the
// exemption line. A `monoArenaTouch()` is NOT a substitute: it makes `monoRebuild` run, and a
// run whose prefix is still armed re-seeds the stale row rather than re-classifying it.
//
// No assertion library, per CLAUDE.md: every failure is a `throw new Error` naming want and got.

import { ROOT } from "./support/tree.ts";

const SRC = `${ROOT}/compiler/emit_mono.vl`;

// How far after a write a `monoArenaTouch()` may sit and still count as its bump. Two real
// sites need room: `monoReparentNestedLams` ticks once after its loop (7 lines), and
// `monoPruneGenerics` ticks after a 7-line `mkFunc(` argument list (8 lines).
const TICK_WINDOW = 10;

// How many lines above a write an `arena-tick exempt:` line may sit.
const EXEMPT_WINDOW = 2;

const EXEMPT_MARK = "arena-tick exempt:";

// A write to a callee's name, and the call that tells `collectA` the prefix is stale. The note
// must sit ABOVE the write: it reads the name the write is about to replace.
const NAME_WRITE = /\.identName\s*=(?!=)/;
const NOTE_CALL = "collectANoteIdentRename(";
const NOTE_WINDOW = 3;

// A write that re-points a function SLOT or rewrites a `FuncDecl` field `buildFnMap` classifies,
// and the call that tells it its per-function row cache no longer covers that function. Above
// the write, like the rename note. `.fnRet`/`.fnName` have no site in this file today: they are
// here because `monoArenaTouch()` would make `monoRebuild` RUN while leaving the prefix armed,
// so a bump is not a substitute for the note.
const SLOT_WRITE =
  /\b(?:fnStmts|fnParent)\s*\[[^\]]*\]\s*=(?!=)|\.(?:fnRet|fnName)\s*=(?!=)/;
const SLOT_NOTE_CALL = "buildFnMapNoteFnSlotWrite(";

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
  ticked: boolean;
  /** The reason text after the marker, or null when no exemption line is present. */
  exempt: string | null;
  /** A callee-name write, and whether `collectANoteIdentRename` sits above it. */
  renames: boolean;
  noted: boolean;
  /** A `fnStmts`/`fnParent` slot write, and whether the `buildFnMap` note sits above it. */
  repoints: boolean;
  slotNoted: boolean;
};

const classify = (lines: string[]): Hit[] => {
  const hits: Hit[] = [];
  for (let i = 0; i < lines.length; i++) {
    const code = stripComment(lines[i]);
    if (DECL.test(code) || !WRITE.test(code)) continue;
    const after = lines.slice(i + 1, i + 1 + TICK_WINDOW);
    const before = lines.slice(Math.max(0, i - EXEMPT_WINDOW), i);
    const mark = before.find((l) => l.includes(EXEMPT_MARK));
    const above = lines.slice(Math.max(0, i - NOTE_WINDOW), i);
    hits.push({
      line: i + 1,
      text: lines[i].trim(),
      renames: NAME_WRITE.test(code),
      noted: above.some((l) => l.includes(NOTE_CALL)),
      repoints: SLOT_WRITE.test(code),
      slotNoted: above.some((l) => l.includes(SLOT_NOTE_CALL)),
      ticked: after.some((l) => l.includes("monoArenaTouch()")),
      exempt: mark === undefined ? null : mark.slice(mark.indexOf(EXEMPT_MARK) + EXEMPT_MARK.length).trim(),
    });
  }
  return hits;
};

Deno.test("mono arena tick: every in-place write bumps the stamp or is named exempt", () => {
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

  const unguarded = hits.filter((h) => !h.ticked && h.exempt === null);
  if (unguarded.length > 0) {
    throw new Error(
      `${unguarded.length} in-place write(s) in compiler/emit_mono.vl neither bump ` +
        `monoArenaTick nor say why they need not:\n` +
        unguarded.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\nmonoRebuild skips its four passes on an unmoved stamp, and no LENGTH sees a ` +
        `write that lands in place — so a write that changes what collectA / buildFnMap / ` +
        `computeVoidFns / computeRetInference would answer must call monoArenaTouch() ` +
        `within ${TICK_WINDOW} lines. If this write cannot change their answer, say so on ` +
        `the line above it: "// ${EXEMPT_MARK} <why>".`,
    );
  }

  const unnoted = hits.filter((h) => h.renames && !h.noted && h.exempt === null);
  if (unnoted.length > 0) {
    throw new Error(
      `${unnoted.length} callee rename(s) in compiler/emit_mono.vl do not tell collectA:\n` +
        unnoted.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\ncollectA resumes on the arena prefix between two monoRebuild calls, and its ` +
        `Call arm reads this name — so a rename must call ${NOTE_CALL}<old name>) within ` +
        `${NOTE_WINDOW} lines ABOVE the write, which is where the old name still exists.`,
    );
  }

  const unslotted = hits.filter((h) => h.repoints && !h.slotNoted && h.exempt === null);
  if (unslotted.length > 0) {
    throw new Error(
      `${unslotted.length} function-slot write(s) in compiler/emit_mono.vl do not tell ` +
        `buildFnMap:\n` +
        unslotted.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\nbuildFnMap resumes on the fnStmts prefix between two monoRebuild calls, and its ` +
        `row comes off P.nodes[fnStmts[i]] and fnParent[i] — so re-pointing either must call ` +
        `${SLOT_NOTE_CALL}) within ${NOTE_WINDOW} lines ABOVE the write.`,
    );
  }

  const mute = hits.filter((h) => h.exempt !== null && h.exempt.length === 0);
  if (mute.length > 0) {
    throw new Error(
      `${mute.length} "${EXEMPT_MARK}" line(s) in compiler/emit_mono.vl carry no reason:\n` +
        mute.map((h) => `  emit_mono.vl:${h.line}  ${h.text}`).join("\n") +
        `\n\nThe marker is not a mute button — it is the claim that the four passes cannot ` +
        `see this write, and the next reader has to be able to check it.`,
    );
  }
});

Deno.test("mono arena tick: the scanner reports a write with no bump (control)", () => {
  // Never trust a probe until a control you KNOW should trigger it does (CLAUDE.md). Three
  // shapes, one of each classification, so the control fails if the pattern stops matching
  // OR if either exit — the bump, the exemption — stops being read.
  const pad = Array.from({ length: TICK_WINDOW + 1 }, () => "  k = k + 1");
  const control = [
    "function f(a: i32) {",
    "  const nd = P.nodes[a]",
    "  nd.identName = \"x\"", // 3 — unguarded: the nearest bump is past the window
    ...pad,
    "  fnStmts[a] = nd", //      guarded by the bump on the next line
    "  monoArenaTouch()",
    "  // arena-tick exempt: a local, not the arena.",
    "  scratch[a] = -1", //      guarded by the exemption above
    "  0",
    "}",
  ];
  const hits = classify(control);
  const got = hits.map((h) => `${h.line}:${h.ticked ? "tick" : h.exempt !== null ? "exempt" : "UNGUARDED"}`);
  const want = ["3:UNGUARDED", `${4 + pad.length}:tick`, `${7 + pad.length}:exempt`];
  if (got.join(" ") !== want.join(" ")) {
    throw new Error(
      `the scanner mis-read its own control — want [${want.join(", ")}], got [${got.join(", ")}]. ` +
        `A classifier that cannot see an unguarded write cannot guard emit_mono.vl either.`,
    );
  }
});

Deno.test("mono arena tick: the scanner reports a rename that does not tell collectA (control)", () => {
  // The note rule's own control, for the reason the bump rule has one: a classifier that
  // matches no rename would pass this file forever. Both exits are exercised.
  const control = [
    "  cal.identName = instName", //           1 — renames, unnoted
    "  monoArenaTouch()",
    "  collectANoteIdentRename(cal2.identName)",
    "  cal2.identName = specName", //          4 — renames, noted
    "  monoArenaTouch()",
    "  fnStmts[a] = nd", //                    6 — not a rename, so the note rule ignores it
    "  monoArenaTouch()",
  ];
  const got = classify(control).map((h) => `${h.line}:${h.renames ? (h.noted ? "noted" : "UNNOTED") : "n/a"}`);
  const want = ["1:UNNOTED", "4:noted", "6:n/a"];
  if (got.join(" ") !== want.join(" ")) {
    throw new Error(
      `the rename scanner mis-read its own control — want [${want.join(", ")}], got ` +
        `[${got.join(", ")}]. A classifier blind to an untold rename cannot guard the resume.`,
    );
  }
});

Deno.test("mono arena tick: the scanner reports a slot write that does not tell buildFnMap (control)", () => {
  // The slot rule's own control, both exits exercised, for the reason the other two have one.
  const control = [
    "  fnStmts[tSlot] = clone", //                 1 — re-points, unnoted
    "  monoArenaTouch()",
    "  buildFnMapNoteFnSlotWrite()",
    "  fnParent[msl] = instFe", //                 4 — re-points, noted
    "  monoArenaTouch()",
    "  cal.identName = specName", //               6 — a rename, so the slot rule ignores it
    "  monoArenaTouch()",
    "  fn.fnRet = synthTypeRef(nm, -1)", //         8 — a classified field, and a bump is not a note
    "  monoArenaTouch()",
  ];
  const got = classify(control).map((h) =>
    `${h.line}:${h.repoints ? (h.slotNoted ? "noted" : "UNNOTED") : "n/a"}`
  );
  const want = ["1:UNNOTED", "4:noted", "6:n/a", "8:UNNOTED"];
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
