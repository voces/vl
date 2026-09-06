#!/usr/bin/env python3
"""The D1655 family: a memo whose staleness key reads only epochs and table LENGTHS is blind
to every IN-PLACE fill of a table its value depends on.

`globalCellKind` was one — `fRetKind` is pushed by `buildFnMap` and refined in place by
`computeRetInference`, so a query from an earlier pass froze the seeded `"i32"` and nothing
invalidated it. `emitPassGen` is the shared fix: a memo answer may not outlive the pass that
computed it.

Two halves, and the second is what makes the first honest.

  --list   DERIVES every generation-stamped guard in `compiler/*.vl` by shape and checks the
           stamp variables it finds against this file's ROWS table. A stamp nobody has
           classified is a failure, so a new memo cannot join the tree ungraded. Exits
           non-zero on drift.

  --run    Applies a row's DISABLE edit — the memo MISSES, which is strictly stronger than
           stamping it on `emitPassGen`, since not even one call's answer survives — builds a
           probe compiler with `--before` as the seed, reverts the tree, and leaves the
           artifact at `--out`. Nothing is graded here: hand the two seeds to
           `capability-probes/matrix.py`, a `tests/cases` build comparison and
           `silent-sweep/distilled/regress.py`. `--revert` alone restores an interrupted run.

           **Grade ONE ROW AT A TIME (`--only=<id>`).** Several of these are performance
           memos of D1090/D1513's class, and with all of them off the probe compiler exhausts
           the GC heap — on its own source and on eight matrix cells — which masks every
           answer difference behind a resource failure. One row at a time, each disabled memo
           compiles the whole compiler, and that is the biggest program available to compare.

           A disable edit must target the memo's READ. `parentLetCache` has a guard of the
           same shape inside `plScanStmt` that is the plan's FIRST-WINS write rule; disabling
           that one makes the walk last-wins and the compiler miscompiles its own
           `lint.vl` — an answer change wearing a cache-miss costume.

`docs/internals/memo-generation-census-2026-09.md` carries the graded table.
"""
import argparse
import pathlib
import re
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
C = ROOT / "compiler"
BACKUP = ROOT / "_scratch" / "memo-probe-backup"

# One row per memo. `stamps` are the guard variables the derivation must find under this row;
# `verdict` is why it is safe, or `probe` when safety rests on the measurement below.
#   pass-stamped     — the key reads `emitPassGen` (or a phase flag that is one)
#   no-refined-input — every table its value reads is push-only or reset wholesale
#   resume-reseeds   — a resume bank that writes the refined columns back before reusing them
#   not-a-memo       — a visit stamp or a per-row flag, no cached ANSWER to go stale
#   probe            — safety is measured, not argued; the disable edit carries it
ROWS = [
    ("globalCellKind", ["gckGenP", "gckGenTy", "gckGenS", "gckGenSF", "gckGenU", "gckGenV",
                        "gckGenN"], "pass-stamped",
     ("    if gckHave[letIx] == gckGen { return gckVal[letIx] }",
      "    if false && gckHave[letIx] == gckGen { return gckVal[letIx] }")),
    ("refArrShapeIndex", ["rasGen", "rasRowGen", "rasGenTy", "rasGenUV", "rasGenS",
                          "rasGenSF", "rasGenU", "rasGenV", "rasGenN", "rasGenP"],
     "pass-stamped",
     ("  if rasRowGen[slot] != rasGen { return false }",
      "  if true { return false }")),
    ("declaredStructGraph", ["dsgRoot", "dsgLen"], "pass-stamped",
     ("  if dsgRoot == emitRootIx && dsgLen == P.nodes.length { return true }",
      "  if false && dsgRoot == emitRootIx && dsgLen == P.nodes.length { return true }")),
    ("variantSig", ["uVarSigNamesLen", "uVarSigStartLen", "uVarSigCountLen"], "no-refined-input",
     ("    uVarSigNamesLen != uFieldNames.length ||", "    true ||")),
    ("objVariantIndex", ["ovnVarsLen", "ovnStartLen", "ovnCountLen"], "no-refined-input",
     ("    ovnVarsLen != uVariants.length ||", "    true ||")),
    ("declStructIndex", ["declStructStmtsLen"], "no-refined-input",
     ("  if declStructStmtsLen != stmts.length { declStructIndexBuild(stmts) }",
      "  declStructIndexBuild(stmts)")),
    ("buildFnMapResume", ["fmSeenFns", "fmSeenUnSets", "fmSeenUnNames", "fmSeenVariants",
                          "fmSeenSNames", "fmSeenSFields", "fmSeenUFields", "fmSeenTyParams"],
     "resume-reseeds",
     ("function buildFnMapResumable(): boolean {\n  if !fmResumeArmed { return false }",
      "function buildFnMapResumable(): boolean {\n  if true { return false }\n  if !fmResumeArmed { return false }")),
    ("collectAResume", ["caSeenNodes", "caSeenUnSets", "caSeenUnNames", "caSeenVariants",
                        "caSeenSNames", "caSeenSFields", "caSeenUFields", "caSeenTyParams"],
     "resume-reseeds",
     ("function collectAResumable(): boolean {\n  if !caResumeArmed { return false }",
      "function collectAResumable(): boolean {\n  if true { return false }\n  if !caResumeArmed { return false }")),
    ("monoGeneric", ["monoGen"], "not-a-memo", None),
    ("definiteAssign", ["daGen"], "not-a-memo", None),
    ("lintGoalSeen", ["klGSeen"], "not-a-memo", None),
    ("narrowingBank", ["npEpochs", "asgDeclEpochs"], "not-a-memo", None),
    ("checkVisitMarks", ["emitNameSeen", "nomNameSeen", "stSeenStack"], "not-a-memo", None),
    ("rootStmtList", ["gRootStmts"], "not-a-memo", None),
    ("repWalkMark", ["repSeenGen"], "not-a-memo", None),
    ("repTreeWalkMark", ["rtWalkGen"], "not-a-memo", None),
    ("repKeyMemo", ["repKeyMemoEpoch"], "probe",
     ("  if repKeyMemoEpoch != tyMutEpoch {", "  if true {")),
    ("repElemMemo", ["repElemMemoEpoch", "repElemMemoUserVer", "repElemMemoLen"], "probe",
     ("    repElemMemoEpoch != tyMutEpoch ||", "    true ||")),
    ("repSlotCache", ["repSlotCacheEpoch", "repSlotCacheUserVer", "repSlotCacheLen"], "probe",
     ("    repSlotCacheEpoch == tyMutEpoch &&", "    false &&")),
    ("repSlotRep", ["repSlotRepEpoch"], "probe",
     ("  if repSlotRepEpoch != tyMutEpoch {", "  if true {")),
    ("repTree", ["rtEpoch", "rtUserVer"], "probe",
     ("  if (rtEpoch == tyMutEpoch && rtUserVer == cUserTypesVer) { return 0 }",
      "  if (false && rtEpoch == tyMutEpoch && rtUserVer == cUserTypesVer) { return 0 }")),
    ("structIndexOfObjCtx", ["sioMemoVer"], "probe",
     ("    if sioMemoVer[objIx] == sNames.length { return sioMemoIx[objIx] }",
      "    if false && sioMemoVer[objIx] == sNames.length { return sioMemoIx[objIx] }")),
    ("startBlockLetRow", ["sblGen", "sblEpoch"], "probe",
     ("  if sidArrGet(sblGen, sid) == sblEpoch { return sidArrGet(sblVal, sid) }",
      "  if false && sidArrGet(sblGen, sid) == sblEpoch { return sidArrGet(sblVal, sid) }")),
    ("memberSetIntern", ["msSetGen", "msGen"], "probe",
     ("    if msSetGen[hit] == msGen { return hit }",
      "    if false && msSetGen[hit] == msGen { return hit }")),
    # The disable edit targets the cached-BLOCK test, not the `plScanStmt` guard of the same
    # shape: that one is the plan's FIRST-WINS write rule, and inverting it changes the answer
    # rather than dropping a cache — the compiler's own source then miscompiles.
    ("parentLetCache", ["plSidGen", "plLoopSidGen", "plGen"], "probe", "ALL:" +
     "  if blockIx != plCacheBlock {" + "\x00" + "  if true {"),
    ("anonLeafIndex", ["anonIxSeen", "anonIxBindHead"], "probe",
     ("  if anonIxOn && anonIxSeen == P.nodes.length { return 0 }",
      "  if false && anonIxOn && anonIxSeen == P.nodes.length { return 0 }")),
    ("fnChildIndex", ["fnChildHead"], "probe", "ALL:" +
     "  if fnChildHead.length != fnStmts.length { buildFnChildIndex() }" + "\x00" +
     "  buildFnChildIndex()"),
    ("elemRowsCaptureWalk", ["ercGenP", "ercStamp"], "pass-stamped",
     ("    if ercVal[slot] == 0 - 2 { return true }",
      "    if true { return true }")),
    ("covarValueWriteState", ["cwArenaLen", "cwRootNames", "cwRootFrames"], "probe",
     ("  if root == \"\" { return 2 }\n  if P.nodes.length != cwArenaLen {",
      "  if root == \"\" { return 2 }\n  if true {")),
]

# A stamp is a MODULE-level binding whose name carries one of these markers; the shapes below
# find the guards that read one. Deriving from the declarations is what keeps the population a
# census output rather than a list somebody remembered to update. A `.length != .length` guard
# names no stamp at all, so its own left-hand TABLE stands in for one.
STAMP_MARK = re.compile(r"(Epoch|Gen|Len|Ver|Seen|Root|Stamp|Head)")
GUARD = [
    re.compile(r"^\s*\(?([A-Za-z_][A-Za-z0-9_]*)\s*(?:!=|==)\s*[A-Za-z_P]"),
    re.compile(r"^\s*if .*?\b([A-Za-z_][A-Za-z0-9_]*)\[[^\]]+\]\s*(?:!=|==)\s*[A-Za-z_]"),
    re.compile(r"^\s*if .*?sidArrGet\(([A-Za-z_][A-Za-z0-9_]*)\s*,"),
    re.compile(r"^\s*if\s+([A-Za-z_][A-Za-z0-9_]*)\.length\s*!=\s*[A-Za-z_][A-Za-z0-9_]*\.length\s*\{"),
    re.compile(r"^\s*if\s+P\.nodes\.length\s*(?:!=|==)\s*([A-Za-z_][A-Za-z0-9_]*)"),
]


def module_stamps():
    """Module-level bindings whose name reads as a generation stamp."""
    out = {}
    for f in sorted(C.glob("*.vl")):
        for i, ln in enumerate(f.read_text().split("\n"), 1):
            m = re.match(r"^(?:export )?(?:let|const) ([A-Za-z_][A-Za-z0-9_]*)\s*(?::|=)", ln)
            if m and STAMP_MARK.search(m.group(1)):
                out[m.group(1)] = "%s:%d" % (f.name, i)
    return out


def derive(stamps):
    hits = {}
    for f in sorted(C.glob("*.vl")):
        for i, ln in enumerate(f.read_text().split("\n"), 1):
            if ln.strip().startswith("//"):
                continue
            for g in GUARD:
                m = g.match(ln)
                if m and m.group(1) in stamps:
                    hits.setdefault(m.group(1), []).append("%s:%d" % (f.name, i))
                    break
    return hits


def cmd_list():
    stamps = module_stamps()
    hits = derive(stamps)
    owned = {}
    for rid, ss, verdict, _ in ROWS:
        for s in ss:
            owned[s] = (rid, verdict)
    print("module-level stamp variables: %d · read by a guard: %d · rows: %d"
          % (len(stamps), len(hits), len(ROWS)))
    for verdict in ("pass-stamped", "no-refined-input", "resume-reseeds", "not-a-memo", "probe"):
        ids = [r[0] for r in ROWS if r[2] == verdict]
        print("  %-17s %2d  %s" % (verdict, len(ids), ", ".join(ids)))
    bad = []
    for s in sorted(hits):
        if s not in owned:
            bad.append("UNCLASSIFIED stamp `%s` (declared %s) read at %s — add a ROWS row, and "
                       "a disable edit unless its key already reads `emitPassGen`"
                       % (s, stamps[s], ", ".join(hits[s][:3])))
    src = "\n".join(f.read_text() for f in C.glob("*.vl"))
    for rid, ss, verdict, ed in ROWS:
        for s in ss:
            if s not in stamps:
                bad.append("STALE ROW `%s`: no module-level stamp `%s` any more" % (rid, s))
        if ed is None:
            continue
        if isinstance(ed, str):
            old = ed[len("ALL:"):].split("\x00")[0]
            if src.count(old) < 1:
                bad.append("STALE EDIT `%s`: anchor gone" % rid)
        elif src.count(ed[0]) != 1:
            bad.append("STALE EDIT `%s`: anchor appears %d times, want 1" % (rid, src.count(ed[0])))
    for b in bad:
        print("  " + b)
    return 1 if bad else 0


def edits(only=None):
    """(file, old, new, id, all_occurrences). An `ALL:` edit applies to every home it has."""
    out = []
    for rid, _, _, ed in ROWS:
        if ed is None:
            continue
        if only is not None and rid not in only:
            continue
        if isinstance(ed, str):
            old, new = ed[len("ALL:"):].split("\x00")
            for f in sorted(C.glob("*.vl")):
                if old in f.read_text():
                    out.append((f, old, new, rid, True))
            continue
        old, new = ed
        for f in sorted(C.glob("*.vl")):
            if f.read_text().count(old) == 1:
                out.append((f, old, new, rid, False))
                break
        else:
            print("no unique home for %s's disable edit" % rid, file=sys.stderr)
    return out


def cmd_run(args):
    # An interrupted run left its snapshot behind: restore it BEFORE taking a new one, or the
    # next revert would put back a tree this run never saw.
    if BACKUP.exists() and any(BACKUP.glob("*.vl")):
        cmd_revert()
    BACKUP.mkdir(parents=True, exist_ok=True)
    for p in BACKUP.glob("*.vl"):
        p.unlink()
    todo = edits(args.only.split(",") if args.only else None)
    for f, _, _, _, _ in todo:
        if not (BACKUP / f.name).exists():
            shutil.copy(f, BACKUP / f.name)
    for f, old, new, rid, every in todo:
        s = f.read_text()
        if not every and s.count(old) != 1:
            print("SKIP %s (anchor count %d)" % (rid, s.count(old)))
            continue
        f.write_text(s.replace(old, new))
        print("disabled %-22s %s" % (rid, f.name))
    rc = subprocess.run([args.vl, "build", "compiler/entry.vl", "-o", args.out,
                         "--compiler", args.before], cwd=ROOT).returncode
    cmd_revert()
    print("probe compiler: %s (build rc=%d)" % (args.out, rc))
    return rc


def cmd_revert():
    n = 0
    for p in BACKUP.glob("*.vl"):
        shutil.copy(p, C / p.name)
        n += 1
    print("reverted %d file(s)" % n)
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--run", action="store_true")
    ap.add_argument("--revert", action="store_true")
    ap.add_argument("--before", default="build/vl-compiler.wasm")
    ap.add_argument("--out", default="_scratch/memo-probe.wasm")
    ap.add_argument("--vl", default="scripts/vl-host/target/release/vl")
    ap.add_argument("--only", default=None,
                    help="comma-separated row ids; disable only those memos")
    a = ap.parse_args()
    if a.revert:
        sys.exit(cmd_revert())
    if a.run:
        sys.exit(cmd_run(a))
    sys.exit(cmd_list())
