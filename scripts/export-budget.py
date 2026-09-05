#!/usr/bin/env python3
"""The dead-export ratchet — an export of `compiler/` that nothing references.

`unused-function` (compiler/lint.vl) exempts an exported declaration by design:
"an exported one is public surface." For `std/` that is right. For `compiler/`,
whose only consumer is the tree itself, it is a blind spot the size of the export
list, and 14 emitter exports plus 5 front-end ones sat in it
(docs/internals/code-quality-survey-2026-09/emitter.md 8.1, front-end 4.2).

Sibling of scripts/comment-budget.py, scripts/scan-budget.py,
scripts/ladder-budget.py and scripts/sentinel-budget.py — a committed per-file
baseline that may only fall, a `--check` in gate.sh and in CI, `--write-baseline`
in the same PR as the deletion that earned it, and `--why` naming what moved.
This baseline starts AT ZERO: the tree it landed on had none left.

WHAT COUNTS AS A REFERENCE: any word-boundary occurrence of the name anywhere
under compiler/, std/, tests/, lsp/, playground/ or scripts/, other than the
declaration itself. Deliberately coarse — a same-named struct field or a mention
in a script's comment keeps an export alive — because the cost of a false DEAD
reading is a deleted function and the cost of a false LIVE one is one entry that
stays. A self-recursive export references itself and so is never reported; the
lint's `unused-function` is what sees that shape for a non-exported one.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "scripts", "export-budget-baseline.json")
CODE = "dead-export"
# The trees a compiler export may be referenced from. `docs/` is absent on
# purpose: a doc citing a name is not a consumer, and one of the front-end
# survey's five dead exports was alive only in a design doc (front-end 4.2).
CORPUS = ("compiler", "std", "tests", "lsp", "playground", "scripts")
# Directories a walk never enters: build output and vendored trees, whose
# contents are derived from the very sources being graded.
SKIP_DIRS = frozenset(
    ".git node_modules dist build target __pycache__ .cache .deno".split()
)
KINDS = ("function", "let", "const", "type")
WORD = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_")


def read_source(path):
    """Latin-1 so one index is one BYTE, matching the lint's `s[i]`."""
    with open(path, "rb") as fh:
        return fh.read().decode("latin-1")


def modules(root):
    """The tree this ratchet owns: `compiler/*.vl`, the declaration side."""
    d = os.path.join(root, "compiler")
    for name in sorted(os.listdir(d)):
        if name.endswith(".vl"):
            yield f"compiler/{name}", os.path.join(d, name)


def corpus_files(root):
    """Every file a reference may live in, under the six trees."""
    for d in CORPUS:
        top = os.path.join(root, d)
        if not os.path.isdir(top):
            continue
        for dirpath, dirnames, filenames in os.walk(top):
            dirnames[:] = sorted(n for n in dirnames if n not in SKIP_DIRS)
            for name in sorted(filenames):
                yield os.path.join(dirpath, name)


def exports_in(src):
    """`(name, kind, line)` for every `export function|let|const|type NAME` whose
    `export` opens a line. A re-export block (`export { a, b } from "…"`) names no
    new declaration and is skipped — its names are references, not declarations."""
    out = []
    for n, raw in enumerate(src.split("\n"), 1):
        if not raw.startswith("export "):
            continue
        rest = raw[7:]
        for kind in KINDS:
            if not rest.startswith(kind + " "):
                continue
            i = len(kind) + 1
            while i < len(rest) and rest[i] == " ":
                i += 1
            j = i
            while j < len(rest) and rest[j] in WORD:
                j += 1
            if j > i:
                out.append((rest[i:j], kind, n))
            break
    return out


def words(text, counter):
    """Every word-boundary identifier run in `text`, into `counter`."""
    i, b = 0, len(text)
    while i < b:
        if text[i] in WORD:
            j = i
            while j < b and text[j] in WORD:
                j += 1
            w = text[i:j]
            counter[w] = counter.get(w, 0) + 1
            i = j
        else:
            i += 1


def occurrences(root):
    """One pass over the corpus into an identifier count. The naive per-name regex
    over the same corpus does not finish in two minutes; this is instant."""
    counter = {}
    for path in corpus_files(root):
        try:
            words(read_source(path), counter)
        except OSError:
            continue
    return counter


def dead(root):
    """`{relative module: [(name, kind, line)]}` for every export the corpus
    mentions exactly once — that once being its own declaration."""
    counter = occurrences(root)
    out = {}
    for rel, path in modules(root):
        hits = [e for e in exports_in(read_source(path)) if counter.get(e[0], 0) <= 1]
        if hits:
            out[rel] = hits
    return out


def current(root=ROOT):
    return {rel: {CODE: len(v)} for rel, v in dead(root).items()}


def head_commit():
    r = subprocess.run(["git", "-C", ROOT, "rev-parse", "--short", "HEAD"],
                       stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    return r.stdout.decode().strip() if r.returncode == 0 else ""


def load_baseline():
    try:
        with open(BASELINE, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError) as e:
        raise SystemExit(
            f"export-budget: cannot read the baseline {BASELINE} ({e}). Write one\n"
            f"with  python3 scripts/export-budget.py --write-baseline")


def write_baseline(cur):
    total = sum(v[CODE] for v in cur.values())
    rows = [f'{json.dumps(k)}: {json.dumps(v)}' for k, v in sorted(cur.items())]
    files = "{}" if not rows else "{\n" + ",\n".join(rows) + "\n}"
    body = "\n".join([
        "{",
        f'"commit": {json.dumps(head_commit())},',
        f'"total": {json.dumps({CODE: total})},',
        f'"files": {files}',
        "}",
    ])
    with open(BASELINE, "w", encoding="utf-8") as fh:
        fh.write(body + "\n")
    print(f"wrote {BASELINE}: {total} {CODE}")


def cmd_check(cur):
    base = load_baseline()["files"]
    bad = []
    for rel, v in sorted(cur.items()):
        was = base.get(rel, {}).get(CODE, 0)
        if v[CODE] > was:
            bad.append(f"  {rel}  {CODE}: {v[CODE]} (baseline {was})")
    if bad:
        print("export budget REGRESSED — a file may only go down or stay:")
        print("\n".join(bad))
        print(
            "\nAn export nothing references is dead code the `unused-function` lint\n"
            "cannot see. Delete it, or — when only its own module uses it — drop the\n"
            "`export` keyword so the lint owns it. `python3 scripts/export-budget.py\n"
            "--list` names them. After a real deletion, lower the baseline with\n"
            "  python3 scripts/export-budget.py --write-baseline"
        )
        return 1
    tot = sum(v[CODE] for v in cur.values())
    was = load_baseline()["total"].get(CODE, 0)
    print(f"export budget ok — {tot} {CODE} (baseline {was} or below)")
    if tot < was:
        print("  below baseline — `python3 scripts/export-budget.py --why` names "
              "which exports left")
    return 0


def tree_at(rev):
    """A worktree of `rev` under a temp dir, so both sides of `--why` are read by
    the SAME walk. Sibling of ladder-budget.py's."""
    tmp = tempfile.mkdtemp(prefix="export-budget-")
    r = subprocess.run(["git", "-C", ROOT, "archive", "--format=tar", rev],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if r.returncode != 0:
        shutil.rmtree(tmp, ignore_errors=True)
        raise SystemExit(f"export-budget: cannot read the tree at {rev}: "
                         f"{r.stderr.decode().strip()}")
    x = subprocess.run(["tar", "-x", "-C", tmp], input=r.stdout,
                       stderr=subprocess.PIPE)
    if x.returncode != 0:
        shutil.rmtree(tmp, ignore_errors=True)
        raise SystemExit(f"export-budget: cannot unpack {rev}: "
                         f"{x.stderr.decode().strip()}")
    return tmp


def cmd_why(since):
    """What LEFT and what ENTERED the reported set since the baseline was written.

    Both sides are re-derived by the same walk, so a name that left is a name that
    stopped qualifying — not a parser that stopped matching."""
    base = load_baseline()
    at = since or base.get("commit", "")
    if not at:
        raise SystemExit(
            "export-budget: the baseline records no `commit`, so a fall cannot be\n"
            "attributed. Pass one — `--why <rev>` — or re-run `--write-baseline`.")
    tmp = tree_at(at)
    try:
        was = {n: rel for rel, v in dead(tmp).items() for n, _k, _l in v}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    now = {n: rel for rel, v in dead(ROOT).items() for n, _k, _l in v}
    print(f"dead exports: {at} -> working tree\n{len(was)} -> {len(now)}")
    moved = 0
    for n in sorted(set(was) - set(now)):
        print(f"  LEFT     {n}  ({was[n]})")
        moved += 1
    for n in sorted(set(now) - set(was)):
        print(f"  ENTERED  {n}  ({now[n]})")
        moved += 1
    if moved == 0:
        print("Nothing moved by name. A count that differs without a name moving is "
              "the instrument, not the tree.")
    return 0


def cmd_list(root):
    for rel, hits in sorted(dead(root).items()):
        for name, kind, line in hits:
            print(f"{rel}:{line}  {kind} {name}")
    return 0


def main():
    args = sys.argv[1:]
    # `--root <dir>` grades a DIFFERENT tree of the same shape, so the detector can be
    # run against a control it must fire on and one it must stay quiet on
    # (tests/vl_export_budget_test.ts). The baseline is always this checkout's.
    root = ROOT
    if "--root" in args:
        root = os.path.abspath(args[args.index("--root") + 1])
    if "--why" in args:
        i = args.index("--why")
        return cmd_why(args[i + 1] if len(args) > i + 1 else "")
    if "--list" in args:
        return cmd_list(root)
    cur = current(root)
    if "--write-baseline" in args:
        if root != ROOT:
            raise SystemExit("export-budget: --write-baseline records THIS checkout; "
                             "it does not take --root.")
        write_baseline(cur)
        return 0
    if "--check" in args:
        return cmd_check(cur)
    tot = sum(v[CODE] for v in cur.values())
    print(f"{'file':<28}{CODE:>14}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][CODE]):
        print(f"{rel:<28}{v[CODE]:>14}")
    print(f"{'TOTAL':<28}{tot:>14}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
