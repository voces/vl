#!/usr/bin/env python3
"""The exact-constant grid (DECISIONS.md, "Exact constant arithmetic", owner ruling A, 2026-09-30).

    python3 scripts/capability-probes/const-exact-grid.py [--compiler W] [--before W] [--jobs N]

One program per cell of constant initialiser (wrapping sums and products, shifts to and past 31,
32, 63 and 64, negations, radix patterns, division and remainder, float arithmetic, mixed int and
float, chains of consts) x use (i32, i64, f32, f64, u8 element, union, generic, interpolation,
print, argument, return, field, list element, shift count) x spelling (a `const K` and the tree
written in place). Each cell's expected output comes from Python's exact integers and fractions
through the ruling's rules, a refusal included; the cell must print it, or be refused where the
rule refuses. `--before` runs an older compiler too and splits the cells that moved into those
whose old output was the exact value (a loss) and those whose old output was wrapped; a cell of
arithmetic over a radix pattern, which the ruling leaves at its use's width, must print exactly
what the --before compiler prints. Exits
non-zero on any cell that disagrees with its rule, or any loss.
"""
import os, sys, subprocess, struct, json, tempfile
from fractions import Fraction
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")


def arg(name, default):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv else default


SEED = arg("--compiler", os.path.join(ROOT, "build", "vl-compiler.wasm"))
BEFORE = arg("--before", "")
JOBS = int(arg("--jobs", "8"))
OUT = tempfile.mkdtemp(prefix="const-exact-grid-")
faces = ["const", "inline"]

# name, prelude, expr, value (int or Fraction), pattern?, isfloat
INITS = [
    ("wrapsum", "", "2147483647 + 1", 2**31, False, False),
    ("prod32", "", "65536 * 65536", 2**32, False, False),
    ("prod10", "", "100000 * 100000", 10**10, False, False),
    ("shl31", "", "1 << 31", 2**31, False, False),
    ("shl32", "", "1 << 32", 2**32, False, False),
    ("shl40", "", "1 << 40", 2**40, False, False),
    ("shl63", "", "1 << 63", 2**63, False, False),
    ("shl64", "", "1 << 64", 2**64, False, False),
    ("hshl31", "", "0x1 << 31", 2**31, True, False),
    ("hshl63", "", "0x1 << 63", None, False, False),  # a pattern shifted past 32 bits: at width
    ("negmin", "", "-(-2147483648)", 2**31, False, False),
    ("minint", "", "-2147483647 - 1", -2**31, False, False),
    ("minlong", "", "-9223372036854775807 - 1", -2**63, False, False),
    # Arithmetic over a radix pattern is the pattern at the use's width (owner, 2026-09-30):
    # not folded, so each cell must print what the --before compiler prints.
    ("hexsum", "", "0xFFFFFFFF + 1", None, False, False),
    ("hexdiv", "", "0x80000000 / 2", None, False, False),
    ("hexrem", "", "0xFFFFFFFF % 7", None, False, False),
    ("hexwrap", "", "0x7FFFFFFF + 1", None, False, False),
    ("hexshl", "", "0xFFFFFFFF << 4", None, False, False),
    ("hexor", "", "0xFFFF0000 | 0xFF", 0xFFFF00FF, True, False),
    ("hexneg3", "", "-(-(-0xFFFFFFFF))", -0xFFFFFFFF, True, False),
    ("notff", "", "~0xFF", -256, True, False),
    ("notzero", "", "~0", -1, False, False),
    ("div", "", "-7 / 2", -3, False, False),
    ("rem", "", "-7 % 2", -1, False, False),
    ("shr", "", "-1024 >> 3", -128, False, False),
    ("big", "", "(1 << 70) >> 60", 1024, False, False),
    ("small", "", "3 * 4 + 1", 13, False, False),
    ("chain", "const A = 1 << 20\n", "A * 4096", 2**32, False, False),
    ("chain2", "const A = 1 << 20\nconst B = A * 2\n", "B + B", 2**22, False, False),
    ("chainhex", "const A = 0xFF\n", "A << 24", 0xFF000000, True, False),
    ("f_sum", "", "0.1 + 0.2", Fraction(3, 10), False, True),
    ("f_mix", "", "1 + 0.5", Fraction(3, 2), False, True),
    ("f_whole", "", "2.5 * 4", Fraction(10), False, True),
    ("f_third", "", "1.0 / 3", Fraction(1, 3), False, True),
    ("f_bigwhole", "", "1.5 * 4000000000", Fraction(6000000000), False, True),
    ("i_div", "", "7 / 2", 3, False, False),
]

def bitlen(v): return abs(v).bit_length()
def wrap(v, b):
    v &= (1 << b) - 1
    return v - (1 << b) if v >> (b - 1) else v
def int_at(v, pat, b):
    if pat:
        return wrap(v, b) if bitlen(v) <= b else None
    return v if -(1 << (b - 1)) <= v < (1 << (b - 1)) else None
def default_int(v, pat):
    r = int_at(v, pat, 32)
    if r is not None: return r
    return int_at(v, pat, 64)
def exact_float(v, sig, maxw):
    if v == 0: return True
    m = abs(v)
    if m.bit_length() > maxw: return False
    while m % 2 == 0: m //= 2
    return m.bit_length() <= sig
def f32(x): return struct.unpack("f", struct.pack("f", x))[0]
def fmt_f(x):
    # JavaScript's Number#toString, which VL's print of a float follows
    if x == 0: return "0"
    r = repr(x)
    if "e" in r or "E" in r:
        mant, exp = r.lower().split("e")
        exp = int(exp)
        neg = mant.startswith("-")
        mant = mant.lstrip("-")
        digits = mant.replace(".", "")
        point = (mant.index(".") if "." in mant else len(mant)) + exp
        if 0 < point <= 21 and abs(x) < 1e21:
            if len(digits) <= point:
                out = digits + "0" * (point - len(digits))
            else:
                out = digits[:point] + "." + digits[point:]
            return ("-" if neg else "") + out
        if -6 < point <= 0:
            return ("-" if neg else "") + "0." + "0" * (-point) + digits
        return r
    if r.endswith(".0"): return r[:-2]
    return r
ERR = "ERR"
AT_WIDTH = "AT_WIDTH"  # a radix-pattern arithmetic cell: graded against --before

def expect(use, v, pat, isf):
    if v is None: return AT_WIDTH
    if isf:
        whole = v.denominator == 1
        if use in ("i32", "arg32", "union"):
            if use == "union" or not whole: return ERR
            r = int_at(int(v), False, 32)
            return ERR if r is None else str(r)
        if use in ("i64", "arg64", "ret64", "field64", "elem64"):
            if not whole: return ERR
            r = int_at(int(v), False, 64)
            return ERR if r is None else str(r)
        if use == "u8":
            return ERR  # a float at a u8 element is refused, as a float literal is
        if use == "shift": return ERR
        if use == "f32": return fmt_f(f32(float(v)))
        if use == "interp": return "v=" + fmt_f(float(v))
        return fmt_f(float(v))  # f64, print, generic
    # integer
    if use in ("i32", "arg32", "union"):
        r = int_at(v, pat, 32); return ERR if r is None else str(r)
    if use in ("i64", "arg64", "ret64", "field64", "elem64"):
        r = int_at(v, pat, 64); return ERR if r is None else str(r)
    if use == "u8":
        # a u8 element takes the literal's rule: past 255 is refused, a negative i32 truncates
        if v > 255: return ERR
        if v >= 0: return str(v)
        if (pat and bitlen(v) <= 32) or (not pat and v >= -2**31): return str(v % 256)
        return ERR
    if use == "f64":
        return fmt_f(float(v)) if exact_float(v, 53, 1024) else ERR
    if use == "f32":
        return fmt_f(float(v)) if exact_float(v, 24, 128) else ERR
    if use == "shift":
        if v < 0 or v >= 64: return ERR
        return str(wrap(1 << v, 64))
    d = default_int(v, pat)
    if d is None: return ERR
    if use == "interp": return "v=" + str(d)
    return str(d)  # print, generic

USES = {
    "i32": "let y: i32 = {K}\nprint(y)",
    "i64": "let y: i64 = {K}\nprint(y)",
    "f32": "let y: f32 = {K}\nprint(y)",
    "f64": "let y: f64 = {K}\nprint(y)",
    "u8": "const xs: u8[] = [{K}]\nprint(xs[0])",
    "union": "let y: i32 | string = {K}\nif y is i32 {{ print(y) }}",
    "generic": "function id<T>(x: T): T {{ x }}\nprint(id({K}))",
    "interp": "print(\"v=\\{{{K}}}\")",
    "print": "print({K})",
    "arg32": "function f(x: i32) {{ print(x) }}\nf({K})",
    "arg64": "function f(x: i64) {{ print(x) }}\nf({K})",
    "ret64": "function r(): i64 {{ {K} }}\nprint(r())",
    "field64": "type R = {{ v: i64 }}\nconst r: R = {{ v: {K} }}\nprint(r.v)",
    "elem64": "const xs: i64[] = [{K}]\nprint(xs[0])",
    "shift": "function sh(x: i64): i64 {{ x << ({K}) }}\nprint(sh(1))",
}

def program(face, prelude, expr, use):
    body = USES[use]
    if face == "const":
        return prelude + "const K = " + expr + "\n" + body.format(K="K") + "\n"
    return prelude + body.format(K="(" + expr + ")") + "\n"

def run(seed, path):
    env = dict(os.environ, VL_STD=os.path.join(ROOT, "std"), TMPDIR=OUT)
    p = subprocess.run(["timeout", "60", VL, "run", path, "--compiler", seed],
                       capture_output=True, text=True, env=env, cwd=ROOT)
    out = (p.stdout + p.stderr).strip()
    if out.startswith("Error: type error"):
        return ERR
    if p.returncode != 0:
        return "FAIL: " + out.split("\n")[0][:100]
    return out


cells = []
for name, prelude, expr, v, pat, isf in INITS:
    for use in USES:
        for face in faces:
            cid = name + "." + use + "." + face
            path = os.path.join(OUT, cid + ".vl")
            with open(path, "w") as f:
                f.write(program(face, prelude, expr, use))
            cells.append((cid, path, expect(use, v, pat, isf)))

with ThreadPoolExecutor(max_workers=JOBS) as ex:
    got = list(ex.map(lambda c: run(SEED, c[1]), cells))
bad = 0
old = []
if BEFORE:
    with ThreadPoolExecutor(max_workers=JOBS) as ex:
        old = list(ex.map(lambda c: run(BEFORE, c[1]), cells))
width_cells = 0
for i, ((cid, _, want), g) in enumerate(zip(cells, got)):
    if want == AT_WIDTH:
        width_cells += 1
        if not old:
            continue
        want = old[i]
    if g != want:
        bad += 1
        print("WRONG " + cid + ": rule wants " + repr(want) + ", got " + repr(g))
graded = len(cells) - (0 if old else width_cells)
print(str(graded) + " cells: as the rule says " + str(graded - bad) + ", disagree " + str(bad)
      + " (" + str(width_cells) + " radix-arithmetic cells graded against --before"
      + ("" if old else ", skipped: no --before") + ")")

losses = 0
if BEFORE:
    moved_wrap = 0
    now_refused = 0
    for (cid, _, want), g, o in zip(cells, got, old):
        if o == g or o == ERR or o.startswith("FAIL"):
            continue
        name, use, _face = cid.split(".")
        v = [i for i in INITS if i[0] == name][0][3]
        if v is None:
            continue
        if use == "shift":
            exact = str(wrap(1 << v, 64)) if isinstance(v, int) and 0 <= v < 64 else None
        elif use == "f32":
            exact = fmt_f(f32(float(v)))
        else:
            exact = fmt_f(float(v)) if isinstance(v, Fraction) else str(v)
            if use == "interp":
                exact = "v=" + exact
        if o == exact:
            losses += 1
            print("LOST " + cid + ": printed the exact " + repr(o) + ", now " + repr(g))
        else:
            moved_wrap += 1
            if g == ERR:
                now_refused += 1
    print("moved from a wrapped or step-rounded value: " + str(moved_wrap)
          + " (" + str(now_refused) + " now refused, " + str(moved_wrap - now_refused) + " now exact)"
          + "; lost: " + str(losses))
sys.exit(1 if bad or losses else 0)
