#!/usr/bin/env python3
"""
Grade the sweep.  Reads the manifest + one .res per cell and assigns each cell EXACTLY ONE
outcome from the strictly-separate column set:

  correct
  loud_check_reject          -- vl check printed [ERROR]
  loud_emit_reject           -- check-clean, vl run failed with an emitProgram/emit error
  hint_only_rc1              -- vl check rc 1 with no [ERROR] line
  invalid_wasm               -- check-clean, engine rejected the MODULE (validation)
  wrong_value                -- ran, value lines differ from the independent expectation
  wrong_evalcount            -- ran, value lines right, evaluation-count line wrong
  trap                       -- ran, then trapped
  other_runtime_fail         -- ran-stage failure we could not classify (reported, never merged)

Usage: grade.py <celldir> <resdir> [--csv out.csv]
"""
import base64, json, os, re, sys, collections

COLUMNS = ["correct", "wrong_value", "wrong_evalcount", "invalid_wasm",
           "trap", "compiler_trap",
           "loud_check_reject", "loud_emit_reject", "hint_only_rc1",
           "other_runtime_fail", "missing_result"]
SILENT = ["wrong_value", "wrong_evalcount", "invalid_wasm", "trap", "compiler_trap"]


def load_res(path):
    d = {"CELL": "", "CHECKRC": "", "RUNRC": "", "BUILDRC": "", "BUILDSIZE": "",
         "CHECKERR": "", "RUNOUT": "", "RUNERR": ""}
    with open(path) as fh:
        for line in fh.read().splitlines():
            k, _, v = line.partition(" ")
            if k in ("CHECKERR", "RUNOUT", "RUNERR"):
                d[k] = base64.b64decode(v).decode("utf-8", "replace") if v else ""
            elif k in d:
                d[k] = v
    return d


INVALID_MARKERS = (
    "Invalid input WebAssembly code",
    "wasm validation",
    "failed to parse",
    "type mismatch: expected",
    "WebAssembly translation error",
    "validation error",
)
TRAP_MARKERS = ("wasm trap", "unreachable", "out of bounds", "divide by zero",
                "null reference", "cast failure", "integer overflow")
EMIT_MARKERS = ("emit error", "emitProgram:", "emitFail", "unsupported statement",
                "unsupported expression")


def classify(cell, res):
    checkerr = res["CHECKERR"]
    has_error = any(l.startswith("[ERROR]") for l in checkerr.splitlines())
    crc = res["CHECKRC"]
    if has_error:
        return "loud_check_reject", firstmsg(checkerr, "[ERROR]")
    if crc == "1":
        # rc 1 with no [ERROR] -> a hint/warning-only rc.  Still grade the run below,
        # but the cell's outcome column is its own.
        return "hint_only_rc1", firstmsg(checkerr, "[HINT]") or firstmsg(checkerr, "[WARNING]")
    rrc = res["RUNRC"]
    rerr = res["RUNERR"]
    if rrc != "0":
        low = rerr
        if any(m in low for m in INVALID_MARKERS):
            return "invalid_wasm", oneline(rerr)
        if any(m in low for m in TRAP_MARKERS):
            # a trap with NO module written is the COMPILER trapping while emitting,
            # not the emitted program trapping at runtime.  Never merge the two.
            if res.get("BUILDSIZE") in ("0", ""):
                return "compiler_trap", oneline(rerr)
            return "trap", oneline(rerr)
        if any(m in low for m in EMIT_MARKERS):
            return "loud_emit_reject", oneline(rerr)
        return "other_runtime_fail", oneline(rerr)
    got = [l for l in res["RUNOUT"].split("\n")]
    while got and got[-1] == "":
        got.pop()
    exp = list(cell["expected"])
    if got == exp:
        return "correct", ""
    # split value lines from the trailing evaluation-count line
    gv, gc = (got[:-1], got[-1]) if got else ([], None)
    ev, ec = exp[:-1], exp[-1]
    if gv == ev and gc != ec:
        return "wrong_evalcount", f"calls expected {ec} got {gc}"
    return "wrong_value", f"expected {ev!r} got {gv!r} (calls {gc})"


def firstmsg(text, tag):
    for l in text.splitlines():
        if l.startswith(tag):
            return l[:200]
    return ""


PATH_PREFIX = re.compile(r"^[^\s:]*\.vl:\d+:\d+:\s*")


def oneline(text):
    """The most informative single line, with any `<path>.vl:L:C:` prefix stripped so
    two cells reporting the same cause group together."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    for want in ("Invalid input WebAssembly code", "wasm trap", "emitProgram:",
                 "type mismatch"):
        for l in lines:
            if want in l:
                return PATH_PREFIX.sub("", l)[:220]
    for l in lines:
        if not l.startswith("Error:") and not l.startswith("Caused by"):
            return PATH_PREFIX.sub("", l)[:220]
    return (lines or [""])[0][:220]


def main():
    celldir, resdir = sys.argv[1], sys.argv[2]
    man = json.load(open(os.path.join(celldir, "manifest.json")))
    cells = man["cells"]
    rows = []
    counts = collections.Counter()
    nres = 0
    for name, cell in sorted(cells.items()):
        p = os.path.join(resdir, name + ".res")
        if not os.path.exists(p):
            counts["missing_result"] += 1
            rows.append((name, cell, "missing_result", ""))
            continue
        nres += 1
        res = load_res(p)
        col, msg = classify(cell, res)
        counts[col] += 1
        rows.append((name, cell, col, msg))

    # ---- structural assertions: records == cells
    print(f"cells={len(cells)} result_files={nres} "
          f"MATCH={'OK' if nres == len(cells) else 'MISMATCH'}")
    print()
    print("== outcome columns ==")
    for c in COLUMNS:
        if counts[c]:
            print(f"{c:22s} {counts[c]:6d} / {len(cells)}")
    print()
    silent = sum(counts[c] for c in SILENT)
    print(f"{'SILENT TOTAL':22s} {silent:6d} / {len(cells)}")

    if "--csv" in sys.argv:
        out = sys.argv[sys.argv.index("--csv") + 1]
        import csv
        with open(out, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["cell", "leg", "rep", "nul", "pos", "con", "read", "inp",
                        "spell", "outcome", "msg", "expected"])
            for name, cell, col, msg in rows:
                w.writerow([name, cell["leg"], cell["rep"], cell["nul"], cell["pos"],
                            cell["con"], cell["read"], cell["inp"],
                            cell.get("spell", "inline"), col, msg,
                            "|".join(cell["expected"])])
        print(f"\nwrote {out}")


if __name__ == "__main__":
    main()
