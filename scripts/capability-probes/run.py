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
            ok = want is None or want.replace(" twice", "") in out
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
            elif re.search(r"Invalid input WebAssembly|WebAssembly translation error", err):
                where = "SILENT (check rc 0)"    # clause 1: worse, and easy to misread as emit
            else:
                where = "emit refuses"
            inv = re.search(r"(Invalid input WebAssembly code[^\n]{0,60}|"
                            r"type mismatch: expected [^\n]{0,48})", err)
            if where.startswith("SILENT"):
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
