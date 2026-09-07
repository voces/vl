#!/usr/bin/env python3
"""The REP-CLASSIFIER census — the discovery instrument behind the "one rep per node"
campaign (`docs/internals/rep-descriptor-campaign.md`).

A REP CLASSIFIER is a function in the emitter that answers *"what representation does
this value have?"* by walking a ladder. Two properties, both derived from the tree,
never hand-listed:

  LADDER   the body tests one subject against >= 2 members of a closed rep vocabulary —
           `is Ty*` over the arena's eleven variants, `is <NodeKind>` over the AST,
           a `VKind` string literal, a `match` over either, or the PREDICATE form
           (`retNulRefFlag(...)`, `nameIsMap(...)`) where no kind literal appears at all.
  REP-ISH  the ANSWER is a representation: a `VKind`, an interned slot / heap-type
           index, a name used as a table key, or a boolean naming a rep family.

The floor of 2 arms is `ladder-census.py`'s, and for the same measured reason (D1370's
two-arm hole); `--min N` moves it.

Why the census exists: the campaign's claim is that these functions are many producers
of ONE fact, and that they disagree. Counting them is the first half; the `reads`
column is the second, because "only the name knows" was refuted five times — a
classifier that reads the ARENA and one that reads a SPELLING can be the same answer
computed two ways, and that pair is where the disagreement lives.

Sections:

  (default)  the classifier table — one row per classifier, sorted by call sites
  --summary  the tallies only (what the campaign doc quotes)
  --reads X  only classifiers whose `reads` set contains X (ARENA/NAME/SPELLING/TABLE/FRAME)
  --why F    why function F was included or excluded, rung by rung
  --json     the whole table as JSON, for a doc or a diff

Scope is `compiler/emit_*.vl` + `compiler/wasmEmit.vl` — the emitter. `typecheck.vl`
holds classifiers too (`nodeArrayElemName`, `pinResolvedFnTy`), but they are the
CHECKER's answers and the campaign converts the emitter's; `--all-compiler` widens it.
"""

import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

EMIT_ONLY = ("wasmEmit.vl",)
MIN_ARMS = 2


# ── source ───────────────────────────────────────────────────────────────────
def read_source(path):
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def sources(all_compiler=False):
    p = os.path.join(ROOT, "compiler")
    for name in sorted(os.listdir(p)):
        if not name.endswith(".vl"):
            continue
        if not all_compiler:
            if not (name.startswith("emit_") or name in EMIT_ONLY):
                continue
        yield f"compiler/{name}", os.path.join(p, name)


def all_compiler_sources():
    p = os.path.join(ROOT, "compiler")
    for name in sorted(os.listdir(p)):
        if name.endswith(".vl"):
            yield f"compiler/{name}", os.path.join(p, name)


def strip_line(ln):
    """`ln` cut at its `//` comment, with every string literal's CONTENT blanked to
    `x` and the quotes kept. Length-preserving, so a `{` inside a literal never
    confuses the brace walk. Same routine as `ladder-census.py`'s."""
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
    """`ln` cut at its `//` comment, literals INTACT — needed to read a `VKind`
    member's own text back out."""
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


# ── the closed vocabularies, read from the tree ──────────────────────────────
TYPE_HEAD = re.compile(r"^(?:export )?type ([A-Za-z_]\w*) = (.*)$")


def closed_set(name):
    """The members of `export type <name> = "a" | "b" | …`, read from wherever the
    compiler declares it. Never hard-coded: `VKind` grew `u8list` and `nulnone` after
    this campaign's first sketch, and a hard-coded list would have missed both."""
    for _, path in all_compiler_sources():
        lines = read_source(path).split("\n")
        for n, ln in enumerate(lines):
            m = TYPE_HEAD.match(ln)
            if not m or m.group(1) != name:
                continue
            rhs = cut_comment(m.group(2))
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
            return {p[1:-1] for p in parts if len(p) >= 2 and p[0] == '"' and p[-1] == '"'}
    return set()


def arena_variants():
    """The `Ty` arena's variant names — the members of `export type Ty = TyPrim | …`."""
    for _, path in all_compiler_sources():
        lines = read_source(path).split("\n")
        for n, ln in enumerate(lines):
            m = TYPE_HEAD.match(ln)
            if not m or m.group(1) != "Ty":
                continue
            rhs = cut_comment(m.group(2))
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
            return {p.strip() for p in rhs.split("|") if re.fullmatch(r"Ty\w*", p.strip())}
    return set()


STATE_TABLE = re.compile(r"^export let ([A-Za-z_]\w*)\s*:\s*[^=]*\[\]\s*=")
STATE_MAP = re.compile(r"^export let ([A-Za-z_]\w*)\s*:\s*\{\[")


def state_tables():
    """Every module-level PARALLEL TABLE the emitter keys a rep off — the exported
    `let x: T[] = []` / `let x: {[…]: …}` of `emit_state.vl`. A classifier reading one
    of these is answering from a TABLE COLUMN, which is a different producer from the
    arena even when both are right."""
    out = set()
    path = os.path.join(ROOT, "compiler", "emit_state.vl")
    for ln in read_source(path).split("\n"):
        m = STATE_TABLE.match(ln) or STATE_MAP.match(ln)
        if m:
            out.add(m.group(1))
    return out


# ── functions ────────────────────────────────────────────────────────────────
FN_HEAD = re.compile(r"^(?:export )?function ([A-Za-z_]\w*)\s*[(<]")


def fn_end(lines, lo, hi):
    depth, opened = 0, False
    for n in range(lo, hi + 1):
        for ch in strip_line(lines[n]):
            if ch == "{":
                depth += 1
                opened = True
            elif ch == "}":
                depth -= 1
        if opened and depth <= 0:
            return n
    return hi


def functions(lines):
    heads = [(i, m.group(1)) for i, ln in enumerate(lines) for m in [FN_HEAD.match(ln)] if m]
    out = []
    for k, (i, name) in enumerate(heads):
        end = fn_end(lines, i, len(lines) - 1)
        if k + 1 < len(heads):
            end = min(end, heads[k + 1][0] - 1)
        while end > i and lines[end].strip() == "":
            end -= 1
        out.append((name, i, end))
    return out


def signature(lines, lo, hi):
    """The header text from `function` to the opening `{` of the body — several lines
    when the parameter list wraps."""
    buf = []
    for n in range(lo, min(hi, lo + 12) + 1):
        s = cut_comment(lines[n])
        buf.append(s)
        if "{" in strip_line(s):
            break
    txt = " ".join(buf)
    b = txt.find("{")
    return txt[:b] if b >= 0 else txt


RET_TY = re.compile(r"\)\s*:\s*([^{]+?)\s*\{?\s*$")


def declared_return(sig):
    """The declared return type of a signature, or `""` when it is inferred. Reads the
    LAST `):` in the header so a function-typed parameter's own `: T` never wins."""
    b = sig.rfind(")")
    if b < 0:
        return ""
    tail = sig[b:]
    m = RET_TY.match(tail)
    return m.group(1).strip() if m else ""


# ── ladder detection ─────────────────────────────────────────────────────────
IS_TEST = re.compile(r"\bis\s+([A-Z]\w*)")
CALL = re.compile(r"\b([a-z]\w*)\s*\(")
LIT = re.compile(r'"([^"\\]*)"')
MATCH_ARM = re.compile(r"^\s*(?:[A-Za-z_]\w*|\"[^\"]*\"|_)\s*=>")

# The PREDICATE ladder form: no kind literal appears, so nothing that greps for one
# can see it. These are the emitter's own rep-question prefixes, derived by shape
# rather than listed: a call whose name starts one of these and ends in a rep noun.
PRED_HEAD = re.compile(
    r"^(?:nameIs|tyIs|annIs|nodeTyIs|nodeIs|exprIs|is[A-Z]|ret[A-Z]\w*Flag$|"
    r"[a-z]\w*Flag$|[a-z]\w*IsClosure|[a-z]\w*IsRef)"
)

REP_NOUNS = (
    "closure", "clo", "ref", "box", "list", "arr", "array", "map", "union", "struct",
    "nullable", "nul", "variant", "str", "atom", "niche", "elem", "heap", "slot",
    "kind", "rep", "valtype", "shape", "tag", "sig", "litunion", "prim", "scalar",
    "obj", "field", "u8", "i64", "f64", "f32", "i32",
)


def has_rep_noun(name):
    low = name.lower()
    return any(n in low for n in REP_NOUNS)


SLOT_SUFFIX = ("slot", "idx", "index", "code", "tag", "shape", "kind", "row", "heap")
NAME_SUFFIX = ("name", "key", "tok", "elem", "text", "spelling")

CAMEL = re.compile(r"[A-Z]?[a-z0-9]+")


def has_segment(fname, words):
    """True when one of `words` is a whole camelCase SEGMENT of `fname`, not merely a
    substring of one. `unionNameOfExpr` carries `Name` in the middle and is a rep-name
    producer; an `endswith` test misses it, and a bare `in` test would claim
    `nameStripSpaces`. Measured: the segment rule admits 14 mid-name producers the
    suffix rule dropped, `unionNameOfExpr` among them."""
    segs = {s.lower() for s in CAMEL.findall(fname)}
    return any(w in segs for w in words)


def result_class(fname, sig, body_raw, vkinds):
    """What KIND of rep answer this function hands back, or `""`.

    Five shapes, in the order they are decided. Each is the evidence for "this is a
    representation, not an arbitrary value" — the campaign's descriptor has a field for
    every one of them, which is the point."""
    ret = declared_return(sig)
    low = fname.lower()
    if "VKind" in ret:
        return "VKIND"
    # A function whose RETURNS are `VKind` members, with the return type inferred —
    # the tail-expression form VL uses everywhere (`"i32"` as the last line).
    lits = set()
    for ln in body_raw:
        for m in LIT.finditer(cut_comment(ln)):
            lits.add(m.group(1))
    if len(lits & vkinds) >= 2:
        return "VKIND-LIT"
    if ret in ("i32", "i32 | null") or (ret == "" and any(
        re.search(r"^\s*(return\s+)?-?\d+\s*$", strip_line(ln)) for ln in body_raw
    )):
        if has_segment(fname, SLOT_SUFFIX):
            return "SLOT"
        if low.endswith("flag") and has_rep_noun(fname):
            return "REPBOOL"
    if ret in ("boolean", "boolean | null") or (ret == "" and any(
        re.search(r"^\s*(return\s+)?(true|false)\s*$", strip_line(ln)) for ln in body_raw
    )):
        if has_rep_noun(fname):
            return "REPBOOL"
    if ret in ("string", "string | null") or (ret == "" and any(
        re.search(r'^\s*(return\s+)?""\s*$', strip_line(ln)) for ln in body_raw
    )):
        if has_segment(fname, NAME_SUFFIX) and has_rep_noun(fname):
            return "REPNAME"
    return ""


def ladder_arms(body_stripped, body_raw, vkinds, variants):
    """(arms, shape) — how many rungs the widest ladder in this body has, and which of
    the four shapes it is. A function carrying two shapes is reported under its widest."""
    is_tys = set()
    is_nodes = set()
    for ln in body_stripped:
        for m in IS_TEST.finditer(ln):
            g = m.group(1)
            (is_tys if g in variants else is_nodes).add(g)
    lits = set()
    for ln in body_raw:
        for m in LIT.finditer(cut_comment(ln)):
            if m.group(1) in vkinds:
                lits.add(m.group(1))
    preds = set()
    for ln in body_stripped:
        for m in CALL.finditer(ln):
            n = m.group(1)
            if PRED_HEAD.match(n) and has_rep_noun(n):
                preds.add(n)
    marms = 0
    if any(re.search(r"\bmatch\b", ln) for ln in body_stripped):
        marms = sum(1 for ln in body_stripped if MATCH_ARM.match(ln))
    best = max(
        (len(is_tys), "ARENA-IS"),
        (len(is_nodes), "NODE-IS"),
        (len(lits), "VKIND-LIT"),
        (len(preds), "PREDICATE"),
        (marms, "MATCH"),
    )
    return best


# ── the reads column ─────────────────────────────────────────────────────────
ARENA_TELLS = ("T.tys[", "repOfTy(", "repOfNode(", "repTreeOfTy(", "nodeTyIxOf(",
               "resolveAnnot(", "nodeRepTyIxOf(", "T.tys.length", "repCanonId(",
               "repElemId(", "litBaseTy(", "primTyOfName(")
NAME_TELLS = ("nameIs", "tyNameOf(", ".tyName", "tyToStr(", "tyToEmitName(",
              "emitNameOfTy(", "renderTy(")
SPELL_TELLS = ("endsWith(", "startsWith(", "indexOf(", ".substring(", "splitUnionAtoms(",
               "nullablePartOf(", "peelGroupParens(", "nameStripSpaces(", "sliceStr(",
               'nulSuffix', "annGenAppSpanEnds(", "nameIsShapeSpanEnds(")
FRAME_TELLS = ("emitCurFnIx", "fnParent", "fnInstOrigin", "monoLamPinned",
               "monoLamShared", "callingFrame", "frameOf")
FRAME_PARAMS = ("fnIx", "fnPos", "fnIdx", "frame", "frameIx", "ownerFn", "curFn")


def callees_of(body_stripped, known):
    """The compiler functions this body calls, restricted to `known` — the call graph
    edge set the `--deep` closure walks."""
    out = set()
    for ln in body_stripped:
        for m in CALL.finditer(ln):
            if m.group(1) in known:
                out.add(m.group(1))
    return out


def reads_of(sig, body_stripped, tables):
    got = set()
    blob = "\n".join(body_stripped)
    if any(t in blob for t in ARENA_TELLS) or re.search(r"\bis\s+Ty[A-Z]", blob):
        got.add("ARENA")
    if any(t in blob for t in NAME_TELLS):
        got.add("NAME")
    if any(t in blob for t in SPELL_TELLS):
        got.add("SPELLING")
    for t in tables:
        if re.search(r"\b" + re.escape(t) + r"\s*[\[.]", blob):
            got.add("TABLE")
            break
    if any(t in blob for t in FRAME_TELLS):
        got.add("FRAME")
    else:
        for p in FRAME_PARAMS:
            if re.search(r"\b" + p + r"\s*:", sig):
                got.add("FRAME")
                break
    return got


# ── call sites ───────────────────────────────────────────────────────────────
def call_sites(names):
    """{name: n} — how many times each classifier is CALLED across `compiler/*.vl`.
    Its own header line and the `import { … }` lists are excluded: an import is not a
    consumer, and counting it would inflate every cross-module classifier by one per
    importing file."""
    out = {n: 0 for n in names}
    pat = {n: re.compile(r"(?<![\w.])" + re.escape(n) + r"\s*\(") for n in names}
    for _, path in all_compiler_sources():
        lines = read_source(path).split("\n")
        in_import = False
        for ln in lines:
            s = strip_line(ln)
            if s.startswith("import "):
                in_import = "}" not in s
                continue
            if in_import:
                if "}" in s:
                    in_import = False
                continue
            if FN_HEAD.match(s):
                # the header's own name is a definition, not a call; its PARAMETERS
                # may still call a default, so only the leading name is cut
                m = FN_HEAD.match(s)
                s = s[: m.start(1)] + " " * len(m.group(1)) + s[m.end(1):]
            for n, p in pat.items():
                out[n] += len(p.findall(s))
    return out


# ── the whole-compiler read map, for `--deep` ────────────────────────────────
def deep_reads(rows):
    """`reads` closed over the call graph of every `compiler/*.vl` function.

    The DIRECT column is the sharp one and stays the default, but it UNDERSTATES by
    construction: `vtKindOfType`'s first rung is `annRepKindOf`, which reads the arena,
    so the direct column calls the canonical arena-vs-name classifier NAME-only. The
    closure follows calls to a fixpoint and reports what a classifier's answer
    ultimately depends on. Read the two together: DIRECT says where the ladder itself
    looks, DEEP says which producers its answer is a function of."""
    tables = state_tables()
    body, edges, reads = {}, {}, {}
    for rel, path in all_compiler_sources():
        lines = read_source(path).split("\n")
        for name, lo, hi in functions(lines):
            stripped = [strip_line(x) for x in lines[lo:hi + 1]]
            sig = signature(lines, lo, hi)
            body[name] = (sig, stripped)
    known = set(body)
    for name, (sig, stripped) in body.items():
        reads[name] = reads_of(sig, stripped, tables)
        edges[name] = callees_of(stripped, known) - {name}
    changed = True
    rounds = 0
    while changed and rounds < 64:
        changed, rounds = False, rounds + 1
        for name in body:
            before = len(reads[name])
            for c in edges[name]:
                reads[name] |= reads[c]
            if len(reads[name]) != before:
                changed = True
    for r in rows:
        r["deep"] = sorted(reads.get(r["fn"], set()))
    return rows


# ── the census ───────────────────────────────────────────────────────────────
def census(min_arms, all_compiler):
    vkinds = closed_set("VKind")
    variants = arena_variants()
    tables = state_tables()
    rows = []
    considered = 0
    for rel, path in sources(all_compiler):
        lines = read_source(path).split("\n")
        for name, lo, hi in functions(lines):
            considered += 1
            raw = lines[lo:hi + 1]
            stripped = [strip_line(x) for x in raw]
            sig = signature(lines, lo, hi)
            arms, shape = ladder_arms(stripped, raw, vkinds, variants)
            res = result_class(name, sig, raw, vkinds)
            if res == "":
                continue
            # A DECLARED `VKind` return admits the function at any arm count: its answer
            # IS the rep, by the type. `retResultVKind` is the control — it carries one
            # `VKind` literal and three PRODUCERS (`vtKindOfType(fn.fnRet)`, the
            # `fnReturnsClosure` predicate, the `fRetKind` table), which is the exact
            # shape this census exists to find and which an arm count cannot see.
            if res != "VKIND" and arms < min_arms:
                continue
            if arms < min_arms:
                shape = "PROJECTION"
            rows.append({
                "fn": name,
                "at": f"{rel}:{lo + 1}",
                "file": rel,
                "arms": arms,
                "shape": shape,
                "result": res,
                "reads": sorted(reads_of(sig, stripped, tables)),
                "lines": hi - lo + 1,
            })
    sites = call_sites([r["fn"] for r in rows])
    for r in rows:
        r["callers"] = sites[r["fn"]]
    rows.sort(key=lambda r: (-r["callers"], r["fn"]))
    return rows, considered, vkinds, variants


def why(target, min_arms, all_compiler):
    vkinds = closed_set("VKind")
    variants = arena_variants()
    tables = state_tables()
    for rel, path in sources(all_compiler):
        lines = read_source(path).split("\n")
        for name, lo, hi in functions(lines):
            if name != target:
                continue
            raw = lines[lo:hi + 1]
            stripped = [strip_line(x) for x in raw]
            sig = signature(lines, lo, hi)
            arms, shape = ladder_arms(stripped, raw, vkinds, variants)
            res = result_class(name, sig, raw, vkinds)
            print(f"{target}  {rel}:{lo + 1}  ({hi - lo + 1} lines)")
            print(f"  signature      {sig.strip()}")
            print(f"  declared ret   {declared_return(sig) or '(inferred)'}")
            print(f"  ladder         {arms} arms, shape {shape}  (floor {min_arms})")
            print(f"  result class   {res or 'NOT REP-ISH'}")
            print(f"  reads          {', '.join(sorted(reads_of(sig, stripped, tables))) or '(none)'}")
            print(f"  verdict        {'CLASSIFIER' if arms >= min_arms and res else 'excluded'}")
            return 0
    print(f"{target}: no such top-level function in scope", file=sys.stderr)
    return 1


def print_summary(rows, considered, vkinds, variants, deep=False):
    col = "deep" if deep else "reads"
    print(f"population        {considered} top-level functions in scope")
    print(f"classifiers       {len(rows)}")
    print(f"call sites        {sum(r['callers'] for r in rows)}")
    print(f"vocabularies      VKind {len(vkinds)} members · Ty arena {len(variants)} variants")
    print()
    print("by result class")
    for k in ("VKIND", "VKIND-LIT", "SLOT", "REPNAME", "REPBOOL"):
        n = sum(1 for r in rows if r["result"] == k)
        c = sum(r["callers"] for r in rows if r["result"] == k)
        if n:
            print(f"  {k:<10} {n:>5} classifiers  {c:>6} call sites")
    print()
    print("by ladder shape")
    for k in ("ARENA-IS", "NODE-IS", "VKIND-LIT", "PREDICATE", "MATCH"):
        n = sum(1 for r in rows if r["shape"] == k)
        if n:
            print(f"  {k:<10} {n:>5}")
    print()
    print(f"by what it READS ({'transitively, --deep' if deep else 'DIRECTLY'}; "
          "a classifier may read several, so the sets are not disjoint)")
    for k in ("ARENA", "NAME", "SPELLING", "TABLE", "FRAME"):
        n = sum(1 for r in rows if k in r[col])
        c = sum(r["callers"] for r in rows if k in r[col])
        print(f"  {k:<10} {n:>5} classifiers  {c:>6} call sites")
    print()
    print("the pairs that matter — a rep answered from two different producers")
    for a, b in (("ARENA", "NAME"), ("ARENA", "SPELLING"), ("ARENA", "TABLE"),
                 ("NAME", "TABLE"), ("ARENA", "FRAME")):
        n = sum(1 for r in rows if a in r[col] and b in r[col])
        print(f"  {a} + {b:<9} {n:>5}")
    print()
    print("by file")
    files = {}
    for r in rows:
        files.setdefault(r["file"], [0, 0])
        files[r["file"]][0] += 1
        files[r["file"]][1] += r["callers"]
    for f in sorted(files, key=lambda f: -files[f][0]):
        print(f"  {f:<28} {files[f][0]:>4} classifiers  {files[f][1]:>6} call sites")


def print_table(rows, deep=False):
    col = "deep" if deep else "reads"
    print(f"{'classifier':<38} {'at':<28} {'arms':>4} {'shape':<10} "
          f"{'result':<10} {'callers':>7}  {col}")
    for r in rows:
        print(f"{r['fn']:<38} {r['at']:<28} {r['arms']:>4} {r['shape']:<10} "
              f"{r['result']:<10} {r['callers']:>7}  {'+'.join(r[col])}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--min", type=int, default=MIN_ARMS, help="ladder arm floor")
    ap.add_argument("--summary", action="store_true", help="tallies only")
    ap.add_argument("--reads", help="only classifiers reading this producer")
    ap.add_argument("--why", help="explain one function's inclusion, rung by rung")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--deep", action="store_true",
                    help="close the reads column over the call graph")
    ap.add_argument("--all-compiler", action="store_true",
                    help="widen scope from the emitter to every compiler/*.vl")
    a = ap.parse_args()

    if a.why:
        return why(a.why, a.min, a.all_compiler)

    rows, considered, vkinds, variants = census(a.min, a.all_compiler)
    if a.deep or a.json:
        deep_reads(rows)
    if a.reads:
        col = "deep" if a.deep else "reads"
        rows = [r for r in rows if a.reads.upper() in r[col]]
    if a.json:
        json.dump({"considered": considered, "rows": rows}, sys.stdout, indent=1)
        print()
        return 0
    print_summary(rows, considered, vkinds, variants, a.deep)
    if not a.summary:
        print()
        print_table(rows, a.deep)
    return 0


if __name__ == "__main__":
    sys.exit(main())
