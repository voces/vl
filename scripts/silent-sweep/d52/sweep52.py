#!/usr/bin/env python3
"""
Run and grade the D52 grid against ONE compiler seed.

  sweep52.py <celldir> <seed.wasm> <out.tsv> [--jobs N] [--limit N]

Each cell gets exactly one outcome from a strictly-separate column set.  A cell that
RAN is graded against the manifest's independently computed expectation, so a module
that loads but answers wrong is `wrong_value`, never `runs`.

  runs                 -- check clean, ran, stdout == expectation
  wrong_value          -- ran, stdout != expectation                        [SILENT]
  invalid_wasm         -- check clean, the ENGINE refused the module        [SILENT]
  trap                 -- module written, ran, then trapped                 [SILENT]
  compiler_trap        -- trapped with NO module written                    [SILENT]
  loud_check_reject    -- `vl check` printed [ERROR]
  loud_emit_reject     -- check clean, the EMITTER refused
  hint_only_rc1        -- `vl check` rc 1 with no [ERROR]
  other_fail           -- unclassified; reported, never merged
"""
import concurrent.futures
import os
import subprocess
import sys
import tempfile

VL = "scripts/vl-host/target/release/vl"

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
                "unsupported expression", "only i32, i64")

SILENT = {"wrong_value", "invalid_wasm", "trap", "compiler_trap"}


def oneline(s):
    for l in s.splitlines():
        l = l.strip()
        if l and not l.startswith("at ") and l != "Error:":
            return l[:160]
    return s.strip().replace("\n", " ")[:160]


def firstmsg(s, tag):
    for l in s.splitlines():
        if l.startswith(tag):
            return l[:160]
    return ""


def run_cell(args):
    path, seed, expected = args
    name = os.path.basename(path)[:-3]
    env = dict(os.environ)
    cp = subprocess.run([VL, "check", path, "--compiler", seed],
                        capture_output=True, text=True, env=env)
    checkerr = cp.stdout + cp.stderr
    if any(l.startswith("[ERROR]") for l in checkerr.splitlines()):
        return name, "loud_check_reject", firstmsg(checkerr, "[ERROR]")
    if cp.returncode == 1:
        return name, "hint_only_rc1", oneline(checkerr)
    if cp.returncode != 0:
        return name, "other_fail", "check rc=%d %s" % (cp.returncode, oneline(checkerr))

    rp = subprocess.run([VL, "run", path, "--compiler", seed],
                        capture_output=True, text=True, env=env)
    if rp.returncode != 0:
        err = rp.stderr + rp.stdout
        if any(m in err for m in INVALID_MARKERS):
            return name, "invalid_wasm", oneline(err)
        if any(m in err for m in TRAP_MARKERS):
            # A trap with NO module written is the COMPILER trapping while emitting,
            # not the emitted program trapping.  Never merge the two.
            fd, tmp = tempfile.mkstemp(suffix=".wasm")
            os.close(fd)
            os.unlink(tmp)
            subprocess.run([VL, "build", path, "--compiler", seed, "-o", tmp],
                           capture_output=True, text=True, env=env)
            wrote = os.path.exists(tmp) and os.path.getsize(tmp) > 0
            if os.path.exists(tmp):
                os.unlink(tmp)
            return name, ("trap" if wrote else "compiler_trap"), oneline(err)
        if any(m in err for m in EMIT_MARKERS):
            return name, "loud_emit_reject", oneline(err)
        return name, "other_fail", oneline(err)

    got = [l for l in rp.stdout.split("\n")]
    while got and got[-1] == "":
        got.pop()
    want = expected.split("\n")
    if got != want:
        return name, "wrong_value", "got=%r want=%r" % (got, want)
    return name, "runs", ""


def main():
    celldir, seed, out = sys.argv[1], sys.argv[2], sys.argv[3]
    jobs = 4
    limit = None
    a = sys.argv[4:]
    while a:
        if a[0] == "--jobs":
            jobs = int(a[1]); a = a[2:]
        elif a[0] == "--limit":
            limit = int(a[1]); a = a[2:]
        else:
            a = a[1:]
    exp = {}
    with open(os.path.join(celldir, "manifest.tsv")) as fh:
        for line in fh:
            line = line.rstrip("\n")
            if not line:
                continue
            k, _, v = line.partition("\t")
            exp[k] = v
    names = sorted(exp)
    if limit:
        names = names[:limit]
    work = [(os.path.join(celldir, n + ".vl"), seed, exp[n]) for n in names]
    rows = []
    done = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=jobs) as ex:
        for r in ex.map(run_cell, work):
            rows.append(r)
            done += 1
            if done % 500 == 0:
                print("  ... %d/%d" % (done, len(work)), file=sys.stderr, flush=True)
    rows.sort()
    with open(out, "w") as fh:
        for name, outcome, msg in rows:
            fh.write("%s\t%s\t%s\n" % (name, outcome, msg))
    tally = {}
    for _, o, _ in rows:
        tally[o] = tally.get(o, 0) + 1
    silent = sum(v for k, v in tally.items() if k in SILENT)
    print("total=%d silent=%d" % (len(rows), silent))
    for k in sorted(tally, key=lambda k: -tally[k]):
        print("  %-20s %d" % (k, tally[k]))


if __name__ == "__main__":
    main()
