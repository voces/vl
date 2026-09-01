#!/usr/bin/env python3
"""Where is the emitter's module-scope mutable state CLEARED?

`docs/internals/emitter-module-state.md` is this script's output with prose around it, and
that is deliberate: an audit table hand-written once goes stale in ONE direction — a
variable that gains a reset keeps reading as a hazard, and one that loses its reset keeps
reading as safe. Re-run this before quoting the doc.

WHAT IT MEASURES. Every `let` / `export let` at column 0 in the emitter's own files is a
module-scope mutable: it survives a compile, and the wasm instance survives many compiles
(the LSP server, `tests/cases_wasm_test.ts`). For each one it finds every assignment in
`compiler/*.vl`, splits them into CLEARS (the declaration's own initial value written back)
and working writes, and reports the enclosing function of each clear.

WHAT IT DOES NOT MEASURE, stated so the output is not over-read:
  * "cleared" is textual. A variable rewritten UNCONDITIONALLY every compile is just as
    safe as one cleared, and this script cannot tell an unconditional rewrite from a
    guarded one — `aTypeIdx = mAllocType()` in both arms of an `if` reads as NEVER cleared
    and is fine. So the NEVER column is a list of things to ASK ABOUT, not a defect list.
  * the only thing that settles a row is a witness, and the witness is
    `tests/vl_instance_state_leak_test.ts` — compile P after Q on one instance and compare
    with P on a fresh one. That is what found D1006/D1007 in this list.

Usage:  python3 scripts/emitter-state-audit.py [--names] [--flags]
"""
import collections
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CDIR = os.path.join(ROOT, "compiler")

# The emitter's own modules. The checker (`typecheck.vl`, `check_state.vl`) and the front
# end have the same hazard and their own reset homes; this audit is scoped to the emitter
# because that is where both filed rows live.
EMIT = [
    "emit_state.vl", "emit_classify.vl", "emit_collect.vl", "emit_sections.vl",
    "emit_base.vl", "emit_rep.vl", "emit_bytes.vl", "emit_query.vl", "emit_mono.vl",
    "emit_rewrite.vl", "emit_bignum.vl", "wasmEmit.vl",
]

# `emitProgram`'s own prologue plus the `*Reset` helpers it calls there: state cleared in
# one of these is clean before any pass of the next program runs. This list is the audit's
# one hand-maintained input; a helper added to the prologue and not added here shows up as
# "inner", which reads as more hazardous than it is.
PROLOGUE = {
    "emitProgram", "emitModule", "compileSrc", "checkSrc", "checkSrcSym", "srcReset",
    "modReset", "resetLitAtoms", "repReset", "msPoolReset", "resetRetMapFlight",
    "resetParentLetCache", "sidResetParentLet", "sidResetStartBlockLet", "hcReset",
    "sidKeyedTablesReset", "structTyIxReset", "structNameIxReset", "sioMemoReset",
    "shapeSetIxReset", "cliArgReset", "lintReset", "sidReset", "tsReset",
    "ufcsAliasReset", "dgLosslessReset", "covarWriteReset", "repSlotCacheSync",
    "rtSync", "repShadowSweep",
}
# `emitProgram`'s ordered pass table (see `runEmitPass`). Once per compile, but AFTER the
# rows above it — so a pass-cleared column is stale for anything an EARLIER pass reads.
PASS = {
    "collectTyParamNames", "collectU", "collectS", "collectA", "collectFns",
    "passCheckTopLevel", "buildFnMap", "computeVoidFns", "computeRetInference",
    "dispatchRewrite", "captureBoxRewrite", "synthRetAnnots", "synthDstPinAnns",
    "scanArrLitCommit", "monomorphize", "collectGenAliasShapes", "collectAnnShapes",
    "synthGlobalEmptyListAnns", "synthVoidTwins", "synthParamAnnots",
    "collectMapFilterUse", "collectFnValUse", "collectCloSigs", "scanPrintUse",
    "checkFnParams", "capCacheBuild", "capNarrowBuild", "synthCaptureEmptyListAnns",
    "collectInlineUnions", "computeGlobalPromotion", "mAssignTypeIndices",
    "collectStartLocals", "gaeCollectDecls", "emitGlobalSection",
}
# The two FRAME builders. Per function, not per compile — `emitFuncCode` for a declared
# function, `startFnDetectScratch` for the start function (top-level statements + the
# global initializers that run there). They must clear the SAME flags: a flag one clears
# and the other does not survives into the next program's start function. That asymmetry
# is D1006/D1007.
FRAME = {"emitFuncCode", "startFnDetectScratch"}


def decls():
    out = {}
    for f in EMIT:
        p = os.path.join(CDIR, f)
        if not os.path.exists(p):
            continue
        for i, ln in enumerate(open(p), 1):
            m = re.match(
                r"^(?:export )?let ([A-Za-z_][A-Za-z0-9_]*)\s*"
                r"(?::\s*([^=]+?))?\s*=\s*(.*?)\s*(?://.*)?$", ln.rstrip("\n"))
            if m:
                out[m.group(1)] = dict(
                    file=f, line=i, ty=(m.group(2) or "").strip(), init=m.group(3).strip())
    return out


def spans(path):
    lines = open(path).read().split("\n")
    cur, out = None, []
    for i, ln in enumerate(lines, 1):
        m = re.match(r"^(?:export )?function ([A-Za-z_][A-Za-z0-9_]*)", ln)
        if m:
            if cur:
                out.append((cur[0], cur[1], i - 1))
            cur = (m.group(1), i)
        elif ln == "}" and cur:
            out.append((cur[0], cur[1], i))
            cur = None
    if cur:
        out.append((cur[0], cur[1], len(lines)))
    return out


def main():
    d = decls()
    files = sorted(f for f in os.listdir(CDIR) if f.endswith(".vl"))
    fnspans = {f: spans(os.path.join(CDIR, f)) for f in files}

    def fn_at(f, line):
        for name, a, b in fnspans[f]:
            if a <= line <= b:
                return name
        return "<module>"

    # Longest name first so `fnUsesMap` cannot claim `fnUsesMapVals`'s write.
    names = sorted(d, key=len, reverse=True)
    pat = re.compile(r"(?<![A-Za-z0-9_.])(" + "|".join(re.escape(n) for n in names) +
                     r")\s*=(?!=)\s*([^\s].*?)\s*(?:\}|//|$)")

    clears = collections.defaultdict(list)
    # Every assignment's enclosing function, clear or not. The frame-builder comparison
    # reads THIS, not `clears`: `fnUsesStrOp = fnHasStrOp(fnIx)` re-decides the flag from
    # scratch and is exactly as safe as writing `false`, so counting only literal clears
    # would report five false asymmetries.
    assigned = collections.defaultdict(set)
    writes = collections.Counter()
    for f in files:
        for i, ln in enumerate(open(os.path.join(CDIR, f)), 1):
            if ln.lstrip().startswith("//") or re.match(r"^(?:export )?let\s", ln):
                continue
            for m in pat.finditer(ln.split("//")[0]):
                name, rhs = m.group(1), m.group(2).strip().rstrip("}").strip()
                writes[name] += 1
                assigned[name].add(fn_at(f, i))
                if rhs == d[name]["init"]:
                    clears[name].append((f, i, fn_at(f, i)))

    kinds, homes = {}, {}
    for n in d:
        fns = sorted({c[2] for c in clears[n]})
        homes[n] = fns
        if any(f in PROLOGUE for f in fns):
            kinds[n] = "prologue"
        elif any(f in PASS for f in fns):
            kinds[n] = "pass"
        elif any(f in FRAME for f in fns):
            kinds[n] = "frame"
        elif fns:
            kinds[n] = "inner"
        else:
            kinds[n] = "NEVER"

    c = collections.Counter(kinds.values())
    print("module-scope mutables in the emitter: %d" % len(d))
    for k in ("prologue", "pass", "frame", "inner", "NEVER"):
        print("  %-9s %4d" % (k, c[k]))

    print("\nTHE TWO FRAME BUILDERS MUST AGREE — a flag one clears and the other does not")
    print("survives into the next program's START function.")
    bad = []
    for n in sorted(d):
        if not n.startswith("fnUses"):
            continue
        h = assigned[n]
        a, b = "emitFuncCode" in h, "startFnDetectScratch" in h
        if a != b:
            bad.append(n)
        print("  %-20s emitFuncCode %-4s startFnDetectScratch %-4s%s" %
              (n, "yes" if a else "NO", "yes" if b else "NO", "   <-- ASYMMETRIC" if a != b else ""))
    print("  %d of %d asymmetric: %s" %
          (len(bad), sum(1 for n in d if n.startswith("fnUses")), ", ".join(bad) or "none"))

    print("\nNEVER CLEARED (%d) — ask whether each is rewritten unconditionally per compile" %
          c["NEVER"])
    for n in sorted(x for x in d if kinds[x] == "NEVER"):
        print("  %-24s %s:%-6d init=%-8s writes=%d" %
              (n, d[n]["file"], d[n]["line"], d[n]["init"], writes[n]))

    if "--names" in sys.argv:
        print("\nEVERY MUTABLE, with its clear sites")
        for n in sorted(d, key=lambda x: (d[x]["file"], d[x]["line"])):
            print("  %-9s %-26s %s:%-6d %s" %
                  (kinds[n], n, d[n]["file"], d[n]["line"], ", ".join(homes[n]) or "-"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
