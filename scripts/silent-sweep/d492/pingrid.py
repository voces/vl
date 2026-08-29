#!/usr/bin/env python3
"""D492 / D493 — what `binOpDefinedFor` answers at a PIN, graded against what the
DIRECT spelling of the same program answers.

`d471/opdeclgrid.py` next door settled the DECLARATION-site shapes of a binary
operator. This grid settles the USE-site one: an operator written inside a generic
body, whose form the body cannot decide, is adjudicated at every call that pins the
hole — by `binOpDefinedFor`, whose header says it "Mirrors `checkBinary`'s accepted
forms" and whose tail says "Operators not modelled here return true (no false
reject)".

  D492  `^` is NOT MODELLED, so the tail answers `true` for every operand type. Over
        `string` the pin accepts and the emitter emits an i32 opcode over two refs:
        check-clean INVALID WASM, where the direct spelling is a loud checker reject.

  D493  `%` IS modelled and the arm is `isNumeric(lt) && isNumeric(rt)`, which is
        true of `f64`. `checkBinary` rejects float remainder separately, further
        down, in the arm it shares with the bitwise ops — and that half was never
        mirrored. So the pin accepts and the EMITTER rejects.

Both are one sentence: the integer-only family (`% & | ^ << >> >>>`) has no arm in
`binOpDefinedFor` that mirrors `checkBinary`'s integer-only rule. ONE edit closes
both, and this grid is what proves that rather than asserting it.

EVERY CELL SHIPS WITH ITS DIRECT TWIN, and that is the control the rows themselves
name: the twin differs in EXACTLY ONE THING, the annotation. `T` where the twin
writes the concrete type, and nothing else. So the grade is a comparison against a
known answer — the language's own, spelled out — rather than a remembered one:

    agree     the pin reached the same outcome class as the direct spelling
    DISAGREE  it did not; the annotation changed the answer

THE `body` AXIS EXISTS BECAUSE ONE VALUE OF IT HIDES A `runs` CELL, which is the
kind of thing a one-shape grid reports as an absence. `bind` writes the operator's
result to an unused `const` and returns a constant; `ret` returns the result and
binds the CALL. They are not equivalent: with an operator OVERLOAD on the left
operand, `bind` RUNS and prints the declaration's answer while `ret` is check-clean
invalid wasm. A grid with only `bind` sees a `runs` cell this landing must not take;
a grid with only `ret` never sees it at all and would have reported the veto as
absent.

`--verify` MECHANISES two rules that prose does not enforce:

  (1) THE DISTINGUISHING RULE (`DECISIONS.md`, the lesson of #2005 and #2007): a
      probe's expected answer must differ from the answer it would give if the thing
      under test did nothing. Here the TARGET answer is the direct twin's, and a cell
      whose pin ALREADY gives it on the base compiler cannot show the landing at all.
      Every cell listed in `fix` is asserted live against the base seed — so `--verify`
      TAKES THE BASE SEED, not the landing's. Run against the landing every fix cell
      reads "blind" for the good reason (it is closed), and that is not the question
      this rule asks.

  (2) THE CONFOUND RULE, which is #2007's hand-written `CONFOUNDED` comment made
      executable: a direct twin that is loud for a reason UNRELATED to the operator is
      not a control for the operator. Every loud direct twin must name the operator in
      its message, and every exception has to be listed in `lists.json`.

    python3 scripts/silent-sweep/d492/pingrid.py [seed.wasm]   grade to stdout
    python3 scripts/silent-sweep/d492/pingrid.py --emit <dir>  write the cells
    python3 scripts/silent-sweep/d492/pingrid.py --table       agree/DISAGREE by op
    python3 scripts/silent-sweep/d492/pingrid.py B.wasm --delta C.wasm   the delta
    python3 scripts/silent-sweep/d492/pingrid.py --write-lists C.wasm B.wasm
    python3 scripts/silent-sweep/d492/pingrid.py --verify B.wasm   both rules + named/
    python3 scripts/silent-sweep/d492/pingrid.py --price B.wasm    the runs-lost override
    python3 scripts/silent-sweep/d492/pingrid.py --mkset       write named/
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

# ── the operators a deferred constraint is recorded for ─────────────────────────
# `checkBinary` records every binary operator except `=`, `&&` and `||`
# (`noteBinCstr`'s guard), so this is that set exactly.
OPS = ["+", "-", "*", "/", "%", "&", "|", "^", "<<", ">>", ">>>",
       "<", "<=", ">", ">=", "==", "!=", "??"]
OPN = {"+": "add", "-": "sub", "*": "mul", "/": "div", "%": "rem",
       "&": "and", "|": "or", "^": "xor", "<<": "shl", ">>": "shr", ">>>": "ushr",
       "<": "lt", "<=": "le", ">": "gt", ">=": "ge", "==": "eq", "!=": "ne",
       "??": "coal"}
NPO = {v: k for k, v in OPN.items()}

# THE FAMILY UNDER TEST — `checkBinary`'s own list, verbatim, at the arm whose
# comment begins "BITWISE / SHIFT / REMAINDER are INTEGER-ONLY".
INT_ONLY = ["%", "&", "|", "^", "<<", ">>", ">>>"]

# The ten names `ast.vl:isBinOpFuncName` admits — the only ops that can carry a
# user OVERLOAD, so the `objop` row exists for these and no others.
DECLARABLE = {"+", "-", "*", "/", "%", "^", "<", "<=", ">", ">="}

# ── the operand types a hole can be pinned to ───────────────────────────────────
# `u8` is deliberately absent and that is not an oversight: `PrimName`'s own comment
# calls it "a STORAGE type, not a value type — the one member of this union that may
# not appear as the type of a local, param, return, binding, map value, union member
# or GENERIC ARGUMENT". There is no program that pins a hole to it.
#
# The `map` row builds with `Map()` rather than an object literal for the reason the
# confound rule exists: `const m: {[string]: i32} = {"k": 6}` is itself a checker
# error ("An object literal isn't a map value"), and the PIN cells reported THAT
# instead of the operator — six cells measuring the map constructor's diagnostic.
TYPES = {
    # name:      (annot,             preamble,                 bind a,                 bind b)
    "i32":      ("i32", "", "const a: i32 = 6", "const b: i32 = 3"),
    "i64":      ("i64", "", "const a: i64 = 6", "const b: i64 = 3"),
    "f64":      ("f64", "", "const a: f64 = 7.5", "const b: f64 = 1.5"),
    "f32":      ("f32", "", "const a: f32 = 7.5", "const b: f32 = 1.5"),
    "string":   ("string", "", 'const a: string = "x"', 'const b: string = "y"'),
    "boolean":  ("boolean", "", "const a: boolean = true", "const b: boolean = false"),
    "obj":      ("V", "type V = { x: i32 }", "const a: V = { x: 6 }", "const b: V = { x: 3 }"),
    "objop":    ("V", "type V = { x: i32 }", "const a: V = { x: 6 }", "const b: V = { x: 3 }"),
    "newi32":   ("Id", "type Id = new i32", "const a: Id = 6", "const b: Id = 3"),
    "aliasi32": ("Id", "type Id = i32", "const a: Id = 6", "const b: Id = 3"),
    "numunion": ("NK", "type NK = 0 | 1 | 2", "const a: NK = 2", "const b: NK = 1"),
    "litunion": ("K", 'type K = "a" | "b"', 'const a: K = "b"', 'const b: K = "a"'),
    "arr_i32":  ("i32[]", "", "const a: i32[] = [6]", "const b: i32[] = [3]"),
    "map":      ("{[string]: i32}", "",
                 'let a: {[string]: i32} = Map()\na["k"] = 6',
                 'let b: {[string]: i32} = Map()\nb["k"] = 3'),
    "nullable": ("i32 | null", "", "const a: i32 | null = 6", "const b: i32 | null = 3"),
    "fn":       ("(i32) => i32", "", "const a: (i32) => i32 = (n: i32) => n",
                 "const b: (i32) => i32 = (n: i32) => n"),
    "mixunion": ("U", "type U = i32 | string", "const a: U = 6", "const b: U = 3"),
}
# The `objop` row's preamble carries an OVERLOAD for the operator under test, so a
# refusal at the pin is a refusal of a declaration that DOES dispatch at the direct
# spelling. That is the row a naive fix breaks, and the reason the landing's new arm
# defers on an object receiver that has a dispatch instead of refusing every object.
OBJOP_DECL = 'function "{op}"(self: V, other: V): i32 { return 99 }'

# delivery × body. `fnval` reaches `binOpDefinedFor` through `binCstrsHold` (the
# generic-function-VALUE assignability path) rather than through `validateBinCstrs`,
# so it is the second consumer of the same predicate; it is carried at `bind` only,
# because a `ret` body leaves the generic's return type inferred and the concrete
# function type it is assigned to then confounds the operator question with a
# return-type mismatch.
SHAPES = [("bind", "typar"), ("bind", "direct"), ("bind", "fnval"),
          ("ret", "typar"), ("ret", "direct")]

# THE OPERATOR'S RESULT IS NEVER PRINTED under either body, and that is the confound
# #2007 paid for: `print` of an `i32[]` / a map / an object / a function is
# type-unsupported, so a grid that prints `a op b` measures `print`'s vocabulary on
# six of its rows rather than the operator's. Every cell's stdout is the single
# character `1`, which makes `runs` mean one thing across the whole grid.
BODY = {
    "bind": "  const r = a %s b\n  return 1",
    "ret":  "  return a %s b",
}


def cell_src(op, tname, body, delivery):
    annot, pre, ba, bb = TYPES[tname]
    lines = []
    if pre:
        lines.append(pre)
    if tname == "objop":
        lines.append(OBJOP_DECL.replace("{op}", op))
    sig = "(a: %s, b: %s)" % (annot, annot) if delivery == "direct" else "<T>(a: T, b: T)"
    ret = ": i32 {" if body == "bind" else " {"
    lines.append("function g%s%s" % (sig, ret))
    lines.append(BODY[body] % op)
    lines.append("}")
    lines += [ba, bb]
    if delivery == "fnval":
        lines.append("const h: (%s, %s) => i32 = g" % (annot, annot))
        lines.append("print(h(a, b))")
    elif body == "ret":
        lines.append("const z = g(a, b)")
        lines.append("print(1)")
    else:
        lines.append("print(g(a, b))")
    return "\n".join(lines) + "\n"


def cell_id(op, tname, body, delivery):
    return "d492_%s_%s_%s_%s" % (OPN[op], tname, body, delivery)


def cells():
    out = {}
    for op in OPS:
        for tname in TYPES:
            if tname == "objop" and op not in DECLARABLE:
                continue
            for body, delivery in SHAPES:
                out[cell_id(op, tname, body, delivery)] = \
                    cell_src(op, tname, body, delivery)
    return out


def twin(cid):
    """The DIRECT twin of a cell — the same program with the annotation concrete and
    nothing else changed. Its answer is the language's own, and it is what every
    pinned cell is graded against. A `fnval` cell's twin is the `bind` direct one:
    `fnval` differs from `bind` only in HOW the generic reaches its concrete types."""
    head, body, delivery = cid.rsplit("_", 2)
    return "%s_%s_direct" % (head, "bind" if delivery == "fnval" else body)


EXPECT_OUT = "1"

# ── grading, on `gradecensus.py`'s outcome vocabulary ────────────────────────────
INVALID = ("Invalid input WebAssembly code", "WebAssembly translation error",
           "wasm validation", "failed to parse")
TRAP = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
        "null reference", "cast failure", "integer overflow")
EMIT = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
        "unsupported expression")


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
    """{cell -> 'agree' | 'DISAGREE'} over the pinned deliveries. A `runs` pair must
    also print the same thing; every other class compares by class alone, because the
    two spellings legitimately word the same refusal differently (the pin's carries
    ` (the call's argument types)`)."""
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


# The phrasings `checkBinary` uses that NAME an operator without spelling its symbol.
# Read off the compiler's own diagnostics, not guessed: the relational arm says
# "comparison expects numeric operands" and the equality arm says "`==` over X has no
# lowering" / "cannot compare X and Y". Scoring those 60 cells as confounds is what hid
# the grid's ONE real confound, so the list is here rather than in a comment.
OP_PHRASES = {
    "<": ["comparison expects"], "<=": ["comparison expects"],
    ">": ["comparison expects"], ">=": ["comparison expects"],
    "==": ["cannot compare", "`==` over"], "!=": ["cannot compare", "`!=` over"],
}


def names_op(cid, msg):
    """Does a refusal message name the operator the cell is about? The confound rule is
    this predicate: `print of i32[] is type-unsupported` does not, and a cell whose direct
    twin says that is measuring `print`, not the operator."""
    op = NPO[cid.split("_")[1]]
    if ("operator '%s'" % op) in msg:
        return True
    return any(ph in msg for ph in OP_PHRASES.get(op, []))


def confounded(base):
    return sorted(n for n in base if n.endswith("_direct")
                  and base[n]["class"] == "check" and not names_op(n, base[n]["msg"]))


def named_set(L):
    """What goes into `distilled/named/`: every cell the landing MOVED, the family's cells
    that must keep RUNNING, and the RESIDUE it deliberately left — each with its DIRECT
    twin, because the twin is the control and a silent change to the language's own answer
    would otherwise turn "they agree" into a different claim without saying so."""
    return sorted(set(L.get("fix", []) + L.get("boundary", []) + L.get("residue", [])))


def load_lists():
    """`fix` / `price` / `boundary` / `confounded` live in `lists.json` beside this
    file, written by `--write-lists` against the BASE seed and read by everything
    else. They are never re-derived from the compiler under test, for
    `d471/opdeclgrid.py`'s reason: a rule reading current behaviour picks a different
    set on either side of the landing. Before it these cells are silent or
    emitter-loud; after it they are check rejects indistinguishable from hundreds of
    their neighbours. A separate file rather than literals in this one because it is
    DATA read off a compiler, and mixing it in makes a rebase look like a code
    change."""
    if not os.path.exists(LISTS):
        return {"fix": [], "price": [], "boundary": [], "confounded": []}
    return json.load(open(LISTS))


def main():
    seed = os.path.join(R, "build/vl-compiler.wasm")
    # THE FIRST BARE `.wasm` IS THE SEED, and an argument that FOLLOWS A FLAG never is.
    # `--delta C.wasm` and `--write-lists C.wasm` each name a SECOND compiler, and a
    # last-one-wins scan silently made that second compiler the base — `--delta` then
    # graded one seed against itself and printed a flat zero, which reads exactly like a
    # landing that changed nothing.
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
        # THE LISTS ARE READ OFF TWO COMPILERS ONCE and then frozen. `fix` is the set that
        # actually MOVED between them, not a rule over the axes: after the landing those
        # cells are check rejects indistinguishable from hundreds of their neighbours, so a
        # rule reading current behaviour picks a different set on either side of it. That is
        # `d471/opdeclgrid.py`'s reason for hand-listing PRICE and BOUNDARY, mechanised.
        cand = sys.argv[sys.argv.index("--write-lists") + 1]
        after = grade_all(cand)
        conf = confounded(base)
        moved = sorted(n for n in base
                       if (base[n]["class"], base[n]["msg"]) !=
                          (after[n]["class"], after[n]["msg"]))
        fix = [n for n in moved if not n.endswith("_direct")]
        price = [n for n in fix if base[n]["class"] == "runs"]
        # BOUNDARY — the family's cells that RUN on BOTH compilers. Restricted to the
        # integer-only ops because that is the family the landing touches; the grid's other
        # ~600 running cells are the census corpus's business, not this set's.
        boundary = sorted(n for n, g in agr.items()
                          if g == "agree" and base[n]["class"] == "runs"
                          and after[n]["class"] == "runs"
                          and NPO[n.split("_")[1]] in INT_ONLY)
        # RESIDUE — still disagreeing with its direct twin AFTER the landing, and
        # deliberately so. Kept in the named set because a residue nobody re-grades is how
        # a row reads as closed when it is not.
        residue = sorted(n for n, g in agr.items()
                         if NPO[n.split("_")[1]] in INT_ONLY
                         and after[n]["class"] != after[twin(n)]["class"])
        out = {"base_seed": os.path.basename(seed),
               "cand_seed": os.path.basename(cand),
               "fix": fix, "price": price, "boundary": boundary,
               "residue": residue, "confounded": conf}
        # NO GRADE MAP IS STORED. It is tempting — 1,490 cells and their classes on both
        # compilers, right here — and nothing would ever read it. `CLAUDE.md` names that
        # exact failure ("do not add a field nothing reads: `coords` was stored three times
        # and read from none of them"), and a stored grade map is the worse version of it:
        # it goes stale on the next seed with nothing failing. The lists ARE the record, and
        # `--delta` re-derives the grades in four seconds when they are wanted.
        json.dump(out, open(LISTS, "w"), indent=1, sort_keys=True)
        print("wrote %d fix (%d price) + %d boundary + %d residue + %d confounded to %s"
              % (len(fix), len(price), len(boundary), len(residue), len(conf), LISTS))
        return 0

    if "--delta" in sys.argv:
        # THE CELL-MATCHED GRADE, in the four columns a landing is read by. Reported as
        # `runs -> not-runs` and `-> silent` explicitly rather than as histogram deltas,
        # because a block once lost 0 `runs` and still moved 12 cells loud->silent while
        # its loud-emit column moved -126: the regression was arithmetically invisible.
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
        for body, delivery in SHAPES:
            if delivery == "direct":
                continue
            print("\n== %s / %s" % (body, delivery))
            print("%-6s %s" % ("op", " ".join("%-9s" % t for t in TYPES)))
            for op in OPS:
                row = []
                for t in TYPES:
                    n = cell_id(op, t, body, delivery)
                    row.append("%-9s" % (agr[n][:9] if n in agr else "-"))
                print("%-6s %s" % (op, " ".join(row)))
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
        blind = [n for n in L.get("fix", []) if agr.get(n) == "agree"]
        for n in blind[:20]:
            print("BLIND (pin already gives the direct twin's answer): %s" % n)
        print("distinguishing: %d of %d fix cells blind"
              % (len(blind), len(L.get("fix", []))))
        if blind:
            rc = 1
        want = named_set(L)
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
        # THE RUNS-LOST OVERRIDE, EXECUTABLE — `d471/opdeclgrid.py --price`'s pattern,
        # with the terms this row's control makes available. `CLAUDE.md` makes
        # `runs` -> not-runs the veto and `DECISIONS.md` makes it overridable only
        # when the lost cells ran by COINCIDENCE rather than by rule. That is a
        # per-cell claim, so it is checked per cell against the seed they still ran
        # on, not argued in prose:
        #
        #   (a) it RAN on the base seed               — a real loss, not a no-op
        #   (b) its DIRECT twin is LOUD on the base   — so it ran ONLY because the
        #       annotation erased a refusal the language states in the direct
        #       spelling: a coincidence of representation, not a rule
        #   (c) the twin's refusal NAMES the operator — so (b) is about this
        #       operator and not some unrelated thing the twin also trips
        #
        # A cell failing any term is a VETO, not a price. In particular a cell whose
        # direct twin RUNS is a capability the language grants and the landing would
        # take away — `d492_*_objop_bind_typar` is exactly that shape, which is why
        # the landing defers on a dispatching object receiver rather than refusing
        # every object.
        price = L.get("price", [])
        # A CHECK MUST FAIL WHEN ITS POPULATION IS EMPTY. Run with the ledger absent
        # (a partial checkout, a bad `git apply`, a rebase that dropped the set) this
        # printed `price cells: 0`, three `0 fail` lines and "override holds", exit 0 --
        # a green result from a population that does not exist, indistinguishable from
        # the check having verified something. That is the do-nothing rule one level up:
        # the rule says a CELL's expected answer must differ from what it would give if
        # the thing under test did nothing; this says the CHECK's own result must differ
        # from what it would give if the check did nothing. Both were violated in one
        # day by authors who had read the other.
        if not price:
            print("price: EMPTY POPULATION -- the ledger lists no price cells, so "
                  "nothing was verified. This is a FAILURE, not an override.")
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
