#!/usr/bin/env python3
"""The ALIAS-vs-INLINE TWIN TABLE for an array-of-map alias body — 1,088 cells.

WHY A TWIN TABLE AND NOT A GRID.  `scripts/silent-sweep/d181/gen181.py` measures how many
cells a change MOVES.  That is the wrong question for a transparency arm, because the target
is not "more cells run" but "the alias spelling stops being a dialect of its own": every cell
must land on the verdict its ALIAS-FREE control already had, including the cells whose
control is a refusal.  So every cell here exists TWICE — once spelled through a one-member
`type L = …` alias and once with the inline spelling — the two programs identical character
for character apart from the annotation, and the reading is `alias == inline`, per pair.

This is the shape D-ALIASMAP's own two tables used (73 cells) and the shape
`array-alias-nominal-element.vl` records for the declared-struct leaf.

THE AXES
    body        {[string]:V}[]  ·  {[string]:V}[][]  ·  {[string]:V[]}[]  ·  {[string]:{[string]:V}}[]
    value V     i32 · string · f64 · boolean · a declared struct · a litunion alias ·
                an inline shape · i32|null
    position    17: local binding · global · param · return annotation · struct field ·
                array element · `| null` · map value · index read · push · for-in ·
                closure param · closure result · UNION MEMBER · empty literal ·
                generic argument · two claimants

Graded on the RUN VALUE, not on an exit code.

WHAT IT SEES THAT THE 1,200-CELL GRID CANNOT.  That grid pins `union=nounion`, so it has no
UNION-MEMBER position — and that is the only position where the nominal-render leg
(`transparentMemberEmitName`, D187's refutation pin) does anything.  On the grid the leg is
inert; here the claim alone is +446 forward / **3 BACKWARD** and the pair is +447 / **0**.

Usage:
    python3 scripts/silent-sweep/d181/twin181.py <compA.wasm> [<compB.wasm> ...]

`JOBS` (env, default 4) caps concurrency; `vl check` peaks around 650 MB RSS.
"""
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VL = os.environ.get("VL", os.path.join(ROOT, "scripts/vl-host/target/release/vl"))
SCR = os.path.join(ROOT, "scratch-silent", "d181twin")
JOBS = int(os.environ.get("JOBS", "4"))
os.makedirs(SCR, exist_ok=True)

# ── map VALUE kinds: (name, type spelling, a value of it, prelude lines) ───────────
VALS = [
    ("i32", "i32", "7", []),
    ("string", "string", '"s"', []),
    ("f64", "f64", "7.5", []),
    ("boolean", "boolean", "true", []),
    ("Cat", "Cat", "{ n: 7 }", ["type Cat = { n: i32 }"]),
    ("K0", "K0", '"a"', ['type K0 = "a" | "b"']),
    ("shape", "{n: i32}", "{ n: 7 }", []),
    ("nul", "i32 | null", "7", []),
]

# ── alias BODIES: an array-of-map at several depths ───────────────────────────────
BODIES = [
    ("lm", "{[string]: %s}[]"),
    ("lmm", "{[string]: %s}[][]"),
    ("lml", "{[string]: %s[]}[]"),
    ("lmnm", "{[string]: {[string]: %s}}[]"),
]
PRED = {"lm": 'e0["k"] != null', "lmm": "e0.length > 0",
        "lml": 'e0["k"] != null', "lmnm": 'e0["k"] != null'}


def maker(body_key, vty, vval):
    """Lines building `c` of the body type.  `BODY` is substituted per spelling."""
    if body_key == "lm":
        return ["  const mm: {[string]: %s} = Map()" % vty,
                '  mm["k"] = %s' % vval,
                "  const c: BODY = [mm]"]
    if body_key == "lmm":
        return ["  const mm: {[string]: %s} = Map()" % vty,
                '  mm["k"] = %s' % vval,
                "  const inr: {[string]: %s}[] = [mm]" % vty,
                "  const c: BODY = [inr]"]
    if body_key == "lml":
        return ["  const mm: {[string]: %s[]} = Map()" % vty,
                '  mm["k"] = [%s]' % vval,
                "  const c: BODY = [mm]"]
    return ["  const inm: {[string]: %s} = Map()" % vty,
            '  inm["k"] = %s' % vval,
            "  const mm: {[string]: {[string]: %s}} = Map()" % vty,
            '  mm["k"] = inm',
            "  const c: BODY = [mm]"]


def positions(body_key, vty, vval, pred):
    mk = maker(body_key, vty, vval)
    P = {}
    P["local"] = ([], ["function f() {"] + mk + ["  print(c.length)", "}", "f()"])
    P["global"] = ([], ["function mk(): BODY {"] + mk + ["  return c", "}",
                        "const g: BODY = mk()", "print(g.length)"])
    P["param"] = ([], ["function take(x: BODY) { print(x.length) }",
                       "function f() {"] + mk + ["  take(c)", "}", "f()"])
    P["retann"] = ([], ["function mk(): BODY {"] + mk + ["  return c", "}",
                        "print(mk().length)"])
    P["field"] = (["type W = { f: BODY }"],
                  ["function f() {"] + mk + ["  const w: W = { f: c }",
                                             "  print(w.f.length)", "}", "f()"])
    P["elem"] = ([], ["function f() {"] + mk + ["  const ll: BODY[] = [c]",
                                                "  print(ll.length)", "}", "f()"])
    P["nullable"] = ([], ["function f() {"] + mk
                     + ["  const nv: BODY | null = c",
                        "  if nv != null { print(1) } else { print(0) }", "}", "f()"])
    P["mapval"] = ([], ["function f() {"] + mk
                   + ["  const mo: {[string]: BODY} = Map()", '  mo["z"] = c',
                      '  const r = mo["z"]',
                      "  if r != null { print(1) } else { print(0) }", "}", "f()"])
    P["idxread"] = ([], ["function f() {"] + mk + ["  const e0 = c[0]",
                                                   "  print(%s)" % pred, "}", "f()"])
    P["push"] = ([], ["function f() {"] + mk + ["  const c2: BODY = []", "  c2.push(c[0])",
                                                "  print(c2.length)", "}", "f()"])
    P["forin"] = ([], ["function f() {"] + mk + ["  let n = 0", "  for z in c { n = n + 1 }",
                                                 "  print(n)", "}", "f()"])
    P["cloparam"] = ([], ["function f() {"] + mk + ["  const lam = (x: BODY) => x.length",
                                                    "  print(lam(c))", "}", "f()"])
    P["clores"] = ([], ["function f() {"] + mk + ["  const lam = (): BODY => c",
                                                  "  print(lam().length)", "}", "f()"])
    P["unionmem"] = ([], ["function u(x: BODY | i32): i32 { if x is i32 { return 0 } return 1 }",
                          "function f() {"] + mk + ["  print(u(c))", "}", "f()"])
    P["empty"] = ([], ["function f() {", "  const c: BODY = []",
                       "  print(c.length)", "}", "f()"])
    P["gparam"] = (["function idg<T>(x: T): T { return x }"],
                   ["function f() {"] + mk + ["  const d = idg(c)", "  print(d.length)",
                                              "}", "f()"])
    P["twoclaim"] = ([], ["function f() {"] + mk + ["  const c2: BODY = []",
                                                    "  print(c.length + c2.length)",
                                                    "}", "f()"])
    return P


def build(body_key, bodyfmt, vty, vpre, vval, pos, spelling):
    pre, lines = positions(body_key, vty, vval, PRED[body_key])[pos]
    inline = bodyfmt % vty
    if spelling == "alias":
        head, sub = list(vpre) + ["type L = %s" % inline] + pre, "L"
    else:
        head, sub = list(vpre) + pre, inline
    return "\n".join(ln.replace("BODY", sub) for ln in head + lines) + "\n"


CELLS = []
for body_key, bodyfmt in BODIES:
    for vname, vty, vval, vpre in VALS:
        for pos in sorted(positions(body_key, vty, vval, PRED[body_key])):
            for spelling in ("alias", "inline"):
                CELLS.append((body_key, vname, pos, spelling,
                              build(body_key, bodyfmt, vty, vpre, vval, pos, spelling)))


def grade_one(args):
    idx, comp = args
    c = CELLS[idx]
    p = os.path.join(SCR, "c%05d_%s.vl" % (idx, c[3]))
    open(p, "w").write(c[4])
    ex = ["--compiler", comp]
    rc = subprocess.run([VL, "check", p] + ex, cwd=ROOT, capture_output=True, text=True)
    if rc.returncode != 0:
        return "checkrej"
    r = subprocess.run([VL, "run", p] + ex, cwd=ROOT, capture_output=True, text=True)
    if r.returncode == 0:
        return "run:" + r.stdout.strip()
    err = r.stderr or ""
    if ("failed to parse WebAssembly" in err or "Invalid input WebAssembly" in err
            or "type mismatch" in err):
        return "INVALIDWASM"
    return "emitrej"


def grade_all(comp):
    """PREWARM SERIALLY FIRST.  `vl --compiler X` caches its Cranelift image in a `.cwasm`
    SIDECAR beside X; a cold fan-out has every worker racing to write that one file, and a
    reader that catches a truncated write grades a spurious `emitrej`.  Measured: without
    this the four `unionmem` cells disagreed between two runs of this file."""
    p = os.path.join(SCR, "prewarm.vl")
    open(p, "w").write("print(1)\n")
    subprocess.run([VL, "run", p, "--compiler", comp], cwd=ROOT, capture_output=True)
    with ThreadPoolExecutor(max_workers=JOBS) as ex:
        return list(ex.map(grade_one, [(i, comp) for i in range(len(CELLS))]))


def rank(v):
    """higher is better: runs > a LOUD refusal > silent invalid wasm."""
    return 3 if v.startswith("run") else (0 if v == "INVALIDWASM" else 1)


def main():
    comps = sys.argv[1:]
    if not comps:
        print(__doc__.strip().splitlines()[-3])
        sys.exit(2)
    res = {c: grade_all(c) for c in comps}
    pairs = {}
    for i, (bk, vn, pos, sp, _s) in enumerate(CELLS):
        pairs.setdefault((bk, vn, pos), {})[sp] = i
    print("cells: %d  (%d pairs)" % (len(CELLS), len(pairs)))
    base = res[comps[0]]
    for c in comps:
        r = res[c]
        agree = sum(1 for d in pairs.values() if r[d["alias"]] == r[d["inline"]])
        sil = sum(1 for d in pairs.values() if r[d["alias"]] == "INVALIDWASM")
        moved = [i for i in range(len(CELLS)) if r[i] != base[i]]
        fwd = sum(1 for i in moved if rank(r[i]) > rank(base[i]))
        back = [i for i in moved if rank(r[i]) < rank(base[i])]
        inl = [i for i in moved if CELLS[i][3] == "inline"]
        print("\n%s" % os.path.basename(c))
        print("   alias == inline on %d/%d pairs" % (agree, len(pairs)))
        print("   alias INVALIDWASM  %d" % sil)
        print("   vs %s: moved %d (forward %d, backward %d, lateral %d)"
              % (os.path.basename(comps[0]), len(moved), fwd, len(back),
                 len(moved) - fwd - len(back)))
        if inl:
            print("   !! THE INLINE CONTROL MOVED on %d cells" % len(inl))
        for i in back:
            print("      BACKWARD %-5s %-7s %-9s  %s -> %s"
                  % (CELLS[i][0], CELLS[i][1], CELLS[i][2], base[i], r[i]))
        bad = [(k, r[d["alias"]], r[d["inline"]]) for k, d in sorted(pairs.items())
               if r[d["alias"]] != r[d["inline"]]]
        for k, a, b in bad:
            print("      alias != inline  %-5s %-7s %-9s  alias=%-12s inline=%s"
                  % (k[0], k[1], k[2], a, b))


main()
