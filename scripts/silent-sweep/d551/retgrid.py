#!/usr/bin/env python3
"""D551 — a generic's DECLARED return type re-checked against its BODY's type at the pin,
graded BY THE VALUE against the one-token-different DIRECT spelling.

THE QUESTION. `function g<T>(a: T): V { return a }` cannot be decided in the body: `got` is
the type parameter's `TyVar` and `assignable(T, V)` is TRUE for the same permissive reason
every hole gate is vacuous, so the return check passes. At the call site `substTyDeep`
substitutes the DECLARED return and hands it out as the call's type — and nothing compares it
against the substituted BODY type. `g(p)` with `p: i32` was `vl check` rc 0 over a module the
engine refuses, while `function g(a: i32): V` is a positioned `return type mismatch`.

EVERY CELL SHIPS WITH ITS DIRECT TWIN and the twin differs in EXACTLY ONE thing: `<T>(self:
T)` becomes `(self: <the argument's own type>)`. Same declaration, same body, same constants,
same call, same `print`. So every expected answer here is the language's own answer to the
same question, spelled out — never a remembered one. `agreement()` compares class AND VALUE,
because a type-mismatch row whose module validates anyway prints something its declaration
contradicts, and a grid that never prints the result cannot see that (#2016's lesson: a
candidate sent four cells to a module printing `true` where the declaration said `99` and the
grid scored them `runs`).

THE AXES, and why each is separate:

    ret      the DECLARED return type — obj / i32 / str / bool / f64. Not decoration: the
             pin's answer is `assignableExpr` on the substituted pair, so `boolean` -> `i32`
             must be ACCEPTED (the A7 coercion) where `i32` -> `boolean` is refused, and the
             two are one axis step apart.
    body     what the body returns, each carrying a hole: `self` (the parameter), `self[0]`
             (a DERIVED `?elem` hole), or `inner(self)` (a relay through a SECOND generic —
             the only cells the RE-DEFERRAL rung can move).
    arg      the call's argument type, which is what the pin binds the hole to.
    call     `g(p)` vs `p.g()`. Two DIFFERENT pins in `typecheck.vl`, and wiring only the
             first would leave the method spelling silent beside a loud direct one.
    use      `val` prints the result, `drop` binds and drops it (`print(1)`). `val` is what
             makes a wrong VALUE visible; `drop` is the silent form D551's row could file.

THE `wanthole` BLOCK WAS A REFUSED RUNG'S PRICE AND IS NOW THE LANDING'S OWN (D561).
Recording the constraint when only the DECLARED side carries a hole (`function g<T>(self: T,
n: i32): T { return n + 1 }`) closes those cells — and the FULL widening also refuses
`tests/cases/memory/flat-generic-rows-branded.vl`, a module that RUNS correctly, because
`as A` over a type parameter is not a spelling the language has. What ships is the widening
MINUS one exemption: a want-side-only constraint whose destination is a newtype BRAND the
body's type already fits UNBRANDED is deferred, because that is the one mismatch with no
writable repair. Five blocks below exist to hold that line, and each was built because a
candidate moved it:

    wv       THE WANT BLOCK GRADED BY VALUE. The original block prints `1` at every cell,
             so a cell that RUNS while its direct twin rejects looked like a healthy
             `runs` — and `d551w_bool_typar` is exactly that: `g(true, -1)` returns the
             i32 `0` into a `boolean` slot and prints `false`. A grid that drops the value
             cannot see it, and the standing gate scored its loss as a REGRESSION.
    xbrand   TWO BRANDS OVER ONE BASE. `function g<A>(a: A, b: Meters): A { return b }` at
             `g(feet, meters)` RAN, printing `10` — a Meters handed back as a Feet, which
             is the confusion `new` exists to catch. The exemption must not reach it, and
             it does not: `Meters` is not assignable to `i32`, so the base test fails.
    bhole    THE MIRROR THE EXEMPTION MUST NOT TOUCH. `function g<T>(self: T): A1 { return
             self }` is a hole on the BODY side under a CONCRETE newtype, where `return
             self as A1` IS writable and D551 already rejects it. A first cut asked the
             newtype question of EVERY return constraint and took this cell from a loud
             reject to `runs` printing `6`. The `wOnly` column is what separates them.
    phantom  THE DISTINGUISHER THAT WAS PROPOSED AND DOES NOT EXIST. "Refuse when the hole
             appears in a PARAMETER position; admit the phantom brand" reads well and is
             two things at once wrong: `rowAt<R, A>(self: Rows<R, A>)` names `A` in a
             parameter position (its own header says so — the brand is a FIELD, and that
             is the whole difference), and a hole that really IS unbound already defers,
             at `validateRetCstrs` rather than at the gate. This cell is the second half
             stated executably: it RUNS on every seed here, including the full widening.
    forge    THE RESIDUE THE EXEMPTION BUYS, filed as D571. `function g<T>(a: T, n: i32): T
             { return n + 1 }` at a `TVAddr` argument hands back an unbranded i32 wearing
             the brand. Rep-correct, value-correct, nominally forged — and the price of
             keeping the corpus module. It RUNS on the base seed and on the landing.

    python3 scripts/silent-sweep/d551/retgrid.py [seed.wasm]     grade to stdout
    python3 scripts/silent-sweep/d551/retgrid.py --table         by ret x body x arg
    python3 scripts/silent-sweep/d551/retgrid.py --emit <dir>    write the cells
    python3 scripts/silent-sweep/d551/retgrid.py B.wasm --delta C.wasm
    python3 scripts/silent-sweep/d551/retgrid.py --write-lists C.wasm B.wasm [--refused S]
    python3 scripts/silent-sweep/d551/retgrid.py --verify B.wasm  (B = the BASE seed)
    python3 scripts/silent-sweep/d551/retgrid.py --price S        the refused rung
    python3 scripts/silent-sweep/d551/retgrid.py --mkset
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
# The seed the CURRENT landing branched from (master 3d8734bb, 1,497,679 bytes — D551's own
# landing, which is D561's base). `--price` reads it to tell "you handed me the pre-landing
# compiler" from "a candidate broke a price cell". D551's base was 8a3b5c5b / md5
# 027e4b71f283bcdb6dc3a2049ca538f9; the price cells run on both, so only the id separates them.
BASE_MD5 = "8496f0496ceae29aa2e7c8eee14c24d8"


def seed_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


# ret -> (the declared return spelling, what `print` takes under `use=val`)
RETS = {
    "obj": ("V", "z.x"),
    "i32": ("i32", "z"),
    "str": ("string", "z"),
    "bool": ("boolean", "z"),
    "f64": ("f64", "z"),
}
# arg -> (the type spelling, the value literal)
ARGS = {
    "i32": ("i32", "6"),
    "str": ("string", '"s"'),
    "bool": ("boolean", "true"),
    "f64": ("f64", "1.5"),
    "obj": ("V", "{ x: 6 }"),
}
BODIES = ["param", "elem", "relay"]
CALLS = ["plain", "ufcs"]
USES = ["val", "drop"]

# WHAT A CELL PRINTS WHEN IT RUNS, keyed on (arg, ret) — the language's own rendering of the
# argument's value at the declared return type. Only the pairs the language ACCEPTS have an
# entry; every other pair does not run, so it has no value to expect. This table is the one
# closed-form claim in the file and `--verify` re-derives every entry from the cell's DIRECT
# TWIN on the seed under test, so a wrong or stale row is a FAILURE rather than a silent pass.
COERCE = {
    ("i32", "i32"): "6",
    ("i32", "f64"): "6",
    ("str", "str"): "s",
    ("bool", "bool"): "true",
    ("bool", "i32"): "1",
    ("f64", "f64"): "1.5",
    ("obj", "obj"): "6",
}

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


def _preamble():
    return ["type V = { x: i32 }"]


def cell_src(ret, body, arg, call, use, delivery):
    rty, rprint = RETS[ret]
    aty, alit = ARGS[arg]
    # THE ONE TOKEN. `typar` writes `<T>(self: T)`; `direct` writes `(self: <arg type>)`.
    # Nothing else in the file differs between the two.
    L = _preamble()
    if body == "elem":
        gsig = "<T>(self: T[])" if delivery == "typar" else "(self: %s[])" % aty
        gbody = "return self[0]"
        recv = "xs"
        L.append("const xs: %s[] = [%s]" % (aty, alit))
    else:
        gsig = "<T>(self: T)" if delivery == "typar" else "(self: %s)" % aty
        gbody = "return self"
        recv = "p"
        L.append("const p: %s = %s" % (aty, alit))
    if body == "relay":
        isig = "<T>(self: T)" if delivery == "typar" else "(self: %s)" % aty
        osig = "<U>(self: U)" if delivery == "typar" else "(self: %s)" % aty
        L.append("function inner%s: %s { return self }" % (isig, rty))
        L.append("function g%s: %s { return inner(self) }" % (osig, rty))
    else:
        L.append("function g%s: %s { %s }" % (gsig, rty, gbody))
    L.append("const z = %s" % ("%s.g()" % recv if call == "ufcs" else "g(%s)" % recv))
    L.append("print(%s)" % (rprint if use == "val" else "1"))
    return "\n".join(L) + "\n"


def cell_id(ret, body, arg, call, use, delivery):
    return "d551_%s_%s_%s_%s_%s_%s" % (ret, body, arg, call, use, delivery)


# ── THE REFUSED RUNG'S BLOCK ───────────────────────────────────────────────────────────
# Only the DECLARED return carries a hole; the body's type is concrete. `function g<T>(self:
# T, n: i32): T { return n + 1 }` at `g("s", 2)` is the same check-clean invalid wasm beside
# the same loud direct twin — and closing it costs a corpus module that runs correctly and
# that the language gives no way to rewrite (`as T` is not a conversion `as` supports). The
# block exists so the price is re-measurable rather than remembered.
def want_src(arg, delivery):
    aty, alit = ARGS[arg]
    sig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: %s, n: i32)" % aty
    return "\n".join(_preamble() + [
        "function g%s: %s { return n + 1 }" % (sig, "T" if delivery == "typar" else aty),
        "const p: %s = %s" % (aty, alit),
        "const z = g(p, 2)",
        "print(1)",
    ]) + "\n"


def want_id(arg, delivery):
    return "d551w_%s_%s" % (arg, delivery)


# THE SAME BLOCK, PRINTED. `n = -1` rather than `2` so the returned i32 is `0`: at `T =
# boolean` that renders `false` while the argument is `true`, which is the fact a `print(1)`
# cell cannot carry. Every cell here returns `n + 1`, so the value a cell prints when it
# legitimately runs is that ONE i32 rendered at the declared return type — `WVAL` is that
# sentence and nothing else.
WVAL = {"i32": "0", "f64": "0", "bool": "false"}


def wval_src(arg, delivery):
    aty, alit = ARGS[arg]
    sig = "<T>(self: T, n: i32)" if delivery == "typar" else "(self: %s, n: i32)" % aty
    # `print` of an object is not a thing, so the OBJECT row reads a FIELD off the result.
    # Printing the whole `z` there made the cell `print of V is not supported` on both
    # spellings — an AGREEING cell that measures the printer rather than the pin.
    return "\n".join(_preamble() + [
        "function g%s: %s { return n + 1 }" % (sig, "T" if delivery == "typar" else aty),
        "const p: %s = %s" % (aty, alit),
        "const z = g(p, -1)",
        "print(%s)" % ("z.x" if arg == "obj" else "z"),
    ]) + "\n"


def wval_id(arg, delivery):
    return "d551wv_%s_%s" % (arg, delivery)


# TWO BRANDS OVER ONE BASE, and the pin must not confuse them. The direct twin is a loud
# `return type mismatch: expected Feet, got Meters`; the pin RAN, printing `10`.
def xbrand_src(delivery):
    sig = "<A>(a: A, b: Meters)" if delivery == "typar" else "(a: Feet, b: Meters)"
    ty = "A" if delivery == "typar" else "Feet"
    return "\n".join([
        "type Meters = new i32",
        "type Feet = new i32",
        "function g%s: %s { return b }" % (sig, ty),
        "const f: Feet = 3",
        "const m: Meters = 10",
        "print(g(f, m) as i32)",
    ]) + "\n"


# A HOLE ON THE BODY SIDE UNDER A CONCRETE NEWTYPE — D551's own shape, with a newtype in the
# declared position. `return self as A1` is writable here, so the pin holds the author to it
# and this cell must stay a loud reject. It is the control that refuted the exemption's
# first cut.
def bhole_src(delivery):
    sig = "<T>(self: T)" if delivery == "typar" else "(self: i32)"
    return "\n".join([
        "type A1 = new i32",
        "function g%s: A1 { return self }" % sig,
        "const p: i32 = 6",
        "print(g(p) as i32)",
    ]) + "\n"


# A TYPE PARAMETER THAT REALLY IS PHANTOM — named in the signature, absent from the alias
# BODY, so no call can bind it. `validateRetCstrs` defers on a substituted side that still
# carries a hole, so this RUNS under every candidate in this file, the full widening
# included. Its `direct` twin is a DELIBERATE disagreement: writing the parameter out is
# exactly what stops it being phantom, so the twin is a different question.
def phantom_src(delivery):
    sig = "<A>(self: Rows<A>, i: i32)" if delivery == "typar" else "(self: Rows<A1>, i: i32)"
    ty = "A" if delivery == "typar" else "A1"
    return "\n".join([
        "type A1 = new i32",
        "type Rows<A> = { base: i32 }",
        "function rowAt%s: %s {" % (sig, ty),
        "  return self.base + i * 4",
        "}",
        "const st: Rows<A1> = { base: 1024 }",
        "print(rowAt(st, 2) as i32)",
    ]) + "\n"


# THE RESIDUE, filed as D571: a brand forged from its own unbranded base through a type
# parameter. The exemption admits it deliberately, so it RUNS on the base seed and on the
# landing while its direct twin is a loud reject on both. The third deliberate disagreement.
def forge_src(delivery):
    sig = "<T>(a: T, n: i32)" if delivery == "typar" else "(a: TVAddr, n: i32)"
    ty = "T" if delivery == "typar" else "TVAddr"
    return "\n".join([
        "type TVAddr = new i32",
        "function g%s: %s { return n + 1 }" % (sig, ty),
        "const p: TVAddr = 0",
        "print(g(p, 2) as i32)",
    ]) + "\n"


# id -> (source builder, the value it prints when it runs). One row per one-off cell, so
# `cells()` and `want_of` read the SAME table and a new cell cannot reach one without the
# other.
ONEOFFS = {
    "xbrand": (xbrand_src, "10"),
    "bhole": (bhole_src, "6"),
    "phantom": (phantom_src, "1032"),
    "forge": (forge_src, "3"),
}


# The BRAND cell, which is the corpus module's shape reduced to eight lines: a `new i32`
# newtype reached through a type parameter the caller pins. It RUNS on the landing and its
# direct twin is LOUD — the one pair in this file where agreement with the twin is NOT the
# criterion, and the reason the want-side rung is refused rather than shipped.
def brand_src(delivery):
    ty = "A" if delivery == "typar" else "A1"
    sig = "<A>(self: Rows<A>, i: i32)" if delivery == "typar" else "(self: Rows<A1>, i: i32)"
    return "\n".join([
        "type A1 = new i32",
        "type Rows<A> = { base: i32, brand: A }",
        "function rowAt%s: %s {" % (sig, ty),
        "  return self.base + i * 4",
        "}",
        "const st: Rows<A1> = { base: 1024, brand: 0 }",
        "print(rowAt(st, 2) as i32)",
    ]) + "\n"


def brand_id(delivery):
    return "d551w_brand_%s" % delivery


def cells():
    out = {}
    for ret in RETS:
        for body in BODIES:
            for arg in ARGS:
                for call in CALLS:
                    for use in USES:
                        for d in ("typar", "direct"):
                            out[cell_id(ret, body, arg, call, use, d)] = \
                                cell_src(ret, body, arg, call, use, d)
    for arg in ARGS:
        for d in ("typar", "direct"):
            out[want_id(arg, d)] = want_src(arg, d)
            out[wval_id(arg, d)] = wval_src(arg, d)
    for d in ("typar", "direct"):
        out[brand_id(d)] = brand_src(d)
        for nm, (mk, _v) in ONEOFFS.items():
            out["d551w_%s_%s" % (nm, d)] = mk(d)
    return out


def twin(cid):
    """The DIRECT twin — the same file with `<T>(self: T)` written `(self: <arg type>)`, and
    NOTHING else changed."""
    assert cid.endswith("_typar"), cid
    return cid[: -len("_typar")] + "_direct"


def want_of(cid):
    """The stdout a cell produces WHEN IT RUNS, read off its own axes rather than off a
    stored verdict. `drop` cells and the whole `wanthole` block print `1`; the brand cell
    prints its computed address; a `val` cell prints the language's rendering of its argument
    at its declared return type (`COERCE`), and `--verify` re-derives every one of those from
    the DIRECT TWIN on the seed under test. Never consulted for a cell that is not `runs`."""
    if cid.startswith("d551w_brand_"):
        return "1032"
    for nm, (_mk, v) in ONEOFFS.items():
        if cid.startswith("d551w_%s_" % nm):
            return v
    if cid.startswith("d551wv_"):
        return WVAL.get(cid.split("_")[1], "0")
    if cid.startswith("d551w_"):
        return "1"
    parts = cid.split("_")
    ret, arg, use = parts[1], parts[3], parts[5]
    if use == "drop":
        return "1"
    return COERCE.get((arg, ret), "1")


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
    # RESIDUE IS CARRIED TOO: the cells this landing leaves silent beside a loud direct twin
    # are D561's witnesses, and a future change that closes or worsens them should be visible
    # in the standing gate rather than only in this grid.
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
        # `--write-lists <landing>` derives `fix` and `control` from the landing, and each
        # `--refused <seed>` contributes to `price`: the cells that candidate sends to a
        # SILENT outcome (invalid/trap/emit, or `runs` with a value its declaration
        # contradicts) and the landing does not. A price is a fact about a REFUSED
        # candidate, so it can only ever be written by running one.
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
        price, whopaid = set(), {}
        REFGRADE = {rs: grade_all(rs, cs) for rs in refused}
        for rs in refused:
            rg = REFGRADE[rs]
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                # THE REFUSED RUNG'S PRICE IS A LOST `runs`, not a lost silence: it takes
                # cells that RUN — correctly, agreeing with nothing but the language's own
                # answer — to a reject. That is the shape the veto bar names first.
                worse = base[n]["class"] == "runs" and rg[n]["class"] != "runs"
                okhere = after[n]["class"] == "runs"
                if worse and okhere:
                    price.add(n)
                    whopaid.setdefault(os.path.basename(rs), []).append(n)
        # REFUTE: cells a refused candidate made WORSE IN THE OTHER DIRECTION — a loud reject
        # on the base AND on the landing, agreeing with its direct twin on both, that the
        # candidate turned into a `runs`. `price` cannot see these: it only counts a LOST
        # `runs`, and a candidate that INVENTS one is invisible to it. The exemption's first
        # cut is exactly that shape — asked of every return constraint rather than only of a
        # want-side-only one, it took `d551w_bhole_typar` from a positioned reject to `runs`
        # printing `6`, which is a D551 cell re-opening.
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
        # DELIBERATE: cells that RUN on the landing while their DIRECT twin is a loud reject
        # — the exemption's whole surface, stated as a list rather than as a paragraph. Every
        # other `_typar` cell in this file is graded by agreement with its twin; these three
        # are the ones where agreement is NOT the criterion, and a fourth appearing here is a
        # leak that nothing else in the file would report.
        deliberate = sorted(n for n in cs
                            if n.endswith("_typar") and base[n]["class"] == "runs"
                            and after[n]["class"] == "runs"
                            and aft_agr.get(n) == "DISAGREE")
        # RESIDUE: pinned cells the LANDING still leaves silent beside a LOUD direct twin.
        # Derived, not listed by hand, so a landing cannot quietly stop naming one.
        residue = sorted(n for n in cs
                         if n.endswith("_typar") and after[n]["class"] in SILENT
                         and after[twin(n)]["class"] in ("check",))
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "refused": {k: sorted(v) for k, v in whopaid.items()},
               "fix": fix,
               "price": sorted(price),
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
        print("%s -> %s" % (os.path.basename(seed), os.path.basename(other)))
        print("  moved         %4d of %d" % (len(moved), len(base)))
        print("  -> runs       %4d" % len(gained))
        print("  runs LOST     %4d" % len(lost))
        print("  -> silent     %4d" % len(silent))
        print("  -> WRONG VALUE%4d   (was %d, now %d)"
              % (len(wv_a - wv_b), len(wv_b), len(wv_a)))
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
        print("== pin/direct by declared return x body x argument  (call=plain, use=drop)")
        cols = list(ARGS)
        print("%-16s %s" % ("ret/body", " ".join("%-16s" % a for a in cols)))
        for ret in RETS:
            for body in BODIES:
                row = []
                for arg in cols:
                    n = cell_id(ret, body, arg, "plain", "drop", "typar")
                    row.append("%-16s" % ("%s/%s" % (base[n]["class"],
                                                     base[twin(n)]["class"])))
                print("%-16s %s" % ("%s/%s" % (ret, body), " ".join(row)))
        print()
        print("== the same, call=ufcs")
        for ret in RETS:
            for body in BODIES:
                row = []
                for arg in cols:
                    n = cell_id(ret, body, arg, "ufcs", "drop", "typar")
                    row.append("%-16s" % ("%s/%s" % (base[n]["class"],
                                                     base[twin(n)]["class"])))
                print("%-16s %s" % ("%s/%s" % (ret, body), " ".join(row)))
        print()
        print("== the REFUSED want-side block (only the DECLARED return holds the hole)")
        for arg in ARGS:
            n = want_id(arg, "typar")
            print("  %-22s %s/%s" % (arg, base[n]["class"], base[twin(n)]["class"]))
        n = brand_id("typar")
        print("  %-22s %s/%s" % ("brand", base[n]["class"], base[twin(n)]["class"]))
        print()
        print("== the same block PRINTED (`n = -1`, so the returned i32 is 0)")
        for arg in ARGS:
            n = wval_id(arg, "typar")
            print("  %-22s %s/%s   pin printed %r, twin %r"
                  % (arg, base[n]["class"], base[twin(n)]["class"],
                     base[n]["msg"][:24], base[twin(n)]["msg"][:24]))
        print()
        print("== the one-off cells the exemption is drawn around")
        for nm in ONEOFFS:
            n = "d551w_%s_typar" % nm
            print("  %-22s %s/%s   pin printed %r"
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
        #     answer it would give if the rungs under test did nothing. `--verify` therefore
        #     TAKES THE BASE SEED.
        # (2) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY.
        # (3) Nothing here is a cached verdict: every class and every value is graded from
        #     the seed on this run, and the ONE closed-form table in the file (`COERCE`, read
        #     by `want_of`) is re-derived from each cell's DIRECT TWIN below, so a stale row
        #     fails rather than passing quietly.
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
        # THE CONTROL LIST IS THE OTHER HALF OF THE SAME RULE: a cell that must NOT move has
        # to be a cell that COULD have. Every control must already agree with its twin on the
        # base seed and be a `runs`, so a rung that broke it would be visible.
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
        # THE EXPECTATION TABLE, RE-DERIVED FROM THE LANGUAGE. `COERCE`/`want_of` are the
        # only remembered numbers in this file, so they are checked against what the compiler
        # actually prints — over the cells where BOTH spellings run, which is where the
        # language itself endorses the value. (Over all `runs` cells it would instead be
        # asserting the base seed is clean, and it is not: six cells run there printing what
        # their declaration contradicts, which is the defect.)
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
        # THE REFUTATION CELLS, RE-ASKED. Each must be a LOUD reject on the seed under test
        # and must AGREE with its direct twin there — that is the whole content of "the
        # exemption does not reach a body-side hole". An empty list is a failure like every
        # other population here.
        ref = L.get("refute", [])
        if not require("refute", ref):
            rc = 1
        badref = [n for n in ref if base[n]["class"] != "check" or agr.get(n) != "agree"]
        for n in badref[:20]:
            print("REFUTATION CELL MOVED (must be an agreeing loud reject): %s  %s/%s"
                  % (n, base[n]["class"], agr.get(n)))
        print("refute: %d of %d refutation cells are not agreeing loud rejects"
              % (len(badref), len(ref)))
        if badref:
            rc = 1
        # THE DELIBERATE DISAGREEMENTS, ENUMERATED. Each must still RUN and must still
        # DISAGREE with its twin: a member that starts AGREEING has had its exemption
        # withdrawn (D561 closing further), and a member that stops running is the corpus
        # module's shape breaking. Both are movements a reader must be told about, and
        # neither is visible in the headline DISAGREE count, which nets them off.
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
        # THE REFUSED RUNG'S PRICE, EXECUTABLE. `lists.json:refused` records which cells the
        # want-side candidate cost, and the payment term here is not the operator grid's:
        #
        #   THE PRICE CELLS RUN. Recording the constraint when only the DECLARED return
        #   carries a hole takes `d551w_*` and the BRAND cell from `runs` to a reject, and
        #   `flat-generic-rows-branded.vl` — a real corpus module printing ten correct
        #   values — with them. So the term is simply: does the cell still RUN, and print
        #   what its own axes say it prints?
        #
        # AGREEMENT WITH THE DIRECT TWIN IS DELIBERATELY NOT THE TERM HERE, and this is the
        # one block in the file where it cannot be. The brand cell's direct twin is a LOUD
        # `return type mismatch: expected A1, got i32` — the pin would be RIGHT by the parity
        # rule — and the cell is kept anyway because the language has no `as T` for the
        # author to write instead. Scoring it by twin agreement would score the refusal as
        # the failure it is not.
        price = L.get("price", [])
        if not require("price", price):
            return 1
        missing = [n for n in price
                   if not os.path.exists(os.path.join(NAMED, n + ".vl"))]
        if missing:
            print("price: %d cells are MISSING from named/ (%s...) — the population this "
                  "check is about does not exist. FAILURE." % (len(missing), missing[0]))
            return 1
        bad_a, bad_b = [], []
        for n in price:
            v = base[n]
            if v["class"] != "runs":
                bad_a.append((n, v["class"], v["msg"][:60]))
            elif v["msg"] != want_of(n):
                bad_b.append((n, want_of(n), v["msg"][:40]))
        print("price cells: %d   seed %s (md5 %s)"
              % (len(price), os.path.basename(seed), seed_md5(seed)))
        print("  (a) still RUNS                    : %d fail" % len(bad_a))
        print("  (b) prints what its axes say      : %d fail" % len(bad_b))
        for lbl, rows in (("NOT RUNNING", bad_a), ("WRONG VALUE", bad_b)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        # WRONG SEED IS A DISTINCT ANSWER FROM VETO, and it is decided by the seed's own
        # IDENTITY rather than by the shape of the failures. Unlike the operator grid, this
        # block's cells RUN on the base seed too — the refused rung is what breaks them — so
        # "they all fail" is not available as a wrong-seed signature in either direction. An
        # md5 says which compiler this was; nothing about behaviour can.
        if BASE_MD5 == seed_md5(seed):
            print("price: this IS the base seed (3d8734bb, md5 %s). These cells run there "
                  "too, so a pass here says only that the base is intact — re-run against "
                  "build/vl-compiler.wasm from this branch to grade the landing." % BASE_MD5)
            return 2
        ok = not (bad_a or bad_b)
        print("price: %s" % ("paid — every cell the refused want-side rung would have taken "
                             "to a reject still runs and prints its own answer"
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
