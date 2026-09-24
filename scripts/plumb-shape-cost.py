#!/usr/bin/env python3
"""The compile-cost ratchet on generated code: what one `vl build --names -O --import-memory`
of a plumb-shaped unit costs, against a committed one-line baseline.

    python3 scripts/plumb-shape-cost.py [--check]          # grade (the gate row)
    python3 scripts/plumb-shape-cost.py --write-baseline   # after a real change, on a quiet box
    python3 scripts/plumb-shape-cost.py --samples          # print every run, grade nothing

The unit is written by `scripts/perf/gen-plumb-shape.vl` (2 MB, fixed seed) and built by the
seed under test. Three readings, each red only above its bar, each fall printed and passed:

* GUEST FUEL (+5%) — the compiler's work as wasmtime fuel (`$VL_FUEL=1`), the same number on
  every run however busy the box is. The one reading that can be tight.
* PEAK RSS (+10%) — the largest process of the build. Varies by well under 1%.
* CPU (+15% compile, +25% `wasm-opt`) — user+sys, the least of the runs. Graded only on the
  machine the baseline was taken on, and only from runs a Python control says were quiet:
  on this box contention raises the same build's CPU by up to 2x, so a run is counted only
  when the control just before it is within 15% of its baseline.

`wasm-opt` is timed by pointing `$VL_WASM_OPT` at this file, which runs the real one (or, for
the fuel build or a box without a native one, nothing) and logs its rusage. Measurements and
the bars' reasons: docs/internals/profiling-the-compiler.md §Guards.
"""

import hashlib
import json
import os
import re
import resource
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "plumb-shape-baseline.json")
GEN = os.path.join(ROOT, "scripts", "perf", "gen-plumb-shape.vl")
UNIT_BYTES = 2000000
BUILD_TIMEOUT = 300

BAR_FUEL = 0.05
BAR_RSS = 0.10
BAR_COMPILE_CPU = 0.15
BAR_OPT_CPU = 0.25
# A run's CPU counts only when the control just before it read within this of the
# baseline's control, and CPU is graded only when at least MIN_QUIET runs counted.
QUIET = 1.15
MIN_QUIET = 2
LAST_BUSY = 0.0


def as_wasm_opt() -> int:
    """Wrapper mode: run the real `wasm-opt` (none when the variable is empty), log its CPU."""
    real = os.environ["PLUMB_SHAPE_REAL_WASM_OPT"]
    if not real:
        return 0
    p = subprocess.Popen([real] + sys.argv[1:])
    _, status, ru = os.wait4(p.pid, 0)
    with open(os.environ["PLUMB_SHAPE_OPT_LOG"], "a") as fh:
        fh.write(f"{ru.ru_utime + ru.ru_stime}\n")
    return os.waitstatus_to_exitcode(status)


def native_wasm_opt() -> str | None:
    """The first `wasm-opt` on PATH that is a native binary, not binaryen's JS build."""
    for d in os.environ.get("PATH", "").split(os.pathsep):
        cand = os.path.join(d, "wasm-opt")
        if not os.path.isfile(cand):
            continue
        with open(cand, "rb") as fh:
            if fh.read(2) == b"#!":
                continue
        return cand
    return None


def cpu_model() -> str:
    try:
        with open("/proc/cpuinfo") as fh:
            for line in fh:
                if line.startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return "unknown"


def control() -> float:
    """A fixed CPU workload that no compiler change can move: dict, string and sort traffic."""
    t0 = resource.getrusage(resource.RUSAGE_SELF)
    acc = 0
    for rnd in range(3):
        d: dict[str, int] = {}
        for i in range(120000):
            k = f"k{(i * 2654435761 + rnd) & 0xFFFFF:x}"
            d[k] = d.get(k, 0) + i
        acc += len(sorted(d.items()))
    t1 = resource.getrusage(resource.RUSAGE_SELF)
    assert acc > 0
    return (t1.ru_utime - t0.ru_utime) + (t1.ru_stime - t0.ru_stime)


def box_ticks() -> tuple[int, int]:
    """(busy, total) jiffies over every CPU since boot, from /proc/stat; (0, 0) off Linux."""
    try:
        with open("/proc/stat") as fh:
            f = [int(x) for x in fh.readline().split()[1:]]
    except OSError:
        return 0, 0
    idle = f[3] + (f[4] if len(f) > 4 else 0)
    return sum(f) - idle, sum(f)


def run(cmd: list[str], env: dict, cwd: str) -> tuple[float, float, str]:
    """Run `cmd` under `timeout`: its process tree's CPU seconds, peak RSS (MB) and stderr."""
    global LAST_BUSY
    b0, t0 = box_ticks()
    p = subprocess.Popen(["timeout", str(BUILD_TIMEOUT)] + cmd, env=env, cwd=cwd,
                         stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
    err = p.stderr.read().decode(errors="replace")
    _, status, ru = os.wait4(p.pid, 0)
    b1, t1 = box_ticks()
    LAST_BUSY = (b1 - b0) / (t1 - t0) if t1 > t0 else 0.0
    code = os.waitstatus_to_exitcode(status)
    if code != 0:
        sys.stdout.write(err[-2000:])
        print(f"plumb-shape: `{' '.join(cmd)}` failed (rc {code}; 124 is the {BUILD_TIMEOUT}s timeout)")
        sys.exit(1)
    return ru.ru_utime + ru.ru_stime, ru.ru_maxrss / 1024.0, err


def measure(vl: str, seed: str, runs: int, base_control: float | None, samples: bool) -> dict:
    real = native_wasm_opt()
    work = tempfile.mkdtemp(prefix="plumb-shape.")
    try:
        env = dict(os.environ, VL_STD=os.environ.get("VL_STD", os.path.join(ROOT, "std")))
        env.pop("VL_FUEL", None)
        unit = os.path.join(work, "unit.vl")
        run([vl, "run", GEN, "--compiler", seed, "--", "--bytes", str(UNIT_BYTES), "-o", unit], env, ROOT)
        with open(unit, "rb") as fh:
            sha = hashlib.sha256(fh.read()).hexdigest()[:16]
        log = os.path.join(work, "opt.log")
        build = [vl, "build", "unit.vl", "--names", "-O", "--import-memory", "--compiler", seed,
                 "-o", "unit.wasm"]
        benv = dict(env, VL_WASM_OPT=os.path.abspath(__file__), PLUMB_SHAPE_OPT_LOG=log,
                    PLUMB_SHAPE_REAL_WASM_OPT=real or "")

        # The fuel build skips `wasm-opt`: fuel counts only the guest, and binaryen is not it.
        # Its first run on a fresh seed also compiles the fuel engine's `.cwasm` sidecar,
        # which costs CPU but no fuel.
        _, _, err = run(build, dict(benv, VL_FUEL="1", PLUMB_SHAPE_REAL_WASM_OPT=""), work)
        m = re.search(r"^\[fuel\] guest: (\d+)$", err, re.M)
        fuel = int(m.group(1)) if m else None

        run(build, benv, work)  # untimed: warms this engine's sidecar and the page cache
        rows = []
        for i in range(runs):
            ctl = control()
            open(log, "w").close()
            cpu, rss, _ = run(build, benv, work)
            with open(log) as fh:
                opt = sum(float(x) for x in fh.read().split())
            quiet = base_control is not None and ctl <= base_control * QUIET
            rows.append((ctl, cpu - opt, opt, rss, quiet))
            if samples:
                print(f"  run {i}: control {ctl:.3f}s  compile {cpu - opt:.2f}s  -O {opt:.2f}s  "
                      f"rss {rss:.0f} MB  busy {100 * LAST_BUSY:.0f}%  load {os.getloadavg()[0]:.1f}{'  quiet' if quiet else ''}")
            # Once too few runs are left to reach MIN_QUIET, the rest could only re-read RSS.
            elif base_control is not None and sum(r[4] for r in rows) + runs - i - 1 < MIN_QUIET:
                break
        q = [r for r in rows if r[4]] if base_control is not None else rows
        return {
            "fuel": fuel,
            "rss_mb": round(min(r[3] for r in rows), 1),
            "compile_cpu": round(min(r[1] for r in q), 3) if q else None,
            "opt_cpu": round(min(r[2] for r in q), 3) if q and real else None,
            "control_cpu": round(min(r[0] for r in rows), 3),
            "quiet_runs": len(q),
            "runs_done": len(rows),
            "unit_sha": sha,
            "wasm_opt": subprocess.run([real, "--version"], capture_output=True, text=True).stdout.strip()
            if real else None,
            "cpu_host": cpu_model(),
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)


def head_commit() -> str:
    r = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT)
    return r.stdout.strip() or "unknown"


def main(argv: list[str]) -> int:
    if "PLUMB_SHAPE_REAL_WASM_OPT" in os.environ:
        return as_wasm_opt()
    vl = os.environ.get("VL", os.path.join(ROOT, "scripts", "vl-host", "target", "release", "vl"))
    seed = os.environ.get("SEED", os.path.join(ROOT, "build", "vl-compiler.wasm"))
    args = argv[1:]
    require_fuel = "--require-fuel" in args
    args = [a for a in args if a != "--require-fuel"]
    mode = args[0] if args else "--check"
    if mode not in ("--check", "--write-baseline", "--samples") or len(args) > 1:
        print(__doc__)
        return 2
    for path, fix in ((vl, "cd scripts/vl-host && cargo build --release"), (seed, "scripts/refresh-compiler.sh")):
        if not os.path.exists(path):
            print(f"plumb-shape: missing {path} ({fix})")
            return 1

    base = None
    if mode != "--write-baseline":
        try:
            with open(BASELINE) as fh:
                base = json.load(fh)
        except (OSError, ValueError) as e:
            if mode == "--check":
                print(f"plumb-shape: cannot read {BASELINE} ({e}); write one with\n"
                      "  python3 scripts/plumb-shape-cost.py --write-baseline")
                return 1
    same_host = base is not None and base.get("cpu_host") == cpu_model()
    runs = int(os.environ.get("PLUMB_SHAPE_RUNS", "7" if mode == "--write-baseline" else "3"))
    m = measure(vl, seed, runs, base["control_cpu"] if same_host else None, mode == "--samples")

    def fmt(v, unit, nd=2):
        return "-" if v is None else f"{v:.{nd}f}{unit}"

    print(f"plumb-shape unit: fuel {m['fuel'] if m['fuel'] is not None else '-'}, peak RSS "
          f"{fmt(m['rss_mb'], ' MB', 0)}, compile {fmt(m['compile_cpu'], 's')} CPU, -O "
          f"{fmt(m['opt_cpu'], 's')} ({m['quiet_runs']} quiet of {m['runs_done']} runs; control "
          f"{m['control_cpu']:.3f}s)")
    if mode == "--samples":
        return 0
    if mode == "--write-baseline":
        if m["fuel"] is None:
            print("plumb-shape: this host prints no `[fuel]` line (it predates $VL_FUEL); rebuild it first")
            return 1
        row = dict(m, commit=head_commit())
        del row["quiet_runs"], row["runs_done"]
        with open(BASELINE, "w") as fh:
            fh.write(json.dumps(row) + "\n")
        print(f"wrote {os.path.relpath(BASELINE, ROOT)}")
        return 0

    if m["unit_sha"] != base["unit_sha"]:
        print(f"PLUMB-SHAPE UNIT CHANGED: the generator wrote {m['unit_sha']}, the baseline priced "
              f"{base['unit_sha']}. It is deterministic, so either scripts/perf/gen-plumb-shape.vl "
              "changed (re-baseline in the same PR) or the seed now compiles it differently.")
        return 1
    bad = []

    def grade(name: str, cur, was, bar: float, unit: str, why_not: str | None = None):
        if why_not is not None:
            print(f"  {name:10s} not graded: {why_not}")
            return
        pct = 100.0 * (cur - was) / was
        over = cur > was * (1 + bar)
        print(f"  {name:10s} {cur:>14,.{0 if unit == '' else 2}f}{unit} against {was:,.{0 if unit == '' else 2}f}{unit} "
              f"({pct:+.1f}%, bar +{100 * bar:.0f}%) {'OVER' if over else 'ok'}")
        if over:
            bad.append(name)

    if m["fuel"] is None:
        if require_fuel:
            print("plumb-shape: this host prints no `[fuel]` line and --require-fuel was given")
            return 1
        grade("fuel", None, None, BAR_FUEL, "", "this host predates $VL_FUEL (rebuild scripts/vl-host)")
    else:
        grade("fuel", m["fuel"], base["fuel"], BAR_FUEL, "")
    grade("peak RSS", m["rss_mb"], base["rss_mb"], BAR_RSS, " MB")
    cpu_why = None
    if not same_host:
        cpu_why = f"CPU is `{cpu_model()}`, the baseline's `{base.get('cpu_host')}`"
    elif m["quiet_runs"] < MIN_QUIET:
        cpu_why = (f"box busy — {m['quiet_runs']} of {m['runs_done']} runs had the control within "
                   f"{100 * (QUIET - 1):.0f}% of its {base['control_cpu']:.3f}s")
    grade("compile", m["compile_cpu"], base["compile_cpu"], BAR_COMPILE_CPU, "s", cpu_why)
    opt_why = cpu_why
    if opt_why is None and m["wasm_opt"] != base["wasm_opt"]:
        opt_why = f"wasm-opt is `{m['wasm_opt']}`, the baseline's `{base['wasm_opt']}`"
    grade("-O", m["opt_cpu"], base["opt_cpu"], BAR_OPT_CPU, "s", opt_why)
    if bad:
        print(f"PLUMB-SHAPE COST REGRESSION ({', '.join(bad)}): building generated code got dearer.\n"
              "  Profile the unit (docs/internals/profiling-the-compiler.md; write it with\n"
              "  scripts/perf/gen-plumb-shape.vl). If the cost is accepted, or the compiler got\n"
              "  cheaper, re-baseline in the same PR, on a quiet box:\n"
              "  python3 scripts/plumb-shape-cost.py --write-baseline")
        return 1
    print("plumb-shape cost ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
