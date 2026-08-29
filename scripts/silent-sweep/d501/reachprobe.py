#!/usr/bin/env python3
"""THE REACH PROBE THAT FOUND D501's MECHANISM — and the reason it is committed is that a
one-site version of it produced a TRUE number with a FALSE cause attached.

    python3 scripts/silent-sweep/d501/reachprobe.py            # build the probe, print the table
    python3 scripts/silent-sweep/d501/reachprobe.py --verify   # + assert the probe distinguishes

WHAT IT MEASURES. For each cell of `scripts/silent-sweep/d411/gen411.py`'s grid, which of
FOUR sites the emitter enters for the grid's own literal binding `lv1`, and with what answer:

    R1  letRefListSlot      the local's CELL
    R2  letListBuildKind    the literal's BUILD kind
    R3  letListBuildSlot    the literal's BUILD slot
    R4  letRefListDestSlot  the destination rung D411 landed on
    box+/box-               whether the kind-2 (union BOX) scan answered
    k1+/k1-                 whether the kind-1 (plain struct row) scan answered

WHY FOUR SITES AND NOT ONE — THE LESSON THIS FILE EXISTS FOR. D411's close probed R4 alone,
read `reach=0` on exactly the 28 cells its landing did not move, and filed D501 saying
"something upstream claims the literal's element row" with `scanArrLitCommit` named as the
place to look. The NUMBER reproduced exactly on an independent rebuild. The CAUSE was wrong.
`reach=0` at a callee is compatible with at least three different stories — nobody asks, the
caller declines, or the caller's earlier arm already answered — and only a probe that spans
the call can separate them. With R1/R2/R3 on, the residue reads `R1 R2 R3` with no `R4`:
every caller IS entered and every one takes its `letAnn*` EARLY RETURN, because the ARM PIN
(`dstPinAnnIn` / `synthRetPinAnn`, four passes earlier) had already written an annotation
onto the binding. One extra tag per call site, in the same build.

THE CHANNEL. A module-level accumulator `probeAcc` in `emit_state.vl`, reported by the
DRIVER immediately after `emitProgram` returns. Not `print` — a `--compiler` build has no
`__print_*` imports wired, so a `print` probe dies with `unknown import` and reads as
reach=0 at every site, which is a probe that silently measures nothing. Not a bare
`emitFail` either — it keeps the FIRST message, so an ungated probe reports whichever
binding was queried first (D411's own first probe build reported `const gU = mU["k"] ?? []`
instead of the literal, and said so). Reporting from the driver fires for every program that
reached a probed site, whatever emit then did with it.

`--verify` IS THE DO-NOTHING RULE, EXECUTED. A probe whose answer does not depend on the
thing under test measures nothing, and prose does not fail a run. Three assertions, each
true on ANY seed — the R4 split itself is seed-dependent (28 cells miss it on `f7a0bfba`'s
base, 0 on the landing) and so is REPORTED rather than asserted:

  (a) every cell reports a PROBE line at all. A probe that reads `-` everywhere is the
      failure mode this channel exists to avoid, and it is exactly what a `print` probe
      does in a `--compiler` build.
  (b) the `k1` answer VARIES with the cell: the `__none__` controls (one destination) must
      read `k1-` and some two-destination cell must read `k1+`. If both read the same the
      probe is reporting the BUILD, not the program.
  (c) every `__none__` control reaches R4. They RUN, so the rung demonstrably answered for
      them; a probe that cannot see that is not seeing the rung.

The probe MUTATES `compiler/*.vl` and restores it with `git checkout`. It refuses to run
with uncommitted changes there, because restoring would discard them.
"""
import os
import re
import subprocess
import sys
import concurrent.futures
from collections import Counter

R = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".."))
VL = os.path.join(R, "scripts/vl-host/target/release/vl")
GEN = os.path.join(R, "scripts/silent-sweep/d411/gen411.py")
JOBS = int(os.environ.get("JOBS", "6"))

# Each entry is (file, unique anchor, replacement). Every anchor is asserted to occur
# EXACTLY once — a probe applied to a moved anchor is a probe on a different program.
PATCH = [
    ("compiler/emit_state.vl",
     "export let emitErrAt = -1\n",
     "export let emitErrAt = -1\nexport let probeAcc = \"\"\n"),
    ("compiler/emit_classify.vl",
     "  vbI64Used,\n} from \"./emit_state\"",
     "  probeAcc,\n  vbI64Used,\n} from \"./emit_state\""),
    ("compiler/emit_classify.vl",
     "export function letRefListDestSlot(letIx: i32, fnIx: i32): i32 {\n"
     "  const box = letRefListDestSlotK(letIx, fnIx, 2)\n",
     "export function letRefListDestSlot(letIx: i32, fnIx: i32): i32 {\n"
     "  const pdA = P.nodes[letIx]\n"
     "  if pdA is LetDecl {\n"
     "    if pdA.letName == \"lv1\" { probeAcc = probeAcc + \"R4 \" }\n"
     "  }\n"
     "  const box = letRefListDestSlotK(letIx, fnIx, 2)\n"
     "  const pdB = P.nodes[letIx]\n"
     "  if pdB is LetDecl {\n"
     "    if pdB.letName == \"lv1\" {\n"
     "      if box >= 0 { probeAcc = probeAcc + \"box+ \" } else { probeAcc = probeAcc + \"box- \" }\n"
     "      if letRefListDestSlotK(letIx, fnIx, 1) >= 0 { probeAcc = probeAcc + \"k1+ \" } "
     "else { probeAcc = probeAcc + \"k1- \" }\n"
     "    }\n"
     "  }\n"),
    ("compiler/emit_classify.vl",
     "export function letRefListSlot(letIx: i32, fnIx: i32) {\n  const d = P.nodes[letIx]\n",
     "export function letRefListSlot(letIx: i32, fnIx: i32) {\n"
     "  const pd1 = P.nodes[letIx]\n"
     "  if pd1 is LetDecl {\n"
     "    if pd1.letName == \"lv1\" { probeAcc = probeAcc + \"R1 \" }\n"
     "  }\n"
     "  const d = P.nodes[letIx]\n"),
    ("compiler/emit_classify.vl",
     "export function letListBuildKind(letIx: i32, fnIx: i32): i32 {\n"
     "  const k = letAnnRefListKind(letIx)\n",
     "export function letListBuildKind(letIx: i32, fnIx: i32): i32 {\n"
     "  const pd2 = P.nodes[letIx]\n"
     "  if pd2 is LetDecl {\n"
     "    if pd2.letName == \"lv1\" { probeAcc = probeAcc + \"R2 \" }\n"
     "  }\n"
     "  const k = letAnnRefListKind(letIx)\n"),
    ("compiler/emit_classify.vl",
     "export function letListBuildSlot(letIx: i32, fnIx: i32): i32 {\n"
     "  if letAnnRefListKind(letIx) == 0 {\n",
     "export function letListBuildSlot(letIx: i32, fnIx: i32): i32 {\n"
     "  const pd3 = P.nodes[letIx]\n"
     "  if pd3 is LetDecl {\n"
     "    if pd3.letName == \"lv1\" { probeAcc = probeAcc + \"R3 \" }\n"
     "  }\n"
     "  if letAnnRefListKind(letIx) == 0 {\n"),
    ("compiler/driver.vl",
     "  emitErr,\n  emitErrAt,\n",
     "  emitErr,\n  emitErrAt,\n  emitFailed,\n  probeAcc,\n"),
    ("compiler/driver.vl",
     "  const rc = emitProgram(root)\n  if rc < 0 { return 3 }\n",
     "  const rc = emitProgram(root)\n"
     "  if probeAcc.length > 0 {\n"
     "    emitFailed = true\n"
     "    emitErr = \"PROBE \" + probeAcc\n"
     "    emitErrAt = -1\n"
     "    W.bytes = []\n"
     "    return 3\n"
     "  }\n"
     "  if rc < 0 { return 3 }\n"),
]


def sh(*args, **kw):
    return subprocess.run(args, cwd=R, capture_output=True, text=True, **kw)


def apply_patch():
    for path, old, new in PATCH:
        p = os.path.join(R, path)
        s = open(p).read()
        if s.count(old) != 1:
            raise SystemExit("ANCHOR x%d in %s: %s" % (s.count(old), path, repr(old[:60])))
        open(p, "w").write(s.replace(old, new))


def read_probe(cells, seed):
    def one(path):
        r = subprocess.run([VL, "run", path, "--compiler", seed],
                           capture_output=True, text=True)
        m = re.search(r"PROBE ([^\n]*)", (r.stderr or "") + (r.stdout or ""))
        return (os.path.basename(path)[:-3], m.group(1).strip() if m else "-")
    with concurrent.futures.ThreadPoolExecutor(max_workers=JOBS) as ex:
        return dict(ex.map(one, cells))


def main():
    if sh("git", "diff", "--quiet", "--", "compiler").returncode != 0:
        print("compiler/ has uncommitted changes — this probe restores it with `git checkout`, "
              "which would discard them. Commit or stash first.")
        return 2
    seed = os.path.join(R, "build/vl-compiler.wasm")
    gdir = os.path.join(R, "scratch-silent/d501probe")
    subprocess.run([sys.executable, GEN, gdir], cwd=R, check=True,
                   stdout=subprocess.DEVNULL)
    cells = sorted(os.path.join(gdir, f) for f in os.listdir(gdir) if f.endswith(".vl"))

    out = os.path.join(R, "build/d501probe.wasm")
    apply_patch()
    try:
        b = sh(VL, "build", "compiler/entry.vl", "-o", out, "--compiler", seed)
        if b.returncode != 0:
            print("probe build FAILED — it measured nothing, and says so:")
            print((b.stderr or b.stdout)[-2000:])
            return 1
    finally:
        sh("git", "checkout", "--", "compiler")

    res = read_probe(cells, out)
    for n in sorted(res):
        print("%-46s %s" % (n, res[n]))
    print("\n-- probe lines --")
    for k, v in sorted(Counter(res.values()).items(), key=lambda kv: -kv[1]):
        print("  %5d  %s" % (v, k))

    if "--verify" not in sys.argv:
        return 0

    withR4 = {n for n, v in res.items() if "R4" in v}
    ctls = {n for n in res if n.endswith("__none__u_first")}
    bad = []
    # (a) the probe REPORTED. `-` everywhere is a probe that measured nothing.
    silent = [n for n, v in res.items() if v == "-"]
    if silent:
        bad.append("(a) %d cells reported nothing at all: %s" % (len(silent), silent[:4]))
    # (b) the answer depends on the PROGRAM: the controls must read k1- and some
    #     two-destination cell must read k1+.
    ctl_k1 = {n for n in ctls if "k1-" in res[n]}
    any_k1p = {n for n in res if "k1+" in res[n]}
    if len(ctl_k1) != len(ctls) or not any_k1p:
        bad.append("(b) the k1 answer does not vary with the cell — the probe reads the "
                   "build, not the program")
    # (c) a cell known to consult the rung is seen to.
    missing = sorted(ctls - withR4)
    if missing:
        bad.append("(c) a single-destination control did not reach R4: %s" % missing[:4])
    print("\n(a) cells reporting a PROBE line : %d of %d" % (len(res) - len(silent), len(res)))
    print("(b) controls reading k1-        : %d of %d   cells reading k1+: %d"
          % (len(ctl_k1), len(ctls), len(any_k1p)))
    print("(c) controls reaching R4        : %d of %d" % (len(ctls & withR4), len(ctls)))
    print("--  cells NOT reaching R4       : %d   (28 on master f7a0bfba's base seed, "
          "0 once the arm pin declines the conflict — REPORTED, not asserted)"
          % (len(res) - len(withR4)))
    for b_ in bad:
        print("  VERIFY FAILED " + b_)
    print("verify: %s" % ("OK" if not bad else "FAILED"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
