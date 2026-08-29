#!/usr/bin/env python3
"""D572 — the DESTINATION seam of a generic body re-checked at the pin, graded BY THE VALUE
against the one-token-different DIRECT spelling.

THE QUESTION, and why it is not D551/D561's. Those two rows are about the RETURN seam: a
generic's declared return type vs its body's type, adjudicated by `validateRetCstrs` at the
pin. This grid asks the mirror question at every OTHER place a value lands inside a generic
body — a local declaration, a plain re-assignment, a struct field write, an array element
write. `function g<T>(self: T, n: i32): T { const r: T = n + 1  return r }` at `g("s", 2)`
is `vl check` rc 0 over a module the engine refuses, and the `return r` is clean BY
CONSTRUCTION: `r`'s declared type is the hole `T`, which substitutes to `string` and matches
the declared return exactly. The i32 entered at `const r: T = n + 1`, where
`assignable(i32, T)` is vacuous and nothing recorded the pair.

EVERY CELL SHIPS WITH ITS DIRECT TWIN and the twin differs in EXACTLY ONE thing: the type
PARAMETER is written out as the argument's own type (`<T>(self: T)` becomes
`(self: string)`, and every `T` in the body with it). Same body, same constants, same call,
same `print`. So every expected answer here is the language's own answer to the same
question, spelled out — never a remembered one.

GRADED BY VALUE, because the worst cell in this family is not a reject and not invalid wasm.
`function g<T>(self: T, n: i32): T { const r: T = n + 1  return r }` at `g(true, -1)`
VALIDATES and prints `false` for an argument that was `true` — i32 and boolean share a rep,
so there is no invalid wasm to trip over — beside a direct twin that is a loud `cannot
assign i32 to 'r' of type boolean`. A grid that prints a constant cannot see that cell, and
this family has now cost two grids exactly that way (#2016, #2018).

THE AXES, and why each is separate:

    seam   WHERE the value lands: `decl` (`const r: X = e`), `asg` (`r = e` to an
           already-declared local), `field` (`b.v = e`), `elem` (`xs[0] = e`). `decl` is
           `checkLetDeclNode`'s gate; the other three are ONE gate — `checkBinExprNodeReal`'s
           `=` arm — and the grid keeps them apart anyway because a reader given only
           `asg` would not know the other two ride it.
    dst    the DESTINATION's declared type. `hole` is D572's own shape (the destination is
           the type parameter `T` and the SOURCE is a concrete `n + 1`); the five concrete
           types are the MIRROR (a concrete destination fed the hole-typed `self`), which
           is the same silent outcome and was never filed.
    arg    the call's argument type — what the pin binds the hole to, and for `dst=hole`
           also what the destination becomes.
    call   `g(p)` vs `p.g()`. Two DIFFERENT pins in `typecheck.vl`; wiring only the first
           would leave the method spelling silent beside a loud direct one, which is the
           asymmetry D401 and D551 both had to fix after the fact.

THE ONE-OFF CELLS, each because a candidate or a filed row moved it:

    a7     THE COERCION THAT MUST SURVIVE. `const r: i32 = self` at `g(true)` RUNS and
           prints `1` on every seed — the boolean-to-i32 A7 coercion lives at the
           EXPRESSION seam, so a pin asking plain `assignable` instead of `assignableExpr`
           invents a false reject here. D551 hit exactly this and it is the first thing
           this grid re-asks.
    brandlet  THE REWRITE D572'S ROW NAMES. `const r: A = self.base + i * 4  return r`
           inside `rowAt<A>` — the shape someone reaching for a workaround to a D561
           reject would write. It RUNS on the base seed printing `1032`, and its concrete
           twin is a loud `` i32 doesn't fit in A1 ``. Whether the landing keeps or closes
           it is a decision, not an accident, so it is a cell.
    forge  D571'S OWN WITNESS, reduced. It must keep RUNNING: it is the deliberate residue
           of D561 and this landing must not touch the RETURN seam.
    okhole THE CONTROL. `const r: T = self` — a hole-typed destination fed the hole itself.
           Correct at every instance, so it must RUN on every seed and agree with its twin.

    python3 scripts/silent-sweep/d572/letgrid.py [seed.wasm]      grade to stdout
    python3 scripts/silent-sweep/d572/letgrid.py --table          by seam x dst x arg
    python3 scripts/silent-sweep/d572/letgrid.py --emit <dir>     write the cells
    python3 scripts/silent-sweep/d572/letgrid.py B.wasm --delta C.wasm
    python3 scripts/silent-sweep/d572/letgrid.py --write-lists C.wasm B.wasm [--refused S]
    python3 scripts/silent-sweep/d572/letgrid.py --verify B.wasm   (B = the BASE seed)
    python3 scripts/silent-sweep/d572/letgrid.py --price S         a refused rung's price
    python3 scripts/silent-sweep/d572/letgrid.py --mkset
"""
import concurrent.futures
import hashlib
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
R = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
NAMED = os.path.join(R, "scripts/silent-sweep/distilled/named")
LISTS = os.path.join(HERE, "lists.json")
JOBS = int(os.environ.get("JOBS", "6"))
# The seed this landing branched from (master 501aa4e2 — D561's landing, 1,498,138 bytes).
# `--price` reads it to tell "you handed me the pre-landing compiler" from "a candidate
# broke a price cell": the price cells RUN on the base too, so behaviour alone cannot
# separate the two answers and only the seed's identity can.
BASE_MD5 = "7205c310aee25d6acc747dfbd333a86f"


def seed_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# type key -> (spelling, a literal of that type, how `print` takes a value of it)
TYS = {
    "i32": ("i32", "6", "%s"),
    "str": ("string", '"s"', "%s"),
    "bool": ("boolean", "true", "%s"),
    "f64": ("f64", "1.5", "%s"),
    "obj": ("V", "{ x: 6 }", "%s.x"),
}
ARGS = list(TYS)
# `hole` is D572's own shape: the destination IS the type parameter. The five concrete
# entries are the mirror — a concrete destination fed the hole.
DSTS = ["hole"] + list(TYS)
SEAMS = ["decl", "asg", "field", "elem"]
CALLS = ["plain", "ufcs"]

# WHAT THE LANGUAGE PRINTS for a value of type `arg` arriving at a destination of type
# `dst` — only the pairs it ACCEPTS have an entry; every other pair does not run on the
# direct spelling, so it has no value to expect. `--verify` re-derives every row here from
# each cell's DIRECT TWIN on the seed under test, so a stale row FAILS rather than passing.
COERCE = {
    ("i32", "i32"): "6",
    ("i32", "f64"): "6",
    ("str", "str"): "s",
    ("bool", "bool"): "true",
    ("bool", "i32"): "1",
    ("f64", "f64"): "1.5",
    ("obj", "obj"): "6",
}
# THE `dst=hole` BLOCK'S VALUE. Every such cell stores `n + 1` with `n = -1`, so the value
# that lands is the i32 `0`. An entry exists only where the DIRECT spelling ACCEPTS that
# store — `const r: i32 = n + 1` and `const r: f64 = n + 1` — and `boolean` is deliberately
# ABSENT even though the pin runs and prints `false` there: the direct twin is a loud
# `cannot assign i32 to 'r' of type boolean`, so `false` is not this cell's right answer,
# it is the defect. Blessing it here is instrument rule 5's exact trap, which this family
# has now sprung on two grids (#2016, #2018) and nearly on this one.
HOLEVAL = {"i32": "0", "f64": "0"}

# WHAT `want_of` SAYS WHEN THE LANGUAGE ACCEPTS NO VALUE HERE — the direct spelling is a
# loud reject, so the cell has no right answer to print and anything it prints contradicts
# its own declaration. A sentinel rather than a fabricated number: an artefact must not
# give a confident answer it did not compute, and `"0"` here would have read as one. It can
# never equal stdout, so a cell that runs anyway grades `runs but wrong value` in the census
# vocabulary, which is exactly what it is.
NOVALUE = "<no legitimate value — the direct spelling is a loud reject>"

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


def cell_src(seam, dst, arg, call, delivery):
    """One cell. `delivery == 'typar'` writes the generic; `delivery == 'direct'` writes the
    SAME program with the type parameter spelled out as the argument's own type."""
    aty, alit, _ = TYS[arg]
    L = ["type V = { x: i32 }"]
    # T as the direct spelling writes it.
    T = "T" if delivery == "typar" else aty
    if dst == "hole":
        # The DESTINATION is the type parameter; the SOURCE is a concrete i32.
        dty, src, dlit = T, "n + 1", alit
        pr = TYS[arg][2]
    else:
        # The destination is CONCRETE; the SOURCE is the hole-typed parameter.
        dty, src, dlit = TYS[dst][0], "self", TYS[dst][1]
        pr = TYS[dst][2]
    sig_self = "self: T" if delivery == "typar" else "self: %s" % aty
    gen = "<T>" if delivery == "typar" else ""

    if seam == "decl":
        L.append("function g%s(%s, n: i32): %s {" % (gen, sig_self, dty))
        L.append("  const r: %s = %s" % (dty, src))
        L.append("  return r")
        L.append("}")
        recv, extra = "p", "-1"
    elif seam == "asg":
        # The destination is an already-declared local; `r = <src>` is the write under test.
        # Its first value is a legitimate one, so only the second write can be at fault.
        init = "self" if dst == "hole" else dlit
        L.append("function g%s(%s, n: i32): %s {" % (gen, sig_self, dty))
        L.append("  let r: %s = %s" % (dty, init))
        L.append("  r = %s" % src)
        L.append("  return r")
        L.append("}")
        recv, extra = "p", "-1"
    elif seam == "field":
        if dst == "hole":
            # `Bx<T>`'s field IS the hole; the write puts a concrete i32 in it.
            L.insert(1, "type Bx%s = { v: %s }"
                     % ("<T>" if delivery == "typar" else "", dty))
            bxty = "Bx<T>" if delivery == "typar" else "Bx"
            L.append("function g%s(%s, b: %s, n: i32): %s {" % (gen, sig_self, bxty, dty))
            L.append("  b.v = n + 1")
            L.append("  return b.v")
            L.append("}")
            L.append("const bx: %s = { v: %s }"
                     % ("Bx<%s>" % aty if delivery == "typar" else "Bx", alit))
        else:
            # A CONCRETE-fielded box fed the hole-typed parameter.
            L.insert(1, "type Bx = { v: %s }" % dty)
            L.append("function g%s(%s, b: Bx, n: i32): %s {" % (gen, sig_self, dty))
            L.append("  b.v = self")
            L.append("  return b.v")
            L.append("}")
            L.append("const bx: Bx = { v: %s }" % dlit)
        recv, extra = "p", "bx, -1"
    else:  # elem
        if dst == "hole":
            sig_self = "self: T[]" if delivery == "typar" else "self: %s[]" % aty
            L.append("function g%s(%s, n: i32): %s {" % (gen, sig_self, dty))
            L.append("  self[0] = n + 1")
            L.append("  return self[0]")
            L.append("}")
            L.append("const xs: %s[] = [%s]" % (aty, alit))
            recv, extra = "xs", "-1"
        else:
            L.append("function g%s(%s, xs: %s[], n: i32): %s {" % (gen, sig_self, dty, dty))
            L.append("  xs[0] = self")
            L.append("  return xs[0]")
            L.append("}")
            L.append("const ys: %s[] = [%s]" % (dty, dlit))
            recv, extra = "p", "ys, -1"

    if seam != "elem" or dst != "hole":
        L.append("const p: %s = %s" % (aty, alit))
    if call == "ufcs":
        L.append("const z = %s.g(%s)" % (recv, extra))
    else:
        L.append("const z = g(%s, %s)" % (recv, extra))
    L.append("print(%s)" % (pr % "z"))
    return "\n".join(L) + "\n"


def cell_id(seam, dst, arg, call, delivery):
    return "d572_%s_%s_%s_%s_%s" % (seam, dst, arg, call, delivery)


# ── THE ONE-OFF CELLS ─────────────────────────────────────────────────────────────────
# THE A7 COERCION, which a pin asking plain `assignable` would refuse. It runs on BOTH
# spellings on every seed ever graded; a landing that moves it has invented a false reject
# in exactly the shape D551's first cut did.
def a7_src(delivery):
    sig = "<T>(self: T)" if delivery == "typar" else "(self: boolean)"
    return "\n".join([
        "function g%s: i32 {" % sig,
        "  const r: i32 = self",
        "  return r",
        "}",
        "print(g(true))",
    ]) + "\n"


# THE REWRITE D572'S ROW NAMES: D561's brand module with the return laundered through a
# hole-typed LOCAL. It RUNS on the base seed; its concrete twin is a loud lossy-conversion
# reject. Keeping or closing it is a decision the landing has to state.
def brandlet_src(delivery):
    ty = "A" if delivery == "typar" else "A1"
    sig = "<A>(self: Rows<A>, i: i32)" if delivery == "typar" else "(self: Rows<A1>, i: i32)"
    return "\n".join([
        "type A1 = new i32",
        "type Rows<A> = { base: i32, brand: A }",
        "function rowAt%s: %s {" % (sig, ty),
        "  const r: %s = self.base + i * 4" % ty,
        "  return r",
        "}",
        "const st: Rows<A1> = { base: 1024, brand: 0 }",
        "print(rowAt(st, 2) as i32)",
    ]) + "\n"


# D571's WITNESS, verbatim in shape: the RETURN seam's deliberate residue. This landing is a
# different seam and must not move it. Its direct twin is a loud reject on every seed, so it
# is a DELIBERATE disagreement rather than an agreeing cell.
def forge_src(delivery):
    sig = "<T>(a: T, n: i32)" if delivery == "typar" else "(a: TVAddr, n: i32)"
    ty = "T" if delivery == "typar" else "TVAddr"
    return "\n".join([
        "type TVAddr = new i32",
        "function bump%s: %s { return n + 1 }" % (sig, ty),
        "const addr: TVAddr = 0",
        "print(bump(addr, 2) as i32)",
    ]) + "\n"


# THE CONTROL: a hole-typed destination fed the hole itself. Correct at every instance, so
# it must RUN and agree with its twin on every seed. A landing that refuses it has widened
# past the question.
def okhole_src(delivery):
    sig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: string, n: i32)"
    ty = "T" if delivery == "typar" else "string"
    return "\n".join([
        "function g%s: %s {" % (sig, ty),
        "  const r: %s = self" % ty,
        "  return r",
        "}",
        'print(g("s", 2))',
    ]) + "\n"


# THE RE-DEFERRAL, at this seam. A generic body relaying into a SECOND generic
# (`outer<U>` calling `inner<T>`) substitutes the constraint's hole to ANOTHER hole, so the
# inner call cannot decide it and must re-record it under the caller. The gate that does
# that asked only whether the BODY side still held a hole, so a want-side constraint
# evaporated across one level of relay.
def letrelay_src(delivery):
    isig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: string, n: i32)"
    osig = "<U>(self: U, n: i32)" if delivery == "typar" else "(self: string, n: i32)"
    ity = "T" if delivery == "typar" else "string"
    oty = "U" if delivery == "typar" else "string"
    return "\n".join([
        "function inner%s: %s {" % (isig, ity),
        "  const r: %s = n + 1" % ity,
        "  return r",
        "}",
        "function outer%s: %s {" % (osig, oty),
        "  return inner(self, n)",
        "}",
        'print(outer("s", 2))',
    ]) + "\n"


# THE SAME GATE AT THE RETURN SEAM, which is D561's own table. It was want-side-blind
# there too, so `function inner<T>(self: T, n: i32): T { return n + 1 }` reached through
# `outer<U>` stayed check-clean invalid wasm on D561's landing — the widening evaporating
# across one relay. Not a cell of `d551/retgrid.py`: its `relay` axis puts the hole on the
# BODY side, so that grid is structurally blind to this one.
def retrelay_src(delivery):
    isig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: string, n: i32)"
    osig = "<U>(self: U, n: i32)" if delivery == "typar" else "(self: string, n: i32)"
    ity = "T" if delivery == "typar" else "string"
    oty = "U" if delivery == "typar" else "string"
    return "\n".join([
        "function inner%s: %s { return n + 1 }" % (isig, ity),
        "function outer%s: %s { return inner(self, n) }" % (osig, oty),
        'print(outer("s", 2))',
    ]) + "\n"


# THE NOMINAL-LITERAL BRAND WAIVER, through a hole-typed destination. `const addr: TVAddr
# = 0` is accepted at top level and must stay accepted here: a LITERAL adopting a newtype
# brand is the language's own rule, not the forge D571 is about. It runs on both spellings
# on every seed, so a landing that refuses it has widened past the question — this is the
# control that separates "an i32 VALUE wearing a brand" from "an i32 LITERAL declared as
# one".
def litbrand_src(delivery):
    sig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: A1, n: i32)"
    ty = "T" if delivery == "typar" else "A1"
    return "\n".join([
        "type A1 = new i32",
        "function mk%s: %s {" % (sig, ty),
        "  const r: %s = 0" % ty,
        "  return r",
        "}",
        "const p: A1 = 5",
        "print(mk(p, 1) as i32)",
    ]) + "\n"


# id stem -> (source builder, the value it prints when it runs). `cells()` and `want_of`
# read the SAME table, so a new one-off cannot reach one without the other.
ONEOFFS = {
    "a7": (a7_src, "1"),
    "brandlet": (brandlet_src, "1032"),
    "forge": (forge_src, "3"),
    "okhole": (okhole_src, "s"),
    "letrelay": (letrelay_src, NOVALUE),
    "retrelay": (retrelay_src, NOVALUE),
    "litbrand": (litbrand_src, "0"),
}


def cells():
    out = {}
    for seam in SEAMS:
        for dst in DSTS:
            for arg in ARGS:
                for call in CALLS:
                    for d in ("typar", "direct"):
                        out[cell_id(seam, dst, arg, call, d)] = \
                            cell_src(seam, dst, arg, call, d)
    for d in ("typar", "direct"):
        for nm, (mk, _v) in ONEOFFS.items():
            out["d572o_%s_%s" % (nm, d)] = mk(d)
    return out


def twin(cid):
    """The DIRECT twin — the same program with the type parameter written out as the
    argument's own type, and NOTHING else changed."""
    assert cid.endswith("_typar"), cid
    return cid[: -len("_typar")] + "_direct"


def want_of(cid):
    """The stdout a cell produces WHEN IT RUNS, read off its own axes rather than off a
    stored verdict. Never consulted for a cell that is not `runs`."""
    if cid.startswith("d572o_"):
        for nm, (_mk, v) in ONEOFFS.items():
            if cid.startswith("d572o_%s_" % nm):
                return v
        raise KeyError(cid)
    _, seam, dst, arg, call, _d = cid.split("_")
    if dst == "hole":
        return HOLEVAL.get(arg, NOVALUE)
    return COERCE.get((arg, dst), NOVALUE)


def grade_one(args):
    src, seed = args
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False, dir="/tmp") as f:
        f.write(src)
        p = f.name
    try:
        c = subprocess.run([VL, "check", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        cout = c.stdout + c.stderr
        errs = [ln for ln in cout.splitlines() if ln.startswith("[ERROR]")]
        if errs or c.returncode != 0:
            return ("check", (errs or [cout.strip()])[0].replace(p, "").strip())
        r = subprocess.run([VL, "run", p, "--compiler", seed],
                           capture_output=True, text=True, timeout=180)
        if r.returncode == 0:
            return ("runs", r.stdout.strip().replace("\n", "|"))
        e = (r.stderr + r.stdout).replace(p, "")
        if any(m in e for m in EMIT):
            return ("emit", " ".join(e.split())[:200])
        if any(m in e for m in INVALID):
            return ("invalid", " ".join(e.split())[:200])
        if any(m in e for m in TRAP):
            return ("trap", " ".join(e.split())[:200])
        return ("other", " ".join(e.split())[:200])
    except subprocess.TimeoutExpired:
        return ("other", "TIMEOUT")
    finally:
        os.unlink(p)


def grade_all(seed, cs=None):
    cs = cs if cs is not None else cells()
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        fut = {ex.submit(grade_one, (cs[n], seed)): n for n in cs}
        got = {fut[f]: f.result() for f in concurrent.futures.as_completed(fut)}
    return {n: {"class": got[n][0], "msg": got[n][1]} for n in cs}


def agreement(base):
    """agree / DISAGREE against the DIRECT twin, VALUE INCLUDED. A `runs` cell whose value
    differs from its twin's is a DISAGREE here, which is half the reason this grid exists."""
    out = {}
    for n, v in base.items():
        if n.endswith("_direct"):
            continue
        t = base[twin(n)]
        ok = v["class"] == t["class"]
        if ok and v["class"] == "runs":
            ok = v["msg"] == t["msg"]
        out[n] = "agree" if ok else "DISAGREE"
    return out


def wrongvalue(g):
    """Cells that RUN and print something their own declaration contradicts — the outcome a
    grid that never prints the result cannot have."""
    return sorted(n for n, v in g.items()
                  if v["class"] == "runs" and v["msg"] != want_of(n))


def load_lists():
    return json.load(open(LISTS)) if os.path.exists(LISTS) else {}


def named_set(L):
    return sorted(set(L.get("fix", []) + L.get("price", []) + L.get("control", [])
                      + L.get("residue", []) + L.get("refute", [])
                      + L.get("deliberate", [])))


def require(name, rows):
    """A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY (#2011). Every scored list goes
    through this: an absent or empty ledger is a FAILURE, not three green zeroes."""
    if not rows:
        print("%s: EMPTY POPULATION -- the ledger lists no cells, so nothing was "
              "verified. This is a FAILURE, not a pass." % name)
        return False
    return True


def main():
    seed = os.path.join(R, "build/vl-compiler.wasm")
    args = sys.argv[1:]
    takes_value = ("--delta", "--write-lists", "--emit", "--refused")
    for i, a in enumerate(args):
        if a.startswith("-") or not a.endswith(".wasm"):
            continue
        if i > 0 and args[i - 1] in takes_value:
            continue
        seed = a
        break
    cs = cells()

    if "--emit" in sys.argv:
        d = sys.argv[sys.argv.index("--emit") + 1]
        os.makedirs(d, exist_ok=True)
        for n, s in cs.items():
            open(os.path.join(d, n + ".vl"), "w").write(s)
        print("wrote %d cells to %s" % (len(cs), d))
        return 0

    if "--mkset" in sys.argv:
        # Materialise the named set into `distilled/named/`, cells AND twins, plus the
        # `expect` rows the census grader reads — a value-graded cell with no expectation
        # would be scored on any output at all, which is the blindness this grid removes.
        L = load_lists()
        want = named_set(L)
        if not require("named/", want):
            return 1
        man = os.path.join(NAMED, "manifest.json")
        M = json.load(open(man))
        n = 0
        for c in want:
            for m in (c, twin(c)):
                open(os.path.join(NAMED, m + ".vl"), "w").write(cs[m])
                M["expect"][m] = want_of(m)
                n += 1
        json.dump(M, open(man, "w"), indent=1, sort_keys=True)
        print("wrote %d cells (+twins) into %s and their expectations into manifest.json"
              % (n, NAMED))
        return 0

    base = grade_all(seed, cs)
    agr = agreement(base)
    L = load_lists()

    if "--write-lists" in sys.argv:
        cand = sys.argv[sys.argv.index("--write-lists") + 1]
        after = grade_all(cand, cs)
        aft_agr = agreement(after)
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if n.endswith("_typar")]
        control = sorted(n for n, g in agr.items()
                         if g == "agree" and base[n]["class"] == "runs"
                         and after[n]["class"] == "runs")
        SILENT = ("invalid", "trap", "emit")
        refused = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--refused"]
        # THIS GRID'S `price` IS THE REVERSE OF `d551/retgrid.py`'s, AND THE DIFFERENCE IS
        # NOT A NAMING ACCIDENT. There, a rung was REFUSED and the price is what refusing it
        # would have cost — cells that must still RUN. Here nothing was refused: the landing
        # OVERRIDES, so the price is what the landing itself took away — cells that RAN on
        # the base and are a loud reject now. What must be checked is therefore the opposite
        # sentence: each of these must still be a reject that AGREES with its direct twin. A
        # future change that quietly re-opens one is exactly what this list exists to catch,
        # and on the base seed every one of them runs, so the check is not vacuous either
        # way.
        price = sorted(n for n in cs
                       if n.endswith("_typar") and base[n]["class"] == "runs"
                       and after[n]["class"] != "runs")
        whopaid = {"the landing itself (overridden, not refused)": price}
        REFGRADE = {rs: grade_all(rs, cs) for rs in refused}
        for rs in refused:
            rg = REFGRADE[rs]
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                # A REFUSED candidate's own price, kept separately: a cell that ran and
                # rejects under THAT candidate while the landing keeps it running.
                worse = base[n]["class"] == "runs" and rg[n]["class"] != "runs"
                if worse and after[n]["class"] == "runs":
                    whopaid.setdefault(os.path.basename(rs), []).append(n)
        # REFUTE: cells a refused candidate made worse IN THE OTHER DIRECTION — a loud
        # reject on the base AND on the landing, agreeing with its twin on both, that the
        # candidate turned into a `runs`. `price` cannot see these: it counts a LOST `runs`
        # and a candidate that INVENTS one is invisible to it.
        refute = set()
        for rs in refused:
            rg = REFGRADE[rs]
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                if base[n]["class"] == "check" and after[n]["class"] == "check":
                    if agr[n] == "agree" and rg[n]["class"] == "runs":
                        refute.add(n)
                        whopaid.setdefault(os.path.basename(rs) + " (invented a runs)",
                                           []).append(n)
        # DELIBERATE: cells that RUN on the landing while their DIRECT twin is a loud
        # reject — every place this landing does NOT hold the parity rule, as a list rather
        # than as a paragraph. A new member appearing here is a leak nothing else reports.
        deliberate = sorted(n for n in cs
                            if n.endswith("_typar") and base[n]["class"] == "runs"
                            and after[n]["class"] == "runs"
                            and aft_agr.get(n) == "DISAGREE")
        # RESIDUE: pinned cells the LANDING still leaves silent beside a LOUD direct twin.
        residue = sorted(n for n in cs
                         if n.endswith("_typar") and after[n]["class"] in SILENT
                         and after[twin(n)]["class"] in ("check",))
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "refused": {k: sorted(v) for k, v in whopaid.items()},
               "fix": fix,
               "price": price,
               "refute": sorted(refute),
               "deliberate": deliberate,
               "residue": residue,
               "control": control}
        json.dump(out, open(LISTS, "w"), indent=1, sort_keys=True)
        print("wrote %d fix + %d price + %d refute + %d deliberate (from %d refused "
              "candidates) + %d residue + %d control to %s"
              % (len(fix), len(price), len(refute), len(deliberate), len(refused),
                 len(residue), len(control), LISTS))
        return 0

    if "--delta" in sys.argv:
        # ARGUMENT ORDER: the positional seed is the BASE, `--delta` takes the AFTER seed.
        # Reversed, a landing's fixes read as regressions — which has happened.
        other = sys.argv[sys.argv.index("--delta") + 1]
        after = grade_all(other, cs)
        SILENT = ("invalid", "trap", "emit")
        moved = [n for n in sorted(base)
                 if (base[n]["class"], base[n]["msg"]) !=
                    (after[n]["class"], after[n]["msg"])]
        lost = [n for n in moved if base[n]["class"] == "runs"
                and after[n]["class"] != "runs"]
        gained = [n for n in moved if base[n]["class"] != "runs"
                  and after[n]["class"] == "runs"]
        silent = [n for n in moved if base[n]["class"] not in SILENT
                  and after[n]["class"] in SILENT]
        wv_b, wv_a = set(wrongvalue(base)), set(wrongvalue(after))
        dis_b = sum(1 for g in agr.values() if g == "DISAGREE")
        dis_a = sum(1 for g in agreement(after).values() if g == "DISAGREE")
        print("%s (base) -> %s (after)"
              % (os.path.basename(seed), os.path.basename(other)))
        print("  moved         %4d of %d" % (len(moved), len(base)))
        print("  -> runs       %4d" % len(gained))
        print("  runs LOST     %4d" % len(lost))
        print("  -> silent     %4d" % len(silent))
        print("  -> WRONG VALUE%4d   (was %d, now %d)"
              % (len(wv_a - wv_b), len(wv_b), len(wv_a)))
        print("  wrong value FIXED %d" % len(wv_b - wv_a))
        print("  DISAGREE with the direct twin: %d -> %d" % (dis_b, dis_a))
        pairs = {}
        for n in moved:
            pairs[(base[n]["class"], after[n]["class"])] = \
                pairs.get((base[n]["class"], after[n]["class"]), 0) + 1
        for (x, y), c in sorted(pairs.items(), key=lambda t: -t[1]):
            print("    %-8s -> %-8s %4d" % (x, y, c))
        for lbl, rows in (("runs LOST", lost), ("-> silent", silent),
                          ("-> WRONG VALUE", sorted(wv_a - wv_b))):
            for n in rows[:20]:
                print("  %-14s %s   %s" % (lbl, n, after[n]["msg"][:60]))
        return 0

    if "--table" in sys.argv:
        for call in CALLS:
            print("== pin/direct by seam x dst x arg   (call=%s)" % call)
            print("%-16s %s" % ("seam/dst", " ".join("%-18s" % a for a in ARGS)))
            for seam in SEAMS:
                for dst in DSTS:
                    row = []
                    for arg in ARGS:
                        n = cell_id(seam, dst, arg, call, "typar")
                        row.append("%-18s" % ("%s/%s" % (base[n]["class"],
                                                         base[twin(n)]["class"])))
                    print("%-16s %s" % ("%s/%s" % (seam, dst), " ".join(row)))
            print()
        print("== the one-off cells")
        for nm in ONEOFFS:
            n = "d572o_%s_typar" % nm
            print("  %-12s %s/%s   pin printed %r"
                  % (nm, base[n]["class"], base[twin(n)]["class"], base[n]["msg"][:24]))
        nd = sum(1 for g in agr.values() if g == "DISAGREE")
        wv = wrongvalue(base)
        print("\n%d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
        print("%d of %d cells RUN and print a value their declaration contradicts"
              % (len(wv), len(base)))
        for n in wv[:20]:
            print("   WRONG VALUE %s  want %s got %s" % (n, want_of(n), base[n]["msg"]))
        return 0

    if "--verify" in sys.argv:
        # (1) THE DISTINGUISHING RULE, mechanised: every cell in `fix` must DISAGREE with
        #     its direct twin on the BASE seed, so its expected answer differs from the
        #     answer it would give if the rungs under test did nothing. `--verify`
        #     therefore TAKES THE BASE SEED.
        # (2) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY.
        # (3) Nothing here is a cached verdict: the one closed-form table in the file
        #     (`COERCE`/`HOLEVAL`, read by `want_of`) is re-derived from each cell's DIRECT
        #     TWIN below, so a stale row fails rather than passing quietly.
        rc = 0
        fix = L.get("fix", [])
        if not require("distinguishing", fix):
            rc = 1
        blind = [n for n in fix if agr.get(n) == "agree"]
        for n in blind[:20]:
            print("BLIND (pin already gives the direct twin's answer): %s" % n)
        print("distinguishing: %d of %d fix cells blind" % (len(blind), len(fix)))
        if blind:
            rc = 1
        ctl = L.get("control", [])
        if not require("control", ctl):
            rc = 1
        badctl = [n for n in ctl if agr.get(n) != "agree" or base[n]["class"] != "runs"]
        for n in badctl[:20]:
            print("BAD CONTROL (not an agreeing `runs` on the base seed): %s  %s/%s"
                  % (n, base[n]["class"], agr.get(n)))
        print("control: %d of %d controls are not agreeing `runs`" % (len(badctl), len(ctl)))
        if badctl:
            rc = 1
        # THE EXPECTATION TABLE, RE-DERIVED FROM THE LANGUAGE — over the cells where BOTH
        # spellings run, which is where the language itself endorses the value. Over all
        # `runs` cells it would instead be asserting the base seed is clean, and it is not:
        # that is the defect.
        endorsed = [n for n, v in base.items() if v["class"] == "runs"
                    and (n.endswith("_direct") or agr.get(n) == "agree")]
        if not require("expectations", endorsed):
            rc = 1
        badexp = [(n, want_of(n), base[n]["msg"]) for n in endorsed
                  if base[n]["msg"] != want_of(n)]
        for n, w, g in badexp[:20]:
            print("EXPECTATION WRONG: %s  want_of says %r, the compiler printed %r"
                  % (n, w, g))
        print("expectations: %d of %d twin-endorsed `runs` cells print something want_of "
              "does not predict" % (len(badexp), len(endorsed)))
        if badexp:
            rc = 1
        # AND THE SENTINEL'S OWN CONSISTENCY: a cell BOTH spellings run is one the language
        # accepts, so `NOVALUE` — "there is no right answer here" — must never be its
        # expectation. The two tables disagreeing about the same pair is how a value grid
        # starts blessing the defect, so it is a failure rather than a note.
        nov = [n for n in endorsed if want_of(n) == NOVALUE]
        for n in nov[:20]:
            print("SENTINEL ON AN ACCEPTED PAIR: %s runs on both spellings, so `NOVALUE` "
                  "is the wrong expectation for it" % n)
        print("sentinel: %d of %d twin-endorsed `runs` cells are marked as having no "
              "legitimate value" % (len(nov), len(endorsed)))
        if nov:
            rc = 1
        # THE REFUTATION CELLS. `refute` is populated only by running a REFUSED candidate —
        # a cell it turned from a loud reject into a `runs`, which `price` structurally
        # cannot see. This landing refused nothing (it overrides; see the row), so the list
        # is empty for a REASON rather than by omission, and saying "0 of 0 refutation cells
        # moved" would be a green zero over a population that does not exist. It is
        # therefore reported as not-applicable and BECOMES a required population the moment
        # `lists.json` records a refused seed.
        ref = L.get("refute", [])
        anyrefused = any(not k.startswith("the landing itself")
                         for k in L.get("refused", {}))
        if anyrefused:
            if not require("refute", ref):
                rc = 1
            badref = [n for n in ref
                      if base[n]["class"] != "check" or agr.get(n) != "agree"]
            for n in badref[:20]:
                print("REFUTATION CELL MOVED (must be an agreeing loud reject): %s  %s/%s"
                      % (n, base[n]["class"], agr.get(n)))
            print("refute: %d of %d refutation cells are not agreeing loud rejects"
                  % (len(badref), len(ref)))
            if badref:
                rc = 1
        else:
            print("refute: NOT APPLICABLE — `lists.json` records no refused candidate, so "
                  "there is no population to re-ask. This becomes a required check the "
                  "moment one is recorded.")
        # THE DELIBERATE DISAGREEMENTS, ENUMERATED. Each must still RUN and must still
        # DISAGREE with its twin: a member that starts AGREEING has had its exemption
        # withdrawn, a member that stops running is a `runs` lost. Neither is visible in
        # the headline DISAGREE count, which nets them off.
        dlb = L.get("deliberate", [])
        if not require("deliberate", dlb):
            rc = 1
        baddlb = [n for n in dlb if base[n]["class"] != "runs" or agr.get(n) != "DISAGREE"]
        for n in baddlb[:20]:
            print("DELIBERATE CELL MOVED (must be a DISAGREEING `runs`): %s  %s/%s"
                  % (n, base[n]["class"], agr.get(n)))
        print("deliberate: %d of %d exempted cells are not disagreeing `runs`"
              % (len(baddlb), len(dlb)))
        if baddlb:
            rc = 1
        want = named_set(L)
        if not require("named/", want):
            rc = 1
        man = json.load(open(os.path.join(NAMED, "manifest.json")))
        miss = bad = noexp = 0
        for n in want:
            for m in (n, twin(n)):
                ref = os.path.join(NAMED, m + ".vl")
                if not os.path.exists(ref):
                    miss += 1
                    print("MISSING FROM named/: %s" % m)
                elif open(ref).read() != cs[m]:
                    bad += 1
                    print("DIFFERS FROM named/: %s" % m)
                if man["expect"].get(m) != want_of(m):
                    noexp += 1
                    print("NO/WRONG EXPECTATION in named/manifest.json: %s (want %s, "
                          "manifest says %r)" % (m, want_of(m), man["expect"].get(m)))
        print("named/: %d cells + twins expected, %d missing, %d differ, %d without the "
              "right expectation" % (len(want), miss, bad, noexp))
        if miss or bad or noexp:
            rc = 1
        print("verify: %s" % ("OK" if rc == 0 else "FAILED"))
        return rc

    if "--price" in sys.argv:
        # THE LANDING'S OWN PRICE, EXECUTABLE. These 25 cells RAN on the base and are a loud
        # reject now, so the payment term is the reverse of `d551/retgrid.py`'s: each must
        # STILL be a reject, and it must AGREE with its one-token-different direct twin —
        # which is the whole justification for having taken it. A cell that starts running
        # again is a silent re-opening of something this landing closed deliberately.
        price = L.get("price", [])
        if not require("price", price):
            return 1
        missing = [n for n in price
                   if not os.path.exists(os.path.join(NAMED, n + ".vl"))]
        if missing:
            print("price: %d cells are MISSING from named/ (%s...) — the population this "
                  "check is about does not exist. FAILURE." % (len(missing), missing[0]))
            return 1
        # WRONG SEED IS A DISTINCT ANSWER FROM VETO, and it is decided by the seed's own
        # IDENTITY before anything is graded. On the base every one of these cells RUNS, so
        # "they all fail" IS this file's wrong-seed signature — and reporting that as a veto
        # would read as "the landing broke 25 cells" when it means "you handed me the
        # pre-landing compiler". An md5 says which compiler this was; behaviour cannot.
        if BASE_MD5 == seed_md5(seed):
            print("price cells: %d   seed %s (md5 %s)"
                  % (len(price), os.path.basename(seed), seed_md5(seed)))
            print("price: this IS the base seed (501aa4e2, md5 %s), where every one of "
                  "these cells RUNS — that is the defect, not the landing. Re-run against "
                  "build/vl-compiler.wasm from this branch." % BASE_MD5)
            return 2
        bad_a, bad_b = [], []
        for n in price:
            v = base[n]
            if v["class"] == "runs":
                bad_a.append((n, "RUNS AGAIN", v["msg"][:40]))
            elif agr.get(n) != "agree":
                bad_b.append((n, v["class"], base[twin(n)]["class"]))
        print("price cells: %d   seed %s (md5 %s)"
              % (len(price), os.path.basename(seed), seed_md5(seed)))
        print("  (a) still a REJECT                : %d fail" % len(bad_a))
        print("  (b) agrees with its DIRECT twin   : %d fail" % len(bad_b))
        for lbl, rows in (("RE-OPENED", bad_a), ("DISAGREES WITH ITS TWIN", bad_b)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        ok = not (bad_a or bad_b)
        print("price: %s" % ("held — every cell this landing took is still a loud reject "
                             "that says what its direct spelling says"
                             if ok else "VETO"))
        return 0 if ok else 1

    nd = sum(1 for g in agr.values() if g == "DISAGREE")
    wv = wrongvalue(base)
    counts = {}
    for v in base.values():
        counts[v["class"]] = counts.get(v["class"], 0) + 1
    print("seed %s (md5 %s)   %d cells"
          % (os.path.basename(seed), seed_md5(seed), len(base)))
    for k in sorted(counts):
        print("  %-8s %4d" % (k, counts[k]))
    print("  %d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
    print("  %d cells RUN and print a value their declaration contradicts" % len(wv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
