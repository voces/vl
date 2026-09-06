#!/usr/bin/env python3
"""Re-derive the emit-side refusal-site population, and say which sites the WORDING misses.

    python3 scripts/emit-refusal-sites.py            # the population, re-derived
    python3 scripts/emit-refusal-sites.py --groups   # unmatched sites by the verb they use
    python3 scripts/emit-refusal-sites.py --full     # every unmatched template, grouped
    python3 scripts/emit-refusal-sites.py --sample N # the seeded draw this repo measured
    python3 scripts/emit-refusal-sites.py --json OUT # the sites, machine-readable

CLAUDE.md says to re-derive this from the tree whenever the number matters, and every
hand-derivation of it so far has been wrong: 511 / 88 / 423 came from an 8-line WINDOW grep
that swept in neighbouring code, and 504 sites is not reproducible from any argument-scoped
derivation of the tree it was taken from (this script reads 521 there). So the derivation is
a script now, and the numbers in a doc are dated readings of it.

THE UNIT IS THE CALL SITE, AND THE MESSAGE A USER RECEIVES IS A TEMPLATE. `emitFail` /
`emitFailAt` are the only emit-side failure channel. Calls are extracted by BALANCING
PARENTHESES across lines, never by grepping lines, and each call's first argument is reduced
to a template: literal chunks kept, every non-literal chunk replaced by `{}`.
"""
import argparse, collections, json, os, random, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "compiler")

# `goal-scoreboard.py`'s predicate, verbatim: a refusal whose SENTENCE concedes the program
# was type-valid. Kept in step by hand rather than imported, because this script's whole job
# is to report what that predicate does NOT match — a shared import would make the two agree
# by construction and there would be nothing to measure.
CONCEDES = re.compile(
    r"no lowering|not yet supported|not supported by codegen|type-valid but cannot build"
    r"|not supported yet|not yet implemented|not yet callable|not yet built", re.I)

CALL = re.compile(r"\bemitFail(At)?\s*\(")
LIT = re.compile(r'"((?:[^"\\]|\\.)*)"')

# The verb or noun the refusal reaches for, MOST SPECIFIC FIRST — a template is filed under
# the first pattern it carries. These are strata for aiming effort, not verdicts: none of
# them says anything about whether a check-clean program can reach the site.
GROUPS = [
    ("supports only / is supported as", r"supports only|\bis supported as\b|\bsupported for\b"),
    ("has no rep / no representation", r"has no rep\b|no representation|has no value rep"),
    ("has no <thing>", r"\bhas no \b"),
    ("must be / must have", r"\bmust (be|have|carry|name|match|resolve|not)\b"),
    ("only … supported / allowed", r"\bonly\b.{0,60}(supported|allowed|permitted|is a value)"),
    ("unsupported <noun>", r"\bunsupported\b"),
    ("not supported / not a supported", r"\bnot supported\b|\bnot a supported\b"),
    ("cannot", r"\bcannot\b|\bcan not\b|\bcan't\b"),
    ("unknown / unresolved / not found",
     r"\bunknown\b|\bunresolved\b|\bnot found\b|\bnot registered\b"),
    ("not interned / no slot / no index",
     r"\bnot interned\b|\bno slot\b|\bno index\b|\bno such\b"),
    ("out of range / overflow / too long",
     r"out of range|out of bounds|overflow|too many|too large|too long"),
    ("expected <x>", r"\bexpected\b|\bexpects\b"),
    ("missing / empty", r"\bmissing\b|\babsent\b|\bis empty\b|\bwas empty\b|\bempty \b"),
    ("requires / needs / takes",
     r"\brequires\b|\bneeds\b|\btakes (exactly|at least|an)\b|\bwrong number\b"),
    ("is not / are not / does not",
     r"\bis not\b|\baren't\b|\bare not\b|\bwas not\b|\bdoes not\b|\bdid not\b|\bnot a \b|\bnot an \b"),
    ("… but <state> (internal invariant)", r"\bbut\b"),
    ("bare `no <noun>`", r"\bno \b"),
    ("whole message from a helper", r"^\{\}$"),
]


def group_of(t):
    for name, pat in GROUPS:
        if re.search(pat, t, re.I):
            return name
    return "other"


def blank_comments(text):
    """Blank `//` comments, keeping string literals and the file's length intact."""
    out, i, n, in_str = list(text), 0, len(text), False
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_str = False
            i += 1
        elif c == '"':
            in_str = True
            i += 1
        elif c == "/" and i + 1 < n and text[i + 1] == "/":
            j = text.find("\n", i)
            j = n if j < 0 else j
            for k in range(i, j):
                out[k] = " "
            i = j
        else:
            i += 1
    return "".join(out)


def first_arg(text, start):
    """The first argument of a call whose `(` ends at `start`, balanced across lines."""
    depth, i, in_str = 1, start, False
    while i < len(text) and depth > 0:
        c = text[i]
        if in_str:
            if c == "\\":
                i += 2
                continue
            if c == '"':
                in_str = False
            i += 1
            continue
        if c == '"':
            in_str = True
        elif c in "([{":
            depth += 1
        elif c in ")]}":
            depth -= 1
        elif c == "," and depth == 1:
            return text[start:i]
        i += 1
    return text[start:i - 1]


def template(arg):
    """The message TEMPLATE an argument expression produces: literals kept, holes as `{}`."""
    out, pos = [], 0
    for m in LIT.finditer(arg):
        if arg[pos:m.start()].strip().strip("+").strip():
            out.append("{}")
        out.append(m.group(1))
        pos = m.end()
    if arg[pos:].strip().strip("+").strip():
        out.append("{}")
    return "".join(out) if out else "{}"


def sites():
    """Every `emitFail` / `emitFailAt` CALL SITE in `compiler/*.vl`, with its template."""
    found = []
    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith(".vl"):
            continue
        raw = open(os.path.join(SRC, fn), encoding="utf-8").read()
        text = blank_comments(raw)
        for m in CALL.finditer(text):
            bol = text.rfind("\n", 0, m.start()) + 1
            if "function" in text[bol:m.start()]:
                continue  # the two DEFINITIONS: a parameter list is not an argument list
            arg = first_arg(text, m.end()).strip()
            if arg == "msg":
                continue  # `emitFail`'s own forwarding call into `emitFailAt`
            t = template(arg)
            found.append({
                "file": fn, "line": raw.count("\n", 0, m.start()) + 1,
                "loc": f"{fn}:{raw.count(chr(10), 0, m.start()) + 1}",
                "fn": "emitFailAt" if m.group(1) else "emitFail",
                "arg": arg, "template": t, "group": group_of(t),
                "concedes": bool(CONCEDES.search(t)),
                "lits": [x.group(1) for x in LIT.finditer(arg)],
            })
    return sorted(found, key=lambda s: (s["file"], s["line"]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--groups", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--sample", type=int, metavar="N")
    ap.add_argument("--seed", type=int, default=20260905)
    ap.add_argument("--json", metavar="OUT")
    a = ap.parse_args()

    ss = sites()
    un = [s for s in ss if not s["concedes"]]
    tpl = {s["template"] for s in ss}

    print(f"emitFail / emitFailAt CALL SITES              {len(ss)}")
    print(f"distinct MESSAGE TEMPLATES                    {len(tpl)}")
    print(f"  no hole — a whole message, verbatim         {len([t for t in tpl if '{}' not in t])}")
    print(f"  at least one {{}} hole                       {len([t for t in tpl if '{}' in t])}")
    print(f"distinct >=12-char literals in an argument    "
          f"{len({l for s in ss for l in s['lits'] if len(l.strip()) >= 12})}")
    per = collections.Counter(s["file"] for s in ss)
    print("per file: " + ", ".join(f"{k} {v}" for k, v in per.most_common()))
    print()
    print(f"sites whose template CONCEDES type-validity   {len(ss)-len(un)}")
    print(f"sites the wording predicate does NOT match    {len(un)}"
          f"   ({100*len(un)/len(ss):.1f}%)")
    print(f"  their distinct templates                    {len({s['template'] for s in un})}")

    if a.groups or a.full:
        print()
        print("| group (the verb/noun the refusal reaches for) | sites | templates |")
        print("| --- | ---: | ---: |")
        by = collections.defaultdict(list)
        for s in un:
            by[s["group"]].append(s)
        for g, _ in GROUPS + [("other", None)]:
            if g in by:
                print(f"| {g} | {len(by[g])} | {len({x['template'] for x in by[g]})} |")
        print(f"| **total** | **{len(un)}** | **{len({s['template'] for s in un})}** |")
        if a.full:
            for g, _ in GROUPS + [("other", None)]:
                if g not in by:
                    continue
                print(f"\n### {g} — {len(by[g])} sites")
                for t in sorted({x["template"] for x in by[g]}):
                    print(f"* `{t}`")

    if a.sample:
        draw = random.Random(a.seed).sample(un, a.sample)
        draw.sort(key=lambda s: (s["file"], s["line"]))
        print(f"\nseeded draw: random.Random({a.seed}).sample(frame, {a.sample}) "
              f"over the {len(un)} unmatched sites sorted by (file, line)")
        for i, s in enumerate(draw, 1):
            print(f"{i:3d}. {s['loc']:<24} {s['group']:<34} {s['template'][:88]}")

    if a.json:
        json.dump(ss, open(a.json, "w"), indent=1)
        print(f"\nwrote {a.json}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
