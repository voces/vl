#!/usr/bin/env python3
"""Sample ordinary VL programs IN PAIRS and report where two spellings disagree.

    python3 scripts/day-one/sample.py --seed 1 --count 40
    python3 scripts/day-one/sample.py --seed 1 --count 40 --out run.jsonl
    python3 scripts/day-one/sample.py --replay run.jsonl        # regression mode

`--count` counts PROGRAMS, so it is twice the number of pairs. Each pair is two
spellings of ONE program differing along ONE axis, and the primary verdict is
agree / disagree rather than runs / refuses: the spelling that RUNS proves the other
is legal, so a hit arrives with its own control attached and needs no judgement about
what the design permits. Both-fail is NOT a hit — it is a missing feature or a design
question, and it is listed separately for a human.

Grading is `scripts/capability-probes/run.py`'s, imported and not copied, so a day-one
cell and a hand-written probe are read on one scale.

DISCOVERY INSTRUMENT, NOT A GATE, at any size that is worth running for discovery.
`--replay` is the gate half: it re-grades a saved sample and exits non-zero only on
`RUNS -> not-RUNS`, which is the repo's bar. See docs/internals/day-one-sampler.md.
"""
import argparse
import collections
import json
import os
import random
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(ROOT, "scripts", "capability-probes"))

import grammar as G  # noqa: E402
import render as R  # noqa: E402
import run as probes  # noqa: E402

VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")
SEED = os.path.join(ROOT, "build", "vl-compiler.wasm")


def env():
    """VL_STD pinned to THE TREE BEING GRADED — the host resolves `std:` from the
    BINARY's checkout, and a worktree's binary is a symlink to the main repo's."""
    e = dict(os.environ)
    e["VL_STD"] = os.path.join(ROOT, "std")
    return e


def grade_src(src, want, compiler, tmpdir, name):
    """One program's verdict, in run.py's vocabulary plus a program TRAP.

    run.py cannot separate a compiler trap from the PROGRAM trapping, because both
    reach the host as a wasm backtrace out of one `vl run`. One extra `vl build` on
    that path settles it: a module that was written means the trap was the program's.
    """
    path = os.path.join(tmpdir, name + ".vl")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src)
    # `want=None` so run.py grades the CHANNEL only; the output contract is checked
    # here and it is EXACT. run.py's is a substring test, which a generated `want` of
    # "2" would pass against a printed "2.5" — a RUNS-WRONG read as a RUNS.
    verdict, detail, out = probes.grade(path, compiler, None,
                                        vl=VL, env=env(), timeout=60)
    if verdict == "RUNS" and [l.strip() for l in out.splitlines()] != want:
        verdict, detail = "RUNS-WRONG", "want %r, got %r" % (want, out)
    if verdict.startswith("COMPILER TRAP"):
        built = subprocess.run([VL, "build", path, "-o", path + ".wasm",
                                "--compiler", compiler], capture_output=True,
                               text=True, env=env())
        if built.returncode == 0:
            verdict = "TRAP (program)"
    if verdict == "WRONG":
        verdict = "RUNS-WRONG"
    return {"grade": verdict, "message": detail, "got": out}


VERDICTS = ["DISAGREE", "RUNS-WRONG", "AGREE-RUNS", "BOTH-FAIL-SAME",
            "BOTH-FAIL-DIFFER"]

# run.py's vocabulary plus the two this script adds: RUNS-WRONG (its output contract is
# EXACT, run.py's is a substring) and TRAP (program), which one extra `vl build` separates
# from run.py's COMPILER TRAP. A grade outside this list means the two have drifted.
GRADES = ["RUNS", "RUNS-WRONG", "check refuses", "emit refuses", "SILENT (check rc 0)",
          "COMPILER TRAP (check rc 0)", "TRAP (program)", "TIMEOUT"]


def verdict_of(pair, ga, gb):
    """agree / disagree, and never `runs / refuses` — see the module docstring."""
    if "RUNS-WRONG" in (ga["grade"], gb["grade"]):
        return "RUNS-WRONG"
    ra, rb = ga["grade"] == "RUNS", gb["grade"] == "RUNS"
    if ra and rb:
        return "AGREE-RUNS"
    if ra != rb:
        return "DISAGREE"
    if (ga["grade"], ga["message"]) == (gb["grade"], gb["message"]):
        return "BOTH-FAIL-SAME"
    return "BOTH-FAIL-DIFFER"


def build_sample(seed, count, cover=True, axis=None):
    """`count` PROGRAMS = count/2 pairs. `cover` front-loads a shuffled full axis
    list so a small sample still varies every axis — the summary must be able to
    say `this axis found nothing` rather than `this axis was never reached`.
    `axis` aims the whole sample at one, which is what the per-axis rate is for."""
    rng = random.Random(seed)
    if axis:
        todo, cover = [axis] * (count // 2 + 8), True
    else:
        todo = list(G.AXIS_IDS)
        rng.shuffle(todo)
    pairs, seen = [], set()
    tries = 0
    while len(pairs) < max(1, count // 2) and tries < count * 60:
        tries += 1
        want_axis = todo.pop(0) if (cover and todo) else None
        p = R.make_pair(rng, want_axis)
        if p is None:
            if want_axis:
                todo.append(want_axis)
            continue
        key = (p["a"]["src"], p["b"]["src"])
        if key in seen:
            if want_axis:
                todo.append(want_axis)
            continue
        seen.add(key)
        p["seed"], p["index"] = seed, len(pairs)
        pairs.append(p)
    return pairs


def grade_pairs(pairs, compiler, jobs):
    with tempfile.TemporaryDirectory(prefix="vl-day-one-") as td:
        def one(p):
            tag = "s%d_i%d" % (p["seed"], p["index"])
            ga = grade_src(p["a"]["src"], p["a"]["want"], compiler, td, tag + "a")
            gb = grade_src(p["b"]["src"], p["b"]["want"], compiler, td, tag + "b")
            p["a"].update(ga)
            p["b"].update(gb)
            p["verdict"] = verdict_of(p, ga, gb)
            return p
        with ThreadPoolExecutor(max_workers=jobs) as ex:
            return list(ex.map(one, pairs))


# ------------------------------------------------------------------------ reports

def table(rows, title, key):
    counts = collections.Counter(key(r) for r in rows)
    print("\n%s" % title)
    for k, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
        print("  %-26s %4d" % (k, n))
    return counts


def axis_table(pairs):
    """Agreements PER AXIS. A zero-disagreement axis and an axis the sample never
    exercised are different facts and must not print the same."""
    per = collections.defaultdict(collections.Counter)
    for p in pairs:
        per[p["axis"]][p["verdict"]] += 1
    print("\nby axis (order = expected yield)")
    print("  %-24s %5s %5s %5s %5s %5s" %
          ("axis", "pairs", "hit", "agree", "both", "wrong"))
    for ax in G.AXIS_IDS:
        c = per.get(ax)
        if c is None:
            print("  %-24s %5s   NOT EXERCISED by this sample" % (ax, "0"))
            continue
        print("  %-24s %5d %5d %5d %5d %5d" %
              (ax, sum(c.values()), c["DISAGREE"], c["AGREE-RUNS"],
               c["BOTH-FAIL-SAME"] + c["BOTH-FAIL-DIFFER"], c["RUNS-WRONG"]))


def feature_table(pairs):
    hit = collections.Counter()
    tot = collections.Counter()
    for p in pairs:
        for f in p["features"]:
            tot[f] += 1
            if p["verdict"] in ("DISAGREE", "RUNS-WRONG"):
                hit[f] += 1
    print("\nhit rate per feature (aim the next sample with this)")
    for f, n in sorted(tot.items(), key=lambda kv: (-hit[kv[0]] / kv[1], -kv[1])):
        print("  %-20s %3d/%-4d %5.1f%%" % (f, hit[f], n, 100.0 * hit[f] / n))


def report(pairs):
    print("\n%d pairs = %d programs" % (len(pairs), 2 * len(pairs)))
    table(pairs, "pair verdicts", lambda p: p["verdict"])
    table([s for p in pairs for s in (p["a"], p["b"])],
          "program grades", lambda s: s["grade"])
    axis_table(pairs)
    feature_table(pairs)
    hits = [p for p in pairs if p["verdict"] in ("DISAGREE", "RUNS-WRONG")]
    print("\n%d HIT(S) — one spelling runs, the other does not" % len(hits))
    for p in hits:
        print("  s%d/%d  axis=%s  %s[%s]=%s  %s[%s]=%s" % (
            p["seed"], p["index"], p["axis"],
            "A", p["a"]["face"], p["a"]["grade"],
            "B", p["b"]["face"], p["b"]["grade"]))
        print("        %s" % (p["a"]["message"] or p["b"]["message"])[:100])
    both = [p for p in pairs if p["verdict"].startswith("BOTH-FAIL")]
    print("\n%d BOTH-FAIL — a missing feature or a design question, not a hit" % len(both))
    for p in both[:20]:
        print("  s%d/%d  %s  %s" % (p["seed"], p["index"], p["a"]["grade"],
                                    (p["a"]["message"] or "")[:82]))
    return hits


def write_jsonl(path, pairs):
    with open(path, "w", encoding="utf-8") as fh:
        for p in pairs:
            fh.write(json.dumps(p, sort_keys=True) + "\n")


def replay(path, compiler, jobs):
    """Re-grade a saved sample. Exits non-zero ONLY on `RUNS -> not-RUNS`; every
    other movement (`-> SILENT` included) is printed and read, not blocked on."""
    old = [json.loads(l) for l in open(path, encoding="utf-8") if l.strip()]
    fresh = []
    for p in old:
        q = {k: v for k, v in p.items() if k not in ("verdict",)}
        q["a"] = {k: v for k, v in p["a"].items() if k in ("src", "want", "face")}
        q["b"] = {k: v for k, v in p["b"].items() if k in ("src", "want", "face")}
        fresh.append(q)
    fresh = grade_pairs(fresh, compiler, jobs)
    lost, moved = [], []
    for o, n in zip(old, fresh):
        for side in ("a", "b"):
            was, now = o[side]["grade"], n[side]["grade"]
            if was == now:
                continue
            (lost if was == "RUNS" else moved).append(
                (o["seed"], o["index"], side, was, now))
    for s, i, side, was, now in moved:
        print("  moved   s%d/%d%s  %s -> %s" % (s, i, side, was, now))
    for s, i, side, was, now in lost:
        print("  RUNS LOST  s%d/%d%s  %s -> %s" % (s, i, side, was, now))
    print("\n%d program(s) moved · %d RUNS lost" % (len(moved) + len(lost), len(lost)))
    return 1 if lost else 0


# ---------------------------------------------------------------------------
# THE CONTROLS. An instrument that reports zero is worth nothing until something it
# MUST see makes it speak — but A CONTROL BUILT ON A LIVE DEFECT EVAPORATES THE DAY
# THE DEFECT IS FIXED, and this one did: D1473 closed in #2476 while the sampler was
# being written, its pair started grading AGREE, and the gate read that as the
# instrument being broken. So the controls that prove the sampler can SEE and CLASSIFY
# a disagreement are SYNTHETIC — each rests on a rule the design will always enforce —
# and the closed rows become AGREE controls, which is the right shape for a closed row
# anyway: it pins the fix instead of depending on the bug.
#
# There is no synthetic EMIT-refusal control, and that is a statement about the
# language rather than an omission: by CLAUDE.md's standing rule every `loud emit
# reject` is a clause-2 violation by construction, since `check` returned 0 to reach
# the emitter — so no emit refusal is a design rule and none can be permanent. The
# TRAP control covers what an emit control would have given (a non-check channel,
# deterministic and permanent) and additionally exercises the one piece of grading
# this script adds to run.py's: the `vl build` that tells a PROGRAM trap from a
# COMPILER trap.
# ---------------------------------------------------------------------------

# (spec, faces) rendered FROM THE GRAMMAR, so an agree control also proves the renderer
# still builds the shape its row was about.
D1473_SPEC = ({"value": "dunion", "read": "eq_narrow", "position": "binding",
               "scenery": "push", "source": "literal"},
              {"named_vs_inline": "named", "annotated_vs_inferred": "annotated",
               "narrowing": "eq_narrow", "fusion": "bound", "pinning": "direct",
               "scope": "module", "scenery": "bare", "init_vs_assign": "init"})
D1500_SPEC = ({"value": "i32", "read": "bare", "position": "binding",
               "scenery": "push", "source": "index"},
              {"named_vs_inline": "named", "annotated_vs_inferred": "inferred",
               "narrowing": "bare", "fusion": "bound", "pinning": "direct",
               "scope": "function", "scenery": "bare", "init_vs_assign": "init"})


def _rendered(spec, faces, axis, other_face):
    out = {}
    for side, f in (("a", dict(faces)),
                    ("b", dict(faces, **{axis: other_face}))):
        src, want = R.render_spec(spec, f)
        out[side] = {"src": src, "want": want, "face": f[axis]}
    return out


def _controls():
    """(id, why, pair, want_verdict, want_grades) for every control."""
    return [
        # SYNTHETIC, check channel. A string literal into an `i32` destination is a type
        # error the design will always make; nothing can "fix" this into agreeing.
        ("synthetic/check", "a design type error beside the program it breaks",
         {"a": {"src": "const v: i32 = 7\nprint(v)\n", "want": ["7"], "face": "legal"},
          "b": {"src": 'const v: i32 = "seven"\nprint(v)\n', "want": ["7"],
                "face": "ill-typed"}},
         "DISAGREE", ("RUNS", "check refuses")),

        # SYNTHETIC, trap channel. Arrays are bounds-checked, so this traps at RUN time
        # with `vl check` rc 0, and grading it needs the `vl build` that separates a
        # program trap from a compiler trap.
        ("synthetic/trap", "a bounds-checked index, which is a design rule",
         {"a": {"src": "const xs: i32[] = [1, 2]\nprint(xs[1])\n", "want": ["2"],
                "face": "in range"},
          "b": {"src": "const xs: i32[] = [1, 2]\nprint(xs[9])\n", "want": ["2"],
                "face": "out of range"}},
         "DISAGREE", ("RUNS", "TRAP (program)")),

        # SYNTHETIC, output contract. The `b` face runs and prints `12` against a `want`
        # of `2`. run.py's contract is a SUBSTRING test and would pass that; this one is
        # exact, and this control is what says so.
        ("synthetic/wrong", "rc 0 with the wrong value is a hit, not a pass",
         {"a": {"src": "print(2)\n", "want": ["2"], "face": "right"},
          "b": {"src": "print(12)\n", "want": ["2"], "face": "wrong"}},
         "RUNS-WRONG", ("RUNS", "RUNS-WRONG")),

        # AGREE controls: closed rows, pinned. Both faces must RUN and print the same
        # thing. Regression pins, not liveness proofs — the three above are what prove
        # the instrument still speaks.
        ("D1473/agree", "closed #2476 — inline arms must keep matching named",
         _rendered(*D1473_SPEC, "named_vs_inline", "inline"),
         "AGREE-RUNS", ("RUNS", "RUNS")),
        ("D1500/agree", "closed #2479 — `let v = 0` then `v = xs[0]` must run",
         _rendered(*D1500_SPEC, "init_vs_assign", "assign"),
         "AGREE-RUNS", ("RUNS", "RUNS")),
    ]


def control(compiler, jobs):
    """Grade every control and say which ones are not speaking."""
    rows = _controls()
    graded = grade_pairs(
        [dict(p, seed=-1, index=i, axis="control", features=["control"])
         for i, (_, _, p, _, _) in enumerate(rows)], compiler, jobs)
    bad = []
    for (cid, why, _, want_v, want_g), g in zip(rows, graded):
        got_g = (g["a"]["grade"], g["b"]["grade"])
        ok = g["verdict"] == want_v and got_g == want_g
        if not ok:
            bad.append((cid, why, want_v, want_g, g["verdict"], got_g))
        print("  %-16s %-13s %-11s / %-18s %s" % (
            cid, g["verdict"], got_g[0], got_g[1], "OK" if ok else "NOT SPEAKING"))
    if bad:
        print("\n%d control(s) NOT SPEAKING — the sampler cannot be believed:"
              % len(bad))
        for cid, why, wv, wg, gv, gg in bad:
            print("  %s (%s)\n    want %s %s, got %s %s" % (cid, why, wv, wg, gv, gg))
        return 1
    print("\nall %d controls speaking" % len(rows))
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--count", type=int, default=40, help="PROGRAMS (2 per pair)")
    ap.add_argument("--out")
    ap.add_argument("--compiler", default=SEED)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument("--replay")
    ap.add_argument("--report", nargs="+",
                    help="re-print the tables from saved samples, grading nothing")
    ap.add_argument("--control", action="store_true",
                    help="grade D1473 alone: the instrument's positive control")
    ap.add_argument("--no-cover", action="store_true")
    ap.add_argument("--axis", help="aim the whole sample at one axis")
    ap.add_argument("--exclude", default="",
                    help="grammar ids to stop drawing (value/position/read/scenery)")
    ap.add_argument("--json", action="store_true", help="machine-readable summary only")
    a = ap.parse_args()

    R.EXCLUDE = {x for x in a.exclude.split(",") if x}
    if a.control:
        return control(a.compiler, a.jobs)
    if a.report:
        report([json.loads(l) for f in a.report
                for l in open(f, encoding="utf-8") if l.strip()])
        return 0
    if a.replay:
        return replay(a.replay, a.compiler, a.jobs)

    pairs = grade_pairs(build_sample(a.seed, a.count, not a.no_cover, a.axis),
                        a.compiler, a.jobs)
    if a.out:
        write_jsonl(a.out, pairs)
    if a.json:
        print(json.dumps({
            "pairs": len(pairs),
            "verdicts": collections.Counter(p["verdict"] for p in pairs),
            # BOTH lists, so a consumer can tell `this axis found nothing` from `this
            # axis was never reached` without knowing the grammar itself.
            "axes": sorted({p["axis"] for p in pairs}),
            "grammar_axes": sorted(G.AXIS_IDS),
            "verdict_vocabulary": sorted(VERDICTS),
            "grade_vocabulary": sorted(GRADES),
            "grades": collections.Counter(s["grade"] for p in pairs
                                          for s in (p["a"], p["b"])),
        }, sort_keys=True))
        return 0
    report(pairs)
    if a.out:
        print("\nwrote %s" % a.out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
