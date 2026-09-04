#!/usr/bin/env python3
"""The seed-size ratchet — `build/vl-compiler.wasm` as a per-landing number.

The seed is the compiler compiling itself, so every emitter change is priced in
its bytes. That price was measured only when somebody went looking: it grew 8.8%
over four landings on 2026-09-03 and nobody saw it until a peer asked. Sibling of
scripts/comment-budget.py and scripts/scan-budget.py — a committed baseline, a
`--check` in the gate and in ci-native, and `--write-baseline` in the SAME PR as
the change that earned the growth. See CLAUDE.md, "Gates", and DECISIONS.md
"The seed's size is a per-landing number".

THE NUMBER IS THE FIXPOINT'S — size only a converged seed (`--prove-fixpoint`, or
two passes that agree). One self-compile off a stale seed reads the OLD compiler's
codegen of current source, which is a different artifact: 1,842,901 bytes at one
rung against 1,996,118 at the fixpoint, and on another branch the same day one
pass read 1,844,776 where three converged at 1,997,993. That second pair is why
this is an invariant and not a caveat: the error has a SIGN, so the one-rung
reading says the compiler SHRUNK ~7.5%, and a gate that alarms only on growth
passes it in silence. ci-native runs `--check` straight after `--prove-fixpoint`,
so the deciding reading is always the fixpoint's; a local `gate.sh` seed one rung
short reads its own seed and can differ. Both pairs: DECISIONS.md, "The seed's
size is a per-landing number" / "The reading is the FIXPOINT's".

Absent seed is not a failure: the `ci` job never builds one, and every seed-backed
test there self-ignores on the same reasoning.
"""

import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SEED = os.path.join(ROOT, "build", "vl-compiler.wasm")
BASELINE = os.path.join(ROOT, "scripts", "seed-size-baseline.json")

# The bar: one landing may grow the seed 3% before it has to say so. Deliberately
# loose — the job is to NAME a jump, not to price every byte, and a gate that reds on
# ordinary work stops being read. What makes 3% bite anyway is that the growth is
# CUMULATIVE: the baseline moves only when someone rewrites it, so an unattended
# series of landings faces 3% TOTAL, not 3% each. Rationale: DECISIONS.md.
MAX_GROWTH_PCT = 3.0


def read_size(path):
    return os.path.getsize(path)


def load_baseline(path):
    """The committed byte count. A missing or shapeless baseline is a LOUD failure
    with the fix named — a traceback out of a merge gate reads as the gate breaking
    rather than as the file it grades being wrong."""
    try:
        with open(path, encoding="utf-8") as fh:
            row = json.load(fh)
    except (OSError, ValueError) as e:
        raise SystemExit(
            f"seed-size: cannot read the baseline {path} ({e}). Write one with\n"
            f"  python3 scripts/seed-size.py --write-baseline"
        )
    if not isinstance(row, dict) or not isinstance(row.get("bytes"), int):
        raise SystemExit(f"seed-size: {path} has no integer `bytes` field: {row!r}")
    return row


def head_commit():
    """The commit the baseline describes. `unknown` outside a checkout — the
    field is provenance for a human reading a jump, never an input to `--check`."""
    try:
        out = subprocess.run(
            ["git", "-C", ROOT, "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True, timeout=10,
        )
        return out.stdout.strip() if out.returncode == 0 else "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def pct_growth(size, base):
    return (size - base) * 100.0 / base


def limit_bytes(base):
    """The bar as a BYTE COUNT, so the comparison is integer and the failure can
    name the exact number it wanted. A percentage printed to one place reads the
    same on either side of the line."""
    return base + int(base * MAX_GROWTH_PCT / 100.0)


def report(size, base):
    return f"seed size {size} bytes, baseline {base} ({pct_growth(size, base):+.1f}%)"


def write_baseline(seed, baseline):
    size = read_size(seed)
    row = {"bytes": size, "commit": head_commit()}
    with open(baseline, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(row) + "\n")
    print(f"wrote {baseline}: {size} bytes at {row['commit']}")
    return 0


def cmd_check(seed, baseline):
    if not os.path.exists(seed):
        print(f"no seed at {seed} — nothing to size (the `ci` job builds none); skipping")
        return 0
    size = read_size(seed)
    base = load_baseline(baseline)["bytes"]
    line = report(size, base)
    limit = limit_bytes(base)
    if size > limit:
        print(
            f"seed size REGRESSED — {line}: over the {limit}-byte bar "
            f"({MAX_GROWTH_PCT:+.1f}%) by {size - limit}"
        )
        print(
            "\nEither the growth is the change (say what bought it in the PR body and\n"
            "rewrite the baseline in the SAME PR with\n"
            "  python3 scripts/seed-size.py --write-baseline)\n"
            "or it is a cost nobody chose — which is the case this gate exists for."
        )
        return 1
    print(line)
    return 0


def main():
    args = sys.argv[1:]
    seed, baseline = SEED, BASELINE
    if "--seed" in args:
        seed = args[args.index("--seed") + 1]
    if "--baseline" in args:
        baseline = args[args.index("--baseline") + 1]
    if "--write-baseline" in args:
        return write_baseline(seed, baseline)
    if "--check" in args:
        return cmd_check(seed, baseline)
    if not os.path.exists(seed):
        print(f"no seed at {seed}")
        return 0
    print(report(read_size(seed), load_baseline(baseline)["bytes"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
