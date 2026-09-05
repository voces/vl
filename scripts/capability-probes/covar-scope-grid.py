#!/usr/bin/env python3
"""Grade the covariant-write analysis over DELIVERY POSITION x LOCATION (D1610/D1611).

The `Writable` rule (D793/D821/D852) decides whether a covariant list assignment is legal by
asking "is this list written through anywhere?". It answered by matching a NAME over the whole
arena, so a binding of the same name in another function was the same value to it. That is one
mechanism with two faces, and neither is visible to a grid that varies only the delivery --
`matrix.py`'s template puts every cell in one frame, and the axis here is WHICH FRAME.

  * `direct` face (D1611) varies where a `push` to a list named `b` lives. Where the write
    can reach `f`'s `b` the refusal is the design's; where it cannot, refusing is a
    clause-2 false reject on a program that runs.
  * `escaped` face (D1610) keeps the reachable write (`c.push`, through the handle that
    escaped into a struct field) in every cell, so D852's refusal is ALWAYS owed. What it
    varies is where a DECOY binding of the container's name `bx` lives -- `cwBoundOnce`
    counts those program-wide and drops the aliasing edge when it finds two.

    python3 scripts/capability-probes/covar-scope-grid.py --compiler build/vl-compiler.wasm
    python3 scripts/capability-probes/covar-scope-grid.py --before a.wasm --after b.wasm
    python3 scripts/capability-probes/covar-scope-grid.py --only direct/argument --keep

GRADING is run.py's, imported rather than copied. Each cell declares the outcome the design
OWES it (`refuse` or `run`); a cell that owes `run` and refuses is a clause-2 violation, one
that owes `refuse` and runs is clause 1. Exit is non-zero on any cell not meeting what it
owes, on any SILENT, and on any `runs -> not-runs` between two seeds.
"""
import argparse, os, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as probes  # noqa: E402  -- the shared grading vocabulary

ROOT = probes.ROOT

PRELUDE = """type Circle = { r: i32 }
type Sq = { s: i32 }
type Shape = Circle | Sq
type Box = { xs: Shape[] }
"""

# ---------------------------------------------------------------- delivery positions
#
# Where the covariant value is DELIVERED. `deliver` is a statement inside `f`; `extra` is
# module-level scenery; `tail` runs after `f()`. A delivery that loses the source's name (a
# call result, a fresh literal) is a decline by design and is not a cell here.

POSITIONS = {
    # the covariant binding itself is the delivery -- no separate statement, so the
    # before/after axis has nothing to sit between and is skipped (see SKIP).
    "local_binding": {"deliver": "", "extra": "", "tail": "", "out": []},
    "argument": {
        "deliver": "  take(b)\n",
        "extra": "\nfunction take(xs: Shape[]) {\n  print(xs.length)\n}\n",
        "tail": "", "out": ["1"],
    },
    "struct_field": {
        "deliver": "  const sf: Box = { xs: b }\n  print(sf.xs.length)\n",
        "extra": "", "tail": "", "out": ["1"],
    },
    "reassign": {
        "deliver": "  let rb: Shape[] = []\n  rb = b\n  print(rb.length)\n",
        "extra": "", "tail": "", "out": ["1"],
    },
    "nested_element": {
        "deliver": "  const nn: Shape[][] = [b]\n  print(nn[0].length)\n",
        "extra": "", "tail": "", "out": ["1"],
    },
    "return_value": {
        "deliver": "  const rr: Shape[] = hand(b)\n  print(rr.length)\n",
        "extra": "\nfunction hand(xs: Shape[]): Shape[] {\n  xs\n}\n",
        "tail": "", "out": ["1"],
    },
}

# ---------------------------------------------------------------- locations
#
# WHERE the varied statement lives, relative to the binding it names. `reach` says whether
# that frame can actually see `f`'s binding -- which is what decides the outcome owed.

LOCATIONS = {
    "same_fn_after":       {"reach": True},
    "same_fn_before":      {"reach": True},
    "capturing_lambda":    {"reach": True},
    "sibling_fn":          {"reach": False},
    "noncapturing_lambda": {"reach": False},
    "module_stmt":         {"reach": False},
    "none":                {"reach": False},
}

# `same_fn_before` needs a delivery statement to sit before; where the delivery IS the
# binding there is no such point and the cell would duplicate `same_fn_after`.
SKIP = {("local_binding", "same_fn_before")}


def owed(face, loc):
    """The outcome the design owes. The escaped face always owes the refusal: its write is
    reachable in every cell, and only the DECOY moves."""
    if face == "escaped":
        return "refuse"
    if loc == "none":
        return "run"
    return "refuse" if LOCATIONS[loc]["reach"] else "run"


def render(face, pos_k, loc):
    pos = POSITIONS[pos_k]
    # `holder` is the name the varied statement spells -- the collision the analysis sees.
    holder = "bx" if face == "escaped" else "b"

    bind = "  const a: Circle[] = [{ r: 7 }]\n  const b: Shape[] = a\n"
    if face == "escaped":
        bind += "  const bx: Box = { xs: b }\n  const c = bx.xs\n"

    # the statement that varies. On the direct face it is a WRITE through `b`; on the
    # escaped face it is a DECOY BINDING of `bx` (the write there is fixed, below).
    if face == "escaped":
        near = "  const %s2: Box = { xs: [] }\n  print(%s2.xs.length)\n" % (holder, holder)
        foreign = ("  const %s: Box = { xs: [] }\n  print(%s.xs.length)\n" % (holder, holder))
        near_out, foreign_out = ["0"], ["0"]
    else:
        near = "  %s.push({ s: 3 })\n" % holder
        foreign = ("  const %s: Shape[] = []\n  %s.push({ s: 3 })\n  print(%s.length)\n"
                   % (holder, holder, holder))
        near_out, foreign_out = [], ["1"]

    body = bind
    out = []
    if loc == "same_fn_before":
        body += near
        out += near_out
    body += pos["deliver"]
    out += pos["out"]
    if loc == "same_fn_after":
        body += near
        out += near_out
    if loc == "capturing_lambda":
        if face == "escaped":
            # a lambda that CAPTURES the container and reads it -- still one binding
            body += "  const lam = () => { print(bx.xs.length) }\n  lam()\n"
            out += ["1"]
        else:
            body += "  const lam = () => { b.push({ s: 3 }) }\n  lam()\n"
    if loc == "noncapturing_lambda":
        body += "  const lam = () => {\n" + "  " + foreign.replace("\n  ", "\n    ") + "  }\n  lam()\n"
        out += foreign_out
    # the escaped face's own write: always present, always reachable
    if face == "escaped":
        body += "  c.push({ s: 3 })\n"
        body += "  print(c.length)\n"
        out += ["2"]
    else:
        body += "  print(b.length)\n"
        out += ["1"]

    src = PRELUDE + "\nfunction f() {\n" + body + "}\n" + pos["extra"]
    if loc == "sibling_fn":
        src += "\nfunction sib() {\n" + foreign + "}\n"
    src += "\nf()\n"
    if loc == "sibling_fn":
        src += "sib()\n"
        out += foreign_out
    if loc == "module_stmt":
        src += foreign.replace("\n  ", "\n").lstrip()
        out += foreign_out
    src += pos["tail"]
    return src, "\n".join(out)


def cells(only):
    for face in ("direct", "escaped"):
        for pos_k in POSITIONS:
            for loc in LOCATIONS:
                if (pos_k, loc) in SKIP:
                    continue
                cid = "%s/%s/%s" % (face, pos_k, loc)
                if only and not any(o in cid for o in only):
                    continue
                yield cid, face, pos_k, loc


def grade_all(compiler, only, tmp, tag):
    rows = []
    env = dict(os.environ, VL_STD=os.path.join(ROOT, "std"))
    for cid, face, pos_k, loc in cells(only):
        src, want = render(face, pos_k, loc)
        path = os.path.join(tmp, tag + "__" + cid.replace("/", "__") + ".vl")
        with open(path, "w") as fh:
            fh.write(src)
        ow = owed(face, loc)
        verdict, detail, out = probes.grade(path, compiler, want if ow == "run" else None,
                                            env=env)
        rows.append([cid, ow, verdict, detail, path])
    return rows


def ok(ow, verdict):
    return verdict == "RUNS" if ow == "run" else verdict == "check refuses"


def report(rows, label):
    print("\n== %s ==" % label)
    print("%-46s %-7s %-22s %s" % ("CELL", "OWES", "VERDICT", "DETAIL"))
    bad = silent = 0
    for cid, ow, verdict, detail, _ in rows:
        good = ok(ow, verdict)
        if not good:
            bad += 1
        if verdict.startswith("SILENT"):
            silent += 1
        print("%-46s %-7s %-22s %s%s" % (cid, ow, verdict, "" if good else "<-- ", detail[:40]))
    runs = sum(1 for r in rows if r[2] == "RUNS")
    print("\n%d cells - %d run, %d SILENT, %d not what the design owes"
          % (len(rows), runs, silent, bad))
    return bad, silent


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", default=os.path.join(ROOT, "build", "vl-compiler.wasm"))
    ap.add_argument("--before")
    ap.add_argument("--after")
    ap.add_argument("--only", default="")
    ap.add_argument("--keep", action="store_true")
    a = ap.parse_args()
    only = [s for s in a.only.split(",") if s]
    tmp = tempfile.mkdtemp(prefix="covar-scope-grid-")
    try:
        if a.before and a.after:
            b = grade_all(a.before, only, tmp, "b")
            af = grade_all(a.after, only, tmp, "a")
            report(b, "BEFORE")
            bad, silent = report(af, "AFTER")
            print("\n== MOVED ==")
            lost = moved = 0
            for rb, ra in zip(b, af):
                if rb[2] != ra[2]:
                    moved += 1
                    flag = ""
                    if rb[2] == "RUNS" and ra[2] != "RUNS":
                        flag = "  <-- runs LOST"
                        lost += 1
                    print("%-46s %-22s -> %-22s%s" % (rb[0], rb[2], ra[2], flag))
            if not moved:
                print("(no cell moved)")
            print("\n%d moved, %d runs lost, %d SILENT after, %d not owed after"
                  % (moved, lost, silent, bad))
            return 1 if (lost or silent or bad) else 0
        rows = grade_all(a.compiler, only, tmp, "g")
        bad, silent = report(rows, os.path.basename(a.compiler))
        return 1 if (silent or bad) else 0
    finally:
        if a.keep:
            print("\nkept: %s" % tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
