#!/usr/bin/env python3
"""Run every capability probe and report which still refuse.

Each probe is a program the TYPE SYSTEM ACCEPTS and codegen refuses — the gaps that are
invisible to the distilled corpus because the census axes generate no program for them.
See README.md.

NOT A MERGE GATE. Today every probe fails, by construction; that is what makes them probes.
Run it to find out whether a change moved something the corpus could not see.
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
        chk = subprocess.run([VL, "check", p, "--compiler", a.compiler],
                             capture_output=True, text=True, timeout=120)
        run = subprocess.run([VL, "run", p, "--compiler", a.compiler],
                             capture_output=True, text=True, timeout=120)
        want = expected(p)
        out = run.stdout.strip()
        if run.returncode == 0:
            ok = want is None or matches(want, out)
            (now if ok else still).append((fn, "RUNS but output %r, header says %r"
                                           % (out, want) if not ok else "runs"))
        else:
            err = (chk.stdout + chk.stderr + run.stdout + run.stderr)
            # A HINT is advice on a program that type-checked; it is never the refusal, and
            # letting it through as the fallback labelled the SILENT probe with a note about
            # a redundant annotation.
            lines = [l for l in err.splitlines()
                     if l.strip() and "[HINT]" not in l and not l.startswith(" ")]
            m = re.search(r"(not yet supported|has no lowering|not supported by codegen)"
                          r"[^\n\"]{0,54}", err)
            if chk.returncode != 0:
                where = "check refuses"          # clause 2: the checker owns the diagnosis
            elif re.search(r"wasm backtrace|call stack exhausted", err):
                # THE COMPILER ITSELF TRAPPED. Not a refusal at all -- no diagnosis was
                # produced and no module was written. It used to land in the `emit refuses`
                # fallback, which reads as an orderly decision the compiler never made.
                where = "COMPILER TRAP (check rc 0)"
            elif re.search(r"Invalid input WebAssembly|WebAssembly translation error"
                           r"|failed to parse WebAssembly", err):
                # clause 1: worse, and easy to misread as emit. `failed to parse` is the
                # same outcome as the other two reached by a different host path -- a probe
                # was graded `emit refuses` on its absence, with the DETAIL line then
                # printing "Checked 1 file, no errors", which is the symptom of a SILENT
                # cell and not of a refusal. Classify by what happened to the MODULE.
                where = "SILENT (check rc 0)"
            else:
                where = "emit refuses"
            inv = re.search(r"(Invalid input WebAssembly code[^\n]{0,60}|"
                            r"type mismatch: expected [^\n]{0,48})", err)
            if where.startswith("SILENT") or where.startswith("COMPILER TRAP"):
                # The validator's own sentence, not the clean `vl check` output that
                # precedes it -- "Checked 1 file, no errors" is the SYMPTOM, not the detail.
                detail = inv.group(0) if inv else (lines[-1][:70] if lines else err[:70])
            else:
                detail = m.group(0) if m else (lines[0][:70] if lines else err[:70])
            still.append((fn, f"{where}: {detail}"))

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
