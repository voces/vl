#!/usr/bin/env python3
"""Run every capability probe and report which still refuse.

Each probe is a program `vl check` ACCEPTS, one per known capability gap — the gaps the
distilled corpus cannot see, since the census axes generate no program for them. Most run
today, so the measurement is the summary line: how many gaps run against how many refuse.
A refusal is a clause-2 violation by construction (`check` returned 0 to reach the emitter);
a `SILENT` cell is a clause-1 one, check-clean invalid wasm, and worse. README.md.

`matches`, `classify` and `grade` are the shared grading vocabulary; `matrix.py` imports
them so a generated position cell and a hand-written probe are read on the same scale.
"""
import argparse, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")
SEED = os.path.join(ROOT, "build", "vl-compiler.wasm")
# `vl` resolves `std:` from the EXE's checkout, and an agent worktree symlinks the host
# binary at the main repo — so an unpinned probe grades THIS tree's seed against the main
# checkout's `std/`. `matrix.py` pins it; the default here is what every caller gets.
ENV = dict(os.environ, VL_STD=os.path.join(ROOT, "std"))


def matches(want, out):
    """Does `out` satisfy the header's `Should print ...` contract?

    Three spellings, because a probe's contract is prose and the grader should read the
    prose rather than force every probe into one shape: a bare substring ("2"), "X twice"
    (the same value on two lines), and "X then Y then Z" (a sequence of lines). Without the
    last one a probe whose contract is two DIFFERENT values graded GAP while running
    correctly — `u8-list-nullable-return` printed `1\n0` against a header saying `1 then 0`.
    """
    w = want.strip()
    if " then " in w:
        parts = [p.strip() for p in w.split(" then ")]
        lines = [l.strip() for l in out.strip().splitlines()]
        return lines == parts
    return w.replace(" twice", "") in out


def expected(path):
    """The `Should print ...` line in the probe's header, as the contract it is graded on."""
    for line in open(path, encoding="utf-8"):
        if not line.startswith("//"):
            break
        m = re.search(r"Should print (.+?)\.?\s*$", line)
        if m:
            return m.group(1).strip()
    return None


def classify(chk_rc, err):
    """Name the refusal channel from `vl check`'s rc and the combined output.

    Classify by what happened to the MODULE, never by the sentence: `failed to parse` and
    `Invalid input WebAssembly` are one outcome reached by two host paths, and a probe
    graded `emit refuses` on the absence of one printed "Checked 1 file, no errors" as its
    detail — the symptom of a SILENT cell, not of a refusal.
    """
    # A HINT, a WARNING or an INFO is advice on a program that type-checked; none is ever
    # the refusal, and letting one through as the fallback labelled a SILENT probe with a
    # note about an annotation, a day-one emit reject with `Unused variable`, and a
    # modules_split emit reject with `is never reassigned; use const`.
    # `Checked N files, no errors.` and a bare `Error: emit error` are scenery for the same
    # reason: the first is the CHECK phase's success and the second names no cause, and both
    # sort ahead of the sentence, so an emit reject's detail read "no errors".
    lines = [re.sub(r"^\S+?:\d+:\d+:\s*", "", l).strip() for l in err.splitlines()
             if "[HINT]" not in l and "[WARNING]" not in l and "[INFO]" not in l
             and not l.startswith(" ")
             and not re.match(r"^Checked \d+ file|^Found \d+ error|"
                              r"^Error: \w+ error\s*$", l)]
    lines = [l for l in lines if l and l != "[ERROR]:"]
    m = re.search(r"(not yet supported|has no lowering|not supported by codegen)"
                  r"[^\n\"]{0,54}", err)
    if chk_rc != 0:
        where = "check refuses"                  # clause 2: the checker owns the diagnosis
    elif re.search(r"wasm backtrace|call stack exhausted", err):
        # THE COMPILER ITSELF TRAPPED -- no diagnosis produced, no module written. It used
        # to land in the `emit refuses` fallback, which reads as an orderly decision.
        where = "COMPILER TRAP (check rc 0)"
    elif re.search(r"Invalid input WebAssembly|WebAssembly translation error"
                   r"|failed to parse WebAssembly", err):
        where = "SILENT (check rc 0)"            # clause 1, and worse than an emit reject
    else:
        where = "emit refuses"
    inv = re.search(r"(Invalid input WebAssembly code[^\n]{0,60}|"
                    r"type mismatch: expected [^\n]{0,48})", err)
    if where.startswith("SILENT") or where.startswith("COMPILER TRAP"):
        detail = inv.group(0) if inv else (lines[-1][:70] if lines else err[:70])
    else:
        detail = m.group(0) if m else (lines[0][:70] if lines else err[:70])
    return where, detail


def grade_full(path, compiler, want, vl=VL, env=None, timeout=120):
    """Grade one program: (verdict, detail, stdout, the WHOLE refusal text).

    ONE `vl` invocation per healthy cell — `run` first, and `check` only when the run
    failed, since the rc is all a passing cell needs and only a failing one has a channel
    to name. Verdicts: RUNS · WRONG · check refuses · emit refuses · SILENT (check rc 0) ·
    COMPILER TRAP (check rc 0) · TIMEOUT. `env` defaults to this checkout's `std:`.

    The fourth value is what `detail` is a 70-character slice of. `live-sites.json` asks
    whether a refusal contains a given LITERAL, and a literal that is interpolated late in
    its message (`… bound by a parameter — a layout constant is per-instance`) falls outside
    that slice — so the question has to be asked of the whole text.
    """
    env = env or ENV
    try:
        run = subprocess.run([vl, "run", path, "--compiler", compiler],
                             capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "no answer in %ss" % timeout, "", ""
    out = run.stdout.strip()
    if run.returncode == 0:
        if want is None or matches(want, out):
            return "RUNS", "", out, ""
        return "WRONG", out, out, ""
    try:
        chk = subprocess.run([vl, "check", path, "--compiler", compiler],
                             capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "check gave no answer in %ss" % timeout, out, ""
    err = chk.stdout + chk.stderr + run.stdout + run.stderr
    where, detail = classify(chk.returncode, err)
    return where, detail, out, err


def grade(path, compiler, want, vl=VL, env=None, timeout=120):
    """`grade_full` without the refusal text — the shape `matrix.py` and the runner use."""
    verdict, detail, out, _err = grade_full(path, compiler, want, vl, env, timeout)
    return verdict, detail, out


LIVE_SITES = os.path.join(HERE, "live-sites.json")


def load_live_sites(path=LIVE_SITES):
    """The committed list of refusal literals a WITNESS has shown a check-clean program reaches.

    `goal-scoreboard.py`'s other count reads the compiler's WORDING, and a refusal is not
    obliged to admit it is a capability gap — `emitProgram: fromCodePoints argument must be a
    named i32[] binding` fired on a `vl check`-clean program for months and matched no phrase.
    So the wording count is a lower bound and this list is the population it cannot see. An
    entry earns its place by naming a probe in this directory that reaches its literal; the
    day that probe runs, the entry comes off.
    """
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)["sites"]


def compiler_source(root):
    """`compiler/*.vl` as one text, so a listed literal that has LEFT the tree is caught
    rather than counted forever.

    Searched for the QUOTED spelling rather than paired into literals: pairing quotes across
    a whole file is thrown off by a single `"` inside a comment, and it silently lost
    `emitProgram: function-value call arity has no interned signature` — a literal that is
    plainly there.
    """
    src = os.path.join(root, "compiler")
    return "\n".join(open(os.path.join(src, fn), encoding="utf-8").read()
                     for fn in sorted(os.listdir(src)) if fn.endswith(".vl"))


def check_live_sites(compiler, path=LIVE_SITES, root=ROOT):
    """Grade every listed site's witness. Returns (rows, rc).

    Four ways a row is wrong, and each names its own fix:
      FELL   the probe RUNS — the gap closed, so delete the entry in the closing PR.
      DRIFT  the probe still refuses, with a DIFFERENT message — the witness stopped
             reaching the site it was written for, so it no longer evidences this literal.
      GONE   the literal is no longer in `compiler/*.vl` — the site was deleted or reworded.
      NOPROBE the named probe file does not exist, so the entry rests on nothing.
    """
    sites = load_live_sites(path)
    src = compiler_source(root)
    rows, bad = [], 0
    for s in sites:
        lit, probe = s["literal"], s["probe"]
        p = os.path.join(HERE, probe)
        if not os.path.exists(p):
            rows.append(("NOPROBE", lit, probe, "no such file in scripts/capability-probes/"))
            bad += 1
            continue
        if '"' + lit not in src:
            rows.append(("GONE", lit, probe, "literal is no longer in compiler/*.vl"))
            bad += 1
            continue
        verdict, detail, _out, err = grade_full(p, compiler, expected(p))
        if verdict == "RUNS":
            rows.append(("FELL", lit, probe, "the witness RUNS — delete this entry"))
            bad += 1
        elif lit not in err:
            rows.append(("DRIFT", lit, probe, f"{verdict}: {detail}"))
            bad += 1
        else:
            rows.append(("LIVE", lit, probe, verdict))
    return rows, (1 if bad else 0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", default=SEED)
    ap.add_argument("--live-sites", action="store_true",
                    help="grade only the committed witness-backed refusal-site list")
    a = ap.parse_args()

    if a.live_sites:
        rows, rc = check_live_sites(a.compiler)
        for verdict, lit, probe, detail in rows:
            print(f"  {verdict:<7} {lit[:64]:<66} {probe}")
            if verdict != "LIVE":
                print(f"          {detail}")
        live = len([r for r in rows if r[0] == "LIVE"])
        print(f"\n{live} of {len(rows)} listed refusal sites still refuse a check-clean program")
        if rc:
            print("A row above is not what the list claims. The list is a RATCHET: a witness")
            print("that starts running comes OFF it in the PR that closed the gap, and a row")
            print("may only be ADDED with a probe that reaches its literal.")
        return rc

    probes = sorted(f for f in os.listdir(HERE) if f.endswith(".vl"))
    if not probes:
        print("no probes found -- that is a failure, not a pass")
        return 1

    still, now = [], []
    for fn in probes:
        p = os.path.join(HERE, fn)
        want = expected(p)
        verdict, detail, out = grade(p, a.compiler, want)
        if verdict == "RUNS":
            now.append((fn, "runs"))
        elif verdict == "WRONG":
            still.append((fn, "RUNS but output %r, header says %r" % (out, want)))
        else:
            still.append((fn, f"{verdict}: {detail}"))

    for fn, why in now:
        print(f"  RUNS  {fn}")
    for fn, why in still:
        print(f"  GAP   {fn}\n          {why}")
    print(f"\n{len(now)} of {len(probes)} capability probes run · {len(still)} still refuse")
    if still:
        print("Each line above is a program the type system accepts and codegen will not build.")
    return 1 if still else 0


if __name__ == "__main__":
    sys.exit(main())
