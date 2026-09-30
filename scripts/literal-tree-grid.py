#!/usr/bin/env python3
"""The D2709/D2710 grid: trees of integer literals x delivery positions x destination widths
(i32, i64, f64, f32), graded against values computed here. Run from the checkout root.

Usage: scripts/literal-tree-grid.py <seed.wasm> [--show] [--json=<path>] [--float-adopt]
Prints one row per position with `as-expected/total` per width; --show lists every miss.
Its evaluator reads a tree at its destination's width, the reading before the exact-constant
ruling (DECISIONS.md, "Exact constant arithmetic"); `capability-probes/const-exact-grid.py`
grades the ruling."""
import math, os, re, struct, subprocess, sys, tempfile
from concurrent.futures import ThreadPoolExecutor

W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VL = os.environ.get("VL", W + "/scripts/vl-host/target/release/vl")
SEED = sys.argv[1]
SHOW = "--show" in sys.argv
# expect float destinations to adopt a literal tree (D2711, pending a ruling; off in the compiler)
FLOAT_ADOPT = "--float-adopt" in sys.argv
TMP = tempfile.mkdtemp(prefix="literal-tree-grid-")

EXPRS = [
    "3 << 32", "1 << 40", "2147483647 + 1", "100000 * 100000", "-(2147483647 + 1)",
    "~0 >>> 1", "7 / 2", "7 % 3", "(65536 | 1) * 65536", "0 - 2147483647 - 2", "1 << 31",
    "(1 << 31) >> 31", "0xffffffff + 1", "(3 + 4) * 5", "2147483647 * 2 / 2", "(1 << 62) ^ 1",
    "~(1 << 40)", "-7 / 2", "(1 << 63) >>> 63", "(1 << 3) + 1",
]

# ---- a tiny evaluator ---------------------------------------------------------------
TOK = re.compile(r"\s*(0x[0-9a-fA-F_]+|\d+|>>>|<<|>>|[-+*/%&|^~()])")
PREC = {"|": 1, "^": 2, "&": 3, "<<": 4, ">>": 4, ">>>": 4, "+": 5, "-": 5, "*": 6, "/": 6, "%": 6}


def parse(s):
    toks = TOK.findall(s)
    pos = [0]

    def peek():
        return toks[pos[0]] if pos[0] < len(toks) else None

    def nxt():
        t = toks[pos[0]]; pos[0] += 1; return t

    def prim():
        t = nxt()
        if t == "(":
            e = expr(0); nxt(); return e
        if t in ("-", "~"):
            return ("u" + t, prim())
        return ("lit", t)

    def expr(minp):
        l = prim()
        while peek() in PREC and PREC[peek()] > minp:
            op = nxt()
            r = expr(PREC[op])
            l = (op, l, r)
        return l
    return expr(0)


class Refuse(Exception):
    pass


def kind(n):  # 1 arithmetic only, 2 bitwise somewhere
    if n[0] == "lit":
        return 0
    if n[0] == "u~":
        return 2
    if n[0] == "u-":
        return kind(n[1])
    k = 2 if n[0] in ("<<", ">>", ">>>", "&", "|", "^") else 1
    return max(k, kind(n[1]), kind(n[2]))


def wrap(v, b):
    v &= (1 << b) - 1
    return v - (1 << b) if v >> (b - 1) else v


def ieval(n, b):
    t = n[0]
    if t == "lit":
        s = n[1].replace("_", "")
        return wrap(int(s, 16), b) if s.startswith("0x") else wrap(int(s), b)
    if t == "u-":
        return wrap(-ieval(n[1], b), b)
    if t == "u~":
        return wrap(~ieval(n[1], b), b)
    a = ieval(n[1], b)
    if t in ("<<", ">>", ">>>"):
        c = ieval(n[2], 32) if n[2][0] != "lit" else int(n[2][1])
        if c < 0 or c >= b:
            raise Refuse()
        if t == "<<":
            return wrap(a << c, b)
        if t == ">>":
            return a >> c
        return wrap((a & ((1 << b) - 1)) >> c, b)
    c = ieval(n[2], b)
    if t == "+": return wrap(a + c, b)
    if t == "-": return wrap(a - c, b)
    if t == "*": return wrap(a * c, b)
    if t == "/": return wrap(int(a / c) if abs(a) < 2**52 else (abs(a) // abs(c)) * (1 if (a < 0) == (c < 0) else -1), b)
    if t == "%": return wrap(a - c * int(a / c), b)
    if t == "&": return a & c
    if t == "|": return a | c
    if t == "^": return a ^ c
    raise ValueError(t)


def f32(x):
    return struct.unpack("f", struct.pack("f", x))[0]


def feval(n, single):
    r = f32 if single else (lambda x: x)
    t = n[0]
    if t == "lit":
        s = n[1]
        return r(float(int(s, 16) if s.startswith("0x") else int(s)))
    if t == "u-":
        return -feval(n[1], single)
    a, c = feval(n[1], single), feval(n[2], single)
    if t == "+": return r(a + c)
    if t == "-": return r(a - c)
    if t == "*": return r(a * c)
    if t == "/": return r(a / c)
    if t == "%": return r(math.fmod(a, c))
    raise ValueError(t)


def leaves_exact_f32(n):
    if n[0] == "lit":
        s = n[1]
        v = int(s, 16) if s.startswith("0x") else int(s)
        return f32(float(v)) == v
    return all(leaves_exact_f32(c) for c in n[1:])


def expect(e, w):
    """('value', v) or ('refuse',) for the rule this PR lands."""
    n = parse(e)
    try:
        if w == "i32":
            return ("value", ieval(n, 32))
        if w == "i64":
            return ("value", ieval(n, 64))
        if FLOAT_ADOPT and kind(n) == 1 and (w == "f64" or leaves_exact_f32(n)):
            return ("value", feval(n, w == "f32"))
        if w == "f32":
            return ("refuse",)  # an i32 value is not implicitly an f32
        return ("value", float(ieval(n, 32)))
    except Refuse:
        return ("refuse",)


# ---- positions ----------------------------------------------------------------------
POS = {
    "const_global": "const v: {W} = {E}\nprint(v)\n",
    "let_local": "function m() {{\n  let v: {W} = {E}\n  print(v)\n}}\nm()\n",
    "tail_return": "function r(): {W} {{ {E} }}\nprint(r())\n",
    "return_stmt": "function r(): {W} {{\n  return {E}\n}}\nprint(r())\n",
    "argument": "function id(x: {W}): {W} {{ x }}\nprint(id({E}))\n",
    "field": "type S = {{ v: {W} }}\nconst s: S = {{ v: {E} }}\nprint(s.v)\n",
    "list_cell": "const xs: {W}[] = [{E}]\nprint(xs[0])\n",
    "index_assign": "const xs: {W}[] = [0]\nxs[0] = {E}\nprint(xs[0])\n",
    "map_cell": "const m: {{[i32]: {W}}} = Map()\nm[1] = {E}\nprint(m[1] ?? 0)\n",
    "plus_assign": "let v: {W} = 0\nv += {E}\nprint(v)\n",
    "coalesce": "function n(c: boolean): {W} | null {{ if c {{ 0 }} else {{ null }} }}\nprint(n(false) ?? {E})\n",
    "if_tail": "function t(c: boolean) {{\n  const v: {W} = if c {{ {E} }} else {{ 0 }}\n  print(v)\n}}\nt(true)\n",
    "match_tail": "function t(k: i32) {{\n  const v: {W} = match k {{\n    1 => {E}\n    _ => 0\n  }}\n  print(v)\n}}\nt(1)\n",
    "closure_ret": "const f = (): {W} => {E}\nprint(f())\n",
    "global_assign": "let g: {W} = 0\nfunction s() {{ g = {E} }}\ns()\nprint(g)\n",
    "wide_peer": "function p(x: {W}): {W} {{ x + ({E}) }}\nprint(p(0))\n",
}

# the mixed tree: an i32 VARIABLE operand is never widened, at every destination
MIXED = "function q(x: i32): {W} {{ x * ({E}) }}\nprint(q(1))\n"


def run(src):
    p = os.path.join(TMP, "c%d.vl" % (hash(src) & 0xffffffffff))
    open(p, "w").write(src)
    env = dict(os.environ, VL_STD=W + "/std")
    r = subprocess.run([VL, "run", p, "--compiler", SEED], capture_output=True, text=True, timeout=120, env=env)
    out = (r.stdout or "").strip()
    if r.returncode != 0:
        if "error" in (r.stdout + r.stderr).lower() and "type error" in (r.stdout + r.stderr):
            return ("refuse", (r.stdout + r.stderr).strip().splitlines()[1:2])
        return ("fail", (r.stdout + r.stderr).strip().splitlines()[-2:])
    return ("value", out)


def same(got, want, w):
    if want[0] == "refuse":
        return got[0] == "refuse"
    if got[0] != "value":
        return False
    try:
        g = float(got[1]) if w in ("f64", "f32") else int(got[1])
    except ValueError:
        return False
    if w == "f32":
        return f32(g) == want[1] or g == want[1]
    return g == want[1]


cells = []
for e in EXPRS:
    for w in ("i32", "i64", "f64", "f32"):
        want = expect(e, w)
        for pn, tpl in POS.items():
            cw = want
            # `f32? ?? tree` with a tree that cannot adopt f32 is a union with the i32 value
            if pn == "coalesce" and w == "f32" and want == ("refuse",):
                try:
                    cw = ("value", float(ieval(parse(e), 32)))
                except Refuse:
                    pass
            cells.append((pn, w, e, tpl.format(W=w, E=e), cw))
        # the mixed tree: the i32 variable is never widened, so the tree is computed at i32
        # (a literal subtree beside it keeps its 32-bit reading) and then delivered
        n = parse(e)
        try:
            v = ieval(n, 32)
            mw = ("value", v if w in ("i32", "i64") else float(v))
            if w == "f32":
                mw = ("refuse",)
        except Refuse:
            mw = ("refuse",)
        cells.append(("i32var_mixed", w, e, MIXED.format(W=w, E=e), mw))

with ThreadPoolExecutor(4) as ex:
    res = list(ex.map(lambda c: run(c[3]), cells))

tab = {}
bad = []
for c, g in zip(cells, res):
    ok = same(g, c[4], c[1])
    k = (c[0], c[1])
    tab.setdefault(k, [0, 0])
    tab[k][0 if ok else 1] += 1
    if not ok:
        bad.append((c, g))

ws = ("i32", "i64", "f64", "f32")
print("%-16s" % "position" + "".join("%12s" % w for w in ws))
tot = [0, 0]
for pn in list(POS) + ["i32var_mixed"]:
    row = "%-16s" % pn
    for w in ws:
        a, b = tab.get((pn, w), [0, 0])
        tot[0] += a; tot[1] += b
        row += "%12s" % ("%d/%d" % (a, a + b))
    print(row)
print("TOTAL %d/%d as expected, %d not" % (tot[0], tot[0] + tot[1], tot[1]))
import json
jp = [a for a in sys.argv if a.startswith("--json=")]
if jp:
    json.dump([[c[0], c[1], c[2], g[0], g[1]] for c, g in zip(cells, res)], open(jp[0][7:], "w"))
if SHOW:
    for c, g in bad:
        print("---", c[0], c[1], c[2], "want", c[4], "got", g)
