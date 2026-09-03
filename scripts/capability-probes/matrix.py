#!/usr/bin/env python3
"""Generate and grade a capability's POSITION x FACE matrix from ONE template.

CLAUDE.md's rule is that a capability is enforced in one place and SERVED in many, so a fix
has to be graded at every syntactic position the value can be delivered to, in the ANNOTATED
and the UN-ANNOTATED face. Hand-writing those ~40 programs is where the misses come from:
D965 lost global ASSIGNMENT, D1193 was silent at seven of nine positions, D1197 is red at
exactly one (`.push`), and #2406 missed the un-annotated return face and the early-return
guard. This writes them instead.

    python3 scripts/capability-probes/matrix.py matrix/orerr-generic-pin.matrix.vl
    python3 scripts/capability-probes/matrix.py <t> --before old.wasm --after new.wasm
    python3 scripts/capability-probes/matrix.py <t> --only binding,array_push --keep

TEMPLATE FORMAT — a `*.matrix.vl` under `matrix/`, sections opened by a `// @@NAME@@` line.
Text before the first marker is a free header. Sections:

    @@PRELUDE@@   type/function declarations the value needs (module scope)
    @@VALUE@@     the expression under test, e.g. `orErr(5, false)`          [required]
    @@TYPE@@      its type spelling for the annotated face, e.g. `i32 | "err"`  [required]
    @@WANT@@      what the proof must print (run.py's `matches` contract)    [required]
    @@PROOF@@     statements over the bound name `v`, printing WANT
    @@TEST@@ @@HIT@@ @@MISS@@   a boolean over `v` plus its two branches; PROOF defaults to
                  `if TEST { HIT } else { MISS }`, and these UNLOCK the six discrimination
                  positions (a template with no TEST skips them, with the reason printed)
    @@SETUP@@     statements emitted in the delivery's own scope before it
    @@GUARD@@     a boolean; the delivery nests inside `if GUARD { ... }` (a NARROWED value)
    @@FALLBACK@@  an expression of TYPE for the paths a GUARD leaves un-taken
    @@SKIP@@      `position: reason` lines
    @@VALUE2@@ @@TYPE2@@ @@PROOF2@@ @@WANT2@@   a second instance, for `two_instances`

GRADING is run.py's, imported rather than copied: RUNS / WRONG / check refuses / emit
refuses / SILENT / COMPILER TRAP / TIMEOUT, one `vl` invocation per healthy cell. Exits
non-zero on any `runs -> not-runs` between the two seeds, or any SILENT in the after column.
"""
import argparse, os, re, shutil, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import run as probes  # noqa: E402  -- the shared grading vocabulary

ROOT = probes.ROOT
FACES = ("ann", "unann")
FACE_LABEL = {"ann": "annotated", "unann": "un-annotated"}


# ---------------------------------------------------------------- template

def ind(text, n):
    pad = " " * n
    return "\n".join(pad + l if l.strip() else l for l in text.splitlines())


class Tpl:
    """One template, parsed. `name` is the cell-id prefix, so a refused set can be named."""

    def __init__(self, path):
        self.path = path
        self.name = re.sub(r"\.matrix\.vl$", "", os.path.basename(path))
        s, cur, buf = {}, None, []
        for line in open(path, encoding="utf-8"):
            m = re.match(r"^\s*//\s*@@([A-Z0-9_]+)@@\s*$", line)
            if m:
                if cur:
                    s[cur] = "".join(buf).strip("\n")
                cur, buf = m.group(1), []
            elif cur is not None:
                buf.append(line)
        if cur:
            s[cur] = "".join(buf).strip("\n")
        g = lambda k: s.get(k, "").strip("\n")  # noqa: E731
        self.prelude, self.value, self.ty = g("PRELUDE"), g("VALUE"), g("TYPE")
        self.want, self.setup, self.guard = g("WANT"), g("SETUP"), g("GUARD")
        self.fallback = g("FALLBACK")
        self.test, self.hit, self.miss = g("TEST"), g("HIT"), g("MISS")
        self.value2, self.ty2 = g("VALUE2"), g("TYPE2")
        self.proof2, self.want2 = g("PROOF2"), g("WANT2")
        self.skips = {}
        for line in g("SKIP").splitlines():
            if ":" in line:
                k, _, why = line.partition(":")
                self.skips[k.strip()] = why.strip()
        self.proof = g("PROOF")
        if not self.proof and self.test:
            self.proof = "if %s {\n%s\n} else {\n%s\n}" % (
                self.test, ind(self.hit, 2), ind(self.miss, 2))
        for field in ("value", "ty", "want", "proof"):
            if not getattr(self, field):
                raise SystemExit("%s: no @@%s@@ section (and none derivable)"
                                 % (path, field.upper()))

    def arr(self, ty=None):
        """`i32[]` but `(i32 | "err")[]` — a union element spelling needs its parentheses."""
        t = (ty or self.ty).strip()
        return "(%s)[]" % t if re.search(r"[|\s]", t) else t + "[]"

    def bind(self, name, expr, face, ty=None):
        return ("const %s: %s = %s" % (name, ty or self.ty, expr)) if face == "ann" \
            else "const %s = %s" % (name, expr)


# ---------------------------------------------------------------- assembly

def assemble(t, decls=(), pre=(), body=()):
    """PRELUDE, decls, SETUP, pre, then the body — nested in the GUARD when there is one.

    SETUP lands before `pre` because `pre` may need what it binds (`global_init`'s own
    `let __g: T = c.err`), and the GUARD wraps only `body` because a module global's
    initialiser cannot nest — which is why that position skips itself under a guard.
    The two RETURN positions bypass this: their delivery scope is the function.
    """
    out = [t.prelude] if t.prelude else []
    out += [d for d in decls if d]
    if t.setup:
        out.append(t.setup)
    out += [p for p in pre if p]
    inner = [b for b in body if b]
    if t.guard:
        out.append("if %s {" % t.guard)
        out.append(ind("\n".join(inner), 2))
        out.append("}")
    else:
        out += inner
    return "\n".join(out) + "\n"


POSITIONS = []          # (name, what the face annotates, builder)


def position(name, face_at):
    def reg(fn):
        POSITIONS.append((name, face_at, fn))
        return fn
    return reg


# --- deliveries ------------------------------------------------------------

@position("binding", "the binding")
def p_binding(t, face):
    return assemble(t, body=[t.bind("v", t.value, face), t.proof])


def _returner(t, face, annotated):
    """A deliverer function. SETUP and GUARD live INSIDE it — that is where the value is."""
    if t.guard and not t.fallback:
        return None, "the template has a GUARD and no @@FALLBACK@@ for the un-taken path"
    inner = [t.setup] if t.setup else []
    if t.guard:
        inner += ["if %s { return %s }" % (t.guard, t.value), t.fallback]
    else:
        inner.append("return %s" % t.value)
    sig = "function __deliver(): %s {" % t.ty if annotated else "function __deliver() {"
    decls = [sig, ind("\n".join(inner), 2), "}"]
    prog = "\n".join(([t.prelude] if t.prelude else []) + decls
                     + [t.bind("v", "__deliver()", face), t.proof]) + "\n"
    return prog, None


@position("return_inferred", "the receiving binding (the return cannot be annotated here)")
def p_return_inferred(t, face):
    return _returner(t, face, False)


@position("return_annotated", "the receiving binding")
def p_return_annotated(t, face):
    return _returner(t, face, True)


@position("argument", "the parameter")
def p_argument(t, face):
    sig = "function __take(a: %s) {" % t.ty if face == "ann" else "function __take(a) {"
    decls = [sig, ind("const v = a\n" + t.proof, 2), "}"]
    return assemble(t, decls=decls, body=["__take(%s)" % t.value])


@position("struct_field_init", "the destination struct binding")
def p_struct_field_init(t, face):
    decls = ["type __W = { f: %s }" % t.ty] if face == "ann" else []
    w = "const w: __W = { f: %s }" % t.value if face == "ann" else "const w = { f: %s }" % t.value
    return assemble(t, decls=decls, body=[w, "const v = w.f", t.proof])


@position("struct_field_assign", "the rebind that reads the field back")
def p_struct_field_assign(t, face):
    decls = ["type __W = { f: %s }" % t.ty]
    body = ["const w: __W = { f: %s }" % t.value, "w.f = %s" % t.value,
            t.bind("v", "w.f", face), t.proof]
    return assemble(t, decls=decls, body=body)


@position("array_element", "the list binding")
def p_array_element(t, face):
    xs = ("const xs: %s = [%s]" % (t.arr(), t.value)) if face == "ann" \
        else "const xs = [%s]" % t.value
    return assemble(t, body=[xs, "const v = xs[0]", t.proof])


@position("array_element_assign", "the rebind that reads the element back")
def p_array_element_assign(t, face):
    body = ["const xs: %s = [%s]" % (t.arr(), t.value), "xs[0] = %s" % t.value,
            t.bind("v", "xs[0]", face), t.proof]
    return assemble(t, body=body)


@position("array_push", "the rebind that reads the element back")
def p_array_push(t, face):
    # `.push` is its own position because it is its own lowering: D1197 is red HERE and
    # green at the eight siblings, the mirror of D965's global assignment.
    pre = ["const xs: %s = []" % t.arr()]
    body = ["xs.push(%s)" % t.value, t.bind("v", "xs[0]", face), t.proof]
    return assemble(t, pre=pre, body=body)


@position("global_init", "the global")
def p_global_init(t, face):
    if t.guard:
        return None, "a module global's initialiser cannot nest inside the template's GUARD"
    g = "let __g: %s = %s" % (t.ty, t.value) if face == "ann" else "let __g = %s" % t.value
    return assemble(t, pre=[g], body=["const v = __g", t.proof])


@position("global_assign", "the globals")
def p_global_assign(t, face):
    # `b = a` between two module globals: emitAssign's `global.set` arm, the position eight
    # callers of the ref family's widen site never hooked (D965).
    if t.guard:
        if not t.fallback:
            return None, "the template has a GUARD and no @@FALLBACK@@ to initialise the globals"
        pre = ["let __a: %s = %s" % (t.ty, t.fallback), "let __b: %s = %s" % (t.ty, t.fallback)] \
            if face == "ann" else ["let __a = %s" % t.fallback, "let __b = %s" % t.fallback]
        body = ["__a = %s" % t.value, "__b = __a", "const v = __b", t.proof]
        return assemble(t, pre=pre, body=body)
    pre = ["let __a: %s = %s" % (t.ty, t.value), "let __b: %s = %s" % (t.ty, t.value)] \
        if face == "ann" else ["let __a = %s" % t.value, "let __b = %s" % t.value]
    return assemble(t, pre=pre, body=["__b = __a", "const v = __b", t.proof])


@position("map_value", "the map binding")
def p_map_value(t, face):
    m = "const __m: { [string]: %s } = Map()" % t.ty if face == "ann" else "const __m = Map()"
    read = ["const __mv = __m[\"k\"]", "if __mv != null {",
            ind(t.bind("v", "__mv", face) + "\n" + t.proof, 2), "}"]
    return assemble(t, pre=[m], body=["__m[\"k\"] = %s" % t.value] + read)


@position("closure_capture", "the captured binding")
def p_closure_capture(t, face):
    body = [t.bind("__c", t.value, face),
            "const __f = () => {", ind("const v = __c\n" + t.proof, 2), "}", "__f()"]
    return assemble(t, body=body)


# --- discrimination shapes -------------------------------------------------

def _disc(t, face, shape):
    if not t.test:
        return None, "the template declares no @@TEST@@/@@HIT@@/@@MISS@@"
    return assemble(t, body=[t.bind("v", t.value, face), shape])


@position("is_in_if", "the binding")
def p_is_in_if(t, face):
    return _disc(t, face, "if %s {\n%s\n} else {\n%s\n}"
                 % (t.test, ind(t.hit, 2), ind(t.miss, 2)))


@position("is_in_while", "the binding")
def p_is_in_while(t, face):
    return _disc(t, face, "while %s {\n%s\n  break\n}\nif !(%s) {\n%s\n}"
                 % (t.test, ind(t.hit, 2), t.test, ind(t.miss, 2)))


@position("is_in_and", "the binding")
def p_is_in_and(t, face):
    # TWO ifs, not an if/else: `TEST && x` says nothing about `v` on the ELSE path, so a
    # single `else` branch cannot carry MISS's complement narrowing and the checker is right
    # to refuse it. Both polarities are conjuncts, and exactly one fires.
    return _disc(t, face, "const __yes = 1 == 1\nif %s && __yes {\n%s\n}\nif !(%s) && __yes {"
                 "\n%s\n}" % (t.test, ind(t.hit, 2), t.test, ind(t.miss, 2)))


@position("is_in_not", "the binding")
def p_is_in_not(t, face):
    return _disc(t, face, "if !(%s) {\n%s\n} else {\n%s\n}"
                 % (t.test, ind(t.miss, 2), ind(t.hit, 2)))


@position("else_if", "the binding")
def p_else_if(t, face):
    return _disc(t, face, "const __z = 0\nif __z == 1 {\n  print(\"unreached\")\n} "
                 "else if %s {\n%s\n} else {\n%s\n}"
                 % (t.test, ind(t.hit, 2), ind(t.miss, 2)))


@position("early_return_guard", "the parameter")
def p_early_return_guard(t, face):
    if not t.test:
        return None, "the template declares no @@TEST@@/@@HIT@@/@@MISS@@"
    sig = "function __guard(v: %s) {" % t.ty if face == "ann" else "function __guard(v) {"
    inner = "if %s {\n%s\n  return\n}\n%s" % (t.test, ind(t.hit, 2), t.miss)
    return assemble(t, decls=[sig, ind(inner, 2), "}"], body=["__guard(%s)" % t.value])


# --- two instances in one module ------------------------------------------

@position("two_instances", "both bindings")
def p_two_instances(t, face):
    if not t.value2:
        return None, "the template declares no @@VALUE2@@"
    one = ["function __one() {", ind(t.bind("v", t.value, face) + "\n" + t.proof, 2), "}"]
    two = ["function __two() {",
           ind(t.bind("v", t.value2, face, ty=t.ty2 or t.ty) + "\n" + (t.proof2 or t.proof), 2),
           "}"]
    return assemble(t, decls=one + two, body=["__one()", "__two()"])


# ---------------------------------------------------------------- driving

def build(t, name, fn, face):
    """A builder returns a program, or (None, reason) to skip. Normalise both."""
    if name in t.skips:
        return None, t.skips[name]
    got = fn(t, face)
    return got if isinstance(got, tuple) else (got, None)


def want_for(t, name):
    if name == "two_instances" and t.want2:
        return t.want + " then " + t.want2
    return t.want


def grade_all(t, seed, outdir, only, vl, env):
    cells = {}
    for name, _face_at, fn in POSITIONS:
        if only and name not in only:
            continue
        for face in FACES:
            cid = "%s_%s_%s" % (t.name, name, face)
            prog, skip = build(t, name, fn, face)
            if prog is None:
                cells[(name, face)] = ("skipped", skip or "no reason given")
                continue
            p = os.path.join(outdir, cid + ".vl")
            with open(p, "w", encoding="utf-8") as f:
                f.write("// %s — generated by matrix.py from %s. Should print %s.\n"
                        % (cid, os.path.basename(t.path), want_for(t, name)))
                f.write(prog)
            verdict, detail, out = probes.grade(p, seed, want_for(t, name), vl=vl, env=env)
            if verdict == "WRONG":
                detail = out or "(no output)"
            cells[(name, face)] = (verdict, detail)
    return cells


def short(v, d):
    if v == "RUNS":
        return "RUNS"
    if v == "skipped":
        return "skipped"
    if v == "WRONG":
        return "WRONG %s" % d.replace("\n", " / ")[:40]
    return "%s: %s" % (v.replace(" (check rc 0)", ""), d.replace("\n", " ")[:64])


def table(t, only, before, after):
    rows = [n for n, _, _ in POSITIONS if not only or n in only]
    head = "| position | face | %s |" % (" | ".join(["before", "after"]) if before else "grade")
    out = [head, "| --- | --- | %s |" % ("--- | ---" if before else "---")]
    for n in rows:
        for face in FACES:
            cell = short(*after[(n, face)])
            if before:
                cell = "%s | %s" % (short(*before[(n, face)]), cell)
            out.append("| `%s` | %s | %s |" % (n, FACE_LABEL[face], cell))
    return "\n".join(out)


def counts(cells):
    n = {"RUNS": 0, "SILENT": 0, "skipped": 0, "other": 0}
    for v, _ in cells.values():
        if v == "RUNS":
            n["RUNS"] += 1
        elif v.startswith("SILENT"):
            n["SILENT"] += 1
        elif v == "skipped":
            n["skipped"] += 1
        else:
            n["other"] += 1
    return n


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("template", nargs="?", help="a *.matrix.vl under matrix/")
    ap.add_argument("--compiler", default=probes.SEED, help="the seed to grade against")
    ap.add_argument("--before", help="a second seed; the table gains a before column")
    ap.add_argument("--after", help="with --before, the seed the after column uses")
    ap.add_argument("--only", default="", help="comma-separated positions")
    ap.add_argument("--keep", action="store_true", help="keep the generated programs")
    ap.add_argument("--out-dir", help="where --keep leaves them (default: a temp dir kept)")
    ap.add_argument("--vl", default=probes.VL)
    ap.add_argument("--std", default=os.path.join(ROOT, "std"))
    ap.add_argument("--list-positions", action="store_true")
    a = ap.parse_args(argv)

    if a.list_positions:
        for n, face_at, _ in POSITIONS:
            print("%-22s face annotates %s" % (n, face_at))
        return 0

    if not a.template:
        raise SystemExit("matrix.py: a template path is required (try --list-positions)")
    t = Tpl(a.template)
    only = set(x.strip() for x in a.only.split(",") if x.strip())
    known = {n for n, _, _ in POSITIONS}
    for n in sorted(only - known):
        raise SystemExit("unknown position %r (try --list-positions)" % n)
    env = dict(os.environ, VL_STD=a.std)

    outdir = a.out_dir or tempfile.mkdtemp(prefix="vl-matrix-%s-" % t.name)
    os.makedirs(outdir, exist_ok=True)
    try:
        after_seed = a.after or a.compiler
        before = grade_all(t, a.before, outdir, only, a.vl, env) if a.before else None
        after = grade_all(t, after_seed, outdir, only, a.vl, env)
    finally:
        if not a.keep and not a.out_dir:
            shutil.rmtree(outdir, ignore_errors=True)

    print("# %s — position x face matrix" % t.name)
    print("\ntemplate `%s` · want `%s` · seed `%s`"
          % (a.template, t.want, os.path.basename(after_seed)))
    if a.before:
        print("before `%s`" % os.path.basename(a.before))
    print()
    print(table(t, only, before, after))

    n = counts(after)
    graded = len(after) - n["skipped"]
    lost = []
    if before:
        lost = sorted(k for k in after
                      if before[k][0] == "RUNS" and after[k][0] != "RUNS")
    silent = sorted(k for k in after if after[k][0].startswith("SILENT"))
    print("\nruns %d of %d graded · %d skipped · %d silent · %d other"
          % (n["RUNS"], graded, n["skipped"], n["SILENT"], n["other"]))
    print("runs -> not-runs  %d%s" % (len(lost), "" if not lost else
                                      "   " + ", ".join("%s/%s" % k for k in lost)))
    print("-> silent         %d%s" % (len(silent), "" if not silent else
                                      "   " + ", ".join("%s/%s" % k for k in silent)))
    if a.keep or a.out_dir:
        print("\ngenerated programs kept in %s" % outdir)
    if lost:
        print("\nA cell that ran and no longer runs is the one movement the gate refuses on.")
    if silent:
        print("\nA SILENT cell is check-clean invalid wasm: the position was not wired.")
    return 1 if (lost or silent) else 0


if __name__ == "__main__":
    sys.exit(main())
