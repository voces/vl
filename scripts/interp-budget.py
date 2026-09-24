#!/usr/bin/env python3
"""The prefer-interpolation ratchet — string `+` chains the tree already carries.

`prefer-interpolation` (compiler/lint.vl) is an `info` suggestion written for a VL
consumer: a `+` chain with three or more string literals reads better as one
interpolated string. The compiler builds its own messages that way by the hundred,
and rewriting them moves the seed for no change in behaviour, so the standing ones
are held here rather than converted: a file's count may only FALL. New code in these
trees writes the interpolated spelling; `--write-baseline` lowers a file after a
rewrite.

Sibling of scripts/comment-budget.py, scan-budget.py, ladder-budget.py,
sentinel-budget.py and export-budget.py; the baseline schema and the
`--check`/`--why`/`--exempt-codes` commands are scripts/ratchet.py. UNLIKE those five,
the census is not a python re-implementation: a chain is an expression tree, so this
runs the lint itself — `vl check --severity info --json` with the checkout's binary
and seed — and counts its findings. It therefore needs `build/vl-compiler.wasm`.
"""

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
                                       "release", "vl"))
SEED = os.path.join(ratchet.ROOT, "build", "vl-compiler.wasm")


def targets(root):
    """What `vl check` is handed: the compiler's entry (the graph lints every module
    with its own file attribution), `std/`, and each program under scripts/."""
    out = [os.path.join(root, "compiler", "entry.vl"), os.path.join(root, "std")]
    top = os.path.join(root, "scripts")
    for dirpath, dirnames, filenames in os.walk(top):
        dirnames[:] = sorted(n for n in dirnames
                             if n not in ("node_modules", "target", "__pycache__"))
        for name in sorted(filenames):
            p = os.path.join(dirpath, name)
            rel = os.path.relpath(p, root).replace(os.sep, "/")
            if name.endswith(".vl") and not name.endswith(".matrix.vl") \
                    and not rel.startswith(SKIP):
                out.append(p)
    return out


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
                            "--compiler", SEED], cwd=root, env=env,
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
                    line = ratchet.read_source(path).split("\n")[d["line"] - 1].strip()
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
           "interpolated: `\"fs.\\{op} \\{path}: \\{err}\"`. Write new code that way; the\n"
           "standing chains are held so the seed does not move for a spelling. After a\n"
           "rewrite, lower the baseline with",
    wrote_line=lambda t: f"{t[CODE]} {CODE}",
    extras=lambda: (("commit", ratchet.head_commit()),),
    named=named,
    tree_paths=TREES,
)


def main():
    args = sys.argv[1:]
    if "--exempt-codes" in args:
        return R.exempt_codes()
    if "--why" in args:
        return R.why(ratchet.flag_value(args, "--why"))
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
