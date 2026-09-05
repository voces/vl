#!/usr/bin/env python3
"""The sentinel-index census — the DISCOVERY instrument behind
`sentinel-index-unguarded` and `sentinel-index-strict-untested`.

THE SHAPE: a table read `<table>[<idx>]` whose index arrived from something that
answers an in-band "no answer" — a call, or an arena field that is -1 while open —
with no bound test between the arrival and the read. Five compiler TRAPS of exactly
this shape landed on 2026-09-03 (D1440, D1462, D1500 and #2498, plus the D1500 family
table's rest); `vl check` returned 0 for each and the seed died with an anonymous
`out of bounds array access`. Full write-up: docs/internals/sentinel-index-lint.md.

Four sections:

  --readers   the READER census: functions that answer -1 in band, the `*Strict`
              twins, and the clampers. Reporting only — see "why the rule does not
              filter on it" in the doc, and `--readers --hits` for the join.
  --holes     the HOLE FIELDS, per module: a struct field the module itself
              compares against 0 or -1, so the module admits it can be absent
  --tables    the tables read in each module that the reading function did not build
  (default)   the hit table: file:function, the table, the index, its producer

compiler/lint.vl carries the SAME walk per module, and scripts/sentinel-budget.py is
its per-file ratchet. Both are the same rule over the same derivation, which is what
tests/vl_sentinel_index_test.ts pins.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

UNGUARDED = "sentinel-index-unguarded"
STRICT = "sentinel-index-strict-untested"
CODES = (UNGUARDED, STRICT)


def read_source(path):
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def sources():
    """`compiler/` only. The ratchet grades the tree this rule polices; `std/` and
    `tests/cases/` are graded by the LINT wherever they are checked, and measured in
    the doc rather than carried here."""
    p = os.path.join(ROOT, "compiler")
    for name in sorted(os.listdir(p)):
        if name.endswith(".vl"):
            yield f"compiler/{name}", os.path.join(p, name)


# ── stripping ────────────────────────────────────────────────────────────────
def strip_line(ln):
    """`ln` cut at its `//` comment, with every string/char literal's CONTENT blanked
    to `x` and the quotes kept. Blanking PRESERVES LENGTH, so a column read back out
    of the raw line still lands where the walk found it."""
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


FN_HEAD = re.compile(r"^(?:export )?function ([A-Za-z_][A-Za-z0-9_]*)\s*\(")


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


# ── the derivations, both PER MODULE ─────────────────────────────────────────
# A field is a HOLE FIELD of this module when the module itself compares it against 0
# or -1: `t.nInner < 0`, `n.callFn >= 0`, `e.letInit == -1`. That is the module
# admitting the field can be absent, in its own words, which is why the set is read
# rather than written down. PER MODULE and not tree-wide, so the lint (which sees one
# module) and this census (which sees the tree) cannot disagree — measured cost of the
# narrower scope in docs/internals/sentinel-index-lint.md §"What per-module costs".
# `< 0` and `>= 0` are the two comparisons that separate "absent" from "a row"; against a
# NEGATIVE literal any operator does. `x.length > 0` is a non-empty test and deliberately
# not one of these — it marked `length` a hole field and turned eleven `const id =
# xs.length` bindings into producers.
HOLE_TEST = re.compile(
    r"\b[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)\s*"
    r"(?:(?:<|>=)\s*0(?![0-9.])|(?:<|>|<=|>=|==|!=)\s*-)"
)

# A function ANSWERS IN BAND when some path hands back a literal -1. The tell of a
# reader, and the only thing the parameter arm below is scoped by.
NEG_ANSWER = re.compile(r"\breturn\s+-1\b|^\s*-1\s*$|\breturn\s+0\s*-\s*1\b")
RET_CALL = re.compile(r"\breturn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(")
TAIL_CALL = re.compile(r"^  ([A-Za-z_][A-Za-z0-9_]*)\s*\(")

# A DECLARATION inside a function body: `let x`, `const x`, `for x in`, and a
# parameter. Anything a function declares itself is NOT a table for this rule — the
# function built it and can bound it from what it can see.
DECL = re.compile(r"^\s*(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*)")
FOR_IN = re.compile(r"^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\b")
PARAMS = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*:")
# An `i32` PARAMETER — the only parameters this rule looks at, since only an integer
# can be an index.
I32_PARAM = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\s*:\s*i32\b")
RETURNS = re.compile(r"(?:^|[\s{])return\b")
# A module-level MAP global. Its subscript is a key, not an index.
MAP_GLOBAL = re.compile(r"^(?:export )?(?:let|const) ([A-Za-z_][A-Za-z0-9_]*)\s*:\s*\{\[")

# `let x = f(…)` / `const x: i32 = f(…)` / `x = f(…)` — a bare CALL right-hand side.
BIND_CALL = re.compile(
    r"^\s*(?:(?:let|const)\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[A-Za-z0-9_]+)?"
    r"\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*\("
)
# `let x = y.f` — a bare FIELD right-hand side, nothing after it.
BIND_FIELD = re.compile(
    r"^\s*(?:(?:let|const)\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[A-Za-z0-9_]+)?"
    r"\s*=\s*[A-Za-z_][A-Za-z0-9_]*\.([A-Za-z_][A-Za-z0-9_]*)\s*$"
)
# Any other single-target binding, which UNBINDS the name: `let x = 0`, `x = i + 1`.
BIND_ANY = re.compile(
    r"^\s*(?:(?:let|const)\s+)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*[^=]*)?\s*=(?!=)"
)

# A GUARD: the index compared against 0, -1, or any `.length`, either way round.
GUARD_L = re.compile(
    r"(?<![A-Za-z0-9_.])([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*"
    r"(?:<=|>=|<|>|==|!=)\s*(?:0(?![0-9.])|-\s*1\b|[A-Za-z_][A-Za-z0-9_.]*\.length\b)"
)
GUARD_R = re.compile(
    r"(?:(?<![A-Za-z0-9_.])0(?![0-9.])|-\s*1\b|[A-Za-z_][A-Za-z0-9_.]*\.length\b)\s*"
    r"(?:<=|>=|<|>|==|!=)\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)"
)

# A subscript read: `name[idx]` or `g.f[idx]`, the index a bare name or a `x.f` path.
# The lookbehind keeps `xs[i][j]`'s SECOND bracket and a `foo()[0]` out — an index
# whose base is itself an index or a call is a different question.
READ = re.compile(
    r"(?<![A-Za-z0-9_.\]\)])((?:[A-Za-z_][A-Za-z0-9_]*\.)?[A-Za-z_][A-Za-z0-9_]*)"
    r"\[\s*([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?)\s*\]"
)


def hole_fields(lines):
    """The module's own hole fields — every field it compares against 0 or -1."""
    out = set()
    for ln in lines:
        for m in HOLE_TEST.finditer(ln):
            out.add(m.group(1))
    return out


def module_maps(lines):
    """The module's own MAP globals. A map subscript cannot go out of bounds — a miss
    reads back null — so `m[k]` is not this rule's shape however the key arrived, and
    24 of the tree's hits were one before this exclusion (docs/internals/sentinel-index-lint.md)."""
    out = set()
    for ln in lines:
        m = MAP_GLOBAL.match(ln)
        if m:
            out.add(m.group(1))
    return out


def header_end(lines, lo, hi):
    """The last line of the function's header: the first one holding the `{` that opens
    the body. `vl fmt` wraps a long parameter list, so a header is not one line and a
    parameter can be declared on a continuation line."""
    for i in range(lo, hi + 1):
        if "{" in lines[i]:
            return i
    return lo


def header_names(lines, lo, hi, pat):
    """Every name `pat` matches in the header, from the `(` on the first line through the
    line that opens the body."""
    out = set()
    for i in range(lo, header_end(lines, lo, hi) + 1):
        s = lines[i]
        if i == lo:
            k = s.find("(")
            if k < 0:
                continue
            s = s[k:]
        for m in pat.finditer(s):
            out.add(m.group(1))
    return out


def declared_in(lines, lo, hi):
    """Every name the function DECLARES: its parameters and its `let`/`const`/`for`
    bindings. A subscript base among these is not a table — see the rule."""
    out = header_names(lines, lo, hi, PARAMS)
    for i in range(lo, hi + 1):
        m = DECL.match(lines[i]) or FOR_IN.match(lines[i])
        if m:
            out.add(m.group(1))
    return out


def i32_params(lines, lo, hi):
    return header_names(lines, lo, hi, I32_PARAM)


def module_readers(lines, fns):
    """The MODULE's readers: a function with a literal `-1` answer, plus the fixpoint
    of "returns a reader's result". Scoped to the module because the lint sees one, and
    used ONLY to decide whether a function is entitled to a caller's bad index (see
    the parameter arm below) — never to filter a producer."""
    out = {nm for nm, lo, hi in fns if any(NEG_ANSWER.search(l) for l in lines[lo:hi + 1])}
    for _ in range(4):
        add = set()
        for nm, lo, hi in fns:
            if nm in out:
                continue
            for i in range(lo, hi + 1):
                m = RET_CALL.search(lines[i]) or TAIL_CALL.match(lines[i])
                if m and m.group(1) in out:
                    add.add(nm)
                    break
        if not add:
            break
        out |= add
    return out


class Hit:
    __slots__ = ("rel", "fn", "line", "col", "table", "idx", "producer", "code")

    def __init__(self, rel, fn, line, col, table, idx, producer, code):
        self.rel, self.fn, self.line, self.col = rel, fn, line, col
        self.table, self.idx, self.producer, self.code = table, idx, producer, code

    def key(self):
        return f"{self.rel}:{self.fn}"


def hits_in(rel, src):
    """Every hit in one module's source. ONE pass per function: guards and bindings
    are read as the lines go by, so a guard counts only where it PRECEDES the read
    (the same linear approximation of dominance `arenaScanLint` makes — a guard in an
    `else` arm marks the name, which is a false NEGATIVE and the safe direction)."""
    lines = [strip_line(ln) for ln in src.split("\n")]
    holes = hole_fields(lines)
    maps = module_maps(lines)
    fns = functions(lines)
    readers_here = module_readers(lines, fns)
    out = []
    for fn, lo, hi in fns:
        local = declared_in(lines, lo, hi)
        params = i32_params(lines, lo, hi) if fn in readers_here else set()
        producer = {}   # name -> (kind, producer text); kind is "call"/"field"/"param"
        guarded = set()
        returned = False
        for i in range(lo, hi + 1):
            s = lines[i]
            for g in list(GUARD_L.finditer(s)) + list(GUARD_R.finditer(s)):
                guarded.add(g.group(1))
            for m in READ.finditer(s):
                table, idx = m.group(1), m.group(2)
                if table.split(".")[0] in local or table in maps or idx in guarded:
                    continue
                if "." in idx:
                    if idx.split(".")[1] not in holes:
                        continue
                    kind, prod = "field", idx
                elif idx in producer:
                    kind, prod = producer[idx]
                elif returned and idx in params:
                    kind, prod = "param", f"the parameter `{idx}`"
                else:
                    continue
                code = STRICT if kind == "call" and prod.endswith("Strict") else UNGUARDED
                # 1-based line AND column, the way `vl check` reports one — the lint's
                # own `lintEmitAtPos` takes a 0-based column and the CLI adds the one.
                out.append(Hit(rel, fn, i + 1, m.start() + 1, table, idx, prod, code))
            if RETURNS.search(s):
                returned = True
            mc = BIND_CALL.match(s)
            mf = BIND_FIELD.match(s)
            ma = BIND_ANY.match(s)
            if mc:
                producer[mc.group(1)] = ("call", mc.group(2))
                guarded.discard(mc.group(1))
                params.discard(mc.group(1))
            elif mf and mf.group(2) in holes:
                producer[mf.group(1)] = ("field", mf.group(0).split("=", 1)[1].strip())
                guarded.discard(mf.group(1))
                params.discard(mf.group(1))
            elif ma:
                producer.pop(ma.group(1), None)
                guarded.discard(ma.group(1))
                params.discard(ma.group(1))
    return out


def all_hits():
    out = []
    for rel, path in sources():
        out.extend(hits_in(rel, read_source(path)))
    return out


def readers():
    """{name: why} for every function the tree shows answering IN BAND.

    Three tells, all read from the source: a literal `-1` answer on some path; being
    the non-strict sibling of a `*Strict` twin (that twin's existence IS the record
    that this one clamps); and being a `*Strict` twin itself, whose contract is that
    -1 is a real answer.

    REPORTING ONLY. The rule does NOT filter its hits through this set, and the
    reason is measured: `checkNode` — D1462's producer, and #2498's — is in none of
    the three, because it launders `TyArray.aElem`'s hole four hops down and carries
    no `-1` of its own. Filtering on the set drops two of the five controls."""
    fns, bodies = set(), {}
    for rel, path in sources():
        lines = [strip_line(ln) for ln in read_source(path).split("\n")]
        for fn, lo, hi in functions(lines):
            fns.add(fn)
            bodies[fn] = (rel, lines[lo:hi + 1])
    out = {}
    for fn, (rel, body) in sorted(bodies.items()):
        if any(NEG_ANSWER.search(ln) for ln in body):
            out[fn] = (rel, "answers a literal -1")
    for fn in sorted(fns):
        if fn.endswith("Strict") and fn[:-6] in fns:
            out.setdefault(fn, (bodies[fn][0], "a *Strict twin: -1 is its documented answer"))
            out[fn[:-6]] = (bodies[fn[:-6]][0],
                            "has a *Strict twin, so this one CLAMPS a miss to a real row")
    return out


# ── front ends ───────────────────────────────────────────────────────────────
def cmd_readers(with_hits):
    rd = readers()
    print(f"{len(rd)} readers derived from compiler/*.vl\n")
    if with_hits:
        used = {}
        for h in all_hits():
            if h.producer in rd:
                used[h.producer] = used.get(h.producer, 0) + 1
        print(f"{len(used)} of them produce an UNGUARDED index somewhere:\n")
        for fn, n in sorted(used.items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"  {n:>4}  {fn:<34}{rd[fn][0]}  — {rd[fn][1]}")
        return 0
    for fn, (rel, why) in sorted(rd.items()):
        print(f"  {fn:<40}{rel:<28}{why}")
    return 0


def cmd_holes():
    for rel, path in sources():
        h = sorted(hole_fields([strip_line(x) for x in read_source(path).split("\n")]))
        if h:
            print(f"{rel}  ({len(h)})\n    {' '.join(h)}")
    return 0


def cmd_tables():
    for rel, path in sources():
        seen = {}
        for h in hits_in(rel, read_source(path)):
            seen[h.table] = seen.get(h.table, 0) + 1
        if seen:
            print(f"{rel}")
            for t, n in sorted(seen.items(), key=lambda kv: (-kv[1], kv[0])):
                print(f"    {n:>4}  {t}")
    return 0


def cmd_table(limit, code):
    n = 0
    for h in all_hits():
        if code and h.code != code:
            continue
        print(f"{h.rel}:{h.line}  {h.fn}  {h.table}[{h.idx}]  <- {h.producer}"
              + ("" if h.code == UNGUARDED else f"  [{h.code}]"))
        n += 1
        if limit and n >= limit:
            break
    return 0


def main():
    global ROOT
    args = sys.argv[1:]
    if "--root" in args:
        ROOT = args[args.index("--root") + 1]
    if "--readers" in args:
        return cmd_readers("--hits" in args)
    if "--holes" in args:
        return cmd_holes()
    if "--tables" in args:
        return cmd_tables()
    limit = 0
    if "--limit" in args:
        limit = int(args[args.index("--limit") + 1])
    code = ""
    if "--code" in args:
        code = args[args.index("--code") + 1]
    return cmd_table(limit, code)


if __name__ == "__main__":
    sys.exit(main())
