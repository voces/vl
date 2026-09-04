#!/usr/bin/env python3
"""The kind-ladder census — the DISCOVERY instrument behind `kind-ladder-incomplete`
and `kind-ladder-split`.

A LADDER is a run of tests, inside one function, of the SAME subject against members
of ONE closed set (`export type K = "a" | "b" | …`, or a union alias over struct
types discriminated with `is`). The closed sets are read from `compiler/*.vl`, never
hard-coded: `--sets` prints what was found and where.

Four sections, in the order a reader wants them:

  --sets      every closed set the tree declares, its members, its home
  (default)   the ladder table: set, tested, missing, how the ladder ENDS
  --split     pairs of ladders over one set that partition it and delegate
  --pred      the PREDICATE form (`if aIdx(x) >= 0 … if bIdx(x) >= 0 …`) — no kind
              literal appears, so nothing that greps for one can see it; #2400's
              `nulvariant` hole is here and in no other section

The lint in compiler/lint.vl is the same walk over the first three, per module,
and `scripts/ladder-budget.py` is its per-file ratchet. See CLAUDE.md,
"A LADDER OVER A CLOSED KIND SET".
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A ladder needs at least this many arms before it is one. The floor is MEASURED, not
# chosen: at 1 the `const n = P.nodes[ix]; if n is X { … }` guard idiom floods the
# table (1,901 silent), at 2 it is 408 and at 3 it is 248. Two is the floor because
# D1370's ladder — `captureValKind`, `Param` and `LetDecl` and a silent `"i32"` for a
# module-BLOCK local — has exactly two arms, and three cannot see it. `--min N` moves
# it for a look; the lint's own floor (`klMinArms`) has to move with it.
MIN_ARMS = 2
# The predicate section is reporting only, so it can afford the lower floor —
# #2400's ladder had exactly two rungs.
MIN_PRED_ARMS = 2

# A quoted run at least this long is a SENTENCE — a default that said something.
MSG_LEN = 12
# Refusal channels a default may speak through. A tail reaching one of these has
# NAMED what the ladder excludes, whatever it says.
NAMING_CALLS = (
    "emitFail", "emitFailAt", "tErr", "tErrAt", "tErrBuiltinTyDecl",
    "tErrUnsupported", "pErr", "lintEmit", "panic", "unreachable", "diagPush",
    "cliFail",
)


def read_source(path):
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def sources():
    """`compiler/` only, unlike comment-budget's compiler + std. The closed sets are
    the COMPILER's vocabulary, so grading anything else against them mis-attributes:
    `tests/cases/literal-unions/atom-basics.vl` declares `type Kind = "i32" | "str" |
    "bool"` and reads as an incomplete `MfKind` ladder while covering its own union
    completely (which is why the corpus suite exempts both codes). Measured over
    `std/` and `tests/cases/`: that ONE cell, and nothing in std at all."""
    p = os.path.join(ROOT, "compiler")
    for name in sorted(os.listdir(p)):
        if name.endswith(".vl"):
            yield f"compiler/{name}", os.path.join(p, name)


# ── stripping ────────────────────────────────────────────────────────────────
def strip_line(ln):
    """`ln` cut at its `//` comment, with every string/char literal's CONTENT
    blanked to `x` and the quotes kept.

    BLANKING PRESERVES LENGTH, which is the whole point: a `{` or a `//` inside a
    literal stops confusing the brace walk, a quoted sentence still measures its own
    length for the naming tell, and a member's TEXT is read back out of the raw line
    at the positions found here."""
    out = []
    i, b = 0, len(ln)
    while i < b:
        c = ln[i]
        if c == "/" and i + 1 < b and ln[i + 1] == "/":
            break
        if c == '"' or c == "'":
            q = c
            out.append(c)
            i += 1
            while i < b and ln[i] != q:
                if ln[i] == "\\" and i + 1 < b:
                    out.append("x")
                    i += 1
                out.append("x")
                i += 1
            if i < b:
                out.append(q)
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


def cut_comment(ln):
    """`ln` cut at its `//` comment, literals INTACT. `strip_line` blanks them, which
    is right for the walk and wrong for reading a set's own members out of the `type`
    that declares them."""
    out, i, b = [], 0, len(ln)
    while i < b:
        c = ln[i]
        if c == "/" and i + 1 < b and ln[i + 1] == "/":
            break
        if c == '"' or c == "'":
            q = c
            out.append(c)
            i += 1
            while i < b and ln[i] != q:
                if ln[i] == "\\" and i + 1 < b:
                    out.append(ln[i])
                    i += 1
                out.append(ln[i])
                i += 1
            if i < b:
                out.append(q)
                i += 1
            continue
        out.append(c)
        i += 1
    return "".join(out)


# ── closed sets ──────────────────────────────────────────────────────────────
TYPE_HEAD = re.compile(r"^(?:export )?type ([A-Za-z_]\w*) = (.*)$")


def closed_sets():
    """{name: (members, kind, "file:line")} for every `type X = a | b | …` in the
    compiler, where the members are all string literals ("lit") or all type names
    ("type"). Runs of `|` continuation lines and interleaved comments are joined."""
    out = {}
    for rel, path in sources():
        lines = read_source(path).split("\n")
        n = 0
        while n < len(lines):
            m = TYPE_HEAD.match(lines[n])
            if not m:
                n += 1
                continue
            name, rhs = m.group(1), cut_comment(m.group(2))
            # Two continuation spellings, both in the tree: the `|` leads the next
            # line (`VKind`), or it TRAILS the previous one (`Node`, `Ty`).
            j = n + 1
            while j < len(lines):
                t = lines[j].strip()
                if t.startswith("//") or t == "":
                    j += 1
                    continue
                if t.startswith("|") or rhs.rstrip().endswith("|"):
                    rhs += " " + cut_comment(t)
                    j += 1
                    continue
                break
            parts = [p.strip() for p in rhs.split("|")]
            lits = [p[1:-1] for p in parts if len(p) >= 2 and p[0] == '"' and p[-1] == '"']
            tys = [p for p in parts if re.fullmatch(r"[A-Z]\w*", p)]
            if len(lits) == len(parts) and len(parts) >= 3:
                out[name] = (lits, "lit", f"{rel}:{n + 1}")
            elif len(tys) == len(parts) and len(parts) >= 3:
                out[name] = (tys, "type", f"{rel}:{n + 1}")
            n = j
    return out


def member_index(sets):
    """member -> [set names carrying it], per kind ("lit"/"type")."""
    idx = {"lit": {}, "type": {}}
    for name, (members, kind, _) in sets.items():
        for mem in members:
            idx[kind].setdefault(mem, []).append(name)
    return idx


# ── functions ────────────────────────────────────────────────────────────────
FN_HEAD = re.compile(r"^(?:export )?function ([A-Za-z_]\w*)\s*[(<]")


def functions(lines):
    """(name, first line index, last line index) for every TOP-LEVEL function, by
    column-0 `function` headers. The body runs to the line before the next one."""
    heads = [(i, m.group(1)) for i, ln in enumerate(lines) for m in [FN_HEAD.match(ln)] if m]
    out = []
    for k, (i, name) in enumerate(heads):
        end = heads[k + 1][0] - 1 if k + 1 < len(heads) else len(lines) - 1
        while end > i and lines[end].strip() == "":
            end -= 1
        out.append((name, i, end))
    return out


# ── tests ────────────────────────────────────────────────────────────────────
WORD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")
DIGIT = set("0123456789")
UPPER = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

ARM_LEAD = ("if ", "} else if ", "else if ")


def arm_lead(s):
    """Where an ARM's test begins. A test anywhere else on the line — a `||`
    continuation, an assignment, a `while` — is part of ONE boolean expression, not
    a rung: `startsStmt` asks about seventeen token kinds in a single `||` chain and
    dispatches on none of them."""
    t = s.lstrip()
    for w in ARM_LEAD:
        if t.startswith(w):
            return len(s) - len(t) + len(w)
    return -1


def _word_end(s, i, b):
    if i >= b or s[i] not in WORD or s[i] in DIGIT:
        return -1
    j = i
    while j < b and s[j] in WORD:
        j += 1
    return j


def _closer(s, i, b, op, cl):
    """Index just past the `op`…`cl` group opening at `i`, or -1."""
    d, j = 0, i
    while j < b:
        if s[j] == op:
            d += 1
        elif s[j] == cl:
            d -= 1
            if d == 0:
                return j + 1
        j += 1
    return -1


def subj_end(s, i, b):
    """End of a SUBJECT starting at `i`: an identifier, then any run of `.field`,
    `[…]` and `(…)`. The four spellings the tree dispatches on — `n`, `ot.primName`,
    `P.nodes[ix]`, `kindAt(k)` — and nothing that is not one."""
    j = _word_end(s, i, b)
    if j < 0:
        return -1
    while j < b:
        if s[j] == "." and _word_end(s, j + 1, b) > 0:
            j = _word_end(s, j + 1, b)
        elif s[j] == "[":
            k = _closer(s, j, b, "[", "]")
            if k < 0:
                return j
            j = k
        elif s[j] == "(":
            k = _closer(s, j, b, "(", ")")
            if k < 0:
                return j
            j = k
        else:
            break
    return j


def _spaces(s, i, b):
    while i < b and s[i] == " ":
        i += 1
    return i


def test_at(s, raw, k, b):
    """The arm test beginning at `k`: `(subject, member, "type"|"lit")`, or None.

    A STRICT FORWARD PARSE — subject, then `is` / `!is` / `==` / `!=` — so `if
    !p(x)`, `if i >= 0` and `if a && b is C` are not arms. The two implementations
    have to agree line for line, and a regex that searches ANYWHERE past the `if`
    reads the second conjunct of a compound condition as the ladder's rung."""
    p = _spaces(s, k, b)
    e = subj_end(s, p, b)
    if e < 0:
        return None
    subj = s[p:e]
    q = _spaces(s, e, b)
    for w, off in (("is ", 3), ("!is ", 4)):
        if q > e and s.startswith(w, q):
            r = _spaces(s, q + off, b)
            me = _word_end(s, r, b)
            if me > r and s[r] in UPPER:
                return (subj, s[r:me], "type")
            return None
    if s.startswith("==", q) or s.startswith("!=", q):
        r = _spaces(s, q + 2, b)
        if r < b and s[r] == '"':
            j = r + 1
            while j < b and s[j] != '"':
                j += 1
            if j < b:
                return (subj, raw[r + 1:j], "lit")
    return None


def tests_in(lines, lo, hi):
    """[(line index, subject, member, kind)] over `lines[lo:hi+1]` — one arm per
    line at most. `match` is out of scope: the checker already refuses a wildcard-less
    `match` that misses a member, so the language is the gate there."""
    out = []
    for i in range(lo, hi + 1):
        s = strip_line(lines[i])
        lead = arm_lead(s)
        if lead < 0:
            continue
        t = test_at(s, lines[i], lead, len(s))
        if t:
            out.append((i, t[0], t[1], t[2]))
    return out


def pick_set(members, kind, sets, idx):
    """The closed set this arm list is a ladder over: the SMALLEST set containing
    every tested member. None when no set holds them all — then the arms are not
    one vocabulary and the group is not a ladder."""
    cands = None
    for mem in members:
        holders = set(idx[kind].get(mem, ()))
        cands = holders if cands is None else (cands & holders)
        if not cands:
            return None
    return min(cands, key=lambda s: (len(sets[s][0]), s)) if cands else None


# ── how it ends ──────────────────────────────────────────────────────────────
def tail_of(lines, last, hi):
    """The ladder's DEFAULT region: what runs when no arm matched. Scan forward from
    the last arm counting braces — the arm's own block is skipped, and a `} else {`
    at the chain's depth hands the region to the ELSE BODY, which IS the default.
    Everything from there to the end of the function is the tail.

    Without the brace walk the region is the whole rest of the function, and a
    message inside the LAST ARM reads as a named default: the hole then hides behind
    the one arm that does have words."""
    out, depth, started = [], 0, False
    for i in range(last, hi + 1):
        s = strip_line(lines[i])
        t = s.strip()
        if not started:
            if depth == 1 and t.startswith("}") and "else" in t.split("{")[0]:
                started = True
                continue
            depth += s.count("{") - s.count("}")
            if depth <= 0:
                started = True
                # A one-line `if c { … } else { … }` closes and reopens on the same
                # line; its else body is the default and has nowhere else to be read.
                if "else" in t:
                    out.append(i)
            continue
        out.append(i)
    return out


def ends_named(lines, last, hi, fn_names):
    """True when the default NAMES what the ladder excludes: a refusal channel, a
    sentence long enough to be one, or a delegation to another function."""
    for i in tail_of(lines, last, hi):
        # THE BLANKED LINE, NEVER THE RAW ONE: a `"C<fe>@<name>"` inside a COMMENT
        # measured as a sentence and graded `monoSpecializableCallbackName`'s default
        # as named. A comment is not a default.
        s = strip_line(lines[i])
        for m in re.finditer(r'"(x*)"', s):
            if len(m.group(1)) >= MSG_LEN:
                return True
        for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", s):
            if m.group(1) in fn_names or m.group(1) in NAMING_CALLS:
                return True
    return False


def tail_calls(lines, last, hi, fn_names):
    """The functions the default region calls — a delegating default's targets."""
    out = set()
    for i in tail_of(lines, last, hi):
        for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", strip_line(lines[i])):
            if m.group(1) in fn_names:
                out.add(m.group(1))
    return out


# ── the census ───────────────────────────────────────────────────────────────
class Ladder:
    def __init__(self, rel, fn, subj, setname, arms, first, last, ending, delegates):
        self.rel, self.fn, self.subj = rel, fn, subj
        self.set, self.arms = setname, arms
        self.first, self.last, self.ending = first, last, ending
        # The functions the DEFAULT region calls — what makes a pair a split walk.
        self.delegates = delegates

    def missing(self, sets):
        return [m for m in sets[self.set][0] if m not in self.arms]


def ladders_of(rel, src, sets, idx):
    lines = src.split("\n")
    fns = functions(lines)
    fn_names = {n for n, _, _ in fns}
    out = []
    for fn, lo, hi in fns:
        groups = {}
        for i, subj, mem, kind in tests_in(lines, lo, hi):
            groups.setdefault((subj, kind), []).append((i, mem))
        # FIRST-SEEN order, not sorted: the lint records a function's groups in the
        # order the arms appear, and the split rule reports at the FIRST qualifying
        # ladder's position. Sorting here moved that position.
        for (subj, kind), hits in groups.items():
            uniq = []
            for _, m in hits:
                if m not in uniq:
                    uniq.append(m)
            if len(uniq) < MIN_ARMS:
                continue
            setname = pick_set(uniq, kind, sets, idx)
            if setname is None:
                continue
            first, last = min(i for i, _ in hits), max(i for i, _ in hits)
            if len(uniq) == len(sets[setname][0]):
                ending = "exhaustive"
            else:
                ending = "named" if ends_named(lines, last, hi, fn_names) else "silent"
            out.append(Ladder(rel, fn, subj, setname, uniq, first, last, ending,
                              tail_calls(lines, last, hi, fn_names)))
    return out


def all_ladders(sets, idx):
    out = []
    for rel, path in sources():
        out += ladders_of(rel, read_source(path), sets, idx)
    return out


# ── split walks ──────────────────────────────────────────────────────────────
def calls_in(lines, lo, hi):
    out = set()
    for i in range(lo, hi + 1):
        for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", strip_line(lines[i])):
            out.add(m.group(1))
    return out


def split_in(rel, src, sets, idx):
    """The D981 shape in ONE source: a walk over one enum, SPLIT by syntactic
    position into two ladders that cover disjoint subsets and hand the rest to each
    other.

    A pair qualifies when x's DEFAULT calls y, y's DEFAULT does not call back, and
    y's BODY calls x — mutually reachable, with the delegation in the tail rather
    than anywhere in the body, which is what takes this from 88 pairs to a readable
    few. Two numbers come out of it, and they are different findings:

      gap     kinds NEITHER half tests — handled nowhere, however the node arrives
      oneway  kinds x tests and y does not, where y's default hands nothing back.
              A node of that kind reaching y falls out of the walk. D981's `IfStmt`
              is here and NOT in `gap`, because `modRwStmt` did test it."""
    lines = src.split("\n")
    body = {n: calls_in(lines, lo, hi) for n, lo, hi in functions(lines)}
    lads = [l for l in ladders_of(rel, src, sets, idx) if l.ending != "exhaustive"]
    # ONE report per FUNCTION PAIR, not per ladder pair: `parseBlock` and `parseStmt`
    # each carry two TokKind ladders and would say it twice at one position. The lint
    # dedupes the same way, which is what makes the two agree.
    out, seen = [], set()
    for x in lads:
        for y in lads:
            if x.fn == y.fn or x.set != y.set:
                continue
            if (x.fn, y.fn) in seen:
                continue
            if y.fn not in x.delegates or x.fn in y.delegates:
                continue
            if x.fn not in body.get(y.fn, ()):
                continue
            oneway = [m for m in x.arms if m not in set(y.arms)]
            if not oneway:
                continue
            seen.add((x.fn, y.fn))
            members = sets[x.set][0]
            gap = [m for m in members if m not in set(x.arms) | set(y.arms)]
            out.append((rel, x.set, x, y, gap, sorted(set(x.arms) & set(y.arms)), oneway))
    return out


def split_pairs(sets, idx):
    """`split_in` over every compiler source."""
    out = []
    for rel, path in sources():
        out += split_in(rel, read_source(path), sets, idx)
    return out


# ── the predicate form ───────────────────────────────────────────────────────
def pred_ladders(sets, idx):
    """A ladder with NO kind literal in it: consecutive rungs that call helpers
    whose NAMES carry a kind of one set (`structIndexOfExpr` → `struct`). #2400's
    `eqConcreteVariantRow` is this shape and appears in no other section."""
    out = []
    # SCOPED TO `VKind`, and to members of six characters or more. The form is only
    # legible where a storage class has resolver helpers NAMED after it
    # (`structIndexOfExpr`, `nulVariantIdxOfExpr`); over a short member (`i32`,
    # `map`) or another set the substring test reports the tree's own vocabulary
    # (`modRwIsType` is not a `TYPE`-token rung).
    lit_members = {}
    for name, (members, kind, _) in sets.items():
        if name != "VKind":
            continue
        for m in members:
            if len(m) >= 6:
                lit_members.setdefault(m.lower(), set()).add(name)
    for rel, path in sources():
        lines = read_source(path).split("\n")
        for fn, lo, hi in functions(lines):
            hits = {}
            for i in range(lo, hi + 1):
                s = strip_line(lines[i])
                for m in re.finditer(r"\b([A-Za-z_]\w*)\s*\(", s):
                    low = m.group(1).lower()
                    if low == fn.lower():
                        continue
                    for mem, owners in lit_members.items():
                        if mem in low:
                            for o in owners:
                                hits.setdefault(o, {}).setdefault(mem, []).append((i, m.group(1)))
            for setname, mems in sorted(hits.items()):
                # A longer member subsumes a shorter one it contains (`nulvariant`
                # over `variant`); count the LONGEST match per call site only.
                best = {}
                for mem, sites in mems.items():
                    for i, call in sites:
                        cur = best.get((i, call), "")
                        if len(mem) > len(cur):
                            best[(i, call)] = mem
                got = {}
                for (i, call), mem in best.items():
                    got.setdefault(mem, []).append((i, call))
                if len(got) < MIN_PRED_ARMS:
                    continue
                missing = [m for m in sets[setname][0] if m not in got]
                if not missing:
                    continue
                out.append((rel, fn, setname, sorted(got), missing,
                            min(i for v in got.values() for i, _ in v)))
    return out


# ── output ───────────────────────────────────────────────────────────────────
def cmd_sets(sets):
    print(f"{len(sets)} closed sets declared in compiler/*.vl\n")
    for name, (members, kind, home) in sorted(sets.items(), key=lambda kv: -len(kv[1][0])):
        print(f"{name:<14} {len(members):>3} {kind:<5} {home}")
        print(f"               {' '.join(members)}")
    return 0


def cmd_table(sets, lads, top):
    end = {"exhaustive": 0, "named": 0, "silent": 0}
    per_set = {}
    for l in lads:
        end[l.ending] += 1
        per_set.setdefault(l.set, []).append(l)
    print(f"{len(lads)} ladders over {len(per_set)} closed sets in "
          f"{len({l.rel for l in lads})} files")
    print(f"  exhaustive {end['exhaustive']}   named default {end['named']}   "
          f"SILENT default {end['silent']}\n")
    print(f"{'set':<14}{'ladders':>8}{'exh':>6}{'named':>7}{'silent':>8}{'members':>9}")
    for s, ls in sorted(per_set.items(), key=lambda kv: -len(kv[1])):
        e = sum(1 for l in ls if l.ending == "exhaustive")
        n = sum(1 for l in ls if l.ending == "named")
        si = sum(1 for l in ls if l.ending == "silent")
        print(f"{s:<14}{len(ls):>8}{e:>6}{n:>7}{si:>8}{len(sets[s][0]):>9}")
    print(f"\ntop {top} incomplete ladders by members LACKED "
          "(silent default first, then named):\n")
    rank = sorted(
        [l for l in lads if l.ending != "exhaustive"],
        key=lambda l: (l.ending != "silent", -len(l.missing(sets)), l.rel, l.first),
    )
    print(f"{'#':>3}  {'site':<46}{'set':<11}{'arms':>7}{'lacks':>7}  ending")
    for k, l in enumerate(rank[:top], 1):
        site = f"{l.rel}:{l.first + 1} {l.fn}"
        print(f"{k:>3}  {site:<46}{l.set:<11}"
              f"{len(l.arms):>3}/{len(sets[l.set][0]):<3}{len(l.missing(sets)):>6}  {l.ending}")
    # RANKING BY `lacks` IS DEGENERATE OVER ONE BIG SET — every three-arm predicate
    # over `Node` lacks 34 and crowds out the walkers. Widest-first is the ranking
    # that surfaces a dispatch, which is where a hole costs something.
    print(f"\ntop {top} SILENT ladders by arms — the dispatches, widest first:\n")
    wide = sorted([l for l in lads if l.ending == "silent"],
                  key=lambda l: (-len(l.arms), l.rel, l.first))
    print(f"{'#':>3}  {'site':<46}{'set':<11}{'arms':>7}{'lacks':>7}")
    for k, l in enumerate(wide[:top], 1):
        site = f"{l.rel}:{l.first + 1} {l.fn}"
        print(f"{k:>3}  {site:<46}{l.set:<11}"
              f"{len(l.arms):>3}/{len(sets[l.set][0]):<3}{len(l.missing(sets)):>6}")
    return 0


def cmd_split(sets, pairs):
    holed = [p for p in pairs if p[6]]
    print(f"{len(pairs)} split walks — a ladder whose DEFAULT hands the rest to a "
          f"sibling ladder over the same set\n  {len(holed)} of them drop a kind the "
          "delegating half DOES test\n")
    for rel, setname, x, y, gap, shared, oneway in sorted(pairs, key=lambda p: -len(p[6])):
        print(f"{rel}  {setname}: `{x.fn}` ({len(x.arms)}) delegates to `{y.fn}` "
              f"({len(y.arms)})  shared {' '.join(shared) if shared else '-'}")
        print(f"    neither half handles ({len(gap)}): {' '.join(gap) if gap else '-'}")
        print(f"    one-way — falls through `{y.fn}` ({len(oneway)}): "
              f"{' '.join(oneway) if oneway else '-'}")
    return 0


def cmd_pred(preds):
    print(f"{len(preds)} predicate ladders — no kind literal appears in them\n")
    for rel, fn, setname, got, missing, line in sorted(preds, key=lambda p: -len(p[3])):
        print(f"{rel}:{line + 1}  {fn}  {setname}  rungs {' '.join(got)}")
        print(f"    lacks {len(missing)}: {' '.join(missing[:12])}")
    return 0


def cmd_find(sets, lads, preds, pairs, needle):
    for l in lads:
        if needle in l.fn:
            print(f"LADDER  {l.rel}:{l.first + 1} {l.fn}  set {l.set}  "
                  f"arms {len(l.arms)}/{len(sets[l.set][0])}  ending {l.ending}")
            print(f"        tests   {' '.join(l.arms)}")
            print(f"        missing {' '.join(l.missing(sets))}")
    for rel, fn, setname, got, missing, line in preds:
        if needle in fn:
            print(f"PRED    {rel}:{line + 1} {fn}  set {setname}  rungs {' '.join(got)}")
            print(f"        missing {' '.join(missing)}")
    for rel, setname, x, y, gap, shared, oneway in pairs:
        if needle in x.fn or needle in y.fn:
            print(f"SPLIT   {rel}  {setname}  `{x.fn}` delegates to `{y.fn}`")
            print(f"        gap    {' '.join(gap) if gap else '-'}")
            print(f"        oneway {' '.join(oneway) if oneway else '-'}")
    return 0


def main():
    global MIN_ARMS
    args = sys.argv[1:]
    if "--min" in args:
        MIN_ARMS = int(args[args.index("--min") + 1])
    sets = closed_sets()
    idx = member_index(sets)
    if "--sets" in args:
        return cmd_sets(sets)
    lads = all_ladders(sets, idx)
    if "--split" in args:
        return cmd_split(sets, split_pairs(sets, idx))
    if "--pred" in args:
        return cmd_pred(pred_ladders(sets, idx))
    if "--find" in args:
        return cmd_find(sets, lads, pred_ladders(sets, idx), split_pairs(sets, idx),
                        args[args.index("--find") + 1])
    if "--list" in args:
        for l in sorted(lads, key=lambda l: (l.rel, l.first)):
            print(f"{l.rel}:{l.first + 1}  {l.fn}  {l.set}  {len(l.arms)}/"
                  f"{len(sets[l.set][0])}  {l.ending}")
        return 0
    top = int(args[args.index("--top") + 1]) if "--top" in args else 20
    return cmd_table(sets, lads, top)


if __name__ == "__main__":
    sys.exit(main())
