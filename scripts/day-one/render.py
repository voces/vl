#!/usr/bin/env python3
"""Turn a plan + a set of AXIS FACES into one ordinary VL program.

The unit of generation is a PAIR: `plan_pair` picks a plan and one axis to vary, and
renders the same program twice with that axis's face flipped and EVERY OTHER axis held
identical. That is what makes a disagreement self-validating — the spelling that RUNS
proves the other one is legal, so a hit needs no judgement about what the design permits.

Substitution is `str.replace`, never `str.format`: half the grammar's spellings contain
braces (`{[string]: i32}`, `{ name: "ada" }`) and `format` would eat them.
"""
import difflib
import random

import grammar as G
import modules as M

IND = "  "

# Grammar ids the caller has asked the sampler to stop drawing. A single broken
# neighbour or value floods a sample with one mechanism and hides everything behind
# it, so a discovery run needs to be able to look PAST a hit it has already named.
EXCLUDE = set()


def _weighted(rng, items):
    items = [i for i in items if i["id"] not in EXCLUDE]
    if not items:
        return None
    return rng.choices(items, weights=[i.get("weight", 1) for i in items])[0]


def _ty(val, named):
    return val["named"] if named else val["inline"]


def _arr(ty):
    """`T[]` binds tighter than `|` and `=>`, so an un-parenthesised `i32 | null[]`
    is a DIFFERENT type. The generator writing one is the generator's bug, and it
    reached the first sample as a check reject that read like a finding."""
    return ("(" + ty + ")[]") if ("|" in ty or "=>" in ty) else ty + "[]"


# --------------------------------------------------------------------------- plans

def applicable_axes(plan):
    """Which axes this plan can vary. An axis that cannot apply is NOT exercised —
    the summary must be able to tell that apart from an axis that found nothing."""
    val, pos, read = plan["value"], plan["position"], plan["read"]
    out = []
    for ax in G.AXES:
        if ax.get("generator"):
            # A generator axis brings its own grammar; a plan cannot vary it.
            continue
        need = ax.get("needs")
        if need == "decls" and not val["decls"]:
            continue
        if need == "narrow_group" and len(_narrow_group(val, read)) < 2:
            continue
        if need == "fusible" and not _fusible(pos, read):
            continue
        if need == "pinnable" and pos["id"] == "assignment":
            continue
        if need == "free_scope" and (pos["wraps"] or pos.get("fixed_scope")):
            continue
        if need == "assignable" and not (val["alt"] and pos["id"] in ASSIGNABLE):
            continue
        out.append(ax)
    return out


# Positions whose destination is a BINDING, so `const v = e` has a
# `let v = <literal>` / `v = e` twin. An argument or a list element has no such twin.
ASSIGNABLE = ("binding", "global_init", "closure_capture")


def _fusible(pos, read):
    """A read that mentions the value TWICE cannot be fused onto its producer: the
    producer would run twice, and a narrowing is a fact about a PLACE, so `if make()
    is Rect { make().w }` is refused by design and is not a finding about fusion."""
    if sum(l.count("{v}") for l in read["lines"]) != 1:
        return False
    return pos["id"] in ("binding", "return", "struct_field", "list_element",
                         "map_value")


def _narrow_group(val, read):
    """Reads of `val` that print exactly what `read` prints — the same test, spelled
    differently. `is Rect` and `== "rect"` are one group; `.kind` is not in it."""
    if "narrow" not in read:
        return []
    return [r for r in val["reads"] if "narrow" in r and r["want"] == read["want"]]


def pick_plan(rng, axis_id=None):
    """A plan is the program; the axis is what the pair varies about it."""
    for _ in range(200):
        val = _weighted(rng, G.VALUES)
        pos = _weighted(rng, G.POSITIONS)
        if val is None or pos is None:
            return None
        read = _weighted(rng, [dict(r, weight=1) for r in val["reads"]])
        if read is None:
            continue
        if pos["id"] == "map_value" and (val["alt"] is None or
                                         "nullable" in val["features"]):
            continue
        sc = _weighted(rng, [dict(s, weight=1) for s in G.SCENERY])
        src = _weighted(rng, G.SOURCES)
        if sc is None or src is None:
            return None
        if src.get("needs_alt") and not val["alt"]:
            continue
        if src.get("no_nullable") and "nullable" in val["features"]:
            continue
        plan = {"value": val, "read": read, "position": pos, "scenery": sc,
                "source": src}
        axes = applicable_axes(plan)
        if not axes:
            continue
        if axis_id is not None and axis_id not in [a["id"] for a in axes]:
            continue
        plan["axes"] = axes
        return plan
    return None


def base_faces(rng, plan, axis):
    """Every axis's face, held identical across the pair except the one under test."""
    val, pos = plan["value"], plan["position"]
    f = {
        "named_vs_inline": "named",
        "annotated_vs_inferred": rng.choice(["annotated", "inferred"]),
        "narrowing": plan["read"]["id"],
        "fusion": "bound",
        "pinning": rng.choices(["direct", "generic", "hole"], weights=[6, 2, 2])[0],
        "scope": pos.get("fixed_scope") or ("module" if pos["wraps"]
                                            else _weighted(rng, G.SCOPES)["id"]),
        "scenery": rng.choice(["bare", "neighbour"]),
        "init_vs_assign": "init",
    }
    if plan["read"].get("named_only"):
        f["named_vs_inline"] = "named"
    if _fusible(pos, plan["read"]):
        f["fusion"] = rng.choice(["fused", "bound"])
    for k, v in (axis.get("pins") or {}).items():
        f[k] = v
    # A `let` seeded with a literal only INFERS the right type for some values: `let v =
    # null` is not a `Rec | null`. Where it does not, the pair annotates rather than
    # silently comparing two different programs.
    if axis["id"] == "init_vs_assign" and not val.get("alt_infers"):
        f["annotated_vs_inferred"] = "annotated"
    return f


def flip(rng, plan, axis, faces):
    """The pair's two faces of `axis`, as (faceA, faceB)."""
    aid = axis["id"]
    if aid == "narrowing":
        group = _narrow_group(plan["value"], plan["read"])
        a, b = rng.sample([r["id"] for r in group], 2)
        return a, b
    if aid == "scope":
        opts = [s["id"] for s in G.SCOPES]
        return tuple(rng.sample(opts, 2))
    if aid == "pinning":
        return "direct", rng.choice(["generic", "hole"])
    if aid == "named_vs_inline" and plan["read"].get("named_only"):
        # ASYMMETRIC: `is Rect` has no inline twin. Grade the twinless spelling
        # against the nearest legal one — on RUNS-ness, not on output.
        return "named", "inline"
    return axis["faces"][0], axis["faces"][1]


def plan_pair(rng, axis_id=None):
    """(plan, axis, facesA, facesB) — one program, two spellings, one axis apart."""
    plan = pick_plan(rng, axis_id)
    if plan is None:
        return None
    axes = plan["axes"]
    axis = (next(a for a in axes if a["id"] == axis_id) if axis_id
            else _weighted(rng, axes))
    fa = base_faces(rng, plan, axis)
    va, vb = flip(rng, plan, axis, fa)
    fb = dict(fa)
    fa[axis["id"]] = va
    fb[axis["id"]] = vb
    if axis["id"] == "named_vs_inline" and plan["read"].get("named_only"):
        # The inline face cannot spell `is Rect`; it reads the nearest legal read.
        fb["narrowing"] = _nearest_legal_read(plan["value"], plan["read"])
        if fb["narrowing"] is None:
            return None
    return plan, axis, fa, fb


def _nearest_legal_read(val, read):
    for r in val["reads"]:
        if not r.get("named_only"):
            return r["id"]
    return None


# ------------------------------------------------------------------------- render

def render(plan, faces):
    """(source, want) for one face of the pair."""
    val, pos = plan["value"], plan["position"]
    read = next(r for r in val["reads"] if r["id"] == faces["narrowing"])
    named = faces["named_vs_inline"] == "named"
    ann = faces["annotated_vs_inferred"] == "annotated"
    ty = _ty(val, named)

    head, decls, stmts = [], [], []
    if faces["scenery"] == "neighbour":
        (head if plan["scenery"].get("is_import") else decls).extend(
            plan["scenery"]["lines"])
    if named:
        decls.extend("type %s = %s" % (n, r) for n, r in val["decls"])

    expr = val["expr"]
    if expr is None:
        decls.append("function mkval(): " + ty + " {")
        decls.extend(IND + l.replace("{T}", ty) for l in val["mk"])
        decls.append("}")
        expr = "mkval()"

    if faces["pinning"] == "generic":
        decls.append("function pass<T>(x: T): T { return x }")
        expr = "pass(" + expr + ")"
    elif faces["pinning"] == "hole":
        decls.append("function passh(x) { return x }")
        expr = "passh(" + expr + ")"

    body = _deliver(plan, faces, ty, expr, read, ann, decls, stmts)
    src = head + decls + body
    return "\n".join(l for l in src if l is not None) + "\n", read["want"]


def _read_lines(read, var):
    return [l.replace("{v}", var) for l in read["lines"]]


def _bind(stmts, ty, ann, producer, name="v"):
    stmts.append("const %s%s = %s" % (name, ": " + ty if ann else "", producer))
    return name


def _par(ty):
    """`(i32) => i32 | null` parses as an arrow RETURNING a nullable, so a function
    type needs its own parentheses before `| null` is appended."""
    return ("(" + ty + ")") if "=>" in ty else ty


def _source(plan, faces, ty, expr, ann, decls, into):
    """Where the value COMES FROM — a literal, a call, a field, an index, a map read,
    a `??`. Not interchangeable at the emitter, which is why it is its own dimension."""
    sid = plan["source"]["id"]
    alt = plan["value"]["alt"]
    if sid == "call":
        decls.append("function srcOf(): %s { return %s }" % (ty, expr))
        return "srcOf()"
    if sid == "index":
        into.append("const srcArr%s = [%s]" % (": " + _arr(ty) if ann else "", expr))
        return "srcArr[0]"
    if sid == "field":
        into.append("const srcBox%s = { it: %s }" %
                    (": { it: " + ty + " }" if ann else "", expr))
        return "srcBox.it"
    if sid == "map_read":
        into.append("const srcMap%s = Map()" %
                    (": {[string]: " + ty + "}" if ann else ""))
        into.append('srcMap["k"] = ' + expr)
        return '(srcMap["k"] ?? ' + alt + ")"
    if sid == "coalesce":
        into.append("const srcOpt: %s | null = %s" % (_par(ty), expr))
        return "(srcOpt ?? " + alt + ")"
    return expr


def _deliver(plan, faces, ty, expr, read, ann, decls, stmts):
    """Statements for the chosen position, wrapped in the chosen scope."""
    pid = plan["position"]["id"]
    fused = faces["fusion"] == "fused"
    val = plan["value"]
    assign = faces.get("init_vs_assign") == "assign"
    # The source's setup has to be in scope where the EXPRESSION is used. `return` puts
    # it inside a module-level helper, so its setup belongs beside that helper and not
    # in the scoped statement block — a `srcArr` declared in the block and read from a
    # module-level `make()` is `undeclared identifier`, not a finding.
    into = decls if (pid in ("argument", "global_init", "return")) else stmts
    expr = _source(plan, faces, ty, expr, ann, decls, into)

    if pid == "argument":
        decls.append("function take(p%s) {" % (": " + ty if ann else ""))
        decls.extend(IND + l for l in _read_lines(read, "p"))
        decls.append("}")
        return ["take(" + expr + ")"]

    if pid == "global_init":
        if assign:
            decls.append("let gv%s = %s" % (": " + ty if ann else "", val["alt"]))
            decls.append("gv = " + expr)
        else:
            decls.append("const gv%s = %s" % (": " + ty if ann else "", expr))
        decls.append("function go() {")
        decls.extend(IND + l for l in _read_lines(read, "gv"))
        decls.append("}")
        return ["go()"]

    if pid == "binding":
        if assign:
            stmts.append("let v%s = %s" % (": " + ty if ann else "", val["alt"]))
            stmts.append("v = " + expr)
            var = "v"
        else:
            var = expr if fused else _bind(stmts, ty, ann, expr)
    elif pid == "return":
        decls.append("function make()%s { return %s }" % (": " + ty if ann else "",
                                                          expr))
        var = "make()" if fused else _bind(stmts, ty, ann, "make()")
    elif pid == "assignment":
        stmts.append("let v%s = %s" % (": " + ty if ann else "", expr))
        stmts.append("v = " + expr)
        var = "v"
    elif pid == "struct_field":
        stmts.append("const box%s = { item: %s }" %
                     (": { item: " + ty + " }" if ann else "", expr))
        var = "box.item" if fused else _bind(stmts, ty, ann, "box.item")
    elif pid == "list_element":
        stmts.append("const arr%s = [%s]" % (": " + _arr(ty) if ann else "", expr))
        var = "arr[0]" if fused else _bind(stmts, ty, ann, "arr[0]")
    elif pid == "map_value":
        stmts.append("const tbl%s = Map()" %
                     (": {[string]: " + ty + "}" if ann else ""))
        stmts.append('tbl["k"] = ' + expr)
        got = '(tbl["k"] ?? ' + val["alt"] + ")"
        var = got if fused else _bind(stmts, ty, ann, got)
    elif pid == "closure_capture":
        if assign:
            stmts.append("let held%s = %s" % (": " + ty if ann else "", val["alt"]))
            stmts.append("held = " + expr)
        else:
            _bind(stmts, ty, ann, expr, "held")
        stmts.append("const get = () => held")
        var = _bind(stmts, ty, ann, "get()")
    else:
        raise ValueError(pid)

    stmts.extend(_read_lines(read, var))
    return _scope(faces["scope"], stmts, decls)


def _while(stmts):
    """A one-iteration `while` — the shape the first external consumer wrote."""
    return (["let i = 0", "while i < 1 {"] + [IND + s for s in stmts] +
            [IND + "i = i + 1", "}"])


def _scope(scope, stmts, decls):
    if scope == "module":
        return stmts
    if scope == "module_block":
        return ["if true {"] + [IND + s for s in stmts] + ["}"]
    if scope == "module_while":
        return _while(stmts)
    inner = stmts
    if scope == "fn_block":
        inner = ["if true {"] + [IND + s for s in stmts] + ["}"]
    elif scope == "fn_while":
        inner = _while(stmts)
    decls.append("function go() {")
    decls.extend(IND + s for s in inner)
    decls.append("}")
    return ["go()"]


# -------------------------------------------------------------------------- delta

def delta(axis, fa, fb, plan, srcA, srcB):
    """WHAT THE PAIR VARIED, concretely. An `agree` with no delta recorded is an
    unfalsifiable result: it cannot be told from an axis the sample never reached."""
    lines = [l for l in difflib.unified_diff(
        srcA.splitlines(), srcB.splitlines(), lineterm="", n=0)
        if l[:1] in "+-" and l[:3] not in ("---", "+++")]
    return {
        "axis": axis["id"],
        "faceA": fa[axis["id"]], "faceB": fb[axis["id"]],
        "value": plan["value"]["id"], "read": plan["read"]["id"],
        "position": plan["position"]["id"], "scope": fa["scope"],
        "held": {k: v for k, v in fa.items() if k != axis["id"]},
        "diff": lines[:12],
    }


def spec_of(plan):
    """The plan as ids, so a saved sample can be RE-RENDERED — that is what lets the
    minimiser ablate by axis instead of only by line."""
    return {"value": plan["value"]["id"], "read": plan["read"]["id"],
            "position": plan["position"]["id"], "scenery": plan["scenery"]["id"],
            "source": plan["source"]["id"]}


def plan_of(spec):
    val = next(v for v in G.VALUES if v["id"] == spec["value"])
    return {"value": val,
            "read": next(r for r in val["reads"] if r["id"] == spec["read"]),
            "position": next(p for p in G.POSITIONS if p["id"] == spec["position"]),
            "scenery": next(s for s in G.SCENERY if s["id"] == spec["scenery"]),
            "source": next(s for s in G.SOURCES
                           if s["id"] == spec.get("source", "literal"))}


def render_spec(spec, faces):
    return render(plan_of(spec), faces)


# Axes with a grammar of their own, keyed by the `generator` their record names.
GENERATORS = {"modules": M.make_pair}


def _generator_axes():
    return [a for a in G.AXES if a.get("generator") and a["id"] not in EXCLUDE]


def make_pair(rng, axis_id=None):
    """One sample: two spellings of one program, plus what was varied.

    A GENERATOR AXIS IS DRAWN BY ITS OWN WEIGHT, not only when `--axis` or the coverage
    list asks for it. Routing it through the cover list alone would give it exactly one
    pair per sample however large the sample is, and a rate over one draw is not a rate.
    """
    gen = _generator_axes()
    if axis_id is None and gen:
        share = sum(a["weight"] for a in gen) / sum(a["weight"] for a in G.AXES)
        if rng.random() < share:
            axis_id = _weighted(rng, gen)["id"]
    if axis_id is not None:
        ax = next((a for a in G.AXES if a["id"] == axis_id), None)
        if ax is not None and ax.get("generator"):
            return GENERATORS[ax["generator"]](rng)
    got = plan_pair(rng, axis_id)
    if got is None:
        return None
    plan, axis, fa, fb = got
    srcA, wantA = render(plan, fa)
    srcB, wantB = render(plan, fb)
    if srcA == srcB:
        return None
    return {
        "axis": axis["id"],
        "spec": spec_of(plan), "facesA": fa, "facesB": fb,
        "a": {"src": srcA, "want": wantA, "face": fa[axis["id"]]},
        "b": {"src": srcB, "want": wantB, "face": fb[axis["id"]]},
        "compare": "grade+output" if wantA == wantB else "grade",
        "features": sorted(set(plan["value"]["features"]) |
                           {plan["position"]["id"], plan["read"]["id"],
                            fa["scope"]}),
        "delta": delta(axis, fa, fb, plan, srcA, srcB),
    }


if __name__ == "__main__":
    r = random.Random(7)
    for _ in range(3):
        p = make_pair(r)
        if p:
            print("== axis", p["axis"], p["a"]["face"], "vs", p["b"]["face"])
            print(p["a"]["src"], "----", p["b"]["src"], sep="\n")
