#!/usr/bin/env python3
"""D511 / D512 — the two questions `dispatchRewrite` asks of a HOLE, graded at the PIN
against what the DIRECT spelling of the same program answers.

`d492/pingrid.py` next door settled which deferred binary-op constraints
`binOpDefinedFor` ACCEPTS at a pin. This grid settles what the EMITTER then does with
the ones it accepts — and it exists as a separate population because d492's grid is
STRUCTURALLY BLIND to D511:

    its cells name their module constants `a` and `b`, which are the generic's own
    parameter names.

That is not a detail. `structIndexOfExpr`'s `Ident` arm asks `declaredStructIndex(name)`
— a bare MODULE-scope lookup with no scope test — so a `const a: V` at module scope
answers for a PARAMETER that merely happens to be spelled `a`, and every objop cell in
that grid dispatches for that reason. Rename the two constants and the same program goes
from printing `99` to check-clean invalid wasm. The `spell` axis below is what makes the
leak visible, and its third value (`decoy`) is what proves the mechanism:

  match    the module constants are named `a` / `b` and ARE the call's arguments
  nomatch  they are named `p` / `q` — nothing at module scope is spelled like a param
  decoy    they are named `p` / `q` AND an UNUSED `const a: V` sits at module scope

`decoy` is the discriminating cell. If the deciding input were the CALL's left argument
(which is what D511's row said when it was filed), `decoy` would behave like `nomatch`.
It behaves like `match` — so what decides is the module-scope binding spelled like the
generic body's LEFT OPERAND, and the call's arguments never enter it.

D512's block is the `??` row over every operand type. Its polarity is the opposite:
the direct spelling RUNS and the pin is a loud emit reject — a capability lost through a
type parameter rather than a refusal lost through one. It carries the `spell` axis too,
so "the name is irrelevant to `??`" is measured rather than assumed.

EVERY PINNED CELL SHIPS WITH ITS DIRECT TWIN, and the twin differs in EXACTLY ONE thing:
the annotation. `T` where the twin writes the concrete type, and nothing else — the
module constants, their names, the body, the call and the return annotation are all
identical. So the grade is a comparison against the language's own answer, spelled out,
rather than a remembered one:

    agree     the pin reached the same outcome class as the direct spelling
    DISAGREE  it did not; the annotation changed the answer

`--verify` MECHANISES three rules that prose does not enforce:

  (1) THE DISTINGUISHING RULE: a probe's expected answer must differ from the answer it
      would give if the thing under test did nothing. Every cell listed in `fix` is
      asserted to DISAGREE with its twin on the BASE seed — so `--verify` TAKES THE BASE
      SEED, not the landing's.
  (2) THE CONFOUND RULE: a direct twin that is loud for a reason UNRELATED to the
      operator is not a control for the operator. Every loud direct twin must name the
      operator in its message; every exception is listed in `lists.json`.
  (3) A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY. Every list this file reads is
      checked for emptiness before it is scored, and an empty one is a FAILURE rather
      than three silent `0 fail` lines and an exit 0.

    python3 scripts/silent-sweep/d511/pingrid2.py [seed.wasm]    grade to stdout
    python3 scripts/silent-sweep/d511/pingrid2.py --emit <dir>   write the cells
    python3 scripts/silent-sweep/d511/pingrid2.py --table        agree/DISAGREE by axis
    python3 scripts/silent-sweep/d511/pingrid2.py B.wasm --delta C.wasm
    python3 scripts/silent-sweep/d511/pingrid2.py --write-lists C.wasm B.wasm
    python3 scripts/silent-sweep/d511/pingrid2.py --verify B.wasm
    python3 scripts/silent-sweep/d511/pingrid2.py --price B.wasm
    python3 scripts/silent-sweep/d511/pingrid2.py --mkset
"""
import concurrent.futures
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

# ── D511: the ten operators `ast.vl:isBinOpFuncName` admits ─────────────────────
# Exactly the names a user OVERLOAD can be declared under, so they are the only ops
# for which "an operator overload at a pinned hole" is a program anyone can write.
DECLARABLE = ["+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="]

# ── D512: the operand types a hole can be pinned to ─────────────────────────────
# `d492/pingrid.py`'s table verbatim, for the reason its own header gives: `u8` is a
# STORAGE type that may not be a generic argument, and the `map` row must build with
# `Map()` because an object literal in a map annotation is itself a checker error.
TYPES = {
    "i32":      ("i32", "", "%s: i32 = 6", "%s: i32 = 3", "const", "const"),
    "i64":      ("i64", "", "%s: i64 = 6", "%s: i64 = 3", "const", "const"),
    "f64":      ("f64", "", "%s: f64 = 7.5", "%s: f64 = 1.5", "const", "const"),
    "f32":      ("f32", "", "%s: f32 = 7.5", "%s: f32 = 1.5", "const", "const"),
    "string":   ("string", "", '%s: string = "x"', '%s: string = "y"', "const", "const"),
    "boolean":  ("boolean", "", "%s: boolean = true", "%s: boolean = false", "const", "const"),
    "obj":      ("V", "type V = { x: i32 }", "%s: V = { x: 6 }", "%s: V = { x: 3 }", "const", "const"),
    "newi32":   ("Id", "type Id = new i32", "%s: Id = 6", "%s: Id = 3", "const", "const"),
    "aliasi32": ("Id", "type Id = i32", "%s: Id = 6", "%s: Id = 3", "const", "const"),
    "numunion": ("NK", "type NK = 0 | 1 | 2", "%s: NK = 2", "%s: NK = 1", "const", "const"),
    "litunion": ("K", 'type K = "a" | "b"', '%s: K = "b"', '%s: K = "a"', "const", "const"),
    "arr_i32":  ("i32[]", "", "%s: i32[] = [6]", "%s: i32[] = [3]", "const", "const"),
    "map":      ("{[string]: i32}", "", '%s: {[string]: i32} = Map()', '%s: {[string]: i32} = Map()',
                 "let", "let"),
    "nullable": ("i32 | null", "", "%s: i32 | null = 6", "%s: i32 | null = 3", "const", "const"),
    "fn":       ("(i32) => i32", "", "%s: (i32) => i32 = (n: i32) => n",
                 "%s: (i32) => i32 = (n: i32) => n", "const", "const"),
    "mixunion": ("U", "type U = i32 | string", "%s: U = 6", "%s: U = 3", "const", "const"),
}
MAP_FILL = {"map": '%s["k"] = %s'}

# The generic's parameters are ALWAYS `a` and `b`; only the module constants move. That
# is the axis: which SPELLING sits at module scope, not which value reaches the call.
SPELLS = ["match", "nomatch", "decoy"]
SPELL_NAMES = {"match": ("a", "b"), "nomatch": ("p", "q"), "decoy": ("p", "q")}

# body x return annotation. `bind` writes the operator's result to an unused `const` and
# returns 1; `ret` returns the result. The RETURN ANNOTATION axis exists because it
# separates two mechanisms that look identical from outside: with `: i32` the only
# question is whether the operator DISPATCHES, and with no annotation the generic's
# inferred return type is the second, independent question.
SHAPES = [("bind", "ann"), ("ret", "ann"), ("ret", "none")]

# `??`'s block takes only the two shapes whose DIRECT TWIN is a control for `??`. The
# third, `ret` with a `: i32` annotation, is not: `return a ?? b` over a `string` cannot
# be returned as `i32`, so the twin is a loud RETURN-TYPE error on 11 of the 16 rows and
# the cell would measure the annotation rather than the operator. Measured before it was
# cut, not reasoned about afterwards — the first draft of this grid carried it and its
# table printed `emit/check` down the column.
COAL_SHAPES = [("bind", "ann"), ("ret", "none")]

EXPECT_OUT = "1"

# ── grading, on `gradecensus.py`'s outcome vocabulary ────────────────────────────
INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


def bindings(tname, spell):
    """The module-scope constants, and the names the call passes."""
    _annot, _pre, ba, bb, kwa, kwb = TYPES[tname]
    na, nb = SPELL_NAMES[spell]
    out = ["%s %s" % (kwa, ba % na), "%s %s" % (kwb, bb % nb)]
    if tname in MAP_FILL:
        out.append(MAP_FILL[tname] % (na, "6"))
        out.append(MAP_FILL[tname] % (nb, "3"))
    if spell == "decoy":
        # THE DISCRIMINATING CELL: a module binding spelled like the generic's LEFT
        # PARAMETER that the call never passes. If the call's argument decided, this
        # would behave like `nomatch`.
        out.append("%s %s" % (kwa, ba % "a"))
        if tname in MAP_FILL:
            out.append(MAP_FILL[tname] % ("a", "6"))
    return out, na, nb


def cell_src(op, tname, spell, body, retann, delivery):
    annot, pre, _ba, _bb, _ka, _kb = TYPES[tname]
    L = []
    if pre:
        L.append(pre)
    if tname == "objop":
        pass
    if op in DECLARABLE and tname == "obj":
        L.append('function "%s"(self: V, other: V): i32 { return 99 }' % op)
    sig = "(a: %s, b: %s)" % (annot, annot) if delivery == "direct" else "<T>(a: T, b: T)"
    head = ": i32 {" if (body == "bind" or retann == "ann") else " {"
    L.append("function g%s%s" % (sig, head))
    if body == "bind":
        L.append("  const r = a %s b" % op)
        L.append("  return 1")
    else:
        L.append("  return a %s b" % op)
    L.append("}")
    binds, na, nb = bindings(tname, spell)
    L += binds
    # THE OPERATOR'S RESULT IS NEVER PRINTED, which is `d492/pingrid.py`'s confound
    # lesson: `print` of an `i32[]` / a map / an object / a function is type-unsupported,
    # so a grid that prints `a op b` measures `print`'s vocabulary on those rows rather
    # than the operator's. Every cell's stdout is the single character `1`.
    L.append("const z = g(%s, %s)" % (na, nb))
    L.append("print(1)")
    return "\n".join(L) + "\n"


# ── the NESTED-SHAPE block ─────────────────────────────────────────────────────
# A walker of this shape fails SILENTLY on a node kind it has no arm for, and the arm set is
# `monoFoldTyParamLayout`'s for exactly that reason. These four cells are the witness: the
# operator sits inside an ARRAY LITERAL or an OBJECT LITERAL rather than directly under a
# `const`, which reaches the walker through arms a first draft of the rung did not have.
# Their direct twins all RUN on the base seed, so each is a control for the container and
# not for the operator.
NEST = {
    "coal_nest_arrlit": ("i32", "",
                         "  const xs = [a ?? b]\n  return xs.length"),
    "coal_nest_objlit": ("i32", "type W = { r: i32 }",
                         "  const o: W = { r: a ?? b }\n  return o.r"),
    "xor_nest_arrlit":  ("V",
                         'type V = { x: i32 }\nfunction "^"(self: V, other: V): i32 { return 99 }',
                         "  const xs = [a ^ b]\n  return xs.length"),
    "xor_nest_objlit":  ("V",
                         'type W = { r: i32 }\ntype V = { x: i32 }\n'
                         'function "^"(self: V, other: V): i32 { return 99 }',
                         "  const o: W = { r: a ^ b }\n  return 1"),
}


def nest_src(key, delivery):
    annot, pre, body = NEST[key]
    L = []
    if pre:
        L += pre.split("\n")
    sig = "(a: %s, b: %s)" % (annot, annot) if delivery == "direct" else "<T>(a: T, b: T)"
    L.append("function g%s: i32 {" % sig)
    L.append(body)
    L.append("}")
    if annot == "V":
        L.append("const p: V = { x: 6 }")
        L.append("const q: V = { x: 3 }")
    else:
        L.append("const p: i32 = 6")
        L.append("const q: i32 = 3")
    L.append("const z = g(p, q)")
    L.append("print(1)")
    return "\n".join(L) + "\n"


def cell_id(op, tname, spell, body, retann, delivery):
    opn = {"+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem", "^": "xor",
           "<": "lt", "<=": "le", ">": "gt", ">=": "ge", "??": "coal"}[op]
    return "d511_%s_%s_%s_%s_%s_%s" % (opn, tname, spell, body, retann, delivery)


NPO = {"add": "+", "sub": "-", "mul": "*", "div": "/", "rem": "%", "xor": "^",
       "lt": "<", "le": "<=", "gt": ">", "ge": ">=", "coal": "??"}


def cells():
    out = {}
    # D511 — an operator OVERLOAD on an object, across the spelling axis.
    for op in DECLARABLE:
        for spell in SPELLS:
            for body, retann in SHAPES:
                for delivery in ("typar", "direct"):
                    out[cell_id(op, "obj", spell, body, retann, delivery)] = \
                        cell_src(op, "obj", spell, body, retann, delivery)
    # D512 — `??` over every operand type, across the same spelling axis.
    for tname in TYPES:
        for spell in ("match", "nomatch"):
            for body, retann in COAL_SHAPES:
                for delivery in ("typar", "direct"):
                    out[cell_id("??", tname, spell, body, retann, delivery)] = \
                        cell_src("??", tname, spell, body, retann, delivery)
    # The NESTED-SHAPE witnesses for the walker's arm set.
    for key in NEST:
        for delivery in ("typar", "direct"):
            out["d511_%s_%s" % (key, delivery)] = nest_src(key, delivery)
    return out


def twin(cid):
    """The DIRECT twin — the same program with the annotation concrete and NOTHING else
    changed: same constants, same names, same body, same call, same return annotation."""
    assert cid.endswith("_typar"), cid
    return cid[: -len("_typar")] + "_direct"


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


def grade_all(seed):
    cs = cells()
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        fut = {ex.submit(grade_one, (cs[n], seed)): n for n in cs}
        got = {fut[f]: f.result() for f in concurrent.futures.as_completed(fut)}
    return {n: {"class": got[n][0], "msg": got[n][1]} for n in cs}


def agreement(base):
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


# The phrasings `checkBinary` uses that NAME an operator without spelling its symbol —
# read off the compiler's own diagnostics, as `d492/pingrid.py` does.
OP_PHRASES = {
    "<": ["comparison expects", "comparison mixes"],
    "<=": ["comparison expects", "comparison mixes"],
    ">": ["comparison expects", "comparison mixes"],
    ">=": ["comparison expects", "comparison mixes"],
}


def names_op(cid, msg):
    op = NPO[cid.split("_")[1]]
    if ("operator '%s'" % op) in msg:
        return True
    return any(ph in msg for ph in OP_PHRASES.get(op, []))


def confounded(base):
    return sorted(n for n in base if n.endswith("_direct")
                  and base[n]["class"] == "check" and not names_op(n, base[n]["msg"]))


def named_set(L):
    return sorted(set(L.get("fix", []) + L.get("boundary", []) + L.get("residue", [])))


def load_lists():
    if not os.path.exists(LISTS):
        return {}
    return json.load(open(LISTS))


def require(name, rows):
    """A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY. Every scored list goes through
    this: an absent or empty ledger prints a FAILURE rather than a green zero."""
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

    base = grade_all(seed)
    agr = agreement(base)
    L = load_lists()

    if "--write-lists" in sys.argv:
        cand = sys.argv[sys.argv.index("--write-lists") + 1]
        after = grade_all(cand)
        conf = confounded(base)
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if not n.endswith("_direct")]
        price = [n for n in fix if base[n]["class"] == "runs"]
        boundary = sorted(n for n, g in agr.items()
                          if g == "agree" and base[n]["class"] == "runs"
                          and after[n]["class"] == "runs")
        residue = sorted(n for n, g in agr.items()
                         if after[n]["class"] != after[twin(n)]["class"])
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "fix": fix, "price": price, "boundary": boundary,
               "residue": residue, "confounded": conf}
        json.dump(out, open(LISTS, "w"), indent=1, sort_keys=True)
        print("wrote %d fix (%d price) + %d boundary + %d residue + %d confounded to %s"
              % (len(fix), len(price), len(boundary), len(residue), len(conf), LISTS))
        return 0

    if "--delta" in sys.argv:
        other = sys.argv[sys.argv.index("--delta") + 1]
        after = grade_all(other)
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
        print("%s -> %s" % (os.path.basename(seed), os.path.basename(other)))
        print("  moved      %4d of %d" % (len(moved), len(base)))
        print("  -> runs    %4d" % len(gained))
        print("  runs LOST  %4d" % len(lost))
        print("  -> silent  %4d" % len(silent))
        pairs = {}
        for n in moved:
            k = (base[n]["class"], after[n]["class"])
            pairs[k] = pairs.get(k, 0) + 1
        for (x, y), c in sorted(pairs.items(), key=lambda t: -t[1]):
            print("    %-8s -> %-8s %4d" % (x, y, c))
        for lbl, rows in (("runs LOST", lost), ("-> silent", silent)):
            for n in rows:
                print("  %s  %s" % (lbl, n))
        return 0

    if "--table" in sys.argv:
        print("== D511: an operator OVERLOAD on an object, by spelling x shape")
        print("%-4s %s" % ("op", " ".join("%-22s" % ("%s/%s%s" % (s, b, "" if r == "ann" else "-noann"))
                                          for s in SPELLS for b, r in SHAPES)))
        for op in DECLARABLE:
            row = []
            for s in SPELLS:
                for b, r in SHAPES:
                    n = cell_id(op, "obj", s, b, r, "typar")
                    row.append("%-22s" % ("%s/%s" % (base[n]["class"], base[twin(n)]["class"])))
            print("%-4s %s" % (op, " ".join(row)))
        print("\n== D512: `??` by operand type x spelling x body   (pin/direct)")
        for t in TYPES:
            row = []
            for s in ("match", "nomatch"):
                for b, r in COAL_SHAPES:
                    n = cell_id("??", t, s, b, r, "typar")
                    row.append("%-16s" % ("%s/%s" % (base[n]["class"], base[twin(n)]["class"])))
            print("%-10s %s" % (t, " ".join(row)))
        nd = sum(1 for g in agr.values() if g == "DISAGREE")
        print("\n%d of %d pinned cells DISAGREE with their direct twin"
              % (nd, len(agr)))
        return 0

    if "--verify" in sys.argv:
        rc = 0
        conf = confounded(base)
        declared = set(L.get("confounded", []))
        for n in conf:
            if n not in declared:
                print("CONFOUNDED (direct twin is loud without naming the operator): "
                      "%s  %s" % (n, base[n]["msg"][:110]))
                rc = 1
        print("confound: %d loud direct twins do not name their operator "
              "(%d declared)" % (len(conf), len(declared)))
        fix = L.get("fix", [])
        if not require("distinguishing", fix):
            rc = 1
        blind = [n for n in fix if agr.get(n) == "agree"]
        for n in blind[:20]:
            print("BLIND (pin already gives the direct twin's answer): %s" % n)
        print("distinguishing: %d of %d fix cells blind" % (len(blind), len(fix)))
        if blind:
            rc = 1
        want = named_set(L)
        if not require("named/", want):
            rc = 1
        miss = bad = 0
        for n in want:
            for m in (n, twin(n)):
                ref = os.path.join(NAMED, m + ".vl")
                if not os.path.exists(ref):
                    miss += 1
                    print("MISSING FROM named/: %s" % m)
                elif open(ref).read() != cs[m]:
                    bad += 1
                    print("DIFFERS FROM named/: %s" % m)
        print("named/: %d cells + twins expected, %d missing, %d differ"
              % (len(want), miss, bad))
        if miss or bad:
            rc = 1
        print("verify: %s" % ("OK" if rc == 0 else "FAILED"))
        return rc

    if "--price" in sys.argv:
        # THE RUNS-LOST OVERRIDE, EXECUTABLE. Per cell, against the seed it still ran on:
        #   (a) it RAN on the base seed
        #   (b) its DIRECT twin is LOUD on the base
        #   (c) the twin's refusal NAMES the operator
        # A cell failing any term is a VETO, not a price.
        price = L.get("price", [])
        if not require("price", price):
            return 1
        bad_a, bad_b, bad_c = [], [], []
        for n in price:
            if base[n]["class"] != "runs":
                bad_a.append((n, base[n]["class"]))
                continue
            t = base[twin(n)]
            if t["class"] not in ("check", "emit", "invalid"):
                bad_b.append((n, t["class"]))
            elif t["class"] == "check" and not names_op(twin(n), t["msg"]):
                bad_c.append((n, t["msg"][:90]))
        print("price cells: %d  seed %s" % (len(price), seed))
        print("  (a) ran on the base seed            : %d fail" % len(bad_a))
        print("  (b) direct twin is LOUD             : %d fail" % len(bad_b))
        print("  (c) twin's refusal names the op     : %d fail" % len(bad_c))
        for lbl, rows in (("NEVER-RAN", bad_a), ("TWIN-RUNS (VETO)", bad_b),
                          ("TWIN-CONFOUNDED", bad_c)):
            for r in rows[:10]:
                print("  %s %s" % (lbl, r))
        ok = not (bad_a or bad_b or bad_c)
        print("price: %s" % ("every lost cell ran only because the annotation erased "
                             "a refusal the direct spelling states — override holds"
                             if ok else "VETO"))
        return 0 if ok else 1

    if "--mkset" in sys.argv:
        want = named_set(L)
        if not require("named/", want):
            return 1
        wrote = 0
        for n in want:
            for m in (n, twin(n)):
                open(os.path.join(NAMED, m + ".vl"), "w").write(cs[m])
                wrote += 1
        mp = os.path.join(NAMED, "manifest.json")
        m = json.load(open(mp))
        for n in want:
            m["expect"][n] = EXPECT_OUT
            m["expect"][twin(n)] = EXPECT_OUT
        m["generated"] = len(m["expect"])
        json.dump(m, open(mp, "w"), indent=1, sort_keys=True)
        print("wrote %d files (%d cells + their direct twins) into %s"
              % (wrote, len(want), NAMED))
        return 0

    hist = {}
    for v in base.values():
        hist[v["class"]] = hist.get(v["class"], 0) + 1
    nd = sum(1 for g in agr.values() if g == "DISAGREE")
    print("%d cells: %s | %d of %d pinned DISAGREE" % (
        len(base), ", ".join("%s=%d" % (k, hist[k]) for k in sorted(hist)),
        nd, len(agr)), file=sys.stderr)
    json.dump({n: base[n]["class"] + ":" + base[n]["msg"] for n in sorted(base)},
              sys.stdout, indent=0, sort_keys=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
