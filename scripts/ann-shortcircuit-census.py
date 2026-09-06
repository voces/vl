#!/usr/bin/env python3
"""Census the binding classifiers that SHORT-CIRCUIT on the annotation.

A `letIs*` / `paramIs*` classifier decides a binding's rep. Most open with

    if d.letType >= 0 { …read the annotation…; return false }

so the annotation is consulted and the initializer never is. That is correct for an
annotation that NAMES A REP and wrong for one that does not — a negation is a checker-only
refinement with no positive type of its own, so a binding annotated with one must take its
initializer's rep (D1773). Every classifier carrying the guard is a place the negation is
opaque; this lists them so the family is graded rather than sampled.

    python3 scripts/ann-shortcircuit-census.py            # the table
    python3 scripts/ann-shortcircuit-census.py --names    # one classifier name per line
    python3 scripts/ann-shortcircuit-census.py --check    # non-zero if the count rose

`--check` reads `scripts/ann-shortcircuit-baseline.json`, one entry per classifier, and
fails when a name JOINS the set — a new classifier written with the guard is a new place the
negation is opaque, and the count may only fall.

WHAT COUNTS. A function whose name matches the classifier prefixes below, whose body reads
`.letType`/`.parType`, and which either returns inside a `letType >= 0` guard or reaches an
annotation-only tail — i.e. a body where the initializer is not consulted once an annotation
is present. `TRANSPARENT` marks the ones that already read through a negation.
"""
import argparse, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "compiler")
BASELINE = os.path.join(ROOT, "scripts", "ann-shortcircuit-baseline.json")

# The classifier families that decide a BINDING's rep from its declaration.
PREFIX = re.compile(r"^(letIs|letNul|letInf|letAnn|paramIs|paramNul|globalIs)")
FUNC = re.compile(r"^(?:export )?function ([A-Za-z_][A-Za-z0-9_]*)\s*\(")
# The guard shape: an annotation test that gates a `return` before any init read.
GUARD = re.compile(r"\b(?:d|g|bn|dn|ld)\.letType\s*>=\s*0\b|\bletType\s*>=\s*0\b")
INIT_READ = re.compile(r"\.letInit\b")
TRANSPARENT = re.compile(r"\btyIsNegation\b|\bannNamesRep\b|\bglobalAnnNamesCell\b")


STRIP = re.compile(r'"(?:[^"\\]|\\.)*"' r"|'(?:[^'\\]|\\.)*'" r"|//.*$")


def bodies(path):
    """Yield (name, body-text, start-line) for every top-level function in `path`.

    Braces are counted with string literals and line comments stripped — the compiler's own
    message templates carry `{`, and a one-line function must close on its opening line or it
    swallows its successor (which is how the first run of this census reported 12 of 40).
    """
    lines = open(path, encoding="utf-8").read().split("\n")
    i = 0
    while i < len(lines):
        m = FUNC.match(lines[i])
        if not m:
            i += 1
            continue
        name, depth, buf, start, opened = m.group(1), 0, [], i + 1, False
        while i < len(lines):
            bare = STRIP.sub("", lines[i])
            depth += bare.count("{") - bare.count("}")
            buf.append(lines[i])
            i += 1
            if bare.count("{"):
                opened = True
            if opened and depth <= 0:
                break
        yield name, "\n".join(buf), start


def census():
    rows = []
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".vl"):
            continue
        path = os.path.join(SRC, f)
        for name, body, line in bodies(path):
            if not PREFIX.match(name):
                continue
            if not GUARD.search(body):
                continue
            rows.append({
                "name": name,
                "file": "compiler/" + f,
                "line": line,
                "reads_init": bool(INIT_READ.search(body)),
                "transparent": bool(TRANSPARENT.search(body)),
            })
    rows.sort(key=lambda r: (r["file"], r["name"]))
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--names", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--write-baseline", action="store_true")
    a = ap.parse_args()
    rows = census()
    opaque = [r for r in rows if not r["transparent"]]

    if a.names:
        for r in opaque:
            print(r["name"])
        return 0

    if a.write_baseline:
        json.dump({"names": sorted(r["name"] for r in opaque)},
                  open(BASELINE, "w"), indent=1, sort_keys=True)
        print("wrote %s (%d classifiers)" % (BASELINE, len(opaque)))
        return 0

    if a.check:
        if not os.path.exists(BASELINE):
            print("no baseline; run --write-baseline", file=sys.stderr)
            return 1
        base = set(json.load(open(BASELINE))["names"])
        now = set(r["name"] for r in opaque)
        joined = sorted(now - base)
        left = sorted(base - now)
        if joined:
            print("annotation short-circuit census ROSE by %d: %s"
                  % (len(joined), ", ".join(joined)), file=sys.stderr)
            return 1
        msg = "annotation short-circuit census ok — %d classifiers (baseline %d)" % (
            len(now), len(base))
        if left:
            msg += "; %d left: %s" % (len(left), ", ".join(left))
        print(msg)
        return 0

    print("| classifier | file:line | reads init | reads through a negation |")
    print("| --- | --- | --- | --- |")
    for r in rows:
        print("| `%s` | %s:%d | %s | %s |" % (
            r["name"], r["file"], r["line"],
            "yes" if r["reads_init"] else "no",
            "yes" if r["transparent"] else "**no**"))
    print()
    print("%d classifiers carry the annotation guard; %d are opaque to a negation."
          % (len(rows), len(opaque)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
