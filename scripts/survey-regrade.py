#!/usr/bin/env python3
"""
Re-run the MEASUREMENT filed under every row of the code-quality survey and report which
rows no longer read what they claim.

WHY THIS EXISTS. The survey is a scheduling document made of numbers — "11.75% of self
time", "21% inclusive", "86 of 86 files" — and until this file nothing re-ran any of them.
It went stale exactly the way the defect inventory does, in one direction: the person who
lands the fix is not the person editing the survey. Two live instances, both found by an
agent reading the page to pick its next lane: row 8's "remaining: O(1) index (campaign)"
described an index #2607 had already built, and row 7 still names `letListBuildKind` and
`letListBuildSlot`, which #2567 merged into `letListBuild` — 16% of a self-compile against
1.58% for the name that survives. `check-filed-witnesses.py` is the model, and the shape of
the failure is identical: prose cannot be re-run, this can.

WHAT A `filed:` NUMBER MEANS. It is what the row's claim implies TODAY, not the historical
reading that motivated the row. For an OPEN row that is the cost it still carries; for a
LANDED row it is the invariant the fix established (dead exports 0, the merged renderer's
twin gone). A landed row whose fix was reverted therefore reads stale, which a history
would not catch.

USAGE
    python3 scripts/survey-regrade.py docs/internals/code-quality-survey-2026-09/README.md
    python3 scripts/survey-regrade.py --profile <guest-profile.json> <doc>   # + share rows
    python3 scripts/survey-regrade.py --strict <doc>       # a moved row is a failure too
    python3 scripts/survey-regrade.py --self-test

The `shell` rows are cheap and run by default. The `profile-incl` / `profile-self` rows need
one guest profile of a self-compile, which costs a `--names` seed build plus a profiled
compile — far more than a merge gate's budget — so they run only under `--profile`, and ONE
profile serves every such row. `tests/vl_survey_measure_test.ts` is what runs per PR: it
asserts the STRUCTURE (every ranked row has a parseable block) without measuring anything.

EXIT CODE. Non-zero when a row's number is NOT RE-RUNNABLE — no `Measure:` block, a block
this cannot parse, or a command that failed. That is the gate: the survey may hold numbers
only if they can be re-read. A row that MOVED is printed as a finding and exits 0, because
movement in either direction is information rather than breakage:

    stale-live    today is above the filed cost — the row understates what it is worth
    stale-closed  today is far below it — the work landed, or the cost moved elsewhere

`--strict` makes a moved row a failure too, which is the periodic "is this document
current" pass rather than the per-PR one.

DOC SHAPE IT READS

    ### row <N> — <title>

    Measure:

        kind: shell | profile-incl | profile-self | none
        cmd:  <shell command>          (kind: shell — the LAST number in stdout is read)
        what: <function name>          (kind: profile-*)
        filed: <number>
        tol:  <number>
        dir:  both | at-most | at-least        (optional, default both)
        why:  <sentence>               (kind: none — why no number is re-runnable)

`dir` says which direction of movement is a finding. A SHARE is two-sided (`both`); an
invariant a landing established — dead exports 0, one arena walk, the twin renderer gone —
is one-sided, and reporting it as stale when the tree does BETTER than filed would train
the reader to ignore the instrument.

A `Measure:` lead-in is the only way in, for `check-filed-witnesses.py`'s reason: prose is
indented too, and a block with no label is not a measurement.
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seed_provenance  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ROW = re.compile(r"^###\s+row\s+(\d+)\b\s*(?:[-—]\s*(.*))?$")
LEAD = re.compile(r"^Measure:\s*$")
KINDS = ("shell", "profile-incl", "profile-self", "none")
NUM = re.compile(r"-?\d+(?:\.\d+)?")


def parse(doc):
    """Every `### row N` heading in `doc`, with the `Measure:` block under it (or None)."""
    lines = Path(doc).read_text(encoding="utf-8").split("\n")
    rows, i = [], 0
    while i < len(lines):
        m = ROW.match(lines[i])
        if not m:
            i += 1
            continue
        rec = {"doc": str(doc), "line": i + 1, "id": "row " + m.group(1),
               "title": (m.group(2) or "").strip(), "block": None, "why": None}
        j = i + 1
        while j < len(lines) and not ROW.match(lines[j]):
            if LEAD.match(lines[j]):
                body, k = {}, j + 1
                while k < len(lines) and (lines[k].startswith("    ") or not lines[k].strip()):
                    if lines[k].strip():
                        key, _, val = lines[k].strip().partition(":")
                        body[key.strip()] = val.strip()
                    k += 1
                rec["block"] = body
                break
            j += 1
        rows.append(rec)
        i += 1
    return rows


def profile_shares(path):
    """(inclusive, self) share by function name, from a `VL_PROFILE_GUEST` JSON.

    The counting rule is `scripts/profile-rank.py`'s, deliberately: SELF is the samples
    whose LEAF is the frame, INCL the samples with it anywhere on the stack counted ONCE,
    so recursion cannot double-count. The ancestor NAME SET is memoised per stack node —
    a compiler stack is deep, and walking it once per sample is what makes a naive reader
    slower than the compile it is reading.
    """
    prof = json.loads(Path(path).read_text(encoding="utf-8"))
    th = prof["threads"][0]
    strs = (th.get("stringArray") or th.get("stringTable")
            or prof.get("shared", {}).get("stringArray", []))
    tbl, frames, funcs = th["stackTable"], th["frameTable"], th["funcTable"]
    fname = [strs[n] for n in funcs["name"]]
    frame_func, st_frame, st_prefix = frames["func"], tbl["frame"], tbl["prefix"]
    anc, incl, own = {}, {}, {}
    stacks = th["samples"]["stack"]
    total = len(stacks)

    def ancestors(si):
        chain, cur = [], si
        while cur is not None and cur >= 0 and cur not in anc:
            chain.append(cur)
            cur = st_prefix[cur]
        acc = anc.get(cur, frozenset()) if cur is not None and cur >= 0 else frozenset()
        for node in reversed(chain):
            acc = acc | {fname[frame_func[st_frame[node]]]}
            anc[node] = acc
        return anc[si]

    for si in stacks:
        if si is None or si < 0:
            continue
        leaf = fname[frame_func[st_frame[si]]]
        own[leaf] = own.get(leaf, 0) + 1
        for n in ancestors(si):
            incl[n] = incl.get(n, 0) + 1

    def pct(d, want):
        # A guest frame may carry a module suffix (`name$mN`); the survey names the function.
        hits = sum(c for n, c in d.items() if n == want or n.startswith(want + "$"))
        return 100.0 * hits / total if total else 0.0

    def present(want):
        return any(n == want or n.startswith(want + "$") for n in fname)

    return (lambda w: pct(incl, w)), (lambda w: pct(own, w)), total, present


def run_shell(cmd):
    """Run `cmd` from the repo root; the LAST number in stdout is the reading.

    `$PYTHON` is bound to THIS interpreter, so a block that re-runs another script writes
    `"$PYTHON" scripts/x.py` rather than `python3`: a box whose `python3` is a broken
    Homebrew build would otherwise report a working row as NOT RE-RUNNABLE, which is a
    claim about the toolchain wearing a claim about the tree.
    """
    env = dict(os.environ, PYTHON=sys.executable)
    p = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True,
                       timeout=600, env=env)
    if p.returncode != 0:
        return None, "command exited %d: %s" % (p.returncode,
                                                (p.stderr or p.stdout).strip()[:140])
    nums = NUM.findall(p.stdout)
    if not nums:
        return None, "command printed no number: %r" % p.stdout.strip()[:140]
    return float(nums[-1]), p.stdout.strip().splitlines()[-1][:80]


def grade(rows, prof, strict, require_profile=False, provenance=True):
    incl = own = present = None
    if prof:
        incl, own, nsamp, present = profile_shares(prof)
        print("profile: %s (%d samples)\n" % (prof, nsamp))
    graded, moved, broken, skipped, exempt = [], [], [], [], []
    for r in rows:
        b = r["block"]
        if b is None:
            broken.append((r, "no Measure: block"))
            continue
        kind = b.get("kind", "")
        if kind not in KINDS:
            broken.append((r, "kind is %r, not one of %s" % (kind, "/".join(KINDS))))
            continue
        if kind == "none":
            if not b.get("why"):
                broken.append((r, "kind: none with no `why:`"))
            else:
                exempt.append((r, b["why"]))
            continue
        try:
            filed, tol = float(b["filed"]), float(b.get("tol", 0))
        except (KeyError, ValueError):
            broken.append((r, "filed:/tol: missing or not a number"))
            continue
        if kind == "shell":
            if not b.get("cmd"):
                broken.append((r, "kind: shell with no `cmd:`"))
                continue
            today, note = run_shell(b["cmd"])
            if today is None:
                broken.append((r, note))
                continue
        else:
            if not b.get("what"):
                broken.append((r, "kind: %s with no `what:`" % kind))
                continue
            if incl is None:
                skipped.append(r)
                continue
            # A NAME THE PROFILE DOES NOT CARRY reads 0.00%, and "costs nothing" and "was
            # renamed out of the tree" are opposite facts wearing one number. Row 7 named
            # `letListBuildKind` for a year after #2567 merged it away; graded as a share it
            # would have printed a clean 0. It is the row that is stale, so say so.
            if not present(b["what"]):
                broken.append((r, "no frame named %r in the profile — the row names a "
                                  "function the tree no longer has" % b["what"]))
                continue
            today = (incl if kind == "profile-incl" else own)(b["what"])
            note = b["what"]
        # `dir:` is what lets an INVARIANT be filed honestly. A share is two-sided, but
        # "0 dead exports" and "one arena walk" are one-sided claims, and banding them
        # both ways reports a fall as a finding when a fall is the row being over-served.
        d = b.get("dir", "both")
        if d not in ("both", "at-most", "at-least"):
            broken.append((r, "dir is %r, not both/at-most/at-least" % d))
            continue
        if today > filed + tol and d in ("both", "at-most"):
            v = "stale-live"
        elif today < filed - tol and d in ("both", "at-least"):
            v = "stale-closed"
        else:
            v = "holds"
        rec = {**r, "filed": filed, "today": today, "tol": tol, "verdict": v, "note": note}
        graded.append(rec)
        if v != "holds":
            moved.append(rec)

    w = max([len(r["id"]) for r in rows] + [6])
    print("%-*s  %-10s %-10s %s" % (w, "ROW", "FILED", "TODAY", "VERDICT"))
    for r in graded:
        print("%-*s  %-10.4g %-10.4g %s" % (w, r["id"], r["filed"], r["today"], r["verdict"]))
    for r in skipped:
        print("%-*s  %-10s %-10s skipped (needs --profile)" % (w, r["id"], "-", "-"))
    for r, why in exempt:
        print("%-*s  %-10s %-10s not measurable (%s)" % (w, r["id"], "-", "-", why[:56]))
    for r, why in broken:
        print("%-*s  %-10s %-10s NOT RE-RUNNABLE (%s)" % (w, r["id"], "-", "-", why[:56]))

    print("\n%d graded · %d hold · %d moved · %d skipped · %d not measurable · "
          "%d NOT RE-RUNNABLE"
          % (len(graded), len(graded) - len(moved), len(moved), len(skipped),
             len(exempt), len(broken)))
    # The shell rows are graded against the tree, but a profile row is graded against a SEED,
    # so the summary names which one — the same rule the witness checker follows.
    # The self-test grades SYNTHETIC specimens in a temp dir, so the real tree's seed says
    # nothing about them; only a run over a real doc consults it.
    prov = seed_provenance.guard("survey-regrade", len(moved), out=sys.stdout) \
        if provenance else 0
    # `--strict` ALONE IS VACUOUS FOR A SHARE ROW: without `--profile` those rows report
    # `skipped`, and a skip is in neither `moved` nor `broken`, so a run that measured none of
    # them exits 0 and reads exactly like one that measured all of them.
    if require_profile and skipped:
        print("\n--require-profile: %d share row(s) reported `skipped` because no profile was\n"
              "  given. Take one with `scripts/perf/guest-profile.sh <dir> build "
              "compiler/entry.vl`\n  and pass `--profile <dir>/entry.json`." % len(skipped))
        for r in skipped:
            print("  %s:%d  %s" % (r["doc"], r["line"], r["id"]))
    if moved:
        print("\nRows whose filed number no longer reads — re-grade the survey:")
        for r in moved:
            print("  %s:%d  %s — %s" % (r["doc"], r["line"], r["id"], r["title"]))
            print("      filed %g (±%g), today %g: %s"
                  % (r["filed"], r["tol"], r["today"], r["verdict"]))
    if broken:
        print("\nRows whose number cannot be re-read — this is the failure:")
        for r, why in broken:
            print("  %s:%d  %s — %s" % (r["doc"], r["line"], r["id"], r["title"]))
            print("      %s" % why)
        print("      fix: give the row a `Measure:` block naming a kind, a filed number and "
              "a tolerance — or `kind: none` with a `why:` if no number is re-runnable.")
    return prov or (1 if (broken or (moved and strict) or (require_profile and skipped))
                    else 0)


SELF_TEST_DOC = """
### row 1 — a reading that holds

Measure:

    kind: shell
    cmd: echo 42
    filed: 42
    tol: 0

### row 2 — a reading that has GROWN

Measure:

    kind: shell
    cmd: echo 99
    filed: 10
    tol: 1

### row 3 — a reading that has FALLEN

Measure:

    kind: shell
    cmd: echo 1
    filed: 30.29
    tol: 2

### row 4 — a row with no block at all

Some prose, indented nowhere.

### row 5 — a declared exemption

Measure:

    kind: none
    why: the value is a readability claim, not a number

### row 6 — a share the synthetic profile must read exactly

Measure:

    kind: profile-self
    what: b
    filed: 75
    tol: 0

### row 7 — an inclusive share, counted once per sample

Measure:

    kind: profile-incl
    what: a
    filed: 100
    tol: 0

### row 8 — a function the profile does not carry

Measure:

    kind: profile-incl
    what: renamedAway
    filed: 16
    tol: 4
"""

# Two frames and four samples, so every share is exact by construction: `a` is the root of
# every stack (incl 100%, self 25% — it is the leaf of one sample), `b` is the leaf of the
# other three (self 75%, incl 75%). Nothing else exercises the profile reader, and a share
# arithmetic that has never been checked against a known answer is not known to be right.
SELF_TEST_PROFILE = {
    "threads": [{
        "stringArray": ["a", "b"],
        "funcTable": {"name": [0, 1]},
        "frameTable": {"func": [0, 1]},
        "stackTable": {"frame": [0, 1], "prefix": [None, 0]},
        "samples": {"stack": [0, 1, 1, 1]},
    }]
}


def self_test():
    """Prove each verdict can be made to fire, on rows whose reading is known by construction.

    A grader that has never been seen to separate two verdicts is not known to separate
    them — `check-filed-witnesses.py --self-test`'s discipline, and the reason row 2 and
    row 3 differ only in the DIRECTION they moved.
    """
    import tempfile
    want = {"row 1": "holds", "row 2": "stale-live", "row 3": "stale-closed",
            "row 4": "NOT RE-RUNNABLE", "row 5": "not measurable",
            "row 6": "holds", "row 7": "holds", "row 8": "NOT RE-RUNNABLE"}
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "survey.md"
        p.write_text(SELF_TEST_DOC, encoding="utf-8")
        prof = Path(d) / "profile.json"
        prof.write_text(json.dumps(SELF_TEST_PROFILE), encoding="utf-8")
        rows = parse(p)
        if len(rows) != 8:
            print("self-test FAILED: parsed %d rows, want 8" % len(rows))
            return 1
        import io
        import contextlib
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf):
            rc = grade(rows, str(prof), False, provenance=False)
        out = buf.getvalue()
    bad = []
    for rid, verdict in want.items():
        line = [l for l in out.split("\n") if l.startswith(rid + " ")]
        if not line or verdict not in line[0]:
            bad.append("%s: want %s, got %r" % (rid, verdict, line[0] if line else "<no row>"))
    if rc != 1:
        bad.append("exit code %d, want 1 (rows 4 and 8 are not re-runnable)" % rc)
    print(out)
    if bad:
        print("self-test FAILED:")
        for b in bad:
            print("  " + b)
        return 1
    print("self-test ok — every verdict fires on a specimen that must produce it, and a row "
          "with no block exits non-zero")
    return 0


def main(argv):
    docs, prof, strict, out_json, require_profile = [], None, False, None, False
    it = iter(argv)
    for a in it:
        if a == "--strict":
            strict = True
        elif a == "--require-profile":
            require_profile = True
        elif a == "--self-test":
            return self_test()
        elif a == "--profile":
            prof = next(it, None)
            if prof is None:
                print("--profile takes a guest-profile JSON "
                      "(scripts/perf/guest-profile.sh writes one)")
                return 2
        elif a == "--json":
            out_json = next(it)
        else:
            docs.append(a)
    if not docs:
        print(__doc__)
        return 2
    rows = [r for d in docs for r in parse(d)]
    if not rows:
        print("no `### row N` headings in %s" % ", ".join(docs))
        return 2
    rc = grade(rows, prof, strict, require_profile)
    if out_json:
        Path(out_json).write_text(json.dumps(rows, indent=2, default=str))
        print("\nwrote %s" % out_json)
    return rc


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
