#!/usr/bin/env python3
"""The narrowed-write grid: a write the DECLARED type admits, inside a narrowing, re-narrows.

    python3 scripts/capability-probes/narrowed-write-grid.py <seed.wasm>[,<seed2.wasm>] [--show-bad] [--only <substr>]

Owner ruling 2026-09-26 (DECISIONS.md, the D2390 section). Axes: place (a local, a module binding,
a field, a list cell, a map cell) x declared union (value and ref reps, nullable, a literal union)
x narrowing form (`is`, `is` the other member, `!= null`, `== null` + early return, an `||` guard,
an `is` early return, a `!is || …` guard, a loop inside the narrowing, nested guards) x written
value (the narrowed member, another member, `null`, a value typed as the whole union) x the read
after the write (the written member, the old member, `is` the old member, `== null`, passing it
on) x face (annotated, un-annotated). Each cell holds one read, so a refusal refuses only it.

A cell grades OK when it runs printing what it should, or is refused where the ruling refuses.
Otherwise OVER (refused, should run), UNDER (runs, should be refused), WRONG, TRAP, SILENT
(invalid wasm) or TIMEOUT. With two seeds it also prints the PRICE: cells the first runs and the
second refuses or prints differently. Exits 1 when the last seed grades any cell other than OK.
`JOBS` sets the worker count (default 4); pass `VL_STD` for a worktree's std.
"""
import collections
import concurrent.futures as cf
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = os.environ.get("VL", os.path.join(ROOT, "scripts/vl-host/target/release/vl"))
PLACES = ("local", "top", "field", "cell", "map")

PRE = """type A = { r: i32 }
type B = { s: string }
function useI(v: i32) { print(v + 1) }
function useF(v: f64) { print(v * 2.0) }
function flag(): boolean { false }
function kk(n: i32): i32 { return n }
"""

# member -> (type spelling, literal a, literal b, a read that needs the member, prints(a), prints(b))
M = {
    "i32": ("i32", "7", "9", "useI(x)", "8", "10"),
    "f64": ("f64", "2.5", "4.5", "useF(x)", "5", "9"),
    "str": ("string", '"s"', '"tt"', "print(x.length)", "1", "2"),
    "A": ("A", "{ r: 3 }", "{ r: 5 }", "print(x.r)", "3", "5"),
    "B": ("B", '{ s: "b" }', '{ s: "cc" }', "print(x.s)", "b", "cc"),
    "la": ('"a"', '"a"', '"a"', "useL(x)", "a", "a"),
    "lb": ('"b"', '"b"', '"b"', "useL(x)", "b", "b"),
}
# declared union -> (members, nullable)
U = {
    "i32|str": (["i32", "str"], False),
    "i32|f64": (["i32", "f64"], False),
    "A|B": (["A", "B"], False),
    "A|null": (["A"], True),
    "i32|null": (["i32"], True),
    "str|null": (["str"], True),
    "i32|str|null": (["i32", "str"], True),
    "lit|null": (["la", "lb"], True),
    "f64|null": (["f64"], True),
}


def spell(u):
    mem, nul = U[u]
    s = '"a" | "b"' if u == "lit|null" else " | ".join(M[m][0] for m in mem)
    return s + " | null" if nul else s


def is_test(m):
    return None if m in ("la", "lb") else M[m][0]


def forms(u):
    """(form, the member it narrows to or None for non-null, wrap(body) -> code)."""
    mem, nul = U[u]
    out = []
    t0 = is_test(mem[0])
    if t0 and (len(mem) > 1 or nul):
        out.append(("is", mem[0], lambda b, t0=t0: f"  if x is {t0} {{\n{b}\n  }}"))
    if nul:
        out.append(("nn", None, lambda b: f"  if x != null {{\n{b}\n  }}"))
        out.append(("eqret", None, lambda b: f"  if x == null {{ return }}\n{b}"))
        out.append(("orret", None, lambda b: f"  if x == null || flag() {{ return }}\n{b}"))
    if len(mem) == 2 and is_test(mem[1]):
        t1 = is_test(mem[1])
        out.append(("is2", mem[1], lambda b, t1=t1: f"  if x is {t1} {{\n{b}\n  }}"))
    if t0 and (len(mem) > 1 or nul):
        out.append(("loopin", mem[0], lambda b, t0=t0:
                    f"  if x is {t0} {{\n    let i = 0\n    while i < 1 {{\n{b}\n    i = i + 1\n    }}\n  }}"))
    if nul and len(mem) == 2 and t0:
        out.append(("nest", mem[0], lambda b, t0=t0: f"  if x != null {{\n  if x is {t0} {{\n{b}\n  }}\n  }}"))
    if len(mem) == 2 and not nul and is_test(mem[1]):
        t1 = is_test(mem[1])
        out.append(("isret", mem[0], lambda b, t1=t1: f"  if x is {t1} {{ return }}\n{b}"))
        out.append(("notisor", mem[0], lambda b, t0=t0: f"  if !(x is {t0}) || flag() {{ return }}\n{b}"))
    if t0 and (len(mem) > 1 or nul):
        # `else if` chains of depth 2 and 3: with no final `else` no arm runs and the place keeps
        # its narrowing on that path; with one, the final `else` makes the write.
        for depth in (2, 3):
            for final in (False, True):
                name = f"chain{depth}{'e' if final else ''}"
                out.append((name, mem[0], lambda b, t0=t0, depth=depth, final=final: chain(t0, b, depth, final)))
    return out


def chain(t0, body, depth, final):
    w, r = [l.strip() for l in body.split("\n")]
    arms = " else ".join(f"if kk(0) == {i + 1} {{ {w} }}" for i in range(depth))
    if final:
        arms += f" else {{ {w} }}"
    return f"  if x is {t0} {{\n    {arms}\n    {r}\n  }}"


def chain_fallthrough(form):
    return form.startswith("chain") and not form.endswith("e")


def use_u(u):
    mem, nul = U[u]
    lines = [f"function useU(v: {spell(u)}) {{"]
    if nul:
        lines.append('  if v == null { print("N"); return }')
    for m in mem:
        if m in ("la", "lb"):
            lines.append("  print(v)")
            break
        lines.append(f'  if v is {M[m][0]} {{ print("{m}"); return }}')
    lines.append("}")
    return "\n".join(lines)


def cells():
    for u, (mem, nul) in U.items():
        for fname, nm, wrap in forms(u):
            init_m = nm if nm else mem[0]
            others = [m for m in mem if m != init_m]
            wo = others[0] if others else init_m
            writes = [("same", init_m, M[init_m][2])]
            writes += [("other", o, M[o][1]) for o in others[:1]]
            if nul:
                writes.append(("null", "null", "null"))
            writes.append(("union", "U", "src2()"))
            for wname, wm, wexpr in writes:
                if wname == "union":
                    rt_m, rt_val = wo, "b"
                elif wm == "null":
                    rt_m, rt_val = "null", None
                elif wname == "same":
                    rt_m, rt_val = wm, "b"
                else:
                    rt_m, rt_val = wm, "a"
                post = "U" if wname == "union" else wm
                if chain_fallthrough(fname):
                    # no arm ran: the value is the entry's, and the type is the join with it
                    rt_m, rt_val = init_m, "a"
                    if post != init_m:
                        post = "U"
                reads = []
                if post not in ("U", "null"):
                    reads.append(("rdW", M[post][3], M[post][4 if rt_val == "a" else 5], True))
                if chain_fallthrough(fname) and post == "U" and wname != "union":
                    reads.append(("rdOld", M[init_m][3], None, False))
                elif init_m == "f64" and post == "U":
                    pass  # `i32 | f64` into an `f64` parameter is D2611, not this rule
                elif init_m == "f64" and post == "i32":
                    reads.append(("rdOld", M["f64"][3], str(2 * int(M["i32"][1 if rt_val == "a" else 2])), True))
                elif init_m != post and init_m not in ("la", "lb"):
                    reads.append(("rdOld", M[init_m][3], None, False))
                tst = is_test(init_m)
                if tst:
                    never = post not in ("U", "null") and post != init_m
                    reads.append(("isOld", f"print(x is {tst})", "true" if rt_m == init_m else "false", not never))
                if nul and not fname.startswith("chain"):
                    reads.append(("eqnull", "print(x == null)", "true" if rt_m == "null" else "false", True))
                pv = "N" if rt_m == "null" else (M[rt_m][4] if rt_m in ("la", "lb") else rt_m)
                reads.append(("pass", "useU(x)", pv, True))
                for rname, rstmt, want, ok in reads:
                    for face in ("ann", "unann"):
                        for place in PLACES:
                            if place == "top" and fname not in ("is", "nn"):
                                continue
                            yield dict(u=u, form=fname, write=wname, read=rname, face=face, init=init_m,
                                       wexpr=wexpr, wo=wo, rstmt=rstmt, want=want, ok=ok, wrap=wrap, place=place)


def program(c):
    u = c["u"]
    mem, _ = U[u]
    su = spell(u)
    parts = [PRE]
    if "la" in mem:
        parts.append('function useL(v: "a" | "b") { print(v) }')
    parts.append(use_u(u))
    parts.append(f"function src(): {su} {{ return {M[c['init']][1]} }}")
    parts.append(f"function src2(): {su} {{ return {M[c['wo']][2]} }}")
    place, ann = c["place"], c["face"] == "ann"
    ref = {"local": "x", "top": "x", "field": "w.f", "cell": "xs[0]", "map": 'm["k"]'}[place]
    if place in ("local", "top"):
        decl = f"let x: {su} = src()" if ann else "let x = src()"
    elif place == "field":
        parts.append(f"type W = {{ f: {su} }}")
        decl = "const w: W = { f: src() }" if ann else "const w = { f: src() }"
    elif place == "cell":
        decl = f"const xs: ({su})[] = [src()]" if ann else "const xs = [src()]"
    else:
        decl = (f"const m: {{[string]: {su}}} = Map()" if ann else "const m = Map()") + '\n  m["k"] = src()'
    ind = "  " if c["form"] in ("eqret", "orret", "isret", "notisor") else "    "
    body = f"{ind}x = {c['wexpr']}\n{ind}{c['rstmt']}"
    code = re.sub(r"\bx\b", lambda _m: ref, c["wrap"](body))
    if place == "top":
        parts.append(decl + "\n" + code)
    else:
        parts.append("function go() {\n  " + decl + "\n" + code + "\n}\ngo()")
    return "\n".join(parts) + "\n"


def run1(path, seed):
    try:
        r = subprocess.run([VL, "run", "--compiler", seed, path], capture_output=True, text=True, timeout=60)
    except subprocess.TimeoutExpired:
        return ("TIMEOUT", "")
    if r.returncode == 0:
        return ("RUN", r.stdout.strip())
    blob = (r.stdout + "\n" + r.stderr).strip()
    if "wasm trap" in blob:
        return ("TRAP", blob.splitlines()[-1])
    if "failed to validate" in blob or "invalid module" in blob.lower():
        return ("SILENT", " / ".join(l for l in blob.splitlines()[:2]))
    lines = [l.replace(path, "@") for l in blob.splitlines() if l.strip() and not l.startswith("Error")]
    return ("REJ", " / ".join(lines[:2]))


def grade(c, res):
    kind, out = res
    if kind == "RUN":
        if not c["ok"]:
            return "UNDER"
        return "OK" if out.splitlines() == [c["want"]] else "WRONG"
    if kind == "REJ":
        return "OVER" if c["ok"] else "OK"
    return kind


def main():
    args = sys.argv[1:]
    if not args or args[0].startswith("-"):
        print(__doc__)
        return 2
    seeds = args[0].split(",")
    only = args[args.index("--only") + 1] if "--only" in args else ""
    show = "--show-bad" in args
    tmp = tempfile.mkdtemp(prefix="narrowed-write-grid-")
    cs = []
    for c in cells():
        cid = "_".join([c["place"], c["u"].replace("|", "-"), c["form"], c["write"], c["read"], c["face"]])
        if only and only not in cid:
            continue
        p = os.path.join(tmp, cid + ".vl")
        with open(p, "w") as f:
            f.write(program(c))
        cs.append((cid, c, p))
    with cf.ThreadPoolExecutor(int(os.environ.get("JOBS", "4"))) as ex:
        futs = {(cid, s): ex.submit(run1, p, s) for cid, _, p in cs for s in seeds}
        rows = [(cid, c, [futs[(cid, s)].result() for s in seeds]) for cid, c, _ in cs]
    tallies = [collections.Counter() for _ in seeds]
    price = collections.Counter()
    for cid, c, res in rows:
        gs = [grade(c, r) for r in res]
        for t, g in zip(tallies, gs):
            t[g] += 1
        if (show and gs[-1] != "OK") or len(set(gs)) > 1:
            want = c["want"] if c["ok"] else "REJECT"
            print(cid, " | ".join(f"{g}:{str(r[1])[:110]}" for g, r in zip(gs, res)), f"(want {want})")
        if len(seeds) > 1 and res[0][0] == "RUN" and res[-1] != res[0]:
            price[re.sub(r"@:\d+:\d+: ", "", str(res[-1][1]))[:100]] += 1
    for s, t in zip(seeds, tallies):
        print(os.path.basename(s), len(rows), "cells", dict(sorted(t.items())))
    if len(seeds) > 1:
        print("price (ran on the first seed, not the same on the last):", sum(price.values()))
        for k, v in price.most_common():
            print(f"  {v:5d}  {k}")
    return 0 if tallies[-1]["OK"] == len(rows) else 1


if __name__ == "__main__":
    sys.exit(main())
