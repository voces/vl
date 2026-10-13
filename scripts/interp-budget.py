#!/usr/bin/env python3
"""The prefer-interpolation ratchet — string `+` chains std/ and scripts/ still carry.

`prefer-interpolation` (compiler/lint.vl) is an `info` suggestion written for a VL
consumer: a `+` chain with three or more string literals reads better as one
interpolated string. `compiler/*.vl` is not held to it — interpolation there is not
a style debt, it is impossible: it desugars to a call needing `std:fmt`/`std:str`,
and compiler/ is what `build/vl-compiler.wasm` (the seed) is built from, which must
load with no host imports (`compiler-no-interpolation`, compiler/lint.vl; CLAUDE.md
"After editing compiler/*.vl"). The lint itself knows this and never fires under
compiler/, so this ratchet holds no compiler/ debt — only std/'s and scripts/'s
standing chains, which a rewrite would move the seed for no change in behaviour to
convert: a file's count may only FALL. `compiler/entry.vl` stays a scanned target at
an implicit zero baseline, so a regression in the exclusion itself (not a new chain)
still fails `--check`.

Sibling of scripts/comment-budget.py, scan-budget.py, ladder-budget.py,
sentinel-budget.py and export-budget.py; the baseline schema and the
`--check`/`--why`/`--exempt-codes` commands are scripts/ratchet.py. UNLIKE those five,
the census is not a python re-implementation: a chain is an expression tree, so this
runs the lint itself — `vl check --severity info --json` with the checkout's binary
and seed — and counts its findings. It therefore needs `build/vl-compiler.wasm`.
Every target is passed RELATIVE to the checkout root (`cwd=root` below): the lint's
own compiler/std scoping reads the literal path `vl check` was invoked with, so an
absolute target would silently defeat it.

THE GATE ROW IS `vl check --budget scripts/interp-budget-baseline.json` (L11 /
architecture-refactor-plan T2): the same lint, one process, its targets and excludes
read from the baseline's `targets` and `exclude`, and its `--budget-why` naming each
entry exactly as `named` below does. This script stays as the reference implementation
and the baseline's writer; tests/vl_budget_mode_test.ts holds the two to the same
verdict and the same names.
"""

import functools

import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

import ratchet

BASELINE = os.path.join(ratchet.ROOT, "scripts", "interp-budget-baseline.json")
CODE = "prefer-interpolation"
TREES = ("compiler", "std", "scripts")
# Programs under scripts/ that are data rather than tooling: generated corpus cells,
# whose spelling is what they test, and matrix templates, which are not programs.
SKIP = ("scripts/silent-sweep/distilled/", "scripts/capability-probes/matrix/")
VL = os.environ.get("VL", os.path.join(ratchet.ROOT, "scripts", "vl-host", "target",
                                       "release", "vl.exe" if os.name == "nt" else "vl"))
SEED = os.path.join(ratchet.ROOT, "build", "vl-compiler.wasm")
# What `vl check --budget` walks: the same population as `targets` below, spelled as
# CLI paths and `--exclude` globs (relative to each walked directory, or a basename).
CLI_TARGETS = ("compiler/entry.vl", "std", "scripts")
CLI_EXCLUDE = ("silent-sweep/distilled", "capability-probes/matrix", "*.matrix.vl",
               "target", "__pycache__")


ONLY = ()


def targets(root):
    """What `vl check` is handed, each path relative to `root`: the compiler's entry
    (the graph lints every module with its own file attribution), `std/`, and each
    program under scripts/. Relative, not `os.path.join(root, …)` — the subprocess
    runs with `cwd=root`, and a relative path is what lets the lint's own
    `compiler/`/`std/` prefix scoping recognise the tree; an absolute path never
    starts with either prefix and the exclusion silently would not apply (see the
    module docstring). `--only` replaces the list."""
    if ONLY:
        return list(ONLY)
    out = ["compiler/entry.vl", "std"]
    top = os.path.join(root, "scripts")
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = sorted(n for n in dirnames
                             if n not in ("node_modules", "target", "__pycache__"))
        for name in sorted(filenames):
            p = os.path.join(dirpath, name)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if name.endswith(".vl") and not name.endswith(".matrix.vl") \
                    and not rel.startswith(SKIP):
                out.append(rel)
    return out


@functools.lru_cache(maxsize=None)
def findings(root):
    """{(rel, line, col): source line} for every finding in the three trees. A script
    that imports another reports the imported file's findings too; the position key
    counts each once."""
    for need in (VL, SEED):
        if not os.path.exists(need):
            raise SystemExit(f"interp-budget: missing {need} — this ratchet runs the lint "
                             "(scripts/refresh-compiler.sh builds the seed)")
    env = dict(os.environ, VL_STD=os.path.join(root, "std"))

    def one(target):
        p = subprocess.run([VL, "check", target, "--severity", "info", "--json",
                            "--include-imports", "--compiler", SEED], cwd=root, env=env,
                           capture_output=True, text=True, timeout=600)
        text = p.stdout.strip()
        if p.returncode > 2 or not text.startswith("["):
            raise SystemExit(f"interp-budget: `vl check {target}` exited {p.returncode}: "
                             + (p.stderr.strip() or text)[:400])
        return json.loads(text)

    out = {}
    with ThreadPoolExecutor(int(os.environ.get("JOBS", "6"))) as ex:
        for diags in ex.map(one, targets(root)):
            for d in diags:
                if d.get("code") != CODE:
                    continue
                path = os.path.normpath(os.path.join(root, d["file"]))
                rel = os.path.relpath(path, root).replace(os.sep, "/")
                if rel.split("/")[0] not in TREES or rel.startswith(SKIP):
                    continue
                try:
                    # UTF-8, not `read_source`'s latin-1: the line is a NAME, stored in
                    # the baseline and compared by `vl check --budget-why` as written.
                    with open(path, encoding="utf-8", errors="replace") as fh:
                        line = fh.read().split("\n")[d["line"] - 1].strip()
                except (OSError, IndexError):
                    line = ""
                out[(rel, d["line"], d["col"])] = line
    return out


def current(root=ratchet.ROOT):
    out = {}
    for (rel, _line, _col) in findings(root):
        out.setdefault(rel, {CODE: 0})[CODE] += 1
    return out


def named(root):
    """{code: {`file: source line`: hits}} — a chain is named by the line it opens on,
    which survives the file's other lines moving."""
    out = {CODE: {}}
    for (rel, _line, _col), text in findings(root).items():
        k = f"{rel}: {text}"
        out[CODE][k] = out[CODE].get(k, 0) + 1
    return out


R = ratchet.Ratchet(
    script="interp-budget.py",
    label="interp",
    baseline=BASELINE,
    codes=(CODE,),
    ok_line=lambda t: f"interp budget ok — {t[CODE]} {CODE} (baseline "
                      f"{R.load_baseline()['total'].get(CODE, 0)} or below)",
    remedy="A string built from a `+` chain with three or more literals reads better\n"
           "interpolated: `\"fs.\\{op} \\{path}: \\{err}\"`. Write new std/ or scripts/ code\n"
           "that way — compiler/*.vl cannot (the seed it becomes must stay import-free;\n"
           "`compiler-no-interpolation` refuses it). The standing std/ and scripts/ chains\n"
           "are held so the seed does not move for a spelling. After a rewrite, lower the\n"
           "baseline with",
    wrote_line=lambda t: f"{t[CODE]} {CODE}",
    extras=lambda: (("label", "interp"),
                    ("writer", "scripts/interp-budget.py"),
                    ("commit", ratchet.head_commit()),
                    ("targets", list(CLI_TARGETS)),
                    ("exclude", list(CLI_EXCLUDE))),
    named=named,
    tree_paths=TREES,
    store_entries=True,
)


def main():
    global ONLY
    args = sys.argv[1:]
    # `--baseline <path>` and `--only <path,…>` exist for tests/vl_budget_mode_test.ts:
    # a doctored baseline, and a population narrowed as `vl check --budget X <paths>` is.
    if "--baseline" in args:
        R.baseline = os.path.abspath(ratchet.flag_value(args, "--baseline"))
    if "--only" in args:
        ONLY = tuple(p for p in ratchet.flag_value(args, "--only").split(",") if p)
    if "--exempt-codes" in args:
        return R.exempt_codes()
    if "--why" in args:
        rev = ratchet.flag_value(args, "--why")
        return R.why("" if rev.startswith("-") else rev)
    if "--list" in args:
        for (rel, line, col), text in sorted(findings(ratchet.ROOT).items()):
            print(f"{rel}:{line}:{col}  {text}")
        return 0
    cur = current()
    if "--write-baseline" in args:
        return R.write_baseline(cur)
    if "--check" in args:
        return R.check(cur)
    tot = sum(v[CODE] for v in cur.values())
    print(f"{'file':<48}{CODE:>22}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][CODE]):
        print(f"{rel:<48}{v[CODE]:>22}")
    print(f"{'TOTAL':<48}{tot:>22}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
