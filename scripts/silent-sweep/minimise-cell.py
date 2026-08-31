#!/usr/bin/env python3
"""Greedy line-removal minimiser for a silent corpus cell.

Keep a line removed iff the program stays check-clean AND still fails the engine with the
SAME validator sentence. What survives is the cell's minimal witness; ablating THAT one
ingredient at a time is what defines the defect's family.

    python3 scripts/silent-sweep/minimise-cell.py scripts/silent-sweep/distilled/cells/a005701.vl

WHY THIS EXISTS. A validator sentence is not a mechanism -- the engine elides both type
names, so `type mismatch: expected (ref $type), found (ref $type)` is printed for every
heap-type disagreement in the module and cells carrying it have nothing else in common.
Grouping by the message was wrong twice on 2026-08-30: D611 was filed as "58 cells, the
largest single family" and had 3, and D613/D623 share a sentence with unrelated roots
(a captured empty list literal vs an un-annotated Map carrier). Both fell out of this loop
in under a minute each. See CLAUDE.md, "A VALIDATOR SENTENCE IS NOT A MECHANISM".

Reads the seed at build/vl-compiler.wasm; pass --compiler for another."""
import subprocess, sys, tempfile, os, re
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
VL = os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl")
C = os.path.join(ROOT, "build", "vl-compiler.wasm")
SIG=re.compile(r'type mismatch: expected [^,]*, found [^,\n]*')

def grade(src):
    with tempfile.TemporaryDirectory() as td:
        f=os.path.join(td,"w.vl"); open(f,"w").write(src)
        chk=subprocess.run([VL,"check",f,"--compiler",C],capture_output=True,text=True,timeout=60)
        if chk.returncode!=0: return None
        run=subprocess.run([VL,"run",f,"--compiler",C],capture_output=True,text=True,timeout=60)
        if run.returncode==0: return None
        m=SIG.search(run.stdout+run.stderr)
        return m.group(0) if m else None

def minimise(src):
    want=grade(src)
    if want is None: return None,None
    lines=src.split("\n")
    changed=True
    while changed:
        changed=False
        i=0
        while i<len(lines):
            trial=lines[:i]+lines[i+1:]
            if grade("\n".join(trial))==want:
                lines=trial; changed=True
            else:
                i+=1
    return "\n".join(lines), want

if __name__=="__main__":
    args=[a for a in sys.argv[1:] if not a.startswith("--")]
    for i,a in enumerate(sys.argv):
        if a=="--compiler": C=sys.argv[i+1]
    src=open(args[0]).read()
    out,sig=minimise(src)
    if out is None: print("NOT REPRODUCED"); sys.exit(1)
    print(f"### {args[0]}\n### {sig}\n{out}")
