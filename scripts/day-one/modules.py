#!/usr/bin/env python3
"""The `modules_split` axis: ONE program, spelled as one file and as two modules.

Every other axis here varies a spelling INSIDE one file, and three clause-1 defects in
one week needed two files to appear at all (D1593, D1595, D1596). The shared root is
structural rather than incidental: module scope has TWO storage classes (wasm globals and
start-function locals), every module's top-level statements are lowered into ONE start
function, and several by-name scans see only one class or only one module. A single-file
sample cannot reach any of that.

So the unit here is a PROGRAM BUILT OUT OF UNITS. A unit is a declaration or a
module-scope statement group with its dependencies named; the `single` face emits every
unit into one file, and the `split` face moves a dependency-closed random subset into an
imported module with `export` and imports the names the entry still uses. Both faces must
print the same lines, so a disagreement is a defect with its control attached.

The ingredients the three rows name are grammar records with real weight, not accidents:
same-named bindings in the two top-level scopes (a loop variable and a block `const`), a
module-scope loop with a `let` in it, an un-annotated (hole) parameter called across the
import, a block-scoped `const` delivered as an argument across it, an exported `type` read
annotated and un-annotated, and the scratch-frame ops (`+` on strings, `.push`, `Map()`)
whose detection sweep is what D1595 caught guessing.

Nothing here runs a program; `sample.py` does. `render.py` delegates to `make_pair`.
"""
import re

# Grammar ids the caller has asked the sampler to stop drawing (`--exclude`). Set by
# sample.py alongside render's, so one flag narrows both generators.
EXCLUDE = set()

# The MARKER a multi-file program carries, which is `check-filed-witnesses.py`'s own
# spelling — so a witness this sampler prints can be pasted into an inventory row's
# `Repro:` block and graded there without being re-typed.
FILE_MARK = re.compile(r"^// file: (\S+\.vl)\s*$")

NAME_SLOT = "@N@"
# Deliberately short and ordinary. A collision is generated ON PURPOSE most of the time
# (see `_names`): the three rows are all one name bound in two top-level scopes.
NAME_POOL = ["n", "v", "s", "k"]
HOT_NAME = "n"
COLLIDE_P = 0.55

DECL = re.compile(r"^(type|function|const|let) (\w+)")


def _unit(uid, weight, lines, exports=(), deps=(), head=(), probe=None,
          names=0, features=(), writes=()):
    """`writes` names the units whose GLOBAL this one assigns. VL has no assignment to an
    imported binding, so a writer is GLUED to its target: it moves exactly when the
    target does, which is what keeps the two faces the same program."""
    return {"id": uid, "weight": weight, "lines": list(lines),
            "exports": list(exports), "deps": list(deps), "head": list(head),
            "probe": probe, "names": names, "features": list(features),
            "writes": list(writes)}


# --------------------------------------------------------------------------- probes
# A probe is a print the ENTRY makes about a unit's state, so a moved unit is graded on
# what it computed and not only on whether the module linked. Its expected line is a
# function of WHICH UNITS were drawn, because the accumulator units compose.

def _tally_want(ids):
    t = 0
    if "st_loop_tally" in ids:
        t += 0 + 1 + 2
    if "st_forin" in ids:
        t += 1 + 2
    if "st_block_struct" in ids:
        t += 3
    if "st_while_block" in ids:
        t += 2
    return str(t)


def _table_want(ids):
    return "4" if "st_loop_let" in ids else "0"


def _tag_want(ids):
    return "3" if "st_block_str" in ids else "0"


def _fixed(v):
    return lambda ids: v


# ---------------------------------------------------------------------------- units
# ORDER IS DEPENDENCY ORDER — a unit's deps precede it, which is what lets the split
# pick a dependency-closed subset by one forward pass.

UNITS = [
    _unit("ty_cell", 5, ["type Cell = { base: i32 }"], exports=["Cell"],
          features=["struct", "exported_type"]),
    _unit("ty_bad", 3, ['type Bad = { msg: string }'], exports=["Bad"],
          features=["struct", "exported_type"]),

    _unit("fn_mk", 5, ["function mk(n: i32): Cell { return { base: n } }"],
          exports=["mk"], deps=["ty_cell"], features=["struct"]),
    _unit("fn_ld", 4, ["function ld(self: Cell): i32 { return self.base }"],
          exports=["ld"], deps=["ty_cell"], features=["ufcs"]),
    _unit("fn_ann", 3, ["function asum(b: Cell): i32 { return b.base + b.base }"],
          exports=["asum"], deps=["ty_cell"], features=["annotated_param"]),
    _unit("fn_pick", 4,
          ["function pick(k: i32): Cell | Bad {",
           '  if k < 0 { return { msg: "neg" } }',
           "  return { base: k + 7 }",
           "}"],
          exports=["pick"], deps=["ty_cell", "ty_bad"], features=["union"]),
    # THE HOLE PARAMETERS — D1596's ingredient. Pinned from the argument's binding, which
    # is exactly the thing a module boundary and a top-level block each hide.
    _unit("fn_hole_ufcs", 5, ["function hsum(b) { return b.ld() + b.ld() }"],
          exports=["hsum"], deps=["fn_ld"], features=["hole_param", "ufcs"]),
    _unit("fn_hole_field", 4, ["function hbase(b) { return b.base }"],
          exports=["hbase"], features=["hole_param"]),
    _unit("fn_hole_id", 3, ["function idOf(x) { return x }"], exports=["idOf"],
          features=["hole_param"]),
    _unit("fn_generic", 3, ["function passv<T>(x: T): T { return x }"],
          exports=["passv"], features=["generic"]),

    _unit("g_table", 4, ["const Tbl = __array_new__(4, 0)"], exports=["Tbl"],
          probe=("print(Tbl[3])", _table_want), features=["table"]),
    _unit("g_tally", 4, ["let tally = 0"], exports=["tally"],
          probe=("print(tally)", _tally_want), features=["global_let"]),
    _unit("g_tag", 3, ['let tag = ""'], exports=["tag"],
          probe=("print(tag.length)", _tag_want),
          features=["global_let", "string"]),
    _unit("g_base", 2, ["const BASE = 5"], exports=["BASE"],
          probe=("print(BASE)", _fixed("5")), features=["global_const"]),

    # MODULE-SCOPE STATEMENTS. None of these prints: the entry owns every print, so the
    # two faces cannot differ merely because an imported module's start ran first.
    _unit("st_loop_let", 5,
          ["for @N@ in 0 to 3 {", "  let acc = @N@", "  acc = acc + 1",
           "  Tbl[@N@] = acc", "}"],
          deps=["g_table"], names=1, features=["module_loop", "loop_let"], writes=["g_table"]),
    _unit("st_loop_tally", 3, ["for @N@ in 0 to 2 { tally = tally + @N@ }"],
          deps=["g_tally"], names=1, features=["module_loop"], writes=["g_tally"]),
    _unit("st_forin", 3, ["for @N@ in [1, 2] { tally = tally + @N@ }"],
          deps=["g_tally"], names=1, features=["module_loop", "forin"], writes=["g_tally"]),
    _unit("st_block_struct", 5,
          ["if true {", "  const @N@ = mk(3)", "  tally = tally + @N@.base", "}"],
          deps=["g_tally", "fn_mk"], names=1,
          features=["module_block", "struct"], writes=["g_tally"]),
    _unit("st_block_str", 4,
          ["if true {", '  const @N@ = "hi"', '  tag = @N@ + "!"', "}"],
          deps=["g_tag"], names=1,
          features=["module_block", "string_frame"], writes=["g_tag"]),
    _unit("st_while_block", 3,
          ["let step = 0", "while step < 1 {", "  const @N@ = mk(2)",
           "  tally = tally + @N@.base", "  step = step + 1", "}"],
          deps=["g_tally", "fn_mk"], names=1,
          features=["module_while", "struct"], writes=["g_tally"]),
    _unit("st_push", 3, ["const bag = [1]", "bag.push(2)"], exports=["bag"],
          probe=("print(bag.length)", _fixed("2")), features=["push_frame"]),
    _unit("st_map", 3, ['const lut: {[string]: i32} = Map()', 'lut["k"] = 4'],
          exports=["lut"], probe=('print(lut["k"] ?? 0)', _fixed("4")),
          features=["map_frame"]),
    _unit("st_concat", 3, ['const pad = "a" + "b"'], exports=["pad"],
          probe=("print(pad)", _fixed("ab")), features=["string_frame"]),

    # STD ON ONE SIDE OR BOTH. An import is a module-graph edge with a start function of
    # its own, and the consumer that found all three rows was importing `std:buffer`.
    _unit("std_str", 3, ['const padded = trim("  ok  ")'], exports=["padded"],
          head=['import { trim } from "std:str"'],
          probe=("print(padded)", _fixed("ok")), features=["std", "std_str"]),
    _unit("std_array", 3, ["const hasTwo = includes([1, 2], 2)"],
          exports=["hasTwo"], head=['import { includes } from "std:array"'],
          probe=("print(hasTwo)", _fixed("true")), features=["std", "std_array"]),
    _unit("std_buffer", 3,
          ["const buf = Buffer(4)", "store8(buf, 0, 65)",
           "const byteAt = loadU8(buf, 0)"],
          exports=["buf", "byteAt"],
          head=['import { Buffer, store8, loadU8 } from "std:buffer"'],
          probe=("print(byteAt)", _fixed("65")), features=["std", "std_buffer"]),
]

BY_ID = {u["id"]: u for u in UNITS}

# --------------------------------------------------------------------------- reports
# The report is the LAST thing in the entry and is never moved, so the printed order is
# the same in both faces. Its `@N@` is the second half of every collision this axis is
# aimed at: the first half is a loop variable or a block `const` in the other module.

REPORTS = [
    {"id": "rep_block_union", "weight": 5, "needs": ["fn_pick"],
     "lines": ["if true {", "  const @N@ = pick(1)",
               "  if @N@ is Bad { print(0 - 1) } else { print(@N@.base) }", "}"],
     "want": ["8"], "features": ["module_block", "union", "narrow_is"]},
    {"id": "rep_block_hole", "weight": 5, "needs": ["fn_hole_ufcs", "fn_mk"],
     "lines": ["if true {", "  const @N@ = mk(4)", "  print(hsum(@N@))", "}"],
     "want": ["8"], "features": ["module_block", "hole_param", "argument"]},
    {"id": "rep_block_holefield", "weight": 4, "needs": ["fn_hole_field", "fn_mk"],
     "lines": ["if true {", "  const @N@ = mk(6)", "  print(hbase(@N@))", "}"],
     "want": ["6"], "features": ["module_block", "hole_param", "argument"]},
    {"id": "rep_block_str", "weight": 4, "needs": [],
     "lines": ["if true {", '  const @N@ = "hi"', '  print(@N@ + "!")', "}"],
     "want": ["hi!"], "features": ["module_block", "string_frame"]},
    {"id": "rep_while_hole", "weight": 4, "needs": ["fn_hole_ufcs", "fn_mk"],
     "lines": ["let step2 = 0", "while step2 < 1 {", "  const @N@ = mk(4)",
               "  print(hsum(@N@))", "  step2 = step2 + 1", "}"],
     "want": ["8"], "features": ["module_while", "hole_param", "argument"]},
    {"id": "rep_fn_ann", "weight": 3, "needs": ["fn_ann", "fn_mk"],
     "lines": ["function report() {", "  const @N@ = mk(4)", "  print(asum(@N@))",
               "}", "report()"],
     "want": ["8"], "features": ["function", "annotated_param"]},
    # THE EXPORTED TYPE, READ BOTH WAYS. An annotation pins a rep, so the annotated and
    # the un-annotated spelling of one imported type are different questions (D1596).
    {"id": "rep_global_ann", "weight": 4, "needs": ["ty_cell", "fn_mk"],
     "lines": ["const @N@: Cell = mk(9)", "print(@N@.base)"],
     "want": ["9"], "features": ["global_init", "annotated", "exported_type"]},
    {"id": "rep_global_infer", "weight": 4, "needs": ["fn_mk"],
     "lines": ["const @N@ = mk(9)", "print(@N@.base)"],
     "want": ["9"], "features": ["global_init", "inferred", "struct"]},
    {"id": "rep_generic_pin", "weight": 3, "needs": ["fn_generic", "fn_mk"],
     "lines": ["if true {", "  const @N@ = passv(mk(7))", "  print(@N@.base)", "}"],
     "want": ["7"], "features": ["module_block", "generic"]},
]


# ----------------------------------------------------------------------------- draw

def _weighted(rng, items):
    items = [i for i in items if i["id"] not in EXCLUDE]
    if not items:
        return None
    return rng.choices(items, weights=[i["weight"] for i in items])[0]


def _closure(ids):
    """`ids` plus every dependency, transitively. UNITS is in dependency order, so the
    result read back in that order is a legal emission order."""
    out, todo = set(), list(ids)
    while todo:
        i = todo.pop()
        if i in out:
            continue
        out.add(i)
        todo.extend(BY_ID[i]["deps"])
    return out


def _names(rng, order):
    """One name per slot. A COLLISION IS THE POINT — every one of D1593/D1595/D1596 is
    one name bound in two top-level scopes — so most draws give every slot the same
    name and the rest spread over the pool, which is the control."""
    slots = [u["id"] for u in order if u["names"]] + ["__report__"]
    if rng.random() < COLLIDE_P:
        return {s: HOT_NAME for s in slots}
    return {s: rng.choice(NAME_POOL) for s in slots}


def draw(rng):
    """A module spec: which units, which name each slot took, which units moved."""
    report = _weighted(rng, REPORTS)
    if report is None:
        return None
    chosen = _closure(report["needs"])
    for _ in range(rng.randint(1, 4)):
        u = _weighted(rng, UNITS)
        if u is not None:
            chosen |= _closure([u["id"]])
    if EXCLUDE & chosen:
        return None
    order = [u for u in UNITS if u["id"] in chosen]
    names = _names(rng, order)
    p = rng.choice([0.35, 0.5, 0.65])
    for _ in range(24):
        moved, ok = set(), True
        for u in order:
            deps_ok = set(u["deps"]) <= moved
            if u["writes"]:
                if not all(w in moved for w in u["writes"]):
                    continue
                if not deps_ok:
                    ok = False
                    break
                moved.add(u["id"])
            elif deps_ok and rng.random() < p:
                moved.add(u["id"])
        if ok and moved and _imports(order, moved, names, report):
            return {"units": [u["id"] for u in order], "report": report["id"],
                    "names": names, "moved": sorted(moved)}
    return None


# --------------------------------------------------------------------------- render

def _sub(lines, name):
    return [l.replace(NAME_SLOT, name) for l in lines]


def _unit_lines(u, names, export):
    """One unit's source. `export` prefixes the line that DECLARES each exported name —
    a unit's later lines (`bag.push(2)`, `lut["k"] = 4`) are statements, not declarations."""
    out = []
    for l in _sub(u["lines"], names.get(u["id"], HOT_NAME)):
        m = DECL.match(l)
        if export and m and m.group(2) in u["exports"]:
            l = "export " + l
        out.append(l)
    return out


def _probes(order, ids):
    out, want = [], []
    for u in order:
        if not u["probe"]:
            continue
        line, wf = u["probe"]
        out.append(line)
        want.append(wf(ids))
    return out, want


def _imports(order, moved, names, report):
    """The names the ENTRY still uses that now live in the module. Computed from the
    entry's own text rather than from the dependency table, because an unmoved unit and
    a probe reference an export just as a report does."""
    ids = set(u["id"] for u in order)
    body = []
    for u in order:
        if u["id"] not in moved:
            body += _unit_lines(u, names, False)
    body += _probes(order, ids)[0]
    body += _sub(report["lines"], names["__report__"])
    text = "\n".join(body)
    out = []
    for u in order:
        if u["id"] in moved:
            out += [n for n in u["exports"]
                    if re.search(r"\b%s\b" % re.escape(n), text)]
    return out


def renderable(spec):
    """Can this spec be SPLIT? A module nothing imports from is never compiled, so an
    empty import list is a different program rather than a smaller one."""
    order = [BY_ID[i] for i in spec["units"]]
    report = next(r for r in REPORTS if r["id"] == spec["report"])
    return bool(spec["moved"]) and bool(
        _imports(order, set(spec["moved"]), spec["names"], report))


def render(spec, face):
    """(source, want) for one face. `split` carries `// file:` markers; the LAST section
    is the entry, which is the convention `check-filed-witnesses.py` already grades."""
    order = [BY_ID[i] for i in spec["units"]]
    ids = set(spec["units"])
    names, moved = spec["names"], set(spec["moved"])
    report = next(r for r in REPORTS if r["id"] == spec["report"])
    probe_lines, probe_want = _probes(order, ids)
    tail = probe_lines + _sub(report["lines"], names["__report__"])
    want = probe_want + list(report["want"])

    if face == "single":
        head, body = [], []
        for u in order:
            head += u["head"]
            body += _unit_lines(u, names, False)
        return "\n".join(head + body + tail) + "\n", want

    mhead, mbody, ehead, ebody = [], [], [], []
    for u in order:
        if u["id"] in moved:
            mhead += u["head"]
            mbody += _unit_lines(u, names, True)
        else:
            ehead += u["head"]
            ebody += _unit_lines(u, names, False)
    imports = _imports(order, moved, names, report)
    ehead.append("import { %s } from \"./mod\"" % ", ".join(imports))
    src = (["// file: mod.vl"] + mhead + mbody +
           ["// file: entry.vl"] + ehead + ebody + tail)
    return "\n".join(src) + "\n", want


def split_files(src):
    """(name, source) per `// file:` section; an unmarked source is one file."""
    files, name, body = [], None, []
    for ln in src.splitlines():
        m = FILE_MARK.match(ln)
        if m:
            if name is not None:
                files.append((name, "\n".join(body).rstrip() + "\n"))
            name, body = m.group(1), []
        else:
            body.append(ln)
    if name is None:
        return [("w.vl", src)]
    files.append((name, "\n".join(body).rstrip() + "\n"))
    return files


# ----------------------------------------------------------------------------- pair

def _delta(spec):
    return {"axis": "modules_split", "faceA": "single", "faceB": "split",
            "value": spec["report"], "read": spec["report"],
            "position": "module", "scope": "module",
            "held": {"units": spec["units"], "moved": spec["moved"],
                     "names": spec["names"], "report": spec["report"]},
            "diff": ["moved: " + ", ".join(spec["moved"])]}


def _features(spec):
    report = next(r for r in REPORTS if r["id"] == spec["report"])
    f = set(report["features"]) | {"modules"}
    for i in spec["units"]:
        f |= set(BY_ID[i]["features"])
    if len(set(spec["names"].values())) == 1 and len(spec["names"]) > 1:
        f.add("name_collision")
    if set(spec["moved"]) & {u["id"] for u in UNITS if u["names"]}:
        f.add("moved_statement")
    return sorted(f)


def make_pair(rng):
    """One sample: the same program as one file and as two modules."""
    spec = draw(rng)
    if spec is None:
        return None
    srcA, wantA = render(spec, "single")
    srcB, wantB = render(spec, "split")
    if srcA == srcB:
        return None
    faces = {"modules_split": "single"}
    return {
        "axis": "modules_split",
        "spec": spec,
        "facesA": dict(faces, modules_split="single"),
        "facesB": dict(faces, modules_split="split"),
        "a": {"src": srcA, "want": wantA, "face": "single"},
        "b": {"src": srcB, "want": wantB, "face": "split"},
        "compare": "grade+output",
        "features": _features(spec),
        "delta": _delta(spec),
    }


def ablations(spec):
    """(label, spec) one INGREDIENT at a time — the table that defines the family.

    Line removal cannot say which unit a two-file defect needs, because the units are
    spread over two files and a removal that takes one out has to take its dependents
    with it. This drops each unit with everything that depends on it, un-collides the
    names, and un-moves each moved unit in turn.
    """
    out = []
    order = list(spec["units"])
    report = next(r for r in REPORTS if r["id"] == spec["report"])
    for uid in order:
        drop = {uid}
        changed = True
        while changed:
            changed = False
            for other in order:
                if other not in drop and (set(BY_ID[other]["deps"]) & drop):
                    drop.add(other)
                    changed = True
        if set(report["needs"]) & drop or drop == set(order):
            continue
        keep = [i for i in order if i not in drop]
        trial = {"units": keep, "report": spec["report"],
                 "names": {k: v for k, v in spec["names"].items()
                           if k in keep or k == "__report__"},
                 "moved": [i for i in spec["moved"] if i in keep]}
        if not renderable(trial):
            # The dropped unit was the only one the entry imported. Move everything
            # rather than lose the ablation: the question is which INGREDIENT the
            # defect needs, not which side of the boundary each one sat on.
            trial = dict(trial, moved=list(keep))
        if renderable(trial):
            out.append(("drop " + uid, trial))
    if len(set(spec["names"].values())) == 1:
        fresh = dict(spec["names"])
        for i, k in enumerate(sorted(k for k in fresh if k != "__report__")):
            fresh[k] = NAME_POOL[(i + 1) % len(NAME_POOL)]
        out.append(("un-collide the names", dict(spec, names=fresh)))
    for uid in spec["moved"]:
        rest = [i for i in spec["moved"] if i != uid]
        trial = dict(spec, moved=rest)
        if rest and _valid_moved(spec, rest) and renderable(trial):
            out.append(("keep " + uid + " in the entry", trial))
    return out


def _valid_moved(spec, moved):
    """A moved set is legal when every moved unit's deps moved too and no writer was
    parted from the global it assigns."""
    m = set(moved)
    return all(set(BY_ID[i]["deps"]) <= m for i in m) and all(
        (set(BY_ID[i]["writes"]) <= m) == (i in m)
        for i in spec["units"] if BY_ID[i]["writes"])


if __name__ == "__main__":
    import random
    r = random.Random(11)
    for _ in range(2):
        p = make_pair(r)
        if p:
            print("== moved:", ", ".join(p["spec"]["moved"]))
            print(p["a"]["src"], "----", p["b"]["src"], sep="\n")
