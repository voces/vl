#!/usr/bin/env python3
"""The `imports_pair` axis: ONE std import against TWO in the same module.

D1514 is why this exists. `std:fs` alone compiled in 18 ms and `std:array` alone in
40 ms; the module that imported BOTH took 5,006 ms — superlinear, and invisible to any
benchmark that imports one module at a time. The same shape has produced outcome defects
too: six sweep rows were two features that each worked alone.

So the unit here is a program that uses ONE std module, paired with the SAME program plus
a SECOND std import and its use. The pair's `alone` face proves the first module's half is
legal on its own, which is what makes a disagreement a two-import interaction rather than
a report about whichever module happened to be drawn second.

The TIMING half needs a third program — the second module ALONE — which no pair can carry,
so it is a report over a saved sample (`sample.py --imports-report`) rather than a face:
it re-renders alone(A), alone(B) and together(A,B), times `vl build` on each, and flags a
pair whose together-time exceeds 3x the sum of the two alone-times.

A module with no side-effect-free, deterministic use is `import_only`: the face imports a
name and never calls it. That is not a weakness of the record — it is D1514's own shape,
where the cost was in the module graph and not in any call.

Nothing here runs a program; `sample.py` does. `render.py` delegates to `make_pair`.
"""

# Module ids the caller has asked the sampler to stop drawing (`--exclude`). Set by
# sample.py alongside render's and modules', so one flag narrows every generator.
EXCLUDE = set()


def _mod(mid, module, names, lines=(), want=(), weight=3, features=()):
    """`lines` may be empty — an `import_only` record, whose name is never called."""
    return {"id": mid, "module": module, "names": list(names), "lines": list(lines),
            "want": list(want), "weight": weight,
            "features": list(features) or [mid]}


# Every use is DETERMINISTIC and side-effect-free: no file is written, no argument is
# read, and nothing prints a pointer. `fs` reads a path that cannot exist, which is a
# constant `IoError`, so the disk state cannot move the expected output.
MODULES = [
    _mod("array", "std:array", ["filled"],
         ["print(filled(3, 0).length)"], ["3"], weight=5),
    _mod("str", "std:str", ["padStart"],
         ['print("7".padStart(3, "0"))'], ["007"], weight=5),
    _mod("fmt", "std:fmt", ["toString"],
         ['print(toString(41) + "!")'], ["41!"], weight=5),
    _mod("utf8", "std:utf8", ["encodeUtf8"],
         ['print(encodeUtf8("abc").length)'], ["3"], weight=4),
    _mod("bytes", "std:bytes", ["u16le"],
         ["const bs: u8[] = [1, 0]", "print(u16le(bs, 0))"], ["1"], weight=4),
    _mod("base64", "std:base64", ["encodeBase64"],
         ["const b64: u8[] = [104, 105]", "print(encodeBase64(b64))"], ["aGk="],
         weight=3),
    _mod("buffer", "std:buffer", ["Buffer", "storeI32", "loadI32"],
         ["const buf = Buffer(8)", "buf.storeI32(0, 42)", "print(buf.loadI32(0))"],
         ["42"], weight=3),
    _mod("fs", "std:fs", ["fileSize"],
         ['const sz = fileSize("./no-such-file-vl-day-one")',
          "if sz is i64 { print(1) } else { print(0) }"], ["0"], weight=5),
    # IMPORT-ONLY. Each of these needs a receiver the grammar cannot build deterministically
    # (a `Json` tree, a process argv, a test runner's own output), so the record imports the
    # name and does not call it — D1514's shape exactly, where the module graph is the cost.
    _mod("json", "std:json", ["parseJson"], weight=4, features=["json", "import_only"]),
    _mod("args", "std:args", ["programArgs"], weight=2,
         features=["args", "import_only"]),
    _mod("test", "std:test", ["describe"], weight=2,
         features=["test", "import_only"]),
    _mod("seed", "std:seed", ["stdSmoke"], weight=2,
         features=["seed", "import_only"]),
]

BY_ID = {m["id"]: m for m in MODULES}


def _pool():
    return [m for m in MODULES if m["id"] not in EXCLUDE]


def draw(rng):
    """An ORDERED pair of distinct modules. Order is drawn, not normalised: an import
    list is a sequence, and a defect that depends on which module is merged first would
    be invisible to a generator that always sorted."""
    pool = _pool()
    if len(pool) < 2:
        return None
    a, b = rng.sample(pool, 2)
    return {"first": a["id"], "second": b["id"]}


def _header(mods):
    return ["import { %s } from \"%s\"" % (", ".join(m["names"]), m["module"])
            for m in mods]


def render(spec, face):
    """(source, want) for one face. `alone` imports the FIRST module only."""
    first = BY_ID[spec["first"]]
    mods = [first] if face == "alone" else [first, BY_ID[spec["second"]]]
    lines = list(_header(mods))
    want = []
    for m in mods:
        lines.extend(m["lines"])
        want.extend(m["want"])
    return "\n".join(lines) + "\n", want


def triple(spec):
    """The THREE programs the timing report needs: alone(A), alone(B), together(A, B).

    A pair cannot carry the third, and a two-program comparison cannot see D1514: what
    that row measured is `together` against the SUM of the two alone-times."""
    a = dict(spec)
    b = {"first": spec["second"], "second": spec["first"]}
    return [("alone " + BY_ID[spec["first"]]["module"], render(a, "alone")[0]),
            ("alone " + BY_ID[spec["second"]]["module"], render(b, "alone")[0]),
            ("together", render(a, "together")[0])]


def _features(spec):
    return sorted(set(BY_ID[spec["first"]]["features"]) |
                  set(BY_ID[spec["second"]]["features"]) | {"imports_pair"})


def _delta(spec):
    return {"axis": "imports_pair", "faceA": "alone", "faceB": "together",
            "first": BY_ID[spec["first"]]["module"],
            "second": BY_ID[spec["second"]]["module"],
            "diff": ["+" + l for l in _header([BY_ID[spec["second"]]])] +
                    ["+" + l for l in BY_ID[spec["second"]]["lines"]]}


def make_pair(rng):
    """One sample: the same first module alone, and beside a second std import."""
    spec = draw(rng)
    if spec is None:
        return None
    srcA, wantA = render(spec, "alone")
    srcB, wantB = render(spec, "together")
    if srcA == srcB:
        return None
    return {
        "axis": "imports_pair",
        "spec": spec,
        "facesA": {"imports_pair": "alone"},
        "facesB": {"imports_pair": "together"},
        "a": {"src": srcA, "want": wantA, "face": "alone"},
        "b": {"src": srcB, "want": wantB, "face": "together"},
        # An import-only second module adds no printed line, so both faces have the same
        # contract and the output is compared as well as the grade.
        "compare": "grade+output" if wantA == wantB else "grade",
        "features": _features(spec),
        "delta": _delta(spec),
    }


def ablations(spec):
    """(label, spec) one INGREDIENT at a time. The only ingredients a pair has are the
    two modules, so the table is the two swaps that keep one of them."""
    out = []
    for other in _pool():
        if other["id"] in (spec["first"], spec["second"]):
            continue
        out.append(("second = " + other["module"],
                    {"first": spec["first"], "second": other["id"]}))
        out.append(("first = " + other["module"],
                    {"first": other["id"], "second": spec["second"]}))
    return out[:8]
