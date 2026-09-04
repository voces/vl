#!/usr/bin/env python3
"""Reduce a day-one hit to its minimal witness, then say which ingredients it NEEDS.

    python3 scripts/day-one/minimise.py run.jsonl            # every hit in the sample
    python3 scripts/day-one/minimise.py run.jsonl --index 7
    python3 scripts/day-one/minimise.py --file witness.vl    # any program

Two halves, because a message is not a mechanism and a line is not an ingredient:

* **Delta-debug by line removal** — a removal is kept only while the GRADE and the
  MESSAGE both hold. Largest cut first, repeated to a fixpoint.
* **Ablation by AXIS** — the pair carries the plan that generated it, so every axis can
  be re-rendered at its other faces and re-graded. That table is the family: it names
  the annotation, the scope, the neighbour and the narrowing spelling the defect needs,
  which no amount of line removal can tell you.

Group hits by this table, never by the refusal's sentence.
"""
import argparse
import json
import re
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import grammar as G  # noqa: E402
import modules as M  # noqa: E402
import render as R  # noqa: E402
import sample as S  # noqa: E402

# The names a `// file:` section imports from a sibling section. A removal that takes the
# `export` out from under a surviving import leaves a program that no longer compiles for
# a reason that has nothing to do with the defect.
IMPORTED = re.compile(r'^import \{([^}]*)\} from "\./', re.M)


def _key(res):
    return (res["grade"], res["message"])


def _chains(lines):
    """The enclosing-block chain of each line — the shape a removal must not change.

    Depth alone is not enough: one contiguous cut can delete a `}` and the next `{`
    together, which preserves every depth while REPARENTING the lines below. That is
    how the first run of this loop reduced a module to a recursive `mkval` that had
    swallowed the statements and never ran.
    """
    out, stack = [], []
    for l in lines:
        out.append(tuple(stack))
        for ch in l:
            if ch == "{":
                stack.append(l)
            elif ch == "}" and stack:
                stack.pop()
    return out


def _declared(text):
    return set(re.findall(r"function (\w+)", text)) | set(
        re.findall(r"\bconst (\w+) = \(", text))


def _context(src):
    """What a removal may not break: a declaration whose call survives, and a call whose
    declaration survives. Guarding only one direction leaves witnesses that call an
    undeclared `mkval` — the refusal holds, and the program is no longer a program.

    `files` is the same rule for a MULTI-MODULE witness: a `// file:` marker is the
    program's shape, and deleting one merges two modules into a single file — which is
    the other face of the pair, not a smaller version of this one."""
    return {"declared": _declared(src),
            "must_call": {m for m in _declared(src)
                          if len(re.findall(r"\b%s\(" % m, src)) > 1},
            "files": len([l for l in src.splitlines() if M.FILE_MARK.match(l)])}


def _plausible(lines, keep_chains, ctx):
    """A candidate must still be the SAME program, minus lines: every surviving line
    under the same blocks, no block emptied, every name called still declared and every
    called declaration still called, and something still printed — a witness that prints
    nothing cannot be graded on output."""
    if _chains(lines) != keep_chains:
        return False
    for a, b in zip(lines, lines[1:]):
        if a.rstrip().endswith("{") and b.strip() == "}":
            return False
    text = "\n".join(lines)
    if len([l for l in lines if M.FILE_MARK.match(l)]) != ctx["files"]:
        return False
    for m in IMPORTED.finditer(text):
        for nm in [x.strip() for x in m.group(1).split(",") if x.strip()]:
            if not re.search(r"^export \w+ %s\b" % re.escape(nm), text, re.M):
                return False
    here = _declared(text)
    for name in ctx["declared"]:
        calls = len(re.findall(r"\b%s\(" % name, text))
        if calls and name not in here:
            return False
        if name in ctx["must_call"] and name in here and calls < 2:
            return False
    return (text.count("{") == text.count("}") and text.count("(") == text.count(")")
            and "print(" in text)


def minimise(src, want, compiler, tmpdir):
    """The greedy loop: keep a removal only while outcome AND message hold."""
    base = S.grade_src(src, want, compiler, tmpdir, "m0")
    lines = src.rstrip("\n").split("\n")
    ctx = _context(src)
    n = 0
    changed = True
    while changed:
        changed = False
        i = 0
        while i < len(lines):
            chains = _chains(lines)
            for cut in range(len(lines) - i, 0, -1):
                cand = lines[:i] + lines[i + cut:]
                keep = chains[:i] + chains[i + cut:]
                if not cand or not _plausible(cand, keep, ctx):
                    continue
                n += 1
                got = S.grade_src("\n".join(cand) + "\n", want, compiler, tmpdir,
                                  "m%d" % n)
                if _key(got) == _key(base):
                    lines = cand
                    changed = True
                    break
            else:
                i += 1
    return "\n".join(lines) + "\n", base


def ablate(pair, side, compiler, tmpdir):
    """One ingredient at a time: re-render the plan with each axis at each other face.

    `needed` means the defect SURVIVES the flip in name only — what the table reports
    is what each flip DOES, because a flip that makes the program run is the control
    the hit already has and a flip that changes the message names a second mechanism.
    """
    spec, faces = pair["spec"], dict(pair["facesA" if side == "a" else "facesB"])
    src, want = R.render_spec(spec, faces)
    base = S.grade_src(src, want, compiler, tmpdir, "ab0")
    rows, k = [], 0
    val = R.plan_of(spec)["value"]
    for ax in G.AXES:
        if ax.get("generator"):
            continue
        opts = ax["faces"]
        if ax["id"] == "narrowing":
            opts = [r["id"] for r in val["reads"]]
        elif ax["id"] == "named_vs_inline" and not val["decls"]:
            continue
        for face in opts:
            if face == "*" or face == faces[ax["id"]]:
                continue
            trial = dict(faces)
            trial[ax["id"]] = face
            try:
                tsrc, twant = R.render_spec(spec, trial)
            except Exception:
                continue
            if tsrc == src:
                continue
            k += 1
            got = S.grade_src(tsrc, twant, compiler, tmpdir, "ab%d" % k)
            rows.append((ax["id"], faces[ax["id"]] + " -> " + face, got["grade"],
                         "same" if _key(got) == _key(base) else "MOVED"))
    return base, rows


def ablate_modules(pair, side, compiler, tmpdir):
    """One UNIT at a time, for a `modules_split` pair.

    Line removal cannot answer this axis's question: the units are spread over two files,
    dropping one has to drop everything that depends on it, and the collision the three
    module rows all need is a NAME shared by two scopes rather than a line. `ablations`
    re-renders the spec without each unit, with the names un-collided, and with each
    moved unit kept in the entry instead.
    """
    spec, face = pair["spec"], pair[side]["face"]
    src, want = M.render(spec, face)
    base = S.grade_src(src, want, compiler, tmpdir, "abm0")
    rows = []
    for k, (label, trial) in enumerate(M.ablations(spec), 1):
        tsrc, twant = M.render(trial, face)
        if tsrc == src:
            continue
        got = S.grade_src(tsrc, twant, compiler, tmpdir, "abm%d" % k)
        rows.append(("units", label, got["grade"],
                     "same" if _key(got) == _key(base) else "MOVED"))
    return base, rows


def report_one(pair, compiler):
    side = "a" if pair["a"]["grade"] != "RUNS" else "b"
    other = "b" if side == "a" else "a"
    ablator = ablate_modules if pair["axis"] == "modules_split" else ablate
    with tempfile.TemporaryDirectory(prefix="vl-day-one-min-") as td:
        wit, base = minimise(pair[side]["src"], pair[side]["want"], compiler, td)
        baseline, rows = ablator(pair, side, compiler, td)
    print("=" * 72)
    print("s%d/%d  axis=%s  %s(%s)=%s   twin %s(%s)=%s" % (
        pair["seed"], pair["index"], pair["axis"], side, pair[side]["face"],
        pair[side]["grade"], other, pair[other]["face"], pair[other]["grade"]))
    print("  %s" % base["message"][:110])
    print("\nminimal witness (%d lines):\n" % len(wit.rstrip().split("\n")))
    for l in wit.rstrip().split("\n"):
        print("    " + l)
    print("\nablation — one ingredient at a time")
    print("  %-24s %-28s %-16s %s" % ("axis", "flip", "outcome", "vs base"))
    for ax, flip, grade, same in rows:
        print("  %-24s %-28s %-16s %s" % (ax, flip, grade, same))
    print("\nfeatures: %s" % ", ".join(pair["features"]))
    return wit


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("jsonl", nargs="?")
    ap.add_argument("--file")
    ap.add_argument("--want", default="")
    ap.add_argument("--index", type=int)
    ap.add_argument("--both", action="store_true",
                    help="also minimise BOTH-FAIL pairs (a missing feature, not a hit)")
    ap.add_argument("--compiler", default=S.SEED)
    a = ap.parse_args()

    if a.file:
        src = open(a.file, encoding="utf-8").read()
        want = [w for w in a.want.split("\n") if w]
        with tempfile.TemporaryDirectory(prefix="vl-day-one-min-") as td:
            wit, base = minimise(src, want, a.compiler, td)
        print("%s: %s\n" % (base["grade"], base["message"][:110]))
        print(wit)
        return 0

    pairs = [json.loads(l) for l in open(a.jsonl, encoding="utf-8") if l.strip()]
    want = ["DISAGREE", "RUNS-WRONG"]
    if a.both:
        want += ["BOTH-FAIL-SAME", "BOTH-FAIL-DIFFER"]
    hits = [p for p in pairs if p["verdict"] in want
            and (a.index is None or p["index"] == a.index)]
    if not hits:
        print("no hits in %s" % a.jsonl)
        return 0
    for p in hits:
        report_one(p, a.compiler)
    return 0


if __name__ == "__main__":
    sys.exit(main())
