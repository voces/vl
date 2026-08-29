#!/usr/bin/env python3
"""D531 / D532 — an operator OVERLOAD at a monomorphization pin, graded BY THE VALUE.

`d511/pingrid2.py` next door settles which overloads the pin ACCEPTS and whether the
instance lowers. This grid exists as a separate population because that one is
STRUCTURALLY BLIND to D532's second half, and blind by a rule it adopted on purpose:

    THE OPERATOR'S RESULT IS NEVER PRINTED. `print` of an `i32[]` / a map / an object /
    a function is type-unsupported, so a grid that prints `a op b` over every operand
    type measures `print`'s vocabulary instead of the operator's. Every pingrid2 cell's
    stdout is the single character `1`.

That is the right call for its axes and it costs exactly one outcome: a cell whose module
VALIDATES and whose value is WRONG grades `runs` there. Measured, not supposed — the
candidate that hoists D531's dispatch gate WITHOUT D532's return-type fix sends the four
ordering overloads (`< <= > >=`) with an un-annotated return from a loud check reject to a
module that prints `true` where its own declaration says `99`. pingrid2 grades all twelve
of those cells `runs` and reports the candidate as a clean win.

So the axis this grid adds is USE, and its `val` half is the whole point:

    val    the result is PRINTED — `print(z)`, or `print(z.x)` where the overload
           returns the object, which is the same value one field in
    drop    the result is bound and unused (`const z = g(p, q)`; `print(1)`) — the
            SILENT form, and the only one D532's row could file

and the axis that separates the two rows' mechanisms is RET, the overload's own return
type:

    reti32  `function "op"(self: V, other: V): i32` — the return type DIFFERS from the
            operand type, so an un-annotated generic return that is typed as the OPERAND
            is a type the instance does not return
    retobj  `function "op"(self: V, other: V): V` — it AGREES, so the same program with
            the same dispatch is well-typed either way. This is the control: a rung that
            merely made the pin dispatch would move it too, and D532's does not.

EVERY PINNED CELL SHIPS WITH ITS DIRECT TWIN and the twin differs in EXACTLY ONE thing:
`<T>(a: T, b: T)` becomes `(a: V, b: V)`. Same declaration, same body, same constants,
same call, same `print`. So every expected answer here is the language's own answer to
the same question, spelled out — never a remembered one.

    python3 scripts/silent-sweep/d532/opretgrid.py [seed.wasm]     grade to stdout
    python3 scripts/silent-sweep/d532/opretgrid.py --table         by op x ret x ann
    python3 scripts/silent-sweep/d532/opretgrid.py --emit <dir>    write the cells
    python3 scripts/silent-sweep/d532/opretgrid.py B.wasm --delta C.wasm
    python3 scripts/silent-sweep/d532/opretgrid.py --write-lists C.wasm B.wasm
    python3 scripts/silent-sweep/d532/opretgrid.py --verify B.wasm  (B = the BASE seed)
    python3 scripts/silent-sweep/d532/opretgrid.py --price S        the refused candidate
    python3 scripts/silent-sweep/d532/opretgrid.py --mkset
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
# The seed this landing branched from (master 333d6851, 1,494,986 bytes). `--price` reads it
# to tell "you handed me the pre-landing compiler" from "a candidate broke a price cell".
BASE_MD5 = "ba9322a197c1c3f9d3bdb1cec5cab538"


def seed_md5(p):
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

# The ten names `ast.vl:isBinOpFuncName` admits — exactly the operators a user OVERLOAD can
# be declared under, so the only ones for which "an overload at a pinned hole" is a program
# anyone can write.
DECLARABLE = ["+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="]
OPN = {"+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem", "^": "xor",
       "<": "lt", "<=": "le", ">": "gt", ">=": "ge"}
NPO = {v: k for k, v in OPN.items()}

# ret -> (declared return type, the overload's body, what `print` takes, the expected value)
# `retobj` returns `self`, so `z.x` is the LEFT operand's field: 6, and never 99. That the
# two RET rows have different expected values is what stops one being mistaken for the other.
RETS = {
    "reti32": ("i32", "99", "z", "99"),
    "retobj": ("V", "self", "z.x", "6"),
}
ANNS = ["ann", "noann"]
USES = ["val", "drop"]

INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


def cell_src(op, ret, ann, use, delivery):
    rty, rbody, rprint, _want = RETS[ret]
    sig = "(a: V, b: V)" if delivery == "direct" else "<T>(a: T, b: T)"
    head = ": %s {" % rty if ann == "ann" else " {"
    return "\n".join([
        "type V = { x: i32 }",
        'function "%s"(self: V, other: V): %s { return %s }' % (op, rty, rbody),
        "function g%s%s" % (sig, head),
        "  return a %s b" % op,
        "}",
        "const p: V = { x: 6 }",
        "const q: V = { x: 3 }",
        "const z = g(p, q)",
        "print(%s)" % (rprint if use == "val" else "1"),
    ]) + "\n"


def cell_id(op, ret, ann, use, delivery):
    return "d532_%s_%s_%s_%s_%s" % (OPN[op], ret, ann, use, delivery)


# ── THE NON-DISPATCHING PIN ────────────────────────────────────────────────────
# The same declaration, the same body, the same ANNOTATED return — pinned to `i32`, where
# no overload can fire. It is a separate block because it is the only place the third rung
# (the bound that keeps the deferral OUT of an annotated body) has a witness at all: with
# the bound stripped, `function g<T>(a: T, b: T): V { return a < b }` hands its `return` a
# hole, `assignable` waves it past the declared `V`, and the `i32` pin — where the answer
# really is `boolean` — becomes check-clean INVALID WASM. Every cell here must stay LOUD or
# `runs`, never silent, and its stdout is always `1` so the value is never the confound.
def pinx_src(op, ret, delivery):
    rty, rbody, _p, _w = RETS[ret]
    sig = "(a: i32, b: i32)" if delivery == "direct" else "<T>(a: T, b: T)"
    return "\n".join([
        "type V = { x: i32 }",
        'function "%s"(self: V, other: V): %s { return %s }' % (op, rty, rbody),
        "function g%s: %s {" % (sig, rty),
        "  return a %s b" % op,
        "}",
        "const p: i32 = 6",
        "const q: i32 = 3",
        "const z = g(p, q)",
        "print(1)",
    ]) + "\n"


def pinx_id(op, ret, delivery):
    return "d532x_%s_%s_i32pin_%s" % (OPN[op], ret, delivery)


def cells():
    out = {}
    for op in DECLARABLE:
        for ret in RETS:
            for ann in ANNS:
                for use in USES:
                    for delivery in ("typar", "direct"):
                        out[cell_id(op, ret, ann, use, delivery)] = \
                            cell_src(op, ret, ann, use, delivery)
            for delivery in ("typar", "direct"):
                out[pinx_id(op, ret, delivery)] = pinx_src(op, ret, delivery)
    return out


def twin(cid):
    """The DIRECT twin — `(a: V, b: V)` where the cell writes `<T>(a: T, b: T)`, and
    NOTHING else changed."""
    assert cid.endswith("_typar"), cid
    return cid[: -len("_typar")] + "_direct"


def want_of(cid):
    """The value the cell's own DECLARATION says it produces, read off the source rather
    than cached: `99` for an i32-returning overload, `6` for the object-returning one
    (`self.x`), `1` for the dropped form and for every non-dispatching-pin cell. Never
    consulted for a cell that is not `runs`."""
    if cid.startswith("d532x_"):
        return "1"
    parts = cid.split("_")
    ret, use = parts[2], parts[4]
    return RETS[ret][3] if use == "val" else "1"


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
    differs from its twin's is a DISAGREE here, which is the whole reason this grid exists."""
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
                      + L.get("residue", [])))


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
    takes_value = ("--delta", "--write-lists", "--emit")
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
        # would be scored `runs` on any output at all, which is the blindness this grid
        # was built to remove.
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
        # SILENT outcome (invalid/trap, or `runs` with a value its declaration contradicts)
        # and the landing does not. A price is a fact about a REFUSED candidate, so it can
        # only ever be written by running one.
        cand = sys.argv[sys.argv.index("--write-lists") + 1]
        after = grade_all(cand, cs)
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if n.endswith("_typar")]
        control = sorted(n for n, g in agr.items()
                         if g == "agree" and base[n]["class"] == "runs"
                         and after[n]["class"] == "runs")
        SILENT = ("invalid", "trap")
        refused = [sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == "--refused"]
        price, whopaid = set(), {}
        for rs in refused:
            rg = grade_all(rs, cs)
            for n in cs:
                if not n.endswith("_typar"):
                    continue
                worse = rg[n]["class"] in SILENT or (
                    rg[n]["class"] == "runs" and rg[n]["msg"] != want_of(n))
                okhere = after[n]["class"] not in SILENT and not (
                    after[n]["class"] == "runs" and after[n]["msg"] != want_of(n))
                if worse and okhere:
                    price.add(n)
                    whopaid.setdefault(os.path.basename(rs), []).append(n)
        # RESIDUE: pinned cells the LANDING still leaves silent beside a LOUD direct twin.
        # Derived, not listed by hand, so a landing cannot quietly stop naming one — these
        # are the cells that must be FILED as a row rather than discovered later. (D551.)
        residue = sorted(n for n in cs
                         if n.endswith("_typar") and after[n]["class"] in SILENT
                         and after[twin(n)]["class"] in ("check", "emit"))
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "refused": {k: sorted(v) for k, v in whopaid.items()},
               "fix": fix,
               "price": sorted(price),
               "residue": residue,
               "control": control}
        json.dump(out, open(LISTS, "w"), indent=1, sort_keys=True)
        print("wrote %d fix + %d price (from %d refused candidates) + %d residue + %d "
              "control to %s"
              % (len(fix), len(price), len(refused), len(residue), len(control), LISTS))
        return 0

    if "--delta" in sys.argv:
        other = sys.argv[sys.argv.index("--delta") + 1]
        after = grade_all(other, cs)
        SILENT = ("invalid", "trap")
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
        print("%s -> %s" % (os.path.basename(seed), os.path.basename(other)))
        print("  moved         %4d of %d" % (len(moved), len(base)))
        print("  -> runs       %4d" % len(gained))
        print("  runs LOST     %4d" % len(lost))
        print("  -> silent     %4d" % len(silent))
        print("  -> WRONG VALUE%4d   (was %d, now %d)"
              % (len(wv_a - wv_b), len(wv_b), len(wv_a)))
        pairs = {}
        for n in moved:
            pairs[(base[n]["class"], after[n]["class"])] = \
                pairs.get((base[n]["class"], after[n]["class"]), 0) + 1
        for (x, y), c in sorted(pairs.items(), key=lambda t: -t[1]):
            print("    %-8s -> %-8s %4d" % (x, y, c))
        for lbl, rows in (("runs LOST", lost), ("-> silent", silent),
                          ("-> WRONG VALUE", sorted(wv_a - wv_b))):
            for n in rows:
                print("  %-14s %s   %s" % (lbl, n, after[n]["msg"][:60]))
        return 0

    if "--table" in sys.argv:
        print("== the NON-DISPATCHING pin (annotated return, `i32` argument) — pin/direct")
        print("%-4s %-24s %-24s" % ("op", "reti32", "retobj"))
        for op in DECLARABLE:
            row = []
            for ret in RETS:
                n = pinx_id(op, ret, "typar")
                row.append("%-24s" % ("%s/%s" % (base[n]["class"], base[twin(n)]["class"])))
            print("%-4s %s" % (op, " ".join(row)))
        print()
        print("== pin/direct by operator x overload return type x generic return annotation")
        cols = [(ret, ann, use) for ret in RETS for ann in ANNS for use in USES]
        print("%-4s %s" % ("op", " ".join("%-17s" % ("%s/%s/%s" % c) for c in cols)))
        for op in DECLARABLE:
            row = []
            for ret, ann, use in cols:
                n = cell_id(op, ret, ann, use, "typar")
                p, d = base[n], base[twin(n)]
                row.append("%-17s" % ("%s/%s" % (p["class"] if p["class"] != "runs"
                                                 else "runs:" + p["msg"],
                                                 d["class"] if d["class"] != "runs"
                                                 else "runs:" + d["msg"])))
            print("%-4s %s" % (op, " ".join(row)))
        nd = sum(1 for g in agr.values() if g == "DISAGREE")
        wv = wrongvalue(base)
        print("\n%d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
        print("%d of %d cells RUN and print a value their declaration contradicts"
              % (len(wv), len(base)))
        for n in wv:
            print("   WRONG VALUE %s  want %s got %s" % (n, want_of(n), base[n]["msg"]))
        return 0

    if "--verify" in sys.argv:
        # (1) THE DISTINGUISHING RULE, mechanised: every cell in `fix` must DISAGREE with
        #     its direct twin on the BASE seed, so its expected answer differs from the
        #     answer it would give if the rungs under test did nothing. `--verify` therefore
        #     TAKES THE BASE SEED.
        # (2) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY.
        # (3) Nothing here is a cached verdict: every class and every value is graded from
        #     the seed on this run, and `want_of` reads the expectation off the cell id's
        #     own axes rather than off a stored answer.
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
        # THE CONTROL LIST IS THE OTHER HALF OF THE SAME RULE: a cell that must NOT move
        # has to be a cell that COULD have. Every control must already agree with its twin
        # on the base seed and be a `runs`, so a rung that broke it would be visible.
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
        # THE REFUSED CANDIDATES' PRICE, EXECUTABLE. Two candidates were built and refused,
        # and `lists.json:refused` records which cells each one cost:
        #
        #   ABL_NO_R1  D531's hoisted dispatch gate WITHOUT D532's deferred result type —
        #              10 cells, 6 to check-clean invalid wasm and 4 to a module that
        #              prints `true` where its own declaration says `99`
        #   ABL_NO_R3  the deferral with no ANNOTATED-body bound — 4 cells from a loud
        #              return-type reject to check-clean invalid wasm at a pin where the
        #              overload cannot fire
        #
        # THE PAYMENT IS NOT "IT RUNS", and writing it that way is what a first cut of this
        # check got wrong: four of the fourteen are paid by STAYING LOUD, because their
        # direct twin is loud too. So the term is the grid's own criterion —
        #
        #   (a) NOT SILENT on this seed  — not invalid/trap, and not `runs` with a value
        #                                  its own declaration contradicts
        #   (b) AGREES with its DIRECT TWIN, class and value — so what counts as paid is
        #       the language's answer to the same question, never a remembered one
        #
        # A cell failing on the BASE seed is not a veto: it is the price still UNPAID,
        # which is what the base seed is for. Every cell failing is that signature, and it
        # is named rather than scored.
        price = L.get("price", [])
        if not require("price", price):
            return 1
        missing = [n for n in price
                   if not os.path.exists(os.path.join(NAMED, n + ".vl"))]
        if missing:
            print("price: %d cells are MISSING from named/ (%s...) — the population this "
                  "check is about does not exist. FAILURE." % (len(missing), missing[0]))
            return 1
        SILENT = ("invalid", "trap")
        bad_a, bad_b, kinds = [], [], {"loud": 0, "runs": 0}
        for n in price:
            v, t = base[n], base[twin(n)]
            silent = v["class"] in SILENT or (
                v["class"] == "runs" and v["msg"] != want_of(n))
            if silent:
                bad_a.append((n, v["class"], v["msg"][:60]))
                continue
            if v["class"] != t["class"] or (v["class"] == "runs" and v["msg"] != t["msg"]):
                bad_b.append((n, "%s/%s" % (v["class"], v["msg"][:24]),
                              "%s/%s" % (t["class"], t["msg"][:24])))
                continue
            kinds["runs" if v["class"] == "runs" else "loud"] += 1
        print("price cells: %d   seed %s (md5 %s)"
              % (len(price), os.path.basename(seed), seed_md5(seed)))
        print("  (a) not silent                    : %d fail" % len(bad_a))
        print("  (b) agrees with its direct twin   : %d fail" % len(bad_b))
        print("      paid by RUNNING the declaration's answer : %d" % kinds["runs"])
        print("      paid by STAYING LOUD beside a loud twin  : %d" % kinds["loud"])
        for lbl, rows in (("SILENT", bad_a), ("TWIN DISAGREES", bad_b)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        # WRONG SEED IS A DISTINCT ANSWER FROM VETO, and it is decided by the seed's own
        # IDENTITY rather than by the shape of the failures. A first cut used "every cell
        # fails" as the signature and was wrong in both directions: the BASE seed already
        # PAYS four of the fourteen (they are loud there and loud is the payment), so it
        # never showed that signature, while the refused candidate ABL_NO_R1 fails all ten
        # of the cells it can fail and would have been excused as a wrong seed. An md5 is
        # not a heuristic about behaviour — it says which compiler this was.
        if BASE_MD5 == seed_md5(seed):
            print("price: NOT A VETO — this IS the base seed (333d6851, md5 %s). These "
                  "cells are unpaid there BY DEFINITION; the check is about the LANDING. "
                  "Re-run against build/vl-compiler.wasm from this branch." % BASE_MD5)
            return 2
        ok = not (bad_a or bad_b)
        print("price: %s" % ("paid — every cell the refused candidates would have sent "
                             "silent reaches its direct twin's own answer"
                             if ok else "VETO"))
        return 0 if ok else 1

    nd = sum(1 for g in agr.values() if g == "DISAGREE")
    wv = wrongvalue(base)
    counts = {}
    for v in base.values():
        counts[v["class"]] = counts.get(v["class"], 0) + 1
    print("seed %s   %d cells" % (os.path.basename(seed), len(base)))
    for k in sorted(counts):
        print("  %-8s %4d" % (k, counts[k]))
    print("  %d of %d pinned cells DISAGREE with their direct twin" % (nd, len(agr)))
    print("  %d cells RUN and print a value their declaration contradicts" % len(wv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
