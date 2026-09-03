#!/usr/bin/env python3
"""
Run the repro program filed under every defect heading in a docs inventory and report
which ones NO LONGER BEHAVE AS FILED.

WHY THIS EXISTS. A defect inventory goes stale in ONE DIRECTION: a fixed defect keeps
reading as live, because the person who fixes it is not the person editing the inventory.
Measured repeatedly on this tree — a roadmap headline outlived its programme by ~30
slices, six consumer-ask rows were already fixed while filed as live work, and four of six
"known issue" root causes were wrong when re-derived. Prose cannot be re-run; this can.

It grades the DOC's own repro, never a paraphrase. That distinction is load-bearing: a
hand-retyped witness that differs in one type is a different program, and grading it tells
you nothing about the row.

USAGE
    python3 scripts/check-filed-witnesses.py docs/internals/inventory
    python3 scripts/check-filed-witnesses.py docs/internals/silent-class-inventory.md
    python3 scripts/check-filed-witnesses.py --json out.json <doc-or-dir>...
    python3 scripts/check-filed-witnesses.py --strict <doc-or-dir>...
    python3 scripts/check-filed-witnesses.py --self-test

An argument may be a MONOLITH or a DIRECTORY of one-row files — see `resolve`. Both grade
identically, which is what lets the gate command stay put while the split lands.

`--self-test` proves the outcome vocabulary can be made to fire on demand, on specimens
whose outcome is known by construction. A classifier that has never been seen
to distinguish two outcomes is not known to distinguish them — the same discipline
`scripts/silent-sweep/sabotage.py` applies to the sweep grader, and the reason the
`trap_loads` column below exists at all.

Exit 0 when every row still behaves as filed; 1 when any row has MOVED (which is a
prompt to re-grade the doc, not necessarily a regression — a row that moved because it
was FIXED is the common case and the whole point).

`--strict` ALSO fails on a row this cannot grade at all. Without it an UNGRADED row is
reported in the fourth column and exits 0, so a doc can gain rows with no witness and every
gate in the ladder stays green — the row discipline was enforced by nothing. That is the same
shape as the defects this file exists to catch: a real condition that no instrument reports.
It is a FLAG rather than the default because `silent-class-inventory-2.md` currently has ten
rows whose filed behaviour no longer reproduces, and a gate that reds for pre-existing debt in
a doc the author is not editing gets bypassed rather than obeyed. The per-PR enforcement lives
in `tests/vl_inventory_rows_test.ts`, which asserts the STRUCTURE (a known-outcome status line
and a repro block) without running anything.

DOC SHAPE IT READS
    ### <ID> — <title>
    **<declared status> · <notes>**
    ...
    Repro[ (...)]:

        <4-space-indented VL program>

A `Repro` LEAD-IN IS THE ONLY WAY IN, and lines inside the block that begin with `//` are
kept (they may be directives), so the program is used verbatim. The lead-in was once
optional — the first indented block after the status line stood in for it — and prose is
indented too: D957 graded for weeks on a numbered list's continuation lines, which are five
spaces in. The rule is now retired BY CONSTRUCTION, every row carrying a label, so an
unlabelled block is `no Repro block`, which `--strict` fails and names.

A WITNESS THAT DOES NOT PARSE IS ITS OWN OUTCOME, `witness_unparsed` — never
`check_reject`. Prose is a parse error, and a row declaring a check reject therefore
graded `as filed` on a program that was never a program. This is the SECOND half of that
fix and it survives the first: a label can still be put above a paragraph, and only
RUNNING the block tells you. A row whose FILED outcome really is a parse-stage refusal
(D46, D444, D471) says `parse error` in its status line and grades normally.

A witness that needs MORE THAN ONE MODULE splits the block with `// file: <name>.vl` marker
lines; each marker starts a file and the LAST one is the entry that is checked, run and
built. Relative imports between the sections resolve. See `split_files`.
"""
import json, re, subprocess, sys, tempfile, os
from pathlib import Path

VL = "./scripts/vl-host/target/release/vl"
COMPILER = "build/vl-compiler.wasm"

# Declared-status vocabulary -> canonical outcome. Ordered: first match wins, so the more
# specific phrases precede the substrings they contain.
# A row marked CLOSED expects the repro to RUN. Without this a re-graded doc could never
# grade clean, the non-zero exit would fire forever, and the signal would be ignored —
# which is how the doc got eight stale rows in the first place.
DECLARED = [
    # A CLOSED ROW WHOSE RIGHT OUTCOME IS A REFUSAL. Most closes turn a silent cell into a
    # working program, and `closed -> runs` covered every row until D35: there the checker
    # ALREADY refused the direct spelling and the defect was that the refusal did not survive
    # a type parameter, so the fix makes the filed witness a LOUD CHECK REJECT and `runs`
    # would grade the fix as a failure. These two phrases must precede the bare `closed`
    # entry — first match wins — and a row using one is asserting that the refusal is the
    # outcome, not that the grader was talked out of an inconvenient answer.
    ("now a loud check reject",    "check_reject"),
    ("now a loud emit reject",     "emit_reject"),
    # A REFUTATION PIN — a row whose witness is a program that RUNS CORRECTLY today and
    # whose filing is "a proposed change reddens this, so the change is refused". The
    # vocabulary had no state for it and the file had no way to grade one: such controls
    # lived as prose inside other rows ("the control the fix must not redden"), unrun. A
    # pin is exactly the thing that must be re-run — its whole value is that it flips when
    # someone lands the refused change — so it gets a status of its own rather than
    # borrowing `closed`, which would file a non-defect as a fixed defect. Listed ahead of
    # the bare `closed` entry, like the two above it: first match wins.
    ("runs today and must keep running", "runs"),
    ("closed",                     "runs"),
    # LOADS THEN TRAPS — added because the vocabulary had no state for it and D19 was
    # graded `silent_invalid_wasm` while its prose said the opposite. A module that
    # exists and a non-zero run rc are TWO outcomes, not one: the engine can refuse the
    # module (nothing runs, no output) or accept it and have the PROGRAM trap (it loads,
    # prints its earlier lines, then dies). Conflating them makes a run-time miscompile
    # read as a build-time one, which is the wrong layer to go looking in. Listed ahead
    # of the `check-clean …` phrases so a status line naming both is read as the more
    # specific one.
    ("loads then traps",           "trap_loads"),
    ("trap after load",            "trap_loads"),
    ("check-clean invalid wasm",   "silent_invalid_wasm"),
    ("check-clean silently wrong", "silent_wrong_value"),
    ("check-clean wrong evaluation", "silent_wrong_evalcount"),
    ("compiler trap",              "compiler_trap"),
    ("loud emit reject",           "emit_reject"),
    ("loud check reject",          "check_reject"),
]

# A vocabulary word under a NEGATION means the opposite of what it matches, and the match is
# a plain substring, so `not closed` contains `closed` and graded as a FIXED row. That is not
# hypothetical: this file's own docstring recorded a live row reading "deliberately NOT closed
# by D35" grading itself `runs`, and D425 had to AVOID the word to dodge it — a row censoring
# its own prose to appease its grader is the instrument failing, not the prose.
#
# Refusing to grade is the right answer rather than guessing the negation's scope: `--strict`
# turns an ungradeable row into a failure that NAMES the row, so the author rewords it and the
# count stays honest. Silently returning the inverted outcome is what produced a false `as
# filed`, which is the one result this script exists to make impossible.
NEGATIONS = (" not ", " never ", " no longer ", " isn't ", " is not ", " nor ", " rather than ")


def negated_before(low, pos):
    """True when a negation governs the vocabulary match starting at `pos`. Only the text in
    the same clause is considered — a negation on the far side of a sentence boundary or a
    list separator is about something else."""
    window = low[:pos]
    for sep in (".", ";", "·", "—", ","):
        cut = window.rfind(sep)
        if cut != -1:
            window = window[cut + len(sep):]
    window = " " + window + " "
    return any(n in window for n in NEGATIONS)


def declared_outcome(status_line):
    """First LIST match wins, not first match by position — so a status line must not use a
    vocabulary word about some OTHER row. A negated match is refused rather than inverted;
    see NEGATIONS above."""
    low = status_line.lower()
    for needle, outcome in DECLARED:
        pos = low.find(needle)
        if pos != -1:
            if negated_before(low, pos):
                return None
            return outcome
    return None

# The same marker vocabulary `scripts/silent-sweep/grade.py` separates its `invalid_wasm`
# and `trap` columns with, so the two graders answer the same question the same way.
INVALID_MARKERS = (
    "Invalid input WebAssembly code",
    "wasm validation",
    "failed to parse",
    "type mismatch: expected",
    "WebAssembly translation error",
    "validation error",
)
TRAP_MARKERS = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
                "null reference", "cast failure", "integer overflow")

# A WITNESS THAT DID NOT PARSE IS NOT A CHECK REJECT. `vl check` closes with the failing
# STAGE — `Found 2 errors. (parse error)` — and lex/parse is the one stage where the row's
# program was never a program at all. Folding it into `check_reject` is how prose graded
# `as filed`: an indented English paragraph refuses like a type error, and the only row in
# the tree that filed one passed `--strict` for it. A row whose real outcome IS a
# parse-stage reject escapes through `names_parse_error` below.
PARSE_STAGE = "(parse error)"
PARSE_DECLARED = re.compile(r"parse[ -](error|stage)|at the parse\b", re.I)


def names_parse_error(status_line):
    """True when the status EXPLICITLY files a parse-stage refusal as the outcome. Negated
    the same way `declared_outcome` is: `not a parse error` must not license one."""
    m = PARSE_DECLARED.search(status_line or "")
    return bool(m) and not negated_before(status_line.lower(), m.start())


# A MULTI-FILE WITNESS. Some defects need two modules to exist at all — a merge-time registry
# collision between two modules' same-named `self`-functions (D1120) cannot be spelled in one
# file, and until this existed such a row was UNGRADEABLE and so unfileable under `--strict`.
# The repro block carries `// file: <name>.vl` marker lines; each starts a new file, and the
# LAST section is the entry the three channels run. A block with no marker is one file, as
# before. Relative imports resolve inside the temp dir, so `import { x } from "./a"` works.
FILE_MARK = re.compile(r"^// file: (\S+\.vl)\s*$")


def split_files(src):
    """(name, source) per `// file:` section; a single unnamed section is `w.vl`."""
    files, name, body = [], None, []
    for ln in src.splitlines():
        m = FILE_MARK.match(ln)
        if m:
            if name is not None:
                files.append((name, "\n".join(body).rstrip() + "\n"))
            name, body = m.group(1), []
        else:
            body.append(ln)
    if name is None:
        return [("w.vl", src)]
    files.append((name, "\n".join(body).rstrip() + "\n"))
    return files


def run_program(src):
    """Classify what the compiler does with `src`, on the same three channels the
    silent-sweep harness separates: check (diagnostic), run (value), build (module)."""
    with tempfile.TemporaryDirectory() as td:
        for name, body in split_files(src):
            f = os.path.join(td, name)
            Path(f).write_text(body)
        chk = subprocess.run([VL, "check", f, "--compiler", COMPILER],
                             capture_output=True, text=True, timeout=120)
        run = subprocess.run([VL, "run", f, "--compiler", COMPILER],
                             capture_output=True, text=True, timeout=120)
        if chk.returncode != 0:
            diag = (chk.stdout + chk.stderr).strip()
            if PARSE_STAGE in diag:
                return "witness_unparsed", diag[:200]
            return "check_reject", diag[:200]
        if run.returncode == 0:
            return "runs", run.stdout.strip()[:200]
        err = (run.stdout + run.stderr).strip()
        if "emit error" in err:
            return "emit_reject", err[:200]
        # No module at all vs a module that exists.
        out = os.path.join(td, "w.wasm")
        bld = subprocess.run([VL, "build", f, "--compiler", COMPILER, "-o", out],
                             capture_output=True, text=True, timeout=120)
        if bld.returncode != 0 and not os.path.exists(out):
            return "compiler_trap", err[:200]
        # A module WAS written, and TWO different outcomes used to share this name.
        # The engine REFUSING it (nothing runs) and the engine LOADING it and the
        # PROGRAM trapping (it runs, prints, then dies) are different defects in
        # different layers; `silent_invalid_wasm` for both sent readers to the emitter
        # when the miscompile was in what the emitted code DOES.
        if any(m in err for m in INVALID_MARKERS):
            return "silent_invalid_wasm", err[:200]
        if any(m in err for m in TRAP_MARKERS):
            return "trap_loads", err[:200]
        return "silent_invalid_wasm", err[:200]


# Specimens whose outcome is known BY CONSTRUCTION, for `--self-test`. Predicted here,
# in source, ahead of the run — the point is to be able to see the vocabulary fire, not
# to record whatever it happens to say.
SELF_TEST = [
    ("runs", "print(6 * 7)\n"),
    ("check_reject", "const x: i32 = \"nope\"\nprint(x)\n"),
    # A VALID module that LOADS, prints, and then traps on an out-of-bounds index.
    # Before `trap_loads` existed this graded `silent_invalid_wasm`, which is what D19
    # sat behind.
    ("trap_loads", "const xs: i32[] = [1, 2]\nprint(xs.length)\nprint(xs[9])\n"),
    # A TWO-FILE program: the `// file:` splitter must deliver the module the entry imports.
    # Without the split this is one file whose first line is a comment and whose second is an
    # `export` in a module that then imports from a sibling that does not exist.
    ("runs", "// file: a.vl\nexport function six(): i32 { return 6 }\n"
             "// file: main.vl\nimport { six } from \"./a\"\nprint(six() * 7)\n"),
    # PROSE, which is what a row files when its real repro is shadowed by an indented
    # English paragraph. It must NOT grade `check_reject`: that is the outcome most rows
    # declare, so folding the two together is a row passing `--strict` on a program that
    # never parsed. Predicted here so the separation is observed, not assumed.
    ("witness_unparsed",
     "The classifier answers only for the distinct-backing kinds, and the caller's\n"
     "binding stays non-null: strictly worse than the refusal it replaced.\n"),
]


def self_test():
    print("outcome-vocabulary self-test (prediction stated in source, before the run)")
    bad = 0
    for want, src in SELF_TEST:
        got, detail = run_program(src)
        ok = got == want
        if not ok:
            bad += 1
        print(f"  want {want:20s} got {got:20s} {'ok' if ok else '** WRONG **'}")
        if not ok:
            print(f"      {detail.splitlines()[0] if detail else ''}")
    print(f"{len(SELF_TEST)} specimens · {len(SELF_TEST)-bad} routed correctly · {bad} wrong")
    return 1 if bad else 0

SEC = re.compile(r"^#{2,4}\s+(D\d+(?:-?[A-Za-z][A-Za-z0-9]*)?|[A-Z]\d+)\s+[—-]\s+(.*)$")
# A row id may carry a suffix, and the suffix grammar is whatever authors have reached for:
# `D661A`, `D804b`, and `D1009-N` (minted with a hyphen by a session avoiding a cross-session
# id collision). The hyphenated form did NOT match until 2026-09-02, and the failure was
# SILENT: the row was not graded, not reported as ungradeable, and `--strict` still printed
# `0 not graded`. It had been stale for a day — its witness runs, and the defect it describes
# closed as D1009.
#
# WIDENING THE PATTERN IS THE SMALL HALF. The real fix is `unparsed_row_heads` below: count the
# POPULATION of row-shaped headings and assert every one was parsed, so the next id shape
# nobody anticipated fails loudly instead of vanishing. A parser that silently drops what it
# does not recognise cannot be audited by reading its output — which is exactly what
# `--strict`'s four columns were supposed to guarantee.

# A heading that plainly NAMES a D-row, whatever suffix grammar it uses. `SEC` must match every
# one of these; any it misses is a row the grader cannot see.
ROWHEAD = re.compile(r"^#{2,4}\s+D\d")

# A DOC ARGUMENT MAY BE A DIRECTORY OF ONE-ROW FILES. The inventories are moving to
# `docs/internals/inventory/D1042.md`, one file per row, because every defect PR appended to
# one file's tail and two concurrent PRs conflicted there nearly every hour — once splicing
# two rows into the middle of a third. BOTH forms read the same here, so the gate command
# does not change on merge day: a directory holding `D*.md` is that many one-row docs, and a
# directory holding none yet falls back to the monolith named in its own README. One source
# of truth for that mapping, written and read by `scripts/inventory/split.py`.
SOURCE_MARK = re.compile(r"^<!--\s*inventory-split:\s*source\s+(\S+)\s*-->\s*$", re.M)


def row_id_key(rid):
    """Sort `D9` before `D10`, and `D661` before `D661A`."""
    m = re.match(r"^([A-Za-z]+)(\d+)(.*)$", rid or "")
    return (m.group(1), int(m.group(2)), m.group(3)) if m else (rid or "", 0, "")


def resolve(arg):
    """A doc path as given, or the row files under a directory, in id order."""
    p = Path(arg)
    if not p.is_dir():
        return [arg]
    files = sorted(p.glob("D*.md"), key=lambda f: row_id_key(f.stem))
    if files:
        return [str(f) for f in files]
    readme = p / "README.md"
    m = SOURCE_MARK.search(readme.read_text()) if readme.exists() else None
    if not m:
        raise SystemExit(f"{arg}: holds no `D*.md` rows, and {readme} carries no "
                         f"`<!-- inventory-split: source ... -->` line to fall back to")
    return [m.group(1)]


def unparsed_row_heads(doc):
    """Row-shaped headings `SEC` failed to parse — the grader's blind spot, named."""
    out = []
    for i, ln in enumerate(Path(doc).read_text().splitlines()):
        if ROWHEAD.match(ln) and not SEC.match(ln):
            out.append((i + 1, ln.strip()))
    return out
# ANY heading, row or not. A row's scope has to END at one: `SEC` alone only closes a row at
# the NEXT ROW, so the last row of a doc absorbed everything after it — in
# `silent-class-inventory.md` that is the whole of `## 3. Shared-root analysis`, whose
# `### Root A — …` headings are deliberately not rows. That still bounds a `Repro:` lead-in
# written BELOW such a heading, which belongs to no row and must not be handed to the one
# above it. Found by sabotage: deleting a row's repro entirely left it reporting as
# gradeable, because a block far below stood in.
ANYHEAD = re.compile(r"^#{1,6}\s")

def block_at(lines, i):
    """The indented program the `Repro` lead-in at `lines[i]` introduces, or "". The lead-in
    may WRAP onto further prose lines before the block (D16 does), so scan forward for the
    first indented line, bounded so a section with no block at all cannot swallow the next
    one's."""
    body, j, scanned = [], i + 1, 0
    while j < len(lines) and scanned < 6 and not lines[j].startswith("    "):
        if lines[j].strip() and re.match(r"^#{2,4}\s", lines[j]):
            break
        j += 1; scanned += 1
    while j < len(lines) and (lines[j].startswith("    ") or not lines[j].strip()):
        body.append(lines[j][4:] if lines[j].startswith("    ") else "")
        j += 1
    src = "\n".join(body).rstrip()
    return src + "\n" if src.strip() else ""


def parse(doc):
    """Yield (id, title, declared_status_line, repro_source) per section."""
    lines = Path(doc).read_text().splitlines()
    rows, cur = [], None
    for i, ln in enumerate(lines):
        m = SEC.match(ln)
        if m:
            if cur: rows.append(cur)
            cur = {"id": m.group(1), "title": m.group(2).strip(), "status": None,
                   "repro": "", "doc": doc, "line": i + 1}
            continue
        if ANYHEAD.match(ln):
            # A non-row heading CLOSES the row it follows; see `ANYHEAD`.
            if cur: rows.append(cur)
            cur = None
            continue
        if not cur:
            continue
        # A status line may WRAP (inventory #2's D3 does), and a wrapped one is still a
        # status line: joining it is the difference between grading that row and reporting
        # it as `not graded` forever. Bounded, and it must actually close — an unterminated
        # `**` opener is left alone rather than swallowing the section.
        if cur["status"] is None and ln.startswith("**"):
            if ln.rstrip().endswith("**") and len(ln.rstrip()) > 2:
                cur["status"] = ln.strip("*").strip()
            else:
                parts, k = [ln], i + 1
                while k < len(lines) and k - i <= 5:
                    parts.append(lines[k])
                    if lines[k].rstrip().endswith("**"):
                        cur["status"] = " ".join(parts).strip("*").strip()
                        break
                    if not lines[k].strip():
                        break
                    k += 1
        # A `Repro:` LEAD-IN AND NOTHING ELSE. The first indented block after the status
        # line used to stand in where a doc wrote no lead-in, and an indented block is not
        # a program — a numbered list's continuation lines are five spaces in, which is
        # correct Markdown, and D957 graded on that English for weeks. The 25 rows that
        # relied on the fallback now carry labels over their own unchanged programs, so the
        # rule is retired with nothing to catch. Taking the FIRST labelled block is what
        # keeps a row's `**Control**` program from being mistaken for its defect program.
        if cur["repro"] or not re.match(r"^Repro\b", ln):
            continue
        cur["repro"] = block_at(lines, i)
    if cur: rows.append(cur)
    return rows

def main(argv):
    out_json, docs, strict = None, [], False
    it = iter(argv)
    for a in it:
        if a == "--json": out_json = next(it)
        elif a == "--strict": strict = True
        elif a == "--self-test": return self_test()
        else: docs.append(a)
    if not docs:
        print(__doc__); return 2

    results, moved, ungradable, unparsed = [], [], [], []
    for doc in [d for arg in docs for d in resolve(arg)]:
        for ln_no, head in unparsed_row_heads(doc):
            unparsed.append((doc, ln_no, head))
        for r in parse(doc):
            if not r["repro"]:
                ungradable.append((r, "no Repro block")); continue
            want = declared_outcome(r["status"] or "")
            if want is None:
                ungradable.append((r, "status line names no known outcome")); continue
            got, detail = run_program(r["repro"])
            # AN UNPARSED WITNESS IS NOT A GRADE, it is a row with no program. A status may
            # file a parse-stage refusal deliberately (D46, D444, D471 all do) and those
            # grade as the check reject they declare; anything else lands in the fourth
            # column. Retiring the indented fallback did not retire this: a label can be
            # written above a paragraph too, and only running the block says so.
            if got == "witness_unparsed":
                if not names_parse_error(r["status"]):
                    ungradable.append((r, "the witness does not PARSE, and the status does "
                                          "not file a parse error as the outcome"))
                    continue
                got = "check_reject"
            # A WRONG VALUE IS INVISIBLE ON THE THREE CHANNELS `run_program` reads: the
            # program exits 0 and the grader has nothing to compare its output against, so
            # every `check-clean silently wrong` row graded `runs` and reported itself MOVED
            # forever. That is the same blind spot the doc's own §7 says the ladder audit has,
            # reproduced in the instrument written to catch it. A row declaring that outcome
            # must carry the wrong output it produces, as a `// PRINTS <text>` line in its own
            # repro (a VL comment, so the program still runs verbatim); the grader then
            # separates "still prints the wrong thing" from "prints something else now".
            if want == "silent_wrong_value" and got == "runs":
                pr = [l.split("PRINTS", 1)[1].strip()
                      for l in r["repro"].splitlines() if "// PRINTS" in l]
                if not pr:
                    ungradable.append(
                        (r, "declares a wrong VALUE but the repro carries no `// PRINTS` line"))
                    continue
                got = "silent_wrong_value" if detail.strip() == pr[-1] else "runs"
            rec = {**r, "declared": want, "actual": got, "detail": detail,
                   "agrees": got == want}
            results.append(rec)
            if not rec["agrees"]:
                moved.append(rec)

    w = max([len(r["id"]) for r in results] + [4])
    print(f"{'ID':<{w}}  {'FILED':<22} {'TODAY':<22} VERDICT")
    for r in results:
        v = "as filed" if r["agrees"] else "** MOVED **"
        print(f"{r['id']:<{w}}  {r['declared']:<22} {r['actual']:<22} {v}")
    for r, why in ungradable:
        print(f"{r['id']:<{w}}  {'-':<22} {'-':<22} not graded ({why})")

    print(f"\n{len(results)} graded · {len(results)-len(moved)} as filed · "
          f"{len(moved)} MOVED · {len(ungradable)} not graded · "
          f"{len(unparsed)} UNPARSED")
    if moved:
        print("\nRows whose filed behaviour no longer reproduces — re-grade the doc:")
        for r in moved:
            print(f"  {r['doc']}:{r['line']}  {r['id']} — {r['title']}")
            print(f"      filed {r['declared']}, now {r['actual']}: {r['detail'].splitlines()[0] if r['detail'] else ''}")
    # AN UNGRADED ROW IS THE FAILURE THIS FILE EXISTS TO PREVENT, and until `--strict` it
    # was the one condition the exit code could not express: `2 not graded` and `0 not
    # graded` both exited 0, so the fourth column was the only thing separating them and a
    # summary quoting the first three read identically either way.
    if ungradable and strict:
        print("\nRows this cannot grade - a filed row must carry a witness the checker RUNS:")
        for r, why in ungradable:
            print(f"  {r['doc']}:{r['line']}  {r['id']} - {r['title']}")
            print(f"      {why}")
        print("      fix: give it a `Repro:` block and a status line naming one of "
              + ", ".join(sorted({o for _, o in DECLARED})) + ".")
        print("      a witness that does not PARSE is prose, not a program: write the "
              "program, or — where the parse-stage refusal IS the filed outcome — say "
              "`parse error` in the status line.")
        print("      a defect reachable only under a change that was REFUSED is a "
              "refutation pin: file the program that must keep RUNNING, with the status "
              "`runs today and must keep running`.")
    # AN UNPARSED ROW HEADING IS WORSE THAN AN UNGRADED ROW, because it is not in ANY
    # column. `D1009-N` sat here for a day: not graded, not reported ungradeable, and
    # `--strict` printing `0 not graded` beside it. The row had gone stale — its witness runs
    # and the defect closed as D1009 — and nothing said so. Reading the four columns cannot
    # catch what never entered them, so the population is counted instead of the matches.
    if unparsed:
        print("\nRow headings this parser did NOT recognise - they are in no column above:")
        for doc, ln_no, head in unparsed:
            print(f"  {doc}:{ln_no}  {head[:110]}")
        print("      fix: widen `SEC`'s id pattern to admit the suffix, or rename the row.")
    if out_json:
        Path(out_json).write_text(json.dumps(results, indent=2))
        print(f"\nwrote {out_json}")
    return 1 if (moved or unparsed or (ungradable and strict)) else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
