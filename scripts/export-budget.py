#!/usr/bin/env python3
"""The dead-export ratchet — an export of `compiler/` that nothing references.

`unused-function` (compiler/lint.vl) exempts an exported declaration by design:
"an exported one is public surface." For `std/` that is right. For `compiler/`,
whose only consumer is the tree itself, it is a blind spot the size of the export
list, and 14 emitter exports plus 5 front-end ones sat in it
(docs/internals/code-quality-survey-2026-09/emitter.md 8.1, front-end 4.2).

Sibling of scripts/comment-budget.py, scripts/scan-budget.py,
scripts/ladder-budget.py and scripts/sentinel-budget.py. The baseline schema,
the `--check`/`--why` commands and the exit codes are scripts/ratchet.py, shared
with the other four ratchets; this file is the census — the reference count and
the dead-export walk. This baseline starts AT ZERO: the tree it landed on had
none left.

WHAT COUNTS AS A REFERENCE: any word-boundary occurrence of the name anywhere
under compiler/, std/, tests/, lsp/, playground/ or scripts/, other than the
declaration itself. Deliberately coarse — a same-named struct field or a mention
in a script's comment keeps an export alive — because the cost of a false DEAD
reading is a deleted function and the cost of a false LIVE one is one entry that
stays. A self-recursive export references itself and so is never reported; the
lint's `unused-function` is what sees that shape for a non-exported one.
"""

import os
import sys

import ratchet
from ratchet import WORD, read_source

BASELINE = os.path.join(ratchet.ROOT, "scripts", "export-budget-baseline.json")
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


def current(root=ratchet.ROOT):
    return {rel: {CODE: len(v)} for rel, v in dead(root).items()}


def named(root):
    """{code: {`file:name`: hits}} for one tree — the NAMED entries, the shape
    `--why` reads. One hit per dead export; the code has exactly one member,
    `dead-export`, kept keyed the same way as the other four ratchets' `named`."""
    out = {CODE: {}}
    for rel, hits in dead(root).items():
        for name, _kind, _line in hits:
            k = f"{rel}:{name}"
            out[CODE][k] = out[CODE].get(k, 0) + 1
    return out


R = ratchet.Ratchet(
    script="export-budget.py",
    label="export",
    baseline=BASELINE,
    codes=(CODE,),
    ok_line=lambda t: f"export budget ok — {t[CODE]} {CODE} (baseline "
                      f"{R.load_baseline()['total'].get(CODE, 0)} or below)",
    remedy="An export nothing references is dead code the `unused-function` lint\n"
           "cannot see. Delete it, or — when only its own module uses it — drop the\n"
           "`export` keyword so the lint owns it. `python3 scripts/export-budget.py\n"
           "--list` names them. After a real deletion, lower the baseline with",
    wrote_line=lambda t: f"{t[CODE]} {CODE}",
    extras=lambda: (("commit", ratchet.head_commit()),),
    named=named,
    tree_paths=CORPUS,
)


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
    root = ratchet.ROOT
    if "--root" in args:
        root = os.path.abspath(args[args.index("--root") + 1])
    if "--why" in args:
        return R.why(ratchet.flag_value(args, "--why"))
    if "--list" in args:
        return cmd_list(root)
    cur = current(root)
    if "--write-baseline" in args:
        if root != ratchet.ROOT:
            raise SystemExit("export-budget: --write-baseline records THIS checkout; "
                             "it does not take --root.")
        return R.write_baseline(cur)
    if "--check" in args:
        return R.check(cur)
    tot = sum(v[CODE] for v in cur.values())
    print(f"{'file':<28}{CODE:>14}")
    for rel, v in sorted(cur.items(), key=lambda kv: -kv[1][CODE]):
        print(f"{rel:<28}{v[CODE]:>14}")
    print(f"{'TOTAL':<28}{tot:>14}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
