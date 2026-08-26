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
    python3 scripts/check-filed-witnesses.py docs/internals/silent-class-inventory.md
    python3 scripts/check-filed-witnesses.py --json out.json <doc>...
    python3 scripts/check-filed-witnesses.py --self-test

`--self-test` proves the outcome vocabulary can be made to fire on demand, on three
specimens whose outcome is known by construction. A classifier that has never been seen
to distinguish two outcomes is not known to distinguish them — the same discipline
`scripts/silent-sweep/sabotage.py` applies to the sweep grader, and the reason the
`trap_loads` column below exists at all.

Exit 0 when every row still behaves as filed; 1 when any row has MOVED (which is a
prompt to re-grade the doc, not necessarily a regression — a row that moved because it
was FIXED is the common case and the whole point).

DOC SHAPE IT READS
    ### <ID> — <title>
    **<declared status> · <notes>**
    ...
    Repro[ (...)]:

        <4-space-indented VL program>

Only the FIRST indented block after the first `Repro` line is run. Lines inside it that
begin with `//` at top level are kept (they may be directives), so the program is used
verbatim.
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

def declared_outcome(status_line):
    """First LIST match wins, not first match by position — so a status line must not use
    a vocabulary word about some OTHER row. A live row reading "deliberately NOT closed by
    D35" graded as `closed`/`runs` and reported itself MOVED; the fix is the wording, but
    the trap is worth naming here because the failure looks like a regression."""
    low = status_line.lower()
    for needle, outcome in DECLARED:
        if needle in low:
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


def run_program(src):
    """Classify what the compiler does with `src`, on the same three channels the
    silent-sweep harness separates: check (diagnostic), run (value), build (module)."""
    with tempfile.TemporaryDirectory() as td:
        f = os.path.join(td, "w.vl")
        Path(f).write_text(src)
        chk = subprocess.run([VL, "check", f, "--compiler", COMPILER],
                             capture_output=True, text=True, timeout=120)
        run = subprocess.run([VL, "run", f, "--compiler", COMPILER],
                             capture_output=True, text=True, timeout=120)
        if chk.returncode != 0:
            return "check_reject", (chk.stdout + chk.stderr).strip()[:200]
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

SEC = re.compile(r"^#{2,4}\s+(D\d+[A-Za-z]?|[A-Z]\d+)\s+[—-]\s+(.*)$")

def parse(doc):
    """Yield (id, title, declared_status_line, repro_source) per section."""
    lines = Path(doc).read_text().splitlines()
    rows, cur = [], None
    for i, ln in enumerate(lines):
        m = SEC.match(ln)
        if m:
            if cur: rows.append(cur)
            cur = {"id": m.group(1), "title": m.group(2).strip(),
                   "status": None, "repro": None, "doc": doc, "line": i + 1}
            continue
        if not cur:
            continue
        if cur["status"] is None and ln.startswith("**") and ln.rstrip().endswith("**"):
            cur["status"] = ln.strip("*").strip()
        if cur["repro"] is None and re.match(r"^Repro\b", ln):
            # The `Repro:` lead-in may WRAP onto further prose lines before the block
            # (D16 does). Scan forward for the first indented line, bounded so a section
            # with no block at all cannot swallow the next one's.
            body, j = [], i + 1
            scanned = 0
            while j < len(lines) and scanned < 6 and not lines[j].startswith("    "):
                if lines[j].strip() and re.match(r"^#{2,4}\s", lines[j]):
                    break
                j += 1; scanned += 1
            while j < len(lines) and (lines[j].startswith("    ") or not lines[j].strip()):
                body.append(lines[j][4:] if lines[j].startswith("    ") else "")
                j += 1
            src = "\n".join(body).rstrip()
            if src.strip():
                cur["repro"] = src + "\n"
    if cur: rows.append(cur)
    return rows

def main(argv):
    out_json, docs = None, []
    it = iter(argv)
    for a in it:
        if a == "--json": out_json = next(it)
        elif a == "--self-test": return self_test()
        else: docs.append(a)
    if not docs:
        print(__doc__); return 2

    results, moved, ungradable = [], [], []
    for doc in docs:
        for r in parse(doc):
            if not r["repro"]:
                ungradable.append((r, "no Repro block")); continue
            want = declared_outcome(r["status"] or "")
            if want is None:
                ungradable.append((r, "status line names no known outcome")); continue
            got, detail = run_program(r["repro"])
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
          f"{len(moved)} MOVED · {len(ungradable)} not graded")
    if moved:
        print("\nRows whose filed behaviour no longer reproduces — re-grade the doc:")
        for r in moved:
            print(f"  {r['doc']}:{r['line']}  {r['id']} — {r['title']}")
            print(f"      filed {r['declared']}, now {r['actual']}: {r['detail'].splitlines()[0] if r['detail'] else ''}")
    if out_json:
        Path(out_json).write_text(json.dumps(results, indent=2))
        print(f"\nwrote {out_json}")
    return 1 if moved else 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
