#!/usr/bin/env python3
"""D521 / D541 — the two remaining positions a BINARY OPERATOR DECLARATION is silently
ignored at, and the one position it must keep firing from.

`d471/opdeclgrid.py` next door settled the `self` NAME and the `self` TYPE, and #2012
settled the generic `self` from both ends of `checkProgram`. What was left is one axis
neither grid crosses and one nobody had looked at:

  D521  the `self` ANNOTATION. #2012 narrowed its bank to an ANNOTATED hole
        (`parType >= 0`) because the wider gate costs 20 running cells. An
        un-annotated parameter hoists as `mkTyVar(...)`, so it carries a hole exactly
        as `self: T` does, and the whole-program verdict applies unchanged.

  D541  the declaration's POSITION. Every gate in this family — D444's arity, D445's
        index receiver, D471's `self` name, D425's `self` type, D491/D521's deadness —
        lives in `checkProgram`'s pass-1 hoist, which walks `gRootStmts` ONLY. A
        `function "+"` nested inside a function body escaped all six, at BOTH `self`
        spellings, and it can never dispatch at any receiver. The axis has THREE values,
        not two: a declaration in a top-level `if true { … }` BLOCK is equally outside
        that list and was equally silent, which is only visible because the position was
        written down as an axis rather than assumed to mean "inside a function".

EVERY CELL SHIPS WITH ITS OWN DO-NOTHING CONTROL — the cell's program with the
DECLARATION DELETED and nothing else changed, so it IS, by construction, the answer the
cell would give if the thing under test did nothing:

    dispatch — the cell printed the DECLARATION's answer
    inert    — the cell printed its own CONTROL's answer (silently ignored)
    loud     — the cell does not run
    other    — neither; always worth reading

THE OPERANDS ARE `7, 1` AND THE RELATIONAL BODIES RETURN THE NATIVE ANSWER'S OPPOSITE,
which is `opdeclgrid.py`'s rule and it is load-bearing here for a reason this grid can
point at: the OLDER `d425c*` ledger used `1, 2` with every relational body returning
`false`, and `1 > 2` / `1 >= 2` are `false` natively — so four of the twenty cells the
standing gate blocks on cannot tell dispatch from inert by reading stdout at all. They
are handled explicitly (see `--price`), not quietly.

    python3 scripts/silent-sweep/d521/unannotgrid.py [seed.wasm]   grade to stdout
    python3 scripts/silent-sweep/d521/unannotgrid.py --emit <dir>  write the cells
    python3 scripts/silent-sweep/d521/unannotgrid.py --mkset       write named/
    python3 scripts/silent-sweep/d521/unannotgrid.py --verify      the instrument checks
    python3 scripts/silent-sweep/d521/unannotgrid.py --price S     the runs-lost override
"""
import concurrent.futures
import json
import os
import subprocess
import sys
import tempfile

R = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..")
)
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
JOBS = int(os.environ.get("JOBS", "6"))

# ── the ten names `ast.vl:isBinOpFuncName` admits ────────────────────────────────
OPS = ["+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="]
RELATIONAL = {"<", "<=", ">", ">="}
OPN = {"+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem", "^": "pow",
       "<": "lt", "<=": "le", ">": "gt", ">=": "ge"}
SPELL = {"tok": "{op}", "quo": '"{op}"'}
ANN = {"unannot": "", "annot": "i32"}
POS = ("top", "nest", "blk")
RECV = ("i32", "obj")


def decl_answer(op):
    """The declaration body's value — never one the native lowering produces at this
    grid's operands (`7, 1`). `--verify` proves that against the real control."""
    if op in RELATIONAL:
        return ("boolean", "true" if op in ("<", "<=") else "false")
    return ("i32", "99")


def decl_line(op, spell, ann, recv):
    """The declaration itself. At an OBJECT receiver the annotated variant names the
    struct, so the `annot` axis stays 'the reader wrote a type' at both receivers
    rather than silently becoming 'the reader wrote the WRONG type'."""
    ret, body = decl_answer(op)
    ty = ANN[ann]
    if ty and recv == "obj":
        ty = "V"
    sig = "self, other" if not ty else "self: %s, other: %s" % (ty, ty)
    tail = "" if not ty else ": " + ret
    return "function %s(%s)%s { return %s }" % (SPELL[spell].format(op=op), sig, tail, body)


def cell_src(op, spell, ann, pos, recv, with_decl=True):
    if recv == "obj":
        pre, ba, bb = "type V = { x: i32 }", "const a: V = { x: 7 }", "const b: V = { x: 1 }"
    else:
        pre, ba, bb = "", "const a: i32 = 7", "const b: i32 = 1"
    d = decl_line(op, spell, ann, recv)
    lines = []
    if pre:
        lines.append(pre)
    if pos == "top":
        if with_decl:
            lines.append(d)
        lines += [ba, bb, "print(a %s b)" % op]
    elif pos == "nest":
        lines.append("function outer() {")
        if with_decl:
            lines.append("  " + d)
        lines += ["  " + ba, "  " + bb, "  return a %s b" % op, "}", "print(outer())"]
    else:
        # THE BLOCK POSITION — the SAME gap, and NOT the same nesting. A top-level
        # `if true { … }` body is as far outside `gRootStmts` as a function body is, and
        # it was silent on `042624e1` too. It is its own axis value because the rule's
        # test is membership of that list, not "is inside a function": the first cut's
        # message said the latter and was simply wrong here, which is what this row
        # found by writing the axis down instead of assuming the two were one.
        lines.append("if true {")
        if with_decl:
            lines.append("  " + d)
        lines.append("}")
        lines += [ba, bb, "print(a %s b)" % op]
    return "\n".join(lines) + "\n"


def cell_id(op, spell, ann, pos, recv):
    return "d521_%s_%s_%s_%s_%s" % (OPN[op], ann, pos, recv, spell)


def cells(with_decl=True):
    out = {}
    for op in OPS:
        for spell in SPELL:
            for ann in ANN:
                for pos in POS:
                    for recv in RECV:
                        out[cell_id(op, spell, ann, pos, recv)] = cell_src(
                            op, spell, ann, pos, recv, with_decl)
    return out


def expectation(cid):
    """The DECLARATION's answer, which is what `named/manifest.json` records — so a
    future LIFT of either reject grades `runs but wrong value` rather than quietly
    reading `runs`. The `d425c*` ledger predates this pattern and records the
    BUILT-IN's answer, which is the weaker record of the two."""
    return decl_answer({v: k for k, v in OPN.items()}[cid.split("_")[1]])[1]


# ── THE LEGACY PRICE LEDGER: the 20 cells the STANDING GATE blocks on ────────────
# These are `named/d425c001`…`d425c039` odd, kept verbatim rather than regenerated
# from this file's axes, because the number this row exists to justify is the number
# `regress.py` prints and that number is about THOSE files. `--verify` proves this
# file reproduces them byte-for-byte, which is what makes the axes below a true
# description of the ledger rather than a second, drifting copy of it.
#
# d425's own axes: `c(4k+v)` for operator index k and v in
# (quo+annot, quo+unannot, tok+annot, tok+unannot); operands `8, 2` for the six
# arithmetic operators and `1, 2` for the four relational ones; every relational body
# returns `false`.
D425_OPERANDS = {False: ("8", "2"), True: ("1", "2")}


def d425_src(k, v):
    op = OPS[k]
    rel = op in RELATIONAL
    ba, bb = D425_OPERANDS[rel]
    ret, body = ("boolean", "false") if rel else ("i32", "99")
    annot = v in (0, 2)
    spell = "quo" if v < 2 else "tok"
    sig = "self: i32, other: i32" if annot else "self, other"
    tail = ": " + ret if annot else ""
    lines = ["function %s(%s)%s { return %s }" % (SPELL[spell].format(op=op), sig, tail, body),
             "",
             "function cell(): %s {" % ret,
             "  const a: i32 = %s" % ba,
             "  const b: i32 = %s" % bb,
             "  return a %s b" % op,
             "}",
             "print(cell())"]
    return "\n".join(lines) + "\n"


def d425_ctl(k, v):
    """The do-nothing control: the same program with the DECLARATION LINE deleted."""
    return "\n".join(d425_src(k, v).split("\n")[1:])


def d425_twin(k, v):
    """THE DISTINGUISHING TWIN, and the reason it exists. Four of the twenty ledger
    cells are BLIND — `>` and `>=` at `1, 2` are natively `false` and their bodies
    return `false`, so stdout cannot separate dispatch from inert. Term (c) of the
    override is still decidable for them, just not from their own stdout: this twin is
    the identical program with the body flipped to `true`, which the native lowering
    cannot produce at these operands. A twin measured INERT says the declaration
    contributed nothing to the site, and the blind cell differs from it only in a
    constant its own body returns."""
    return d425_src(k, v).replace("{ return false }", "{ return true }", 1)


D425_PRICE = [(k, v) for k in range(10) for v in (1, 3)]


def d425_name(k, v):
    return "d425c%03d" % (4 * k + v)


def d425_blind(k, v):
    """Is this ledger cell's DECLARATION answer the one its control already gives?"""
    op = OPS[k]
    return op in (">", ">=")


# ── the named set this grid contributes ──────────────────────────────────────────
# BOUNDARY — the un-annotated `self` at an OBJECT receiver, which is the cell D521's
# rung must not touch and which nothing in `named/` covered: `d471_pin_unannot` has no
# operator site at all, and every `d471_*_obj_self_*` cell is ANNOTATED. Its control is
# LOUD at all ten operators (`operator '+' is not defined for V and V`,
# `comparison expects numeric operands`), so these run ONLY because the declaration
# fired — the strongest form of the do-nothing rule this family has.
#
# PRICE — D541's eighty: a declaration below module scope at an i32 receiver, at both
# `self` spellings and at BOTH nestings (a function body and a top-level `if` block),
# which RAN and printed the built-in's answer on `042624e1` and is a loud check reject on
# the landing. Nothing in the standing corpus declares an operator
# below module scope (measured: zero `.vl` under tests/, std/, compiler/ or
# distilled/), so this price costs the gate nothing — which is exactly why it has to be
# written down here instead, or the next lift pays it back invisibly.
BOUNDARY = [cell_id(op, sp, "unannot", "top", "obj") for op in OPS for sp in SPELL]
PRICE_NEST = [cell_id(op, sp, an, ps, "i32")
              for op in OPS for sp in SPELL for an in ANN for ps in ("nest", "blk")]


def grade_one(src, seed):
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        r = subprocess.run([VL, "run", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        if r.returncode != 0:
            err = ((r.stderr or r.stdout).strip().splitlines() or ["rc"])[-1]
            return (False, err.split(": ", 1)[-1].strip())
        return (True, r.stdout.strip().replace("\n", "|"))
    except subprocess.TimeoutExpired:
        return (False, "TIMEOUT")
    finally:
        os.unlink(p)


def grade_many(jobs, seed):
    """jobs: {key: source} -> {key: (ran, output)}"""
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        fs = {ex.submit(grade_one, s, seed): k for k, s in jobs.items()}
        return {fs[f]: f.result() for f in concurrent.futures.as_completed(fs)}


def grade_all(seed):
    cs, ks = cells(True), cells(False)
    cell = grade_many(cs, seed)
    ctl = grade_many(ks, seed)
    res = {}
    for n in cs:
        cr, co = cell[n]
        kr, ko = ctl[n]
        exp = expectation(n)
        if not cr:
            g = "loud"
        elif co == exp:
            g = "dispatch"
        elif kr and co == ko:
            g = "inert"
        else:
            g = "other"
        res[n] = {"grade": g, "cell": (cr, co), "ctl": (kr, ko), "expect": exp}
    return res


def main():
    seed = os.path.join(R, "build/vl-compiler.wasm")
    for a in sys.argv[1:]:
        if not a.startswith("-") and a.endswith(".wasm"):
            seed = a
    cs = cells(True)

    if "--emit" in sys.argv:
        d = sys.argv[sys.argv.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        ks = cells(False)
        for n, s in cs.items():
            open(os.path.join(d, n + ".vl"), "w").write(s)
            open(os.path.join(d, n + ".ctl.vl"), "w").write(ks[n])
        print("wrote %d cells + %d controls to %s" % (len(cs), len(cs), d))
        return 0

    if "--mkset" in sys.argv:
        for n in BOUNDARY + PRICE_NEST:
            open(os.path.join(NAMED, n + ".vl"), "w").write(cs[n])
        mp = os.path.join(NAMED, "manifest.json")
        m = json.load(open(mp))
        for n in BOUNDARY + PRICE_NEST:
            m["expect"][n] = expectation(n)
        m["generated"] = len(m["expect"])
        json.dump(m, open(mp, "w"), indent=1, sort_keys=True)
        # `expected.jsonl` too, in the same command: it is what `regress.py` reads for
        # a cell's BLOCK, and a named cell missing from it silently reports under
        # block "A" — the derived half — which is the one place a curated cell must
        # never be counted. Read and written through `cellmap.py`, one line per cell.
        sys.path.insert(0, os.path.join(R, "scripts/silent-sweep/distilled"))
        from cellmap import dump_cells, load_cells
        ep = os.path.join(R, "scripts/silent-sweep/distilled/expected.jsonl")
        idx = load_cells(ep)
        for n in BOUNDARY:
            idx[n] = {"block": "d521-unannot-self-dispatch", "represents": 1}
        for n in PRICE_NEST:
            idx[n] = {"block": "d541-nested-operator-declaration", "represents": 1}
        dump_cells(ep, idx)
        print("wrote %d cells (%d boundary + %d D541 price) into %s, and their "
              "expected.jsonl rows" % (len(BOUNDARY) + len(PRICE_NEST), len(BOUNDARY),
                                       len(PRICE_NEST), NAMED))
        return 0

    if "--price" in sys.argv:
        # THE RUNS-LOST OVERRIDE, EXECUTABLE, over BOTH price populations: the 20
        # `d425c*` cells the standing gate blocks on, and D541's 40 nested cells that
        # no corpus carries. `CLAUDE.md` makes `runs` -> not-runs the veto and
        # `DECISIONS.md` makes it overridable only when the lost cells ran by
        # COINCIDENCE rather than by rule — a per-cell claim, checked per cell against
        # the seed they still ran on:
        #
        #   (a) it RAN                          — it is a real loss, not a no-op
        #   (b) output == its DO-NOTHING CONTROL — the declaration contributed NOTHING
        #   (c) output != the DECLARATION's answer
        #                                       — so it printed something its own source
        #                                         contradicts: a WRONG value, not a right one
        #
        # A cell failing (c) was a program that DISPATCHED and was correct: a veto, not
        # a price. Exit is non-zero if any cell fails any term.
        #
        # (c) FOR THE FOUR BLIND LEDGER CELLS is decided by their distinguishing twin
        # rather than by their own stdout, and the twin is RUN, not assumed: `d425c033`,
        # `c035`, `c037`, `c039` are `>`/`>=` at `1, 2`, natively `false`, with bodies
        # that also return `false`. The twin is the same program returning `true`; if it
        # is inert then the declaration reached no site, which is the fact (c) is about.
        # Reported as its own column, never folded into the pass count.
        nest = PRICE_NEST
        ledger = [(k, v) for k, v in D425_PRICE]
        # A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY (#2011). Run with either
        # population missing this would otherwise print `0 fail` three times and
        # "override holds" — a green result from nothing, indistinguishable from a
        # check that verified something.
        if not ledger or not nest:
            print("price: EMPTY POPULATION — the ledger lists %d legacy and %d nested "
                  "cells, so nothing was verified. This is a FAILURE, not an override."
                  % (len(ledger), len(nest)))
            return 1
        missing = [d425_name(k, v) for k, v in ledger
                   if not os.path.exists(os.path.join(NAMED, d425_name(k, v) + ".vl"))]
        if missing:
            print("price: %d ledger cells are MISSING from named/ (%s…) — the "
                  "population this check is about does not exist. FAILURE."
                  % (len(missing), missing[0]))
            return 1

        jobs = {}
        for k, v in ledger:
            n = d425_name(k, v)
            jobs[("cell", n)] = open(os.path.join(NAMED, n + ".vl")).read()
            jobs[("ctl", n)] = d425_ctl(k, v)
            jobs[("twin", n)] = d425_twin(k, v)
            jobs[("twinctl", n)] = "\n".join(d425_twin(k, v).split("\n")[1:])
        ks = cells(False)
        for n in nest:
            jobs[("cell", n)] = cs[n]
            jobs[("ctl", n)] = ks[n]
        g = grade_many(jobs, seed)

        bad_a, bad_b, bad_c, blind = [], [], [], []
        for k, v in ledger:
            n = d425_name(k, v)
            cr, co = g[("cell", n)]
            kr, ko = g[("ctl", n)]
            # d425's ledger records the BUILT-IN's answer, so the DECLARATION's answer
            # — the thing term (c) compares against — is read off the source here.
            dans = "false" if OPS[k] in RELATIONAL else "99"
            if not cr:
                bad_a.append(n)
                continue
            if not (kr and co == ko):
                bad_b.append((n, co, ko))
            if co != dans:
                continue
            # BLIND: stdout cannot separate dispatch from inert. Decide (c) on the twin.
            tr, to = g[("twin", n)]
            kr2, ko2 = g[("twinctl", n)]
            if tr and kr2 and to == ko2:
                blind.append((n, co, to))
            else:
                bad_c.append((n, co, dans))
        for n in nest:
            cr, co = g[("cell", n)]
            kr, ko = g[("ctl", n)]
            if not cr:
                bad_a.append(n)
                continue
            if not (kr and co == ko):
                bad_b.append((n, co, ko))
            if co == expectation(n):
                bad_c.append((n, co, expectation(n)))

        print("price cells: %d (%d D521 ledger + %d D541 nested)  seed %s"
              % (len(ledger) + len(nest), len(ledger), len(nest), seed))
        print("  (a) ran                            : %d fail" % len(bad_a))
        print("  (b) output == do-nothing control   : %d fail" % len(bad_b))
        print("  (c) output != declaration's answer : %d fail" % len(bad_c))
        print("      of which settled by the twin   : %d blind ledger cells" % len(blind))
        for lbl, rows in (("NEVER-RAN", bad_a), ("NOT-INERT", bad_b),
                          ("WAS-CORRECT (VETO)", bad_c)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        for r in blind:
            print("  BLIND-BUT-INERT (twin decides) %s" % (r,))
        ok = not (bad_a or bad_b or bad_c)
        print("price: %s" % ("every lost cell ran by coincidence and printed a WRONG "
                             "value — override holds" if ok else "VETO"))
        return 0 if ok else 1

    base = grade_all(seed)

    if "--verify" in sys.argv:
        rc = 0
        # (1) THE DISTINGUISHING RULE, run rather than asserted in prose.
        blind = [n for n, v in sorted(base.items())
                 if v["ctl"][0] and v["ctl"][1] == v["expect"]]
        for n in blind[:20]:
            print("BLIND (control answer == declaration answer): %s" % n)
        print("distinguishing: %d of %d cells blind" % (len(blind), len(base)))
        if blind:
            rc = 1
        # (2) this file reproduces the LEGACY LEDGER byte-for-byte, which is what lets
        # `--price` describe those files by axes instead of by hope.
        bad = 0
        for k in range(10):
            for v in range(4):
                p = os.path.join(NAMED, d425_name(k, v) + ".vl")
                if not os.path.exists(p) or open(p).read() != d425_src(k, v):
                    bad += 1
                    print("LEDGER MISMATCH: %s" % d425_name(k, v))
        print("legacy ledger: 40 d425c* cells regenerated, %d differ" % bad)
        if bad:
            rc = 1
        # (3) the set this grid contributes is present and byte-identical
        miss = diff = 0
        for n in BOUNDARY + PRICE_NEST:
            ref = os.path.join(NAMED, n + ".vl")
            if not os.path.exists(ref):
                miss += 1
                print("MISSING FROM named/: %s" % n)
            elif open(ref).read() != cells(True)[n]:
                diff += 1
                print("DIFFERS FROM named/: %s" % n)
        print("named/: %d expected (%d boundary + %d D541 price), %d missing, %d differ"
              % (len(BOUNDARY) + len(PRICE_NEST), len(BOUNDARY), len(PRICE_NEST),
                 miss, diff))
        if miss or diff:
            rc = 1
        print("verify: %s" % ("OK" if rc == 0 else "FAILED"))
        return rc

    hist = {}
    for v in base.values():
        hist[v["grade"]] = hist.get(v["grade"], 0) + 1
    print("%d cells: %s" % (len(base), ", ".join(
        "%s=%d" % (k, hist[k]) for k in sorted(hist))), file=sys.stderr)
    json.dump({n: v["grade"] + ":" + v["cell"][1] for n, v in sorted(base.items())},
              sys.stdout, indent=0, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
