#!/usr/bin/env python3
"""Run every capability probe and report which still refuse.

Each probe is a program the TYPE SYSTEM ACCEPTS and codegen refuses — the gaps that are
invisible to the distilled corpus because the census axes generate no program for them.
See README.md.

NOT A MERGE GATE. Today every probe fails, by construction; that is what makes them probes.
Run it to find out whether a change moved something the corpus could not see.

`matches`, `classify` and `grade` are the shared grading vocabulary; `matrix.py` imports
them so a generated position cell and a hand-written probe are read on the same scale.
"""
import argparse, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")
SEED = os.path.join(ROOT, "build", "vl-compiler.wasm")


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


def grade(path, compiler, want, vl=VL, env=None, timeout=120):
    """Grade one program: (verdict, detail, stdout).

    ONE `vl` invocation per healthy cell — `run` first, and `check` only when the run
    failed, since the rc is all a passing cell needs and only a failing one has a channel
    to name. Verdicts: RUNS · WRONG · check refuses · emit refuses · SILENT (check rc 0) ·
    COMPILER TRAP (check rc 0) · TIMEOUT.
    """
    try:
        run = subprocess.run([vl, "run", path, "--compiler", compiler],
                             capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "no answer in %ss" % timeout, ""
    out = run.stdout.strip()
    if run.returncode == 0:
        if want is None or matches(want, out):
            return "RUNS", "", out
        return "WRONG", out, out
    try:
        chk = subprocess.run([vl, "check", path, "--compiler", compiler],
                             capture_output=True, text=True, timeout=timeout, env=env)
    except subprocess.TimeoutExpired:
        return "TIMEOUT", "check gave no answer in %ss" % timeout, out
    err = chk.stdout + chk.stderr + run.stdout + run.stderr
    where, detail = classify(chk.returncode, err)
    return where, detail, out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--compiler", default=SEED)
    a = ap.parse_args()

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
